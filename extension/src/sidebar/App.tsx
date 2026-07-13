/**
 * Sidebar React App — 侧边栏主布局。
 *
 * 复用现有前端的 TreeCanvas + TreeNodeCard + Zustand stores，
 * 将 ChatPanel/EditorPanel 替换为 CaptureBar（捕获按钮 + 自动模式）。
 */

import { useEffect, useState, useCallback } from 'react';
import { ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';

import TreeCanvas from './components/TreeCanvas';
import CaptureBar from './components/CaptureBar';
import { useTreeStore } from './stores/treeStore';
import { useUIStore } from './stores/uiStore';
import { listenFromContent, sendToContent } from './bridge';
import { nodeApi } from './api/client';
import type { CapturedQA } from './types';

export default function SidebarApp() {
  const fetchAll = useTreeStore((s) => s.fetchAll);
  const error = useTreeStore((s) => s.error);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const selectNode = useUIStore((s) => s.selectNode);
  const nodeMap = useTreeStore((s) => s.nodes);

  // Capture state
  const [captureState, setCaptureState] = useState<
    'idle' | 'capturing' | 'preview' | 'creating' | 'done'
  >('idle');
  const [capturedData, setCapturedData] = useState<CapturedQA | null>(null);
  const [autoCapture, setAutoCapture] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Initial fetch
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Listen for postMessage from content script
  useEffect(() => {
    return listenFromContent((msg) => {
      switch (msg.type) {
        case 'CAPTURE_RESULT': {
          if (msg.data) {
            setCapturedData(msg.data);
            setCaptureState('preview');
          } else {
            setCaptureState('idle');
            showToast('⚠️ 未能捕获到对话内容', 'error');
          }
          break;
        }
        case 'AUTO_CAPTURE': {
          if (msg.data) {
            setCapturedData(msg.data);
            setCaptureState('preview');
          }
          break;
        }
      }
    });
  }, []);

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Manual capture
  const handleManualCapture = () => {
    setCaptureState('capturing');
    sendToContent({ type: 'CAPTURE' });
  };

  // Toggle auto capture
  const handleAutoToggle = (enabled: boolean) => {
    setAutoCapture(enabled);
    sendToContent({ type: 'AUTO_TOGGLE', enabled });
  };

  // Create node from captured data
  const handleCreateNode = async () => {
    if (!capturedData) {
      showToast('⚠️ 没有可保存的对话内容', 'error');
      setCaptureState('idle');
      return;
    }

    setCaptureState('creating');
    try {
      if (selectedNodeId) {
        // 有选中父节点 → 创建为子节点
        const res = await nodeApi.create(capturedData.question, {
          parentId: selectedNodeId,
          aiAnswer: capturedData.answer,
        });
        await fetchAll();
        selectNode(res.node.frontmatter.id);
      } else {
        // 无父节点 → 以本次对话为根节点
        const res = await nodeApi.create(capturedData.question, {
          aiAnswer: capturedData.answer,
        });
        await fetchAll();
        selectNode(res.node.frontmatter.id);
      }
      setCaptureState('done');
      showToast('✅ 节点已创建', 'success');
      sendToContent({ type: 'CREATED' });
      setTimeout(() => setCaptureState('idle'), 2000);
    } catch (e: any) {
      showToast(`❌ 创建失败: ${e.message}`, 'error');
      setCaptureState('idle');
    }
  };

  // Cancel capture
  const handleCancel = () => {
    setCaptureState('idle');
    setCapturedData(null);
  };

  const selectedNode = selectedNodeId ? nodeMap[selectedNodeId] : null;

  // ── error state ──
  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-red-50">
        <div className="text-center p-4">
          <div className="text-red-500 text-sm mb-2">⚠️ 加载失败</div>
          <div className="text-red-400 text-xs mb-3">{error}</div>
          <button
            className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
            onClick={fetchAll}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white text-gray-800">
      {/* Header */}
      <header className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-gray-50 shrink-0">
        <h1 className="text-xs font-bold text-gray-600">🌳 知识树</h1>
        <div className="flex items-center gap-1">
          <button
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            onClick={() => sendToContent({ type: 'TOGGLE' })}
            title="收起侧边栏"
          >
            ✕
          </button>
        </div>
      </header>

      {/* Capture bar */}
      <CaptureBar
        state={captureState}
        data={capturedData}
        autoCapture={autoCapture}
        selectedNode={selectedNode}
        onManualCapture={handleManualCapture}
        onAutoToggle={handleAutoToggle}
        onCreate={handleCreateNode}
        onCancel={handleCancel}
      />

      {/* Main area: canvas */}
      <div className="flex-1 overflow-hidden">
        <ReactFlowProvider>
          <TreeCanvas />
        </ReactFlowProvider>
      </div>

      {/* Bottom: selected node info */}
      <div className="border-t border-gray-200 px-3 py-2 bg-gray-50 shrink-0">
        {selectedNode ? (
          <div>
            <div className="text-xs font-medium text-gray-700 truncate">
              📍 {selectedNode.frontmatter.title || '(未命名)'}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-2">
              <span>{selectedNode.frontmatter.status === 'understood' ? '✅' : selectedNode.frontmatter.status === 'needs-review' ? '🔄' : '🔍'} {selectedNode.frontmatter.status}</span>
              <span>{selectedNode.frontmatter.children.length} 个子节点</span>
              {selectedNode.frontmatter.summary && (
                <span className="truncate">· {selectedNode.frontmatter.summary.slice(0, 60)}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-400 text-center">
            点击节点选择，然后用 AI 对话或手动捕获
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`absolute bottom-12 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-xs font-medium text-white shadow-lg transition-opacity z-50 ${
            toast.type === 'success' ? 'bg-green-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
