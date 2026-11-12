/**
 * Copy text to the clipboard.
 *
 * `navigator.clipboard` only exists on secure origins (https or localhost). Opened from a phone over the LAN
 * (http://192.168.x.x:8000) it is undefined, and every copy button threw. Fall back to a hidden textarea there.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** Only let links point at ordinary web, mail or in-app targets (blocks javascript:, data:, vbscript: ...). */
export function safeHref(url: string): string | undefined {
  const trimmed = (url || '').trim();
  if (!trimmed) return undefined;
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  // Relative paths and anchors have no scheme; anything else with a scheme is rejected
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return undefined;
  return trimmed;
}
