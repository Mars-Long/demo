/**
 * Sidebar React App — 侧边栏主布局 (Figma 风格)。
 *
 * 复用现有前端的 TreeCanvas + TreeNodeCard + Zustand stores，
 * 将 ChatPanel/EditorPanel 替换为 CaptureBar（捕获按钮 + 自动模式）。
 */

import { useEffect, useState, useCallback } from 'react';
import { ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import { Network, X, Sun, Moon, Monitor } from 'lucide-react';

import TreeCanvas from './components/TreeCanvas';
import CaptureBar from './components/CaptureBar';
import { useTreeStore } from './stores/treeStore';
import { useUIStore } from './stores/uiStore';
import { listenFromContent, sendToContent } from './bridge';
import { nodeApi } from './api/client';
import type { CapturedQA } from './types';

type Theme = 'light' | 'dark' | 'system';

export default function SidebarApp() {
  const fetchAll = useTreeStore((s) => s.fetchAll);
  const error = useTreeStore((s) => s.error);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const selectNode = useUIStore((s) => s.selectNode);
  const nodeMap = useTreeStore((s) => s.nodes);
  const nodeCount = Object.keys(nodeMap).length;

  // Theme — defaults to system, syncs from content script
  const [theme, setTheme] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );

  // Capture state
  const [captureState, setCaptureState] = useState<
    'idle' | 'capturing' | 'preview' | 'creating' | 'done'
  >('idle');
  const [capturedData, setCapturedData] = useState<CapturedQA | null>(null);
  const [autoCapture, setAutoCapture] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Apply theme class to root
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      root.classList.toggle('dark', mq.matches);
      setResolvedTheme(mq.matches ? 'dark' : 'light');
      const handler = (e: MediaQueryListEvent) => {
        root.classList.toggle('dark', e.matches);
        setResolvedTheme(e.matches ? 'dark' : 'light');
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      root.classList.toggle('dark', theme === 'dark');
      setResolvedTheme(theme);
    }
  }, [theme]);

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
            showToast('未能捕获到对话内容', 'error');
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
        case 'THEME': {
          // Follow host page theme
          setTheme(msg.theme);
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
      showToast('没有可保存的对话内容', 'error');
      setCaptureState('idle');
      return;
    }

    setCaptureState('creating');
    try {
      if (selectedNodeId) {
        const res = await nodeApi.create(capturedData.question, {
          parentId: selectedNodeId,
          aiAnswer: capturedData.answer,
        });
        await fetchAll();
        selectNode(res.node.frontmatter.id);
      } else {
        const res = await nodeApi.create(capturedData.question, {
          aiAnswer: capturedData.answer,
        });
        await fetchAll();
        selectNode(res.node.frontmatter.id);
      }
      setCaptureState('done');
      showToast('节点已创建', 'success');
      sendToContent({ type: 'CREATED' });
      setTimeout(() => setCaptureState('idle'), 2000);
    } catch (e: any) {
      showToast(`创建失败: ${e.message}`, 'error');
      setCaptureState('idle');
    }
  };

  // Cancel capture
  const handleCancel = () => {
    setCaptureState('idle');
    setCapturedData(null);
  };

  const selectedNode = selectedNodeId ? nodeMap[selectedNodeId] : null;

  // Cycle theme: system → light → dark → system
  const cycleTheme = () => {
    setTheme((prev) => {
      if (prev === 'system') return 'light';
      if (prev === 'light') return 'dark';
      return 'system';
    });
  };

  const themeIcon = {
    light: <Sun size={13} />,
    dark: <Moon size={13} />,
    system: <Monitor size={13} />,
  }[theme];

  const themeLabel = { light: '浅色', dark: '深色', system: '跟随系统' }[theme];

  // ── error state ──
  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-destructive/5">
        <div className="text-center p-4">
          <div className="text-destructive text-sm font-medium mb-2">加载失败</div>
          <div className="text-muted-foreground text-xs mb-3">{error}</div>
          <button
            className="px-3 py-1.5 bg-destructive text-destructive-foreground text-xs font-medium rounded-md hover:opacity-90 transition-opacity"
            onClick={fetchAll}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header — Figma breadcrumb style */}
      <header className="flex items-center justify-between px-4 h-11 border-b border-border bg-card/60 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-primary flex items-center justify-center shrink-0">
            <Network size={11} className="text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="text-xs font-semibold tracking-tight">知识树</span>
          <span className="text-muted-foreground/40">›</span>
          <span className="text-xs text-muted-foreground">DeepSeek</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Theme toggle */}
          <button
            onClick={cycleTheme}
            title={themeLabel}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {themeIcon}
          </button>

          {/* Close sidebar */}
          <button
            onClick={() => sendToContent({ type: 'TOGGLE' })}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="收起侧边栏"
          >
            <X size={13} />
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

      {/* Footer status bar — Figma style */}
      <div className="flex items-center gap-2.5 px-3 py-2 border-t border-border text-xs text-muted-foreground bg-card/40 shrink-0">
        {selectedNode ? (
          <>
            <span className="text-primary font-medium">📍</span>
            <span className="text-foreground font-medium text-xs truncate max-w-[140px]">
              {selectedNode.frontmatter.title || '(未命名)'}
            </span>
            <span className="opacity-30">·</span>
            <span>
              {selectedNode.frontmatter.status === 'understood' ? '✅' : selectedNode.frontmatter.status === 'needs-review' ? '🔄' : '🔍'}{' '}
              {selectedNode.frontmatter.status === 'understood' ? '已理解' : selectedNode.frontmatter.status === 'needs-review' ? '需复习' : '探索中'}
            </span>
            <span className="opacity-30">·</span>
            <span>{selectedNode.frontmatter.children?.length ?? 0} 个子节点</span>
          </>
        ) : (
          <>
            <span>{nodeCount} 个节点</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1 opacity-40">
          <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">Esc</kbd>
          <span>取消</span>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`absolute bottom-14 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md text-xs font-medium text-white shadow-lg transition-opacity z-50 ${
            toast.type === 'success' ? 'bg-emerald-500' : toast.type === 'error' ? 'bg-destructive' : 'bg-primary'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
