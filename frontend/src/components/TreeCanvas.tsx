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
  const nodes = useTreeStore(s => s.nodes);
  const loading = useTreeStore(s => s.loading);
  const error = useTreeStore(s => s.error);
  const fetchAll = useTreeStore(s => s.fetchAll);
  const deleteNode = useTreeStore(s => s.deleteNode);
  const selectedNodeId = useUIStore(s => s.selectedNodeId);
  const selectNode = useUIStore(s => s.selectNode);
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
          style: { stroke: '#94a3b8', strokeWidth: 2 },
        });
      }
    }
    return { rfNodes: nArr, rfEdges: eArr };
  }, [nodeMap, selectedNodeId]);

  // Layout
  const { layoutedNodes, layoutedEdges } = useMemo(() => {
    if (rfNodes.length === 0) return { layoutedNodes: rfNodes, layoutedEdges: rfEdges };
    const laidOut = getLayoutedElements(rfNodes, rfEdges, 'TB');
    return { layoutedNodes: laidOut.nodes, layoutedEdges: laidOut.edges };
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

  // ---- Drag to connect ----

  const isValidConnection = useCallback(
    (conn: Connection) => {
      // No self-connections
      if (conn.source === conn.target) return false;
      // Source and target must both exist in our data
      if (!conn.source || !conn.target) return false;
      if (!nodeMap[conn.source] || !nodeMap[conn.target]) return false;
      return true;
    },
    [nodeMap],
  );

  const onConnect = useCallback(
    async (conn: Connection) => {
      const childId = conn.target!;   // target = child
      const parentId = conn.source!;  // source = parent
      try {
        await treeApi.connect(childId, parentId);
        await fetchAll();
      } catch {
        // silently fail, data will be refreshed
      }
    },
    [fetchAll],
  );

  // ---- Delete edge → detach ----

  const onEdgesDelete = useCallback(
    async (edges: Edge[]) => {
      for (const e of edges) {
        const childId = e.target;
        try {
          await treeApi.detach(childId);
        } catch {
          // continue
        }
      }
      await fetchAll();
    },
    [fetchAll],
  );

  // ---- Delete node ----

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
    [nodeMap, deleteNode, selectedNodeId, selectNode],
  );

  // Handlers
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    selectNode(node.id);
  }, [selectNode]);

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      const title = nodeMap[node.id]?.frontmatter.title || node.id;
      if (window.confirm(`删除节点 "${title}"？`)) {
        deleteNode(node.id, 'delete');
        if (selectedNodeId === node.id) selectNode(null);
      }
    },
    [nodeMap, deleteNode, selectedNodeId, selectNode],
  );

  const nodeTypes = useMemo(() => ({ treeNode: TreeNodeCard }), []);

  // ---- Error state ----
  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-red-50">
        <div className="text-center">
          <div className="text-red-500 text-lg mb-2">⚠️ 加载失败</div>
          <div className="text-red-400 text-sm mb-3">{error}</div>
          <button
            className="px-4 py-1.5 bg-red-500 text-white text-sm rounded hover:bg-red-600"
            onClick={fetchAll}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // ---- Empty state ----
  if (!loading && nodeIds.length === 0 && mounted.current) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-4xl mb-3">🌳</div>
          <div className="text-gray-500 text-sm mb-1">知识树是空的</div>
          <div className="text-gray-400 text-xs mb-3">
            点击顶部 <span className="bg-blue-500 text-white px-2 py-0.5 rounded text-xs">+ 新建根节点</span> 开始
          </div>
          <button
            className="px-3 py-1 text-xs text-gray-500 border border-gray-300 rounded hover:bg-gray-100"
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
        connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '6 3' }}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1.5 }}
        minZoom={0.05}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
      >
        <Background color="#e2e8f0" gap={20} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const s = nodeMap[n.id]?.frontmatter.status;
            return s === 'understood' ? '#4ade80' : s === 'needs-review' ? '#f87171' : '#facc15';
          }}
          maskColor="rgba(0,0,0,0.08)"
        />
      </ReactFlow>

      {/* Node count + hint */}
      <div className="absolute bottom-3 left-3 flex gap-2 pointer-events-none">
        <span className="bg-white/80 text-xs text-gray-500 px-2 py-0.5 rounded shadow">
          {nodeIds.length} 个节点
        </span>
        <span className="bg-white/80 text-xs text-gray-400 px-2 py-0.5 rounded shadow">
          💡 从节点底部拖拽到另一节点顶部连线 · 选中连线按 Delete 断开
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
