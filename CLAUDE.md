# CLAUDE.md

## 项目概述

基于 Playwright 的 DeepSeek 网页版 CLI 客户端。自动化操作 DeepSeek 聊天页面，支持文本问答、模型切换、图片上传（文件/剪贴板），可模块导入也可命令行直接使用。

- 入口文件：`dsweb.py`
- 依赖：`playwright`（必需）、`Pillow`（可选，`--image` 功能需要）
- Python ≥ 3.10

## 项目规则

1. **依赖变更同步** — 安装或升级项目依赖后，必须同步更新 `requirements.txt`，保持版本号一致。

2. **文档字符串同步** — 修改 `dsweb.py` 中的公开接口（新增/删除/修改参数、函数、类）后，必须同步更新对应的 docstring（`ask()` 的 Args、module docstring 的 Usage 示例等），确保 `--help` 和文档与代码实际行为一致。
