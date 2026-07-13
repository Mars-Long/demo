/**
 * DeepSeek 页面 DOM 解析器 — 提取最后一组问答。
 *
 * 使用多策略级联：任一成功即返回，全部失败返回 null。
 */

export interface CapturedQA {
  question: string;
  answer: string;
}

// ── strategy cascade ───────────────────────────────────────

type Strategy = () => CapturedQA | null;

const strategies: Strategy[] = [
  strategyDSMarkdown,
  strategyChatBubbles,
  strategyVisibleText,
];

export function captureConversation(): CapturedQA | null {
  for (const fn of strategies) {
    const result = fn();
    if (result && result.question.length > 2 && result.answer.length > 2) {
      return result;
    }
  }
  return null;
}

// ── strategy 1: ds-markdown blocks ─────────────────────────

function strategyDSMarkdown(): CapturedQA | null {
  const selectors = [
    '.ds-markdown',
    '[class*="ds_markdown"]',
    '[class*="markdown_body"]',
    '.md-content',
    '[class*="message"] [class*="content"]',
  ];

  for (const sel of selectors) {
    const blocks = document.querySelectorAll(sel);
    if (blocks.length < 2) continue;

    const all = Array.from(blocks).filter(
      (el) => (el.textContent?.length || 0) > 10
    );
    if (all.length < 2) continue;

    // Walk backwards to find the last user + AI pair
    // Heuristic: even-index = user, odd-index = AI (or vice versa)
    const answer = all.pop()?.textContent?.trim() || '';
    const question = all.pop()?.textContent?.trim() || '';

    if (question && answer) return { question, answer };
  }
  return null;
}

// ── strategy 2: chat bubble containers ─────────────────────

function strategyChatBubbles(): CapturedQA | null {
  // Look for user-labeled and assistant-labeled containers
  const userSelectors = [
    '[class*="user"] [class*="content"]',
    '[class*="human"] p',
    '[class*="question"]',
    '[data-role="user"]',
    '[class*="right"] [class*="bubble"]',
    '[class*="self"]',
  ];

  const aiSelectors = [
    '[class*="assistant"] [class*="content"]',
    '[class*="bot"] p',
    '[class*="answer"]',
    '[data-role="assistant"]',
    '[class*="left"] [class*="bubble"]',
  ];

  for (const uSel of userSelectors) {
    for (const aSel of aiSelectors) {
      const userEls = document.querySelectorAll(uSel);
      const aiEls = document.querySelectorAll(aSel);

      const lastUser = userEls[userEls.length - 1];
      const lastAI = aiEls[aiEls.length - 1];

      const question = lastUser?.textContent?.trim() || '';
      const answer = lastAI?.textContent?.trim() || '';

      if (question && answer) return { question, answer };
    }
  }
  return null;
}

// ── strategy 3: visible text extraction ────────────────────

function strategyVisibleText(): CapturedQA | null {
  // Find the scrollable chat area
  const containerSelectors = [
    '[class*="chat"] [class*="scroll"]',
    'main [class*="overflow"]',
    '[class*="conversation"]',
    '[class*="messages"]',
    '[class*="chat-container"]',
  ];

  let chatContainer: Element | null = null;
  for (const sel of containerSelectors) {
    chatContainer = document.querySelector(sel);
    if (chatContainer) break;
  }
  if (!chatContainer) return null;

  // Get direct children with meaningful text
  const children = Array.from(chatContainer.children);
  const texts = children
    .map((c) => c.textContent?.trim())
    .filter((t): t is string => !!t && t.length > 5);

  if (texts.length < 2) return null;

  // Last two meaningful blocks are likely AI answer + user question
  return {
    question: texts[texts.length - 2],
    answer: texts[texts.length - 1],
  };
}
