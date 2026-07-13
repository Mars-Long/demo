import { useMemo } from 'react';
import { useTreeStore } from '../stores/treeStore';
import { useUIStore } from '../stores/uiStore';

export default function ContextPanel() {
  const { selectedNodeId } = useUIStore();
  const nodeMap = useTreeStore(s => s.nodes);

  const contextText = useMemo(() => {
    if (!selectedNodeId) return '';
    const chain: string[] = [];

    // Walk up parent chain
    let current = nodeMap[selectedNodeId];
    const ancestors: typeof current[] = [];
    while (current?.frontmatter.parent) {
      const parent = nodeMap[current.frontmatter.parent];
      if (!parent) break;
      ancestors.unshift(parent);
      current = parent;
    }

    if (ancestors.length === 0) {
      return '(当前为根节点，无上下文背景)';
    }

    chain.push('知识背景摘要：\n');
    for (let i = 0; i < ancestors.length; i++) {
      const indent = '  '.repeat(i);
      const title = ancestors[i].frontmatter.title || '(未命名)';
      const summary = ancestors[i].frontmatter.summary || '(暂无摘要)';
      chain.push(`${indent}· ${title}：${summary}`);
    }

    const curNode = nodeMap[selectedNodeId];
    if (curNode) {
      chain.push(`\n当前探索方向：${curNode.frontmatter.title || '(未命名)'}`);
    }

    chain.push('\n用户提问：(待输入)');
    return chain.join('\n');
  }, [selectedNodeId, nodeMap]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="text-sm font-medium text-gray-800">📋 上下文预览</div>
        <div className="text-xs text-gray-400 mt-0.5">这是发送给 AI 的完整 prompt</div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed bg-gray-50 rounded-lg p-3">
          {contextText}
        </pre>
      </div>
    </div>
  );
}
