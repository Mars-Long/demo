"""知识树应用 — FastAPI 入口。"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.routers import chat, nodes, tree


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理。"""
    yield
    # 关闭所有已创建的 ChatService 实例
    from backend.routers.chat import _get_services
    if hasattr(_get_services, "_cache"):
        for _fm, _cm, cs in _get_services._cache.values():
            cs.close()


app = FastAPI(title="Knowledge Tree API", version="0.1.0", lifespan=lifespan)

# CORS — 允许前端开发时跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(nodes.router)
app.include_router(chat.router)
app.include_router(tree.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.host, port=settings.port)
