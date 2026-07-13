# 计划：DeepSeek 侧边栏知识树（浏览器扩展）

> 状态：📋 计划中，待实施

## 目标

在 chat.deepseek.com 注入侧边栏显示知识树画布，用户直接使用 DeepSeek 原生界面（流式输出、图片上传等），侧边栏负责捕获对话 → 组织进知识树。**干掉 Playwright 这个最大的体验瓶颈。**

## 架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 注入方式 | **浏览器扩展 (MV3)** | 权限模型正规，免遭页面 CSP 限制，`web_accessible_resources` 可加载 React bundle |
| UI 隔离 | **iframe** | React 与 Shadow DOM 兼容性差（事件代理、React Flow 画布），iframe 提供完整独立浏览上下文 |
| UI 构建 | **复用现有 React 组件** | Vite `resolve.alias` 引用 `frontend/src/`，TreeCanvas/TreeNodeCard/Zustand stores 全部复用 |
| DOM 读取 | **Content Script** | content script 在隔离世界中运行，有页面 DOM 全权限；iframe 跨域无权限直接读 |
| 后端通信 | **iframe 直连 localhost:8000** | 已有 `allow_origins=["*"]`，扩展声明 `host_permissions` 放行 |

## 运行效果示意

```
┌──────────────────────────────────────────────────────────┐
│  chat.deepseek.com                                       │
│  ┌────────────────────────────────────┬─────────────────┐│
│  │                                    │ iframe 注入      ││
│  │  DeepSeek 原生对话                   │                 ││
│  │                                    │ ┌─────────────┐ ││
│  │  用户：什么是量子纠缠？               │ │ 知识树画布    │ ││
│  │                                    │ │ (React Flow) │ ││
│  │  AI：量子纠缠是指两个或多个粒子...    │ │             │ ││
│  │  （流式输出，实时显示）               │ │ 🌳 根节点    │ ││
│  │                                    │ │ ├── 子节点   │ ││
│  │  [📄 捕获此对话] ← content script   │ │ └── ...      │ ││
│  │                                    │ └─────────────┘ ││
│  └────────────────────────────────────┴─────────────────┘│
│                          ◄── 可拖拽分割线                   │
└──────────────────────────────────────────────────────────┘
```

## 数据流

```
                    chat.deepseek.com 页面 DOM
                           │
              ┌────────────┼────────────┐
              │            │            │
        方案A:手动      方案B:自动    降级:粘贴
              │            │            │
              ▼            ▼            ▼
         [📄 捕获]   MutationObserver  手动输入框
         按钮点击      + 流式检测
              │            │
              └─────┬──────┘
                    ▼
            parser.ts 多策略级联
                    │
                    ▼  postMessage
          sidebar/iframe (React App)
                    │
                    │  fetch
                    ▼
           localhost:8000/api/nodes
                    │
                    ▼
             data/default/*.md
```

## 文件结构

新建 `extension/`，其余复用：

```
extension/
├── manifest.json              # MV3 配置
├── package.json               # 构建依赖
├── tsconfig.json
├── vite.config.ts             # sidebar React 构建
├── build.mjs                  # 一键构建脚本
└── src/
    ├── content/
    │   ├── index.ts            # 注入 iframe + 调整布局 + postMessage 桥接
    │   ├── parser.ts           # DeepSeek DOM 解析（多策略级联，手动捕获）
    │   └── observer.ts         # MutationObserver 监听 + 流式检测（自动捕获）
    ├── sidebar/
    │   ├── index.html          # iframe 入口
    │   ├── main.tsx            # React 挂载
    │   ├── App.tsx             # 侧边栏主布局（精简版 App）
    │   ├── App.css             # Tailwind
    │   ├── api/
    │   │   └── client.ts       # axios → localhost:8000
    │   ├── bridge.ts           # postMessage 封装
    │   └── components/
    │       └── CaptureBar.tsx  # 捕获按钮 + 状态管理
    └── icons/                  # 扩展图标 16/48/128
```

**复用（不修改）：**

| 文件 | 用途 |
|------|------|
| `frontend/src/stores/treeStore.ts` | sidebar 的 Zustand store |
| `frontend/src/stores/uiStore.ts` | 选中节点 + 面板模式 |
| `frontend/src/components/TreeCanvas.tsx` | 画布 |
| `frontend/src/components/TreeNodeCard.tsx` | 节点卡片 |
| `frontend/src/lib/layout.ts` | dagre 布局 |
| `frontend/src/types/index.ts` | 类型定义 |
| `backend/` | **零改动** |

## 实施步骤

### Step 1: 创建 `extension/` 骨架

- `package.json`（仅 esbuild + vite 构建依赖）
- `tsconfig.json`
- `manifest.json` — 关键配置：
  - `content_scripts.matches: ["https://chat.deepseek.com/*"]`
  - `host_permissions: ["https://chat.deepseek.com/*", "http://localhost:8000/*"]`
  - `web_accessible_resources: [{ resources: ["sidebar/*"], matches: ["https://chat.deepseek.com/*"] }]`
- `vite.config.ts` — `resolve.alias: { "@frontend": "../frontend/src" }`
- 占位图标（纯色方块即可）

### Step 2: Content Script (`src/content/index.ts`)

1. **注入 iframe** — src 指向 `chrome.runtime.getURL('sidebar/index.html')`
2. **注入捕获按钮** — 页面右下角浮动 "📄 捕获"
3. **可拖拽分割线** — iframe 左边框 4px，`mousedown/mousemove/mouseup` 控制宽度（320-600px）
4. **展开/收起** — 侧边栏左侧 "«" 按钮，状态持久化到 `chrome.storage.local`
5. **页面布局适配** — DeepSeek 主容器 `margin-right` 跟随侧边栏宽度
6. **postMessage 桥接** — 接收 sidebar 的 `CAPTURE` 请求，转发 `CAPTURE_RESULT`

### Step 3: DOM 解析器 (`src/content/parser.ts`)

多策略级联读取 DeepSeek 对话（任一成功即返回）：

```
策略1: .ds-markdown / [class*="markdown_body"] 选择器提取最后两个内容块
策略2: user/assistant 容器的 class 模式匹配
策略3: 全页面扫描，取最后两个 >10 字符的文本段落
```

返回 `null` 时提示用户手动输入（降级方案）。

### Step 4: Sidebar React 应用

- **App.tsx** — 顶部标题栏（含 CaptureBar）+ 主体 ReactFlow 画布 + 底部上下文面板
- **CaptureBar.tsx** — 状态机：`idle → capturing → preview → creating → done`，顶部 toggle 切换手动/自动模式。自动模式时 manual capture 按钮仍可用作即时快照
- **bridge.ts** — typed postMessage 封装
- **api/client.ts** — axios baseURL `http://localhost:8000`，复用 frontend 类型

### Step 5: 构建脚本 + 验证

- `build.mjs`：esbuild 编译 content script → vite build sidebar → 拷贝 manifest + icons
- 加载 `extension/dist/` 为未打包扩展
- 打开 chat.deepseek.com，确认端到端通过

## 捕获模式设计

核心问题：用户聊完天，如何把问答存进知识树？提供两种模式，可在 CaptureBar 中一键切换。

---

### 方案 A：手动捕获（默认）

**流程：** 聊完一轮 → 点击 `📄 捕获` → 预览 Q&A → 确认 → 生成子节点

```
用户状态机：
  idle → capturing → preview → creating → done → idle
  
  idle:       📄 捕获 按钮可用，显示"点击捕获最后一组问答"
  capturing:  ⏳ 读取中... content script 解析 DOM
  preview:    展示 question + answer 预览，[确认创建] [取消]
  creating:   ⏳ 创建中... POST /api/nodes
  done:       ✅ 已创建! 2秒后回到 idle
```

**捕获逻辑 (`parser.ts`)：**

多策略级联，任一成功即返回。只提取**最后一组** Q&A：

```
策略1: .ds-markdown / [class*="markdown_body"] 选择器提取最后两个内容块
策略2: user/assistant 容器的 class 模式匹配
策略3: 全页面扫描，取最后两个 >10 字符的文本段落
```

返回 `null` 时降级为手动输入弹窗。

**优点：** 你有机会确认/编辑再存，不会把闲聊垃圾存进去
**缺点：** 每次聊完要点一下按钮

---

### 方案 B：自动监听（可开关）

**流程：** 打开开关 → MutationObserver 监听 DeepSeek DOM → AI 回复完成时自动弹出确认框 → 确认/忽略

```
┌─ 自动捕获: [开 ●] ──────────────────────────────┐
│                                                  │
│  MutationObserver 监听 chat 容器                  │
│       │                                          │
│       ▼                                          │
│  检测到新的 AI 回复完成（流式结束）                  │
│       │                                          │
│       ▼                                          │
│  右下角弹出 Toast：                               │
│  ┌─────────────────────────────────────┐         │
│  │ 🤖 检测到新问答                      │         │
│  │ Q: 什么是量子纠缠？                   │         │
│  │ A: 量子纠缠是指两个或多个粒子...       │         │
│  │                                     │         │
│  │ [✅ 保存] [🗑 忽略] [⏸ 暂停自动捕获]  │         │
│  └─────────────────────────────────────┘         │
│       │                                          │
│       ▼  (用户点保存)                             │
│  POST /api/nodes → 画布出现新节点                  │
│                                                  │
└──────────────────────────────────────────────────┘
```

**MutationObserver 实现关键：**

```typescript
// content/observer.ts

function startAutoCapture(
  onNewQA: (qa: CapturedExchange) => void
): () => void {
  // 1. 找到 DeepSeek 的对话容器
  const chatContainer = findChatContainer();
  if (!chatContainer) return () => {};

  let lastProcessedIndex = 0;

  const observer = new MutationObserver(() => {
    // 2. 获取所有消息块
    const messages = getAllMessageBlocks(chatContainer);
    
    // 3. 检测是否新增了完整的 Q&A 对
    //    策略：一轮对话 = 用户消息 + AI 消息成对出现
    //    当检测到新的 AI 消息不再变化（流式结束），触发回调
    for (let i = lastProcessedIndex; i < messages.length - 1; i++) {
      const qBlock = messages[i];
      const aBlock = messages[i + 1];
      
      if (isUserMessage(qBlock) && isAIMessage(aBlock) && isStreamFinished(aBlock)) {
        lastProcessedIndex = i + 2;
        onNewQA({
          question: qBlock.textContent?.trim() || '',
          answer: aBlock.textContent?.trim() || '',
        });
      }
    }
  });

  observer.observe(chatContainer, {
    childList: true,
    subtree: true,
    characterData: true,  // 检测流式文本变化
  });

  return () => observer.disconnect(); // 返回取消函数
}
```

**流式检测策略：**

DeepSeek 流式输出时 DOM 会持续变化。需要判断"流式是否结束"：

- **策略1（timer）**：`characterData` 变化后 2 秒内无新变化 → 视为流式结束
- **策略2（marker）**：检测操作按钮出现（复制/点赞等，通常在回复完成后渲染）
- **策略3（next message）**：检测到新的 user 消息 → 前一条 AI 消息必然已完成

```typescript
function isStreamFinished(element: Element): boolean {
  // 检查附近是否有 "复制" 按钮或点赞按钮（回复完成的标志）
  const actionBar = element.querySelector(
    '[class*="action"], [class*="toolbar"], [class*="copy"], button[aria-label*="复制"]'
  );
  if (actionBar) return true;
  
  // 检查是否有下一个 user 消息（说明这条 AI 回复已结束）
  const next = element.nextElementSibling;
  if (next && isUserMessage(next)) return true;
  
  return false;
}
```

**优点：** 接近无感，聊完自动弹确认框，不遗漏
**缺点：**
- DOM 监听比手动触发复杂，判断"流式结束"不完美
- 区分"正式问答"和"追问/闲聊"需要用户确认（弹窗）

---

### 两种模式切换

CaptureBar 顶部一个 toggle：

```
┌─────────────────────────────┐
│  自动捕获:  [○ 关] / [● 开]   │
│                             │
│  [📄 手动捕获最后一组]        │  ← 自动模式关时显示
│           或                 │
│  自动监听中... 已检测到 3 组   │  ← 自动模式开时显示
└─────────────────────────────┘
```

开关状态持久化到 `localStorage`。自动模式下手动捕获按钮仍然可用（作为即时快照）。

---

## 不做

- 侧边栏内不提供 ChatPanel/AI 对话（用户直接在 DeepSeek 页面聊）
- 不提供 EditorPanel（编辑节点去独立前端应用）
- 后端 Zero 改动

## 风险

| 风险 | 缓解 |
|------|------|
| DeepSeek DOM 变化导致捕获失败 | 多策略级联 + 降级为手动输入 |
| 流式结束检测不准确（自动模式） | timer + action bar + next message 三重判断；漏检时用户可手动点击 |
| 自动模式产生垃圾节点 | 弹窗确认机制（不自动存储，必须人工确认） |
| React Flow 在窄 sidebar 中体验差 | 极限宽度 320px，卡片缩小适配；可切换树形列表模式 |
| DeepSeek SPA 路由切换导致 content script 不触发 | MutationObserver 监听 URL 变化 + 重注入 |

## 验证清单

- [ ] `chrome://extensions` 加载未打包扩展无报错
- [ ] 打开 chat.deepseek.com → 侧边栏出现在右侧
- [ ] 侧边栏显示知识树画布，点击节点正常选中
- [ ] 拖拽分割线可调整宽度
- [ ] 收起/展开按钮正常工作
- [ ] 手动捕获对话 → 预览 Q&A → 确认创建 → 画布出现新节点
- [ ] 自动捕获开关打开 → MutationObserver 启动 → 流式结束后弹出确认框 → 确认创建节点
- [ ] 自动捕获弹窗中点击"忽略" → 不创建节点，自动继续监听
- [ ] 自动捕获弹窗中点击"暂停" → 关闭自动模式，切回手动
- [ ] 自动模式下仍可点击手动捕获按钮
- [ ] 捕获失败 → 降级弹窗允许手动粘贴输入
- [ ] `data/default/` 下 .md 文件内容正确
