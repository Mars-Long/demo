import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeFull } from '../types';

const statusColors: Record<string, string> = {
  exploring: 'bg-yellow-400',
  understood: 'bg-green-400',
  'needs-review': 'bg-red-400',
};

const statusLabels: Record<string, string> = {
  exploring: '探索中',
  understood: '已理解',
  'needs-review': '需复习',
};

interface Props {
  data: { node: NodeFull; isSelected: boolean };
}

function TreeNodeCard({ data }: Props) {
  const { node, isSelected } = data;
  const fm = node.frontmatter;
  const color = statusColors[fm.status] || 'bg-gray-300';

  // Preview content: prefer summary, fallback to my_notes or ai_answer snippet
  const preview =
    fm.summary ||
    node.my_notes?.replace(/\n/g, ' ').slice(0, 80) ||
    node.ai_answer?.replace(/\n/g, ' ').slice(0, 80) ||
    '';

  return (
    <div
      className={`
        relative px-3 py-2 rounded-lg border-2 bg-white shadow-sm cursor-pointer
        ${isSelected ? 'border-blue-500 shadow-md' : 'border-gray-200'}
        hover:border-blue-300 transition-colors
      `}
      style={{ width: 230 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />

      {/* Status dot */}
      <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${color}`}
        title={statusLabels[fm.status] || fm.status}
      />

      {/* Title */}
      <div className="font-medium text-sm text-gray-800 truncate pr-4">
        {fm.title || '(未命名)'}
      </div>

      {/* Preview text */}
      {preview && (
        <div className="text-xs text-gray-500 mt-1 line-clamp-2">
          {preview}
        </div>
      )}

      {/* Children count */}
      {fm.children.length > 0 && (
        <div className="text-xs text-blue-400 mt-1">
          {fm.children.length} 个子节点
        </div>
      )}

      {/* Tags */}
      {fm.tags.length > 0 && (
        <div className="flex gap-1 mt-1.5 flex-wrap">
          {fm.tags.slice(0, 3).map(t => (
            <span key={t} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(TreeNodeCard);
