export class FakeTranscriptionProvider {
  name = 'fake';

  async transcribe({ source, audio }) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const filename = source?.filename || '这个文件';
    const extractionNote = audio?.usedFfmpeg
      ? '系统已经完成音频标准化。'
      : '当前使用 Fake ASR，因此没有真正调用语音识别服务。';
    const segments = [
      {
        index: 0,
        start: 0,
        end: 4.2,
        speaker: null,
        text: `这是 ${filename} 的演示转录。`,
        words: [],
      },
      {
        index: 1,
        start: 4.2,
        end: 9.8,
        speaker: null,
        text: extractionNote,
        words: [],
      },
      {
        index: 2,
        start: 9.8,
        end: 15.6,
        speaker: null,
        text: '这一步的目的是先跑通上传、任务状态、结果展示和字幕导出。后续接入讯飞或其他 ASR 后，这里会替换成真实语音内容。',
        words: [],
      },
    ];
    return {
      provider: this.name,
      language: 'zh-CN',
      duration: 15.6,
      text: segments.map((segment) => segment.text).join('\n'),
      segments,
      raw: {
        mode: 'development-fixture',
      },
    };
  }
}
