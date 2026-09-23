'use client';

import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import type { PaymentSettings } from './shared';

export default function PaymentSettingsPanel({
  settings,
  setSettings,
  savingSettings,
  onSave,
}: {
  settings: PaymentSettings;
  setSettings: (next: PaymentSettings) => void;
  savingSettings: boolean;
  onSave: (next: PaymentSettings) => void;
}) {
  return (
        <section className="mb-6 bg-surface-card rounded-xl border border-edge-subtle p-4 space-y-3">
          <h2 className="font-display font-bold text-content-primary">Payment configuration</h2>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.bank_transfer_enabled}
                onChange={(e) => setSettings({ ...settings, bank_transfer_enabled: e.target.checked })}
              />
              Bank transfer enabled
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.card_checkout_enabled}
                onChange={(e) => setSettings({ ...settings, card_checkout_enabled: e.target.checked })}
              />
              Stripe Checkout enabled (also requires server configuration)
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.partial_payments_enabled}
                onChange={(e) => setSettings({ ...settings, partial_payments_enabled: e.target.checked })}
              />
              Partial payments allowed
            </label>
            <div className="w-40">
              <Input
                id="min-partial"
                label="Minimum part payment ($)"
                type="number"
                value={String(settings.minimum_partial_amount ?? 10)}
                onChange={(e) => setSettings({ ...settings, minimum_partial_amount: Number(e.target.value) })}
              />
            </div>
            <Button size="sm" isLoading={savingSettings} onClick={() => onSave(settings)}>
              Save settings
            </Button>
          </div>
        </section>
  );
}
