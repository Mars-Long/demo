# DeepSeek Web CLI

通过 Playwright 自动化操作 [DeepSeek 网页版](https://chat.deepseek.com/)，支持文本问答、模型切换和图片上传。

## 安装

```bash
pip install -r requirements.txt
playwright install chromium    # 首次使用需要安装浏览器
```

## 快速开始

```bash
# 基础文本提问
python dsweb.py "你好，介绍一下你自己"

# 无头模式（不显示浏览器窗口）
python dsweb.py --headless "你的问题"

# 从管道读取
echo "你的问题" | python dsweb.py
```

## 模型切换

```bash
# 专家模式（深度推理）
python dsweb.py --model expert "复杂数学问题"

# Vision 模式（图片理解）
python dsweb.py --model vision --image ./photo.jpg "描述这张图片"
```

可选值：`default` / `expert` / `vision`

## 图片上传

```bash
# 方式一：指定文件路径（支持 headless）
python dsweb.py --model vision --image ./photo.jpg "描述这张图片"

# 方式二：从剪贴板粘贴（先 Ctrl+C 复制图片，需有头模式）
python dsweb.py --model vision --paste-image "描述这张图片"
```

> `--image` 需要 `pip install Pillow`

## 完整参数

| 参数 | 说明 |
|------|------|
| `prompt` | 问题文本（不传则从 stdin 读取） |
| `--headless` | 无头模式 |
| `--model, --model-type` | 模型模式：default / expert / vision |
| `--image PATH` | 上传图片文件（支持 headless） |
| `--paste-image` | 从剪贴板粘贴图片（需有头模式） |
| `--browser` | 浏览器选择：msedge（默认） / chromium / chrome |
| `--timeout` | 回复等待超时秒数（默认 180） |
| `--json` | JSON 格式输出 |
| `--debug` | 输出调试日志 |

## 模块调用

```python
from dsweb import DeepSeekClient

client = DeepSeekClient()
reply = client.ask("你好")
print(reply.text)
reply = client.ask("描述", image_path="./photo.jpg")
client.close()
```

## 依赖

- Python ≥ 3.10
- [playwright](https://playwright.dev/python/) — 浏览器自动化
- [Pillow](https://python-pillow.org/) — 图片格式转换（仅 `--image` 需要）
