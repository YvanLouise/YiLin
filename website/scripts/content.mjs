import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export async function readContent(root) {
  const document = JSON.parse(await readFile(path.join(root, 'data/content.json'), 'utf8'));
  if (document.version !== 1 || !Array.isArray(document.fields) || !Array.isArray(document.groups)) throw new Error('Invalid content document');
  const keys = new Set();
  for (const field of document.fields) {
    if (!/^[\w.]+$/.test(field.key) || keys.has(field.key) || typeof field.value !== 'string') throw new Error('Invalid content field');
    keys.add(field.key);
  }
  return document;
}

export function contentValues(document) {
  return Object.fromEntries(document.fields.map(field => [field.key, field.value]));
}

export function updateContent(document, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('网站文案格式不正确');
  const keys = Object.keys(values);
  if (keys.length !== document.fields.length || document.fields.some(field => !Object.hasOwn(values, field.key))) throw new Error('文案字段发生变化，请重新载入管理页');
  return { ...document, fields: document.fields.map(field => {
    const value = values[field.key];
    if (typeof value !== 'string' || value.length > field.maxLength || value.includes('\0')) throw new Error(`「${field.label}」内容过长或格式不正确`);
    return { ...field, value };
  }) };
}

export function validateRelease(release) {
  if (!release || !/^\d+\.\d+\.\d+$/.test(release.version)) throw new Error('版本号应为 1.0.41 这样的格式');
  const expected = ['version', 'androidUrl', 'releaseUrl', 'repositoryUrl', 'siteUrl'];
  if (Object.keys(release).length !== expected.length || !expected.every(key => Object.hasOwn(release, key))) throw new Error('版本与链接字段不完整');
  for (const key of expected.slice(1)) {
    if (typeof release[key] !== 'string' || release[key].length > 2048) throw new Error(`Invalid ${key}`);
    const url = new URL(release[key]);
    if (url.protocol !== 'https:' || url.username || url.password || /[<>"'\s]/.test(release[key])) throw new Error(`${key} 必须是有效的 HTTPS 地址`);
  }
  return release;
}
