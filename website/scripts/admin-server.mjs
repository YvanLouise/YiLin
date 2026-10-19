import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { AdminError, createStore } from './admin-store.mjs';
import { createPublisher } from './admin-publisher.mjs';
import { buildSite } from './build.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };

export async function createAdminServer({ siteRoot = fileURLToPath(new URL('../', import.meta.url)), projectRoot = path.dirname(siteRoot), repositoryConfig, port = 5194 } = {}) {
  const store = createStore(siteRoot, projectRoot);
  const config = repositoryConfig || JSON.parse(await readFile(path.join(siteRoot, 'data/repository.json'), 'utf8'));
  if (!repositoryConfig && config.url !== 'https://github.com/YvanLouise/YiLin.git') throw new Error('管理页只能更新配置的 YvanLouise/YiLin 仓库');
  const publisher = createPublisher(store, config);
  const csrf = randomBytes(32).toString('hex');
  await buildSite(siteRoot);
  function json(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(value)); }
  async function body(request) {
    if (!request.headers['content-type']?.startsWith('application/json')) throw new AdminError('请使用 JSON 请求', 415);
    let length = 0; const chunks = [];
    for await (const chunk of request) { length += chunk.length; if (length > 2_000_000) throw new AdminError('请求内容过大', 413); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks)); } catch { throw new AdminError('JSON 内容格式不正确'); }
  }
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    try {
      const address = server.address();
      const hosts = new Set([`127.0.0.1:${address.port}`, `localhost:${address.port}`]);
      if (!hosts.has(request.headers.host)) throw new AdminError('仅接受本机访问', 403);
      const origin = `http://${request.headers.host}`;
      if (request.headers.origin && request.headers.origin !== origin) throw new AdminError('不接受跨站请求', 403);
      if (request.headers['sec-fetch-site'] === 'cross-site') throw new AdminError('不接受跨站请求', 403);
      const url = new URL(request.url, origin);
      if (url.pathname.startsWith('/api/')) {
        response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
        if (request.method === 'GET') {
          if (url.pathname === '/api/state') return json(response, 200, { ...(await store.state()), csrf, repository: config, currentJob: publisher.current() });
          if (url.pathname === '/api/repository') return json(response, 200, await publisher.repository());
          if (url.pathname === '/api/history') return json(response, 200, { history: await publisher.history() });
          if (url.pathname.startsWith('/api/jobs/')) { const job = publisher.job(url.pathname.slice(10)); if (!job) throw new AdminError('更新任务不存在', 404); return json(response, 200, job); }
        } else if (request.method === 'POST') {
          if (request.headers['x-admin-csrf'] !== csrf) throw new AdminError('管理会话已失效，请刷新页面', 403);
          const input = await body(request);
          if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AdminError('请求格式不正确');
          if (url.pathname === '/api/save') return json(response, 200, { ...(await store.save(input)), csrf, repository: config, currentJob: publisher.current() });
          if (url.pathname === '/api/publish') return json(response, 202, await publisher.start(input));
        } else throw new AdminError('请求方法不支持', 405);
        throw new AdminError('接口不存在', 404);
      }
      if (!['GET', 'HEAD'].includes(request.method)) throw new AdminError('请求方法不支持', 405);
      const preview = url.pathname === '/preview' || url.pathname.startsWith('/preview/');
      const directory = path.join(siteRoot, preview ? 'dist' : 'admin');
      let relative = decodeURIComponent(preview ? url.pathname.replace(/^\/preview\/?/, '') : url.pathname.slice(1));
      if (!relative) relative = 'index.html';
      const filename = path.resolve(directory, relative);
      if (!filename.startsWith(`${directory}${path.sep}`) || !(await stat(filename)).isFile()) throw new AdminError('页面不存在', 404);
      const bytes = await readFile(filename);
      response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'Content-Security-Policy': `default-src 'self'; script-src 'self'${preview ? " 'unsafe-inline'" : ''}; style-src 'self'; img-src 'self' data:; font-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'none'; object-src 'none'` });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) { json(response, error.status || (error.code === 'ENOENT' ? 404 : 500), { error: error.status ? error.message : '操作失败，请检查本地文件和服务日志' }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, store, publisher, url: `http://127.0.0.1:${server.address().port}` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createAdminServer({ port: Number(process.env.ADMIN_PORT || 5194) });
  console.log(`YiLin local website admin: ${app.url}`);
  if (process.argv.includes('--open') && process.platform === 'win32') {
    const browser = spawn('cmd.exe', ['/d', '/c', 'start', '', app.url], { windowsHide: true, stdio: 'ignore' });
    browser.on('error', () => console.log(`Open ${app.url} in your browser.`));
  }
  const close = () => app.server.close(() => process.exit(0));
  process.on('SIGINT', close); process.on('SIGTERM', close);
}
