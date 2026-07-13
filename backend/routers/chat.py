"""对话路由。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.models import ChatRequest, ChatResponse
from backend.services import get_fm
from backend.services.chat_service import ChatService
from backend.services.context_manager import ContextManager

router = APIRouter()

# ChatService 缓存（共享同一个浏览器实例）
_cs_cache: dict[str, ChatService] = {}


def _get_cs(tree: str = "default") -> ChatService:
    if tree not in _cs_cache:
        fm = get_fm(tree)
        cm = ContextManager(fm)
        _cs_cache[tree] = ChatService(fm, cm)
    return _cs_cache[tree]


@router.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    """发起对话。"""
    cs = _get_cs(req.tree)
    try:
        return cs.ask(
            node_id=req.node_id,
            user_question=req.prompt,
            model_type=req.model_type,
            create_child=req.create_child,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
