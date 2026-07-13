"""节点 CRUD 路由。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.models import (
    CreateNodeRequest,
    CreateNodeResponse,
    NodeFull,
    UpdateNodeRequest,
)
from backend.services import get_fm

router = APIRouter()


# ==================== GET ====================


@router.get("/api/nodes", response_model=list[NodeFull])
def list_nodes(tree: str = "default") -> list[NodeFull]:
    """获取所有节点。每次查询前重新索引，确保新写入的文件可见。"""
    fm = get_fm(tree)
    fm._index_vault()
    return fm.get_all_nodes()


@router.get("/api/nodes/{node_id}", response_model=NodeFull)
def get_node(node_id: str, tree: str = "default") -> NodeFull:
    """获取单个节点。"""
    fm = get_fm(tree)
    try:
        return fm.read_node(node_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"节点不存在: {node_id}")


@router.get("/api/nodes/{node_id}/children", response_model=list[NodeFull])
def get_children(node_id: str, tree: str = "default") -> list[NodeFull]:
    """获取节点的子节点列表。"""
    fm = get_fm(tree)
    try:
        return fm.get_children(node_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"节点不存在: {node_id}")


# ==================== POST ====================


@router.post("/api/nodes", response_model=CreateNodeResponse, status_code=201)
def create_node(req: CreateNodeRequest) -> CreateNodeResponse:
    """创建节点。parent_id 为空则创建根节点。"""
    fm = get_fm(req.tree)
    node = fm.create_node(
        parent_id=req.parent_id,
        question=req.question,
        ai_answer=req.ai_answer,
        tags=req.tags,
    )
    if req.my_notes:
        node.my_notes = req.my_notes
        fm.write_node(node)
    return CreateNodeResponse(node=node)


# ==================== PUT ====================


@router.put("/api/nodes/{node_id}", response_model=NodeFull)
def update_node(node_id: str, req: UpdateNodeRequest, tree: str = "default") -> NodeFull:
    """更新节点（部分字段）。"""
    from datetime import datetime, timezone

    fm = get_fm(tree)
    try:
        node = fm.read_node(node_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"节点不存在: {node_id}")

    if req.title is not None:
        node.frontmatter.title = req.title
    if req.status is not None:
        node.frontmatter.status = req.status
    if req.tags is not None:
        node.frontmatter.tags = req.tags
    if req.summary is not None:
        node.frontmatter.summary = req.summary
    if req.question is not None:
        node.question = req.question
    if req.ai_answer is not None:
        node.ai_answer = req.ai_answer
    if req.my_notes is not None:
        node.my_notes = req.my_notes

    node.frontmatter.updated = datetime.now(timezone.utc).isoformat()
    fm.write_node(node)
    return node


# ==================== DELETE ====================


@router.delete("/api/nodes/{node_id}")
def delete_node(node_id: str, cascade: str = "delete", tree: str = "default") -> dict:
    """删除节点。"""
    fm = get_fm(tree)
    try:
        deleted_ids = fm.delete_node(node_id, cascade=cascade)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"节点不存在: {node_id}")
    return {"deleted_ids": deleted_ids}
