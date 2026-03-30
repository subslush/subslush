const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const BOLD_PATTERN = /\*\*(.+?)\*\*/g;
const BULLET_PATTERN = /^\s*(?:[-*•])\s+(.+)$/;

const renderLineWithBoldMarkers = (line: string): string => {
  let html = '';
  let cursor = 0;

  for (const match of line.matchAll(BOLD_PATTERN)) {
    const index = match.index ?? 0;
    html += escapeHtml(line.slice(cursor, index));
    html += `<strong>${escapeHtml(match[1] || '')}</strong>`;
    cursor = index + match[0].length;
  }

  html += escapeHtml(line.slice(cursor));
  return html;
};

export const renderTextWithBoldMarkers = (value: string): string => {
  if (!value) return '';

  return value
    .split(/\r?\n/)
    .map(line => renderLineWithBoldMarkers(line))
    .join('<br />');
};

type RichTextBlock =
  | { type: 'paragraph'; lines: string[] }
  | { type: 'list'; items: string[] };

const extractBulletContent = (line: string): string | null => {
  const match = line.match(BULLET_PATTERN);
  if (!match) {
    return null;
  }
  const content = (match[1] || '').trim();
  return content.length > 0 ? content : null;
};

export const renderRichTextWithBullets = (value: string): string => {
  if (!value) return '';

  const blocks: RichTextBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push({ type: 'paragraph', lines: paragraphLines });
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push({ type: 'list', items: listItems });
    listItems = [];
  };

  const lines = value.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const bulletContent = extractBulletContent(line);

    if (bulletContent !== null) {
      flushParagraph();
      listItems.push(bulletContent);
      continue;
    }

    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    paragraphLines.push(line.trim());
  }

  flushParagraph();
  flushList();

  if (blocks.length === 0) return '';

  return blocks
    .map(block => {
      if (block.type === 'list') {
        const items = block.items
          .map(item => `<li>${renderLineWithBoldMarkers(item)}</li>`)
          .join('');
        return `<ul class="list-disc pl-5 space-y-1">${items}</ul>`;
      }

      return `<p>${block.lines.map(line => renderLineWithBoldMarkers(line)).join('<br />')}</p>`;
    })
    .join('');
};
