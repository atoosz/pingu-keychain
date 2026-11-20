// The OLED keychain: PCB with 4 buttons, a keyring, and the 64x128 screen drawing the real sprite frames.
import { useCurrentFrame, useVideoConfig } from 'remotion';
import sprites from './sprites.json';

type Anim = { ms: number; frames: string[][] };
const ANIMS = sprites as Record<string, Anim>;
const PX = 5; // screen pixel size in video px (64x128 -> 320x640)
const LIT = '#d8ecff';

// One SVG path of all lit pixels: each '#' in the 32x40 frame is 2x2 screen pixels.
const framePath = (rows: string[], ox: number, oy: number) => {
  let d = '';
  rows.forEach((r, y) => {
    let x = 0;
    while (x < r.length) {
      if (r[x] !== '#') { x++; continue; }
      const start = x;
      while (r[x] === '#') x++;
      d += `M${ox + start * 2} ${oy + y * 2}h${(x - start) * 2}v2h${-(x - start) * 2}z`;
    }
  });
  return d;
};

export const Screen = ({ anim, label, connected = true }: { anim: string; label: string; connected?: boolean }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = ANIMS[anim];
  const ms = (frame / fps) * 1000;
  const rows = a.frames[Math.floor(ms / a.ms) % a.frames.length];
  const blink = connected || Math.floor(ms / 500) % 2 === 0;
  return (
    <svg width={64 * PX} height={128 * PX} viewBox="0 0 64 128" shapeRendering="crispEdges"
      style={{ background: '#020304', display: 'block', filter: `drop-shadow(0 0 6px ${LIT}55)` }}>
      <path d={framePath(rows, 0, 14)} fill={LIT} />
      {blink && (
        <path d="M59 1v9M59 1l3 3l-5 4M57 3l5 4l-3 3" stroke={LIT} strokeWidth={0.9} fill="none" shapeRendering="auto" />
      )}
      <text x={32} y={124} textAnchor="middle" fill={LIT} fontFamily="Menlo, monospace" fontSize={9} fontWeight={700}>
        {label}
      </text>
    </svg>
  );
};

export const Keychain = (props: { anim: string; label: string; connected?: boolean; scale?: number }) => (
  <div style={{ transform: `scale(${props.scale ?? 1})`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    {/* keyring */}
    <div style={{ width: 90, height: 90, borderRadius: '50%', border: '12px solid #b9bec7', marginBottom: -30,
      boxShadow: 'inset 0 0 0 2px #8a9099, 0 6px 20px #0006' }} />
    <div style={{ background: 'linear-gradient(160deg, #1f5fae, #133e78)', borderRadius: 28, padding: '56px 34px 34px',
      boxShadow: '0 30px 80px #0009, inset 0 2px 0 #ffffff22', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 18, left: '50%', marginLeft: -14, width: 28, height: 28, borderRadius: '50%',
        background: '#0b0f16', boxShadow: 'inset 0 0 0 4px #c9a64a' }} />
      <div style={{ padding: 14, background: '#0b0d10', borderRadius: 10 }}>
        <Screen {...props} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 26, padding: '0 10px' }}>
        {['K1', 'K2', 'K3', 'K4'].map((k) => (
          <div key={k} style={{ textAlign: 'center', color: '#cfe0ff99', font: '600 16px Menlo, monospace' }}>
            <div style={{ width: 46, height: 46, borderRadius: 8, background: '#2b2f36', margin: '0 auto 6px',
              boxShadow: 'inset 0 -4px 0 #111, 0 2px 0 #fff2', display: 'grid', placeItems: 'center' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#15171b' }} />
            </div>
            {k}
          </div>
        ))}
      </div>
    </div>
  </div>
);
