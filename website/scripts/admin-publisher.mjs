import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AdminError, atomicWrite } from './admin-store.mjs';
import { buildSite } from './build.mjs';
import { fingerprint } from './content.mjs';

const managedEntries = ['.gitignore', '.openai/hosting.json', 'README.md', 'package.json', 'start-admin.cmd', 'data', 'src', 'public', 'dist', 'scripts', 'admin', 'tests', 'design'];

export function runGit(args, cwd, timeout = 45_000) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_OPTIONAL_LOCKS: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    child.stdout.on('data', chunk => { if (stdout.length < 1_000_000) stdout += chunk; });
    child.stderr.on('data', chunk => { if (stderr.length < 1_000_000) stderr += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(new AdminError(`无法运行 Git：${error.message}`, 500)); });
    child.once('close', code => {
      clearTimeout(timer);
      if (timedOut) { reject(new AdminError('Git 请求超时，请检查网络连接后重试', 502)); return; }
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim().replace(/gh[pousr]_[A-Za-z0-9_]+/g, '[redacted]') });
    });
  });
}

async function git(args, cwd, timeout) {
  const result = await runGit(args, cwd, timeout);
  if (result.code !== 0) throw new AdminError(`Git 操作失败：${result.stderr.slice(0, 1800) || result.stdout.slice(0, 1000)}`, 502);
  return result.stdout;
}

async function collectFiles(root) {
  const collected = new Map();
  async function walk(relative) {
    const filename = path.join(root, relative);
    let info;
    try { info = await lstat(filename); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (info.isSymbolicLink()) throw new AdminError(`发布文件不能使用符号链接：${relative}`);
    if (info.isDirectory()) {
      for (const child of (await readdir(filename)).sort()) {
        if (['.git', '.local', 'node_modules', 'artifacts'].includes(child) || /\.tmp$/.test(child)) continue;
        await walk(path.join(relative, child));
      }
    } else if (info.isFile()) collected.set(relative, await readFile(filename));
  }
  for (const entry of managedEntries) await walk(entry);
  return collected;
}

function fileSignature(files) {
  return fingerprint([...files].map(([name, bytes]) => `${name}\0${fingerprint(bytes)}`).join('\n'));
}

export function createPublisher(store, configuration) {
  const config = { directory: 'website', ...configuration };
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(config.directory) || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(config.branch) || config.branch.includes('..')) throw new Error('Invalid repository configuration');
  let currentJob = null;
  const historyPath = path.join(store.siteRoot, '.local/publish-history.json');
  async function history() { try { return JSON.parse(await readFile(historyPath, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } }
  async function repository() {
    const output = await git(['ls-remote', config.url, `refs/heads/${config.branch}`], store.siteRoot, 20_000);
    const head = output.split(/\s+/)[0];
    if (!/^[a-f0-9]{40,64}$/.test(head)) throw new AdminError('目标分支不存在或无法读取', 502);
    return { ...config, head };
  }
  async function start(input) {
    if (store.isBusy()) throw new AdminError('已有保存或仓库更新正在进行', 409);
    if ((await store.read()).revision !== input.revision) throw new AdminError('本地文件发生变化，请先重新载入或保存', 409);
    if (!/^[a-f0-9]{40,64}$/.test(input.expectedHead || '')) throw new AdminError('请先连接并刷新仓库状态');
    const message = input.message?.trim() || 'docs: update YiLin website and README';
    if (message.length > 180 || /[\r\n\0]/.test(message)) throw new AdminError('提交说明不能超过 180 字，且应为单行');
    if (input.includeAppReadme !== undefined && typeof input.includeAppReadme !== 'boolean') throw new AdminError('README 同步选项不正确');
    if (store.isBusy()) throw new AdminError('已有保存或仓库更新正在进行', 409);
    const job = { id: randomUUID(), status: 'running', startedAt: new Date().toISOString(), steps: [], message, includeAppReadme: input.includeAppReadme !== false };
    currentJob = job;
    const note = label => job.steps.push({ label, at: new Date().toISOString() });
    void store.exclusive(async () => {
      try {
        note('检查本地内容并重建网站');
        const state = await store.read();
        if (state.revision !== input.revision) throw new AdminError('本地内容发生变化，请重新保存后更新', 409);
        await buildSite(store.siteRoot);
        const files = await collectFiles(store.siteRoot);
        const signature = fileSignature(files);
        const localRoot = path.join(store.siteRoot, '.local/publish');
        await mkdir(localRoot, { recursive: true });
        const checkout = await mkdtemp(path.join(localRoot, 'update-'));
        job.checkout = checkout;
        note(`读取远端 ${config.branch} 分支并准备独立发布目录`);
        await git(['init', '--initial-branch', config.branch, '.'], checkout);
        await git(['remote', 'add', 'origin', config.url], checkout);
        await git(['sparse-checkout', 'init', '--cone'], checkout);
        await git(['sparse-checkout', 'set', config.directory], checkout);
        await git(['fetch', '--depth=1', '--filter=blob:none', 'origin', `refs/heads/${config.branch}`], checkout, 90_000);
        const base = await git(['rev-parse', 'FETCH_HEAD'], checkout);
        if (base !== input.expectedHead) throw new AdminError('远端已有新提交。本次未推送，请刷新仓库状态、核对后重试', 409);
        await git(['checkout', '-B', config.branch, 'FETCH_HEAD'], checkout);
        // The isolated checkout contains only the selected remote branch. Never stage the app's working tree.
        for (const [relative, bytes] of files) {
          const destination = path.join(checkout, config.directory, relative);
          const segments = path.relative(checkout, destination).split(path.sep);
          let cursor = checkout;
          for (const segment of segments) {
            cursor = path.join(cursor, segment);
            const info = await lstat(cursor).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
            if (info?.isSymbolicLink()) throw new AdminError('远端网站目录包含符号链接，已停止更新');
          }
          await mkdir(path.dirname(destination), { recursive: true });
          await writeFile(destination, bytes);
        }
        if (job.includeAppReadme) {
          const readme = path.join(checkout, 'README.md');
          if ((await lstat(readme).catch(() => null))?.isSymbolicLink()) throw new AdminError('远端 README 是符号链接，已停止更新');
          await writeFile(readme, state.raw.appReadme);
        }
        await git(['add', '--all', '--', config.directory, ...(job.includeAppReadme ? ['README.md'] : [])], checkout);
        job.files = (await git(['diff', '--cached', '--name-status'], checkout)).split('\n').filter(Boolean);
        if ((await store.read()).revision !== state.revision || fileSignature(await collectFiles(store.siteRoot)) !== signature) throw new AdminError('更新过程中本地内容发生变化。本次未推送，请重新保存后重试', 409);
        if (!job.files.length) {
          job.commit = base; job.noChanges = true; note('仓库内容已是最新，无需新增提交');
        } else {
          note(`提交 ${job.files.length} 个文件的变更`);
          const identity = await runGit(['var', 'GIT_AUTHOR_IDENT'], checkout);
          const fallback = identity.code === 0 ? [] : ['-c', 'user.name=YiLin Admin', '-c', 'user.email=YvanLouise@users.noreply.github.com'];
          await git([...fallback, 'commit', '-m', message], checkout);
          job.commit = await git(['rev-parse', 'HEAD'], checkout);
          note('推送到 GitHub 仓库');
          await git(['push', 'origin', `HEAD:refs/heads/${config.branch}`], checkout, 90_000);
          const remote = await repository();
          if (remote.head !== job.commit) throw new AdminError('远端提交已变化，请刷新仓库确认更新结果', 409);
          note('已确认远端提交与本次更新一致');
        }
        job.status = 'succeeded';
      } catch (error) {
        job.status = 'failed'; job.error = error.message;
        note('更新未完成，本地内容和独立发布目录已保留');
      } finally {
        job.finishedAt = new Date().toISOString();
        try {
          const records = await history();
          await mkdir(path.dirname(historyPath), { recursive: true });
          await atomicWrite(historyPath, `${JSON.stringify([job, ...records].slice(0, 30), null, 2)}\n`);
        } catch { job.historyWarning = '更新结果未能写入历史，请保留当前页面中的提交号'; }
      }
    }).catch(error => { job.status = 'failed'; job.error = error.message; });
    return job;
  }
  return { config, repository, start, history, job: id => currentJob?.id === id ? currentJob : null, current: () => currentJob };
}
