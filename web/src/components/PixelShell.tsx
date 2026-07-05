import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useSkin, type Skin } from '../theme/skin';
import './PixelShell.css';

export type NavKey = 'start' | 'archive' | 'tools' | 'config' | 'loading' | 'file';

interface NavItemSpec {
  key: NavKey;
  label: string;
  to: string;
}

interface Props {
  active: NavKey;
  /** middle-of-top-bar label, e.g. 'downspace' | 'processing...' | 'archive'.
   *  Decoration characters (▓▒░ vs ◕◡◕ vs ✧✦) come from the current skin. */
  brandLabel?: string;
  /** override the nav item set — processing / result pages substitute
   *  loading / file entries. Defaults to start/archive/tools/config. */
  navItems?: NavItemSpec[];
  /** override the right-hand nav slug (defaults to 'v0.1a'). Processing
   *  page uses this to show "stage 4 / 6". */
  navRight?: ReactNode;
  /** extra class on the nav bar — result page's edit mode (RS-05) uses this
   *  for its yellow "editing" chrome without baking that concept into the
   *  shared shell. */
  navClassName?: string;
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

const DEFAULT_NAV_ITEMS: NavItemSpec[] = [
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

export function PixelShell({
  active,
  brandLabel = 'downspace',
  navItems = DEFAULT_NAV_ITEMS,
  navRight,
  navClassName,
  bottomBar,
  children,
}: Props) {
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
        <nav className={`pxl-nav ${navClassName ?? ''}`}>
          {navItems.map((item) => (
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
          <span className="version">{navRight ?? 'v0.1a'}</span>
        </nav>
        <div className="pxl-body">{children}</div>
        <div className="pxl-bottom-bar">{bottomBar ?? DEFAULT_BOTTOM_BAR}</div>
      </div>
    </div>
  );
}
