// node tools/convert-run.mjs <job.json relative to the site root> <out dir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { openChrome, sleep } from './cdp.mjs';
const [job, outDir] = process.argv.slice(2);
const page = await openChrome(9498);
await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errors = []; addEventListener('error', (e) => __errors.push(String(e.message)), true); addEventListener('unhandledrejection', (e) => __errors.push('rej ' + String(e.reason && (e.reason.stack || e.reason)).slice(0, 500)));` });
await page.load(`http://127.0.0.1:5471/tools/convert.html?job=${encodeURIComponent('/' + job)}`);
let res = null;
for (let i = 0; i < 1200; i++) { await sleep(500); const s = await page.evaluate(`window.__result ? 'done' : (__errors.length ? JSON.stringify(__errors) : '')`); if (s === 'done') { res = JSON.parse(await page.evaluate('window.__result')); break; } if (s) { console.error(s); break; } }
await page.close();
if (!res) process.exit(1);
mkdirSync(outDir, { recursive: true });
const meta = {};
for (const [id, c] of Object.entries(res.chars)) { writeFileSync(`${outDir}/${id}.glb`, Buffer.from(c.glb, 'base64')); meta[id] = { height: c.height, hipY: c.hipY }; }
writeFileSync(`${outDir}/clips.json`, JSON.stringify({ chars: meta, clips: res.clips }));
console.log(res.log.join('\n'));
