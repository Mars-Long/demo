// == DeepSeek 对话导出（API 方案）==
// 从 dsfron tend/ds-export-done.js 移植，改为 TypeScript + fetch
// content script 中调用，same-origin 可直接请求 DeepSeek API

interface ParsedMessage {
  role: string;
  content: string;
  message_id: number | string;
  reasoning_content?: string | null;
  parent?: number;
}

function extractContent(m: any): string {
  // 1. RESPONSE fragment（优先）
  if (Array.isArray(m.fragments)) {
    const rf = m.fragments.find(
      (f: any) => typeof f === 'object' && f.type === 'RESPONSE' && f.content
    );
    if (rf) return rf.content.trim();

    // 2. 合并所有 fragment 内容
    const parts: string[] = [];
    for (const f of m.fragments) {
      if (typeof f === 'string') { parts.push(f); }
      else if (f.content) {
        parts.push(typeof f.content === 'string' ? f.content : f.content.text || '');
      }
    }
    const joined = parts.join('\n').trim();
    if (joined) return joined;
  }
  if (typeof m.content === 'string' && m.content.trim()) return m.content.trim();
  if (m.content?.text) return m.content.text.trim();
  if (typeof m.text === 'string') return m.text.trim();
  return '';
}

function extractReasoning(m: any): string | null {
  if (Array.isArray(m.fragments)) {
    const tf = m.fragments.find(
      (f: any) => typeof f === 'object' && f.type === 'THINK' && f.content
    );
    if (tf) return tf.content.trim();
  }
  if (typeof m.thinking_content === 'string') return m.thinking_content.trim();
  if (m.thinking_content?.text) return m.thinking_content.text.trim();
  return null;
}

function downloadFile(name: string, data: string, mimeType: string): void {
  const blob = new Blob([data], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url;
  el.download = name;
  el.click();
  URL.revokeObjectURL(url);
}

export async function exportConversation(): Promise<boolean> {
  try {
    // 1. 提取 session ID
    const match = location.pathname.match(/\/a\/chat\/s\/([a-f0-9-]+)/);
    if (!match) {
      console.error('❌ 导出：不在 DeepSeek 对话页面');
      return false;
    }
    const sid = match[1];

    // 2. 读取 token
    let token = '';
    try {
      const raw = localStorage.getItem('userToken');
      token = raw ? JSON.parse(raw).value || '' : '';
    } catch { /* ignore */ }

    // 3. 动态计算 headers
    const tzOffset = new Date().getTimezoneOffset() * -60; // 秒，UTC+8 → 28800

    // 4. 调用 API
    const resp = await fetch(
      `/api/v0/chat/history_messages?chat_session_id=${sid}`,
      {
        headers: {
          'x-client-bundle-id': 'com.deepseek.chat',
          'x-client-platform': 'web',
          'x-client-version': '2.2.0',
          'x-client-locale': 'zh_CN',
          'x-client-timezone-offset': String(tzOffset),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          accept: '*/*',
        },
      }
    );

    if (!resp.ok) {
      console.error(`❌ 导出：HTTP ${resp.status}`);
      return false;
    }

    const j = await resp.json();
    if (j.code !== 0) {
      console.error('❌ 导出：', j.msg);
      return false;
    }

    const msgs = j?.data?.biz_data?.chat_messages;
    const sess = j?.data?.biz_data?.chat_session;
    if (!Array.isArray(msgs) || msgs.length === 0) {
      console.error('❌ 导出：无消息');
      return false;
    }

    // 5. 解析消息
    const parsed: ParsedMessage[] = [];
    const idToIndex: Record<string, number> = {};
    const seen = new Set<string>();

    for (const m of msgs) {
      const role = (m.role || '').toLowerCase();
      if (role === 'system') continue;
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
        _parentId: m.parent_id,
      } as ParsedMessage & { _parentId: number | null });
    }

    // 6. 解析 parent 索引
    for (const x of parsed) {
      const p = x as any;
      if (p._parentId != null) {
        const parentIdx = idToIndex[String(p._parentId)];
        if (parentIdx !== undefined) {
          x.parent = parentIdx;
        }
      }
      delete (x as any)._parentId;
    }

    // 7. 统计
    const userCount = parsed.filter(m => m.role === 'user').length;
    const aiCount = parsed.filter(m => m.role === 'assistant').length;

    // 8. 生成 Markdown
    const title = (sess?.title || document.title || 'deepseek-chat').replace(/[\\/:*?"<>|]/g, '-');
    let md = `# ${title}\n\n> ${new Date().toLocaleString()} | user:${userCount} assistant:${aiCount}\n\n---\n\n`;
    let t = 1;
    for (const m of parsed) {
      if (m.role === 'user') {
        md += `## 🧑 You（${t}）\n\n${m.content}\n\n`;
        t++;
      } else {
        md += `## 🤖 DeepSeek\n\n${m.content}\n\n`;
        if (m.reasoning_content) {
          const quoted = m.reasoning_content.split('\n').map(l => `> ${l}`).join('\n');
          md += `> [!quote]\n${quoted}\n\n`;
        }
      }
      md += '---\n\n';
    }

    // 9. 生成 JSON
    const jsonOut = parsed.map(m => {
      const entry: any = { role: m.role, content: m.content, message_id: m.message_id };
      if (m.reasoning_content) entry.reasoning_content = m.reasoning_content;
      if (m.parent !== undefined) entry.parent = m.parent;
      return entry;
    });

    // 10. 下载
    const d = new Date();
    const date = d.toISOString().slice(0, 10);
    const time = d.toTimeString().slice(0, 8).replace(/:/g, '');
    const fn = `deepseek-${title.slice(0, 30)}-${date}-${time}`;
    downloadFile(`${fn}.md`, md, 'text/markdown');
    downloadFile(`${fn}.json`, JSON.stringify(jsonOut, null, 2), 'application/json');

    return true;
  } catch (e: any) {
    console.error('❌ 导出异常：', e.message || e);
    return false;
  }
}
