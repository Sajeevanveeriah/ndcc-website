'use client';

import Button from '@/components/ui/Button';

/** Offers to restore an unsaved local draft found by useDraftAutosave. */
export default function DraftRestorePrompt({ savedAt, onRestore, onDiscard }: {
  savedAt: string;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const when = new Date(savedAt).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' });
  return (
    <div role="status" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <p className="font-semibold">Unsaved draft found</p>
      <p className="mt-1">Changes from {when} were not saved. Restore them into this form, or discard them.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="primary" onClick={onRestore}>Restore draft</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onDiscard}>Discard draft</Button>
      </div>
    </div>
  );
}
