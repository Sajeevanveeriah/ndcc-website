import { slugifySeasonName } from './club-seasons';

export const WIZARD_STEPS = [
  'Season details',
  'Review',
  'Activate',
] as const;

export type SeasonWizardPayload = {
  name?: string;
  slug?: string;
  startDate?: string;
  endDate?: string;
  sourceSeasonId?: string | null;
  playhqSeasonId?: string;
  scheduledActivationAt?: string | null;
  activateNow?: boolean;
};

function staleDate(value: unknown, now = new Date()) {
  if (typeof value !== 'string' || !value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed < now.getTime();
}

export function validateSeasonWizardPayload(payload: SeasonWizardPayload) {
  const errors: string[] = [];
  if (!payload.name?.trim()) errors.push('Season name is required.');
  if (!payload.startDate) errors.push('Start date is required.');
  if (!payload.endDate) errors.push('End date is required.');
  if (payload.startDate && payload.endDate && payload.endDate < payload.startDate) errors.push('End date must be after start date.');
  return errors;
}

export function buildSeasonWizardPreview(payload: SeasonWizardPayload, now = new Date()) {
  const slug = slugifySeasonName(payload.slug || payload.name || '');
  const warnings: string[] = [];
  if (staleDate(payload.startDate, now)) warnings.push('Start date is in the past. Confirm this is intentional before activation.');
  if (staleDate(payload.endDate, now)) warnings.push('End date is in the past. Confirm this is not stale carry-forward content.');
  return {
    slug,
    warnings,
    activationMode: payload.activateNow ? 'activate_now' : payload.scheduledActivationAt ? 'scheduled' : 'draft',
    registrationSafety: 'closed_hidden_links_cleared',
    summary: `${payload.name || 'New season'} · ${payload.startDate || 'no start'} to ${payload.endDate || 'no end'}`,
  };
}
