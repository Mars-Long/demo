# DS → Obsidian Canvas 转换器

将 DeepSeek 前端导出的对话 JSON 自动转换为 Obsidian Canvas + Markdown 笔记。

## 功能

- **一问一答配对**：每个 user + assistant 组合为一个 `.md` 笔记节点
- **对话树还原**：基于 JSON 中的 `parent` 引用，在 Canvas 中重建对话分支结构
- **思考过程引用**：assistant 的 `reasoning_content` 放入 `[!quote]` callout 引用块
- **原始数据保留**：`user_msg_id`、`assistant_msg_id`、`user_parent`、`assistant_parent` 原样写入 frontmatter
- **原始问题追踪**：`original_question` 字段用于覆盖识别，即使文件名被修改也能定位
- **自动树布局**：自上而下 (TB) 的递归树布局

## 使用

```bash
# 方式 1: 使用默认配置
python converter.py

# 方式 2: 指定 JSON 文件
python converter.py path/to/export.json

# 方式 3: 指定输入和输出
python converter.py path/to/export.json -o path/to/output

# 方式 4: 自定义 vault 路径前缀（见下方说明）
python converter.py path/to/export.json --vault-base "我的笔记/DS对话/"
```

## 在 Obsidian 中打开

1. 运行转换器，得到 `output/{对话标题}/` 文件夹
2. 将整个 `{对话标题}/` 文件夹**复制/移动到你的 Obsidian vault 根目录**下
3. 在 Obsidian 中打开 `{对话标题}/{对话标题}.canvas`

> Canvas 默认生成的 `file` 路径为 `"{对话标题}/xxx.md"`（从 vault 根目录算）。
> 如果把文件夹放在了 vault 的其他位置（如 `子目录/对话标题/`），使用 `--vault-base "子目录/对话标题/"` 指定。\n\n## 配置

编辑 `converter.py` 顶部的路径：

```python
JSON_PATH = Path("tempdata/deepseek-问候与回应-2026-07-19-160506.json")
OUTPUT_DIR = Path("to_obsidian_canvas/output")
```

## 输出结构

```
output/
└── {对话标题}/            # 自动从 JSON 文件名提取（去日期）
    ├── 你好.md            # 用户问题作为文件名
    ├── 介绍一下你自己.md
    ├── 你的知识库.md
    ├── ...
    └── {对话标题}.canvas   # Obsidian Canvas 文件
```

## 标签体系

每个 `.md` 文件的 frontmatter 包含：

| 标签 | 说明 |
|------|------|
| `ds-chat` | 来源标记：DeepSeek 对话 |
| `root` | 对话树根节点（无父节点） |
| `branch` | 分支点（有父且有子） |
| `leaf` | 叶子节点（有父无子） |

树结构是组合的：一个节点可以同时有 `root` + `branch`（对话起点且有分支）。

## 数据格式要求

输入的 JSON 必须是由项目扩展 `export-api.ts` 导出的格式：

```json
[
  {
    "role": "user",
    "content": "你好",
    "message_id": 1
  },
  {
    "role": "assistant",
    "content": "你好！有什么可以帮你的吗？",
    "message_id": 2,
    "reasoning_content": "...",
    "parent": 0
  }
]
```

关键字段：
- `role`: `"user"` | `"assistant"`
- `content`: 消息正文
- `parent`: 父消息的**数组索引**（0-based），无此字段 = 根节点
- `message_id`: DeepSeek 原始消息 ID
- `reasoning_content`: 可选，assistant 的思考过程
