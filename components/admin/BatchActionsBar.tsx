'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';

export type BatchAction = {
  key: string;
  label: string;
  onAction: () => void | Promise<void>;
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger';
  /** Destructive actions set this to require an inline confirm step before running. */
  confirm?: boolean;
  confirmLabel?: string;
};

type BatchActionsBarProps = {
  selectedCount: number;
  itemLabel?: string;
  actions: BatchAction[];
  onClearSelection: () => void;
  busy?: boolean;
};

export default function BatchActionsBar({
  selectedCount,
  itemLabel = 'item',
  actions,
  onClearSelection,
  busy = false,
}: BatchActionsBarProps) {
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);

  useEffect(() => {
    setConfirmingKey(null);
  }, [selectedCount]);

  if (selectedCount === 0) return null;

  const confirmingAction = actions.find((action) => action.key === confirmingKey) || null;

  return (
    <div className="mb-4 bg-surface-card border border-edge-subtle rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="text-sm font-body font-semibold text-content-secondary">
        {selectedCount} {itemLabel}{selectedCount !== 1 ? 's' : ''} selected
      </span>
      {confirmingAction ? (
        <>
          <span className="text-sm font-body text-red-600">
            {confirmingAction.confirmLabel || 'Are you sure? This action cannot be undone.'}
          </span>
          <Button
            size="sm"
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setConfirmingKey(null);
              await confirmingAction.onAction();
            }}
          >
            Confirm
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmingKey(null)}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          {actions.map((action) => (
            <Button
              key={action.key}
              size="sm"
              variant={action.variant || 'secondary'}
              disabled={busy}
              onClick={async () => {
                if (action.confirm) {
                  setConfirmingKey(action.key);
                  return;
                }
                await action.onAction();
              }}
            >
              {action.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" disabled={busy} onClick={onClearSelection}>
            Clear selection
          </Button>
        </>
      )}
    </div>
  );
}
