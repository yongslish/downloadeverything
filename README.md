# Download Everything

一个免登录的个人 Web 下载工具原型。它提供面向手机和电脑的同一套界面，并只接受公开、非 DRM 的 YouTube、Bilibili、抖音和小红书链接。

## 运行

要求：Node.js 20+、Python 3.12+ 与 Git。安装脚本会在项目内创建独立 Python 环境，安装通用下载引擎，并下载固定版本的小红书解析组件；如需合并分离的视频/音频轨，或导出 MP3，还需要安装 FFmpeg。

```bash
npm install
npm run setup
npm start
```

然后打开 [http://localhost:3030](http://localhost:3030)。手机访问时，让手机和电脑连在同一 Wi-Fi，并使用电脑的局域网 IP 加端口 `3030` 访问；如需对外开放，请通过 HTTPS 反向代理发布，不要直接暴露开发端口。

## 小红书解析

小红书任务会先启动项目内部的解析组件（仅监听 `127.0.0.1:5556`），取得笔记的公开媒体地址后，再由本服务下载并交给浏览器；视频会返回单个文件，图文笔记会打包为 ZIP。页面不会跳转或调用第三方下载网站。

解析组件固定使用 [XHS-Downloader](https://github.com/JoeanAmier/XHS-Downloader) 的开源版本；该项目采用 GPL-3.0 许可证。若要把本项目公开分发或二次发布，请先按该许可证审查你的分发方式。

更容易解析成功的输入：

- 小红书 App 刚复制出来的完整分享链接，尤其是带 `xsec_token` 的链接。
- `xhslink.com` 短链接，本工具会交给 XHS-Downloader 展开。
- 已经拿到的 `xhscdn.com` / `xhscdn.net` / `ci.xiaohongshu.com` 媒体直链，本工具会跳过解析器直接保存。

如果你想给本机解析器补一个无登录 Cookie，可以把小红书网页版 Cookie 放到 `runtime/xhs-cookie.txt`，或启动前设置环境变量 `XHS_COOKIE="..."`。这不是账号登录功能，只是让 XHS-Downloader 请求小红书页面时带上本机浏览器已有的访问上下文。

页面里也提供了“小红书访问 Cookie（可选，提高成功率）”。匿名解析失败时，可以把当前浏览器访问小红书网页版时的 Cookie 临时粘进去，本工具只会随本次下载任务传给本机 XHS-Downloader，不会写入下载结果。  

为什么带 `xsec_token` 仍可能失败：当前接入的 XHS-Downloader 主要通过请求小红书详情页 HTML，并从 `window.__INITIAL_STATE__` 提取笔记数据。如果小红书对当前服务器出口 IP / 无 Cookie 请求返回 `404/sec_...` 风控页或“当前笔记暂时无法浏览”，解析器拿到的就是错误页，而不是笔记详情，自然无法生成视频或图片直链。很多在线解析站通常会维护自己的 Cookie、代理、移动端接口签名或缓存池，所以匿名成功率会和本机纯服务端请求不同。

## 视频/音频转文字

页面已提供第一版“转文字”入口：可以拖拽上传本地视频或音频文件，系统会创建转写任务、生成标准转录结果，并导出 TXT、SRT、VTT、JSON。

当前已接入四个 Provider：

- `funasr-local`：免费的本地真实转写，默认使用 SenseVoiceSmall + FSMN-VAD；音频和模型都留在本机，不需要 API Key。
- `xunfei-ifasr-llm`：讯飞「录音文件转写大模型」。适合优先使用免费 5 小时额度，页面会提取并展示纯文字结果。
- `xunfei-lfasr`：讯飞「录音文件转写标准版」。适合继续兼容你已经开通的标准版服务。
- `fake`：演示链路，不会真实识别音频内容，只用来验证上传、任务队列、结果展示和导出。

个人使用推荐先安装本地 FunASR：

```bash
npm run setup:funasr
```

这个命令会在 `runtime/funasr` 创建隔离 Python 环境，并把约 1 GB 的 SenseVoiceSmall 模型缓存到 `runtime/funasr-models`。第一次安装还会下载 PyTorch 等依赖，整体需要约 2～3 GB 磁盘空间。普通 `npm install` 和 `npm test` 不会下载模型。

安装完成后重新启动服务，页面会自动优先选择“本地 FunASR（免费）”。默认使用 CPU；基础款 M4 Mac mini 足以用于单任务个人转写。模型首次载入需要几秒，转写过程中 CPU 占用升高属于正常现象。

讯飞作为可选云端 Provider，有两种配置方式：

1. 后端长期配置：把 `runtime/secrets.env.example` 复制为 `runtime/secrets.env`，填入自己的密钥后重启服务。
2. 页面临时配置：展开“讯飞密钥（可选，只在本机使用）”，填写 APPID / APIKey / APISecret；这些值会保存在当前浏览器的 localStorage，并随转写请求发给本机后端，不写入转写结果文件。

```bash
cp runtime/secrets.env.example runtime/secrets.env
```

`runtime/secrets.env` 示例：

```dotenv
XUNFEI_LLM_ASR_APP_ID=你的 APPID
XUNFEI_LLM_ASR_API_KEY=你的 APIKey
XUNFEI_LLM_ASR_API_SECRET=你的 APISecret
```

如果要使用标准版，则填写：

```dotenv
XUNFEI_LFASR_APP_ID=你的 APPID
XUNFEI_LFASR_SECRET_KEY=你的 SecretKey
```

请不要把 `runtime/secrets.env` 提交、打包或截图公开。若密钥已经出现在截图或聊天记录里，建议在讯飞控制台重置后再长期使用。若将工具公开给其他人，建议让用户填写自己的 Key，不要把你的个人 Key 作为公开服务的默认额度。

支持的上传格式：`mp4`、`mov`、`mkv`、`webm`、`mp3`、`m4a`、`wav`、`aac`、`flac`。单文件上限 500 MB。

## 当前边界

- 无登录、无下载历史；任务和临时文件最多保留 30 分钟。
- 同时只运行一个下载任务，另外最多排队三个，单文件上限 750 MB。
- 同时只运行一个转写任务，另外最多排队三个；本地 FunASR 不按次收费，讯飞真实转写需要配置密钥并消耗对应平台额度。
- 后端仅接收四个受支持域名的 HTTPS 链接，不接受自定义下载参数。
- 小红书解析依赖笔记在当前网络环境中可访问。裸 `explore/作品ID` 链接很容易缺少 `xsec_token` 或被平台风控；平台的风控、失效链接或访问限制会使解析失败。
- 不支持付费、私密、DRM 保护或需要绕过登录/访问限制的内容。使用前请确认你有保存内容的权利，并遵守相应平台条款。

## 开发交接

下载链路已经拆成 Provider 架构，小红书、YouTube、B站、抖音可以在统一任务队列下走不同实现。继续开发前先看 [`docs/download-provider-architecture.md`](./docs/download-provider-architecture.md)。

## 部署提示

这个版本适合自己使用或受控的小范围访问。若将它公开发布，应至少在反向代理层加入 HTTPS、速率限制、访问控制与日志脱敏；不要将下载端点作为开放代理对外暴露。
