"""Markdown 文件读写 + 树结构维护。

写操作遵循"先写新状态，再改旧状态"原则，减少不一致窗口。
"""

from __future__ import annotations

import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from nanoid import generate

from backend.config import settings
from backend.models import (
    NodeFrontmatter,
    NodeFull,
    NodeStatus,
)
from backend.utils.markdown_utils import (
    build_body,
    parse_md_file,
    parse_sections,
    serialize_md_file,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(existing_ids: set[str]) -> str:
    """生成不重复的 Nano ID（8位）。"""
    while True:
        nid = generate(size=8)
        if nid not in existing_ids:
            return nid


class FileManager:
    """管理一个知识树子文件夹内的 .md 节点文件。"""

    tree_name: str
    tree_path: Path
    trash_path: Path

    def __init__(self, tree_name: str = "default") -> None:
        self.tree_name = tree_name
        self.tree_path = settings.data_root / tree_name
        self.trash_path = self.tree_path / ".trash"
        self._ensure_dirs()
        self._id_index: dict[str, Path] = {}
        self._index_vault()

    # ---- 内部 ----

    def _ensure_dirs(self) -> None:
        self.tree_path.mkdir(parents=True, exist_ok=True)
        self.trash_path.mkdir(parents=True, exist_ok=True)

    def _index_vault(self) -> None:
        """扫描 tree_path 下所有 .md 文件（不含 .trash），建立 id→path 映射。"""
        self._id_index.clear()
        for md_file in self.tree_path.glob("*.md"):
            if self.trash_path in md_file.parents:
                continue
            try:
                fm, _ = parse_md_file(md_file.read_text(encoding="utf-8"))
            except Exception:
                continue
            if "id" in fm:
                self._id_index[fm["id"]] = md_file

    def _id_to_path(self, node_id: str) -> Path:
        if node_id not in self._id_index:
            raise FileNotFoundError(f"节点不存在: {node_id}")
        return self._id_index[node_id]

    def _all_ids(self) -> set[str]:
        return set(self._id_index.keys())

    # ---- 读取 ----

    def read_node(self, node_id: str) -> NodeFull:
        path = self._id_to_path(node_id)
        content = path.read_text(encoding="utf-8")
        fm_dict, body = parse_md_file(content)
        sections = parse_sections(body)

        fm = NodeFrontmatter(
            id=fm_dict.get("id", ""),
            title=fm_dict.get("title", ""),
            parent=fm_dict.get("parent"),
            children=fm_dict.get("children", []),
            created=fm_dict.get("created", ""),
            updated=fm_dict.get("updated", ""),
            status=NodeStatus(fm_dict.get("status", "exploring")),
            tags=fm_dict.get("tags", []),
            summary=fm_dict.get("summary", ""),
        )
        return NodeFull(
            frontmatter=fm,
            question=sections.get("question", ""),
            ai_answer=sections.get("ai_answer", ""),
            my_notes=sections.get("my_notes", ""),
            file_path=str(path),
        )

    def get_all_nodes(self) -> list[NodeFull]:
        nodes: list[NodeFull] = []
        for nid in list(self._id_index.keys()):
            try:
                nodes.append(self.read_node(nid))
            except Exception:
                continue
        return nodes

    def repair_tree(self) -> dict:
        """修复树一致性：清理指向不存在节点的 children 引用。"""
        valid_ids = set(self._id_index.keys())
        fixed: list[str] = []
        for nid in valid_ids:
            node = self.read_node(nid)
            before = len(node.frontmatter.children)
            node.frontmatter.children = [c for c in node.frontmatter.children if c in valid_ids]
            if len(node.frontmatter.children) != before:
                self.write_node(node)
                fixed.append(nid)
        # 重新索引（清理可能存在的陈旧条目）
        self._index_vault()
        return {"fixed_nodes": fixed, "total_nodes": len(valid_ids)}

    def get_children(self, node_id: str) -> list[NodeFull]:
        node = self.read_node(node_id)
        children: list[NodeFull] = []
        for cid in node.frontmatter.children:
            try:
                children.append(self.read_node(cid))
            except FileNotFoundError:
                continue
        return children

    def get_parent_chain(self, node_id: str) -> list[NodeFrontmatter]:
        """返回从根到父节点的 frontmatter 链（不含当前节点）。"""
        chain: list[NodeFrontmatter] = []
        current = self.read_node(node_id)
        while current.frontmatter.parent is not None:
            try:
                parent = self.read_node(current.frontmatter.parent)
            except FileNotFoundError:
                break
            chain.insert(0, parent.frontmatter)
            current = parent
        return chain

    # ---- 写入（内部） ----

    def write_node(self, node: NodeFull) -> None:
        """将 NodeFull 写回 .md 文件。"""
        fm_dict = node.frontmatter.model_dump(exclude_none=True, mode="json")
        body = build_body(node.question, node.ai_answer, node.my_notes)
        content = serialize_md_file(fm_dict, body)
        path = self.tree_path / f"{node.frontmatter.id}.md"
        path.write_text(content, encoding="utf-8")
        self._id_index[node.frontmatter.id] = path

    # ---- 创建节点 ----

    def create_node(
        self,
        parent_id: str | None,
        question: str,
        ai_answer: str = "",
        summary: str = "",
        tags: list[str] | None = None,
    ) -> NodeFull:
        """创建新节点。parent_id 为 None 时创建根节点。"""
        node_id = _new_id(self._all_ids())

        # 从 question 第一行提取 title（去掉 # 前缀和空白）
        first_line = question.strip().split("\n")[0].strip()
        title = re.sub(r"^#+\s*", "", first_line) if first_line else question[:40]

        now = _now_iso()
        fm = NodeFrontmatter(
            id=node_id,
            title=title,
            parent=parent_id,
            children=[],
            created=now,
            updated=now,
            status=NodeStatus.EXPLORING,
            tags=tags or [],
            summary=summary or (ai_answer[:100].replace("\n", " ").strip() if ai_answer else ""),
        )
        node = NodeFull(
            frontmatter=fm,
            question=question,
            ai_answer=ai_answer,
            my_notes="",
            file_path=str(self.tree_path / f"{node_id}.md"),
        )

        # 写入新节点文件
        self.write_node(node)

        # 如果有父节点：先写新状态（已完成），再改旧状态（父节点 children）
        if parent_id is not None:
            parent = self.read_node(parent_id)
            parent.frontmatter.children.append(node_id)
            parent.frontmatter.updated = _now_iso()
            self.write_node(parent)

        return node

    # ---- 删除节点 ----

    def delete_node(self, node_id: str, cascade: str = "delete") -> list[str]:
        """删除节点。

        写操作顺序（先新后旧）：
          1. 递归移动目标节点及子孙到 .trash/
          2. 更新父节点的 children 列表

        Args:
            node_id: 要删除的节点 ID
            cascade: "delete" — 递归删除子孙；"orphan" — 提升子节点到父节点

        Returns:
            被删除的节点 ID 列表
        """
        node = self.read_node(node_id)
        parent_id = node.frontmatter.parent
        deleted_ids: list[str] = []

        if cascade == "delete":
            # Step 1: 递归收集所有子孙，移动文件到 .trash/
            self._collect_descendants(node_id, deleted_ids)
            deleted_ids.insert(0, node_id)
            for did in deleted_ids:
                self._trash_file(did)
            # Step 2: 更新父节点
            if parent_id is not None:
                parent = self.read_node(parent_id)
                parent.frontmatter.children = [
                    c for c in parent.frontmatter.children if c != node_id
                ]
                parent.frontmatter.updated = _now_iso()
                self.write_node(parent)
        elif cascade == "orphan":
            # Step 1: 读取当前节点的 children，提升到父节点
            orphan_children = list(node.frontmatter.children)
            # 移动当前节点到 .trash/
            self._trash_file(node_id)
            deleted_ids.append(node_id)
            # Step 2: 更新父节点
            if parent_id is not None:
                parent = self.read_node(parent_id)
                # 替换 parent.children 中的 node_id 为原 children
                try:
                    idx = parent.frontmatter.children.index(node_id)
                    parent.frontmatter.children[idx:idx+1] = orphan_children
                except ValueError:
                    parent.frontmatter.children.extend(orphan_children)
                parent.frontmatter.updated = _now_iso()
                self.write_node(parent)
            # 更新被提升的子节点
            for cid in orphan_children:
                child = self.read_node(cid)
                child.frontmatter.parent = parent_id
                child.frontmatter.updated = _now_iso()
                self.write_node(child)
        else:
            raise ValueError(f"无效的 cascade 值: {cascade}，可选 'delete' / 'orphan'")

        # 清理索引
        for did in deleted_ids:
            self._id_index.pop(did, None)

        return deleted_ids

    def _collect_descendants(self, node_id: str, result: list[str]) -> None:
        """递归收集某个节点的所有子孙 ID。"""
        node = self.read_node(node_id)
        for cid in node.frontmatter.children:
            self._collect_descendants(cid, result)
            result.append(cid)

    def _trash_file(self, node_id: str) -> None:
        """将节点文件移动到 .trash/。"""
        if node_id not in self._id_index:
            return
        src = self._id_index[node_id]
        dst = self.trash_path / src.name
        # 如果 .trash/ 中已有同名文件，先删除
        if dst.exists():
            dst.unlink()
        shutil.move(str(src), str(dst))

    # ---- 移动 / 断开 ----

    def detach_node(self, node_id: str) -> None:
        """将节点从父节点断开，使其成为根节点。"""
        node = self.read_node(node_id)
        old_parent_id = node.frontmatter.parent
        if old_parent_id is None:
            return  # 已经是根节点

        # Step 1: 写 node（清空 parent）
        node.frontmatter.parent = None
        node.frontmatter.updated = _now_iso()
        self.write_node(node)

        # Step 2: 写 old_parent（移除 children）
        old_parent = self.read_node(old_parent_id)
        old_parent.frontmatter.children = [
            c for c in old_parent.frontmatter.children if c != node_id
        ]
        old_parent.frontmatter.updated = _now_iso()
        self.write_node(old_parent)

    def move_node(self, node_id: str, new_parent_id: str) -> None:
        """将节点移动到新父节点下。

        写操作顺序（先新后旧）：
          1. 写入 node_id 节点（parent = new_parent_id）
          2. 写入 new_parent 节点（children 追加 node_id）
          3. 写入 old_parent 节点（children 移除 node_id）
        """
        node = self.read_node(node_id)
        old_parent_id = node.frontmatter.parent

        # Step 1: 写 node_id（新 parent）
        node.frontmatter.parent = new_parent_id
        node.frontmatter.updated = _now_iso()
        self.write_node(node)

        # Step 2: 写 new_parent（追加 children）
        new_parent = self.read_node(new_parent_id)
        if node_id not in new_parent.frontmatter.children:
            new_parent.frontmatter.children.append(node_id)
            new_parent.frontmatter.updated = _now_iso()
            self.write_node(new_parent)

        # Step 3: 写 old_parent（移除 children）
        if old_parent_id is not None:
            old_parent = self.read_node(old_parent_id)
            old_parent.frontmatter.children = [
                c for c in old_parent.frontmatter.children if c != node_id
            ]
            old_parent.frontmatter.updated = _now_iso()
            self.write_node(old_parent)