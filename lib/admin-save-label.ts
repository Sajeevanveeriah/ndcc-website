// Save-button wording for CMS editors, so the button always says what saving
// will do with the chosen publication state. No imports, so tests can load it
// directly with --experimental-strip-types.

export type PublicationState = 'draft' | 'published' | 'scheduled';

/**
 * The publication state of a record: draft when unpublished, scheduled when
 * published with a future published_at, otherwise published (live).
 */
export function publicationState(published: boolean | null | undefined, publishedAt?: string | null, now: number = Date.now()): PublicationState {
  if (published !== true) return 'draft';
  if (publishedAt) {
    const at = Date.parse(publishedAt);
    if (Number.isFinite(at) && at > now) return 'scheduled';
  }
  return 'published';
}

/**
 * Primary save-button label for an editor.
 * - state: the publication state currently chosen in the form.
 * - wasLive: true when editing a record that is already publicly visible.
 */
export function saveButtonLabel(state: PublicationState, wasLive = false): string {
  if (state === 'draft') return wasLive ? 'Unpublish and save draft' : 'Save draft';
  if (state === 'scheduled') return 'Schedule';
  return wasLive ? 'Save changes' : 'Publish now';
}
