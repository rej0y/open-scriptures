export function shouldCloseHighlightsDrawer(event: MouseEvent) {
  const target = event.target;

  if (!(target instanceof Element)) return false;
  if (target.closest('.highlights-drawer') || target.closest('.open-highlights-button')) return false;

  return true;
}
