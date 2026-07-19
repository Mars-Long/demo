#!/usr/bin/env python3
"""
DeepSeek 对话 JSON → Obsidian Canvas + Markdown 转换器
======================================================

将 DS 前端导出的对话 JSON 转换为：
  1. 一问一答为一个 .md 笔记（含 frontmatter 标签）
  2. 一个 .canvas 文件（file 节点 + edge 还原对话树）

配对规则：
  - JSON 中每个 user 消息，找 assistant.parent == user_idx 的那个 assistant
  - 二者合并为一个对话节点
  - user.parent → 找到对应索引所在的配对 → 该配对为当前配对的父节点

Usage:
    # 修改下方 JSON_PATH / OUTPUT_DIR，然后:
    python converter.py
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path

# Windows 终端 GBK 编码兜底
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ==================== 配置 ====================

JSON_PATH = Path("tempdata/deepseek-问候与回应-2026-07-19-160506.json")
OUTPUT_DIR = Path("to_obsidian_canvas/output")

# Canvas 布局
NODE_WIDTH = 300
NODE_HEIGHT = 160
H_GAP = 60
V_GAP = 240

# ==================== 工具函数 ====================


def extract_title(filename: str) -> str:
    """从文件名提取对话标题（去 deepseek- 前缀和日期后缀）。"""
    name = Path(filename).stem
    name = re.sub(r"^deepseek-", "", name)
    name = re.sub(r"-\d{4}-\d{2}-\d{2}-\d{6}$", "", name)
    return name


def sanitize_filename(text: str) -> str:
    """将用户问题第一行转为安全文件名（不含扩展名）。"""
    first_line = text.strip().split("\n")[0].strip()
    first_line = re.sub(r"^#+\s*", "", first_line)
    safe = re.sub(r'[\\/:*?"<>|#\n\r\t]', "-", first_line)
    safe = re.sub(r"-{2,}", "-", safe).strip("-").strip()
    return safe[:60] if safe else "untitled"


def make_node_id(seed: str) -> str:
    """生成确定性 16 位 hex Canvas 节点 ID。"""
    return hashlib.md5(seed.encode()).hexdigest()[:16]


def quote_lines(text: str) -> str:
    """每行前缀 `> `，用于 Obsidian callout 内部。"""
    return "\n".join(
        f"> {line}" if line.strip() else ">"
        for line in text.split("\n")
    )


# ==================== 内容生成 ====================


def build_frontmatter(
    user_msg_id: int | str,
    assistant_msg_id: int | str | None,
    user_parent: int | None,
    assistant_parent: int | None,
    original_question: str,
    extra_tags: list[str],
) -> str:
    """生成 YAML frontmatter 字符串。"""
    tags = ["ds-chat"] + extra_tags
    now = datetime.now().strftime("%Y-%m-%d")
    # 原始问题压缩成一行，避免 YAML 多行问题
    q_one_line = original_question.replace("\n", " ").replace('"', '\\"')

    lines = [
        "---",
        f"tags: [{', '.join(tags)}]",
        f"date: {now}",
        f"user_msg_id: {user_msg_id}",
    ]
    if assistant_msg_id is not None:
        lines.append(f"assistant_msg_id: {assistant_msg_id}")
    lines.append(f"user_parent: {user_parent if user_parent is not None else '~'}")
    if assistant_parent is not None:
        lines.append(f"assistant_parent: {assistant_parent}")
    lines.append(f'original_question: "{q_one_line}"')
    lines.append("---")
    return "\n".join(lines)


def build_body(user_content: str, assistant_content: str, reasoning: str | None) -> str:
    """构建 .md 正文：用户问题 + AI 回答 + 折叠思考过程。"""
    parts: list[str] = []

    parts.append(f"## ❓ 用户问题\n\n{user_content.strip()}")

    parts.append(f"## 🤖 AI 回答\n\n{assistant_content.strip()}")

    if reasoning and reasoning.strip():
        folded = (
            f"> [!quote] 💭 思考过程\n"
            f"{quote_lines(reasoning.strip())}"
        )
        parts.append(f"## 💭 思考过程\n\n{folded}")

    return "\n\n---\n\n".join(parts)


def build_md_file(pair: dict) -> str:
    """生成完整 .md 文件内容。"""
    q = pair["user_msg"]["content"]
    a = pair["assistant_msg"]["content"] if pair["assistant_msg"] else "*(无回答)*"
    reasoning = (
        pair["assistant_msg"].get("reasoning_content")
        if pair["assistant_msg"] else None
    )

    fm = build_frontmatter(
        user_msg_id=pair["user_msg"]["message_id"],
        assistant_msg_id=pair["assistant_msg"]["message_id"] if pair["assistant_msg"] else None,
        user_parent=pair["user_msg"].get("parent"),
        assistant_parent=pair["assistant_msg"].get("parent") if pair["assistant_msg"] else None,
        original_question=q,
        extra_tags=pair["tags"],
    )

    # 标题 = 用户问题第一行
    title_line = q.strip().split("\n")[0].strip()
    title_line = re.sub(r"^#+\s*", "", title_line)

    return f"{fm}\n\n# {title_line}\n\n{build_body(q, a, reasoning)}\n"


# ==================== 配对逻辑 ====================


def pair_messages(messages: list[dict]) -> list[dict]:
    """
    将 user + assistant 配对，推断树结构。

    返回 list[dict]，每个元素:
        user_idx, assistant_idx, user_msg, assistant_msg,
        canvas_parent_user_idx (None=根), tags
    """
    n = len(messages)

    # user_idx → assistant_idx
    user_to_assistant: dict[int, int] = {}
    for i, m in enumerate(messages):
        if m["role"] == "assistant" and "parent" in m:
            p = m["parent"]
            if isinstance(p, int) and 0 <= p < n and messages[p]["role"] == "user":
                user_to_assistant[p] = i

    # 对每个 user 消息生成配对
    pairs: list[dict] = []
    for i, m in enumerate(messages):
        if m["role"] != "user":
            continue

        a_idx = user_to_assistant.get(i)
        a_msg = messages[a_idx] if a_idx is not None else None

        # user.parent → 找到该索引所在的配对
        up = m.get("parent")
        canvas_parent_user: int | None = None
        if isinstance(up, int):
            if up in user_to_assistant:
                # up 本身是个 user
                canvas_parent_user = up
            else:
                # up 可能是某个 assistant
                for u_idx, a_idx2 in user_to_assistant.items():
                    if a_idx2 == up:
                        canvas_parent_user = u_idx
                        break

        pairs.append({
            "user_idx": i,
            "assistant_idx": a_idx,
            "user_msg": m,
            "assistant_msg": a_msg,
            "canvas_parent_user_idx": canvas_parent_user,
            "tags": [],  # 稍后 assign_tree_roles 填充
        })

    return pairs


def assign_tree_roles(pairs: list[dict]) -> None:
    """标注 root / branch / leaf 标签。"""
    # 建立 parent → children 映射
    children_map: dict[int, list[int]] = {}
    for p in pairs:
        uid = p["user_idx"]
        children_map.setdefault(uid, [])
        parent = p["canvas_parent_user_idx"]
        if parent is not None:
            children_map.setdefault(parent, []).append(uid)

    for p in pairs:
        uid = p["user_idx"]
        is_root = p["canvas_parent_user_idx"] is None
        has_children = len(children_map.get(uid, [])) > 0

        if is_root and has_children:
            p["tags"] = ["root", "branch"]
        elif is_root:
            p["tags"] = ["root"]
        elif has_children:
            p["tags"] = ["branch"]
        else:
            p["tags"] = ["leaf"]


# ==================== Canvas 树布局 ====================


def layout_tree(pairs: list[dict]) -> dict[int, tuple[float, float]]:
    """
    自底向上的树布局（TB 方向）。

    算法:
      1. 计算每个节点的深度
      2. 后序遍历: 叶子节点从左到右依次排开
      3. 内部节点 x = 子节点 x 范围的中心

    Returns:
        {user_idx: (x, y)}  坐标指节点左上角
    """
    if not pairs:
        return {}

    # user_idx → children
    children: dict[int, list[int]] = {}
    for p in pairs:
        children.setdefault(p["user_idx"], [])
        parent = p["canvas_parent_user_idx"]
        if parent is not None:
            children.setdefault(parent, []).append(p["user_idx"])

    # 深度（递归）
    depths: dict[int, int] = {}

    def set_depth(uid: int, d: int) -> None:
        depths[uid] = d
        for c in children.get(uid, []):
            set_depth(c, d + 1)

    roots = [p["user_idx"] for p in pairs if p["canvas_parent_user_idx"] is None]
    for r in roots:
        set_depth(r, 0)
    # 孤立节点（不在任何 root 子树中）
    for p in pairs:
        if p["user_idx"] not in depths:
            set_depth(p["user_idx"], 0)

    # 后序遍历布局
    positions: dict[int, tuple[float, float]] = {}
    x_counter = [0.0]  # 用 list 实现闭包可变

    def layout_subtree(uid: int) -> None:
        kids = children.get(uid, [])
        if not kids:
            # 叶子
            x = x_counter[0]
            positions[uid] = (x, depths[uid] * V_GAP)
            x_counter[0] += NODE_WIDTH + H_GAP
        else:
            for kid in kids:
                layout_subtree(kid)
            # 子节点 x 范围
            kid_xs = [positions[k][0] for k in kids]
            leftmost = min(kid_xs)
            rightmost = max(kid_xs) + NODE_WIDTH
            parent_cx = (leftmost + rightmost) / 2.0
            positions[uid] = (parent_cx - NODE_WIDTH / 2.0, depths[uid] * V_GAP)

    for r in roots:
        layout_subtree(r)

    return positions


# ==================== 主流程 ====================


def convert(
    json_path: Path | str | None = None,
    output_dir: Path | str | None = None,
    vault_base: str | None = None,
) -> Path:
    """
    执行转换。

    Args:
        json_path: DS 导出 JSON。None → 使用配置默认值
        output_dir: 输出根目录。None → 使用配置默认值
        vault_base: Canvas file 节点的 vault 相对路径前缀。
                    None → 自动使用 "{标题}/"。
                    例如你的输出文件夹是 "问候与回应/"，放进 vault 根目录后，
                    file 路径就是 "问候与回应/你好.md"。

    Returns:
        会话输出目录 Path
    """
    jp = Path(json_path or JSON_PATH).resolve()
    out = Path(output_dir or OUTPUT_DIR).resolve()

    if not jp.exists():
        raise FileNotFoundError(f"JSON 文件不存在: {jp}")

    # 提取标题 & 创建输出目录
    title = extract_title(jp.name)
    session_dir = out / title
    session_dir.mkdir(parents=True, exist_ok=True)

    print(f"[输入]  {jp}")
    print(f"[输出]  {session_dir}")
    print(f"[标题]  {title}")

    # vault_base: Canvas file 节点路径前缀
    if vault_base is None:
        vault_base = f"{title}/"
    elif vault_base and not vault_base.endswith("/"):
        vault_base += "/"
    print(f"[vault]  file 前缀 = \"{vault_base}\"")

    # 1. 加载
    data = json.loads(jp.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("JSON 顶层必须是数组")
    print(f"[加载]  {len(data)} 条消息")

    # 2. 配对
    pairs = pair_messages(data)
    print(f"[配对]  {len(pairs)} 个对话轮次")

    # 3. 标签
    assign_tree_roles(pairs)

    # 4. 生成 .md 文件
    pair_node_ids: dict[int, str] = {}    # user_idx → canvas node id
    md_filenames: dict[int, str] = {}     # user_idx → .md 文件名
    used_filenames: set[str] = set()

    for p in pairs:
        uid = p["user_idx"]
        q = p["user_msg"]["content"]

        # 唯一文件名
        base = sanitize_filename(q)
        fname = base
        dedup = 1
        while fname in used_filenames:
            dedup += 1
            fname = f"{base}-{dedup}"
        used_filenames.add(fname)
        md_name = f"{fname}.md"
        md_filenames[uid] = md_name

        # 写文件
        md_path = session_dir / md_name
        md_path.write_text(build_md_file(p), encoding="utf-8")

        # Canvas 节点 ID
        pair_node_ids[uid] = make_node_id(
            f"{p['user_msg']['message_id']}:"
            f"{p['assistant_msg']['message_id'] if p['assistant_msg'] else 'na'}"
        )

        print(f"  [md] {md_name}  tags={p['tags']}")

    # 5. 布局
    positions = layout_tree(pairs)
    print(f"[布局] {len(positions)} 个节点")

    # 6. 生成 .canvas
    canvas_nodes: list[dict] = []
    canvas_edges: list[dict] = []

    for p in pairs:
        uid = p["user_idx"]
        nid = pair_node_ids[uid]
        x, y = positions.get(uid, (0, 0))

        canvas_nodes.append({
            "id": nid,
            "type": "file",
            "x": int(x),
            "y": int(y),
            "width": NODE_WIDTH,
            "height": NODE_HEIGHT,
            "file": f"{vault_base}{md_filenames[uid]}",
        })

    for p in pairs:
        uid = p["user_idx"]
        parent_uid = p["canvas_parent_user_idx"]
        if parent_uid is not None and parent_uid in pair_node_ids:
            canvas_edges.append({
                "id": make_node_id(f"edge_{parent_uid}_{uid}"),
                "fromNode": pair_node_ids[parent_uid],
                "toNode": pair_node_ids[uid],
                "fromSide": "bottom",
                "toSide": "top",
                "toEnd": "arrow",
            })

    canvas_data = {"nodes": canvas_nodes, "edges": canvas_edges}
    canvas_path = session_dir / f"{title}.canvas"
    canvas_path.write_text(
        json.dumps(canvas_data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[canvas] {canvas_path.name}  ({len(canvas_nodes)} nodes, {len(canvas_edges)} edges)")

    # 7. 统计
    user_only = sum(1 for p in pairs if p["assistant_msg"] is None)
    roots_n = sum(1 for p in pairs if p["canvas_parent_user_idx"] is None)
    leaves_n = sum(1 for p in pairs if "leaf" in p["tags"])
    branches_n = sum(1 for p in pairs if "branch" in p["tags"])

    print(f"\n[统计]")
    print(f"   对话轮次: {len(pairs)}")
    print(f"   根节点:   {roots_n}")
    print(f"   分支点:   {branches_n}")
    print(f"   叶子:     {leaves_n}")
    if user_only:
        print(f"   ⚠ 无回答:  {user_only}")

    return session_dir


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="DeepSeek 对话 JSON → Obsidian Canvas + Markdown 转换器",
    )
    parser.add_argument(
        "json_path",
        nargs="?",
        default=None,
        help="DS 导出 JSON 文件路径（默认使用脚本内 JSON_PATH）",
    )
    parser.add_argument(
        "-o", "--output",
        default=None,
        help="输出根目录（默认使用脚本内 OUTPUT_DIR）",
    )
    parser.add_argument(
        "--vault-base",
        default=None,
        help=(
            "Canvas 中 file 节点的 vault 相对路径前缀。"
            "默认自动使用对话标题（如 \"问候与回应/\"）。"
            "如果你的输出文件夹放在 vault 的子目录中，"
            "例如 \"DS导出/问候与回应/\"，则设置 --vault-base \"DS导出/问候与回应/\""
        ),
    )
    args = parser.parse_args()

    convert(
        json_path=args.json_path,
        output_dir=args.output,
        vault_base=args.vault_base,
    )
