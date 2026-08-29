function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((part) => part[0]).join('') || '?').toUpperCase();
}

function escapeSvgText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character] || character));
}

/** A deterministic, local avatar. It does not make the browser contact a third party. */
export function initialsAvatarUrl(name: string): string {
  const label = initials(name);
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="${escapeSvgText(label)}"><rect width="96" height="96" rx="48" fill="hsl(${hue} 52% 35%)"/><text x="48" y="58" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="white">${escapeSvgText(label)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Accept only image locations allowed by the console CSP; external OAuth avatars fall back to initials. */
export function safeAvatarUrl(value: string | undefined, name: string): string {
  if (value) {
    if (/^data:image\//i.test(value) || value.startsWith('blob:')) return value;
    try {
      if (new URL(value, window.location.origin).origin === window.location.origin) return value;
    } catch {
      // Invalid avatar URLs are intentionally rendered as an initials avatar.
    }
  }
  return initialsAvatarUrl(name);
}
