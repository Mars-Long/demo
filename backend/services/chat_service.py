"""对话服务：封装 dsweb.py 的 DeepSeekClient 调用。"""

from __future__ import annotations

import logging
import sys
import os
from datetime import datetime, timezone

# 将项目根目录加入 sys.path，以便导入 dsweb
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from dsweb import Config, DeepSeekClient, Reply  # noqa: E402

from backend.config import settings
from backend.models import ChatResponse
from backend.services.context_manager import ContextManager
from backend.services.file_manager import FileManager

logger = logging.getLogger("knowledge-tree.chat")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ChatService:
    """封装 DeepSeek 对话流程：构建上下文 → 新会话 → 发送 → 创建子节点。"""

    def __init__(self, file_manager: FileManager, context_manager: ContextManager) -> None:
        self.fm = file_manager
        self.cm = context_manager
        self._client: DeepSeekClient | None = None

    def _get_client(self) -> DeepSeekClient:
        """懒初始化 DeepSeekClient（单例）。"""
        if self._client is None:
            config = Config(
                headless=settings.ds_headless,
                browser_channel=settings.ds_browser,
                send_timeout=settings.ds_send_timeout,
            )
            self._client = DeepSeekClient(config)
            logger.info("DeepSeekClient 已初始化")
        return self._client

    def ask(
        self,
        node_id: str,
        user_question: str,
        model_type: str | None = None,
        create_child: bool = True,
    ) -> ChatResponse:
        """完整对话流程。

        Args:
            node_id: 当前节点 ID
            user_question: 用户问题
            model_type: 模型模式（default/expert/vision）
            create_child: True=创建子节点，False=追加至当前节点

        Returns:
            ChatResponse
        """
        client = self._get_client()

        # Step 1: 构建带上下文的 prompt
        full_prompt = self.cm.build_prompt(node_id, user_question)
        logger.debug(f"构建 prompt: {full_prompt[:200]}...")

        # Step 2: 新会话（避免上下文污染）
        client.new_chat()

        # Step 3: 发送请求
        reply: Reply = client.ask(full_prompt, model_type=model_type)

        if not reply.success:
            return ChatResponse(
                success=False,
                node_id=node_id,
                reply_text="",
                duration=reply.duration,
                error=reply.error,
            )

        # Step 4: 生成摘要
        summary = reply.text[:100].replace("\n", " ").strip()

        if create_child:
            new_node = self.fm.create_node(
                parent_id=node_id,
                question=user_question,
                ai_answer=reply.text,
                summary=summary,
            )
            result_id = new_node.frontmatter.id
        else:
            # 追加到当前节点
            node = self.fm.read_node(node_id)
            node.ai_answer += f"\n\n---\n\n**追问：** {user_question}\n\n{reply.text}"
            node.frontmatter.summary = summary
            node.frontmatter.updated = _now_iso()
            self.fm.write_node(node)
            result_id = node_id

        return ChatResponse(
            success=True,
            node_id=result_id,
            reply_text=reply.text,
            duration=reply.duration,
        )

    def close(self) -> None:
        """关闭浏览器客户端。"""
        if self._client is not None:
            self._client.close()
            self._client = None
            logger.info("DeepSeekClient 已关闭")
