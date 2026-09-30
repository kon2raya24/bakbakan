// node tools/env-run.mjs <job.json relative to the site root> <out dir>: props to GLBs, plus textures and skies
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { openChrome, sleep } from './cdp.mjs';
const [jobPath, outDir] = process.argv.slice(2);
const job = JSON.parse(readFileSync(jobPath, 'utf8')), src = jobPath.replace(/[^/]*$/, '') + '../ph/';
mkdirSync(`${outDir}/props`, { recursive: true }); mkdirSync(`${outDir}/tex`, { recursive: true }); mkdirSync(`${outDir}/sky`, { recursive: true });
const index = existsSync(`${outDir}/env.json`) ? JSON.parse(readFileSync(`${outDir}/env.json`, 'utf8')) : { props: {}, tex: {}, sky: {} };
// props, in headless Chrome
if (job.props?.length) {
  const page = await openChrome(9512);
  await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errors = []; addEventListener('error', (e) => __errors.push(String(e.message)), true); addEventListener('unhandledrejection', (e) => __errors.push('rej ' + String(e.reason && (e.reason.stack || e.reason)).slice(0, 500)));` });
  await page.load(`http://127.0.0.1:5471/tools/env.html?job=${encodeURIComponent('/' + jobPath)}`);
  let res = null;
  for (let i = 0; i < 2400; i++) { await sleep(500); const s = await page.evaluate(`window.__result ? 'done' : (__errors.length ? JSON.stringify(__errors) : '')`); if (s === 'done') { res = JSON.parse(await page.evaluate('window.__result')); break; } if (s) { console.error(s); break; } }
  await page.close();
  if (res) { for (const [id, p] of Object.entries(res.out)) { writeFileSync(`${outDir}/props/${id}.glb`, Buffer.from(p.glb, 'base64')); index.props[id] = { size: p.size, tris: p.tris }; } console.log(res.log.join('\n')); }
}
// surface textures: colour, normal and AO/rough/metal, resized and saved as JPEG
for (const t of job.textures || []) {
  const s = t.size || 1024, have = {};
  for (const k of ['diff', 'nor', 'arm', 'rough']) {
    const f = ['jpg', 'png'].map((e) => `${src}${t.id}/${k}.${e}`).find(existsSync);
    if (!f) continue;
    const px = k === 'diff' ? s : s / 2; // colour at full size; the normal and roughness maps at half, where the eye can't tell
    execFileSync('python3', ['-c', `from PIL import Image; im = Image.open(${JSON.stringify(f)}).convert('RGB'); im.resize((${px}, ${px}), Image.LANCZOS).save(${JSON.stringify(`${outDir}/tex/${t.id}_${k}.jpg`)}, quality=${k === 'diff' ? 84 : 88})`]);
    have[k] = `tex/${t.id}_${k}.jpg`;
  }
  index.tex[t.id] = have; console.log('tex', t.id, Object.keys(have).join(','));
}
// skies: the .hdr shrunk to 512 × 256, still RGBE, for image-based light
for (const h of job.skies || []) {
  const f = `${src}${h.id}/${h.id}_1k.hdr`;
  if (!existsSync(f)) { console.log('no sky', h.id); continue; }
  writeFileSync(`${outDir}/sky/${h.id}.hdr`, shrinkHDR(readFileSync(f), h.w || 512));
  index.sky[h.id] = `sky/${h.id}.hdr`; console.log('sky', h.id);
}
// backdrops: a sky seen directly, from the 2k .hdr, tone-mapped into a 2048 × 1024 JPEG
index.backdrop = index.backdrop || {};
for (const b of job.backdrops || []) {
  const f = `${src}${b.id}/${b.id}_2k.hdr`;
  if (!existsSync(f)) { console.log('no backdrop', b.id); continue; }
  const { w, h, px } = parseHDR(readFileSync(f)), ex = b.exposure || 1;
  const rgb = Buffer.alloc(w * h * 3);
  // ACES (Narkowicz), then sRGB
  const aces = (x) => { x *= ex; return Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14))); };
  const srgb = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
  for (let i = 0; i < w * h * 3; i++) rgb[i] = Math.round(srgb(aces(px[i])) * 255);
  const ppm = `${outDir}/sky/${b.id}.ppm`;
  writeFileSync(ppm, Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), rgb]));
  execFileSync('python3', ['-c', `from PIL import Image; import os; im = Image.open(${JSON.stringify(ppm)}); im.resize((${b.w || 2048}, ${(b.w || 2048) / 2}), Image.LANCZOS).save(${JSON.stringify(`${outDir}/sky/${b.id}.jpg`)}, quality=86); os.remove(${JSON.stringify(ppm)})`]);
  index.backdrop[b.id] = `sky/${b.id}.jpg`; console.log('backdrop', b.id);
}
writeFileSync(`${outDir}/env.json`, JSON.stringify(index));

function parseHDR(buf) {
  let p = 0; const line = () => { let s = ''; while (buf[p] !== 10) s += String.fromCharCode(buf[p++]); p++; return s; };
  let l; while ((l = line()) !== '') { /* header lines */ }
  const [, h, , w] = line().split(' ').map((x, i) => (i % 2 ? +x : x));
  const px = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const row = new Uint8Array(w * 4);
    if (buf[p] === 2 && buf[p + 1] === 2) { p += 4; for (let c = 0; c < 4; c++) { let x = 0; while (x < w) { let n = buf[p++]; if (n > 128) { n -= 128; const v = buf[p++]; while (n--) row[(x++) * 4 + c] = v; } else while (n--) row[(x++) * 4 + c] = buf[p++]; } } }
    else { for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) row[x * 4 + c] = buf[p++]; }
    for (let x = 0; x < w; x++) { const e = row[x * 4 + 3], f = e ? Math.pow(2, e - 136) : 0; for (let c = 0; c < 3; c++) px[(y * w + x) * 3 + c] = row[x * 4 + c] * f; }
  }
  return { w, h, px };
}

function shrinkHDR(buf, W) {
  // parse the header
  let p = 0; const line = () => { let s = ''; while (buf[p] !== 10) s += String.fromCharCode(buf[p++]); p++; return s; };
  let l; while ((l = line()) !== '') { /* header lines */ }
  const [, h, , w] = line().split(' ').map((x, i) => (i % 2 ? +x : x));
  const px = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const row = new Uint8Array(w * 4);
    if (buf[p] === 2 && buf[p + 1] === 2) { p += 4; for (let c = 0; c < 4; c++) { let x = 0; while (x < w) { let n = buf[p++]; if (n > 128) { n -= 128; const v = buf[p++]; while (n--) row[(x++) * 4 + c] = v; } else while (n--) row[(x++) * 4 + c] = buf[p++]; } } }
    else { for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) row[x * 4 + c] = buf[p++]; }
    for (let x = 0; x < w; x++) { const e = row[x * 4 + 3], f = e ? Math.pow(2, e - 136) : 0; for (let c = 0; c < 3; c++) px[(y * w + x) * 3 + c] = row[x * 4 + c] * f; }
  }
  const H = W / 2, sx = w / W, sy = h / H, outB = [];
  const head = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`;
  for (const ch of head) outB.push(ch.charCodeAt(0));
  for (let y = 0; y < H; y++) {
    // each scanline run-length encoded (as literal runs), channel by channel, so no loader misreads it
    const row = new Uint8Array(W * 4);
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = Math.floor(y * sy); yy < Math.floor((y + 1) * sy); yy++) for (let xx = Math.floor(x * sx); xx < Math.floor((x + 1) * sx); xx++) { const i = (yy * w + xx) * 3; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
      r /= n; g /= n; b /= n;
      const m = Math.max(r, g, b);
      if (m < 1e-32) continue;
      const e = Math.ceil(Math.log2(m)), f = 256 / Math.pow(2, e);
      row.set([Math.min(255, r * f) | 0, Math.min(255, g * f) | 0, Math.min(255, b * f) | 0, e + 128], x * 4);
    }
    outB.push(2, 2, W >> 8, W & 255);
    for (let c = 0; c < 4; c++) for (let x = 0; x < W; x += 128) { const n = Math.min(128, W - x); outB.push(n); for (let k = 0; k < n; k++) outB.push(row[(x + k) * 4 + c]); }
  }
  return Buffer.from(outB);
}
