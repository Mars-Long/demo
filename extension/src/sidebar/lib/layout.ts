/**
 * Simple tree layout for ReactFlow — no external dependencies.
 *
 * Uses a recursive vertical (top-to-bottom) layout:
 *   - Root nodes at top
 *   - Children centered under their parent
 *   - Gaps between sibling subtrees
 */

import type { Node, Edge } from 'reactflow';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
const H_GAP = 30;
const V_GAP = 60;

interface Size {
  width: number;
  height: number;
}

/**
 * Compute positions for nodes arranged as a tree (TB direction).
 * Works for forests (multiple root nodes).
 */
export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  _direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes: [], edges };

  // Build adjacency: parentId → childIds
  const childrenMap = new Map<string, string[]>();
  const parentMap = new Map<string, string | null>();

  for (const node of nodes) {
    childrenMap.set(node.id, []);
    parentMap.set(node.id, null);
  }

  for (const edge of edges) {
    const list = childrenMap.get(edge.source);
    if (list) list.push(edge.target);
    parentMap.set(edge.target, edge.source);
  }

  // Find roots (nodes with no parent in the node set)
  const roots = nodes.filter((n) => {
    const parent = parentMap.get(n.id);
    return parent === null || !nodes.some((other) => other.id === parent);
  });

  if (roots.length === 0) {
    // Fallback: first node is root
    roots.push(nodes[0]);
  }

  // Compute subtree sizes and positions
  const sizeMap = new Map<string, { width: number; height: number }>();
  const posMap = new Map<string, { x: number; y: number }>();

  // Post-order: compute subtree sizes
  function computeSize(nodeId: string): { width: number; height: number } {
    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0) {
      const s = { width: NODE_WIDTH, height: NODE_HEIGHT };
      sizeMap.set(nodeId, s);
      return s;
    }

    let totalWidth = 0;
    let maxChildHeight = 0;
    const childSizes: { width: number; height: number }[] = [];

    for (const childId of children) {
      const cs = computeSize(childId);
      childSizes.push(cs);
      totalWidth += cs.width;
      if (cs.height > maxChildHeight) maxChildHeight = cs.height;
    }

    totalWidth += H_GAP * (children.length - 1);
    const width = Math.max(NODE_WIDTH, totalWidth);
    const height = NODE_HEIGHT + V_GAP + maxChildHeight;

    const s = { width, height };
    sizeMap.set(nodeId, s);
    return s;
  }

  // Pre-order: assign positions
  function assignPos(nodeId: string, x: number, y: number) {
    posMap.set(nodeId, { x, y });

    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0) return;

    const mySize = sizeMap.get(nodeId)!;
    const childY = y + NODE_HEIGHT + V_GAP;

    // Center children under parent
    let totalChildWidth = 0;
    for (const childId of children) {
      totalChildWidth += sizeMap.get(childId)!.width;
    }
    totalChildWidth += H_GAP * (children.length - 1);

    let cx = x + mySize.width / 2 - totalChildWidth / 2;
    for (const childId of children) {
      const cs = sizeMap.get(childId)!;
      assignPos(childId, cx + cs.width / 2 - NODE_WIDTH / 2, childY);
      cx += cs.width + H_GAP;
    }
  }

  // Layout each root tree side by side
  let rootX = 20;
  for (const root of roots) {
    computeSize(root.id);
    const rs = sizeMap.get(root.id)!;
    assignPos(root.id, rootX + rs.width / 2 - NODE_WIDTH / 2, 20);
    rootX += rs.width + H_GAP * 2;
  }

  return {
    nodes: nodes.map((node) => {
      const pos = posMap.get(node.id);
      return pos ? { ...node, position: pos } : node;
    }),
    edges,
  };
}
