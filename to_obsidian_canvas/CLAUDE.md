# CLAUDE.md — to_obsidian_canvas

## 概述

独立模块：将 DeepSeek 前端导出的对话 JSON 转换为 Obsidian Canvas + Markdown 笔记。

不依赖 `app/` 后端，纯 Python 标准库 + 文件 I/O。

## 入口

`converter.py` — 命令行工具，同时可 import 使用 `convert()` 函数。

## 数据格式

### 输入：DS 导出 JSON

```json
[
  { "role": "user", "content": "...", "message_id": 1 },
  { "role": "assistant", "content": "...", "message_id": 2,
    "reasoning_content": "...", "parent": 0 }
]
```

- `parent` 是**数组索引**（0-based），指向父消息
- 无 `parent` 字段 = 根节点
- `reasoning_content` 仅 assistant 有，可选

### 输出：.md + .canvas

- .md: YAML frontmatter + 三段正文（❓ 问题 / 🤖 AI 回答 / 💭 思考过程）
- .canvas: JSON Canvas 1.0 格式，`type: "file"` 节点 + edge

## 配对逻辑

1. 遍历所有 assistant，若 `assistant.parent` == 某个 user 的数组索引 → 配对
2. user.parent → 找到该索引所在的配对 → 该配对为 canvas 父节点
3. 标签: root（无父）/ branch（有父有子）/ leaf（有父无子）

## 布局算法

自底向上递归 TB 布局：
- 叶子节点从左到右顺序排列
- 内部节点 x = 子节点 x 范围的中心
- y = 深度 × V_GAP

## 关键规则

1. 不修改原始 message_id / parent 值
2. 文件名用 sanitize 后的用户问题
3. original_question 在 frontmatter 中，用于覆盖识别
4. reasoning_content 用 `[!info]-` callout 折叠
5. vault_base 可配，默认 `{标题}/`

## 配置

脚本顶部 `JSON_PATH` / `OUTPUT_DIR`，或通过 CLI 参数传入。
