'use client';

import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { BANK_TRANSFER_PRODUCT_SETTINGS, type PaymentSettings } from './shared';

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
          {BANK_TRANSFER_PRODUCT_SETTINGS.some(({ key }) => key in settings) && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-content-primary">Bank transfer by product</legend>
              <p className="text-sm text-content-muted">&quot;Same as bank transfer setting&quot; follows the Bank transfer enabled checkbox above.</p>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {BANK_TRANSFER_PRODUCT_SETTINGS.filter(({ key }) => key in settings).map(({ key, label }) => {
                  const value = settings[key];
                  return (
                    <label key={key} className="flex flex-col text-sm">
                      {label}
                      <select
                        className="form-input mt-1"
                        value={value === true ? 'on' : value === false ? 'off' : 'inherit'}
                        onChange={(e) => setSettings({ ...settings, [key]: e.target.value === 'on' ? true : e.target.value === 'off' ? false : null })}
                      >
                        <option value="inherit">Same as bank transfer setting</option>
                        <option value="on">Enabled</option>
                        <option value="off">Disabled</option>
                      </select>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
        </section>
  );
}
