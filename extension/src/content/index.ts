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

// ── init ───────────────────────────────────────────────────

function init() {
  // Restore settings
  chrome.storage.local.get([STORAGE_WIDTH, STORAGE_AUTO], (items) => {
    if (items[STORAGE_WIDTH]) currentWidth = items[STORAGE_WIDTH];
    if (items[STORAGE_AUTO]) autoCapture = items[STORAGE_AUTO];

    injectSidebar();
    injectCaptureButton();
    injectToast();
    setupMessageBridge();
    adjustPageMargin(currentWidth);

    if (autoCapture) startObserver();
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
    transition: 'transform 0.3s ease',
    display: 'flex',
    flexDirection: 'row',
  });

  // Resize handle (left edge)
  const handle = document.createElement('div');
  handle.id = HANDLE_ID;
  Object.assign(handle.style, {
    width: '4px',
    cursor: 'col-resize',
    background: 'transparent',
    transition: 'background 0.15s',
    flexShrink: '0',
    zIndex: '10',
  });
  handle.addEventListener('mouseenter', () => { handle.style.background = '#3b82f6'; });
  handle.addEventListener('mouseleave', () => { handle.style.background = 'transparent'; });
  handle.addEventListener('mousedown', onResizeStart);

  // Iframe
  const iframe = document.createElement('iframe');
  iframe.id = IFRAME_ID;
  iframe.src = chrome.runtime.getURL('sidebar/index.html');
  Object.assign(iframe.style, {
    flex: '1',
    border: 'none',
    background: '#fff',
    boxShadow: '-2px 0 12px rgba(0,0,0,0.08)',
  });

  container.appendChild(handle);
  container.appendChild(iframe);
  document.body.appendChild(container);

  // Toggle button (pinned to bottom-left edge of sidebar)
  const toggle = document.createElement('button');
  toggle.id = TOGGLE_ID;
  toggle.textContent = '»';
  toggle.title = '收起/展开侧边栏';
  Object.assign(toggle.style, {
    position: 'fixed',
    bottom: '20px',
    right: `${currentWidth}px`,
    zIndex: '100000',
    width: '22px',
    height: '48px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px 0 0 6px',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#64748b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'right 0.3s ease',
    boxShadow: '-1px 0 4px rgba(0,0,0,0.06)',
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
  if (container) container.style.width = `${w}px`;
  if (toggle) toggle.style.right = `${w}px`;
  adjustPageMargin(visible ? w : 0);
}

// ── toggle ─────────────────────────────────────────────────

function onToggle() {
  visible = !visible;
  const container = document.getElementById(CONTAINER_ID);
  const toggle = document.getElementById(TOGGLE_ID);
  if (!container || !toggle) return;

  if (visible) {
    container.style.transform = 'translateX(0)';
    toggle.style.right = `${currentWidth}px`;
    toggle.textContent = '»';
    adjustPageMargin(currentWidth);
  } else {
    container.style.transform = `translateX(${currentWidth}px)`;
    toggle.style.right = '0';
    toggle.textContent = '«';
    adjustPageMargin(0);
  }
}

// ── page layout ────────────────────────────────────────────

function adjustPageMargin(w: number) {
  // 防止页面横向溢出
  document.documentElement.style.overflowX = w > 0 ? 'hidden' : '';

  // 直接调整 body 右边距，最通用不依赖 DeepSeek DOM 结构
  if (w > 0) {
    document.body.style.marginRight = `${w}px`;
    document.body.style.transition = 'margin-right 0.3s ease';
  } else {
    document.body.style.marginRight = '';
  }

  // 同时尝试找到 DeepSeek 内部的主布局容器
  const mainEl =
    document.querySelector('main') ||
    document.querySelector('[class*="layout"]') ||
    document.querySelector('[class*="app"]');

  if (mainEl instanceof HTMLElement && mainEl !== document.body) {
    if (w > 0) {
      mainEl.style.marginRight = `${w}px`;
      mainEl.style.transition = 'margin-right 0.3s ease';
    } else {
      mainEl.style.marginRight = '';
    }
  }
}

// ── capture button ─────────────────────────────────────────

function injectCaptureButton() {
  const btn = document.createElement('button');
  btn.id = CAPTURE_ID;
  btn.textContent = '📄 捕获到知识树';
  btn.title = '捕获当前最后一组问答';
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '24px',
    right: `${currentWidth + 20}px`,
    zIndex: '100000',
    padding: '8px 16px',
    border: 'none',
    borderRadius: '8px',
    background: '#3b82f6',
    color: '#fff',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(59,130,246,0.4)',
    transition: 'right 0.3s ease, background 0.15s',
  });
  btn.addEventListener('mouseenter', () => { btn.style.background = '#2563eb'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = '#3b82f6'; });
  btn.addEventListener('click', handleManualCapture);

  document.body.appendChild(btn);

  // Update button position when sidebar resizes
  const updater = () => {
    const btn = document.getElementById(CAPTURE_ID);
    if (btn) btn.style.right = `${(visible ? currentWidth : 0) + 20}px`;
  };
  // Hook into applyWidth
  const origApply = applyWidth;
  (window as any).__kt_applyWidth = function(w: number) {
    origApply(w);
    updater();
  };
}

function handleManualCapture() {
  const result = captureConversation();
  if (!result) {
    showToast('⚠️ 未能捕获到对话内容，请尝试在页面中先发送一条消息', 'error');
    return;
  }
  // Send to sidebar iframe
  postToSidebar({ type: 'CAPTURE_RESULT', data: result });
  showToast('✅ 已捕获，请在侧边栏中确认创建', 'success');
}

// ── toast ──────────────────────────────────────────────────

function injectToast() {
  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '80px',
    right: `${currentWidth + 20}px`,
    zIndex: '100001',
    padding: '10px 18px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '500',
    pointerEvents: 'none',
    opacity: '0',
    transform: 'translateY(10px)',
    transition: 'opacity 0.3s, transform 0.3s, right 0.3s',
    maxWidth: '320px',
  });
  document.body.appendChild(toast);
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  const toast = document.getElementById(TOAST_ID);
  if (!toast) return;
  const colors: Record<string, string> = {
    success: '#16a34a',
    error: '#dc2626',
    info: '#3b82f6',
  };
  toast.textContent = msg;
  toast.style.background = colors[type];
  toast.style.color = '#fff';
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
    showToast('🔔 检测到新问答，请在侧边栏确认', 'info');
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
        showToast(`✅ 节点已创建`, 'success');
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
