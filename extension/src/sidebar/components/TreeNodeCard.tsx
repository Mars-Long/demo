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

  const preview =
    fm.summary ||
    node.my_notes?.replace(/\n/g, ' ').slice(0, 60) ||
    node.ai_answer?.replace(/\n/g, ' ').slice(0, 60) ||
    '';

  return (
    <div
      className={`
        relative px-2.5 py-1.5 rounded-md border-2 bg-white shadow-sm cursor-pointer text-xs
        ${isSelected ? 'border-blue-500 shadow-md' : 'border-gray-200'}
        hover:border-blue-300 transition-colors
      `}
      style={{ width: 190 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-2 !h-2" />

      {/* Status dot */}
      <div
        className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${color}`}
        title={statusLabels[fm.status] || fm.status}
      />

      {/* Title */}
      <div className="font-medium text-gray-800 truncate pr-3" style={{ fontSize: '11px' }}>
        {fm.title || '(未命名)'}
      </div>

      {/* Preview */}
      {preview && (
        <div className="text-gray-500 mt-0.5 line-clamp-2" style={{ fontSize: '10px' }}>
          {preview}
        </div>
      )}

      {/* Children count */}
      {fm.children.length > 0 && (
        <div className="text-blue-400 mt-0.5" style={{ fontSize: '10px' }}>
          {fm.children.length} 个子节点
        </div>
      )}

      {/* Tags */}
      {fm.tags.length > 0 && (
        <div className="flex gap-0.5 mt-1 flex-wrap">
          {fm.tags.slice(0, 2).map((t) => (
            <span key={t} className="bg-gray-100 text-gray-500 px-1 py-0.5 rounded" style={{ fontSize: '9px' }}>
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(TreeNodeCard);
