# DSH API 余额悬浮窗（dsh-api-balance-widget）

> [English](README.en.md) | 中文

一个运行在 **DeepSeek Harness**（DSH）里的动态 Cordis 插件：在页面**右下角**用一张自定义图片实时显示 **DeepSeek API 余额**，余额数字显示在图片内的对话框中，**可拖动定位**，默认**每 20 秒自动刷新**。

![screenshot](docs/screenshot.png)

## 功能特性

- 🖼️ 自定义背景图：余额数字叠加在任意本地图片上（默认读取 `D:\...jpg`，可改）
- 💰 实时余额：调用 DeepSeek 官方接口 `GET https://api.deepseek.com/user/balance`，每 20 秒刷新
- 🖱️ 可拖动：按住余额文字即可把它拖到图片中对话框的任意位置（百分比坐标，图片缩放时保持）
- 📍 固定在页面右下角（注册在根级 `shell.overlay` 槽，不遮挡、不随滚动消失）
- 🔐 不包含任何密钥：运行时通过 credentials 服务读取 `DEEPSEEK_API_KEY`

## 工作原理

```
┌──────────┐   balance/status (20s 轮询)   ┌─────────────────────────────┐
│  Browser │ ◄───────────────────────────  │  DSH Host (动态插件)        │
│ (Client) │ ─── host.call ───────────────► │  ├─ credentials.resolve(    │
│          │                               │  │    'DEEPSEEK_API_KEY')    │
│ 右下角    │  balance/image (base64 dataURL)│  ├─ subprocess: node -e fetch│
│ shell.    │ ◄───────────────────────────  │  │    api.deepseek.com/...   │
│ overlay   │                               │  └─ fs.readBytes(IMAGE_PATH) │
└──────────┘                               └─────────────────────────────┘
```

- **余额请求**：DSH 动态插件沙箱禁用了 `fetch`，且 Windows 自带 `curl`（schannel）的 TLS 在部分环境不可用，因此通过 `subprocess` 服务拉起 **Node 子进程**（Node 自带 TLS 栈）完成 HTTPS 请求。
- **图片传输**：宿主用**字节精确的 base64** 编码把图片转成 data URL 传给浏览器。⚠️ 注意：宿主内置 `btoa` 按 UTF-8 编码，不能直接用于二进制图片（这正是本插件早期版本"悬浮窗消失"的根因，详见 `plugin/host.js` 中的 `bytesToBase64`）。

## 安装 / 加载

这是一个动态 Cordis 插件（进程内定义，无需构建）。在任意 DSH 会话中：

1. 让 AI 助手用 `cordis_define` 工具定义插件：
   - `plugin/host.js` 的内容 → `code.host`
   - `plugin/client.js` 的内容 → `code.client`
   - `pluginId` 前缀建议：`blnc`
2. 用 `cordis_run` 运行（首次需要你在界面中批准）。
3. 页面右下角即出现悬浮窗。

也可以直接把两个文件内容粘贴给 AI 助手，让它帮你定义。

## 配置

### 1. 背景图片（`plugin/host.js` 顶部配置区）

```js
const IMAGE_PATH = 'D:\\1234\\3e8a47e3f5fe5e931f63bffce75cc04d.jpg'; // 换成你自己的图片绝对路径
const IMAGE_DIR  = 'D:\\1234';                                        // 图片所在目录
```

### 2. 刷新间隔（`plugin/client.js` 顶部配置区）

```js
const REFRESH_MS = 20000; // 毫秒；宿主缓存 TTL（host.js 的 TTL_MS）建议略小于此值
```

### 3. 余额气泡默认位置（`plugin/client.js` 顶部配置区）

```js
const DEFAULT_POS = { x: 30, y: 14 }; // 图片内百分比坐标
```

### 4. API Key

无需在代码中配置。确保 DSH 的 credentials 服务中存在 `DEEPSEEK_API_KEY`
（一般位于 `~/.dsh/.credentials.yaml`，或在启动环境变量中导出）。

## 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 悬浮窗完全不显示（早期版本） | 宿主 `btoa` 按 UTF-8 编码破坏了图片二进制。已改用字节精确 base64，无需处理 |
| 显示"未配置 DEEPSEEK_API_KEY" | 在 `~/.dsh/.credentials.yaml` 配置 Key 或导出环境变量 |
| 余额不更新 | 检查网络能否访问 `api.deepseek.com`；查看浏览器 F12 控制台与运行卡片诊断 |
| 想换余额来源 | 修改 `BALANCE_URL` 与 `fetchBalance()` 的解析逻辑 |

## 许可证

[MIT](LICENSE)

## 声明

本项目与 DeepSeek 官方无关，仅使用 DeepSeek 公开 API。使用前请遵守
[DeepSeek 服务条款](https://platform.deepseek.com/) 与您所在地区的法律法规。
