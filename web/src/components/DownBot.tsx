// DownBot Pixel sprite — chibi character on a 25×32 grid at 4px per cell
// (100×128px viewBox). All fills are CSS variables so the same DOM adapts to
// Pixel Retro / Kawaii / Y2K by only re-mapping the --dbot-* tokens.
// See docs/design-system.md §7 for the sprite spec.
//
// Ported from the reference SVG in docs/mockups/pixel-homepage.html.
// Emotions beyond Idle (Thinking / Working / Complete / Error) will follow in
// their own component variants once we do the processing/result pages.

interface Props {
  /** rendered width in px; height scales proportionally (128:100 ratio). */
  size?: number;
  className?: string;
  'aria-label'?: string;
}

export function DownBotIdle({ size = 100, className, 'aria-label': ariaLabel = 'DownBot' }: Props) {
  const OUT = 'var(--dbot-outline)';
  const HAIR = 'var(--dbot-hair)';
  const PANEL = 'var(--dbot-panel)';
  const HEART = 'var(--dbot-heart)';
  const ANT_OUT = 'var(--dbot-antenna-outer)';
  const ANT_IN = 'var(--dbot-antenna-inner)';

  return (
    <svg
      viewBox="0 0 100 128"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={(size * 128) / 100}
      style={{ shapeRendering: 'crispEdges' }}
      role="img"
      aria-label={ariaLabel}
      className={className}
    >
      {/* antennae */}
      <rect x="30" y="0" width="8" height="8" fill={ANT_OUT} />
      <rect x="62" y="0" width="8" height="8" fill={ANT_OUT} />
      <rect x="32" y="2" width="4" height="4" fill={ANT_IN} />
      <rect x="64" y="2" width="4" height="4" fill={ANT_IN} />
      <rect x="32" y="8" width="4" height="8" fill={OUT} />
      <rect x="64" y="8" width="4" height="8" fill={OUT} />
      {/* head outline + hair */}
      <rect x="20" y="16" width="60" height="4" fill={OUT} />
      <rect x="20" y="20" width="60" height="8" fill={HAIR} />
      <rect x="16" y="24" width="4" height="28" fill={HAIR} />
      <rect x="80" y="24" width="4" height="28" fill={HAIR} />
      <rect x="20" y="20" width="4" height="32" fill={OUT} />
      <rect x="76" y="20" width="4" height="32" fill={OUT} />
      {/* face */}
      <rect x="24" y="28" width="52" height="24" fill={PANEL} />
      <rect x="20" y="52" width="60" height="4" fill={OUT} />
      {/* eyes with sparkles */}
      <rect x="32" y="32" width="8" height="8" fill={OUT} />
      <rect x="60" y="32" width="8" height="8" fill={OUT} />
      <rect x="34" y="32" width="2" height="2" fill={PANEL} />
      <rect x="62" y="32" width="2" height="2" fill={PANEL} />
      {/* cheeks */}
      <rect x="26" y="42" width="4" height="4" fill={ANT_IN} />
      <rect x="70" y="42" width="4" height="4" fill={ANT_IN} />
      {/* mouth */}
      <rect x="42" y="46" width="8" height="2" fill={OUT} />
      <rect x="52" y="46" width="4" height="2" fill={OUT} />
      {/* torso (chest panel + heart) */}
      <rect x="30" y="60" width="4" height="24" fill={OUT} />
      <rect x="66" y="60" width="4" height="24" fill={OUT} />
      <rect x="30" y="60" width="40" height="4" fill={OUT} />
      <rect x="30" y="80" width="40" height="4" fill={OUT} />
      <rect x="34" y="64" width="32" height="16" fill={PANEL} />
      <rect x="44" y="68" width="4" height="4" fill={HEART} />
      <rect x="52" y="68" width="4" height="4" fill={HEART} />
      <rect x="42" y="72" width="16" height="4" fill={HEART} />
      <rect x="44" y="76" width="12" height="2" fill={HEART} />
      <rect x="48" y="78" width="4" height="2" fill={HEART} />
      {/* upper arms */}
      <rect x="22" y="60" width="8" height="16" fill={HAIR} />
      <rect x="22" y="60" width="8" height="4" fill={OUT} />
      <rect x="22" y="72" width="8" height="4" fill={OUT} />
      <rect x="70" y="60" width="8" height="16" fill={HAIR} />
      <rect x="70" y="60" width="8" height="4" fill={OUT} />
      <rect x="70" y="72" width="8" height="4" fill={OUT} />
      {/* hands */}
      <rect x="18" y="76" width="12" height="8" fill={ANT_IN} />
      <rect x="18" y="76" width="12" height="2" fill={OUT} />
      <rect x="18" y="82" width="12" height="2" fill={OUT} />
      <rect x="70" y="76" width="12" height="8" fill={ANT_IN} />
      <rect x="70" y="76" width="12" height="2" fill={OUT} />
      <rect x="70" y="82" width="12" height="2" fill={OUT} />
      {/* skirt */}
      <rect x="26" y="84" width="48" height="4" fill={HAIR} />
      <rect x="22" y="88" width="56" height="4" fill={HAIR} />
      <rect x="22" y="84" width="4" height="4" fill={OUT} />
      <rect x="74" y="84" width="4" height="4" fill={OUT} />
      <rect x="18" y="88" width="4" height="4" fill={OUT} />
      <rect x="78" y="88" width="4" height="4" fill={OUT} />
      {/* legs + boots */}
      <rect x="34" y="92" width="8" height="12" fill={OUT} />
      <rect x="58" y="92" width="8" height="12" fill={OUT} />
      <rect x="36" y="92" width="4" height="10" fill={HAIR} />
      <rect x="60" y="92" width="4" height="10" fill={HAIR} />
      <rect x="28" y="104" width="18" height="6" fill={OUT} />
      <rect x="54" y="104" width="18" height="6" fill={OUT} />
      <rect x="30" y="105" width="14" height="3" fill={HAIR} />
      <rect x="56" y="105" width="14" height="3" fill={HAIR} />
    </svg>
  );
}
