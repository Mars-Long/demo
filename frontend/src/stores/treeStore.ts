import { create } from 'zustand';
import type { NodeFull } from '../types';
import { nodeApi, treeApi } from '../api/client';

interface TreeState {
  nodes: Record<string, NodeFull>;
  loading: boolean;
  error: string | null;

  fetchAll: () => Promise<void>;
  addNode: (node: NodeFull) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateNode: (id: string, data: Record<string, any>) => Promise<void>;
  deleteNode: (id: string, cascade?: string) => Promise<void>;
  moveNode: (nodeId: string, newParentId: string) => Promise<void>;
  createRoot: (question: string) => Promise<NodeFull>;
  createChild: (parentId: string, question: string, aiAnswer: string, myNotes?: string) => Promise<NodeFull>;
}

export const useTreeStore = create<TreeState>((set, get) => ({
  nodes: {},
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const list = await nodeApi.getAll();
      const nodes: Record<string, NodeFull> = {};
      for (const n of list) {
        nodes[n.frontmatter.id] = n;
      }
      set({ nodes, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  addNode: (node) => {
    set(s => ({ nodes: { ...s.nodes, [node.frontmatter.id]: node } }));
  },

  updateNode: async (id, data) => {
    await nodeApi.update(id, data);
    await get().fetchAll();
  },

  deleteNode: async (id, cascade = 'delete') => {
    await nodeApi.delete(id, cascade);
    await get().fetchAll();
  },

  moveNode: async (nodeId, newParentId) => {
    await treeApi.move(nodeId, newParentId);
    await get().fetchAll();
  },

  createRoot: async (question) => {
    const res = await nodeApi.create(question);
    get().addNode(res.node);
    return res.node;
  },

  createChild: async (parentId, question, aiAnswer, myNotes) => {
    const res = await nodeApi.create(question, { parentId, aiAnswer, myNotes });
    // also update parent's children in local state
    const parent = get().nodes[parentId];
    if (parent) {
      parent.frontmatter.children.push(res.node.frontmatter.id);
    }
    get().addNode(res.node);
    return res.node;
  },
}));
