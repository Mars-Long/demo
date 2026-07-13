import { useCallback, useEffect, useRef, useState } from 'react';
import MDEditor from '@uiw/react-md-editor';
import { useTreeStore } from '../stores/treeStore';
import { useUIStore } from '../stores/uiStore';
import { chatApi } from '../api/client';

type Mode = 'ai' | 'manual';

const MIN_DOC_PCT = 15;
const MAX_DOC_PCT = 85;

export default function ChatPanel() {
  const { selectedNodeId } = useUIStore();
  const nodeMap = useTreeStore(s => s.nodes);
  const { createChild, fetchAll } = useTreeStore();

  const [mode, setMode] = useState<Mode>('ai');

  // AI mode state
  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [duration, setDuration] = useState(0);

  // Manual mode state
  const [mQuestion, setMQuestion] = useState('');
  const [mAnswer, setMAnswer] = useState('');
  const [mNotes, setMNotes] = useState('');

  // Resize state
  const [docPct, setDocPct] = useState(50);
  const dragging = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const node = selectedNodeId ? nodeMap[selectedNodeId] : null;

  // ---- AI send ----

  const handleAISend = async () => {
    if (!prompt.trim() || !selectedNodeId) return;
    setLoading(true);
    setError('');
    setReply('');
    try {
      const res = await chatApi.ask(selectedNodeId, prompt.trim());
      if (res.success) {
        setReply(res.reply_text);
        setDuration(res.duration);
        await fetchAll();
        useUIStore.getState().selectNode(res.node_id);
      } else {
        setError(res.error || '未知错误');
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  // ---- Manual create ----

  const handleManualCreate = async () => {
    if (!mQuestion.trim() || !mAnswer.trim() || !selectedNodeId) return;
    setLoading(true);
    setError('');
    try {
      const child = await createChild(selectedNodeId, mQuestion.trim(), mAnswer.trim(), mNotes.trim());
      setMQuestion('');
      setMAnswer('');
      setMNotes('');
      await fetchAll();
      useUIStore.getState().selectNode(child.frontmatter.id);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  // ---- Resize ----

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !panelRef.current) return;
      const rect = panelRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const pct = (y / rect.height) * 100;
      setDocPct(Math.max(MIN_DOC_PCT, Math.min(MAX_DOC_PCT, pct)));
    };
    const onMouseUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // ---- Empty state ----

  if (!node) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        点击画布中的节点开始对话
      </div>
    );
  }

  const hasContent = node.question || node.ai_answer || node.my_notes;

  return (
    <div className="flex flex-col h-full" ref={panelRef}>
      {/* Node info header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
        <div className="text-sm font-medium text-gray-800 truncate">
          📍 {node.frontmatter.title || '(未命名)'}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          {node.frontmatter.status} · {node.frontmatter.children.length} 个子节点
        </div>
      </div>

      {/* Document content area (resizable) */}
      <div
        className="overflow-auto border-b border-gray-100 px-4 py-3"
        style={{ height: `${docPct}%`, backgroundColor: hasContent ? '#fefce8' : '#f9fafb' }}
      >
        {hasContent ? (
          <>
            {node.question && (
              <div className="mb-2">
                <div className="text-xs font-medium text-yellow-700 mb-0.5">❓ 问题</div>
                <div className="text-sm text-gray-800 whitespace-pre-wrap">{node.question}</div>
              </div>
            )}
            {node.ai_answer && (
              <div className="mb-2">
                <div className="text-xs font-medium text-green-700 mb-0.5">✅ AI 回答</div>
                <div data-color-mode="light">
                  <MDEditor.Markdown source={node.ai_answer} />
                </div>
              </div>
            )}
            {node.my_notes && (
              <div>
                <div className="text-xs font-medium text-blue-700 mb-0.5">📝 我的笔记</div>
                <div data-color-mode="light">
                  <MDEditor.Markdown source={node.my_notes} />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-gray-400 text-center py-4">
            📄 该节点暂无内容，通过下方对话或手动录入添加
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        className="h-1.5 bg-gray-200 hover:bg-blue-400 active:bg-blue-500 cursor-row-resize shrink-0 select-none transition-colors"
        onMouseDown={onResizeMouseDown}
        title="拖动调整文档区和输入区占比"
      />

      {/* Mode tabs */}
      <div className="flex border-b border-gray-200 shrink-0">
        {([
          ['ai', '🤖 AI 对话'],
          ['manual', '✍️ 手动录入'],
        ] as [Mode, string][]).map(([m, label]) => (
          <button
            key={m}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
              mode === m
                ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => { setMode(m); setError(''); }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bottom: input area (fills remaining) */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* ---- AI Mode ---- */}
        {mode === 'ai' && (
          <>
            <div className="px-4 py-3 border-b border-gray-200 shrink-0">
              <textarea
                className="w-full border border-gray-300 rounded-lg p-2 text-sm resize-none focus:outline-none focus:border-blue-400"
                rows={3}
                placeholder="输入你的问题，AI 自动回答并生成子节点…"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAISend();
                  }
                }}
              />
              <button
                className="mt-2 w-full bg-blue-500 text-white rounded-lg py-1.5 text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors"
                onClick={handleAISend}
                disabled={loading || !prompt.trim()}
              >
                {loading ? 'AI 思考中...' : '发送'}
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                  ❌ {error}
                </div>
              )}
              {loading && (
                <div className="text-gray-400 text-sm animate-pulse">AI 正在思考...</div>
              )}
              {reply && (
                <div>
                  <div data-color-mode="light">
                    <MDEditor.Markdown source={reply} />
                  </div>
                  <div className="text-xs text-gray-400 mt-2">耗时 {duration.toFixed(1)}s</div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ---- Manual Mode ---- */}
        {mode === 'manual' && (
          <div className="flex flex-col flex-1 overflow-auto p-4 space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">❓ 问题</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg p-2 text-sm resize-none focus:outline-none focus:border-orange-400"
                rows={2}
                placeholder="输入问题..."
                value={mQuestion}
                onChange={e => setMQuestion(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">✅ 回答</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg p-2 text-sm resize-none focus:outline-none focus:border-green-400"
                rows={4}
                placeholder="输入回答内容..."
                value={mAnswer}
                onChange={e => setMAnswer(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">📝 笔记（可选，将显示在画布卡片上）</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg p-2 text-sm resize-none focus:outline-none focus:border-blue-400"
                rows={3}
                placeholder="整理自己的理解和笔记..."
                value={mNotes}
                onChange={e => setMNotes(e.target.value)}
              />
            </div>
            <button
              className="w-full bg-green-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-600 disabled:opacity-50 transition-colors"
              onClick={handleManualCreate}
              disabled={loading || !mQuestion.trim() || !mAnswer.trim()}
            >
              {loading ? '创建中...' : '📄 创建子节点'}
            </button>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                ❌ {error}
              </div>
            )}

            <div className="text-xs text-gray-400 text-center pt-2">
              手动录入不依赖 AI，问题和回答将写入 .md 文件并生成子节点
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
