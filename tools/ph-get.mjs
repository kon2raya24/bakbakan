// Fetch CC0 assets from Poly Haven (https://polyhaven.com) into .scratch/ph/<id>/, at 1k.
// usage: node ph-get.mjs model:id texture:id hdri:id ...
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
const root = new URL('../.scratch/ph/', import.meta.url).pathname;
const UA = { 'User-Agent': 'bakbakan-dev (kon2raya24/bakbakan)' };
const get = async (url) => { for (let i = 0; i < 4; i++) { try { const r = await fetch(url, { headers: UA }); if (r.ok) return Buffer.from(await r.arrayBuffer()); } catch { /* retry */ } await new Promise((r) => setTimeout(r, 1500)); } throw new Error('failed ' + url); };
const save = async (url, path) => { if (existsSync(path)) return 0; mkdirSync(dirname(path), { recursive: true }); const b = await get(url); writeFileSync(path, b); return b.length; };
const jobs = process.argv.slice(2);
let total = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (jobs.length) {
    const [kind, id] = jobs.shift().split(':'), dir = join(root, id);
    try {
      const files = JSON.parse((await get(`https://api.polyhaven.com/files/${id}`)).toString());
      let n = 0;
      if (kind === 'model') {
        const g = files.gltf['1k'].gltf;
        n += await save(g.url, join(dir, id + '.gltf'));
        for (const [p, f] of Object.entries(g.include || {})) n += await save(f.url, join(dir, p));
      } else if (kind === 'texture') {
        for (const [k, key] of [['Diffuse', 'diff'], ['nor_gl', 'nor'], ['arm', 'arm'], ['Rough', 'rough'], ['AO', 'ao'], ['Displacement', 'disp']]) {
          const f = files[k] && files[k]['1k'] && (files[k]['1k'].jpg || files[k]['1k'].png);
          if (f && (key !== 'rough' || !files.arm) && key !== 'ao' && key !== 'disp') n += await save(f.url, join(dir, `${key}.${f.url.split('.').pop()}`));
        }
      } else if (kind === 'hdri') {
        const f = files.hdri['1k'].hdr; n += await save(f.url, join(dir, id + '_1k.hdr'));
      }
      total += n; console.log('ok', kind, id, (n / 1e6).toFixed(2) + ' MB');
    } catch (e) { console.log('FAIL', kind, id, String(e.message || e)); }
  }
}));
console.log('total', (total / 1e6).toFixed(1), 'MB');
