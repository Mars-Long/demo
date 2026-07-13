"""Markdown 文件解析 / 序列化 / section 提取工具。"""

from __future__ import annotations

import re

import yaml

# 匹配 YAML frontmatter 块：以 --- 开头和结尾
_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)

# section 标题模式
_SECTION_RE = re.compile(r"^##\s*(❓ 问题|✅ AI 回答|📝 我的笔记)\s*\n", re.MULTILINE)

_SECTION_TITLES = {
    "❓ 问题": "question",
    "✅ AI 回答": "ai_answer",
    "📝 我的笔记": "my_notes",
}

_BODY_TITLES = {
    "question": "❓ 问题",
    "ai_answer": "✅ AI 回答",
    "my_notes": "📝 我的笔记",
}


def parse_md_file(content: str) -> tuple[dict, str]:
    """分割 YAML frontmatter 和正文。

    Returns:
        (frontmatter_dict, body_string)。无 frontmatter 时返回 ({}, content)。
    """
    m = _FRONTMATTER_RE.match(content)
    if m:
        try:
            fm = yaml.safe_load(m.group(1)) or {}
        except yaml.YAMLError:
            fm = {}
        return fm, m.group(2)
    return {}, content


def serialize_md_file(frontmatter: dict, body: str) -> str:
    """将 frontmatter dict + body 序列化为完整 .md 内容。"""
    yaml_str = yaml.dump(
        frontmatter, allow_unicode=True, sort_keys=False, default_flow_style=False
    ).strip()
    return f"---\n{yaml_str}\n---\n\n{body}"


def parse_sections(body: str) -> dict:
    """从正文中提取三个 section。

    Returns:
        {"question": str, "ai_answer": str, "my_notes": str}
    """
    result: dict[str, str] = {"question": "", "ai_answer": "", "my_notes": ""}

    # 找到所有 section 标题的位置
    matches = list(_SECTION_RE.finditer(body))
    for i, m in enumerate(matches):
        key = _SECTION_TITLES[m.group(1)]
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        result[key] = body[start:end].strip()

    return result


def build_body(question: str, ai_answer: str, my_notes: str) -> str:
    """将三个 section 拼回正文。空 section 不生成对应标题。"""
    parts: list[str] = []
    for key, title in [("question", "❓ 问题"), ("ai_answer", "✅ AI 回答"), ("my_notes", "📝 我的笔记")]:
        content = {"question": question, "ai_answer": ai_answer, "my_notes": my_notes}[key]
        if content.strip():
            parts.append(f"## {title}\n\n{content.strip()}")
    return "\n\n".join(parts)
