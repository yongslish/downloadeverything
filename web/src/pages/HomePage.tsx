import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PixelShell } from '../components/PixelShell';
import { DownBotIdle, DownBotThinking } from '../components/DownBot';
import { detectPlatform, isInvalidUrl, normalizeUrl } from '../lib/url';
import './HomePage.css';

interface NoteSummary {
  id: string;
  title: string;
  author: string;
  platform: string;
  url: string;
  tags: string[];
  createdAt: string | null;
}

function iconFor(platform: string, tags: string[]): string {
  if (platform === 'Bilibili') return 'ti-brand-bilibili';
  if (tags.includes('video')) return 'ti-video';
  return 'ti-photo';
}

function metaFor(platform: string, tags: string[]): string {
  if (platform === 'Bilibili') return 'bilibili';
  if (tags.includes('video')) return 'short.vid';
  return 'img.post';
}

export function HomePage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/notes')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: NoteSummary[]) => { if (!cancelled) setNotes(data); })
      .catch(() => { if (!cancelled) setNotes([]); });
    return () => { cancelled = true; };
  }, []);

  const invalid = isInvalidUrl(url);
  const platform = detectPlatform(url);
  const canSubmit = platform !== null && !isSubmitting;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizeUrl(url) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `请求失败(${res.status})`);
        return;
      }
      const job = await res.json() as { id: string };
      navigate(`/processing/${job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setSubmitting(false);
    }
  }

  const isEmpty = notes !== null && notes.length === 0;

  return (
    <PixelShell active="start" bottomBar={
      isEmpty ? (
        <>
          <span>▲▼ select</span>
          <span>[A] confirm</span>
          <span>[B] back</span>
          <span>storage ░░░░░░ 0%</span>
        </>
      ) : undefined
    }>
      <section className="hp-hero">
        <div>
          <h1 className="hp-heading">
            粘贴链接 <span className="arrow">►</span> 得到笔记
          </h1>
          <div className="hp-support">support :: bilibili / xiaohongshu</div>
          <form
            className={`hp-url ${invalid ? 'hp-url--invalid' : ''}`}
            onSubmit={onSubmit}
            noValidate
          >
            <span className="hp-url__prefix">URL:</span>
            <input
              className="hp-url__input"
              type="text"
              value={url}
              onChange={(e) => { setUrl(e.target.value); if (error) setError(null); }}
              placeholder="enter link_"
              aria-label="B 站或小红书链接"
              disabled={isSubmitting}
            />
            <button
              className="hp-url__go"
              type="submit"
              disabled={!canSubmit}
              aria-disabled={!canSubmit}
            >
              {isSubmitting ? '▲ launching...' : '▶ go'}
            </button>
          </form>
          {invalid && (
            <div className="hp-invalid-hint" role="alert">
              <i className="ti ti-alert-triangle" aria-hidden />
              <div className="hp-invalid-hint__body">
                <div className="hp-invalid-hint__title">这不像是 B 站或小红书链接</div>
                <div className="hp-invalid-hint__forms">
                  支持的形式:<code>bilibili.com/video/BV…</code> · <code>b23.tv/…</code> · <code>xiaohongshu.com/explore/…</code>
                </div>
              </div>
            </div>
          )}
          <div className={`hp-pills ${invalid ? 'hp-pills--invalid' : ''}`}>
            <span className={`hp-pill ${platform === 'bilibili' ? 'hp-pill--bilibili' : ''}`}>B站</span>
            <span className={`hp-pill ${platform === 'xiaohongshu' ? 'hp-pill--xhs-image' : ''}`}>小红书图文</span>
            <span className={`hp-pill ${platform === 'xiaohongshu' ? 'hp-pill--xhs-video' : ''}`}>小红书视频</span>
          </div>
          {error && <div className="hp-error">{error}</div>}
        </div>
        {invalid ? <DownBotThinking size={100} /> : <DownBotIdle size={100} />}
      </section>

      {isEmpty ? (
        <section className="hp-empty-section">
          <div className="hp-cards-label">
            ── save files ────────────────────────────────
          </div>
          <div className="hp-empty">
            <DownBotIdle size={140} className="hp-empty__bot" aria-label="DownBot" />
            <div className="hp-empty__title">还没有笔记</div>
            <div className="hp-empty__hint">
              粘贴上面那条链接就能开始 · 你的第一份笔记会存在这里
            </div>
          </div>
        </section>
      ) : (
        <section className="hp-cards-section">
          <div className="hp-cards-label">
            ── save files ────────────────────────────────
          </div>
          <div className="hp-cards">
            {(notes ?? []).slice(0, 3).map((note) => (
              <Link key={note.id} className="hp-card" to={`/note/${note.id}`}>
                <div className="hp-card__thumb">
                  <i className={`ti ${iconFor(note.platform, note.tags)}`} />
                </div>
                <div className="hp-card__title">{note.title || '未命名笔记'}</div>
                <div className="hp-card__meta">{metaFor(note.platform, note.tags)}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </PixelShell>
  );
}
