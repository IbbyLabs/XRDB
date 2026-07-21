/**
 * Copies text to the clipboard, returning whether it worked.
 *
 * Two things can go wrong, and both are ordinary rather than exotic. The async
 * Clipboard API does not exist at all on insecure origins, which is what a
 * self-hosted instance reached over plain http on a LAN address is. And where
 * it does exist it can still refuse: permission denied, or the document not
 * focused. Either way the older selection-based copy usually still works, so it
 * backs up both paths rather than only the missing-API one.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the selection copy below.
    }
  }
  return selectionCopy(text);
}

function selectionCopy(text: string): boolean {
  try {
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
