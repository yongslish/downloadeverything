import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PixelShell } from '../components/PixelShell';
import { ProcessingScene } from '../components/ProcessingScene';
import './ProcessingPage.css';

interface Job {
  id: string;
  url: string;
  platform: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  stage: string;
  progress: number;
  message: string;
  createdAt: string | null;
  expiresAt: string | null;
  noteId: string | null;
}

// Stage vocabularies per platform — mirror docs/design-system.md §6.2. Server
// pipeline stages are coarser (queued → resolving → downloading → extracting
// → saving → done), so we advance through the 6 design stages based on
// progress percentage instead of stage name. Any progress within a stage's
// window highlights that stage as current.
const STAGES_BY_PLATFORM: Record<string, string[]> = {
  Bilibili: [
    '抓取视频',
    '找到原生字幕',
    '提取音频并 ASR',
    '整理完整文本',
    '生成学习笔记',
    '准备导出',
  ],
  '小红书': [
    '抓取笔记',
    '提取正文',
    '图片 OCR 或音频转写',
    '整理完整文本',
    '生成学习笔记',
    '准备导出',
  ],
};
const FALLBACK_STAGES = STAGES_BY_PLATFORM.Bilibili;

// Progress thresholds for each of the 6 design stages. progress >= threshold
// means that stage has started. Anything past the last means all done.
const STAGE_THRESHOLDS = [0, 15, 30, 55, 80, 95];

function stageIndex(progress: number): number {
  for (let i = STAGE_THRESHOLDS.length - 1; i >= 0; i -= 1) {
    if (progress >= STAGE_THRESHOLDS[i]) return i;
  }
  return 0;
}

function stageLocalPercent(progress: number, index: number): number {
  const start = STAGE_THRESHOLDS[index];
  const end = index + 1 < STAGE_THRESHOLDS.length ? STAGE_THRESHOLDS[index + 1] : 100;
  const local = Math.max(0, Math.min(1, (progress - start) / (end - start))) * 100;
  return Math.round(local);
}

// Ascii progress bar with `filled` of 5 cells lit.
function bar(filled: number): string {
  const clamped = Math.max(0, Math.min(5, filled));
  return '▓'.repeat(clamped) + '░'.repeat(5 - clamped);
}

function hpBar(progress: number): string {
  const filled = Math.round((progress / 100) * 14);
  return '▓'.repeat(filled) + '░'.repeat(14 - filled);
}

export function ProcessingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch(`/api/notes/jobs/${id}`, { cache: 'no-store' });
        if (!res.ok) {
          if (res.status === 404) {
            if (!cancelled) setFetchError('这个任务不见了(可能已经过期)。');
            return;
          }
          throw new Error(`轮询失败(${res.status})`);
        }
        const data: Job = await res.json();
        if (cancelled) return;
        setJob(data);
        if (data.status === 'ready' && data.noteId) {
          navigate(`/note/${data.noteId}`, { replace: true });
          return;
        }
        if (data.status !== 'failed') {
          timer = setTimeout(tick, 1500);
        }
      } catch (err) {
        if (!cancelled) setFetchError(err instanceof Error ? err.message : '轮询错误');
        timer = setTimeout(tick, 4000);
      }
    }
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [id, navigate]);

  const stages = job ? (STAGES_BY_PLATFORM[job.platform] ?? FALLBACK_STAGES) : FALLBACK_STAGES;
  const currentIndex = job && job.status !== 'failed' ? stageIndex(job.progress) : 0;
  const currentPct = job ? stageLocalPercent(job.progress, currentIndex) : 0;
  const failed = job?.status === 'failed';

  return (
    <PixelShell
      active="loading"
      brandLabel="processing..."
      navItems={[
        { key: 'start', label: 'start', to: '/' },
        { key: 'loading', label: 'loading', to: `/processing/${id}` },
        { key: 'archive', label: 'archive', to: '/archive' },
      ]}
      navRight={<>stage {currentIndex + 1} / 6</>}
      bottomBar={
        <div className="pr-bottom">
          <span>HP</span>
          <span className="bar">{hpBar(job?.progress ?? 0)}</span>
          <span>stage {currentIndex + 1}/6</span>
          <span style={{ flex: 1 }} />
          <span>{failed ? 'failed' : `${job?.progress ?? 0}%`}</span>
        </div>
      }
    >
      <div className="pr-header">
        <div className="pr-header__label">▲ now loading ▲</div>
        <div className="pr-header__title">{job?.url || '正在启动…'}</div>
        <div className="pr-header__meta">
          {job ? `${job.platform.toLowerCase()} · job ${job.id.slice(0, 8)}` : ''}
        </div>
      </div>

      <div className="pr-scene-wrap">
        <ProcessingScene message={job?.message || '正在启动…'} />
      </div>

      <div className="pr-progress-wrap">
        <div className="pr-progress">
          <div className="pr-progress__label">
            ── stage progress ────────────────────────────
          </div>
          <div className="pr-progress__list">
            {stages.map((label, i) => {
              let mark = '[ ]';
              let cls = 'pr-progress__row--wait';
              let barText = `${bar(0)} wait`;
              if (failed) {
                if (i < currentIndex) { mark = '[✓]'; cls = 'pr-progress__row--done'; barText = `${bar(5)} done`; }
                else if (i === currentIndex) { mark = '[!]'; cls = 'pr-progress__row--failed'; barText = 'FAIL'; }
              } else if (i < currentIndex) {
                mark = '[✓]'; cls = 'pr-progress__row--done'; barText = `${bar(5)} done`;
              } else if (i === currentIndex) {
                mark = '[►]';
                cls = 'pr-progress__row--current';
                const filled = Math.round((currentPct / 100) * 5);
                barText = `${bar(filled)} ${currentPct}%`;
              }
              return (
                <div key={label} className={`pr-progress__row ${cls}`}>
                  <span>{mark} {label}</span>
                  <span className="pr-progress__bar">{barText}</span>
                </div>
              );
            })}
          </div>

          {failed && job && (
            <div className="pr-error" role="alert">
              <strong>处理失败</strong>
              {job.message || '未知错误'}
              <div className="pr-error__actions">
                <Link to="/">▶ 回首页</Link>
                <Link to="/config">? 配置</Link>
              </div>
            </div>
          )}

          {fetchError && !failed && (
            <div className="pr-error" role="alert">
              <strong>暂时连不上服务器</strong>
              {fetchError}
            </div>
          )}
        </div>
      </div>
    </PixelShell>
  );
}
