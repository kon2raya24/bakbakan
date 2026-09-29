// node tools/crowd-run.mjs <job.json relative to the site root> <out dir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { openChrome, sleep } from './cdp.mjs';
const [job, outDir] = process.argv.slice(2);
const page = await openChrome(9499);
await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errors = []; addEventListener('error', (e) => __errors.push(String(e.message)), true); addEventListener('unhandledrejection', (e) => __errors.push('rej ' + String(e.reason && (e.reason.stack || e.reason)).slice(0, 500)));` });
await page.load(`http://127.0.0.1:5471/tools/crowd.html?job=${encodeURIComponent('/' + job)}`);
let res = null;
for (let i = 0; i < 1800; i++) { await sleep(500); const s = await page.evaluate(`window.__result ? 'done' : (__errors.length ? JSON.stringify(__errors) : '')`); if (s === 'done') { res = JSON.parse(await page.evaluate('window.__result')); break; } if (s) { console.error(s); break; } }
await page.close();
if (!res) process.exit(1);
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/crowd.glb`, Buffer.from(res.glb, 'base64'));
writeFileSync(`${outDir}/crowd.json`, JSON.stringify(res.meta));
console.log(res.log.join('\n'));
