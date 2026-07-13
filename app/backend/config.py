"""读取 config.yaml 并提供 Settings 全局单例。"""

import os
from pathlib import Path

import yaml

# config.yaml 位于项目根目录（backend/../config.yaml）
_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.yaml"


class Settings:
    """全局配置，从 config.yaml 读取。"""

    def __init__(self) -> None:
        self._data = self._load()

    def _load(self) -> dict:
        if not _CONFIG_PATH.is_file():
            raise FileNotFoundError(f"配置文件不存在: {_CONFIG_PATH}")
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}

    # ---- 数据 ----

    @property
    def data_root(self) -> Path:
        raw: str = self._data.get("data_root", "./data")
        path = Path(raw)
        if not path.is_absolute():
            path = _CONFIG_PATH.parent / path
        return path.resolve()

    # ---- 服务 ----

    @property
    def host(self) -> str:
        return self._data.get("host", "127.0.0.1")

    @property
    def port(self) -> int:
        return self._data.get("port", 8000)

    # ---- DeepSeek ----

    @property
    def ds_headless(self) -> bool:
        return self._data.get("ds_headless", True)

    @property
    def ds_browser(self) -> str:
        return self._data.get("ds_browser", "msedge")

    @property
    def ds_send_timeout(self) -> int:
        return self._data.get("ds_send_timeout", 180)

    # ---- 提示词 ----

    @property
    def role_prompt(self) -> str:
        return self._data.get("role_prompt", "")


settings = Settings()
