import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PixelShell } from '../components/PixelShell';
import { DownBotComplete } from '../components/DownBot';
import { groupBlocksIntoParagraphs } from '../lib/paragraphs';
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

interface KeyPoint {
  text: string;
  start: number | null;
  end: number | null;
  blockIndex: number;
}

interface Summary {
  summary: string;
  keyPoints: KeyPoint[];
  actionItems: string[];
  provider: string;
  model: string;
  promptVersion: string;
  generatedAt: string;
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
  summary?: Summary;
  summaryError?: string;
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

/** Parses "MM:SS" or "H:MM:SS" back to seconds; returns null on anything that
 *  doesn't look like a timestamp, so a half-typed edit doesn't crash. */
function parseTs(value: string): number | null {
  const parts = value.trim().split(':').map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function humanDuration(blocks: Block[]): string {
  const last = blocks.reduce<number>((acc, b) => Math.max(acc, b.end ?? b.start ?? 0), 0);
  const ts = formatTs(last);
  return ts ?? '—';
}

interface EditKeyPoint {
  text: string;
  timeStr: string;
  blockIndex: number;
}

interface EditState {
  summary: string;
  keyPoints: EditKeyPoint[];
  actionItemsText: string;
}

function toEditState(summary: Summary): EditState {
  return {
    summary: summary.summary,
    keyPoints: summary.keyPoints.map((p) => ({
      text: p.text,
      timeStr: p.start !== null ? formatTs(p.start) ?? '' : '',
      blockIndex: p.blockIndex,
    })),
    actionItemsText: summary.actionItems.join('\n'),
  };
}

function countDirtyFields(edit: EditState, original: Summary): number {
  let count = 0;
  if (edit.summary.trim() !== original.summary) count += 1;
  const originalKeyPointsSerialized = JSON.stringify(
    original.keyPoints.map((p) => ({ text: p.text, time: formatTs(p.start) ?? '' })),
  );
  const editKeyPointsSerialized = JSON.stringify(
    edit.keyPoints.map((p) => ({ text: p.text, time: p.timeStr })),
  );
  if (originalKeyPointsSerialized !== editKeyPointsSerialized) count += 1;
  if (edit.actionItemsText.trim() !== original.actionItems.join('\n')) count += 1;
  return count;
}

export function NotePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<CanonicalDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeBlock, setActiveBlock] = useState<number | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);
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

  // transcript.log renders these instead of raw blocks — VAD/ASR segmentation
  // produces one short clause per block (see funasr-provider-spec.md's
  // 600ms-pause / 15s-cap rule), which reads fine as click-to-jump targets
  // but terribly as prose. Grouping is display-only: blockRefs below
  // registers every original block index in a group to the same DOM node, so
  // a keyPoint's jumpTo(blockIndex) still lands on the right paragraph.
  const paragraphs = useMemo(() => groupBlocksIntoParagraphs(doc?.blocks ?? []), [doc?.blocks]);

  function jumpTo(blockIndex: number) {
    setActiveBlock(blockIndex);
    const el = blockRefs.current.get(blockIndex);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setActiveBlock(null), 800);
  }

  async function fetchMarkdown(): Promise<string> {
    if (!id) throw new Error('缺少笔记 id');
    const res = await fetch(`/api/notes/${id}/markdown`);
    if (!res.ok) throw new Error('markdown 拉取失败');
    return res.text();
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(await fetchMarkdown());
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  }

  // Minimal viable "分享": no public hosting to generate a real shareable
  // link from, so this copies the same Obsidian-flavoured markdown the
  // header's `copy` button does — good enough to paste into a chat or doc.
  // Revisit if/when there's an actual share target (link, image export, etc).
  async function shareMarkdown() {
    try {
      await navigator.clipboard.writeText(await fetchMarkdown());
      setShareState('copied');
      setTimeout(() => setShareState('idle'), 1500);
    } catch {
      setShareState('error');
      setTimeout(() => setShareState('idle'), 2000);
    }
  }

  function startEdit() {
    if (!doc?.summary) return;
    setSaveError(null);
    setEdit(toEditState(doc.summary));
  }

  function cancelEdit() {
    setEdit(null);
    setSaveError(null);
  }

  function revertEdit() {
    if (!doc?.summary) return;
    setEdit(toEditState(doc.summary));
    setSaveError(null);
  }

  async function saveEdit() {
    if (!doc || !edit || !id) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: edit.summary.trim(),
          keyPoints: edit.keyPoints.map((p) => ({
            text: p.text.trim(),
            blockIndex: p.blockIndex,
            start: parseTs(p.timeStr),
          })),
          actionItems: edit.actionItemsText.split('\n').map((line) => line.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `保存失败(${res.status})`);
      }
      const updated: CanonicalDocument = await res.json();
      setDoc(updated);
      setEdit(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
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
          <div style={{ marginTop: 12 }}>
            <button type="button" className="rs-link-btn" onClick={() => navigate('/')}>▶ 回首页</button>
          </div>
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
  const isEditing = edit !== null;
  const dirtyCount = isEditing && doc.summary ? countDirtyFields(edit, doc.summary) : 0;

  return (
    <PixelShell
      active="file"
      brandLabel={isEditing ? 'save file · edit mode ✎' : 'save file'}
      navClassName={isEditing ? 'pxl-nav--editing' : undefined}
      navItems={[
        { key: 'archive', label: 'archive', to: '/archive' },
        { key: 'file', label: isEditing ? `✎ editing file.${shortId}` : `file.${shortId}`, to: `/note/${doc.id}` },
      ]}
      navRight={isEditing ? <>◈ unsaved · {dirtyCount} fields</> : <>☆ clear!</>}
      bottomBar={
        isEditing ? (
          <div className="rs-bottom">
            <span className="status" style={{ color: 'var(--pxl-danger)' }}>◈ {dirtyCount} fields unsaved</span>
            <span style={{ flex: 1 }} />
            {saveError && <span style={{ color: 'var(--pxl-danger)', marginRight: 10 }}>{saveError}</span>}
            <button type="button" className="rs-edit-btn rs-edit-btn--primary" onClick={saveEdit} disabled={isSaving}>
              [A] {isSaving ? 'saving…' : 'save changes'}
            </button>
            <button type="button" className="rs-edit-btn" onClick={cancelEdit} disabled={isSaving}>[B] cancel</button>
            <button type="button" className="rs-edit-btn rs-edit-btn--ghost" onClick={revertEdit} disabled={isSaving}>↺ revert</button>
          </div>
        ) : (
          <div className="rs-bottom">
            <span className="status">▓▓▓▓▓ complete!</span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="rs-bottom-btn"
              onClick={startEdit}
              disabled={!doc.summary}
              title={doc.summary ? '编辑学习笔记' : '没有可编辑的学习笔记'}
            >
              [A] 编辑
            </button>
            <button type="button" className="rs-bottom-btn" onClick={() => navigate(-1)}>[B] 返回</button>
            <button type="button" className="rs-bottom-btn" onClick={shareMarkdown}>
              [Y] <span key={shareState} className={shareState === 'copied' ? 'ds-pop' : undefined}>
                {shareState === 'copied' ? '已复制!' : shareState === 'error' ? 'failed' : '分享'}
              </span>
            </button>
          </div>
        )
      }
    >
      <div className="rs-header">
        {/* Working→Complete celebration (design-system.md §10.2: "结果页出现瞬间：
         *  DownBot 从 Working 淡出 Complete，持续 800ms"). Plays once per page
         *  load via CSS animation, then settles — kept out of the two content
         *  panes per PRD §八's "结果页正文不放动画" boundary, and hidden while
         *  editing so it doesn't compete with the edit-mode chrome. */}
        {!isEditing && <DownBotComplete size={48} className="rs-complete-bot" aria-label="DownBot complete" />}
        <div className="rs-header__main">
          <div className="rs-header__label">{isEditing ? '━━ editing ━━' : '━━ file loaded ━━'}</div>
          <div className="rs-header__title">{doc.title || '未命名笔记'}</div>
          <div className="rs-header__meta">
            {[platformLabel, dur, doc.author.name].filter(Boolean).join(' · ')}
            {isEditing && ' · 修改会保存到本地'}
          </div>
        </div>
        <div className="rs-header__actions">
          <a href={`/api/notes/${doc.id}/markdown`} style={{ textDecoration: 'none' }}>
            <button type="button" className="primary" disabled={isEditing}>.md</button>
          </a>
          <a
            href={`/api/notes/${doc.id}/text`}
            style={{ textDecoration: 'none' }}
            title="纯文本：不含时间戳，不含 LLM 总结，段落分明的原文"
          >
            <button type="button" disabled={isEditing}>.txt</button>
          </a>
          <button type="button" disabled title="Obsidian 直写待实现">obsidian</button>
          <button type="button" onClick={copyMarkdown} disabled={isEditing}>
            <span key={copyState} className={copyState === 'copied' ? 'ds-pop' : undefined}>
              {copyState === 'copied' ? 'copied!' : copyState === 'error' ? 'failed' : 'copy'}
            </span>
          </button>
        </div>
      </div>

      <div className="rs-panes">
        <div className="rs-pane" aria-label="learning notes">
          <div className="rs-pane__label">
            ── learning notes ──
            {isEditing && <span className="rs-pane__flag">◈ EDITING</span>}
          </div>

          {isEditing && edit ? (
            <>
              <div className="rs-section-label">◆ 一句话总结 <span className="rs-edit-marker">✎</span></div>
              <textarea
                className="rs-edit-field"
                value={edit.summary}
                onChange={(e) => setEdit({ ...edit, summary: e.target.value })}
                rows={2}
              />

              <div className="rs-section-label">◆ 核心观点 <span className="rs-edit-hint">(可微调时间戳)</span></div>
              <div className="rs-section-body rs-highlights">
                {edit.keyPoints.map((point, i) => (
                  <div key={point.blockIndex} className="rs-edit-point">
                    <input
                      className="rs-edit-point__text"
                      value={point.text}
                      onChange={(e) => {
                        const next = edit.keyPoints.slice();
                        next[i] = { ...point, text: e.target.value };
                        setEdit({ ...edit, keyPoints: next });
                      }}
                    />
                    <input
                      className="rs-edit-point__time"
                      value={point.timeStr}
                      onChange={(e) => {
                        const next = edit.keyPoints.slice();
                        next[i] = { ...point, timeStr: e.target.value };
                        setEdit({ ...edit, keyPoints: next });
                      }}
                      title="mm:ss"
                    />
                  </div>
                ))}
              </div>

              <div className="rs-section-label">◆ 行动建议 <span className="rs-edit-marker">✎</span></div>
              <textarea
                className="rs-edit-field"
                value={edit.actionItemsText}
                onChange={(e) => setEdit({ ...edit, actionItemsText: e.target.value })}
                rows={4}
                placeholder="每行一条"
              />
            </>
          ) : doc.summary ? (
            <>
              <div className="rs-section-label">◆ 一句话总结</div>
              <div className="rs-section-body">{doc.summary.summary}</div>

              <div className="rs-section-label">◆ 核心观点</div>
              <div className="rs-section-body rs-highlights">
                {doc.summary.keyPoints.length === 0 ? (
                  <div style={{ color: 'var(--pxl-text-secondary)' }}>模型没有给出核心观点。</div>
                ) : (
                  doc.summary.keyPoints.map((point) => (
                    <div key={point.blockIndex} className="rs-highlights__row">
                      ► {point.text}{' '}
                      {point.start !== null && (
                        <button
                          className="rs-chip"
                          type="button"
                          onClick={() => jumpTo(point.blockIndex)}
                          title="跳到原文对应段"
                        >
                          {formatTs(point.start)}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="rs-section-label">◆ 行动建议</div>
              <div className="rs-section-body">
                {doc.summary.actionItems.length === 0 ? (
                  <span style={{ color: 'var(--pxl-text-secondary)' }}>模型没有给出行动建议。</span>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {doc.summary.actionItems.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="rs-hint rs-hint--error">
              ⚠ 学习笔记合成没有成功：{doc.summaryError || '未知原因'}
              <br />
              下方 transcript.log 里的原文仍然完整可读。
            </div>
          )}
        </div>

        <div className="rs-pane" aria-label="transcript log">
          <div className="rs-pane__label">
            ── transcript.log ──
            {isEditing && <span className="rs-pane__flag rs-pane__flag--muted">read-only</span>}
          </div>
          {doc.blocks.length === 0 ? (
            <div className="rs-empty">这份笔记没有正文内容。</div>
          ) : (
            <div className="rs-transcript">
              {paragraphs.map((p, i) => {
                const ts = formatTs(p.start);
                const isActive = p.blockIndexes.some((idx) => idx === activeBlock);
                return (
                  <div
                    key={i}
                    ref={(el) => {
                      for (const idx of p.blockIndexes) {
                        if (el) blockRefs.current.set(idx, el);
                        else blockRefs.current.delete(idx);
                      }
                    }}
                    className={`rs-transcript__row ${isActive ? 'rs-transcript__row--active' : ''}`}
                    onClick={() => (ts && !isEditing ? jumpTo(p.blockIndexes[0]) : undefined)}
                  >
                    {ts && <span className="rs-chip">{ts}</span>} {p.text}
                  </div>
                );
              })}
              {isEditing && (
                <div className="rs-transcript__footer">
                  速记稿不能改 · 如需勘误请在左栏行动建议里补充说明
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PixelShell>
  );
}
