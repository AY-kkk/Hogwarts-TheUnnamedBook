UI 设计系统规范：魔法随笔 (Magic Script System)
1. 页面整体布局 (Layout Structure)
设计决策： 采用“非对称沉浸式长卷”布局，弱化 UI 边界感，强化“书页”本体。
• 容器（The Book Shell）：全屏自适应，背景为微动效的羊皮纸纹理。
• 左侧：记忆栏 (Memory Bar)
  • 宽度：80px (收起状态) / 280px (展开状态)。
  • 模块划分：
    • 顶部：家族纹章（入口）。
    • 中部：三个纵向分布的圆形浮雕按钮（家族关系、角色状态、下载设置）。
    • 底部：当前游戏时间/季节显示。
• 右侧：主要叙事区 (Narrative Engine)
  • 最大宽度：800px (居中布局，保证单行文本阅读体验)。
  • 输入区：底部悬浮/固定，采用“无边框输入框”，模拟羽毛笔书写。
---
2. 色彩方案 (Color Palette)
设计决策： 模拟自然材质，通过对比度模拟墨迹干湿状态。

类别	颜色代码 (HEX)	技术依据
主底色 (Paper)	#F4EBD0	模拟陈年羊皮纸，低蓝光，适合长文本阅读。
主墨迹色 (Ink)	#2C1E14	深棕黑色，比纯黑更具质感，减少视觉疲劳。
强调色 (Magic)	#D4AF37	哑光金，用于关键判定结果、魔法增益。
警戒色 (Blood)	#722F37	干涸的血色，用于 HP 过低、判定失败。
中性色 (Shadow)	rgba(0,0,0,0.05)	用于书页折痕、材质阴影。
导出到 Google 表格

---
3. 字体规范 (Typography)
设计决策： 衬线体（Serif）是沉浸感的核心，必须具备良好的中文可读性。
• 大标题 (Chapter)：Cinzel (英) / 方正清刻本悦宋 (中)；32px；字重 700；行高 1.5。
• 正文 (Body)：EB Garamond (英) / 思源宋体 (Source Han Serif) (中)；18px；字重 400；行高 1.8 (黄金阅读行高)。
• 注脚/状态 (Meta)：Lora (英) / 楷体；14px；字重 500；斜体应用。
---
4. 组件设计规范 (Component Specs)
4.1 记忆栏按钮 (Floating Orbs)
• 样式：圆形浮雕质感，背景带金属质感，中间为线性图标（如：家徽、人物剪影、齿轮）。
• 状态：
  • Default：滤镜灰度 20%，轻微内阴影。
  • Hover：外发光 (Golden Glow)，微幅向上位移 2px。
  • Active：墨迹扩散动效，图标填充色加深。
4.2 对话卡片 (Narrative Blocks)
• 样式：不设明显的边框，通过段落间距 (Margin-bottom: 40px) 区分。
• AI 文本：逐字渲染，首字母大写（Drop Cap）装饰。
• 玩家行动：左侧带有一条细长的纵向装饰线（模拟对话轴）。
4.3 输入框 (The Quill Input)
• 样式：仅底部有一条波浪线（模拟墨水线）。
• 占位符："挥动魔杖，书写你的行动..."。
• 交互：Focus 时，光标变为羽毛笔图标，波浪线产生波动动画。
---
5. 响应式断点规则 (Responsive)
设计决策： 移动端优先考虑“单手操作”，桌面端强调“画卷感”。
• Desktop (> 1024px)：完整左侧栏，主要区域 800px 居中。
• Tablet (768px - 1024px)：记忆栏自动收缩为图标，悬浮在左侧。
• Mobile (< 768px)：
  • 记忆栏改为底部 Dock 栏（三个核心按钮）。
  • 字体大小下调 2px。
  • 隐藏不必要的背景装饰图，确保加载速度。
---
6. 动效规范 (Animation)
设计决策： “慢节奏、线性平衡”。
• 流式排版 (Ink Bleed)：AI 文本生成时，模拟墨水在纸上晕开的渐显效果（Opacity 0->1, Blur 5px->0），时长 50ms/字。
• 侧边栏滑出：Ease-in-out，时长 300ms，配合纸张摩擦的音效触发。
• 微交互：点击按钮时产生类似“印章盖下”的轻微抖动。
---
7. 无障碍设计 (Accessibility)
• 色彩对比度：墨迹色与纸张色对比度必须保持在 7:1 以上（符合 WCAG AAA 级标准）。
• 焦点状态：Tab 键切换时，组件周围出现“魔法粒子”特效包围盒，而非系统默认蓝色框。
• 语义化：AI 叙事段落使用 <article>，侧边栏使用 <nav role="navigation">，状态更新使用 <aria-live="polite">。
---
8. 命名规则 (Naming - BEM + Atomic)
设计决策： 使用 BEM 确保 CSS 可维护性。
• Block: .c-book, .c-memory-bar, .c-narrative
• Element: .c-memory-bar__btn, .c-narrative__ink-text
• Modifier: .c-memory-bar__btn--active, .c-narrative__ink-text--fail
---
9. 设计决策的技术依据（PM 总结）
1. 采用 IndexedDB 而非 LocalStorage：因为长篇小说文本量巨大，IndexedDB 提供更大的存储空间（可达 250MB+）且支持二进制存储（用于头像、插画）。
2. 流式输出 (SSE/Websocket)：为了配合“打字机”动效，后端必须支持 Stream 模式，前端通过 React 状态机逐帧压入字符，防止页面重绘导致的性能卡顿。
3. Canvas 渲染羊皮纸纹理：为了保证在高清屏下的细腻感，纹理采用 CSS background-blend-mode 混合真实材质图，而非单张大图片。