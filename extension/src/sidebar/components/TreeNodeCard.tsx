import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeFull } from '../types';
import { cn } from '../lib/utils';

const statusColors: Record<string, string> = {
  exploring: 'bg-amber-400',
  understood: 'bg-emerald-500',
  'needs-review': 'bg-destructive',
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
  const color = statusColors[fm.status] || 'bg-muted-foreground';

  const preview =
    fm.summary ||
    node.my_notes?.replace(/\n/g, ' ').slice(0, 60) ||
    node.ai_answer?.replace(/\n/g, ' ').slice(0, 60) ||
    '';

  return (
    <div
      className={cn(
        'relative px-2.5 py-1.5 rounded-md border shadow-sm cursor-pointer text-xs select-none transition-all duration-100 font-mono tracking-tight',
        isSelected
          ? 'border-primary bg-primary text-primary-foreground shadow-lg'
          : 'border-border bg-card text-card-foreground hover:border-primary/40 hover:shadow-sm'
      )}
      style={{ width: 190 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !w-2 !h-2 !border-0" />

      {/* Status dot */}
      <div
        className={cn('absolute top-1.5 right-1.5 w-2 h-2 rounded-full', color)}
        title={statusLabels[fm.status] || fm.status}
      />

      {/* Title */}
      <div className="font-medium truncate pr-3" style={{ fontSize: '11px' }}>
        {fm.title || '(未命名)'}
      </div>

      {/* Preview */}
      {preview && (
        <div className="text-muted-foreground mt-0.5 line-clamp-2" style={{ fontSize: '10px' }}>
          {preview}
        </div>
      )}

      {/* Children count */}
      {(fm.children?.length ?? 0) > 0 && (
        <div className="text-primary mt-0.5" style={{ fontSize: '10px' }}>
          {fm.children!.length} 个子节点
        </div>
      )}

      {/* Tags */}
      {(fm.tags?.length ?? 0) > 0 && (
        <div className="flex gap-0.5 mt-1 flex-wrap">
          {(fm.tags ?? []).slice(0, 2).map((t) => (
            <span key={t} className="bg-muted text-muted-foreground px-1 py-0.5 rounded" style={{ fontSize: '9px' }}>
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(TreeNodeCard);
