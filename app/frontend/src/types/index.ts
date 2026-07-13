export type NodeStatus = 'exploring' | 'understood' | 'needs-review';

export interface NodeFrontmatter {
  id: string;
  title: string;
  parent: string | null;
  children: string[];
  created: string;
  updated: string;
  status: NodeStatus;
  tags: string[];
  summary: string;
}

export interface NodeFull {
  frontmatter: NodeFrontmatter;
  question: string;
  ai_answer: string;
  my_notes: string;
  file_path: string;
}

export interface ChatResponse {
  success: boolean;
  node_id: string;
  reply_text: string;
  duration: number;
  error: string | null;
}

export interface CreateNodeResponse {
  node: NodeFull;
}

export interface DeletedResponse {
  deleted_ids: string[];
}
