# Design System

## Theme

“清晨共享工作室里的氧化铜工具柜”：纯白环境保持长时间工作的清晰度，深氧化青只用于当前选择与主要动作，少量铜橙用于需要注意但不危险的状态。整体采用克制的浅色产品界面。

## Color Palette

所有实现使用以下 OKLCH 令牌：

```css
:root {
  --color-bg: oklch(1 0 0);
  --color-surface: oklch(0.965 0.006 170);
  --color-surface-strong: oklch(0.925 0.012 170);
  --color-ink: oklch(0.205 0.018 170);
  --color-muted: oklch(0.49 0.022 170);
  --color-primary: oklch(0.45 0.086 170);
  --color-primary-hover: oklch(0.39 0.09 170);
  --color-accent: oklch(0.62 0.15 48);
  --color-success: oklch(0.47 0.11 150);
  --color-warning: oklch(0.67 0.14 75);
  --color-danger: oklch(0.52 0.18 28);
  --color-info: oklch(0.5 0.12 245);
  --color-border: oklch(0.87 0.012 170);
  --color-focus: oklch(0.64 0.13 170);
}
```

主色只用于主要按钮、当前导航和焦点相关元素。状态色必须配合文字标签，不能单独传达含义。

## Typography

使用 `Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`。界面只使用一个字族，通过 400、500、600、700 字重形成层级。正文 14–16px，辅助文字不小于 12px，页面标题 28px，区块标题 18px；不使用流体大标题。

## Layout

应用采用 72px 顶部导航和最大 1440px 内容区。看板使用状态列，宽屏至少三列，中屏两列，小屏单列；详情页宽屏为主内容加 320px 资源侧栏，小屏按概览、下一步、服务、产物、事件的顺序堆叠。

## Components

- 按钮高度 36px，圆角 8px；主要按钮使用深氧化青填充和白字，危险操作只在确有危险语义时使用红色。
- 输入框和筛选控件高度 38px，圆角 8px，使用边框而非大阴影；聚焦时显示 2px 可见轮廓。
- 任务项使用紧凑列表面板，圆角不超过 12px。状态、下一步行动和项目元数据有固定阅读顺序。
- 状态标签使用浅底深字并包含文本；`blocked` 和失败反馈增加图标或文字前缀。
- 加载使用与内容结构一致的骨架；空状态提供“创建第一个任务”的可执行说明。
- 操作结果使用页面内反馈或短暂 toast，不把常规操作放进模态框。

## Motion

交互反馈为 160–220ms 的 ease-out 状态过渡，只用于筛选结果、按钮状态和反馈出现。`prefers-reduced-motion: reduce` 时禁用位移并缩短为即时或淡入。

## Accessibility

所有图标按钮提供可见标签或 `aria-label`；焦点顺序遵循视觉顺序。表单错误在字段附近显示且通过 `aria-describedby` 关联。所有状态筛选和操作均可键盘完成，最小点击区域 36×36px。
