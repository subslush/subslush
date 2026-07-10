const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export const normalizePlainText = (value: string): string => {
  return value
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity: string) => {
      const normalized = entity.toLowerCase();
      if (normalized[0] === '#') {
        const isHex = normalized.startsWith('#x');
        const codePoint = Number.parseInt(
          normalized.slice(isHex ? 2 : 1),
          isHex ? 16 : 10
        );
        return Number.isFinite(codePoint)
          ? String.fromCodePoint(codePoint)
          : '';
      }
      return ENTITY_MAP[normalized] ?? '';
    })
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
