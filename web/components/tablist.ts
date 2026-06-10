// ARIA tablist keyboard pattern: arrow keys move focus and activate,
// Home/End jump to the ends. Pair with roving tabindex on the tabs.
export function tablistKeyNav(e: React.KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
  const current = tabs.indexOf(document.activeElement as HTMLElement);
  if (current === -1) return;
  e.preventDefault();
  const next =
    e.key === 'ArrowLeft'  ? (current - 1 + tabs.length) % tabs.length :
    e.key === 'ArrowRight' ? (current + 1) % tabs.length :
    e.key === 'Home'       ? 0 : tabs.length - 1;
  tabs[next].focus();
  tabs[next].click();
}
