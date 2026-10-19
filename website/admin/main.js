import { renderMarkdown } from './markdown.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
let state, saved, draft, remote, busy = false, activeView = 'content', activeGroup = 'hero', activeReadme = 'app', device = 'desktop';
let previewRevision = 0;

function notice(message, error = false) { $('#notice').textContent = message; $('#notice').classList.toggle('is-error', error); $('#notice').hidden = !message; }
function isDirty() { return !!draft && JSON.stringify(draft) !== JSON.stringify(saved); }
function updateStateLabel() {
  const label = $('#save-state'); const dirty = isDirty();
  label.textContent = busy ? '正在处理' : dirty ? '待保存' : '已保存';
  label.classList.toggle('is-dirty', dirty); label.classList.remove('is-error');
  $('#save-button').disabled = busy || !state; $('#publish-button').disabled = busy || !state;
  $$('input,textarea,[data-view],[data-readme],[data-group],#check-repository,#refresh-preview').forEach(node => { node.disabled = busy; });
  document.title = `${dirty ? '* ' : ''}译林 · 本地网站管理`;
}
async function request(url, input) {
  const response = await fetch(url, input === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-CSRF': state.csrf }, body: JSON.stringify(input) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求未完成');
  return result;
}
function setState(value) {
  state = value; saved = { values: { ...value.values }, release: { ...value.release }, readmes: { ...value.readmes } };
  draft = structuredClone(saved); renderContent(); renderReadme(); renderRelease(); updateStateLabel();
}

function renderGroups() {
  $('#content-groups').replaceChildren(...state.document.groups.map(group => {
    const button = element('button', '', group.label); button.type = 'button'; button.dataset.group = group.id; button.setAttribute('aria-current', String(group.id === activeGroup));
    button.addEventListener('click', () => { activeGroup = group.id; $('#content-search').value = ''; switchView('content'); renderContent(); reloadPreview(); });
    return button;
  }));
}
function renderContent() {
  if (!state) return;
  const query = $('#content-search').value.trim().toLowerCase();
  const fields = state.document.fields.filter(field => query ? `${field.label} ${draft.values[field.key]}`.toLowerCase().includes(query) : field.group === activeGroup);
  $('#group-title').textContent = query ? '搜索文案' : state.document.groups.find(group => group.id === activeGroup)?.label || '网站文案';
  $('#field-count').textContent = `${fields.length} 项文案`;
  $('#content-fields').replaceChildren(...fields.map(field => {
    const label = element('label', 'content-field'); const title = element('span', '', field.label); const marker = element('small', '', '已修改'); marker.hidden = draft.values[field.key] === saved.values[field.key]; title.append(marker);
    const input = element(field.multiline ? 'textarea' : 'input'); input.id = `copy-${field.key}`; if (!field.multiline) input.type = 'text'; input.value = draft.values[field.key]; input.maxLength = field.maxLength;
    input.addEventListener('input', () => { draft.values[field.key] = input.value; marker.hidden = input.value === saved.values[field.key]; updateStateLabel(); });
    label.append(title, input);
    if (field.value.includes('{word}') || field.value.includes('__APP_VERSION__')) label.append(element('small', 'field-caption', field.value.includes('{word}') ? '{word} 会替换为当前单词。' : '__APP_VERSION__ 会替换为版本号。'));
    return label;
  }));
  if (!fields.length) $('#content-fields').append(element('p', 'empty-state', '没有找到匹配的文案。'));
  $$('[data-group]').forEach(button => button.setAttribute('aria-current', String(button.dataset.group === activeGroup)));
}

function switchView(view) {
  activeView = view;
  for (const key of ['content','readme','release','repository']) $(`#${key}-view`).hidden = key !== view;
  $('#group-navigation').hidden = view !== 'content';
  $$('[data-view]').forEach(button => { if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  if (view === 'content') updatePreviewSize();
  if (view === 'repository') void refreshHistory();
}
$$('[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
$('#content-search').addEventListener('input', renderContent);

function renderReadme() {
  if (!draft) return;
  $('#readme-editor').value = draft.readmes[activeReadme];
  $('#readme-editor-label').textContent = activeReadme === 'app' ? '软件 README 内容' : '网站 README 内容';
  $('#readme-path').textContent = `${state.paths[activeReadme]} · Markdown`;
  $('#readme-panel').setAttribute('aria-labelledby', `readme-${activeReadme}-tab`);
  $$('[data-readme]').forEach(button => { const selected = button.dataset.readme === activeReadme; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; });
  renderMarkdown(draft.readmes[activeReadme], $('#readme-preview'));
}
$$('[data-readme]').forEach(button => {
  button.addEventListener('click', () => { activeReadme = button.dataset.readme; renderReadme(); });
  button.addEventListener('keydown', event => {
    if (!['ArrowRight','ArrowLeft','Home','End'].includes(event.key)) return;
    event.preventDefault(); activeReadme = event.key === 'Home' ? 'app' : event.key === 'End' ? 'site' : activeReadme === 'app' ? 'site' : 'app';
    renderReadme(); $(`#readme-${activeReadme}-tab`).focus();
  });
});
$('#readme-editor').addEventListener('input', event => { draft.readmes[activeReadme] = event.target.value; renderMarkdown(event.target.value, $('#readme-preview')); updateStateLabel(); });

function renderRelease() {
  const labels = { version:'Android 版本号', androidUrl:'Android 安装包地址', releaseUrl:'GitHub 版本说明地址', repositoryUrl:'GitHub 项目地址', siteUrl:'介绍网站地址' };
  $('#release-fields').replaceChildren(...Object.entries(labels).map(([key, text]) => {
    const label = element('label', 'content-field'); label.append(element('span', '', text));
    const input = element('input'); input.type = key === 'version' ? 'text' : 'url'; input.value = draft.release[key]; input.maxLength = key === 'version' ? 30 : 2048;
    input.addEventListener('input', () => { draft.release[key] = input.value; updateStateLabel(); }); label.append(input); return label;
  }));
}
function updatePreviewSize() {
  const width = device === 'mobile' ? 390 : 1100;
  const available = $('#preview-slot').clientWidth;
  if (!available) return;
  const scale = Math.min(1, available / width);
  const frame = $('#site-preview'); frame.style.setProperty('--frame-width', `${width}px`); frame.style.setProperty('--frame-height', `${Math.max(900, $('#preview-slot').clientHeight / scale)}px`); frame.style.setProperty('--frame-scale', scale);
}
function reloadPreview() {
  const anchors = { hero:'top', reading:'experience', practice:'practice', faq:'faq', download:'download', navigation:'top', interaction:'practice', metadata:'top' };
  $('#site-preview').src = `/preview/?revision=${++previewRevision}#${anchors[activeGroup] || 'top'}`; updatePreviewSize();
}
new ResizeObserver(updatePreviewSize).observe($('#preview-slot'));
$$('[data-device]').forEach(button => button.addEventListener('click', () => { device = button.dataset.device; $$('[data-device]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); updatePreviewSize(); }));

async function saveDraft() {
  const next = await request('/api/save', { revision: state.revision, ...draft });
  setState(next); reloadPreview(); return next;
}
async function saveAction() {
  if (busy || !state) return;
  busy = true; updateStateLabel(); notice('正在保存并重建网站…');
  try { const result = await saveDraft(); notice(result.changed.length ? '修改已保存，网站预览已更新。' : '内容已是最新，网站预览已刷新。'); }
  catch (error) { notice(error.message, true); }
  finally { busy = false; updateStateLabel(); }
}
$('#save-button').addEventListener('click', saveAction);
$('#refresh-preview').addEventListener('click', saveAction);
document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveAction(); } });
window.addEventListener('beforeunload', event => { if (isDirty() || busy) { event.preventDefault(); event.returnValue = ''; } });

async function refreshRepository() {
  $('#connection-state').textContent = '正在连接…';
  try {
    remote = await request('/api/repository'); $('#connection-state').textContent = '已连接'; $('#remote-head').textContent = remote.head.slice(0, 12); return remote;
  } catch (error) { remote = null; $('#connection-state').textContent = error.message; $('#remote-head').textContent = '—'; throw error; }
}
$('#check-repository').addEventListener('click', async () => { if (busy) return; $('#check-repository').disabled = true; try { await refreshRepository(); notice('仓库状态已刷新。'); } catch (error) { notice(error.message, true); } finally { $('#check-repository').disabled = false; } });
function formatTime(value) { return new Date(value).toLocaleString('zh-CN', { hour12:false }); }
async function refreshHistory() {
  try {
    const { history } = await request('/api/history');
    $('#publish-history').replaceChildren(...history.map(job => {
      const row = element('div', `history-record${job.status === 'failed' ? ' is-error' : ''}`); row.append(element('span', '', job.status === 'succeeded' ? '已完成' : '未完成'));
      const text = element('div', '', job.message); text.append(element('small', '', `${formatTime(job.finishedAt)}${job.commit ? ` · ${job.commit.slice(0, 10)}` : ''}`)); if (job.error) text.append(element('small', '', job.error)); row.append(text); return row;
    }));
    if (!history.length) $('#publish-history').append(element('p', 'empty-state', '尚未更新仓库。'));
    const success = history.find(job => job.status === 'succeeded');
    $('#last-publish').textContent = success ? `${formatTime(success.finishedAt)} · ${success.commit.slice(0, 7)}` : '尚未更新仓库';
  } catch (error) { notice(error.message, true); }
}
function renderJob(job) {
  const panel = $('#job-panel'); panel.hidden = false; panel.classList.toggle('is-error', job.status === 'failed');
  $('#job-title').textContent = job.status === 'running' ? '正在更新仓库' : job.status === 'succeeded' ? '仓库更新完成' : '仓库更新未完成';
  $('#job-steps').replaceChildren(...job.steps.map(step => element('li', '', step.label)));
  $('#job-result').replaceChildren();
  if (job.error) $('#job-result').textContent = `${job.error}\n本地保存的内容仍然保留。若提示认证失败，请先完成上方 GitHub 登录。`;
  else if (job.status === 'succeeded') {
    $('#job-result').append(document.createTextNode(job.noChanges ? '仓库内容已是最新。 ' : '已提交并推送，远端提交已确认。 '));
    const link = element('a', '', `查看提交 ${job.commit.slice(0, 10)}`); link.href = `https://github.com/YvanLouise/YiLin/commit/${job.commit}`; link.target = '_blank'; link.rel = 'noopener'; $('#job-result').append(link);
  }
  $('#job-files-container').hidden = !job.files?.length; $('#job-files').textContent = job.files?.join('\n') || '';
}
async function followJob(initial) {
  let job = initial;
  while (true) {
    renderJob(job); if (job.status !== 'running') break;
    await new Promise(resolve => setTimeout(resolve, 1000)); job = await request(`/api/jobs/${job.id}`);
  }
  notice(job.status === 'succeeded' ? '仓库更新完成。' : '仓库更新未完成，请查看进度中的原因。', job.status !== 'succeeded');
  await refreshHistory(); if (job.status === 'succeeded') void refreshRepository().catch(() => {});
}
$('#publish-button').addEventListener('click', async () => {
  if (busy || !state) return;
  busy = true; updateStateLabel(); notice('正在保存内容并准备更新仓库…');
  try {
    await saveDraft(); if (!remote) await refreshRepository();
    const job = await request('/api/publish', { revision: state.revision, expectedHead: remote.head, message: $('#commit-message').value, includeAppReadme: $('#include-app-readme').checked });
    switchView('repository'); await followJob(job);
  } catch (error) { notice(error.message, true); }
  finally { busy = false; updateStateLabel(); }
});

try {
  setState(await request('/api/state')); renderGroups();
  void refreshRepository().catch(() => {}); void refreshHistory();
  if (state.currentJob?.status === 'running') { busy = true; updateStateLabel(); switchView('repository'); void followJob(state.currentJob).finally(() => { busy = false; updateStateLabel(); }); }
} catch (error) { notice(`管理页载入失败：${error.message}`, true); $('#save-state').textContent = '载入失败'; $('#save-state').classList.add('is-error'); }
