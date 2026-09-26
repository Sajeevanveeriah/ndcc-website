/** Shown on admin sections a user may view but not change. */
export const READ_ONLY_MESSAGE = 'You can view this section. Ask a full-access committee member to make changes.';

export default function ReadOnlyNotice({ className = '' }: { className?: string }) {
  return (
    <p role="status" className={`rounded-lg border border-edge-subtle bg-surface-muted px-4 py-3 text-sm font-semibold text-content-primary ${className}`.trim()}>
      {READ_ONLY_MESSAGE}
    </p>
  );
}

/** Resources API responses include canWrite; older responses without it keep editing enabled. */
export function responseCanWrite(response: { canWrite?: unknown } | null | undefined): boolean {
  return response?.canWrite !== false;
}
