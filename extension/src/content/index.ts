/**
 * Content Script — 注入知识树侧边栏到 chat.deepseek.com。
 *
 * 职责：
 *   1. 注入 iframe（src = chrome.runtime.getURL('sidebar/index.html')）
 *   2. 注入浮动捕获按钮 + Toast
 *   3. 可拖拽分割线（调整侧边栏宽度）
 *   4. 展开/收起切换
 *   5. postMessage 桥接（sidebar ↔ content ↔ DeepSeek DOM）
 *   6. 启动 MutationObserver 自动监听
 *   7. 主题检测 & 同步到 sidebar iframe
 */

import { captureConversation } from './parser';
import { startAutoCapture, type CapturedQA } from './observer';

// ── constants ──────────────────────────────────────────────
const MIN_WIDTH = 320;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 420;
const STORAGE_WIDTH = 'kt_sidebar_width';
const STORAGE_AUTO = 'kt_auto_capture';

// ── DOM IDs ────────────────────────────────────────────────
const CONTAINER_ID = 'kt-sidebar-container';
const IFRAME_ID = 'kt-sidebar-iframe';
const HANDLE_ID = 'kt-sidebar-handle';
const TOGGLE_ID = 'kt-sidebar-toggle';
const CAPTURE_ID = 'kt-capture-btn';
const TOAST_ID = 'kt-toast';

// ── state ──────────────────────────────────────────────────
let visible = true;
let currentWidth = DEFAULT_WIDTH;
let autoCapture = false;
let stopObserver: (() => void) | null = null;
let currentTheme: 'light' | 'dark' = 'light';

// ── theme detection ────────────────────────────────────────

function detectTheme(): 'light' | 'dark' {
  const html = document.documentElement;
  if (html.classList.contains('dark')) return 'dark';
  // DeepSeek sometimes uses a data attribute
  if (html.getAttribute('data-color-scheme') === 'dark') return 'dark';
  return 'light';
}

function syncThemeToSidebar() {
  const theme = detectTheme();
  if (theme !== currentTheme) {
    currentTheme = theme;
    postToSidebar({ type: 'THEME', theme });
  }
}

// ── init ───────────────────────────────────────────────────

function init() {
  // Detect initial theme
  currentTheme = detectTheme();

  // Restore settings
  chrome.storage.local.get([STORAGE_WIDTH, STORAGE_AUTO], (items) => {
    if (items[STORAGE_WIDTH]) currentWidth = items[STORAGE_WIDTH];
    if (items[STORAGE_AUTO]) autoCapture = items[STORAGE_AUTO];

    injectSidebar();
    injectCaptureButton();
    injectToast();
    setupMessageBridge();
    adjustPageMargin(currentWidth);
    adjustFixedElements(currentWidth);

    // Sync theme after sidebar is ready
    setTimeout(() => syncThemeToSidebar(), 500);

    if (autoCapture) startObserver();
  });

  // Watch for theme changes on the host page
  const themeObserver = new MutationObserver(() => {
    syncThemeToSidebar();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-color-scheme'],
  });

  // Also watch system preference changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    syncThemeToSidebar();
  });
}

// ── sidebar injection ──────────────────────────────────────

function injectSidebar() {
  // Container
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  Object.assign(container.style, {
    position: 'fixed',
    top: '0',
    right: '0',
    bottom: '0',
    width: `${currentWidth}px`,
    zIndex: '99999',
    transition: 'transform 0.3s ease, box-shadow 0.3s ease',
    display: 'flex',
    flexDirection: 'row',
  });

  // Resize handle (left edge) — Figma style
  const handle = document.createElement('div');
  handle.id = HANDLE_ID;
  Object.assign(handle.style, {
    width: '3px',
    cursor: 'col-resize',
    background: 'transparent',
    transition: 'background 0.2s, width 0.15s',
    flexShrink: '0',
    zIndex: '10',
    borderLeft: '1px solid transparent',
  });
  handle.addEventListener('mouseenter', () => {
    handle.style.background = '#3964FE';
    handle.style.width = '4px';
  });
  handle.addEventListener('mouseleave', () => {
    handle.style.background = 'transparent';
    handle.style.width = '3px';
  });
  handle.addEventListener('mousedown', onResizeStart);

  // Iframe — Figma style: card bg, subtle shadow
  const iframe = document.createElement('iframe');
  iframe.id = IFRAME_ID;
  iframe.src = chrome.runtime.getURL('sidebar/index.html');
  Object.assign(iframe.style, {
    flex: '1',
    border: 'none',
    background: '#f2f2f6',
    boxShadow: '-1px 0 0 rgba(0,0,0,0.06), -4px 0 16px rgba(0,0,0,0.06)',
  });

  container.appendChild(handle);
  container.appendChild(iframe);
  document.body.appendChild(container);

  // Toggle button — redesigned Figma style
  const toggle = document.createElement('button');
  toggle.id = TOGGLE_ID;
  toggle.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
  toggle.title = '收起/展开侧边栏';
  Object.assign(toggle.style, {
    position: 'fixed',
    bottom: '20px',
    right: `${currentWidth}px`,
    zIndex: '100000',
    width: '24px',
    height: '44px',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: '6px 0 0 6px',
    background: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'right 0.3s ease, background 0.15s, border-color 0.15s',
    boxShadow: '-1px 0 8px rgba(0,0,0,0.04)',
    padding: '0',
    color: '#6e6e88',
  });
  toggle.addEventListener('mouseenter', () => {
    toggle.style.background = '#3964FE';
    toggle.style.color = '#ffffff';
    toggle.style.borderColor = '#3964FE';
  });
  toggle.addEventListener('mouseleave', () => {
    toggle.style.background = '#ffffff';
    toggle.style.color = '#6e6e88';
    toggle.style.borderColor = 'rgba(0,0,0,0.08)';
  });
  toggle.addEventListener('click', onToggle);

  document.body.appendChild(toggle);
}

// ── resize ─────────────────────────────────────────────────

function onResizeStart(e: MouseEvent) {
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = currentWidth;

  function onMove(ev: MouseEvent) {
    const delta = startX - ev.clientX;
    currentWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta));
    applyWidth(currentWidth);
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    chrome.storage.local.set({ [STORAGE_WIDTH]: currentWidth });
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function applyWidth(w: number) {
  const container = document.getElementById(CONTAINER_ID);
  const toggle = document.getElementById(TOGGLE_ID);
  const captureBtn = document.getElementById(CAPTURE_ID);
  if (container) container.style.width = `${w}px`;
  if (toggle) toggle.style.right = `${w}px`;
  if (captureBtn && visible) captureBtn.style.right = `${w + 16}px`;
  adjustPageMargin(visible ? w : 0);
}

// ── toggle ─────────────────────────────────────────────────

function onToggle() {
  visible = !visible;
  const container = document.getElementById(CONTAINER_ID);
  const toggle = document.getElementById(TOGGLE_ID);
  const captureBtn = document.getElementById(CAPTURE_ID);
  if (!container || !toggle) return;

  const chevronRight = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
  const chevronLeft = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;

  if (visible) {
    container.style.transform = 'translateX(0)';
    toggle.style.right = `${currentWidth}px`;
    toggle.innerHTML = chevronRight;
    if (captureBtn) captureBtn.style.right = `${currentWidth + 16}px`;
    adjustPageMargin(currentWidth);
    adjustFixedElements(currentWidth);
  } else {
    container.style.transform = `translateX(${currentWidth}px)`;
    toggle.style.right = '0';
    toggle.innerHTML = chevronLeft;
    if (captureBtn) captureBtn.style.right = '16px';
    adjustPageMargin(0);
    adjustFixedElements(0);
  }
}

// ── page layout ────────────────────────────────────────────

function adjustPageMargin(w: number) {
  // CSS 变量，供 fixed 元素动态使用
  document.documentElement.style.setProperty('--kt-sidebar-width', w > 0 ? `${w}px` : '0px');

  if (w > 0) {
    document.documentElement.style.width = `calc(100% - ${w}px)`;
    document.documentElement.style.overflowX = 'hidden';
    document.documentElement.style.transition = 'width 0.3s ease';
  } else {
    document.documentElement.style.width = '';
    document.documentElement.style.overflowX = '';
    document.documentElement.style.transition = '';
  }
}

// 记录被修改过的 fixed 元素，以便恢复
const _fixedAdjusted = new WeakSet<HTMLElement>();

function adjustFixedElements(w: number) {
  const candidates = document.querySelectorAll(
    'div, button, nav, aside, header, [class*="fixed"], [class*="sidebar"], [class*="panel"]'
  );
  for (const el of candidates) {
    if (!(el instanceof HTMLElement)) continue;
    // 排除侧边栏自身的元素
    if (el.id === CONTAINER_ID || el.id === TOGGLE_ID || el.id === CAPTURE_ID || el.id === TOAST_ID) continue;
    if (el.closest(`#${CONTAINER_ID}`)) continue;
    const s = window.getComputedStyle(el);
    if (s.position !== 'fixed') continue;

    const right = parseFloat(s.right);
    if (isNaN(right)) continue;

    if (w > 0) {
      if (right < w + 30) {
        // 用 CSS 变量，后续 resize 自动生效
        el.style.right = `calc(${right}px + var(--kt-sidebar-width))`;
        _fixedAdjusted.add(el);
      }
    } else {
      if (_fixedAdjusted.has(el)) {
        el.style.right = '';
        _fixedAdjusted.delete(el);
      }
    }
  }
}

// ── capture button ─────────────────────────────────────────

function injectCaptureButton() {
  const btn = document.createElement('button');
  btn.id = CAPTURE_ID;
  btn.innerHTML = `<span style="display:flex;align-items:center;gap:6px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>捕获对话</span>`;
  btn.title = '捕获当前最后一组问答';
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '80px',
    right: `${currentWidth + 16}px`,
    zIndex: '100000',
    padding: '8px 16px',
    border: 'none',
    borderRadius: '8px',
    background: '#3964FE',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(57,100,254,0.35)',
    transition: 'right 0.3s ease, background 0.15s, transform 0.15s, box-shadow 0.15s',
    fontFamily: 'DM Sans, system-ui, sans-serif',
  });
  btn.addEventListener('mouseenter', () => {
    btn.style.background = '#2b54e8';
    btn.style.transform = 'translateY(-1px)';
    btn.style.boxShadow = '0 6px 18px rgba(57,100,254,0.4)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = '#3964FE';
    btn.style.transform = 'translateY(0)';
    btn.style.boxShadow = '0 4px 14px rgba(57,100,254,0.35)';
  });
  btn.addEventListener('click', handleManualCapture);

  document.body.appendChild(btn);
}

function handleManualCapture() {
  const result = captureConversation();
  if (!result) {
    showToast('未能捕获到对话内容，请先发送一条消息', 'error');
    return;
  }
  postToSidebar({ type: 'CAPTURE_RESULT', data: result });
  showToast('已捕获，请在侧边栏确认创建', 'success');
}

// ── toast ──────────────────────────────────────────────────

function injectToast() {
  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '140px',
    right: `${currentWidth + 16}px`,
    zIndex: '100001',
    padding: '10px 18px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '500',
    fontFamily: 'DM Sans, system-ui, sans-serif',
    pointerEvents: 'none',
    opacity: '0',
    transform: 'translateY(10px)',
    transition: 'opacity 0.3s, transform 0.3s, right 0.3s',
    maxWidth: '320px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
  });
  document.body.appendChild(toast);
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  const toast = document.getElementById(TOAST_ID);
  if (!toast) return;
  const colors: Record<string, string> = { success: '#10b981', error: '#ef4444', info: '#3964FE' };
  toast.textContent = msg;
  toast.style.background = colors[type];
  toast.style.color = '#ffffff';
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  toast.style.pointerEvents = 'auto';

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
  }, 3000);
}

// ── auto capture observer ──────────────────────────────────

function startObserver() {
  if (stopObserver) return;
  stopObserver = startAutoCapture((qa: CapturedQA) => {
    postToSidebar({ type: 'AUTO_CAPTURE', data: qa });
    showToast('检测到新问答，请在侧边栏确认', 'info');
  });
}

function stopObserverFn() {
  if (stopObserver) {
    stopObserver();
    stopObserver = null;
  }
}

// ── message bridge ─────────────────────────────────────────

function setupMessageBridge() {
  window.addEventListener('message', (event) => {
    const iframe = document.getElementById(IFRAME_ID) as HTMLIFrameElement;
    if (!iframe || event.source !== iframe.contentWindow) return;

    const msg = event.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'CAPTURE': {
        const result = captureConversation();
        postToSidebar({ type: 'CAPTURE_RESULT', data: result });
        break;
      }
      case 'RESIZE':
        currentWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, msg.width || DEFAULT_WIDTH));
        applyWidth(currentWidth);
        chrome.storage.local.set({ [STORAGE_WIDTH]: currentWidth });
        break;
      case 'TOGGLE':
        onToggle();
        break;
      case 'AUTO_TOGGLE': {
        autoCapture = msg.enabled;
        chrome.storage.local.set({ [STORAGE_AUTO]: autoCapture });
        if (autoCapture) startObserver();
        else stopObserverFn();
        break;
      }
      case 'TOAST':
        showToast(msg.text || '', msg.variant || 'info');
        break;
      case 'CREATED':
        showToast('节点已创建', 'success');
        break;
    }
  });
}

function postToSidebar(data: any) {
  const iframe = document.getElementById(IFRAME_ID) as HTMLIFrameElement;
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage(data, '*');
  }
}

// ── start ──────────────────────────────────────────────────
init();
