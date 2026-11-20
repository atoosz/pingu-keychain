#!/usr/bin/env python3
"""Synthesize the demo soundtrack (original chiptune loop + sound effects) into public/soundtrack.wav.

Pure stdlib, deterministic. Effect times follow the scene timings in src/PinguDemo.tsx (30 fps):
INTRO=110, 6 state scenes x 120, FEATURES=150, OUTRO=120 frames.
"""
import math, os, random, struct, wave

SR = 44100
FPS = 30
INTRO, STATE, SCENES, FEAT, OUTRO = 110, 120, 6, 150, 120
TOTAL = INTRO + STATE * SCENES + FEAT + OUTRO
DUR = TOTAL / FPS
N = int(DUR * SR)
buf = [0.0] * N
rng = random.Random(7)

midi = lambda m: 440 * 2 ** ((m - 69) / 12)
square = lambda ph, duty=0.5: 1.0 if (ph % 1) < duty else -1.0
tri = lambda ph: 4 * abs((ph % 1) - 0.5) - 1


def add(t0, dur, fn, vol, attack=0.005, release=0.06):
    """Mix fn(phase_time) into buf with a simple attack/release envelope."""
    s0, n = int(t0 * SR), int(dur * SR)
    for i in range(n):
        j = s0 + i
        if j >= N: break
        t = i / SR
        env = min(1, t / attack) * min(1, (dur - t) / release) if dur > release else 1
        buf[j] += vol * env * fn(t)


def note(t0, dur, m, vol, wave_fn=square, **kw):
    f = midi(m)
    add(t0, dur, lambda t: wave_fn(f * t), vol, **kw)


def sweep(t0, dur, m0, m1, vol, wave_fn=square):
    f0, f1 = midi(m0), midi(m1)
    ph = [0.0]
    def fn(t):
        ph[0] += (f0 + (f1 - f0) * t / dur) / SR
        return wave_fn(ph[0], 0.25)
    add(t0, dur, fn, vol, release=0.03)


def noise(t0, dur, vol, decay):
    add(t0, dur, lambda t: rng.uniform(-1, 1) * math.exp(-t / decay), vol, attack=0.001, release=0.01)


# ---------- music: 120 bpm, C - Am - F - G, one bar each ----------
BEAT = 0.5
CHORDS = [(48, [60, 64, 67, 72]), (45, [57, 60, 64, 69]), (41, [53, 57, 60, 65]), (43, [55, 59, 62, 67])]
ARP = [0, 1, 2, 3, 2, 1, 2, 3]  # 8th-note pattern through the chord tones
bars = int(DUR / (4 * BEAT)) + 1
for b in range(bars):
    root, tones = CHORDS[b % 4]
    t_bar = b * 4 * BEAT
    full = t_bar >= INTRO / FPS - 0.01  # bass + drums join when the first scene starts
    for k, idx in enumerate(ARP):
        note(t_bar + k * BEAT / 2, BEAT / 2 * 0.9, tones[idx] + 12, 0.045, lambda p: square(p, 0.25))
    if full:
        for k in range(8):
            note(t_bar + k * BEAT / 2, BEAT / 2 * 0.85, root + (12 if k % 2 else 0), 0.16, tri)
        for k in range(4):
            t = t_bar + k * BEAT
            if k % 2 == 0:  # soft kick
                add(t, 0.15, lambda x: math.sin(2 * math.pi * (60 + 90 * math.exp(-x * 30)) * x), 0.35, release=0.08)
            noise(t + BEAT / 2, 0.05, 0.05, 0.012)  # off-beat hat

# ---------- sound effects ----------
sec = lambda frame: frame / FPS
sweep(sec(55), 0.08, 72, 84, 0.12); sweep(sec(58), 0.1, 79, 91, 0.12)            # poke: "boing"
for i in range(SCENES):                                                           # scene changes: blip
    sweep(sec(INTRO + i * STATE), 0.09, 76, 88, 0.09)
t = sec(INTRO) + 0.25                                                             # typing in the coding scene
while t < sec(INTRO) + 2.3:
    noise(t, 0.02, 0.10, 0.004)
    t += rng.uniform(0.06, 0.13)
lid = INTRO + 5 * STATE + 45                                                      # lid closes: power-down
for k, m in enumerate([76, 72, 67, 60]):
    note(sec(lid) + k * 0.09, 0.09, m, 0.08, lambda p: square(p, 0.5))
feat = INTRO + SCENES * STATE
for i in range(4):                                                                # feature cards pop in
    note(sec(feat + 6 + i * 7), 0.05, 84 + 2 * i, 0.06)
outro = feat + FEAT                                                               # outro jingle
for k, m in enumerate([72, 76, 79, 84]):
    note(sec(outro) + k * 0.1, 0.14 if k < 3 else 0.4, m, 0.08)

# ---------- master: fade in/out, normalize, write ----------
fade_in, fade_out = 1.0, 2.5
for i in range(N):
    t = i / SR
    buf[i] *= min(1, t / fade_in) * min(1, (DUR - t) / fade_out)
peak = max(abs(x) for x in buf) or 1
gain = 0.8 / peak
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'soundtrack.wav')
os.makedirs(os.path.dirname(out), exist_ok=True)
with wave.open(out, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<h', int(x * gain * 32767)) for x in buf))
assert abs(N / SR - DUR) < 0.01
print(f'soundtrack: {DUR:.2f}s -> {os.path.normpath(out)}')
