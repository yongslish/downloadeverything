# 本地 FunASR Provider 模块规范

状态：Integrated Verified

## 责任与价值

`funasr-local` 负责把已经标准化为 16 kHz、单声道 WAV 的本地音频转换为统一转录结果。它为个人版提供不依赖付费 API Key 的真实中文转写能力。

## 范围

本模块包含：

- Node.js Provider 适配器。
- 隔离的 Python FunASR Runner。
- 本地 Python 环境和模型安装脚本。
- Provider 注册、页面选择和健康状态。
- 单元、契约、集成和显式启用的真实模型测试。

本模块不包含：

- B 站或小红书内容解析。
- 大模型总结。
- 多用户任务调度、GPU Worker 或弹性扩容。
- 说话人分离。
- 产品级准确率承诺。

## 契约

输入：

```js
{
  audioPath: '/absolute/path/audio.wav',
  language: 'auto | zh-CN | en',
  audio: {
    duration: 12.3,
    sampleRate: 16000,
    channels: 1
  },
  signal: AbortSignal
}
```

输出：

```js
{
  provider: 'funasr-local',
  language: 'zh-CN',
  duration: 12.3,
  text: '转写全文',
  segments: [
    {
      index: 0,
      start: 0,
      end: 12.3,
      speaker: null,
      text: '转写全文',
      words: []
    }
  ],
  raw: {
    model: 'iic/SenseVoiceSmall',
    vadModel: 'fsmn-vad',
    device: 'cpu'
  }
}
```

SenseVoiceSmall 不产生 `sentence_info`（该字段需要 punc_model 加 paraformer 式 token 时间戳）。句级时间戳改为通过 SenseVoice 自带的 `output_timestamp` 输出的词级时间戳，按语音停顿（> 600ms）和最长 15 秒切分得到，不依赖标点模型。这是真实模型输出的切分，不是伪造的词级时间戳或说话人信息。

当 VAD 完全没有检测到语音（例如纯静音、纯背景音乐）时，Provider 退回返回覆盖完整音频的一段文本，避免生成空的 SRT/VTT。

## 配置

默认配置：

```dotenv
FUNASR_PYTHON_PATH=runtime/funasr/bin/python
FUNASR_RUNNER_PATH=scripts/run-funasr.py
FUNASR_MODEL=iic/SenseVoiceSmall
FUNASR_VAD_MODEL=fsmn-vad
FUNASR_DEVICE=cpu
FUNASR_TIMEOUT_MS=1800000
FUNASR_MODEL_CACHE=runtime/funasr-models
```

运行 `npm run setup:funasr` 时才安装依赖和下载模型。普通 `npm install`、`npm test` 不得隐式下载模型。

## 错误与恢复

- Python 环境不存在：提示运行 `npm run setup:funasr`。
- Runner 不存在：报告本地安装不完整。
- Python 进程非零退出：返回经过长度限制的本地错误信息。
- 输出不是合法 JSON 或缺少文本：拒绝把任务标记为完成。
- 超时：终止子进程并报告超时。
- 用户取消：终止子进程并报告取消。
- 模型首次下载失败：任务失败；修复网络或缓存后重试。

## 隐私、成本与安全

- 不上传音频到付费 ASR API。
- 模型和音频均保留在本机。
- 不使用 shell 拼接参数。
- 不把音频全文或本机绝对路径写入服务日志。
- 模型下载产生固定磁盘和网络成本，但无按次 API 费用。

## 验收标准

- Provider 能在无密钥情况下注册和运行。
- 统一结果满足现有 Transcript Schema。
- 缺少依赖、非法输出、超时和取消不会被误报为成功。
- 单元与契约测试不调用网络、不下载模型。
- 模拟 Runner 的上传到导出集成流程通过。
- 现有 Fake、讯飞、下载和小红书回归测试继续通过。
- 真实 SenseVoiceSmall 烟雾测试必须单独执行并记录；干净样本不能替代真实数据准确率评估。
- 有真实语音停顿的多句音频必须产出多个 segment，每个 segment 的起止时间来自真实词级时间戳，不是整段音频的单一伪 segment。
- 纯静音或无人声内容仍然安全退回单一 fallback segment，不报错、不产生空 SRT/VTT。

## 禁用与回滚

不运行 `npm run setup:funasr` 时 Provider 保持未配置状态。回滚代码时删除 `funasr-local` 注册和页面选项即可；现有 Fake 与讯飞 Provider 不依赖本模块。

## 验证证据

环境：Apple M1、8 GB 内存、macOS、CPU 推理、FunASR 1.3.14、SenseVoiceSmall。

- `npm run check`：通过。
- Python Runner AST 语法检查：通过。
- `npm test`：20 项通过，0 失败，包含单元、Provider 契约、超时、取消、非法输出、模拟模型集成和既有功能回归。
- `npm run setup:funasr`：依赖、936 MB SenseVoiceSmall 和 FSMN-VAD 下载及预加载成功。
- 真实 API 烟雾测试：8.15 秒合成中文音频完成上传、FFmpeg、真实模型推理、标准化和 SRT 导出；任务 `ready`、进度 100%，总等待约 12.75 秒。
- 浏览器验收：自动选择本地 FunASR，安装状态和免费提示正确，控制台无错误。

真实测试文本为合成普通话，只证明链路可用，不构成 B 站、小红书、噪声、方言、多人或专有名词场景的准确率结论。

## 句级分段修复验证（2026-07-01）

背景：真实 B 站 14 分 45 秒视频回归时发现，转写全文正确但只有一个覆盖全片的 segment，SRT/VTT 不合格。根因排查（读 FunASR 1.3.14 源码 `funasr/auto/auto_model.py`、`funasr/models/sense_voice/model.py`）确认：`sentence_info` 只在配置了 `punc_model` 且 ASR 模型自带 token 级 `timestamp` 时才会生成，SenseVoiceSmall 两者都不满足，因此 Runner 此前必然一直走"整段音频单一 segment"的兜底路径。

修复：给 `model.generate()` 增加 `output_timestamp=True`，这是 SenseVoice 官方支持的 CTC 强制对齐词级时间戳输出（`funasr/models/sense_voice/model.py:1036` 起的 `output_timestamp` 分支），不需要 punc_model。Runner 新增 `sentence_segments_from_words()`，按词间停顿 > 600ms 或累计时长 > 15 秒切分为句级 segment。

验证证据：

- `scripts/run-funasr.py` AST 语法检查：通过。
- `npm test`：20 项全部通过，0 失败（含 FunASR 契约、超时、取消、回归）。
- `npm run test:funasr-segments`（新增，纯逻辑单元测试，无需 funasr/模型/网络）：8 项全部通过，含一份真实模型输出的回归夹具。
- 真实模型烟雾测试：本机 SenseVoiceSmall + fsmn-vad，合成三句普通话（句间停顿约 1.5 秒）：
  - 全文：`今天的天气非常好，我们决定去公园散步。下午我们讨论了这个项目的技术方案和进度安排。最后，大家一致同意先修复分段的问题，再进行回归测试。`
  - 输出 3 个 segment，起止时间与真实停顿位置一致：`[0.09→4.17]`、`[5.55→9.93]`、`[11.43→17.19]`。
  - 对照：修复前该配置只会产出 1 个覆盖 `[0→17.23]` 的 segment。
- 真实下载素材烟雾测试：对 `runtime/downloads` 中一段真实 7.2 秒小红书视频音轨（背景音乐、无人声）运行，未崩溃，正确识别为几乎无文本内容，安全退回单一 segment。
- 纯静音音频（3 秒）测试：`text` 与 `segments` 均正确返回空，不抛异常。

未验证（记录为 UNVERIFIED）：

- UNVERIFIED：真实 14 分 45 秒 B 站视频的分段效果。
  阻塞：该视频文件不在本仓库/本机上（用户在另一台 Codex 环境下载）。
  影响：无法确认真实语速、专业术语、长时间连续说话场景下 600ms 停顿阈值和 15 秒上限是否需要调参。
  下一步证据：用户用同一批真实链接重新跑一次转写，检查导出的 SRT/VTT 分段是否可读；如分段过长或过碎，再回来调整 `SEGMENT_PAUSE_MS`。
