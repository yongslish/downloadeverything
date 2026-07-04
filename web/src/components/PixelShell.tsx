import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useSkin, type Skin } from '../theme/skin';
import './PixelShell.css';

export type NavKey = 'start' | 'archive' | 'tools' | 'config';

interface Props {
  active: NavKey;
  /** middle-of-top-bar label, e.g. 'downspace' | 'processing...' | 'archive'.
   *  Decoration characters (▓▒░ vs ◕◡◕ vs ✧✦) come from the current skin. */
  brandLabel?: string;
  /** contents of the bottom bar — pages control this because the copy differs
   *  per state (68% download vs. stage 4/6 vs. complete!). */
  bottomBar?: ReactNode;
  children: ReactNode;
}

const DECOR_LEFT: Record<Skin, string> = {
  'pixel-retro': '▓▒░',
  kawaii: '◕◡◕',
  y2k: '✧✦',
};
const DECOR_RIGHT: Record<Skin, string> = {
  'pixel-retro': '░▒▓',
  kawaii: '◕◡◕',
  y2k: '✦✧',
};

const NAV_ITEMS: { key: NavKey; label: string; to: string }[] = [
  { key: 'start', label: 'start', to: '/' },
  { key: 'archive', label: 'archive', to: '/archive' },
  { key: 'tools', label: 'tools', to: '/tools' },
  { key: 'config', label: 'config', to: '/config' },
];

const DEFAULT_BOTTOM_BAR = (
  <>
    <span>▲▼ select</span>
    <span>[A] confirm</span>
    <span>[B] back</span>
    <span>▓▓▓▓░░ 68%</span>
  </>
);

export function PixelShell({ active, brandLabel = 'downspace', bottomBar, children }: Props) {
  const { skin } = useSkin();
  const left = DECOR_LEFT[skin];
  const right = DECOR_RIGHT[skin];

  return (
    <div className="pxl-frame-outer">
      <div className="pxl-shell">
        <div className="pxl-top-bar">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
          <span className="brand">
            {left} {brandLabel} {right}
          </span>
          <span className="close">[×]</span>
        </div>
        <nav className="pxl-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              end={item.to === '/'}
              className={item.key === active ? 'active' : undefined}
            >
              {item.key === active ? '►' : '◇'} {item.label}
            </NavLink>
          ))}
          <span className="spacer" />
          <span className="version">v0.1a</span>
        </nav>
        <div className="pxl-body">{children}</div>
        <div className="pxl-bottom-bar">{bottomBar ?? DEFAULT_BOTTOM_BAR}</div>
      </div>
    </div>
  );
}
