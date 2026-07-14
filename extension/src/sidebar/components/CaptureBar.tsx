/**
 * CaptureBar — 捕获按钮 + 自动模式切换 + 状态机 UI (Figma 风格)。
 *
 * 状态：idle → capturing → preview → creating → done → idle
 */

import { Download, Loader2 } from 'lucide-react';
import type { NodeFull, CapturedQA } from '../types';
import { cn } from '../lib/utils';

interface Props {
  state: 'idle' | 'capturing' | 'preview' | 'creating' | 'done';
  data: CapturedQA | null;
  autoCapture: boolean;
  selectedNode: NodeFull | null;
  onManualCapture: () => void;
  onAutoToggle: (enabled: boolean) => void;
  onCreate: () => void;
  onCancel: () => void;
}

export default function CaptureBar({
  state,
  data,
  autoCapture,
  selectedNode,
  onManualCapture,
  onAutoToggle,
  onCreate,
  onCancel,
}: Props) {
  const parentName = selectedNode?.frontmatter.title || null;
  const targetLabel = parentName ? `「${parentName}」` : '作为根节点';

  return (
    <div className="border-b border-border bg-card shrink-0">
      {/* Auto capture toggle row */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
        <span className="text-[10px] text-muted-foreground font-medium">自动捕获</span>
        <button
          className={cn(
            'relative w-9 h-5 rounded-full transition-colors',
            autoCapture ? 'bg-primary' : 'bg-muted-foreground/30'
          )}
          onClick={() => onAutoToggle(!autoCapture)}
          title={autoCapture ? '关闭自动捕获' : '开启自动捕获（检测到新问答自动弹出确认）'}
        >
          <span
            className={cn(
              'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform',
              autoCapture ? 'translate-x-4' : 'translate-x-0.5'
            )}
          />
        </button>
      </div>

      {/* Main action area */}
      <div className="px-3 py-2">
        {state === 'idle' && (
          <div>
            <button
              className="w-full bg-primary text-primary-foreground rounded-md py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-1.5"
              onClick={onManualCapture}
            >
              <Download size={12} />
              捕获对话 → {targetLabel}
            </button>
            {/* Hint when in auto mode */}
            {autoCapture && (
              <div className="text-[10px] text-muted-foreground text-center mt-1.5">
                自动监听中，聊完会弹确认框
              </div>
            )}
          </div>
        )}

        {state === 'capturing' && (
          <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            正在读取对话...
          </div>
        )}

        {state === 'preview' && data && (
          <div>
            <div className="bg-accent border border-accent-foreground/10 rounded-md p-2.5 mb-2 max-h-36 overflow-auto">
              <div className="text-[10px] font-semibold text-accent-foreground mb-1 flex items-center gap-1">
                <span>❓</span> 问题
              </div>
              <div className="text-[10px] text-card-foreground whitespace-pre-wrap line-clamp-3 leading-relaxed">
                {data.question}
              </div>
              <div className="text-[10px] font-semibold text-accent-foreground mb-1 mt-2 flex items-center gap-1">
                <span>✅</span> AI 回答
              </div>
              <div className="text-[10px] text-card-foreground whitespace-pre-wrap line-clamp-5 leading-relaxed">
                {data.answer}
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground mb-2">
              将存入：{parentName ? `「${parentName}」的子节点` : '根节点'}
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 bg-primary text-primary-foreground rounded-md py-1.5 text-xs font-medium hover:opacity-90 transition-opacity"
                onClick={onCreate}
              >
                确认创建
              </button>
              <button
                className="flex-1 bg-muted text-muted-foreground rounded-md py-1.5 text-xs font-medium hover:bg-muted/80 transition-colors"
                onClick={onCancel}
              >
                取消
              </button>
            </div>
          </div>
        )}

        {state === 'creating' && (
          <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            正在创建节点...
          </div>
        )}

        {state === 'done' && (
          <div className="flex items-center justify-center gap-1.5 py-1 text-xs text-emerald-500 font-medium">
            <span>✅</span> 已创建！
          </div>
        )}
      </div>
    </div>
  );
}
