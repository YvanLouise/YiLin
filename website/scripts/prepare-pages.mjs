import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildSite } from './build.mjs';

async function copyPublicFiles(source, destination) {
  let info;
  try { info = await lstat(source); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (info.isSymbolicLink()) throw new Error('GitHub Pages assets must not use symbolic links');
  if (info.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const name of await readdir(source)) {
      if (['.git', '.local', 'node_modules'].includes(name)) continue;
      await copyPublicFiles(path.join(source, name), path.join(destination, name));
    }
  } else if (info.isFile()) {
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(source));
  }
}

export async function preparePages(siteRoot = fileURLToPath(new URL('../', import.meta.url))) {
  await buildSite(siteRoot);
  const localRoot = path.resolve(siteRoot, '.local');
  const output = path.resolve(localRoot, 'pages');
  if (path.dirname(output) !== localRoot || path.basename(output) !== 'pages') throw new Error('Invalid Pages output directory');
  if ((await lstat(localRoot).catch(() => null))?.isSymbolicLink() || (await lstat(output).catch(() => null))?.isSymbolicLink()) throw new Error('Pages output must not use symbolic links');
  // Reset only this known generated directory so removed assets cannot remain public.
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await copyPublicFiles(path.join(path.dirname(siteRoot), 'docs'), output);
  await copyPublicFiles(path.join(siteRoot, 'dist'), output);
  await writeFile(path.join(output, '.nojekyll'), '');
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(`GitHub Pages artifact: ${await preparePages()}`);
