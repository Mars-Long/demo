"""共享 FileManager 缓存，所有 router 共用同一实例。"""

from __future__ import annotations

from backend.services.file_manager import FileManager

_fm_cache: dict[str, FileManager] = {}


def get_fm(tree: str = "default") -> FileManager:
    """获取指定知识树的 FileManager 实例（全局单例）。"""
    if tree not in _fm_cache:
        _fm_cache[tree] = FileManager(tree_name=tree)
    return _fm_cache[tree]
