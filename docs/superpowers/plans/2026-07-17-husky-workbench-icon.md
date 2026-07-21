# 哈士奇工作台应用图标 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 生成一张可作为工作管理器桌面应用图标使用的半写实哈士奇工作场景 PNG，并保存在桌面端资源目录。

**Architecture:** 使用内置图像生成能力生成一张 512×512 的单主体图标源图。输出以新增文件保存，不覆盖现有 `icon.png`；检查构图、禁用元素与小尺寸辨识度后，将选定图标放入 Tauri 图标资源目录。

**Tech Stack:** 内置图像生成工具、PNG、macOS Tauri 资源目录。

## Global Constraints

- 源图尺寸为 512×512，圆角方形构图。
- 主体为灰白毛发、冰蓝眼睛的半写实哈士奇，佩戴细框眼镜，在打开的无品牌银色笔记本电脑后工作。
- 背景为深氧化青；不包含 Apple 标志、应用名称、其他文字、水印、桌面或额外物件。
- 主体居中，脸、眼镜与笔记本在 16px 至 128px 缩小预览中保持可辨。
- 最终资产保存为 `apps/desktop/src-tauri/icons/icon-husky.png`，不自动提交 Git。

---

### Task 1: 生成并保存图标源图

**Files:**
- Create: `apps/desktop/src-tauri/icons/icon-husky.png`
- Reference: `docs/superpowers/specs/2026-07-17-husky-workbench-icon-design.md`

**Interfaces:**
- Consumes: 设计规范中的构图、颜色、禁用元素与 512×512 约束。
- Produces: 供 Tauri 打包配置或后续品牌位引用的 PNG 文件 `apps/desktop/src-tauri/icons/icon-husky.png`。

- [ ] **Step 1: 使用以下生产提示生成图标**

```text
Use case: logo-brand
Asset type: macOS desktop app icon source image, 512 by 512 pixels
Primary request: a centered, semi-realistic Siberian husky working at an open silver laptop, front-facing upper body, both front paws naturally resting behind the laptop, slim dark round eyeglasses, ice-blue eyes, calm focused warm expression
Scene/backdrop: a single deep oxidized-teal rounded-square background, no desk, room, horizon, or floor
Style/medium: polished semi-realistic digital illustration, refined natural gray-and-white husky fur with large readable shapes, premium desktop-app icon, clean silhouette
Composition/framing: centered and symmetrical, generous safe padding from every edge; face is dominant, eyeglasses are clearly visible, laptop occupies the lower third
Lighting/mood: soft frontal studio light, calm, clear, dependable
Color palette: oxidized teal background; natural charcoal gray and ivory fur; restrained silver laptop; ice-blue eyes; low-saturation dark eyeglass frames
Constraints: no Apple logo, no brand logos, no text, no watermark, no extra objects, no neon, no hacker-terminal look, no exaggerated cartoon expression, no photorealistic room
Avoid: tiny scattered fur strands, clutter, dark-on-dark facial features, cropped ears or paws
```

- [ ] **Step 2: 检查生成结果**

核对以下条件：

```text
□ 主体为可辨识的哈士奇：灰白毛发、三角立耳、冰蓝眼睛。
□ 细框眼镜与无品牌银色笔记本清晰可见。
□ 仅有氧化青圆角方形背景；无桌面、房间、文字、水印或标志。
□ 脸、眼镜、笔记本居中且有安全留白。
□ 缩小预览仍保留明确的犬脸、眼镜、笔记本三层识别。
```

- [ ] **Step 3: 将通过检查的 PNG 保存到项目资源目录**

Run:

```bash
cp <selected-generated-png> apps/desktop/src-tauri/icons/icon-husky.png
```

Expected: `apps/desktop/src-tauri/icons/icon-husky.png` 是可读取的 512×512 PNG 文件。

- [ ] **Step 4: 验证文件尺寸与 PNG 格式**

Run:

```bash
sips -g pixelWidth -g pixelHeight -g format apps/desktop/src-tauri/icons/icon-husky.png
```

Expected: `pixelWidth: 512`、`pixelHeight: 512`、`format: png`。
