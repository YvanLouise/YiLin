import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildSite } from './build.mjs';
import { contentValues, fingerprint, readContent, updateContent, validateRelease } from './content.mjs';

export class AdminError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export async function atomicWrite(filename, value) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  await writeFile(temporary, value, { flag: 'wx' });
  await rename(temporary, filename);
}

export function createStore(siteRoot, projectRoot = path.dirname(siteRoot)) {
  const files = {
    content: path.join(siteRoot, 'data/content.json'),
    release: path.join(siteRoot, 'data/release.json'),
    appReadme: path.join(projectRoot, 'README.md'),
    siteReadme: path.join(siteRoot, 'README.md'),
  };
  let locked = false;
  async function read() {
    const entries = await Promise.all(Object.entries(files).map(async ([id, filename]) => {
      if ((await lstat(filename)).isSymbolicLink()) throw new AdminError('管理文件不能使用符号链接');
      return [id, await readFile(filename, 'utf8')];
    }));
    const raw = Object.fromEntries(entries);
    return { raw, revision: fingerprint(JSON.stringify(raw)) };
  }
  async function state() {
    const { raw, revision } = await read();
    const document = JSON.parse(raw.content);
    return { revision, document, values: contentValues(document), release: JSON.parse(raw.release), readmes: { app: raw.appReadme, site: raw.siteReadme }, paths: { app: 'README.md', site: 'website/README.md' }, busy: locked };
  }
  async function exclusive(work) {
    if (locked) throw new AdminError('正在保存或更新仓库，请等待完成', 409);
    locked = true;
    try { return await work(); } finally { locked = false; }
  }
  async function save(input) {
    return exclusive(async () => {
      const before = await read();
      if (input.revision !== before.revision) throw new AdminError('文件已被其他窗口或编辑器修改，请重新载入后再保存', 409);
      let updated;
      try {
        updated = updateContent(JSON.parse(before.raw.content), input.values);
        validateRelease(input.release);
      } catch (error) { throw new AdminError(error.message); }
      for (const id of ['app', 'site']) {
        if (typeof input.readmes?.[id] !== 'string' || Buffer.byteLength(input.readmes[id]) > 512_000 || input.readmes[id].includes('\0')) throw new AdminError('README 应为不超过 500 KB 的文本');
      }
      const after = { content: `${JSON.stringify(updated, null, 2)}\n`, release: `${JSON.stringify(input.release, null, 2)}\n`, appReadme: input.readmes.app, siteReadme: input.readmes.site };
      const changed = Object.keys(files).filter(id => before.raw[id] !== after[id]);
      if (changed.length) {
        const backup = path.join(siteRoot, '.local/backups', `${Date.now()}-${randomUUID()}`);
        await mkdir(backup, { recursive: true });
        await Promise.all(changed.map(id => writeFile(path.join(backup, `${id}.txt`), before.raw[id], { flag: 'wx' })));
        if ((await read()).revision !== before.revision) throw new AdminError('保存前检测到文件变化，请重新载入', 409);
        const written = [];
        try {
          for (const id of changed) { await atomicWrite(files[id], after[id]); written.push(id); }
          await buildSite(siteRoot);
        } catch (error) {
          for (const id of written) {
            if (await readFile(files[id], 'utf8') === after[id]) await atomicWrite(files[id], before.raw[id]);
          }
          await buildSite(siteRoot).catch(() => {});
          throw new AdminError(`保存未完成，已保留备份并恢复可恢复的原文件：${error.message}`, 500);
        }
      } else await buildSite(siteRoot);
      return { ...(await state()), changed };
    });
  }
  return { siteRoot, projectRoot, files, read, state, save, exclusive, isBusy: () => locked, readContent: () => readContent(siteRoot) };
}
