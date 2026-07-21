/**
 * Copies text to the clipboard, returning whether it worked.
 *
 * The async Clipboard API only exists on secure origins. A self-hosted instance
 * reached over plain http on a LAN address is not one, so the fallback path is
 * the normal case there rather than an edge case: it selects the text in an
 * offscreen textarea and asks the document to copy it.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
