import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { contentValues, escapeHtml, readContent, validateRelease } from './content.mjs';

export async function buildSite(root = fileURLToPath(new URL('../', import.meta.url))) {
const release = JSON.parse(await readFile(path.join(root, 'data/release.json'), 'utf8'));
validateRelease(release);
const document = await readContent(root);
const values = contentValues(document);
const schema = new Map(document.fields.map(field => [field.key, field]));
const replacements = {
  '__APP_VERSION__': release.version,
  '__ANDROID_URL__': release.androidUrl,
  '__RELEASE_URL__': release.releaseUrl,
  '__REPOSITORY_URL__': release.repositoryUrl,
  '__SITE_URL__': release.siteUrl,
};
let html = await readFile(path.join(root, 'src/index.html'), 'utf8');
const application = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: values['navigation.brand'], applicationCategory: 'EducationalApplication', operatingSystem: 'Android', softwareVersion: release.version, downloadUrl: release.androidUrl, url: `${release.siteUrl}/`, description: values['metadata.applicationDescription'] };
html = html.replace('__APPLICATION_JSON__', JSON.stringify(application).replaceAll('<', '\\u003c'));
html = html.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
  if (!schema.has(key)) throw new Error(`Unknown content field: ${key}`);
  const escaped = escapeHtml(values[key]);
  return schema.get(key).format === 'attribute' ? escaped : escaped.replace(/\r?\n/g, '<br>');
});
for (const [key, value] of Object.entries(replacements)) html = html.replaceAll(key, escapeHtml(value));
if (/__[A-Z_]+__/.test(html)) throw new Error('Unresolved page metadata');
await mkdir(path.join(root, 'dist'), { recursive: true });
await cp(path.join(root, 'public'), path.join(root, 'dist'), { recursive: true });
await Promise.all(['styles.css', 'main.js'].map((file) => cp(path.join(root, 'src', file), path.join(root, 'dist', file))));
await writeFile(path.join(root, 'dist/index.html'), html);
await writeFile(path.join(root, 'dist/content.js'), `export const content = ${JSON.stringify(values)};\n`);
await writeFile(path.join(root, 'dist/robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${release.siteUrl}/sitemap.xml\n`);
await writeFile(path.join(root, 'dist/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeHtml(release.siteUrl)}/</loc></url></urlset>\n`);
return { version: release.version, fields: document.fields.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildSite();
  console.log(`Built YiLin introduction site (Android v${result.version}, ${result.fields} editable fields) -> dist/`);
}
