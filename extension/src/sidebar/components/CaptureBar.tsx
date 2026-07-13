/**
 * CaptureBar — 捕获按钮 + 自动模式切换 + 状态机 UI。
 *
 * 状态：idle → capturing → preview → creating → done → idle
 */

import type { NodeFull, CapturedQA } from '../types';

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
  const parentName = selectedNode?.frontmatter.title || '(未选择)';

  return (
    <div className="border-b border-gray-200 bg-white shrink-0">
      {/* Auto capture toggle */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-100">
        <span className="text-[10px] text-gray-500">自动捕获</span>
        <button
          className={`relative w-8 h-4 rounded-full transition-colors ${
            autoCapture ? 'bg-blue-500' : 'bg-gray-300'
          }`}
          onClick={() => onAutoToggle(!autoCapture)}
          title={autoCapture ? '关闭自动捕获' : '开启自动捕获（检测到新问答自动弹出确认）'}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
              autoCapture ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Main action area */}
      <div className="px-3 py-2">
        {state === 'idle' && (
          <button
            className="w-full bg-blue-500 text-white rounded-md py-1.5 text-xs font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors"
            onClick={onManualCapture}
          >
            📄 捕获对话到「{parentName}」
          </button>
        )}

        {state === 'capturing' && (
          <div className="text-center text-xs text-gray-400 py-1 animate-pulse">
            ⏳ 正在读取对话...
          </div>
        )}

        {state === 'preview' && data && (
          <div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2 mb-2 max-h-32 overflow-auto">
              <div className="text-[10px] font-medium text-yellow-700 mb-0.5">❓ 问题</div>
              <div className="text-[10px] text-gray-700 whitespace-pre-wrap line-clamp-3">
                {data.question}
              </div>
              <div className="text-[10px] font-medium text-green-700 mb-0.5 mt-1.5">✅ AI 回答</div>
              <div className="text-[10px] text-gray-700 whitespace-pre-wrap line-clamp-5">
                {data.answer}
              </div>
            </div>
            <div className="text-[10px] text-gray-400 mb-2">
              将存入：{parentName}
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 bg-green-500 text-white rounded-md py-1 text-xs font-medium hover:bg-green-600 transition-colors"
                onClick={onCreate}
              >
                ✅ 确认创建
              </button>
              <button
                className="flex-1 bg-gray-200 text-gray-600 rounded-md py-1 text-xs font-medium hover:bg-gray-300 transition-colors"
                onClick={onCancel}
              >
                取消
              </button>
            </div>
          </div>
        )}

        {state === 'creating' && (
          <div className="text-center text-xs text-gray-400 py-1 animate-pulse">
            ⏳ 正在创建节点...
          </div>
        )}

        {state === 'done' && (
          <div className="text-center text-xs text-green-500 py-1">
            ✅ 已创建！
          </div>
        )}

        {/* Hint when in auto mode */}
        {autoCapture && state === 'idle' && (
          <div className="text-[10px] text-gray-400 text-center mt-1">
            🔍 自动监听中，聊完会弹确认框
          </div>
        )}
      </div>
    </div>
  );
}
