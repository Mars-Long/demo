import axios from 'axios';
import type { CreateNodeResponse, DeletedResponse, NodeFull } from '../types';

const api = axios.create({ baseURL: 'http://localhost:8000/api' });
const TREE = 'default';

export const nodeApi = {
  getAll: () =>
    api.get<NodeFull[]>(`/nodes?tree=${TREE}`).then((r) => r.data),

  getOne: (id: string) =>
    api.get<NodeFull>(`/nodes/${id}?tree=${TREE}`).then((r) => r.data),

  getChildren: (id: string) =>
    api.get<NodeFull[]>(`/nodes/${id}/children?tree=${TREE}`).then((r) => r.data),

  create: (
    question: string,
    opts?: { parentId?: string; aiAnswer?: string; myNotes?: string; tags?: string[] }
  ) =>
    api
      .post<CreateNodeResponse>('/nodes', {
        question,
        parent_id: opts?.parentId || null,
        ai_answer: opts?.aiAnswer || '',
        my_notes: opts?.myNotes || '',
        tags: opts?.tags || [],
        tree: TREE,
      })
      .then((r) => r.data),

  update: (id: string, data: Record<string, unknown>) =>
    api.put<NodeFull>(`/nodes/${id}?tree=${TREE}`, data).then((r) => r.data),

  delete: (id: string, cascade = 'delete') =>
    api
      .delete<DeletedResponse>(`/nodes/${id}?cascade=${cascade}&tree=${TREE}`)
      .then((r) => r.data),
};

export const treeApi = {
  move: (nodeId: string, newParentId: string) =>
    api.post('/tree/move', { node_id: nodeId, new_parent_id: newParentId, tree: TREE }),

  connect: (childId: string, parentId: string) =>
    api.post('/tree/move', { node_id: childId, new_parent_id: parentId, tree: TREE }),

  detach: (nodeId: string) =>
    api.post('/tree/detach', null, { params: { node_id: nodeId, tree: TREE } }),

  cut: (nodeId: string, cascade = 'delete') =>
    api
      .post<DeletedResponse>('/tree/cut', { node_id: nodeId, cascade, tree: TREE })
      .then((r) => r.data),
};
