// The pixel street scene from pixel-processing.html. Mimics the mockup shape
// (dark building silhouettes, ground bar with hash marks, DownBot Working
// centered, speech bubble above her head) but keeps the geometry simple —
// this is a mood piece, not architecture.
//
// Message text updates from the server's job.message so the user sees why
// each stage takes time ("正在整理完整文本…" etc).

interface Props {
  message: string;
}

// Buildings on left + right — heights vary a bit to feel like a skyline.
const LEFT_BUILDINGS = [
  { x: 20, w: 24, h: 60, dark: false },
  { x: 48, w: 20, h: 80, dark: true },
  { x: 72, w: 28, h: 50, dark: false },
  { x: 104, w: 24, h: 90, dark: true },
  { x: 132, w: 22, h: 65, dark: false },
  { x: 158, w: 18, h: 75, dark: true },
];
const RIGHT_BUILDINGS = [
  { x: 360, w: 26, h: 70, dark: true },
  { x: 390, w: 20, h: 85, dark: false },
  { x: 414, w: 24, h: 55, dark: true },
  { x: 442, w: 20, h: 75, dark: false },
  { x: 466, w: 24, h: 65, dark: true },
  { x: 494, w: 20, h: 80, dark: false },
];

const WINDOWS: [number, number][] = [
  [26, 80], [35, 80], [26, 94], [35, 94],
  [52, 58], [60, 58], [52, 72], [60, 72],
  [108, 50], [118, 50], [108, 65], [118, 65],
  [136, 75], [145, 75],
  [364, 70], [374, 70],
  [394, 55], [402, 55],
  [446, 65], [454, 65],
  [498, 60],
];

const STREET_DASH_XS = [20, 40, 60, 80, 100, 120, 140, 160, 180, 360, 380, 400, 420, 440, 460, 480];

export function ProcessingScene({ message }: Props) {
  const OUT = 'var(--pxl-frame)';
  const MID = 'var(--pxl-frame-mid)';
  const LIGHT = 'var(--pxl-bg)';
  const BG = 'var(--pxl-bg-top)';
  const HAIR = 'var(--dbot-hair)';
  const PANEL = 'var(--dbot-panel)';
  const ANT_OUT = 'var(--dbot-antenna-outer)';
  const ANT_IN = 'var(--dbot-antenna-inner)';

  const bubbleText = message.length > 24 ? `${message.slice(0, 22)}…` : message;

  return (
    <div style={{ background: BG, border: `3px solid ${OUT}`, padding: 6 }}>
      <svg
        viewBox="0 0 520 150"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', width: '100%', height: 'auto', shapeRendering: 'crispEdges' }}
        role="img"
        aria-label="processing scene"
      >
        <rect width="520" height="150" fill={BG} />
        {[...LEFT_BUILDINGS, ...RIGHT_BUILDINGS].map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={130 - b.h}
            width={b.w}
            height={b.h}
            fill={b.dark ? OUT : MID}
          />
        ))}
        {WINDOWS.map(([x, y], i) => (
          <rect key={`w${i}`} x={x} y={y} width={3} height={3} fill={LIGHT} />
        ))}
        <rect x="0" y="130" width="520" height="20" fill={MID} />
        <rect x="0" y="130" width="520" height="3" fill={OUT} />
        {STREET_DASH_XS.map((x) => (
          <rect key={`d${x}`} x={x} y={140} width={8} height={3} fill={LIGHT} />
        ))}
        {/* speech bubble */}
        <rect x="290" y="12" width="180" height="24" fill={LIGHT} stroke={OUT} strokeWidth="2" />
        <path d="M282 30 L294 26 L294 34 Z" fill={LIGHT} stroke={OUT} strokeWidth="2" strokeLinejoin="miter" />
        <text
          x="380"
          y="28"
          textAnchor="middle"
          fontFamily="ui-monospace, Menlo, Consolas, monospace"
          fontSize="10"
          fontWeight={500}
          fill={OUT}
        >
          {bubbleText}
        </text>
        {/* DownBot Working — inlined here so it participates in the scene's SVG coordinate system. */}
        <g transform="translate(230, 25)">
          <rect x="6" y="0" width="8" height="4" fill={ANT_OUT} />
          <rect x="26" y="0" width="8" height="4" fill={ANT_OUT} />
          <rect x="8" y="2" width="4" height="4" fill={ANT_IN} />
          <rect x="28" y="2" width="4" height="4" fill={ANT_IN} />
          <rect x="8" y="6" width="4" height="6" fill={OUT} />
          <rect x="28" y="6" width="4" height="6" fill={OUT} />
          <rect x="0" y="12" width="40" height="4" fill={OUT} />
          <rect x="0" y="16" width="4" height="26" fill={OUT} />
          <rect x="36" y="16" width="4" height="26" fill={OUT} />
          <rect x="0" y="38" width="40" height="4" fill={OUT} />
          <rect x="4" y="16" width="32" height="22" fill={PANEL} />
          <rect x="4" y="16" width="32" height="5" fill={HAIR} />
          <rect x="10" y="24" width="4" height="4" fill={OUT} />
          <rect x="26" y="24" width="4" height="4" fill={OUT} />
          <rect x="11" y="25" width="2" height="2" fill={PANEL} />
          <rect x="27" y="25" width="2" height="2" fill={PANEL} />
          <rect x="-2" y="20" width="6" height="12" fill={HAIR} />
          <rect x="36" y="20" width="6" height="12" fill={HAIR} />
          <rect x="17" y="32" width="6" height="2" fill={OUT} />
          {/* keyboard */}
          <rect x="6" y="46" width="28" height="4" fill={OUT} />
          <rect x="6" y="46" width="4" height="20" fill={OUT} />
          <rect x="30" y="46" width="4" height="20" fill={OUT} />
          <rect x="6" y="62" width="28" height="4" fill={OUT} />
          <rect x="10" y="50" width="20" height="12" fill={PANEL} />
          <rect x="18" y="52" width="4" height="4" fill={HAIR} />
          <rect x="14" y="54" width="12" height="4" fill={HAIR} />
          <rect x="16" y="58" width="8" height="2" fill={HAIR} />
          <rect x="-4" y="52" width="10" height="4" fill={HAIR} />
          <rect x="-4" y="52" width="10" height="2" fill={OUT} />
          <rect x="34" y="52" width="10" height="4" fill={HAIR} />
          <rect x="34" y="52" width="10" height="2" fill={OUT} />
          <rect x="-6" y="60" width="52" height="7" fill={OUT} />
          <rect x="-6" y="58" width="52" height="3" fill={HAIR} />
          <rect x="4" y="66" width="32" height="4" fill={HAIR} />
          <rect x="0" y="70" width="40" height="4" fill={HAIR} />
          <rect x="0" y="66" width="4" height="4" fill={OUT} />
          <rect x="36" y="66" width="4" height="4" fill={OUT} />
          <rect x="12" y="74" width="6" height="12" fill={OUT} />
          <rect x="22" y="74" width="6" height="10" fill={OUT} />
          <rect x="8" y="86" width="14" height="6" fill={OUT} />
          <rect x="20" y="84" width="14" height="6" fill={OUT} />
        </g>
        {/* motion trail behind DownBot */}
        <rect x="205" y="110" width="4" height="4" fill={OUT} />
        <rect x="194" y="114" width="4" height="4" fill={OUT} opacity="0.6" />
        <rect x="182" y="116" width="4" height="4" fill={OUT} opacity="0.35" />
      </svg>
    </div>
  );
}
