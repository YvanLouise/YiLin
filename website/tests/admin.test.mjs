import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm, chmod, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as httpRequest } from 'node:http';
import { createStore } from '../scripts/admin-store.mjs';
import { createPublisher, runGit } from '../scripts/admin-publisher.mjs';
import { createAdminServer } from '../scripts/admin-server.mjs';
import { buildSite } from '../scripts/build.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
async function fixture(t) {
  const base = await mkdtemp(path.join(tmpdir(), 'yilin-admin-test-'));
  const project = path.join(base, 'project'); const site = path.join(project, 'website');
  await mkdir(site, { recursive: true });
  for (const directory of ['data', 'src', 'scripts', 'admin', 'public', '.openai']) await mkdir(path.join(site, directory), { recursive: true });
  await cp(path.join(source, 'data'), path.join(site, 'data'), { recursive: true });
  for (const file of ['index.html', 'main.js', 'styles.css']) await cp(path.join(source, 'src', file), path.join(site, 'src', file));
  await writeFile(path.join(site, 'public/test.txt'), 'static asset');
  await writeFile(path.join(site, '.openai/hosting.json'), '{"static":{"directory":"dist"},"project_id":"fixture"}');
  await writeFile(path.join(site, 'admin/index.html'), '<!doctype html><title>Local admin fixture</title>');
  await writeFile(path.join(site, 'README.md'), '# Website\n');
  await writeFile(path.join(project, 'README.md'), '# Local app\n');
  const store = createStore(site, project);
  t.after(async () => {
    const absolute = path.resolve(base);
    assert.equal(path.dirname(absolute).toLowerCase(), path.resolve(tmpdir()).toLowerCase());
    assert(path.basename(absolute).startsWith('yilin-admin-test-'));
    await rm(absolute, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  return { base, project, site, store };
}
function payload(state) { return { revision: state.revision, values: structuredClone(state.values), release: structuredClone(state.release), readmes: structuredClone(state.readmes) }; }
async function git(args, cwd) { const result = await runGit(args, cwd); assert.equal(result.code, 0, result.stderr); return result.stdout; }
async function commit(cwd, message) { await git(['-c','user.name=Test','-c','user.email=test@example.test','commit','-m',message], cwd); }
async function remoteFixture(f) {
  const remote = path.join(f.base, 'remote.git'); const seed = path.join(f.base, 'seed');
  await mkdir(seed); await git(['init','--bare','--initial-branch=main',remote], f.base); await git(['init','--initial-branch=main','.'], seed);
  await writeFile(path.join(seed,'README.md'), '# Remote README\n'); await writeFile(path.join(seed,'unrelated.txt'), 'remote original');
  await git(['add','.'],seed); await commit(seed,'Initial fixture'); await git(['remote','add','origin',remote],seed); await git(['push','origin','main'],seed);
  return { remote, seed, head:await git(['rev-parse','HEAD'],seed) };
}
async function finish(job) { for (let i=0; i<1000 && job.status==='running'; i++) await new Promise(resolve=>setTimeout(resolve,20)); assert.notEqual(job.status,'running','publish timed out'); return job; }

test('saving content and both READMEs rebuilds escaped HTML and dynamic copy', async t => {
  const f=await fixture(t); const input=payload(await f.store.state());
  input.values['hero.title1']='<script>alert("test")</script>';
  input.values['interaction.savedToast']='已收藏 {word}'; input.readmes.app+='# Managed README\n';
  const saved=await f.store.save(input);
  assert.notEqual(saved.revision,input.revision);
  const html=await readFile(path.join(f.site,'dist/index.html'),'utf8');
  assert(html.includes('&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt;'));
  assert(!html.includes('<script>alert(')); assert(!/\{\{[\w.]+\}\}/.test(html));
  assert((await readFile(path.join(f.site,'dist/content.js'),'utf8')).includes('已收藏 {word}'));
  assert((await readFile(path.join(f.project,'README.md'),'utf8')).includes('Managed README'));
});

test('stale revisions and invalid release data preserve files', async t => {
  const f=await fixture(t); const input=payload(await f.store.state());
  await writeFile(path.join(f.project,'README.md'),'# External change\n');
  await assert.rejects(f.store.save(input),error=>error.status===409);
  const next=payload(await f.store.state()); next.release.androidUrl='javascript:alert(1)';
  await assert.rejects(f.store.save(next),/HTTPS/);
  assert.equal(await readFile(path.join(f.project,'README.md'),'utf8'),'# External change\n');
});

test('build failure rolls back edited documents and retains backups', async t => {
  const f=await fixture(t); const before=await f.store.state(); const input=payload(before);
  input.values['hero.title1']='New title'; input.readmes.app='# New README\n';
  await writeFile(path.join(f.site,'src/index.html'), '{{unknown.field}}');
  await assert.rejects(f.store.save(input),/恢复/);
  assert.equal((await f.store.state()).revision,before.revision);
  await access(path.join(f.site,'.local/backups'));
});

test('local API rejects cross-site writes, bad hosts and private file paths', async t => {
  const f=await fixture(t); const app=await createAdminServer({ siteRoot:f.site, projectRoot:f.project, repositoryConfig:{url:path.join(f.base,'unused.git'),branch:'main'},port:0 });
  t.after(()=>new Promise(resolve=>{ app.server.closeAllConnections(); app.server.close(resolve); }));
  const state=await (await fetch(`${app.url}/api/state`)).json(); const input=payload(state);
  assert.equal((await fetch(`${app.url}/api/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})).status,403);
  assert.equal((await fetch(`${app.url}/api/save`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-CSRF':state.csrf,Origin:'https://untrusted.example'},body:JSON.stringify(input)})).status,403);
  const badHostStatus=await new Promise((resolve,reject)=>{ const request=httpRequest(`${app.url}/api/state`,{headers:{Host:'untrusted.example'}},response=>{ response.resume(); resolve(response.statusCode); }); request.on('error',reject); request.end(); });
  assert.equal(badHostStatus,403);
  assert.equal((await fetch(`${app.url}/.local/backups/secrets`)).status,404);
  assert.equal((await fetch(`${app.url}/preview/`)).status,200);
  input.values['hero.title1']='Saved through API';
  const result=await fetch(`${app.url}/api/save`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-CSRF':state.csrf,Origin:app.url},body:JSON.stringify(input)});
  assert.equal(result.status,200); assert((await (await fetch(`${app.url}/preview/`)).text()).includes('Saved through API'));
});

test('publish pushes only managed website and README, preserving the application index', async t => {
  const f=await fixture(t); const r=await remoteFixture(f);
  await mkdir(path.join(f.project,'.github/workflows'),{recursive:true});
  const workflow='name: Deploy YiLin website\non: workflow_dispatch\n';
  await writeFile(path.join(f.project,'.github/workflows/website-pages.yml'),workflow);
  await writeFile(path.join(f.project,'.github/workflows/unrelated.yml'),'private unrelated workflow');
  await git(['init','--initial-branch=main','.'],f.project); await writeFile(path.join(f.project,'unrelated.txt'),'private local edit'); await git(['add','unrelated.txt'],f.project);
  const indexBefore=await git(['write-tree'],f.project);
  await mkdir(path.join(f.site,'.local'),{recursive:true}); await writeFile(path.join(f.site,'.local/private.txt'),'must never publish');
  const publisher=createPublisher(f.store,{url:r.remote,branch:'main'});
  const job=await finish(await publisher.start({revision:(await f.store.state()).revision,expectedHead:r.head}));
  assert.equal(job.status,'succeeded',job.error); assert(job.files.length>0);
  assert.equal(await git(['show','main:README.md'],r.remote),'# Local app');
  assert.equal(await git(['show','main:unrelated.txt'],r.remote),'remote original');
  assert.equal((await runGit(['show','main:website/.local/private.txt'],r.remote)).code,128);
  assert.equal(await git(['show','main:.github/workflows/website-pages.yml'],r.remote),workflow.trim());
  assert.equal((await runGit(['show','main:.github/workflows/unrelated.yml'],r.remote)).code,128);
  assert.equal(await git(['write-tree'],f.project),indexBefore);
  assert.equal((await publisher.repository()).head,job.commit);
  const next=await finish(await publisher.start({revision:(await f.store.state()).revision,expectedHead:job.commit}));
  assert.equal(next.status,'succeeded',next.error); assert.equal(next.noChanges,true);
});

test('publishing can exclude the software README and rejects stale remote heads', async t => {
  const f=await fixture(t); const r=await remoteFixture(f); const publisher=createPublisher(f.store,{url:r.remote,branch:'main'});
  await writeFile(path.join(r.seed,'new.txt'),'A remote update'); await git(['add','.'],r.seed); await commit(r.seed,'Remote update'); await git(['push','origin','main'],r.seed);
  const stale=await finish(await publisher.start({revision:(await f.store.state()).revision,expectedHead:r.head}));
  assert.equal(stale.status,'failed'); assert.match(stale.error,/远端已有新提交/);
  const fresh=await publisher.repository();
  const job=await finish(await publisher.start({revision:(await f.store.state()).revision,expectedHead:fresh.head,includeAppReadme:false}));
  assert.equal(job.status,'succeeded',job.error); assert.equal(await git(['show','main:README.md'],r.remote),'# Remote README');
});

test('rejected pushes retain the local commit for recovery', async t => {
  const f=await fixture(t); const r=await remoteFixture(f); const hook=path.join(r.remote,'hooks/pre-receive');
  await writeFile(hook,'#!/bin/sh\necho "fixture rejects push" >&2\nexit 1\n'); await chmod(hook,0o755);
  const publisher=createPublisher(f.store,{url:r.remote,branch:'main'});
  const job=await finish(await publisher.start({revision:(await f.store.state()).revision,expectedHead:r.head}));
  assert.equal(job.status,'failed'); assert.match(job.error,/fixture rejects push/); assert(job.commit);
  assert.equal(await git(['rev-parse','main'],r.remote),r.head);
  assert.equal(await git(['rev-parse','HEAD'],job.checkout),job.commit);
});
