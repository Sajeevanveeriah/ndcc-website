/**
 * RFC 4122 UUID, versions 1-5, with the RFC variant nibble (8, 9, a or b);
 * case-insensitive. This is the exact pattern previously duplicated in the
 * API routes. It is deliberately stricter than `isUuid` in
 * lib/gallery/shared.ts (which accepts any version/variant), so the two are
 * not interchangeable.
 */
const UUID_V1_TO_V5_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Same result as `UUID_V1_TO_V5_PATTERN.test(value)` (the pattern has no g/y flag, so it is stateless). */
export function isUuidV1ToV5(value: string): boolean {
  return UUID_V1_TO_V5_PATTERN.test(value);
}
