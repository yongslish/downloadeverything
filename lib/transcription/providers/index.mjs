import { FakeTranscriptionProvider } from './fake-provider.mjs';
import { XunfeiIfasrLlmProvider } from './xunfei-ifasr-llm-provider.mjs';
import { XunfeiLfasrProvider } from './xunfei-lfasr-provider.mjs';

function hasAnyEnv(names) {
  return names.some((name) => typeof process.env[name] === 'string' && process.env[name].trim());
}

export function listTranscriptionProviders() {
  return [
    { id: 'fake', label: 'Fake ASR（演示链路）', configured: true },
    {
      id: 'xunfei-ifasr-llm',
      label: '讯飞录音文件转写大模型',
      configured: hasAnyEnv(['XUNFEI_LLM_ASR_APP_ID', 'XUNFEI_ASR_APP_ID', 'XUNFEI_APP_ID'])
        && hasAnyEnv(['XUNFEI_LLM_ASR_API_KEY', 'XUNFEI_ASR_API_KEY', 'XUNFEI_API_KEY'])
        && hasAnyEnv(['XUNFEI_LLM_ASR_API_SECRET', 'XUNFEI_ASR_API_SECRET', 'XUNFEI_API_SECRET']),
    },
    {
      id: 'xunfei-lfasr',
      label: '讯飞录音文件转写标准版',
      configured: Boolean(process.env.XUNFEI_LFASR_APP_ID && process.env.XUNFEI_LFASR_SECRET_KEY),
    },
  ];
}

export function getTranscriptionProvider(name = 'fake', options = {}) {
  if (name === 'fake') return new FakeTranscriptionProvider();
  if (name === 'xunfei-ifasr-llm') return new XunfeiIfasrLlmProvider(options);
  if (name === 'xunfei-lfasr') return new XunfeiLfasrProvider(options);
  throw new Error(`转写服务 ${name} 尚未接入。当前可用：fake、xunfei-ifasr-llm、xunfei-lfasr。`);
}
