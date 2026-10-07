/**
 * FullCalendar renders the prev/next toolbar icons as
 * <span class="fc-icon ..." role="img"> with no accessible name (axe
 * "role-img-alt"). The button already carries a descriptive title from
 * FullCalendar's buttonHints ("Previous month", "Next week" ...), so hide the
 * decorative icon from assistive technology and give the button that title as
 * its aria-label. Called after every render of the dates (datesSet), when the
 * hints can change with the view.
 */
export function labelToolbarIcons(root: HTMLElement | null) {
  if (!root) return;
  root.querySelectorAll<HTMLButtonElement>('.fc-toolbar button.fc-button').forEach((button) => {
    const icon = button.querySelector<HTMLElement>('.fc-icon');
    if (!icon) return;
    icon.setAttribute('aria-hidden', 'true');
    icon.removeAttribute('role');
    const hint = button.getAttribute('title');
    if (hint) button.setAttribute('aria-label', hint);
  });
}

/**
 * datesSet can fire before FullCalendar has committed its toolbar, so the
 * first render kept the bare role="img" icons until the user navigated. Label
 * once after mount (next frame) and again whenever the toolbar's buttons are
 * re-rendered or their title/role change. Our own edits only remove `role`
 * once and set unobserved attributes, so the observer settles immediately.
 * Returns a cleanup function.
 */
export function observeToolbarIcons(root: HTMLElement | null): () => void {
  if (!root) return () => {};
  labelToolbarIcons(root);
  const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => labelToolbarIcons(root)) : null;
  const observer = typeof MutationObserver === 'function' ? new MutationObserver(() => labelToolbarIcons(root)) : null;
  observer?.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['title', 'role'] });
  return () => {
    if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    observer?.disconnect();
  };
}
