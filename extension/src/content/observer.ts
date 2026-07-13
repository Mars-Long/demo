/**
 * MutationObserver 自动捕获 — 监听 DeepSeek 对话变化，
 * 检测到新的完整 Q&A 对时触发回调。
 */

export interface CapturedQA {
  question: string;
  answer: string;
}

type Callback = (qa: CapturedQA) => void;

// ── main entry ─────────────────────────────────────────────

export function startAutoCapture(
  onNewQA: Callback
): () => void {
  const chatContainer = findChatContainer();
  if (!chatContainer) {
    console.warn('[知识树] 未找到 DeepSeek 对话容器，自动捕获未启动');
    return () => {};
  }

  let processedCount = countMessages(chatContainer);
  let streamEndTimer: ReturnType<typeof setTimeout> | null = null;
  let lastContentLength = 0;

  const observer = new MutationObserver(() => {
    const messages = getMessageBlocks(chatContainer);
    const currentCount = messages.length;

    // Check if new message appeared
    if (currentCount > processedCount) {
      // Detect stream end via debounce
      const totalLength = chatContainer.textContent?.length || 0;

      if (streamEndTimer) clearTimeout(streamEndTimer);

      if (totalLength !== lastContentLength) {
        // Still streaming — wait for silence
        lastContentLength = totalLength;
        streamEndTimer = setTimeout(() => {
          // Streaming has stopped — check for new complete Q&A pair
          const updated = getMessageBlocks(chatContainer);
          if (updated.length >= 2) {
            const lastQA = extractLastQA(updated);
            if (lastQA) {
              onNewQA(lastQA);
            }
          }
          processedCount = updated.length;
        }, 1500); // 1.5s silence = stream finished
      }
    }

    // Also check for action buttons (copy/like) appearing = stream finished
    const actionBar = chatContainer.querySelector(
      '[class*="action"], [class*="toolbar"], button[aria-label*="复制"], [class*="copy"]'
    );
    if (actionBar && currentCount > processedCount && !streamEndTimer) {
      const messages = getMessageBlocks(chatContainer);
      const lastQA = extractLastQA(messages);
      if (lastQA) {
        onNewQA(lastQA);
      }
      processedCount = currentCount;
    }
  });

  observer.observe(chatContainer, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  return () => {
    observer.disconnect();
    if (streamEndTimer) clearTimeout(streamEndTimer);
  };
}

// ── helpers ────────────────────────────────────────────────

function findChatContainer(): Element | null {
  const selectors = [
    '[class*="chat"] [class*="scroll"]',
    'main [class*="overflow"]',
    '[class*="conversation"]',
    '[class*="messages"]',
    '[class*="chat-container"]',
    'main',
    '#root > div > div',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    // Pick the largest scrollable container
    if (el && el.scrollHeight > 200) return el;
  }
  return null;
}

function getMessageBlocks(container: Element): Element[] {
  // Get direct children that contain meaningful text
  return Array.from(container.querySelectorAll(
    '.ds-markdown, [class*="message"], [class*="bubble"], [class*="turn"], [class*="chat-item"]'
  )).filter(el => (el.textContent?.length || 0) > 5);
}

function countMessages(container: Element): number {
  return getMessageBlocks(container).length;
}

function extractLastQA(messages: Element[]): CapturedQA | null {
  if (messages.length < 2) return null;

  // Take last two substantive blocks
  const substantive = messages.filter(
    (el) => (el.textContent?.length || 0) > 10
  );
  if (substantive.length < 2) return null;

  const answer = substantive.pop()?.textContent?.trim() || '';
  const question = substantive.pop()?.textContent?.trim() || '';

  if (question.length > 2 && answer.length > 2) {
    return { question, answer };
  }
  return null;
}
