"use strict";
(() => {
  // src/content/export-api.ts
  function extractContent(m) {
    if (Array.isArray(m.fragments)) {
      const rf = m.fragments.find(
        (f) => typeof f === "object" && f.type === "RESPONSE" && f.content
      );
      if (rf) return rf.content.trim();
      const parts = [];
      for (const f of m.fragments) {
        if (typeof f === "string") {
          parts.push(f);
        } else if (f.content) {
          parts.push(typeof f.content === "string" ? f.content : f.content.text || "");
        }
      }
      const joined = parts.join("\n").trim();
      if (joined) return joined;
    }
    if (typeof m.content === "string" && m.content.trim()) return m.content.trim();
    if (m.content?.text) return m.content.text.trim();
    if (typeof m.text === "string") return m.text.trim();
    return "";
  }
  function extractReasoning(m) {
    if (Array.isArray(m.fragments)) {
      const tf = m.fragments.find(
        (f) => typeof f === "object" && f.type === "THINK" && f.content
      );
      if (tf) return tf.content.trim();
    }
    if (typeof m.thinking_content === "string") return m.thinking_content.trim();
    if (m.thinking_content?.text) return m.thinking_content.text.trim();
    return null;
  }
  function downloadFile(name, data, mimeType) {
    const blob = new Blob([data], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = name;
    el.click();
    URL.revokeObjectURL(url);
  }
  async function exportConversation() {
    try {
      const match = location.pathname.match(/\/a\/chat\/s\/([a-f0-9-]+)/);
      if (!match) {
        console.error("\u274C \u5BFC\u51FA\uFF1A\u4E0D\u5728 DeepSeek \u5BF9\u8BDD\u9875\u9762");
        return false;
      }
      const sid = match[1];
      let token = "";
      try {
        const raw = localStorage.getItem("userToken");
        token = raw ? JSON.parse(raw).value || "" : "";
      } catch {
      }
      const tzOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset() * -60;
      const resp = await fetch(
        `/api/v0/chat/history_messages?chat_session_id=${sid}`,
        {
          headers: {
            "x-client-bundle-id": "com.deepseek.chat",
            "x-client-platform": "web",
            "x-client-version": "2.2.0",
            "x-client-locale": "zh_CN",
            "x-client-timezone-offset": String(tzOffset),
            ...token ? { authorization: `Bearer ${token}` } : {},
            accept: "*/*"
          }
        }
      );
      if (!resp.ok) {
        console.error(`\u274C \u5BFC\u51FA\uFF1AHTTP ${resp.status}`);
        return false;
      }
      const j = await resp.json();
      if (j.code !== 0) {
        console.error("\u274C \u5BFC\u51FA\uFF1A", j.msg);
        return false;
      }
      const msgs = j?.data?.biz_data?.chat_messages;
      const sess = j?.data?.biz_data?.chat_session;
      if (!Array.isArray(msgs) || msgs.length === 0) {
        console.error("\u274C \u5BFC\u51FA\uFF1A\u65E0\u6D88\u606F");
        return false;
      }
      const parsed = [];
      const idToIndex = {};
      const seen = /* @__PURE__ */ new Set();
      for (const m of msgs) {
        const role = (m.role || "").toLowerCase();
        if (role === "system") continue;
        const c = extractContent(m);
        if (!c) continue;
        const fp = m.message_id || `${role}::${c.slice(0, 100)}`;
        if (seen.has(fp)) continue;
        seen.add(fp);
        const idx = parsed.length;
        idToIndex[String(m.message_id)] = idx;
        parsed.push({
          role,
          content: c,
          message_id: m.message_id,
          reasoning_content: extractReasoning(m),
          _parentId: m.parent_id
        });
      }
      for (const x of parsed) {
        const p = x;
        if (p._parentId != null) {
          const parentIdx = idToIndex[String(p._parentId)];
          if (parentIdx !== void 0) {
            x.parent = parentIdx;
          }
        }
        delete x._parentId;
      }
      const userCount = parsed.filter((m) => m.role === "user").length;
      const aiCount = parsed.filter((m) => m.role === "assistant").length;
      const title = (sess?.title || document.title || "deepseek-chat").replace(/[\\/:*?"<>|]/g, "-");
      let md = `# ${title}

> ${(/* @__PURE__ */ new Date()).toLocaleString()} | user:${userCount} assistant:${aiCount}

---

`;
      let t = 1;
      for (const m of parsed) {
        if (m.role === "user") {
          md += `## \u{1F9D1} You\uFF08${t}\uFF09

${m.content}

`;
          t++;
        } else {
          md += `## \u{1F916} DeepSeek

${m.content}

`;
        }
        md += "---\n\n";
      }
      const jsonOut = parsed.map((m) => {
        const entry = { role: m.role, content: m.content, message_id: m.message_id };
        if (m.reasoning_content) entry.reasoning_content = m.reasoning_content;
        if (m.parent !== void 0) entry.parent = m.parent;
        return entry;
      });
      const d = /* @__PURE__ */ new Date();
      const date = d.toISOString().slice(0, 10);
      const time = d.toTimeString().slice(0, 8).replace(/:/g, "");
      const fn = `deepseek-${title.slice(0, 30)}-${date}-${time}`;
      downloadFile(`${fn}.md`, md, "text/markdown");
      downloadFile(`${fn}.json`, JSON.stringify(jsonOut, null, 2), "application/json");
      return true;
    } catch (e) {
      console.error("\u274C \u5BFC\u51FA\u5F02\u5E38\uFF1A", e.message || e);
      return false;
    }
  }

  // src/content/index.ts
  var MIN_WIDTH = 320;
  var MAX_WIDTH = 600;
  var DEFAULT_WIDTH = 420;
  var STORAGE_WIDTH = "kt_sidebar_width";
  var CONTAINER_ID = "kt-sidebar-container";
  var IFRAME_ID = "kt-sidebar-iframe";
  var HANDLE_ID = "kt-sidebar-handle";
  var TOGGLE_ID = "kt-sidebar-toggle";
  var EXPORT_ID = "kt-export-btn";
  var TOAST_ID = "kt-toast";
  var visible = false;
  var currentWidth = DEFAULT_WIDTH;
  var currentTheme = "light";
  function detectTheme() {
    const html = document.documentElement;
    if (html.classList.contains("dark")) return "dark";
    if (html.getAttribute("data-color-scheme") === "dark") return "dark";
    return "light";
  }
  function syncThemeToSidebar() {
    const theme = detectTheme();
    if (theme !== currentTheme) {
      currentTheme = theme;
      postToSidebar({ type: "THEME", theme });
    }
  }
  function init() {
    currentTheme = detectTheme();
    chrome.storage.local.get([STORAGE_WIDTH], (items) => {
      if (items[STORAGE_WIDTH]) currentWidth = items[STORAGE_WIDTH];
      injectSidebar();
      injectExportButton();
      injectToast();
      setupMessageBridge();
      adjustPageMargin(visible ? currentWidth : 0);
      adjustFixedElements(visible ? currentWidth : 0);
      setTimeout(() => syncThemeToSidebar(), 500);
    });
    const themeObserver = new MutationObserver(() => {
      syncThemeToSidebar();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-color-scheme"]
    });
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      syncThemeToSidebar();
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
      transition: "transform 0.3s ease, box-shadow 0.3s ease",
      display: "flex",
      flexDirection: "row"
    });
    const handle = document.createElement("div");
    handle.id = HANDLE_ID;
    Object.assign(handle.style, {
      width: "3px",
      cursor: "col-resize",
      background: "transparent",
      transition: "background 0.2s, width 0.15s",
      flexShrink: "0",
      zIndex: "10",
      borderLeft: "1px solid transparent"
    });
    handle.addEventListener("mouseenter", () => {
      handle.style.background = "#3964FE";
      handle.style.width = "4px";
    });
    handle.addEventListener("mouseleave", () => {
      handle.style.background = "transparent";
      handle.style.width = "3px";
    });
    handle.addEventListener("mousedown", onResizeStart);
    const iframe = document.createElement("iframe");
    iframe.id = IFRAME_ID;
    iframe.src = chrome.runtime.getURL("sidebar/index.html");
    Object.assign(iframe.style, {
      flex: "1",
      border: "none",
      background: "#f2f2f6",
      boxShadow: "-1px 0 0 rgba(0,0,0,0.06), -4px 0 16px rgba(0,0,0,0.06)"
    });
    container.appendChild(handle);
    container.appendChild(iframe);
    if (!visible) {
      container.style.transform = `translateX(${currentWidth}px)`;
    }
    document.body.appendChild(container);
    const chevronRight = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
    const chevronLeft = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
    const toggle = document.createElement("button");
    toggle.id = TOGGLE_ID;
    toggle.innerHTML = visible ? chevronRight : chevronLeft;
    toggle.title = "\u6536\u8D77/\u5C55\u5F00\u4FA7\u8FB9\u680F";
    Object.assign(toggle.style, {
      position: "fixed",
      bottom: "20px",
      right: visible ? `${currentWidth}px` : "0",
      zIndex: "100000",
      width: "24px",
      height: "44px",
      border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: "6px 0 0 6px",
      background: "#ffffff",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "right 0.3s ease, background 0.15s, border-color 0.15s",
      boxShadow: "-1px 0 8px rgba(0,0,0,0.04)",
      padding: "0",
      color: "#6e6e88"
    });
    toggle.addEventListener("mouseenter", () => {
      toggle.style.background = "#3964FE";
      toggle.style.color = "#ffffff";
      toggle.style.borderColor = "#3964FE";
    });
    toggle.addEventListener("mouseleave", () => {
      toggle.style.background = "#ffffff";
      toggle.style.color = "#6e6e88";
      toggle.style.borderColor = "rgba(0,0,0,0.08)";
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
    const exportBtn = document.getElementById(EXPORT_ID);
    if (container) container.style.width = `${w}px`;
    if (toggle) toggle.style.right = `${w}px`;
    if (exportBtn && visible) exportBtn.style.right = `${w + 16}px`;
    adjustPageMargin(visible ? w : 0);
  }
  function onToggle() {
    visible = !visible;
    const container = document.getElementById(CONTAINER_ID);
    const toggle = document.getElementById(TOGGLE_ID);
    const exportBtn = document.getElementById(EXPORT_ID);
    if (!container || !toggle) return;
    const chevronRight = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
    const chevronLeft = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
    if (visible) {
      container.style.transform = "translateX(0)";
      toggle.style.right = `${currentWidth}px`;
      toggle.innerHTML = chevronRight;
      if (exportBtn) exportBtn.style.right = `${currentWidth + 16}px`;
      adjustPageMargin(currentWidth);
      adjustFixedElements(currentWidth);
    } else {
      container.style.transform = `translateX(${currentWidth}px)`;
      toggle.style.right = "0";
      toggle.innerHTML = chevronLeft;
      if (exportBtn) exportBtn.style.right = "16px";
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
      if (el.id === CONTAINER_ID || el.id === TOGGLE_ID || el.id === EXPORT_ID || el.id === TOAST_ID) continue;
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
  function injectExportButton() {
    const btn = document.createElement("button");
    btn.id = EXPORT_ID;
    btn.innerHTML = `<span style="display:flex;align-items:center;gap:6px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>\u5BFC\u51FA\u5BF9\u8BDD</span>`;
    btn.title = "\u5BFC\u51FA\u5B8C\u6574\u5BF9\u8BDD\u4E3A .md + .json\uFF08API \u65B9\u6848\uFF09";
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "130px",
      right: visible ? `${currentWidth + 16}px` : "16px",
      zIndex: "100000",
      padding: "8px 16px",
      border: "none",
      borderRadius: "8px",
      background: "#3964FE",
      color: "#ffffff",
      fontSize: "13px",
      fontWeight: "500",
      cursor: "pointer",
      boxShadow: "0 4px 14px rgba(57,100,254,0.35)",
      transition: "right 0.3s ease, background 0.15s, transform 0.15s, box-shadow 0.15s",
      fontFamily: "DM Sans, system-ui, sans-serif"
    });
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "#2b54e8";
      btn.style.transform = "translateY(-1px)";
      btn.style.boxShadow = "0 6px 18px rgba(57,100,254,0.4)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "#3964FE";
      btn.style.transform = "translateY(0)";
      btn.style.boxShadow = "0 4px 14px rgba(57,100,254,0.35)";
    });
    btn.addEventListener("click", handleExport);
    document.body.appendChild(btn);
  }
  async function handleExport() {
    const btn = document.getElementById(EXPORT_ID);
    if (btn) {
      btn.textContent = "\u23F3 \u5BFC\u51FA\u4E2D\u2026";
      btn.disabled = true;
      btn.style.opacity = "0.7";
      btn.style.cursor = "default";
    }
    const ok = await exportConversation();
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
      btn.innerHTML = `<span style="display:flex;align-items:center;gap:6px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>\u5BFC\u51FA\u5BF9\u8BDD</span>`;
    }
    if (ok) {
      showToast("\u2705 \u5BFC\u51FA\u6210\u529F\uFF0C\u5DF2\u4E0B\u8F7D .md + .json", "success");
    } else {
      showToast("\u274C \u5BFC\u51FA\u5931\u8D25\uFF0C\u8BF7\u786E\u4FDD\u5728 DeepSeek \u5BF9\u8BDD\u9875\u9762", "error");
    }
  }
  function injectToast() {
    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "140px",
      right: visible ? `${currentWidth + 16}px` : "16px",
      zIndex: "100001",
      padding: "10px 18px",
      borderRadius: "8px",
      fontSize: "13px",
      fontWeight: "500",
      fontFamily: "DM Sans, system-ui, sans-serif",
      pointerEvents: "none",
      opacity: "0",
      transform: "translateY(10px)",
      transition: "opacity 0.3s, transform 0.3s, right 0.3s",
      maxWidth: "320px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.15)"
    });
    document.body.appendChild(toast);
  }
  var toastTimer = null;
  function showToast(msg, type = "info") {
    const toast = document.getElementById(TOAST_ID);
    if (!toast) return;
    const colors = { success: "#10b981", error: "#ef4444", info: "#3964FE" };
    toast.textContent = msg;
    toast.style.background = colors[type];
    toast.style.color = "#ffffff";
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
    toast.style.pointerEvents = "auto";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
    }, 3e3);
  }
  function setupMessageBridge() {
    window.addEventListener("message", (event) => {
      const iframe = document.getElementById(IFRAME_ID);
      if (!iframe || event.source !== iframe.contentWindow) return;
      const msg = event.data;
      if (!msg || !msg.type) return;
      switch (msg.type) {
        case "RESIZE":
          currentWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, msg.width || DEFAULT_WIDTH));
          applyWidth(currentWidth);
          chrome.storage.local.set({ [STORAGE_WIDTH]: currentWidth });
          break;
        case "TOGGLE":
          onToggle();
          break;
        case "TOAST":
          showToast(msg.text || "", msg.variant || "info");
          break;
        case "CREATED":
          showToast("\u8282\u70B9\u5DF2\u521B\u5EFA", "success");
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
