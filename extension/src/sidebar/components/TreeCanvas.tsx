import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Controls,
  MiniMap,
  Node,
  Edge,
  Connection,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Plus, Link2, Trash2, X } from 'lucide-react';

import { useTreeStore } from '../stores/treeStore';
import { useUIStore } from '../stores/uiStore';
import { getLayoutedElements } from '../lib/layout';
import { treeApi } from '../api/client';
import { cn } from '../lib/utils';
import TreeNodeCard from './TreeNodeCard';

function FlowCanvas() {
  const nodes = useTreeStore((s) => s.nodes);
  const loading = useTreeStore((s) => s.loading);
  const error = useTreeStore((s) => s.error);
  const fetchAll = useTreeStore((s) => s.fetchAll);
  const deleteNode = useTreeStore((s) => s.deleteNode);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const selectNode = useUIStore((s) => s.selectNode);
  const mounted = useRef(false);

  // Canvas toolbar state
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);

  const nodeMap = nodes;
  const nodeIds = Object.keys(nodeMap);

  // Build ReactFlow nodes and edges
  const { rfNodes, rfEdges } = useMemo(() => {
    const nArr: Node[] = [];
    const eArr: Edge[] = [];
    const added = new Set<string>();

    for (const [id, n] of Object.entries(nodeMap)) {
      if (!added.has(id)) {
        nArr.push({
          id,
          type: 'treeNode',
          position: { x: 0, y: 0 },
          data: { node: n, isSelected: id === selectedNodeId },
        });
        added.add(id);
      }
      if (n.frontmatter.parent && nodeMap[n.frontmatter.parent]) {
        eArr.push({
          id: `${n.frontmatter.parent}->${id}`,
          source: n.frontmatter.parent,
          target: id,
          type: 'smoothstep',
          animated: true,
          style: { stroke: 'var(--muted-foreground)', strokeWidth: 1.5, opacity: 0.6 },
        });
      }
    }
    return { rfNodes: nArr, rfEdges: eArr };
  }, [nodeMap, selectedNodeId]);

  // Layout
  const { layoutedNodes, layoutedEdges } = useMemo(() => {
    if (rfNodes.length === 0) return { layoutedNodes: rfNodes, layoutedEdges: rfEdges };
    return getLayoutedElements(rfNodes, rfEdges, 'TB');
  }, [rfNodes, rfEdges]);

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Sync layout → React Flow state
  useEffect(() => {
    setFlowNodes(layoutedNodes);
    setFlowEdges(layoutedEdges);
  }, [layoutedNodes, layoutedEdges, setFlowNodes, setFlowEdges]);

  // Initial fetch
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      fetchAll();
    }
  }, [fetchAll]);

  // Escape handler for connect mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConnectMode(false);
        setConnectFrom(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Drag to connect ──

  const isValidConnection = useCallback(
    (conn: Connection) => {
      if (conn.source === conn.target) return false;
      if (!conn.source || !conn.target) return false;
      if (!nodeMap[conn.source] || !nodeMap[conn.target]) return false;
      return true;
    },
    [nodeMap]
  );

  const onConnect = useCallback(
    async (conn: Connection) => {
      const childId = conn.target!;
      const parentId = conn.source!;
      try {
        await treeApi.connect(childId, parentId);
        await fetchAll();
      } catch {
        // silently fail
      }
    },
    [fetchAll]
  );

  // ── Delete edge → detach ──

  const onEdgesDelete = useCallback(
    async (edges: Edge[]) => {
      for (const e of edges) {
        try { await treeApi.detach(e.target); } catch { /* continue */ }
      }
      await fetchAll();
    },
    [fetchAll]
  );

  // ── Delete node ──

  const onNodesDelete = useCallback(
    async (nodes: Node[]) => {
      for (const n of nodes) {
        const title = nodeMap[n.id]?.frontmatter.title || n.id;
        if (window.confirm(`删除节点 "${title}"？`)) {
          await deleteNode(n.id, 'delete');
          if (selectedNodeId === n.id) selectNode(null);
        }
      }
    },
    [nodeMap, deleteNode, selectedNodeId, selectNode]
  );

  // ── Click handler for connect mode ──

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (connectMode) {
        if (!connectFrom) {
          setConnectFrom(node.id);
        } else if (connectFrom !== node.id) {
          // Check for duplicate edge
          const exists = flowEdges.some(
            (ed) => ed.source === connectFrom && ed.target === node.id
          );
          if (!exists) {
            treeApi.connect(node.id, connectFrom).then(() => fetchAll()).catch(() => {});
          }
          setConnectFrom(null);
          setConnectMode(false);
        }
      } else {
        selectNode(node.id === selectedNodeId ? null : node.id);
      }
    },
    [connectMode, connectFrom, flowEdges, fetchAll, selectNode, selectedNodeId]
  );

  const onPaneClick = useCallback(() => {
    if (!connectMode) {
      selectNode(null);
    }
  }, [connectMode, selectNode]);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      const title = nodeMap[node.id]?.frontmatter.title || node.id;
      if (window.confirm(`删除节点 "${title}"？`)) {
        deleteNode(node.id, 'delete');
        if (selectedNodeId === node.id) selectNode(null);
      }
    },
    [nodeMap, deleteNode, selectedNodeId, selectNode]
  );

  const nodeTypes = useMemo(() => ({ treeNode: TreeNodeCard }), []);

  // ── Error state ──
  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-destructive/5">
        <div className="text-center p-3">
          <div className="text-destructive text-xs font-medium mb-1">加载失败</div>
          <div className="text-muted-foreground text-[10px] mb-2">{error}</div>
          <button
            className="px-2 py-1 bg-destructive text-destructive-foreground text-[10px] rounded hover:opacity-90"
            onClick={fetchAll}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // ── Empty state ──
  if (!loading && nodeIds.length === 0 && mounted.current) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/30">
        <div className="text-center p-4">
          <div className="text-2xl mb-2">🌳</div>
          <div className="text-muted-foreground text-xs mb-1">知识树是空的</div>
          <div className="text-muted-foreground text-[10px] mb-2">
            点击底部捕获按钮添加第一个节点
          </div>
          <button
            className="px-2 py-1 text-[10px] text-muted-foreground border border-border rounded hover:bg-muted transition-colors"
            onClick={fetchAll}
          >
            刷新
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar — Figma style */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-card/60 shrink-0">
        <button
          onClick={() => {
            const newId = `n_${Date.now()}`;
            // Node creation is handled via API in this app
            // Just a visual hint for now — actual creation is via capture
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded bg-primary text-primary-foreground hover:opacity-90 active:opacity-80 transition-opacity"
          title="通过底部捕获按钮添加节点"
        >
          <Plus size={11} strokeWidth={2.5} />
          添加节点
        </button>

        <button
          onClick={() => {
            setConnectMode((v) => !v);
            setConnectFrom(null);
          }}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors',
            connectMode
              ? 'bg-primary/12 text-primary border border-primary/25'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          )}
        >
          <Link2 size={11} strokeWidth={2.5} />
          {connectMode
            ? connectFrom
              ? '选择子节点…'
              : '选择父节点…'
            : '连线'}
        </button>

        {connectMode && (
          <button
            onClick={() => { setConnectMode(false); setConnectFrom(null); }}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="取消 (Esc)"
          >
            <X size={11} />
          </button>
        )}

        {selectedNodeId && !connectMode && (
          <button
            onClick={() => {
              const title = nodeMap[selectedNodeId]?.frontmatter.title || selectedNodeId;
              if (window.confirm(`删除节点 "${title}"？`)) {
                deleteNode(selectedNodeId, 'delete');
                selectNode(null);
              }
            }}
            className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded text-destructive hover:bg-destructive/8 transition-colors"
          >
            <Trash2 size={11} strokeWidth={2.5} />
            删除
          </button>
        )}
      </div>

      {/* Canvas with dot-grid */}
      <div className="flex-1 relative bg-background overflow-hidden">
        {/* SVG Dot-grid background */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ zIndex: 0 }}
        >
          <defs>
            <pattern
              id="dotgrid"
              x="0"
              y="0"
              width="22"
              height="22"
              patternUnits="userSpaceOnUse"
            >
              <circle
                cx="1"
                cy="1"
                r="0.9"
                style={{ fill: 'var(--border)' }}
                opacity="0.8"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dotgrid)" />
        </svg>

        {/* React Flow */}
        <div className="absolute inset-0" style={{ zIndex: 1 }}>
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodeContextMenu={onNodeContextMenu}
            nodeTypes={nodeTypes}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onEdgesDelete={onEdgesDelete}
            onNodesDelete={onNodesDelete}
            deleteKeyCode={['Delete', 'Backspace']}
            edgesFocusable={true}
            edgesUpdatable={false}
            connectionLineStyle={{ stroke: 'var(--primary)', strokeWidth: 1.5, strokeDasharray: '4 2' }}
            fitView
            fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
            minZoom={0.1}
            maxZoom={1.5}
            defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}
          >
            <Controls className="!scale-75 !origin-bottom-left" />
            <MiniMap
              nodeColor={(n) => {
                const s = nodeMap[n.id]?.frontmatter.status;
                return s === 'understood' ? '#4ade80' : s === 'needs-review' ? '#f87171' : '#facc15';
              }}
              maskColor="rgba(0,0,0,0.06)"
              style={{ width: 80, height: 56 }}
            />
          </ReactFlow>
        </div>

        {/* Connect mode hint */}
        {connectMode && (
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium shadow-lg pointer-events-none"
            style={{ zIndex: 10 }}
          >
            {connectFrom ? '点击子节点完成连线' : '点击父节点开始连线'}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-2.5 px-3 py-2 border-t border-border text-xs text-muted-foreground bg-card/40 shrink-0">
        <span>{nodeIds.length} 个节点</span>
        <span className="opacity-30">·</span>
        <span>{(flowEdges ?? []).length} 条连线</span>
        {hoveredEdge && (
          <>
            <span className="opacity-30">·</span>
            <span className="text-destructive">点击删除</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1 opacity-40">
          <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">Del</kbd>
          <span>删除</span>
        </div>
      </div>
    </div>
  );
}

export default function TreeCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}
