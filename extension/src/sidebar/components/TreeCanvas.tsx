import { useCallback, useEffect, useMemo, useRef } from 'react';
import ReactFlow, {
  Background,
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

import { useTreeStore } from '../stores/treeStore';
import { useUIStore } from '../stores/uiStore';
import { getLayoutedElements } from '../lib/layout';
import { treeApi } from '../api/client';
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
          style: { stroke: '#94a3b8', strokeWidth: 1.5 },
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

  // ── Click handlers ──

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => selectNode(node.id),
    [selectNode]
  );

  const onPaneClick = useCallback(() => selectNode(null), [selectNode]);

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
      <div className="w-full h-full flex items-center justify-center bg-red-50">
        <div className="text-center p-3">
          <div className="text-red-500 text-xs mb-1">⚠️ 加载失败</div>
          <div className="text-red-400 text-[10px] mb-2">{error}</div>
          <button
            className="px-2 py-1 bg-red-500 text-white text-[10px] rounded hover:bg-red-600"
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
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-center p-4">
          <div className="text-2xl mb-2">🌳</div>
          <div className="text-gray-400 text-xs mb-1">知识树是空的</div>
          <div className="text-gray-400 text-[10px] mb-2">
            点击底部捕获按钮添加第一个节点
          </div>
          <button
            className="px-2 py-1 text-[10px] text-gray-500 border border-gray-300 rounded hover:bg-gray-100"
            onClick={fetchAll}
          >
            🔄 刷新
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
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
        connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 1.5, strokeDasharray: '4 2' }}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
        minZoom={0.1}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}
      >
        <Background color="#e2e8f0" gap={16} />
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

      {/* Node count */}
      <div className="absolute bottom-1 left-1 pointer-events-none">
        <span className="bg-white/70 text-gray-400 px-1.5 py-0.5 rounded text-[10px]">
          {nodeIds.length} 个节点
        </span>
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
