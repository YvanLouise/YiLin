import test from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePages } from '../scripts/prepare-pages.mjs';

test('Pages output supports the repository subpath and preserves existing software update assets', async t => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'yilin-pages-test-'));
  const site = path.join(temporary, 'website');
  t.after(async () => {
    const resolved = path.resolve(temporary);
    assert.equal(path.dirname(resolved).toLowerCase(), path.resolve(tmpdir()).toLowerCase());
    assert(path.basename(resolved).startsWith('yilin-pages-test-'));
    await rm(resolved, { recursive: true, force: true, maxRetries: 3 });
  });
  const source = fileURLToPath(new URL('../', import.meta.url));
  for (const directory of ['data','src']) await cp(path.join(source, directory), path.join(site,directory), { recursive:true });
  await mkdir(path.join(site,'public/assets'),{recursive:true}); await writeFile(path.join(site,'public/assets/test.txt'),'website asset');
  await mkdir(path.join(temporary,'docs')); const manifest='{ "versionCode": 42, "versionName": "1.0.41" }\n';
  await writeFile(path.join(temporary,'docs/app-update.json'),manifest);
  await writeFile(path.join(temporary,'docs/index.html'),'old page');
  await mkdir(path.join(site,'admin')); await writeFile(path.join(site,'admin/private.txt'),'local admin');
  await mkdir(path.join(site,'.local/pages'),{recursive:true}); await writeFile(path.join(site,'.local/pages/stale.txt'),'removed asset');
  const output=await preparePages(site); const html=await readFile(path.join(output,'index.html'),'utf8');
  assert(html.includes('https://yvanlouise.github.io/YiLin/'));
  assert(html.includes('href="./styles.css"')); assert(html.includes('src="./main.js"'));
  assert.equal(await readFile(path.join(output,'app-update.json'),'utf8'),manifest);
  assert.equal(await readFile(path.join(output,'assets/test.txt'),'utf8'),'website asset');
  assert(!html.includes('old page')); await access(path.join(output,'content.js')); await access(path.join(output,'.nojekyll'));
  await assert.rejects(access(path.join(output,'admin/private.txt')));
  await assert.rejects(access(path.join(output,'stale.txt')));
});
