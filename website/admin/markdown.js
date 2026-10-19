const element = (tag, text) => { const node = document.createElement(tag); if (text != null) node.textContent = text; return node; };

function inline(target, value) {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|!?\[[^\]]+\]\([^\s)]+\))/g;
  let start = 0;
  for (const match of value.matchAll(pattern)) {
    target.append(document.createTextNode(value.slice(start, match.index)));
    const text = match[0];
    if (text.startsWith('`')) target.append(element('code', text.slice(1, -1)));
    else if (text.startsWith('**')) target.append(element('strong', text.slice(2, -2)));
    else {
      const parts = text.match(/^(!?)\[([^\]]+)\]\(([^)]+)\)$/);
      try {
        const url = new URL(parts[3], 'https://github.com/YvanLouise/YiLin/blob/main/');
        if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) throw new Error('Unsupported URL');
        const link = element('a', `${parts[1] ? '图片：' : ''}${parts[2]}`);
        link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; target.append(link);
      } catch { target.append(document.createTextNode(text)); }
    }
    start = match.index + text.length;
  }
  target.append(document.createTextNode(value.slice(start)));
}

export function renderMarkdown(markdown, target) {
  const fragment = document.createDocumentFragment();
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    if (/^\s*```/.test(line)) {
      const code = []; index++;
      while (index < lines.length && !/^\s*```/.test(lines[index])) code.push(lines[index++]);
      const pre = element('pre'); pre.append(element('code', code.join('\n'))); fragment.append(pre); index++; continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { const node = element(`h${heading[1].length}`); inline(node, heading[2]); fragment.append(node); index++; continue; }
    if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) { fragment.append(element('hr')); index++; continue; }
    if (/^\s*>/.test(line)) { const quote = element('blockquote'); inline(quote, line.replace(/^\s*>\s?/, '')); fragment.append(quote); index++; continue; }
    if (/^\s*(?:[-*+] |\d+\. )/.test(line)) {
      const ordered = /^\s*\d+\./.test(line); const list = element(ordered ? 'ol' : 'ul');
      while (index < lines.length && /^\s*(?:[-*+] |\d+\. )/.test(lines[index])) {
        const item = element('li'); inline(item, lines[index++].replace(/^\s*(?:[-*+] |\d+\. )/, '')); list.append(item);
      }
      fragment.append(list); continue;
    }
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] || '')) {
      const table = element('table');
      const row = (value, header = false) => { const tr = element('tr'); for (const text of value.trim().replace(/^\||\|$/g, '').split('|')) { const cell = element(header ? 'th' : 'td'); inline(cell, text.trim()); tr.append(cell); } return tr; };
      const head = element('thead'); head.append(row(line, true)); table.append(head); index += 2;
      const body = element('tbody'); while (index < lines.length && lines[index].includes('|')) body.append(row(lines[index++]));
      table.append(body); fragment.append(table); continue;
    }
    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !/^(?:#{1,6}\s|\s*```|\s*>|\s*[-*+] |\s*\d+\. )/.test(lines[index])) paragraph.push(lines[index++]);
    if (!paragraph.length) paragraph.push(lines[index++]);
    const node = element('p'); inline(node, paragraph.join('\n')); fragment.append(node);
  }
  target.replaceChildren(fragment);
}
