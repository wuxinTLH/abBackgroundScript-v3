# 🌸 SakuraBG — AB站网页背景更改脚本 v3

> 声明：代码根据二代脚本修改，v3代码由Claude sonnet 4.6生成
> 
<p align="center">
  <img src="http://github.smiku.site/sakura.png" width="80" alt="SakuraBG Logo">
</p>

<p align="center">
  <a href="https://space.bilibili.com/29058270">
    <img src="https://img.shields.io/badge/Bilibili-SakuraMikku-ff69b4?logo=bilibili&logoColor=white" alt="Bilibili">
  </a>
  <a href="https://github.com/wuxinTLH">
    <img src="https://img.shields.io/badge/GitHub-wuxinTLH-181717?logo=github" alt="GitHub">
  </a>
  <a href="#">
    <img src="https://img.shields.io/badge/version-3.0.0-ff9de2" alt="version">
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License">
  </a>
</p>

---

## 简介 / Introduction

**SakuraBG** 是一款适用于 **Bilibili** 和 **AcFun** 网站的油猴脚本（Tampermonkey / Violentmonkey），允许用户自由更换网站背景图片，支持本地图片、URL 链接、预设图库，以及可扩展的远程图库接口。

**SakuraBG** is a Tampermonkey/Violentmonkey userscript for **Bilibili** and **AcFun**, allowing users to freely customize the website background with local images, URL links, a built-in gallery, and an extensible remote gallery API.

---

## 功能特性 / Features

| 功能       | 说明                                                     |
| ---------- | -------------------------------------------------------- |
| 🖼️ 内置图库 | 6 张预设背景图，点击一键应用                             |
| 🔗 URL 输入 | 粘贴任意图片链接，支持回车快捷键                         |
| 📁 本地上传 | 拖拽或点击上传本地图片，自动转 Base64                    |
| 🌐 远程图库 | 预留接口，配置后自动拉取远程图库（含缓存与重试）         |
| 💾 持久存储 | 降级链：IndexedDB → localStorage → sessionStorage → 内存 |
| 🎨 现代 UI  | 侧边抽屉面板 + 玻璃拟态 + 流畅动画                       |
| ♿ 无障碍   | ARIA 属性、键盘导航支持                                  |

---

## 安装 / Installation

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)
2. 点击下方链接安装脚本：

   **[📥 点击安装（GreasyFork）](https://greasyfork.org/)**

   或手动将 `abBackgroundScript_v3.js` 添加至油猴管理器。

---

## 使用说明 / Usage

打开 Bilibili 或 AcFun 后，点击页面**左下角 🌸 按钮**打开背景面板：

- **图库**：点击预设图片直接应用背景
- **链接**：粘贴图片 URL，按 Enter 或点击「应用背景」
- **本地**：拖拽或点击选择本地图片文件（支持 JPG / PNG / WebP 等格式）
- **设置**：查看当前背景预览，清除存储，查看关于信息

---

## 远程图库接口 / Remote Gallery API

在脚本顶部找到 `REMOTE_CONFIG` 并修改：

```javascript
var REMOTE_CONFIG = {
    enabled:      true,                        // 设为 true 启用
    url:          "https://your-api.com/list", // 接口地址
    cacheMinutes: 30,                          // 缓存时长（分钟）
    retryTimes:   2,                           // 失败重试次数
    retryDelay:   800,                         // 重试间隔基数（ms，指数退避）
    pageSize:     12,                          // 每页图片数量
    timeout:      8000,                        // 请求超时（ms）
};
```

接口需返回以下 JSON 格式：

```json
{
  "code": 0,
  "data": {
    "list": [
      { "url": "https://example.com/img1.jpg", "title": "图片标题" },
      { "url": "https://example.com/img2.jpg", "title": "图片标题2" }
    ],
    "total": 100
  }
}
```

---

## 存储降级链 / Storage Fallback Chain

```
IndexedDB（首选，支持大图 Base64 分片存储）
    ↓ 失败时降级
localStorage（≤5MB 限制）
    ↓ 失败时降级
sessionStorage（刷新后失效）
    ↓ 失败时降级
内存变量（页面关闭后失效）
```

---

## 兼容性 / Compatibility

| 浏览器      | 支持                                  |
| ----------- | ------------------------------------- |
| Chrome 80+  | ✅                                     |
| Firefox 75+ | ✅                                     |
| Edge 80+    | ✅                                     |
| Safari 14+  | ✅（`-webkit-backdrop-filter` 已兼容） |
| Opera       | ✅                                     |

---

## 版本历史 / Changelog

### v3.1.0 (2024)
- 新增作者栏（B站 + GitHub 链接，带 favicon）
- 默认图库从 4 张扩展至 **6 张**
- 深度性能优化：DocumentFragment 批量 DOM 插入、单例 IndexedDB 连接、图片排序修复
- 增加 sessionStorage 降级层
- 兼容性增强：`closest()` polyfill、无 AbortController 环境兼容
- 防重复注入保护（`__SAKURA_BG_LOADED__`）
- IndexedDB 分片排序修复，防止 `getAll()` 顺序不一致
- XSS 防护：图片 URL 与标题均经 `escHtml` 转义
- 本地图片大小警告（> 8MB）
- 8MB+ 图片上传友好提示
- `@grant GM_addStyle` 优化样式注入
- 完整 ARIA 无障碍属性

### v3.0.0 (2024)
- 完整架构重构：4个独立模块（RemoteGalleryProvider / StorageModule / BackgroundModule / UIModule）
- 全新侧边抽屉 UI，玻璃拟态风格
- 拖拽上传支持
- Toast 通知替代 `alert`
- 预留远程图库接口

### v1.x (2023)
- 初版发布，基础背景切换功能

---

## 反馈与联系 / Contact

- **B站**：[https://space.bilibili.com/29058270](https://space.bilibili.com/29058270)
- **GitHub**：[https://github.com/wuxinTLH](https://github.com/wuxinTLH)
- **QQ群**：793513923

---

## 开源协议 / License

本项目基于 [MIT 许可证](./LICENSE) 开源。详细条款请阅读 LICENSE 文件。

This project is open-sourced under the [MIT License](./LICENSE). See the LICENSE file for details.