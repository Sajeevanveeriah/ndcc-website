/**
 * Song-request events (for example iPod Shuffle): entry is by buying songs.
 * Each song is charged at the event's ticket_price. The database function
 * ndcc_register_event_song_entry repeats these limits.
 */
export const EVENT_SONG_LIMITS = Object.freeze({
  // Worst case (multi-byte text) stays well inside the 32 KB order body limit.
  maxSongs: 30,
  titleLength: 100,
  artistLength: 80,
});

export type SongRequest = { title: string; artist: string };

export type EventRegistrationMode = 'tickets' | 'song_requests';

export function isSongRequestEvent(event: { registration_mode?: string | null } | null | undefined): boolean {
  return event?.registration_mode === 'song_requests';
}

const collapse = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

export function normaliseSongRequests(input: unknown):
  | { ok: true; value: SongRequest[] }
  | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: 'Add at least one song to enter.' };
  }
  if (input.length > EVENT_SONG_LIMITS.maxSongs) {
    return { ok: false, error: `Add up to ${EVENT_SONG_LIMITS.maxSongs} songs per order. Place another order for more.` };
  }
  const songs: SongRequest[] = [];
  for (const [index, item] of input.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: `Song ${index + 1} is invalid.` };
    }
    const { title, artist } = item as Record<string, unknown>;
    if (typeof title !== 'string' || (artist !== undefined && artist !== null && typeof artist !== 'string')) {
      return { ok: false, error: `Song ${index + 1} is invalid.` };
    }
    const cleanTitle = collapse(title);
    const cleanArtist = typeof artist === 'string' ? collapse(artist) : '';
    if (!cleanTitle) return { ok: false, error: `Enter a title for song ${index + 1}.` };
    if (cleanTitle.length > EVENT_SONG_LIMITS.titleLength) {
      return { ok: false, error: `Song ${index + 1} title must be ${EVENT_SONG_LIMITS.titleLength} characters or fewer.` };
    }
    if (cleanArtist.length > EVENT_SONG_LIMITS.artistLength) {
      return { ok: false, error: `Song ${index + 1} artist must be ${EVENT_SONG_LIMITS.artistLength} characters or fewer.` };
    }
    songs.push({ title: cleanTitle, artist: cleanArtist });
  }
  return { ok: true, value: songs };
}

export function songLabel(song: SongRequest): string {
  return song.artist ? `${song.title} - ${song.artist}` : song.title;
}
