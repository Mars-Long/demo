"""Pydantic 数据模型。"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ==================== 枚举 ====================


class NodeStatus(str, Enum):
    EXPLORING = "exploring"
    UNDERSTOOD = "understood"
    NEEDS_REVIEW = "needs-review"


# ==================== 核心模型 ====================


class NodeFrontmatter(BaseModel):
    """节点 frontmatter（存储在 .md 文件 YAML 头中）。"""

    id: str
    title: str = ""
    parent: Optional[str] = None
    children: list[str] = Field(default_factory=list)
    created: str = ""
    updated: str = ""
    status: NodeStatus = NodeStatus.EXPLORING
    tags: list[str] = Field(default_factory=list)
    summary: str = ""


class NodeFull(BaseModel):
    """完整节点（frontmatter + 正文三段）。"""

    frontmatter: NodeFrontmatter
    question: str = ""
    ai_answer: str = ""
    my_notes: str = ""
    file_path: str = ""


# ==================== 请求 / 响应 ====================


class CreateNodeRequest(BaseModel):
    """创建节点请求（根节点或子节点）。"""

    question: str
    parent_id: Optional[str] = None   # None=根节点，否则为子节点
    ai_answer: str = ""               # 手动录入时可带 AI 回答
    my_notes: str = ""                # 手动录入时可带笔记
    tags: list[str] = Field(default_factory=list)
    tree: str = "default"


class ChatRequest(BaseModel):
    """对话请求。"""

    node_id: str
    prompt: str
    model_type: Optional[str] = None  # default / expert / vision
    create_child: bool = True
    tree: str = "default"


class ChatResponse(BaseModel):
    """对话响应。"""

    success: bool
    node_id: str
    reply_text: str
    duration: float
    error: Optional[str] = None


class MoveRequest(BaseModel):
    """移动节点请求。"""

    node_id: str
    new_parent_id: str
    tree: str = "default"


class CutRequest(BaseModel):
    """裁剪节点请求。"""

    node_id: str
    cascade: str = "delete"  # "delete" | "orphan"
    tree: str = "default"


class UpdateNodeRequest(BaseModel):
    """更新节点请求（部分字段可选）。"""

    question: Optional[str] = None
    ai_answer: Optional[str] = None
    my_notes: Optional[str] = None
    title: Optional[str] = None
    status: Optional[NodeStatus] = None
    tags: Optional[list[str]] = None
    summary: Optional[str] = None


class CreateNodeResponse(BaseModel):
    """创建节点响应。"""

    node: NodeFull
