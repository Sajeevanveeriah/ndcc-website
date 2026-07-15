'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';

type Detail = { label: string; value: string | number | null | undefined };

type DeleteRecordButtonProps = {
  resource: string;
  recordId: string;
  recordLabel: string;
  recordDetails?: Detail[];
  dangerLevel?: 'normal' | 'strong';
  requireTypedConfirmation?: boolean;
  strongWarning?: string;
  onDeleted: (deletedId: string) => void;
  onSuccessMessage?: (message: string) => void;
  className?: string;
};

type SessionResponse = {
  authenticated?: boolean;
  user?: { role?: string };
};

type DeleteResponse = {
  data?: { id?: string };
  deletedId?: string;
};

function safeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Delete failed. Please try again.';
  const message = error.message.trim();
  if (!message) return 'Delete failed. Please try again.';
  if (/violates foreign key|postgres|supabase|23503|constraint|schema cache/i.test(message)) {
    return 'This record cannot be deleted because related records still depend on it.';
  }
  return message;
}

export default function DeleteRecordButton({
  resource,
  recordId,
  recordLabel,
  recordDetails = [],
  dangerLevel = 'normal',
  requireTypedConfirmation = false,
  strongWarning,
  onDeleted,
  onSuccessMessage,
  className,
}: DeleteRecordButtonProps) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState('');
  const deleteStartedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/auth/session', { cache: 'no-store', credentials: 'include' })
      .then((response) => parseApiResponse<SessionResponse>(response))
      .then((data) => {
        if (!cancelled) setIsAdmin(data.authenticated === true && data.user?.role === 'admin');
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      })
      .finally(() => {
        if (!cancelled) setSessionChecked(true);
      });
    return () => { cancelled = true; };
  }, []);

  const canConfirm = useMemo(() => {
    if (deleting) return false;
    if (!requireTypedConfirmation) return true;
    return typedConfirmation === 'DELETE';
  }, [deleting, requireTypedConfirmation, typedConfirmation]);

  if (!sessionChecked || !isAdmin) return null;

  const closeModal = () => {
    if (deleting) return;
    setIsOpen(false);
    setTypedConfirmation('');
    setStatus('');
    deleteStartedRef.current = false;
  };

  const handleDelete = async () => {
    if (!canConfirm || deleteStartedRef.current) return;
    deleteStartedRef.current = true;
    setDeleting(true);
    setStatus('Deleting record...');

    try {
      const response = await adminFetch(`/api/admin/resources/${resource}?id=${encodeURIComponent(recordId)}`, {
        method: 'DELETE',
      });
      const result = await parseApiResponse<DeleteResponse>(response);
      const deletedId = result.data?.id || result.deletedId || recordId;
      onDeleted(deletedId);
      onSuccessMessage?.(`${recordLabel} deleted.`);
      setIsOpen(false);
      setTypedConfirmation('');
      setStatus('');
    } catch (error) {
      setStatus(safeErrorMessage(error));
      deleteStartedRef.current = false;
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Button variant="danger" size="sm" className={className} onClick={() => setIsOpen(true)}>
        <Trash2 className="h-4 w-4 mr-1" />
        Delete
      </Button>
      <Modal isOpen={isOpen} onClose={closeModal} title={`Delete ${recordLabel}`} size="sm">
        <div className="space-y-4" aria-busy={deleting}>
          <p className="text-sm text-content-secondary">
            This will permanently delete <strong>{recordLabel}</strong>. This action cannot be undone.
          </p>
          {recordDetails.length > 0 && (
            <dl className="rounded-lg border border-edge-subtle bg-surface-page p-3 text-sm">
              {recordDetails.map((detail) => (
                <div key={detail.label} className="grid grid-cols-[7rem_1fr] gap-2 py-1">
                  <dt className="font-semibold text-content-muted">{detail.label}</dt>
                  <dd className="text-content-primary break-words">{detail.value ?? '-'}</dd>
                </div>
              ))}
            </dl>
          )}
          {(dangerLevel === 'strong' || strongWarning) && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {strongWarning || 'Deleting this record may remove important operational history.'}
            </p>
          )}
          {requireTypedConfirmation && (
            <Input
              id={`delete-confirm-${recordId}`}
              label="Type DELETE to confirm"
              value={typedConfirmation}
              onChange={(event) => setTypedConfirmation(event.target.value)}
              disabled={deleting}
            />
          )}
          {status && (
            <p className={status.startsWith('Deleting') ? 'text-sm text-content-muted' : 'text-sm text-red-600'} role="status" aria-live="polite">
              {status}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" size="sm" onClick={closeModal} disabled={deleting}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleDelete} isLoading={deleting} disabled={!canConfirm}>
              Permanently delete
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
