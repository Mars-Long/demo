"""上下文管理器：构建带祖先链摘要的 prompt。"""

from __future__ import annotations

from backend.config import settings
from backend.services.file_manager import FileManager


class ContextManager:
    """为对话构建带完整知识树上下文的 prompt。"""

    def __init__(self, file_manager: FileManager) -> None:
        self.fm = file_manager

    def build_prompt(self, node_id: str, user_question: str) -> str:
        """构建带父节点链摘要的完整 prompt。

        Args:
            node_id: 当前对话所属节点 ID
            user_question: 用户输入的问题

        Returns:
            拼接了祖先摘要 + 角色提示词的完整 prompt 文本
        """
        chain = self.fm.get_parent_chain(node_id)  # [根, ..., 父]，不含当前节点

        if not chain:
            # 根节点：直接返回问题（若配置了 role_prompt 则追加）
            if settings.role_prompt.strip():
                return f"{settings.role_prompt.strip()}\n\n{user_question}"
            return user_question

        parts = ["知识背景摘要：\n"]

        for i, ancestor in enumerate(chain):
            indent = "  " * i
            title = ancestor.title or "（未命名）"
            summary = ancestor.summary or "（暂无摘要）"
            parts.append(f"{indent}· {title}：{summary}")

        # 当前节点信息
        try:
            current_node = self.fm.read_node(node_id)
            current_title = current_node.frontmatter.title or "（未命名）"
        except Exception:
            current_title = "（当前节点）"

        parts.append(f"\n当前探索方向：{current_title}")
        parts.append(f"\n用户提问：{user_question}")

        # 追加角色提示词
        if settings.role_prompt.strip():
            parts.append(f"\n\n{settings.role_prompt.strip()}")

        parts.append("\n请基于以上知识背景，给出清晰、有针对性的回答。如果问题与背景不相关，也可以直接回答。")

        return "\n".join(parts)
