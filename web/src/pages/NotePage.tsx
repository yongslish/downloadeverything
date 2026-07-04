import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PixelShell } from '../components/PixelShell';
import './NotePage.css';

interface Block {
  index: number;
  type: 'text';
  source: 'native-caption' | 'post-body' | 'ocr' | 'asr' | 'metadata';
  start: number | null;
  end: number | null;
  text: string;
  imageIndex: number | null;
}

interface CanonicalDocument {
  id: string;
  title: string;
  author: { name: string; id: string };
  source: { platform: string; url: string; contentType?: string };
  publishedAt: string | null;
  tags: string[];
  metrics: Record<string, unknown>;
  blocks: Block[];
  images: Array<{ index: number; path: string; ocrText: string }>;
  extraction: { asrProvider: string | null };
  createdAt: string;
}

function pad2(n: number) { return String(Math.floor(n)).padStart(2, '0'); }
function formatTs(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  const total = Math.max(0, Math.round(seconds));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

function humanDuration(blocks: Block[]): string {
  const last = blocks.reduce<number>((acc, b) => Math.max(acc, b.end ?? b.start ?? 0), 0);
  const ts = formatTs(last);
  return ts ?? '—';
}

export function NotePage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<CanonicalDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeBlock, setActiveBlock] = useState<number | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`/api/notes/${id}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `请求失败(${r.status})`);
        }
        return r.json();
      })
      .then((data: CanonicalDocument) => { if (!cancelled) setDoc(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : '拉取失败'); });
    return () => { cancelled = true; };
  }, [id]);

  const timestampedBlocks = useMemo(
    () => (doc?.blocks ?? []).filter((b) => b.start !== null && b.text.trim().length > 0),
    [doc?.blocks],
  );
  // Highlights = the first 3 non-trivial blocks with a timestamp, as a
  // placeholder until the LLM summary step is wired up.
  const highlights = useMemo(
    () => timestampedBlocks.filter((b) => b.text.length > 8).slice(0, 3),
    [timestampedBlocks],
  );

  function jumpTo(blockIndex: number) {
    setActiveBlock(blockIndex);
    const el = blockRefs.current.get(blockIndex);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setActiveBlock(null), 800);
  }

  async function copyMarkdown() {
    if (!id) return;
    try {
      const res = await fetch(`/api/notes/${id}/markdown`);
      if (!res.ok) throw new Error('markdown 拉取失败');
      const md = await res.text();
      await navigator.clipboard.writeText(md);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  }

  if (error) {
    return (
      <PixelShell active="file" brandLabel="save file" navItems={[
        { key: 'archive', label: 'archive', to: '/archive' },
        { key: 'file', label: 'file.???', to: '#' },
      ]}>
        <div className="rs-empty">
          没能打开这份笔记 · {error}
          <div style={{ marginTop: 12 }}><Link to="/">▶ 回首页</Link></div>
        </div>
      </PixelShell>
    );
  }

  if (!doc) {
    return (
      <PixelShell active="file" brandLabel="save file" navItems={[
        { key: 'archive', label: 'archive', to: '/archive' },
        { key: 'file', label: 'file.001', to: '#' },
      ]}>
        <div className="rs-empty">正在打开…</div>
      </PixelShell>
    );
  }

  const shortId = doc.id.slice(0, 3);
  const platformLabel = (doc.source.platform || '').toLowerCase();
  const dur = humanDuration(doc.blocks);

  return (
    <PixelShell
      active="file"
      brandLabel="save file"
      navItems={[
        { key: 'archive', label: 'archive', to: '/archive' },
        { key: 'file', label: `file.${shortId}`, to: `/note/${doc.id}` },
      ]}
      navRight={<>☆ clear!</>}
      bottomBar={
        <div className="rs-bottom">
          <span className="status">▓▓▓▓▓ complete!</span>
          <span style={{ flex: 1 }} />
          <span>[A] 编辑</span>
          <span>[B] 返回</span>
          <span>[Y] 分享</span>
        </div>
      }
    >
      <div className="rs-header">
        <div className="rs-header__main">
          <div className="rs-header__label">━━ file loaded ━━</div>
          <div className="rs-header__title">{doc.title || '未命名笔记'}</div>
          <div className="rs-header__meta">
            {[platformLabel, dur, doc.author.name].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="rs-header__actions">
          <a
            className=""
            href={`/api/notes/${doc.id}/markdown`}
            style={{ textDecoration: 'none' }}
          >
            <button type="button" className="primary">.md</button>
          </a>
          <button type="button" disabled title="Obsidian 直写待实现">obsidian</button>
          <button type="button" onClick={copyMarkdown}>
            {copyState === 'copied' ? 'copied!' : copyState === 'error' ? 'failed' : 'copy'}
          </button>
        </div>
      </div>

      <div className="rs-panes">
        <div className="rs-pane" aria-label="learning notes">
          <div className="rs-pane__label">── learning notes ──</div>

          <div className="rs-section-label">◆ 一句话总结</div>
          <div className="rs-section-body">
            {doc.title || '（无标题）'} · {platformLabel} · {dur}
          </div>

          <div className="rs-section-label">◆ 关键时刻</div>
          <div className="rs-section-body rs-highlights">
            {highlights.length === 0 ? (
              <div style={{ color: 'var(--pxl-text-secondary)' }}>暂无时间戳片段。</div>
            ) : (
              highlights.map((b) => (
                <div key={b.index} className="rs-highlights__row">
                  ► {b.text.length > 60 ? `${b.text.slice(0, 58)}…` : b.text}{' '}
                  <button
                    className="rs-chip"
                    type="button"
                    onClick={() => jumpTo(b.index)}
                    title="跳到原文对应段"
                  >
                    {formatTs(b.start)}
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="rs-section-label">◆ 行动建议</div>
          <div className="rs-hint">
            🚧 LLM 学习笔记合成尚未接入(见 PRD §九)。现在展示的是原始转录 +
            开头关键时刻;等 LLM Provider 就绪后,一句话总结 / 核心观点 /
            行动建议会由模型合成。
          </div>
        </div>

        <div className="rs-pane" aria-label="transcript log">
          <div className="rs-pane__label">── transcript.log ──</div>
          {doc.blocks.length === 0 ? (
            <div className="rs-empty">这份笔记没有正文内容。</div>
          ) : (
            <div className="rs-transcript">
              {doc.blocks.map((b) => {
                const ts = formatTs(b.start);
                const isActive = activeBlock === b.index;
                return (
                  <div
                    key={b.index}
                    ref={(el) => {
                      if (el) blockRefs.current.set(b.index, el);
                      else blockRefs.current.delete(b.index);
                    }}
                    className={`rs-transcript__row ${isActive ? 'rs-transcript__row--active' : ''}`}
                    onClick={() => (ts ? jumpTo(b.index) : undefined)}
                  >
                    {ts && <span className="rs-chip">{ts}</span>} {b.text}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PixelShell>
  );
}
