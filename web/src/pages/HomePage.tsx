import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PixelShell } from '../components/PixelShell';
import { DownBotIdle } from '../components/DownBot';
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

// Placeholder cards that show while the notebook is empty (first-run state).
// The real HP-02 empty state (big DownBot + guidance copy) is a later task —
// this fallback keeps HP-01 visually complete until then.
const SEED_CARDS: Array<{ icon: string; title: string; meta: string; platform: string }> = [
  { icon: 'ti-brand-bilibili', title: '深度学习入门', meta: '42:18 min', platform: 'Bilibili' },
  { icon: 'ti-photo', title: '健身餐搭配', meta: 'img.post', platform: '小红书' },
  { icon: 'ti-video', title: 'Vlog 剪辑', meta: 'short.vid', platform: '小红书' },
];

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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!url.trim() || isSubmitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
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

  const cards = notes && notes.length > 0
    ? notes.slice(0, 3).map((note) => ({
        id: note.id,
        icon: iconFor(note.platform, note.tags),
        title: note.title || '未命名笔记',
        meta: metaFor(note.platform, note.tags),
      }))
    : SEED_CARDS.map((seed) => ({ id: null as string | null, ...seed }));

  return (
    <PixelShell active="start">
      <section className="hp-hero">
        <div>
          <h1 className="hp-heading">
            粘贴链接 <span className="arrow">►</span> 得到笔记
          </h1>
          <div className="hp-support">support :: bilibili / xiaohongshu</div>
          <form className="hp-url" onSubmit={onSubmit} noValidate>
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
              disabled={!url.trim() || isSubmitting}
            >
              {isSubmitting ? '▲ launching...' : '▶ go'}
            </button>
          </form>
          <div className="hp-pills">
            <span className="hp-pill hp-pill--bilibili">B站</span>
            <span className="hp-pill hp-pill--xhs-image">小红书图文</span>
            <span className="hp-pill hp-pill--xhs-video">小红书视频</span>
          </div>
          {error && <div className="hp-error">{error}</div>}
        </div>
        <DownBotIdle size={100} />
      </section>

      <section className="hp-cards-section">
        <div className="hp-cards-label">
          ── save files ────────────────────────────────
        </div>
        <div className="hp-cards">
          {cards.map((card, i) =>
            card.id ? (
              <Link key={card.id} className="hp-card" to={`/note/${card.id}`}>
                <div className="hp-card__thumb"><i className={`ti ${card.icon}`} /></div>
                <div className="hp-card__title">{card.title}</div>
                <div className="hp-card__meta">{card.meta}</div>
              </Link>
            ) : (
              <div key={`seed-${i}`} className="hp-card">
                <div className="hp-card__thumb"><i className={`ti ${card.icon}`} /></div>
                <div className="hp-card__title">{card.title}</div>
                <div className="hp-card__meta">{card.meta}</div>
              </div>
            ),
          )}
        </div>
      </section>
    </PixelShell>
  );
}
