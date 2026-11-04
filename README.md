# M3U8 下载器

纯网页实现的 HLS（m3u8）下载与预览工具，**零后端、零安装**，解析、下载、合并与保存全部在浏览器本地完成。可部署到 Cloudflare Pages、Vercel、GitHub Pages 或任意静态文件服务器。

基于 [caiweiming/get-m3u8](https://github.com/caiweiming/get-m3u8)（MIT）修改，做了以下增强：

- **MP4 / TS 双格式输出**：默认保存为 MP4（mux.js 在浏览器内转封装），也可切换为 TS，全部能力默认可用。
- **控制台注入跨域方案**：遇到源站禁止跨域时，复制一段代码到视频源站 F12 控制台执行，下载器注入源站同源上下文，绕过 CORS 限制。
- **柔和黑白配色**：简洁干净的极简界面，主题自动跟随系统深浅色。

## 功能

- 解析媒体播放列表与多清晰度（master）播放列表，可选分辨率。
- 在线预览播放，支持外部音轨与 WebVTT 字幕。
- 支持 AES-128 加密分片解密。
- 输出 MP4（默认，mux.js 转封装）或 TS（分片直接拼接）。
- 全部下载 / 按分片序号指定范围下载。
- 任务 FIFO 队列，单任务分片并发 1–8（默认 4），显示速度与进度。
- 分片级失败重试、连续前缀强制合并导出。
- 快捷下载 URL 参数（`?source=...&format=mp4&concurrency=4` 等）。

## 使用

### 常规下载

1. 点击“新建下载”，粘贴 m3u8 地址。
2. 选择保存格式（TS / MP4）、下载范围与并发数。
3. 若有多个清晰度，先选择分辨率。
4. 下载完成后浏览器自动保存文件。

### 跨域下载（源站禁止跨域时）

纯静态站下载依赖目标源允许跨域（CORS）。当源站禁止跨域时：

1. 点击“新建下载”弹窗里的“复制跨域代码”。
2. 打开视频源站页面，按 `F12` 打开控制台（Console）。
3. 粘贴代码并回车，页面右下角出现“M3U8 注入下载”面板。
4. 在面板里粘贴 m3u8 地址、选择格式并下载。面板在源站同源上下文运行，分片请求不再受 CORS 限制。

> 说明：跨域注入面板内置独立的解析 / 下载 / AES-128 解密 / MP4 转封装逻辑，运行在源站页面内，不依赖主工具页。

## 部署

项目为纯静态站点，无构建步骤、无运行时依赖（第三方库已随附在 `vendor/`）。

### Cloudflare Pages

1. 将本仓库推送到 GitHub。
2. 登录 Cloudflare 控制台 → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**，选择本仓库。
3. 构建设置：
   - Framework preset：**None**
   - Build command：（留空）
   - Build output directory：**/**（或留空，指向仓库根目录）
4. 点击 **Save and Deploy**。

### Vercel

1. 导入 GitHub 仓库。
2. Framework Preset 选择 **Other**；无 Build Command；Output Directory 留空（默认根目录）。
3. Deploy。

### 本地调试

任意静态服务器均可，例如：

```bash
python -m http.server 4173
# 打开 http://127.0.0.1:4173/
```

建议通过 HTTPS 访问（部分下载与剪贴板能力依赖安全上下文）。

## 技术栈与第三方组件

| 组件 | 文件 | 版本 | 许可证 | 用途 |
| --- | --- | --- | --- | --- |
| hls.js | `vendor/hls.min.js` | 1.6.16 | Apache-2.0 | 预览播放 |
| mux.js | `vendor/mux.min.js` | 6.3.0 | Apache-2.0 | TS→MP4 转封装 |
| StreamSaver | `vendor/streamsaver*.js` | 2.0.5 | MIT | 边下边存 |
| Lucide | `vendor/lucide.min.js` | 0.321.0 | ISC | 图标 |

本项目业务代码沿用上游 **MIT License**（见 `LICENSE`）。

## 使用限制

- 目标播放列表、密钥与分片必须允许浏览器访问；跨域受限时请使用上述“跨域下载”方案。
- DRM 保护、需平台登录或依赖特定请求头/Cookie 的资源通常无法下载。
- 分片保存在当前页面内存，刷新或关闭页面会丢失未完成任务。
- 请仅下载你拥有访问与保存权限的内容，并遵守内容服务方条款及适用法律。
