"""树结构操作路由。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.models import CutRequest, MoveRequest
from backend.services import get_fm

router = APIRouter()


@router.post("/api/tree/move")
def move_node(req: MoveRequest) -> dict:
    """移动节点到新父节点下。"""
    fm = get_fm(req.tree)
    try:
        fm.move_node(req.node_id, req.new_parent_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"success": True}


@router.post("/api/tree/splice")
def splice_node(req: MoveRequest) -> dict:
    """拼接节点（同 move，语义别名）。"""
    fm = get_fm(req.tree)
    try:
        fm.move_node(req.node_id, req.new_parent_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"success": True}


@router.post("/api/tree/cut")
def cut_node(req: CutRequest) -> dict:
    """裁剪节点。"""
    fm = get_fm(req.tree)
    try:
        deleted_ids = fm.delete_node(req.node_id, cascade=req.cascade)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"deleted_ids": deleted_ids}


@router.post("/api/tree/detach")
def detach_node(node_id: str, tree: str = "default") -> dict:
    """断开节点与父节点的连线，使其成为根节点。"""
    fm = get_fm(tree)
    try:
        fm.detach_node(node_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"success": True}


@router.post("/api/tree/repair")
def repair_tree(tree: str = "default") -> dict:
    """修复树一致性：清理指向不存在节点的 children 引用。"""
    fm = get_fm(tree)
    return fm.repair_tree()
