import { useCallback, useEffect, useRef, useState } from 'react';
import TreeCanvas from './components/TreeCanvas';
import ChatPanel from './components/ChatPanel';
import EditorPanel from './components/EditorPanel';
import ContextPanel from './components/ContextPanel';
import { useUIStore } from './stores/uiStore';
import { useTreeStore } from './stores/treeStore';
import type { PanelMode } from './stores/uiStore';

const TABS: { mode: PanelMode; label: string }[] = [
  { mode: 'chat', label: '💬 对话' },
  { mode: 'editor', label: '✏️ 编辑' },
  { mode: 'context', label: '📋 上下文' },
];

const MIN_PANEL = 280;
const MAX_PANEL_RATIO = 1.0;

export default function App() {
  const { panelMode, setPanelMode } = useUIStore();
  const { createRoot, fetchAll, loading } = useTreeStore();
  const nodeCount = useTreeStore(s => Object.keys(s.nodes).length);
  const [newQuestion, setNewQuestion] = useState('');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [panelWidth, setPanelWidth] = useState(() => window.innerWidth * 0.65);
  const dragging = useRef(false);

  const handleCreateRoot = async () => {
    if (!newQuestion.trim()) return;
    await createRoot(newQuestion.trim());
    setNewQuestion('');
    setShowNewDialog(false);
  };

  // ---- resize ----

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const maxW = window.innerWidth * MAX_PANEL_RATIO;
      const w = window.innerWidth - e.clientX;
      setPanelWidth(Math.max(MIN_PANEL, Math.min(maxW, w)));
    };
    const onMouseUp = () => {
      dragging.current = false;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const panelComponent = {
    chat: <ChatPanel />,
    editor: <EditorPanel />,
    context: <ContextPanel />,
  }[panelMode];

  return (
    <div className="flex flex-col h-screen">
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-800">🌳 知识树</h1>
          <button
            className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition-colors"
            onClick={() => setShowNewDialog(true)}
          >
            + 新建根节点
          </button>
          <button
            className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded hover:bg-gray-200 transition-colors"
            onClick={fetchAll}
          >
            {loading ? '刷新中...' : '🔄 刷新'}
          </button>
        </div>
        <div className="text-xs text-gray-400">
          {nodeCount} 个节点
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div className="flex-1">
          <TreeCanvas />
        </div>

        {/* Resize handle */}
        <div
          className="w-1.5 cursor-col-resize bg-gray-200 hover:bg-blue-400 active:bg-blue-500 transition-colors shrink-0 select-none"
          onMouseDown={onMouseDown}
          title="拖动调整面板宽度"
        />

        {/* Right panel */}
        <div
          className="border-l border-gray-200 flex flex-col shrink-0"
          style={{ width: panelWidth }}
        >
          {/* Tab switches */}
          <div className="flex border-b border-gray-200 shrink-0">
            {TABS.map(t => (
              <button
                key={t.mode}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  panelMode === t.mode
                    ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setPanelMode(t.mode)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-hidden">
            {panelComponent}
          </div>
        </div>
      </div>

      {/* New root node dialog */}
      {showNewDialog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-96">
            <h2 className="text-lg font-bold text-gray-800 mb-4">新建根节点</h2>
            <textarea
              className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-blue-400"
              rows={3}
              placeholder="输入你的第一个问题..."
              value={newQuestion}
              onChange={e => setNewQuestion(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCreateRoot();
                }
              }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                onClick={() => setShowNewDialog(false)}
              >
                取消
              </button>
              <button
                className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                onClick={handleCreateRoot}
                disabled={!newQuestion.trim()}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
