// DownBot Pixel sprites — chibi character on a 25×32 grid at 4px per cell
// (100×128px viewBox). All fills are CSS variables so the same DOM adapts to
// Pixel Retro / Kawaii / Y2K via --dbot-* tokens.
// See docs/design-system.md §7 for the sprite spec.
//
// Ported from the reference SVGs in docs/mockups/pixel-homepage.html (Idle)
// and docs/mockups/pixel-homepage-invalid.html (Thinking).

interface Props {
  /** rendered width in px; height scales proportionally (128:100 ratio). */
  size?: number;
  className?: string;
  'aria-label'?: string;
}

const OUT = 'var(--dbot-outline)';
const HAIR = 'var(--dbot-hair)';
const PANEL = 'var(--dbot-panel)';
const HEART = 'var(--dbot-heart)';
const ANT_OUT = 'var(--dbot-antenna-outer)';
const ANT_IN = 'var(--dbot-antenna-inner)';

/** Torso + arms + skirt + legs — identical across Idle / Thinking / Working /
 *  Complete for the seated / standing chibi poses. Emotions differ in the
 *  head/face group and any extra props (question mark, headphones, star). */
function Body() {
  return (
    <>
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
    </>
  );
}

function SvgFrame({ size, className, ariaLabel, children }: {
  size: number; className?: string; ariaLabel: string; children: React.ReactNode;
}) {
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
      {children}
    </svg>
  );
}

export function DownBotIdle({ size = 100, className, 'aria-label': ariaLabel = 'DownBot' }: Props) {
  return (
    <SvgFrame size={size} className={className} ariaLabel={ariaLabel}>
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
      <Body />
    </SvgFrame>
  );
}

/** HP-03 / early-stage Thinking: head tilted -6°, floating red '?' up top. */
export function DownBotThinking({ size = 100, className, 'aria-label': ariaLabel = 'DownBot thinking' }: Props) {
  return (
    <SvgFrame size={size} className={className} ariaLabel={ariaLabel}>
      {/* antennae — shifted slightly to align with the tilted head */}
      <rect x="26" y="0" width="8" height="8" fill={ANT_OUT} />
      <rect x="66" y="0" width="8" height="8" fill={ANT_OUT} />
      <rect x="28" y="2" width="4" height="4" fill={ANT_IN} />
      <rect x="68" y="2" width="4" height="4" fill={ANT_IN} />
      <rect x="28" y="8" width="4" height="8" fill={OUT} />
      <rect x="68" y="8" width="4" height="8" fill={OUT} />
      {/* floating question mark */}
      <text
        x="70"
        y="16"
        fontFamily="ui-monospace, monospace"
        fontSize="14"
        fontWeight={700}
        fill="var(--pxl-danger)"
      >
        ?
      </text>
      {/* head top pieces — tilted -6° */}
      <rect x="20" y="18" width="60" height="4" fill={OUT} transform="rotate(-6 50 20)" />
      <rect x="20" y="22" width="60" height="8" fill={HAIR} transform="rotate(-6 50 26)" />
      <g transform="rotate(-6 50 45)">
        <rect x="16" y="26" width="4" height="28" fill={HAIR} />
        <rect x="80" y="26" width="4" height="28" fill={HAIR} />
        <rect x="20" y="22" width="4" height="32" fill={OUT} />
        <rect x="76" y="22" width="4" height="32" fill={OUT} />
        <rect x="24" y="30" width="52" height="24" fill={PANEL} />
        <rect x="20" y="54" width="60" height="4" fill={OUT} />
        <rect x="32" y="34" width="8" height="8" fill={OUT} />
        <rect x="60" y="34" width="8" height="8" fill={OUT} />
        <rect x="34" y="34" width="2" height="2" fill={PANEL} />
        <rect x="62" y="34" width="2" height="2" fill={PANEL} />
        <rect x="26" y="44" width="4" height="4" fill={ANT_IN} />
        <rect x="70" y="44" width="4" height="4" fill={ANT_IN} />
        <rect x="46" y="48" width="8" height="2" fill={OUT} transform="rotate(6 50 49)" />
      </g>
      <Body />
    </SvgFrame>
  );
}
