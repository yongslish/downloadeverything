// Calls DeepSeek's OpenAI-compatible chat completions API to synthesize a
// learning-note summary (一句话总结 / 核心观点 / 行动建议) from a Canonical
// Document's already-extracted text. See docs/product-requirements.md §九
// for the target shape and docs/mockups/pixel-result.html for how it's
// displayed.
//
// Every "core point" the model returns must reference a real block index
// from the input — never a timestamp the model states directly. The server
// resolves that index back to the block's actual start/end here, so a
// reader can always jump to the exact original passage a claim came from
// (docs/product-requirements.md §三 原则 3: 可追溯). This also makes the
// output robust to the model inventing a plausible-looking but wrong
// timestamp, which free-form generation would not protect against.

const API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';
const PROMPT_VERSION = 'deepseek-v1';

const SYSTEM_PROMPT = `你是一名帮助用户把视频/图文内容整理成学习笔记的助理。
输入是一段带编号的原文（每行格式为「(编号) [可选秒数] 文本」）。
请只依据输入内容，输出严格的 JSON，不要输出任何多余文字（不要用 markdown 代码块包裹），格式为：
{
  "summary": "一句话总结，不超过 60 字",
  "keyPoints": [ { "text": "核心观点，不超过 40 字", "blockIndex": 数字 } ],
  "actionItems": ["可执行的行动建议，最多 3 条"]
}
keyPoints 的 blockIndex 必须是输入里真实出现过的编号，用来让读者跳转回原文——不要编造编号，也不要在 text 里自己写时间戳。
keyPoints 挑 3-6 条信息量最高的即可，避免重复覆盖同一个点。如果原文内容不足以支撑某一项，允许返回空数组，不要编造。`;

export function isDeepSeekConfigured(apiKey = process.env.DEEPSEEK_API_KEY) {
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
}

function buildIndexedTranscript(blocks) {
  return blocks
    .map((block) => {
      const hasStart = block.start !== null && Number.isFinite(block.start);
      const ts = hasStart ? `[${Math.floor(block.start)}s] ` : '';
      return `(${block.index}) ${ts}${block.text}`;
    })
    .join('\n');
}

/**
 * @param {object} document - a Canonical Document (lib/core/canonical-document.mjs).
 * @param {object} [options]
 * @param {string} [options.apiKey] - defaults to process.env.DEEPSEEK_API_KEY.
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{summary: string, keyPoints: Array, actionItems: string[], provider: string, model: string, promptVersion: string, generatedAt: string}>}
 */
export async function synthesizeLearningNotes(document, { apiKey = process.env.DEEPSEEK_API_KEY, signal } = {}) {
  if (!isDeepSeekConfigured(apiKey)) {
    throw new Error('未配置 DEEPSEEK_API_KEY，请在 runtime/secrets.env 中设置后重启服务。');
  }
  const blocks = Array.isArray(document?.blocks) ? document.blocks : [];
  if (!blocks.length) {
    throw new Error('文档没有可供总结的正文内容。');
  }

  const transcript = buildIndexedTranscript(blocks);
  const requestBody = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `标题：${document.title || '（无标题）'}\n\n${transcript}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  };

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    });
  } catch (error) {
    throw new Error(`无法连接 DeepSeek API：${error instanceof Error ? error.message : String(error)}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`DeepSeek API 返回错误（状态码 ${response.status}）：${detail.slice(0, 300)}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('DeepSeek 返回了空内容。');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('DeepSeek 返回的不是合法 JSON。');
  }

  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  if (!summary) {
    throw new Error('DeepSeek 返回结果缺少一句话总结。');
  }

  const blockByIndex = new Map(blocks.map((block) => [block.index, block]));
  const keyPoints = (Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [])
    .map((item) => {
      const text = typeof item?.text === 'string' ? item.text.trim() : '';
      const block = blockByIndex.get(item?.blockIndex);
      if (!text || !block) return null;
      return { text, start: block.start, end: block.end, blockIndex: block.index };
    })
    .filter(Boolean);

  const actionItems = (Array.isArray(parsed.actionItems) ? parsed.actionItems : [])
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);

  return {
    summary,
    keyPoints,
    actionItems,
    provider: 'deepseek',
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
  };
}
