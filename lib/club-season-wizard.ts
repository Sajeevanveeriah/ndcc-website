import { slugifySeasonName } from './club-seasons';

export const WIZARD_STEPS = [
  'Season details',
  'Choose previous season',
  'Copy choices',
  'Teams and grades',
  'PlayHQ mappings',
  'Appointments',
  'Training and registration',
  'Website notices and key events',
  'Fantasy setup',
  'Review and preview',
  'Activate now or schedule',
] as const;

export const COPY_SECTIONS = ['teams','playhqMappings','appointments','training','registration','notices','events','fantasy','sponsors','merchandise'] as const;

export type SeasonWizardPayload = {
  name?: string;
  slug?: string;
  startDate?: string;
  endDate?: string;
  sourceSeasonId?: string | null;
  copySections?: Partial<Record<(typeof COPY_SECTIONS)[number], boolean>>;
  registrationStatus?: string;
  registrationUrl?: string;
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
  if (payload.registrationUrl && !/^https?:\/\//i.test(payload.registrationUrl)) errors.push('Registration URL must start with http:// or https://.');
  return errors;
}

export function buildSeasonWizardPreview(payload: SeasonWizardPayload, now = new Date()) {
  const slug = slugifySeasonName(payload.slug || payload.name || '');
  const warnings: string[] = [];
  if (staleDate(payload.startDate, now)) warnings.push('Start date is in the past. Confirm this is intentional before activation.');
  if (staleDate(payload.endDate, now)) warnings.push('End date is in the past. Confirm this is not stale carry-forward content.');
  if (payload.registrationUrl && /2025|2026/.test(payload.registrationUrl) && !slug.includes('2025') && !slug.includes('2026')) warnings.push('Registration URL contains an older year. Review before publishing.');
  const selectedSections = Object.entries(payload.copySections || {}).filter(([, selected]) => selected).map(([key]) => key);
  return {
    slug,
    warnings,
    selectedSections,
    activationMode: payload.activateNow ? 'activate_now' : payload.scheduledActivationAt ? 'scheduled' : 'draft',
    summary: `${payload.name || 'New season'} · ${payload.startDate || 'no start'} to ${payload.endDate || 'no end'} · ${selectedSections.length} copied section(s)`,
  };
}
