import { useState, useEffect } from 'react';
import MDEditor from '@uiw/react-md-editor';
import { useTreeStore } from '../stores/treeStore';
import { useUIStore } from '../stores/uiStore';
import type { NodeStatus } from '../types';

const STATUS_OPTIONS: { value: NodeStatus; label: string }[] = [
  { value: 'exploring', label: '🔍 探索中' },
  { value: 'understood', label: '✅ 已理解' },
  { value: 'needs-review', label: '🔄 需复习' },
];

export default function EditorPanel() {
  const { selectedNodeId } = useUIStore();
  const nodeMap = useTreeStore(s => s.nodes);
  const { updateNode } = useTreeStore();

  const node = selectedNodeId ? nodeMap[selectedNodeId] : null;

  const [notes, setNotes] = useState('');
  const [summary, setSummary] = useState('');
  const [status, setStatus] = useState<NodeStatus>('exploring');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (node) {
      setNotes(node.my_notes || '');
      setSummary(node.frontmatter.summary || '');
      setStatus(node.frontmatter.status || 'exploring');
    }
  }, [node]);

  if (!node) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        点击画布中的节点进行编辑
      </div>
    );
  }

  const handleSave = async () => {
    if (!selectedNodeId) return;
    setSaving(true);
    await updateNode(selectedNodeId, {
      my_notes: notes,
      summary,
      status,
    });
    setSaving(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="text-sm font-medium text-gray-800 truncate">
          ✏️ 编辑：{node.frontmatter.title || '(未命名)'}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Status */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">状态</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            value={status}
            onChange={e => setStatus(e.target.value as NodeStatus)}
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Summary */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">摘要</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            value={summary}
            onChange={e => setSummary(e.target.value)}
            placeholder="一句话总结这个知识点..."
          />
        </div>

        {/* Notes editor */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">📝 我的笔记</label>
          <div data-color-mode="light">
            <MDEditor
              value={notes}
              onChange={val => setNotes(val || '')}
              height={300}
              preview="edit"
            />
          </div>
        </div>

        {/* Save */}
        <button
          className="w-full bg-green-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-600 disabled:opacity-50 transition-colors"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}
