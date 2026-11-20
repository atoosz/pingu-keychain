// Reads ../sprites/*.txt (the same frames the firmware uses) into src/sprites.json for the video.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', '..', 'sprites');
const out = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith('.txt'))) {
  const [head, ...frames] = readFileSync(join(dir, f), 'utf8').trim().split('\n\n');
  out[f.slice(0, -4)] = { ms: Number(head.slice(3)), frames: frames.map((b) => b.split('\n')) };
}
writeFileSync(join(here, '..', 'src', 'sprites.json'), JSON.stringify(out));
console.log('sprites:', Object.keys(out).join(', '));
