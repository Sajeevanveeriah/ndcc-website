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
