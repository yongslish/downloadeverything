import { useEffect, useState } from 'react';
import { PixelShell } from '../components/PixelShell';
import { useSkin, SKINS, THEMES, type Skin, type Theme } from '../theme/skin';
import './ConfigPage.css';

// Simple localStorage backed field. We namespace under downspace.* so nothing
// collides with the app-wide skin/theme keys already managed by useSkin.
function useLocalString(key: string, initial: string): [string, (v: string) => void] {
  const [value, setValue] = useState<string>(() => {
    try {
      return localStorage.getItem(`downspace.${key}`) ?? initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(`downspace.${key}`, value); } catch { /* ignore */ }
  }, [key, value]);
  return [value, setValue];
}

const SKIN_LABEL: Record<Skin, { name: string; swatch: string }> = {
  'pixel-retro': { name: 'Pixel Retro', swatch: '#E0F8D0' },
  kawaii: { name: 'Kawaii', swatch: '#FFF6E9' },
  y2k: { name: 'Y2K', swatch: '#FFF0F7' },
};

const THEME_LABEL: Record<Theme, string> = {
  pixel: 'Pixel 系列',
  newspaper: 'Newspaper',
};

interface AsrOption {
  key: string;
  name: string;
  hint: string;
  available: boolean;
  setupCmd?: string;
}

const ASR_OPTIONS: AsrOption[] = [
  {
    key: 'native+funasr',
    name: '原生字幕优先 + 本地 FunASR 兜底',
    hint: '默认 · 零成本 · 音频不出本机',
    available: true,
    setupCmd: 'npm run setup:funasr',
  },
  {
    key: 'xunfei',
    name: '讯飞大模型 API',
    hint: '按分钟计费 · 需 Key',
    available: true,
  },
  {
    key: 'tencent',
    name: '腾讯云 ASR',
    hint: '按分钟计费 · 需 Key · 未接入',
    available: false,
  },
  {
    key: 'openai',
    name: 'OpenAI Transcribe',
    hint: '按 Token · 需 Key · 25MB 上限 · 未接入',
    available: false,
  },
];

export function ConfigPage() {
  const { skin, theme, setSkin, setTheme } = useSkin();

  const [botName, setBotName] = useLocalString('downbot.name', 'DownBot');
  const [botHover, setBotHover] = useLocalString('downbot.hover', 'on');
  const [asrChoice, setAsrChoice] = useLocalString('asr.choice', 'native+funasr');

  const [xunfeiAppId, setXunfeiAppId] = useLocalString('asr.xunfei.appId', '');
  const [xunfeiApiKey, setXunfeiApiKey] = useLocalString('asr.xunfei.apiKey', '');
  const [xunfeiApiSecret, setXunfeiApiSecret] = useLocalString('asr.xunfei.apiSecret', '');

  const [llmProvider, setLlmProvider] = useLocalString('llm.provider', 'anthropic');
  const [llmModel, setLlmModel] = useLocalString('llm.model', 'claude-sonnet-4-6');
  const [llmKey, setLlmKey] = useLocalString('llm.key', '');

  const [promptTemplate, setPromptTemplate] = useLocalString(
    'prompt.template',
    '你是一名帮我把视频/图文整理成学习笔记的助理。请输出:一句话总结 · 核心观点(每条附时间戳)· 内容结构 · 行动建议 · 值得追问的问题。',
  );

  const [obsidianVault, setObsidianVault] = useLocalString('export.obsidian', '');

  const [savedFlash, setSavedFlash] = useState(false);

  // Any value change is auto-persisted by useLocalString, so "save" is really
  // just a "yes, this stuck" affirmation for the user.
  function flashSaved() {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  return (
    <PixelShell
      active="config"
      brandLabel="config"
      bottomBar={
        <>
          <span>▲▼ scroll</span>
          <span onClick={flashSaved} style={{ cursor: 'pointer' }}>[A] save changes</span>
          <span>[B] back</span>
          <span>storage ▓▓░░░░ 24%</span>
        </>
      }
    >
      <div className="cf-body">
        {/* SKIN */}
        <div className="cf-divider">── skin ─────────────────────────────</div>
        <div className="cf-row">
          <span className="cf-lbl">主骨架</span>
          {THEMES.map((t) => (
            <label
              key={t}
              className={`cf-radio ${theme === t ? 'cf-radio--on' : ''}`}
              onClick={() => setTheme(t)}
            >
              <span className="cf-dot" />
              {THEME_LABEL[t]}
              {t === 'newspaper' && <span className="cf-hint">(独立骨架 · 未落地)</span>}
            </label>
          ))}
        </div>
        {theme === 'pixel' && (
          <div className="cf-row">
            <span className="cf-lbl">Pixel 皮肤</span>
            {SKINS.map((s) => (
              <label
                key={s}
                className={`cf-radio ${skin === s ? 'cf-radio--on' : ''}`}
                onClick={() => setSkin(s)}
              >
                <span className="cf-dot" />
                <span className="cf-swatch" style={{ background: SKIN_LABEL[s].swatch }} />
                {SKIN_LABEL[s].name}
              </label>
            ))}
          </div>
        )}

        {/* DOWNBOT */}
        <div className="cf-divider">── downbot ──────────────────────────</div>
        <div className="cf-row">
          <span className="cf-lbl">名字</span>
          <input
            className="cf-input cf-input--narrow"
            value={botName}
            onChange={(e) => setBotName(e.target.value)}
            maxLength={16}
          />
          <span className="cf-hint">她会用这个名字自称</span>
        </div>
        <div className="cf-row">
          <span className="cf-lbl">Hover 弹语</span>
          {(['on', 'off'] as const).map((v) => (
            <label
              key={v}
              className={`cf-radio ${botHover === v ? 'cf-radio--on' : ''}`}
              onClick={() => setBotHover(v)}
            >
              <span className="cf-dot" />
              {v === 'on' ? '开' : '关'}
            </label>
          ))}
        </div>

        {/* ASR */}
        <div className="cf-divider">── ASR provider ─────────────────────</div>
        <div className="cf-provider-list">
          {ASR_OPTIONS.map((opt) => {
            const selected = asrChoice === opt.key;
            return (
              <div className="cf-provider-row" key={opt.key}>
                <label
                  className={`cf-radio ${selected ? 'cf-radio--on' : ''} ${opt.available ? '' : 'cf-radio--disabled'}`}
                  onClick={() => opt.available && setAsrChoice(opt.key)}
                >
                  <span className="cf-dot" />
                  {opt.name}
                </label>
                <span className="cf-provider-hint">{opt.hint}</span>
                {opt.setupCmd && (
                  <code className="cf-provider-cta" title="终端里跑这条命令">
                    $ {opt.setupCmd}
                  </code>
                )}
              </div>
            );
          })}
        </div>
        {asrChoice === 'xunfei' && (
          <>
            <div className="cf-row">
              <span className="cf-lbl">Xunfei APPID</span>
              <input
                className="cf-input cf-input--narrow"
                value={xunfeiAppId}
                onChange={(e) => setXunfeiAppId(e.target.value)}
                placeholder="app_id"
              />
            </div>
            <div className="cf-row">
              <span className="cf-lbl">API Key</span>
              <input
                className="cf-input cf-input--narrow"
                type="password"
                value={xunfeiApiKey}
                onChange={(e) => setXunfeiApiKey(e.target.value)}
                placeholder="api_key"
              />
            </div>
            <div className="cf-row">
              <span className="cf-lbl">API Secret</span>
              <input
                className="cf-input cf-input--narrow"
                type="password"
                value={xunfeiApiSecret}
                onChange={(e) => setXunfeiApiSecret(e.target.value)}
                placeholder="api_secret"
              />
              <span className="cf-hint">本地存储 · 不上传</span>
            </div>
          </>
        )}

        {/* LLM */}
        <div className="cf-divider">── LLM ──────────────────────────────</div>
        <div className="cf-row">
          <span className="cf-lbl">Provider</span>
          {(['anthropic', 'openai', 'local'] as const).map((p) => (
            <label
              key={p}
              className={`cf-radio ${llmProvider === p ? 'cf-radio--on' : ''}`}
              onClick={() => setLlmProvider(p)}
            >
              <span className="cf-dot" />
              {p === 'anthropic' ? 'Anthropic' : p === 'openai' ? 'OpenAI' : 'Local'}
            </label>
          ))}
          <span className="cf-hint">LLM 合成尚未接入 pipeline (见 PRD §九)</span>
        </div>
        <div className="cf-row">
          <span className="cf-lbl">Model</span>
          <select
            className="cf-select"
            value={llmModel}
            onChange={(e) => setLlmModel(e.target.value)}
          >
            {llmProvider === 'anthropic' && (
              <>
                <option value="claude-opus-4-7">claude-opus-4-7 (最强,慢)</option>
                <option value="claude-sonnet-4-6">claude-sonnet-4-6 (推荐)</option>
                <option value="claude-haiku-4-5">claude-haiku-4-5 (快,便宜)</option>
              </>
            )}
            {llmProvider === 'openai' && (
              <>
                <option value="gpt-4o">gpt-4o</option>
                <option value="gpt-4o-mini">gpt-4o-mini</option>
              </>
            )}
            {llmProvider === 'local' && <option value="local">ollama / lm-studio</option>}
          </select>
        </div>
        <div className="cf-row">
          <span className="cf-lbl">API Key</span>
          <input
            className="cf-input cf-input--narrow"
            type="password"
            value={llmKey}
            onChange={(e) => setLlmKey(e.target.value)}
            placeholder={llmProvider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
          />
          <span className="cf-hint">本地存储 · 不上传</span>
        </div>

        {/* PROMPT */}
        <div className="cf-divider">── prompt template ──────────────────</div>
        <div className="cf-row cf-row--start">
          <span className="cf-lbl" style={{ paddingTop: 8 }}>当前模板</span>
          <div style={{ flex: 1 }}>
            <textarea
              className="cf-textarea"
              value={promptTemplate}
              onChange={(e) => setPromptTemplate(e.target.value)}
            />
            <div className="cf-hint" style={{ marginTop: 4 }}>
              每份笔记会保存所用 Prompt 的 hash (PRD §九),两次结果不一致时可归因。
            </div>
          </div>
        </div>

        {/* EXPORT */}
        <div className="cf-divider">── export ───────────────────────────</div>
        <div className="cf-row">
          <span className="cf-lbl">Obsidian vault</span>
          <input
            className="cf-input cf-input--vault"
            value={obsidianVault}
            onChange={(e) => setObsidianVault(e.target.value)}
            placeholder="/Users/你/Documents/Obsidian/downspace"
          />
        </div>
        <div className="cf-row">
          <span className="cf-lbl">Notion</span>
          <span className="cf-hint">v2 上线 · 目前占位</span>
        </div>

        {/* DATA */}
        <div className="cf-divider">── data ─────────────────────────────</div>
        <div className="cf-row">
          <span className="cf-lbl">存储</span>
          <span className="cf-status">
            数据存 <code>runtime/notes/</code> · 音频 <code>runtime/downloads/</code> · 模型 <code>runtime/funasr-models/</code>
          </span>
        </div>
        <div className="cf-row">
          <span className="cf-lbl">关于</span>
          <span className="cf-status">
            Downspace v0.1a ·{' '}
            <a href="/docs/design-system.md" target="_blank" rel="noreferrer">design system</a>
            {' · '}
            <a href="/docs/product-requirements.md" target="_blank" rel="noreferrer">PRD</a>
          </span>
        </div>

        {savedFlash && <div className="cf-saved">✓ 已保存 (改动即时写入 localStorage)</div>}
      </div>
    </PixelShell>
  );
}
