// Field-level comparison between an archived revision snapshot and the
// current saved record. Pure and dependency-free so it can be unit tested.

export type FieldChange = {
  field: string;
  kind: 'changed' | 'added' | 'removed';
  /** Value in the older revision. */
  before: unknown;
  /** Current saved value. */
  after: unknown;
};

/** Bookkeeping columns that change on every save and would only add noise. */
export const DIFF_IGNORED_FIELDS: readonly string[] = ['id', 'revision', 'created_at', 'updated_at'];

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>).sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(',')}}`;
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  // Treat null, undefined and '' as the same "empty" value: forms often send
  // '' where the database stores null, and that is not a meaningful change.
  const emptyA = a === null || a === undefined || a === '';
  const emptyB = b === null || b === undefined || b === '';
  if (emptyA || emptyB) return emptyA && emptyB;
  return stableStringify(a) === stableStringify(b);
}

export function diffSnapshots(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  ignored: readonly string[] = DIFF_IGNORED_FIELDS,
): FieldChange[] {
  const older = before && typeof before === 'object' ? before : {};
  const newer = after && typeof after === 'object' ? after : {};
  const skip = new Set(ignored);
  const fields = Array.from(new Set([...Object.keys(older), ...Object.keys(newer)]))
    .filter((field) => !skip.has(field))
    .sort();
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const inOlder = Object.prototype.hasOwnProperty.call(older, field);
    const inNewer = Object.prototype.hasOwnProperty.call(newer, field);
    const a = older[field];
    const b = newer[field];
    if (inOlder && inNewer) {
      if (!valuesEqual(a, b)) changes.push({ field, kind: 'changed', before: a, after: b });
    } else if (inNewer) {
      if (!valuesEqual(undefined, b)) changes.push({ field, kind: 'added', before: undefined, after: b });
    } else if (!valuesEqual(a, undefined)) {
      changes.push({ field, kind: 'removed', before: a, after: undefined });
    }
  }
  return changes;
}

/** Human-readable field name: `published_at` -> `Published at`. */
export function fieldLabel(field: string): string {
  const spaced = field.replace(/_/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : field;
}

/** Short display text for a value, truncated for long bodies. */
export function formatDiffValue(value: unknown, max = 400): string {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const text = typeof value === 'string' ? value : stableStringify(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
