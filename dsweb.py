"""
DeepSeek Web 客户端
====================

通过 Playwright 自动化操作 DeepSeek 网页版，发送消息并获取回复。
可作为模块导入使用，也可直接命令行运行。

Usage as module:
    >>> from dsweb import DeepSeekClient, Config
    >>> client = DeepSeekClient()
    >>> reply = client.ask("你好，介绍一下你自己")
    >>> print(reply.text)
    >>> client.close()

Usage as CLI:
    python dsweb.py "你的问题"
    python dsweb.py --headless --json "你的问题"
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from playwright.sync_api import sync_playwright

logger = logging.getLogger("dsweb")


# ==================== 数据结构 ====================


@dataclass
class Config:
    """DeepSeekClient 配置。所有字段均可选，未传则使用默认值。"""

    url: str = "https://chat.deepseek.com/"
    user_data_dir: str = "~/.deepseek_browser_data"  # 自动 expanduser
    headless: bool = False
    browser_channel: str = "msedge"  # chromium / chrome
    viewport_width: int = 1400
    viewport_height: int = 900
    locale: str = "zh-CN"
    slow_mo: int = 30  # 操作间延迟(ms)，0 为无延迟
    send_timeout: int = 180  # 等待回复超时(秒)
    login_timeout: int = 300  # 等待登录超时(秒)

    def __post_init__(self):
        self.user_data_dir = str(Path(self.user_data_dir).expanduser())


@dataclass
class Reply:
    """ask() 的返回结果。"""

    text: str
    success: bool
    duration: float  # 耗时(秒)
    error: str | None = None


# ==================== 核心类 ====================


class DeepSeekClient:
    """DeepSeek 网页版客户端。

    管理浏览器生命周期，支持在同一个会话中多次调用 ask()。
    """

    # DeepSeek 页面选择器
    _INPUT_SELECTOR = 'textarea[name="search"]'
    _SEND_BUTTON_SELECTOR = 'div.ds-button--primary:not(.ds-button--disabled)'
    _REPLY_SELECTOR = 'div.ds-assistant-message-main-content'
    _THINK_SELECTOR = 'div.ds-think-content'
    _MODEL_SELECTORS = {
        "default": 'div[data-model-type="default"]',
        "expert": 'div[data-model-type="expert"]',
        "vision": 'div[data-model-type="vision"]',
    }
    _LOGIN_INDICATORS = [
        "text=Scan with",
        "text=登录",
        "text=微信扫码",
        "text=Log in",
        "text=Sign in",
        "text=手机号",
    ]

    def __init__(self, config: Config | None = None):
        self._config = config or Config()
        self._context = None
        self._page = None
        self._reply_count = 0  # 当前页面已有的回复条数

    # ---- 公开接口 ----

    def ask(self, prompt: str, model_type: str | None = None) -> Reply:
        """发送消息并获取回复。

        Args:
            prompt: 要发送的问题文本。
            model_type: 模型模式，可选 "default" / "expert" / "vision"，None 则不切换。

        Returns:
            Reply: 包含回复文本、成功状态、耗时等信息。
        """
        t0 = time.time()
        try:
            self._ensure_browser()
            self._navigate()
            self._ensure_logged_in()

            # 切换模型模式
            if model_type:
                self._select_model(model_type)

            # 记录当前回复数量，用于定位新回复
            self._reply_count = len(self._page.query_selector_all(self._REPLY_SELECTOR))

            self._input_text(prompt)
            self._click_send()

            reply_text = self._wait_for_reply()
            elapsed = time.time() - t0
            logger.info(f"收到回复 ({len(reply_text)} 字符，耗时 {elapsed:.1f}s)")
            return Reply(text=reply_text, success=True, duration=elapsed)

        except Exception as e:
            elapsed = time.time() - t0
            logger.error(f"请求失败: {e}")
            return Reply(text="", success=False, duration=elapsed, error=str(e))

    def close(self):
        """关闭浏览器，释放资源。"""
        if self._context:
            logger.info("关闭浏览器")
            self._context.close()
            self._context = None
            self._page = None
        if getattr(self, "_playwright", None):
            self._playwright.stop()
            self._playwright = None

    def new_chat(self):
        """开始新对话（Ctrl+J）。如浏览器未启动会自动初始化。"""
        self._ensure_browser()
        self._navigate()
        self._ensure_logged_in()
        self._page.keyboard.press("Control+J")
        time.sleep(0.3)
        logger.info("已开始新对话")

    # ---- 模型切换 ----

    def _select_model(self, model_type: str):
        """切换模型模式。"""
        selector = self._MODEL_SELECTORS.get(model_type)
        if not selector:
            valid = ", ".join(self._MODEL_SELECTORS)
            raise ValueError(f"无效的模型类型 '{model_type}'，可选：{valid}")

        self._page.click(selector)
        time.sleep(0.2)
        logger.info(f"已切换至 {model_type} 模式")

    # ---- 浏览器生命周期 ----

    def _page_alive(self) -> bool:
        """检查当前页面是否仍然可用。"""
        if self._page is None:
            return False
        try:
            self._page.evaluate("1")
            return True
        except Exception:
            return False

    def _ensure_browser(self):
        """懒初始化浏览器上下文。如果旧上下文已关闭则重建。"""
        if self._context is not None and self._page_alive():
            return

        # 清理已失效的旧上下文
        if self._context is not None:
            logger.debug("浏览器上下文已失效，重新创建")
            try:
                self._context.close()
            except Exception:
                pass
            self._context = None
            self._page = None

        logger.info("启动浏览器...")
        self._playwright = sync_playwright().start()
        self._context = self._playwright.chromium.launch_persistent_context(
            user_data_dir=self._config.user_data_dir,
            channel=self._config.browser_channel,
            headless=self._config.headless,
            slow_mo=self._config.slow_mo,
            viewport={
                "width": self._config.viewport_width,
                "height": self._config.viewport_height,
            },
            locale=self._config.locale,
        )
        self._page = self._context.pages[0] if self._context.pages else self._context.new_page()

    def _navigate(self):
        """打开 DeepSeek 页面。"""
        logger.info(f"打开 {self._config.url}")
        self._page.goto(self._config.url, wait_until="domcontentloaded")
        time.sleep(1)

    # ---- 登录 ----

    def _ensure_logged_in(self):
        """检查登录状态，未登录则等待用户手动登录。"""
        if self._need_login():
            logger.warning("需要登录！请在浏览器中手动完成登录...")
            logger.warning("登录成功后脚本会自动继续")
            self._wait_for_login()

        # 等待页面完全就绪
        self._page.wait_for_selector(self._INPUT_SELECTOR, timeout=15000)
        logger.info("页面就绪")
        time.sleep(0.3)

    def _need_login(self) -> bool:
        """判断当前页面是否需要登录。"""
        for sel in self._LOGIN_INDICATORS:
            try:
                if self._page.query_selector(sel):
                    return True
            except Exception:
                continue
        if not self._page.query_selector(self._INPUT_SELECTOR):
            return True
        return False

    def _wait_for_login(self):
        """轮询等待用户手动完成登录。"""
        start = time.time()
        while time.time() - start < self._config.login_timeout:
            if not self._need_login():
                time.sleep(2)
                logger.info("登录成功")
                return
            time.sleep(2)
        raise TimeoutError(f"登录超时（{self._config.login_timeout}秒），请重试")

    # ---- 输入与发送 ----

    def _input_text(self, text: str):
        """聚焦输入框 → 填入文本（fill 为主，insertText 为回退）。"""
        input_box = self._page.wait_for_selector(self._INPUT_SELECTOR, timeout=15000)
        input_box.click()
        time.sleep(0.2)

        # 主路径：Playwright 的 fill() 能正确触发 React 受控组件的事件流
        try:
            input_box.fill(text)
            time.sleep(0.2)
        except Exception:
            # 回退：keyboard.insertText 模拟真实输入
            logger.debug("fill() 失败，回退到 insertText")
            self._page.keyboard.press("Control+A")
            time.sleep(0.1)
            self._page.keyboard.insert_text(text)
            time.sleep(0.3)

        logger.info("已填入内容到输入框")

    def _click_send(self):
        """点击发送按钮，回退方案为 Enter 键。"""
        try:
            self._page.wait_for_selector(self._SEND_BUTTON_SELECTOR, timeout=3000)
            send_btn = self._page.query_selector(self._SEND_BUTTON_SELECTOR)
            if send_btn:
                send_btn.click()
                logger.info("已点击发送按钮")
                return
        except Exception:
            pass

        logger.debug("发送按钮未就绪，使用 Enter 发送")
        self._page.keyboard.press("Enter")

    # ---- 等待与提取回复 ----

    def _wait_for_reply(self) -> str:
        """等待新回复出现并文本稳定，返回回复文本。"""
        timeout = self._config.send_timeout
        start = time.time()
        count_before = self._reply_count

        # 阶段1：等待新回复元素出现
        while time.time() - start < timeout:
            current = len(self._page.query_selector_all(self._REPLY_SELECTOR))
            if current > count_before:
                logger.debug("新回复元素出现")
                break
            time.sleep(0.5)
        else:
            logger.warning("等待回复超时，尝试获取已有内容")
            return self._extract_reply_text(count_before)

        # 阶段2：等待文本稳定（连续 3 次相同 = 稳定）
        last_text = ""
        stable_count = 0
        while stable_count < 3 and (time.time() - start) < timeout:
            time.sleep(0.5)
            current_text = self._extract_reply_text(count_before)
            if current_text == last_text:
                stable_count += 1
            else:
                stable_count = 0
                last_text = current_text

        return self._extract_reply_text(count_before)

    def _extract_reply_text(self, count_before: int) -> str:
        """获取最新回复的纯文本内容。"""
        replies = self._page.query_selector_all(self._REPLY_SELECTOR)
        if len(replies) > count_before:
            text = replies[-1].inner_text().strip()
            if text:
                return text

        # 回退：JS 获取
        text = self._page.evaluate(
            """
            () => {
                const els = document.querySelectorAll(
                    'div.ds-assistant-message-main-content'
                );
                if (els.length > 0) return els[els.length - 1].innerText;
                return '';
            }
            """
        )
        if text.strip():
            return text.strip()

        return "(⚠️ 无法获取回复文本，请手动复制)"


# ==================== CLI ====================


def main():
    """命令行入口。"""
    parser = argparse.ArgumentParser(
        description="DeepSeek Web 客户端 — 通过网页版发送消息并获取回复",
    )
    parser.add_argument(
        "prompt",
        nargs="?",
        default=None,
        help="要发送的问题。不传则从 stdin 读取；传 - 明确从 stdin 读取",
    )
    parser.add_argument("--headless", action="store_true", help="无头模式（不显示浏览器窗口）")
    parser.add_argument("--json", action="store_true", dest="json_output", help="以 JSON 格式输出结果")
    parser.add_argument("--timeout", type=int, default=180, help="等待回复的超时秒数（默认 180）")
    parser.add_argument("--browser", default="msedge", help="浏览器选择：msedge / chromium / chrome")
    parser.add_argument("--debug", action="store_true", help="输出调试日志")

    args = parser.parse_args()

    # Windows 终端 GBK 编码兜底：强制 stdout 走 UTF-8，无法编码的字符替换掉
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    # 日志配置
    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.WARNING,
        format="%(levelname)s [dsweb] %(message)s",
        stream=sys.stderr,
    )

    # 获取 prompt
    prompt = args.prompt
    if prompt is None or prompt == "-":
        prompt = sys.stdin.read()
    if not prompt.strip():
        parser.error("未提供 prompt（输入为空）")

    # 构建配置
    config = Config(
        headless=args.headless,
        browser_channel=args.browser,
        send_timeout=args.timeout,
    )

    client = DeepSeekClient(config)
    try:
        reply = client.ask(prompt.strip())

        if args.json_output:
            output = {
                "success": reply.success,
                "text": reply.text,
                "duration": reply.duration,
                "error": reply.error,
            }
            print(json.dumps(output, ensure_ascii=False))
        else:
            if reply.success:
                print(reply.text)
            else:
                print(f"❌ 错误: {reply.error}", file=sys.stderr)
                sys.exit(1)
    finally:
        client.close()


if __name__ == "__main__":
    main()
