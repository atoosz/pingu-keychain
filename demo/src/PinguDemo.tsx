import React, { createContext, useContext } from 'react';
import { AbsoluteFill, Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Keychain } from './Keychain';

const FONT = '-apple-system, "SF Pro Display", "Helvetica Neue", sans-serif';
const BG = 'radial-gradient(ellipse at 70% 40%, #1b2433 0%, #0b0e14 70%)';
const ACCENT = '#7cc4ff';

// true for the 1080x1080 cut (LinkedIn feed); layouts shrink/stack instead of sitting side by side
const Square = createContext(false);

type Scene = { id: string; anim: string; label: string; you: string; mac: React.FC };

// ---------- Mac screen mockups (generic, no real app branding) ----------
const Window = ({ title, children, dark = true }: { title: string; children: React.ReactNode; dark?: boolean }) => (
  <div style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden', background: dark ? '#1e1f24' : '#f4f4f6',
    display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px #0008' }}>
    <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 9, padding: '0 16px',
      background: dark ? '#2a2c33' : '#e3e3e8' }}>
      {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: '50%', background: c }} />)}
      <div style={{ flex: 1, textAlign: 'center', color: dark ? '#aab' : '#556', font: `500 16px ${FONT}`, marginRight: 60 }}>{title}</div>
    </div>
    <div style={{ flex: 1, position: 'relative' }}>{children}</div>
  </div>
);

const CODE = [
  ['#c586c0', 'func ', '#dcdcaa', 'detect', '#ccc', '() -> State {'],
  ['#ccc', '  if ', '#9cdcfe', 'screenLocked', '#ccc', '() { return .sleep }'],
  ['#ccc', '  let ', '#9cdcfe', 'front', '#ccc', ' = frontmostApp()'],
  ['#ccc', '  if ', '#9cdcfe', 'codingApps', '#ccc', '.contains(front) {'],
  ['#ccc', '    return ', '#4ec9b0', '.coding'],
  ['#ccc', '  }'],
  ['#6a9955', '  // Pingu is watching you type...'],
  ['#ccc', '  return ', '#4ec9b0', '.chill'],
  ['#ccc', '}'],
];
const Coding: React.FC = () => {
  const f = useCurrentFrame();
  const shown = Math.floor(f * 3.5); // characters typed so far
  let budget = shown;
  return (
    <Window title="pingu.swift — Editor">
      <div style={{ padding: '24px 30px', font: '500 24px Menlo, monospace', lineHeight: '40px', whiteSpace: 'pre' }}>
        {CODE.map((line, i) => {
          const parts: React.ReactNode[] = [];
          for (let j = 0; j < line.length; j += 2) {
            const text = line[j + 1];
            const n = Math.max(0, Math.min(text.length, budget));
            budget -= text.length;
            if (n) parts.push(<span key={j} style={{ color: line[j] }}>{text.slice(0, n)}</span>);
          }
          return <div key={i} style={{ minHeight: 40 }}><span style={{ color: '#555', marginRight: 24 }}>{String(i + 1).padStart(2)}</span>{parts}</div>;
        })}
      </div>
    </Window>
  );
};

const Video: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Window title="Brave — video site">
      <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'grid', placeItems: 'center' }}>
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(${120 + f}deg, #3a1c71, #d76d77, #ffaf7b)`, opacity: 0.55 }} />
        <div style={{ font: `700 64px ${FONT}`, color: '#fff', textShadow: '0 4px 20px #000' }}>▶︎  Movie night</div>
        <div style={{ position: 'absolute', left: 30, right: 30, bottom: 28, height: 8, background: '#fff3', borderRadius: 4 }}>
          <div style={{ width: `${20 + f * 0.4}%`, height: '100%', background: '#ff3b30', borderRadius: 4 }} />
        </div>
      </div>
    </Window>
  );
};

const Music: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Window title="Music player">
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 50, padding: 60,
        background: 'linear-gradient(135deg, #12372a, #191414)' }}>
        <div style={{ width: 260, height: 260, borderRadius: 16, background: 'linear-gradient(135deg, #1db954, #0b6b30)',
          display: 'grid', placeItems: 'center', font: `800 110px ${FONT}`, color: '#ffffffcc' }}>♪</div>
        <div style={{ flex: 1 }}>
          <div style={{ font: `700 46px ${FONT}`, color: '#fff' }}>Lo-fi beats to code to</div>
          <div style={{ font: `400 28px ${FONT}`, color: '#aaa', marginTop: 8 }}>Playing in the background</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 120, marginTop: 40 }}>
            {Array.from({ length: 16 }, (_, i) => (
              <div key={i} style={{ width: 22, borderRadius: 4, background: '#1db954',
                height: 20 + 90 * Math.abs(Math.sin(f / 6 + i * 0.9)) }} />
            ))}
          </div>
        </div>
      </div>
    </Window>
  );
};

const Meeting: React.FC = () => {
  const f = useCurrentFrame();
  const names = ['You', 'Sam', 'Alex', 'Robin'];
  const speaking = Math.floor(f / 30) % 4;
  return (
    <Window title="Video call">
      <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: 14, background: '#111' }}>
        {names.map((n, i) => (
          <div key={n} style={{ borderRadius: 12, background: ['#2d3a4f', '#4f2d3a', '#2d4f3a', '#4f472d'][i], display: 'grid', placeItems: 'center',
            boxShadow: i === speaking ? `inset 0 0 0 5px ${ACCENT}` : 'none', position: 'relative' }}>
            <div style={{ width: 110, height: 110, borderRadius: '50%', background: '#ffffff22', display: 'grid', placeItems: 'center',
              font: `700 48px ${FONT}`, color: '#fff' }}>{n[0]}</div>
            <div style={{ position: 'absolute', left: 16, bottom: 12, font: `600 22px ${FONT}`, color: '#fff' }}>{n}</div>
          </div>
        ))}
      </div>
    </Window>
  );
};

const Morning: React.FC = () => {
  const f = useCurrentFrame();
  const min = 41 + Math.floor(f / 40);
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: 12, background: 'linear-gradient(180deg, #ffb37a 0%, #ffd8a8 45%, #8ec5ff 100%)',
      display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center', color: '#fff', textShadow: '0 4px 30px #0005' }}>
        <div style={{ font: `200 170px ${FONT}` }}>07:{min}</div>
        <div style={{ font: `500 34px ${FONT}` }}>Nothing open yet. Coffee first.</div>
      </div>
    </div>
  );
};

const Asleep: React.FC = () => {
  const f = useCurrentFrame();
  const dim = interpolate(f, [10, 45], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: 12, background: '#000', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: dim }}><Coding /></div>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: 1 - dim,
        font: `300 40px ${FONT}`, color: '#667' }}>Mac is asleep</div>
    </div>
  );
};

const SCENES: Scene[] = [
  { id: 'coding', anim: 'coding', label: 'coding', you: 'You code.', mac: Coding },
  { id: 'video', anim: 'video', label: 'video', you: 'You watch something.', mac: Video },
  { id: 'music', anim: 'music', label: 'music', you: 'Music on.', mac: Music },
  { id: 'meeting', anim: 'meeting', label: 'meeting', you: 'You hop on a call.', mac: Meeting },
  { id: 'coffee', anim: 'coffee', label: 'coffee', you: 'Early morning.', mac: Morning },
  { id: 'sleep', anim: 'sleep', label: 'zzz', you: 'You close the lid.', mac: Asleep },
];

// ---------- building blocks ----------
const fade = (f: number, dur: number) =>
  interpolate(f, [0, 10, dur - 10, dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

const MacBook = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    <div style={{ width: 1000, height: 640, background: '#0c0c0e', borderRadius: '26px 26px 6px 6px', padding: 22,
      boxShadow: '0 0 0 3px #3a3b40, 0 40px 90px #000a' }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden', background: '#000' }}>{children}</div>
    </div>
    <div style={{ width: 1160, height: 26, background: 'linear-gradient(#c8cbd1, #8d9097)', borderRadius: '0 0 22px 22px' }} />
  </div>
);

const Beam = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ width: 150, height: 40, position: 'relative' }}>
      {[0, 1, 2].map((i) => {
        const t = ((f + i * 12) % 36) / 36;
        return <div key={i} style={{ position: 'absolute', top: 12, left: t * 140, width: 16, height: 16, borderRadius: '50%',
          background: ACCENT, opacity: Math.sin(t * Math.PI), boxShadow: `0 0 16px ${ACCENT}` }} />;
      })}
      <div style={{ position: 'absolute', top: 44, width: '100%', textAlign: 'center', font: `600 18px ${FONT}`, color: '#7cc4ffaa',
        letterSpacing: 2 }}>BLE</div>
    </div>
  );
};

const StateScene = ({ s, dur }: { s: Scene; dur: number }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - 8, fps, config: { damping: 12 } });
  const Mac = s.mac;
  const asleep = s.id === 'sleep';
  const sq = useContext(Square);
  return (
    <AbsoluteFill style={{ background: BG, opacity: fade(f, dur), fontFamily: FONT }}>
      <div style={{ position: 'absolute', top: sq ? 80 : 70, width: '100%', textAlign: 'center', font: `700 ${sq ? 58 : 64}px ${FONT}` }}>
        <span style={{ color: '#fff' }}>{s.you} </span>
        {sq && <br />}
        <span style={{ color: ACCENT, opacity: pop }}>Pingu knows.</span>
      </div>
      <div style={{ position: 'absolute', top: sq ? 250 : 190, bottom: 30, left: 0, right: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: sq ? 24 : 50 }}>
        <div style={{ zoom: sq ? 0.55 : 0.86 }}><MacBook><Mac /></MacBook></div>
        {!sq && (asleep && f > 45 ? <div style={{ width: 150 }} /> : <Beam />)}
        <div style={{ zoom: sq ? 0.7 : 0.84, transform: `scale(${0.95 + 0.05 * pop})` }}>
          <Keychain anim={s.anim} label={s.label} connected={!(asleep && f > 45)} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Intro = ({ dur }: { dur: number }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame: f, fps, config: { damping: 14 } });
  const poking = f > 55 && f < 95;
  const sq = useContext(Square);
  return (
    <AbsoluteFill style={{ background: BG, opacity: fade(f, dur), display: 'flex', flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: sq ? 50 : 140, padding: sq ? 60 : 0 }}>
      <div style={{ transform: `translateY(${(1 - rise) * 200}px)`, opacity: rise, zoom: sq ? 0.62 : 0.9 }}>
        <Keychain anim={poking ? 'poke' : 'chill'} label={poking ? 'hey!' : 'chill'} />
      </div>
      <div style={{ maxWidth: sq ? 560 : 820, opacity: interpolate(f, [12, 30], [0, 1], { extrapolateRight: 'clamp' }) }}>
        <div style={{ font: `800 ${sq ? 100 : 120}px ${FONT}`, color: '#fff', lineHeight: 1 }}>Pingu</div>
        <div style={{ font: `300 ${sq ? 38 : 46}px ${FONT}`, color: '#aab4c4', marginTop: 24, lineHeight: 1.3 }}>
          a tiny penguin on your keychain that knows what you're doing on your Mac
        </div>
        <div style={{ font: `500 ${sq ? 26 : 28}px ${FONT}`, color: ACCENT, marginTop: 40 }}>ESP32 · 0.96" OLED · Bluetooth LE</div>
      </div>
    </AbsoluteFill>
  );
};

const FEATURES = [
  ['No cable', 'Talks to your Mac over Bluetooth LE and runs off a power bank.'],
  ['Smart detection', 'Front app, Brave tabs, Spotify, idle time, screen lock, and the time of day.'],
  ['Wireless updates', 'New firmware over Bluetooth. Hold a button to allow it.'],
  ['Screen care', 'Pixel shifting and auto-off keep the OLED from burning in.'],
];
const Features = ({ dur }: { dur: number }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sq = useContext(Square);
  return (
    <AbsoluteFill style={{ background: BG, opacity: fade(f, dur), padding: sq ? '0 70px' : '0 160px', fontFamily: FONT, justifyContent: 'center' }}>
      <div style={{ font: `800 ${sq ? 64 : 72}px ${FONT}`, color: '#fff', marginBottom: sq ? 40 : 60 }}>What's inside</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sq ? 24 : 36, zoom: sq ? 0.8 : 1 }}>
        {FEATURES.map(([t, d], i) => {
          const s = spring({ frame: f - 6 - i * 7, fps, config: { damping: 14 } });
          return (
            <div key={t} style={{ background: '#ffffff0d', border: '1px solid #ffffff1a', borderRadius: 24, padding: '40px 44px',
              opacity: s, transform: `translateY(${(1 - s) * 40}px)` }}>
              <div style={{ font: `700 44px ${FONT}`, color: ACCENT }}>{t}</div>
              <div style={{ font: `400 32px ${FONT}`, color: '#c8d0dc', marginTop: 14, lineHeight: 1.35 }}>{d}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Outro = ({ dur }: { dur: number }) => {
  const f = useCurrentFrame();
  const sq = useContext(Square);
  return (
    <AbsoluteFill style={{ background: BG, opacity: fade(f, dur + 10), display: 'flex', flexDirection: sq ? 'column' : 'row',
      alignItems: 'center', justifyContent: 'center', gap: sq ? 30 : 120, textAlign: sq ? 'center' : 'left' }}>
      <div style={{ zoom: sq ? 0.55 : 0.8 }}><Keychain anim="chill" label="chill" /></div>
      <div>
        <div style={{ font: `800 ${sq ? 72 : 90}px ${FONT}`, color: '#fff' }}>Build your own</div>
        <div style={{ font: `500 ${sq ? 34 : 48}px Menlo, monospace`, color: ACCENT, marginTop: sq ? 18 : 30 }}>github.com/atoosz/pingu-keychain</div>
        <div style={{ font: `400 32px ${FONT}`, color: '#8f9bb0', marginTop: 24 }}>Open source · MIT</div>
      </div>
    </AbsoluteFill>
  );
};

const INTRO = 110, STATE = 120, FEAT = 150, OUTRO = 120;
export const TOTAL = INTRO + SCENES.length * STATE + FEAT + OUTRO;

export const PinguDemo = ({ square = false }: { square?: boolean }) => (
  <Square.Provider value={square}>
  <AbsoluteFill style={{ background: '#0b0e14' }}>
    <Audio src={staticFile('soundtrack.wav')} />
    <Sequence durationInFrames={INTRO}><Intro dur={INTRO} /></Sequence>
    {SCENES.map((s, i) => (
      <Sequence key={s.id} from={INTRO + i * STATE} durationInFrames={STATE}><StateScene s={s} dur={STATE} /></Sequence>
    ))}
    <Sequence from={INTRO + SCENES.length * STATE} durationInFrames={FEAT}><Features dur={FEAT} /></Sequence>
    <Sequence from={INTRO + SCENES.length * STATE + FEAT} durationInFrames={OUTRO}><Outro dur={OUTRO} /></Sequence>
  </AbsoluteFill>
  </Square.Provider>
);
