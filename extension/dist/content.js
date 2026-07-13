"use strict";
(() => {
  // src/content/parser.ts
  var strategies = [
    strategyDSMarkdown,
    strategyChatBubbles,
    strategyVisibleText
  ];
  function captureConversation() {
    for (const fn of strategies) {
      const result = fn();
      if (result && result.question.length > 2 && result.answer.length > 2) {
        return result;
      }
    }
    return null;
  }
  function strategyDSMarkdown() {
    const selectors = [
      ".ds-markdown",
      '[class*="ds_markdown"]',
      '[class*="markdown_body"]',
      ".md-content",
      '[class*="message"] [class*="content"]'
    ];
    for (const sel of selectors) {
      const blocks = document.querySelectorAll(sel);
      if (blocks.length < 2) continue;
      const all = Array.from(blocks).filter(
        (el) => (el.textContent?.length || 0) > 10
      );
      if (all.length < 2) continue;
      const answer = all.pop()?.textContent?.trim() || "";
      const question = all.pop()?.textContent?.trim() || "";
      if (question && answer) return { question, answer };
    }
    return null;
  }
  function strategyChatBubbles() {
    const userSelectors = [
      '[class*="user"] [class*="content"]',
      '[class*="human"] p',
      '[class*="question"]',
      '[data-role="user"]',
      '[class*="right"] [class*="bubble"]',
      '[class*="self"]'
    ];
    const aiSelectors = [
      '[class*="assistant"] [class*="content"]',
      '[class*="bot"] p',
      '[class*="answer"]',
      '[data-role="assistant"]',
      '[class*="left"] [class*="bubble"]'
    ];
    for (const uSel of userSelectors) {
      for (const aSel of aiSelectors) {
        const userEls = document.querySelectorAll(uSel);
        const aiEls = document.querySelectorAll(aSel);
        const lastUser = userEls[userEls.length - 1];
        const lastAI = aiEls[aiEls.length - 1];
        const question = lastUser?.textContent?.trim() || "";
        const answer = lastAI?.textContent?.trim() || "";
        if (question && answer) return { question, answer };
      }
    }
    return null;
  }
  function strategyVisibleText() {
    const containerSelectors = [
      '[class*="chat"] [class*="scroll"]',
      'main [class*="overflow"]',
      '[class*="conversation"]',
      '[class*="messages"]',
      '[class*="chat-container"]'
    ];
    let chatContainer = null;
    for (const sel of containerSelectors) {
      chatContainer = document.querySelector(sel);
      if (chatContainer) break;
    }
    if (!chatContainer) return null;
    const children = Array.from(chatContainer.children);
    const texts = children.map((c) => c.textContent?.trim()).filter((t) => !!t && t.length > 5);
    if (texts.length < 2) return null;
    return {
      question: texts[texts.length - 2],
      answer: texts[texts.length - 1]
    };
  }

  // src/content/observer.ts
  function startAutoCapture(onNewQA) {
    const chatContainer = findChatContainer();
    if (!chatContainer) {
      console.warn("[\u77E5\u8BC6\u6811] \u672A\u627E\u5230 DeepSeek \u5BF9\u8BDD\u5BB9\u5668\uFF0C\u81EA\u52A8\u6355\u83B7\u672A\u542F\u52A8");
      return () => {
      };
    }
    let processedCount = countMessages(chatContainer);
    let streamEndTimer = null;
    let lastContentLength = 0;
    const observer = new MutationObserver(() => {
      const messages = getMessageBlocks(chatContainer);
      const currentCount = messages.length;
      if (currentCount > processedCount) {
        const totalLength = chatContainer.textContent?.length || 0;
        if (streamEndTimer) clearTimeout(streamEndTimer);
        if (totalLength !== lastContentLength) {
          lastContentLength = totalLength;
          streamEndTimer = setTimeout(() => {
            const updated = getMessageBlocks(chatContainer);
            if (updated.length >= 2) {
              const lastQA = extractLastQA(updated);
              if (lastQA) {
                onNewQA(lastQA);
              }
            }
            processedCount = updated.length;
          }, 1500);
        }
      }
      const actionBar = chatContainer.querySelector(
        '[class*="action"], [class*="toolbar"], button[aria-label*="\u590D\u5236"], [class*="copy"]'
      );
      if (actionBar && currentCount > processedCount && !streamEndTimer) {
        const messages2 = getMessageBlocks(chatContainer);
        const lastQA = extractLastQA(messages2);
        if (lastQA) {
          onNewQA(lastQA);
        }
        processedCount = currentCount;
      }
    });
    observer.observe(chatContainer, {
      childList: true,
      subtree: true,
      characterData: true
    });
    return () => {
      observer.disconnect();
      if (streamEndTimer) clearTimeout(streamEndTimer);
    };
  }
  function findChatContainer() {
    const selectors = [
      '[class*="chat"] [class*="scroll"]',
      'main [class*="overflow"]',
      '[class*="conversation"]',
      '[class*="messages"]',
      '[class*="chat-container"]',
      "main",
      "#root > div > div"
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > 200) return el;
    }
    return null;
  }
  function getMessageBlocks(container) {
    return Array.from(container.querySelectorAll(
      '.ds-markdown, [class*="message"], [class*="bubble"], [class*="turn"], [class*="chat-item"]'
    )).filter((el) => (el.textContent?.length || 0) > 5);
  }
  function countMessages(container) {
    return getMessageBlocks(container).length;
  }
  function extractLastQA(messages) {
    if (messages.length < 2) return null;
    const substantive = messages.filter(
      (el) => (el.textContent?.length || 0) > 10
    );
    if (substantive.length < 2) return null;
    const answer = substantive.pop()?.textContent?.trim() || "";
    const question = substantive.pop()?.textContent?.trim() || "";
    if (question.length > 2 && answer.length > 2) {
      return { question, answer };
    }
    return null;
  }

  // src/content/index.ts
  var MIN_WIDTH = 320;
  var MAX_WIDTH = 600;
  var DEFAULT_WIDTH = 420;
  var STORAGE_WIDTH = "kt_sidebar_width";
  var STORAGE_AUTO = "kt_auto_capture";
  var CONTAINER_ID = "kt-sidebar-container";
  var IFRAME_ID = "kt-sidebar-iframe";
  var HANDLE_ID = "kt-sidebar-handle";
  var TOGGLE_ID = "kt-sidebar-toggle";
  var CAPTURE_ID = "kt-capture-btn";
  var TOAST_ID = "kt-toast";
  var visible = true;
  var currentWidth = DEFAULT_WIDTH;
  var autoCapture = false;
  var stopObserver = null;
  function init() {
    chrome.storage.local.get([STORAGE_WIDTH, STORAGE_AUTO], (items) => {
      if (items[STORAGE_WIDTH]) currentWidth = items[STORAGE_WIDTH];
      if (items[STORAGE_AUTO]) autoCapture = items[STORAGE_AUTO];
      injectSidebar();
      injectCaptureButton();
      injectToast();
      setupMessageBridge();
      adjustPageMargin(currentWidth);
      adjustFixedElements(currentWidth);
      if (autoCapture) startObserver();
    });
  }
  function injectSidebar() {
    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    Object.assign(container.style, {
      position: "fixed",
      top: "0",
      right: "0",
      bottom: "0",
      width: `${currentWidth}px`,
      zIndex: "99999",
      transition: "transform 0.3s ease",
      display: "flex",
      flexDirection: "row"
    });
    const handle = document.createElement("div");
    handle.id = HANDLE_ID;
    Object.assign(handle.style, {
      width: "4px",
      cursor: "col-resize",
      background: "transparent",
      transition: "background 0.15s",
      flexShrink: "0",
      zIndex: "10"
    });
    handle.addEventListener("mouseenter", () => {
      handle.style.background = "#3b82f6";
    });
    handle.addEventListener("mouseleave", () => {
      handle.style.background = "transparent";
    });
    handle.addEventListener("mousedown", onResizeStart);
    const iframe = document.createElement("iframe");
    iframe.id = IFRAME_ID;
    iframe.src = chrome.runtime.getURL("sidebar/index.html");
    Object.assign(iframe.style, {
      flex: "1",
      border: "none",
      background: "#fff",
      boxShadow: "-2px 0 12px rgba(0,0,0,0.08)"
    });
    container.appendChild(handle);
    container.appendChild(iframe);
    document.body.appendChild(container);
    const toggle = document.createElement("button");
    toggle.id = TOGGLE_ID;
    toggle.textContent = "\xBB";
    toggle.title = "\u6536\u8D77/\u5C55\u5F00\u4FA7\u8FB9\u680F";
    Object.assign(toggle.style, {
      position: "fixed",
      bottom: "20px",
      right: `${currentWidth}px`,
      zIndex: "100000",
      width: "22px",
      height: "48px",
      border: "1px solid #e2e8f0",
      borderRadius: "6px 0 0 6px",
      background: "#fff",
      cursor: "pointer",
      fontSize: "14px",
      color: "#64748b",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "right 0.3s ease",
      boxShadow: "-1px 0 4px rgba(0,0,0,0.06)"
    });
    toggle.addEventListener("click", onToggle);
    document.body.appendChild(toggle);
  }
  function onResizeStart(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = currentWidth;
    function onMove(ev) {
      const delta = startX - ev.clientX;
      currentWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta));
      applyWidth(currentWidth);
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      chrome.storage.local.set({ [STORAGE_WIDTH]: currentWidth });
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  function applyWidth(w) {
    const container = document.getElementById(CONTAINER_ID);
    const toggle = document.getElementById(TOGGLE_ID);
    if (container) container.style.width = `${w}px`;
    if (toggle) toggle.style.right = `${w}px`;
    adjustPageMargin(visible ? w : 0);
  }
  function onToggle() {
    visible = !visible;
    const container = document.getElementById(CONTAINER_ID);
    const toggle = document.getElementById(TOGGLE_ID);
    if (!container || !toggle) return;
    if (visible) {
      container.style.transform = "translateX(0)";
      toggle.style.right = `${currentWidth}px`;
      toggle.textContent = "\xBB";
      adjustPageMargin(currentWidth);
      adjustFixedElements(currentWidth);
    } else {
      container.style.transform = `translateX(${currentWidth}px)`;
      toggle.style.right = "0";
      toggle.textContent = "\xAB";
      adjustPageMargin(0);
      adjustFixedElements(0);
    }
  }
  function adjustPageMargin(w) {
    document.documentElement.style.setProperty("--kt-sidebar-width", w > 0 ? `${w}px` : "0px");
    if (w > 0) {
      document.documentElement.style.width = `calc(100% - ${w}px)`;
      document.documentElement.style.overflowX = "hidden";
      document.documentElement.style.transition = "width 0.3s ease";
    } else {
      document.documentElement.style.width = "";
      document.documentElement.style.overflowX = "";
      document.documentElement.style.transition = "";
    }
  }
  var _fixedAdjusted = /* @__PURE__ */ new WeakSet();
  function adjustFixedElements(w) {
    const candidates = document.querySelectorAll(
      'div, button, nav, aside, header, [class*="fixed"], [class*="sidebar"], [class*="panel"]'
    );
    for (const el of candidates) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.id === CONTAINER_ID || el.id === TOGGLE_ID || el.id === CAPTURE_ID || el.id === TOAST_ID) continue;
      if (el.closest(`#${CONTAINER_ID}`)) continue;
      const s = window.getComputedStyle(el);
      if (s.position !== "fixed") continue;
      const right = parseFloat(s.right);
      if (isNaN(right)) continue;
      if (w > 0) {
        if (right < w + 30) {
          el.style.right = `calc(${right}px + var(--kt-sidebar-width))`;
          _fixedAdjusted.add(el);
        }
      } else {
        if (_fixedAdjusted.has(el)) {
          el.style.right = "";
          _fixedAdjusted.delete(el);
        }
      }
    }
  }
  function injectCaptureButton() {
    const btn = document.createElement("button");
    btn.id = CAPTURE_ID;
    btn.textContent = "\u{1F4C4} \u6355\u83B7\u5230\u77E5\u8BC6\u6811";
    btn.title = "\u6355\u83B7\u5F53\u524D\u6700\u540E\u4E00\u7EC4\u95EE\u7B54";
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "24px",
      right: `${currentWidth + 20}px`,
      zIndex: "100000",
      padding: "8px 16px",
      border: "none",
      borderRadius: "8px",
      background: "#3b82f6",
      color: "#fff",
      fontSize: "13px",
      fontWeight: "500",
      cursor: "pointer",
      boxShadow: "0 4px 12px rgba(59,130,246,0.4)",
      transition: "right 0.3s ease, background 0.15s"
    });
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "#2563eb";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "#3b82f6";
    });
    btn.addEventListener("click", handleManualCapture);
    document.body.appendChild(btn);
    const updater = () => {
      const btn2 = document.getElementById(CAPTURE_ID);
      if (btn2) btn2.style.right = `${(visible ? currentWidth : 0) + 20}px`;
    };
    const origApply = applyWidth;
    window.__kt_applyWidth = function(w) {
      origApply(w);
      updater();
    };
  }
  function handleManualCapture() {
    const result = captureConversation();
    if (!result) {
      showToast("\u26A0\uFE0F \u672A\u80FD\u6355\u83B7\u5230\u5BF9\u8BDD\u5185\u5BB9\uFF0C\u8BF7\u5C1D\u8BD5\u5728\u9875\u9762\u4E2D\u5148\u53D1\u9001\u4E00\u6761\u6D88\u606F", "error");
      return;
    }
    postToSidebar({ type: "CAPTURE_RESULT", data: result });
    showToast("\u2705 \u5DF2\u6355\u83B7\uFF0C\u8BF7\u5728\u4FA7\u8FB9\u680F\u4E2D\u786E\u8BA4\u521B\u5EFA", "success");
  }
  function injectToast() {
    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "80px",
      right: `${currentWidth + 20}px`,
      zIndex: "100001",
      padding: "10px 18px",
      borderRadius: "8px",
      fontSize: "13px",
      fontWeight: "500",
      pointerEvents: "none",
      opacity: "0",
      transform: "translateY(10px)",
      transition: "opacity 0.3s, transform 0.3s, right 0.3s",
      maxWidth: "320px"
    });
    document.body.appendChild(toast);
  }
  var toastTimer = null;
  function showToast(msg, type = "info") {
    const toast = document.getElementById(TOAST_ID);
    if (!toast) return;
    const colors = {
      success: "#16a34a",
      error: "#dc2626",
      info: "#3b82f6"
    };
    toast.textContent = msg;
    toast.style.background = colors[type];
    toast.style.color = "#fff";
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
    toast.style.pointerEvents = "auto";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
    }, 3e3);
  }
  function startObserver() {
    if (stopObserver) return;
    stopObserver = startAutoCapture((qa) => {
      postToSidebar({ type: "AUTO_CAPTURE", data: qa });
      showToast("\u{1F514} \u68C0\u6D4B\u5230\u65B0\u95EE\u7B54\uFF0C\u8BF7\u5728\u4FA7\u8FB9\u680F\u786E\u8BA4", "info");
    });
  }
  function stopObserverFn() {
    if (stopObserver) {
      stopObserver();
      stopObserver = null;
    }
  }
  function setupMessageBridge() {
    window.addEventListener("message", (event) => {
      const iframe = document.getElementById(IFRAME_ID);
      if (!iframe || event.source !== iframe.contentWindow) return;
      const msg = event.data;
      if (!msg || !msg.type) return;
      switch (msg.type) {
        case "CAPTURE": {
          const result = captureConversation();
          postToSidebar({ type: "CAPTURE_RESULT", data: result });
          break;
        }
        case "RESIZE":
          currentWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, msg.width || DEFAULT_WIDTH));
          applyWidth(currentWidth);
          chrome.storage.local.set({ [STORAGE_WIDTH]: currentWidth });
          break;
        case "TOGGLE":
          onToggle();
          break;
        case "AUTO_TOGGLE": {
          autoCapture = msg.enabled;
          chrome.storage.local.set({ [STORAGE_AUTO]: autoCapture });
          if (autoCapture) startObserver();
          else stopObserverFn();
          break;
        }
        case "TOAST":
          showToast(msg.text || "", msg.variant || "info");
          break;
        case "CREATED":
          showToast(`\u2705 \u8282\u70B9\u5DF2\u521B\u5EFA`, "success");
          break;
      }
    });
  }
  function postToSidebar(data) {
    const iframe = document.getElementById(IFRAME_ID);
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(data, "*");
    }
  }
  init();
})();
