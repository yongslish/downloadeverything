# Download Everything：下载 Provider 架构交接

日期：2026-06-26

## 当前目标

下载功能从“server 里写一堆平台 if/else”重构为 Provider 架构。这样小红书、B站可以各走最适合自己的解析/下载方式，同时前端和任务队列保持统一。

> 更新（2026-07-02）：YouTube、抖音的支持已经整体移除，而不是仅从界面隐藏——当前产品方向只把 B站视频、小红书图文/视频作为学习笔记来源，这两个平台暂时不需要。因为 Provider 接口本身可插拔，之后如果要重新支持，按“新增平台的方式”一节接回来即可，不影响其余架构。

用户看到的体验仍然是：

```text
粘贴链接 → 开始下载 → 当前网站返回文件
```

内部实现可以按平台切换 Provider，但不要把第三方解析细节暴露成用户必须理解的步骤。

## 当前模块

```text
server.mjs
  └─ lib/download/providers/index.mjs
      ├─ xhs-provider.mjs      小红书专用：XHS-Downloader + 本服务下载/打包
      └─ ytdlp-provider.mjs    通用视频站，目前仅接入 Bilibili

lib/download/url.mjs           统一识别链接、域名、XHS CDN 直链
```

## 平台策略

| 平台 | 当前 Provider | 说明 |
| --- | --- | --- |
| 小红书笔记/视频 | `XhsProvider` | 先调用本机 XHS-Downloader 解析详情，再由本服务下载；视频返回 MP4，图文返回 ZIP。 |
| 小红书 CDN 直链 | `XhsProvider` | 跳过解析器，直接下载媒体文件；`http://*.xhscdn.com` 会升级为 HTTPS。 |
| Bilibili | `YtDlpProvider` | 走 yt-dlp。 |

## 新增平台的方式

1. 在 `lib/download/url.mjs` 增加域名识别。
2. 在 `lib/download/providers/` 新建 Provider，例如 `kuaishou-provider.mjs`。
3. Provider 至少实现：

```js
export class XxxProvider {
  id = 'xxx';

  canHandle(job) {
    return job.platform === '某平台';
  }

  async download(job) {
    // 设置 job.progress / job.message
    // 完成后设置 job.downloadPath / job.filename
  }
}
```

4. 在 `lib/download/providers/index.mjs` 注册 Provider。
5. 给 `test/basic-flow.test.mjs` 增加一个不依赖真实外网的 mock 测试。

## 小红书 Cookie

当前支持三种方式：

1. 页面高级选项临时粘贴 Cookie：只用于当前任务，不写入文件。
2. `runtime/xhs-cookie.txt`：本机长期使用，不打包、不提交。
3. 环境变量 `XHS_COOKIE`：适合临时启动。

不要把真实 Cookie 写进源码、文档或压缩包。

## 讯飞转写密钥

真实密钥放在：

```text
runtime/secrets.env
```

压缩包只保留：

```text
runtime/secrets.env.example
```

回家继续开发时：

```bash
cp runtime/secrets.env.example runtime/secrets.env
```

然后填自己的讯飞 APPID / APIKey / APISecret 或 SecretKey。

## 打包原则

压缩包应该包含源码、文档、测试、脚本和示例配置；不包含：

- `node_modules/`
- `runtime/downloads/`
- `runtime/transcriptions/`
- `runtime/python/`
- `runtime/secrets.env`
- `runtime/xhs-cookie.txt`
- 真实下载出来的视频、图片、字幕和转写结果

这样带回家以后是干净的源码包，运行 `npm install && npm run setup && npm start` 就能继续。
