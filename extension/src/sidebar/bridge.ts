/**
 * postMessage 桥接 — sidebar iframe ↔ content script。
 *
 * 消息类型：
 *   sidebar → content: CAPTURE, RESIZE, TOGGLE, AUTO_TOGGLE, TOAST, CREATED
 *   content → sidebar: CAPTURE_RESULT, AUTO_CAPTURE, THEME
 */

import type { CapturedQA } from './types';

// ── sidebar → content ──

export type MsgToContent =
  | { type: 'CAPTURE' }
  | { type: 'RESIZE'; width: number }
  | { type: 'TOGGLE' }
  | { type: 'AUTO_TOGGLE'; enabled: boolean }
  | { type: 'TOAST'; text: string; variant?: 'success' | 'error' | 'info' }
  | { type: 'CREATED' };

export function sendToContent(msg: MsgToContent) {
  window.parent.postMessage(msg, '*');
}

// ── content → sidebar ──

export type MsgFromContent =
  | { type: 'CAPTURE_RESULT'; data: CapturedQA | null }
  | { type: 'AUTO_CAPTURE'; data: CapturedQA }
  | { type: 'THEME'; theme: 'light' | 'dark' };

export function listenFromContent(
  handler: (msg: MsgFromContent) => void
): () => void {
  const listener = (event: MessageEvent) => {
    const d = event.data;
    if (d && (d.type === 'CAPTURE_RESULT' || d.type === 'AUTO_CAPTURE' || d.type === 'THEME')) {
      handler(d as MsgFromContent);
    }
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
