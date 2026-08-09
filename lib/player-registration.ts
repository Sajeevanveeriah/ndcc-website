export const REGISTRATION_STATUSES = ['closed', 'opening_soon', 'open', 'waitlist', 'archived'] as const;

export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export type RegistrationOption = {
  audienceKey: string;
  label: string;
  url: string;
  sortOrder: number;
  active: boolean;
};

export type RegistrationTermsSection = {
  heading: string;
  body: string;
};

export type RegistrationEditorSettings = {
  pageTitle: string;
  navigationLabel: string;
  introText: string;
  status: RegistrationStatus;
  opensAt: string | null;
  closesAt: string | null;
  showInNavigation: boolean;
  options: RegistrationOption[];
  termsTitle: string;
  termsSections: RegistrationTermsSection[];
};

export type RegistrationAvailability = 'closed' | 'opening_soon' | 'open' | 'waitlist';

export type PublicPlayerRegistration = {
  pageTitle: string;
  navigationLabel: string;
  introText: string;
  status: RegistrationStatus;
  opensAt: string | null;
  closesAt: string | null;
  showInNavigation: boolean;
  options: Array<{ label: string; url: string }>;
  termsTitle: string;
  termsSections: RegistrationTermsSection[];
  availability: RegistrationAvailability;
};

export type RegistrationValidationResult =
  | { success: true; data: RegistrationEditorSettings }
  | { success: false; errors: string[] };

export type StoredRegistrationRow = {
  page_title?: unknown;
  navigation_label?: unknown;
  intro_text?: unknown;
  status?: unknown;
  opens_at?: unknown;
  closes_at?: unknown;
  show_in_navigation?: unknown;
  registration_options?: unknown;
  terms_title?: unknown;
  terms_sections?: unknown;
};

const MAX_OPTIONS = 12;
const MAX_LABEL_LENGTH = 120;
const MAX_INTRO_LENGTH = 1_000;
const MAX_TERMS_BODY_LENGTH = 8_000;
const PLAYHQ_PATH_PREFIX = '/cricket-australia/register/';
const AUDIENCE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalDate(value: unknown, label: string, errors: string[]) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  const parsed = Date.parse(cleaned);
  if (!Number.isFinite(parsed)) {
    errors.push(`${label} must be a valid date and time.`);
    return null;
  }
  return new Date(parsed).toISOString();
}

export function validatePlayHQRegistrationUrl(value: unknown): string | null {
  const cleaned = cleanString(value);
  if (!cleaned || cleaned.length > 500) return null;

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.hostname !== 'www.playhq.com') return null;
    if (parsed.port || parsed.username || parsed.password) return null;
    if (!parsed.pathname.startsWith(PLAYHQ_PATH_PREFIX) || parsed.pathname === PLAYHQ_PATH_PREFIX) return null;
    return cleaned;
  } catch {
    return null;
  }
}

export function getRegistrationAvailability(
  status: RegistrationStatus,
  opensAt: string | null,
  closesAt: string | null,
  now = new Date(),
): RegistrationAvailability {
  if (status === 'closed' || status === 'archived') return 'closed';
  const timestamp = now.getTime();
  if (closesAt && Date.parse(closesAt) <= timestamp) return 'closed';
  if (status === 'opening_soon' || (opensAt && Date.parse(opensAt) > timestamp)) return 'opening_soon';
  return status === 'waitlist' ? 'waitlist' : 'open';
}

export function isRegistrationNavigationVisible(registration: PublicPlayerRegistration | null) {
  return Boolean(
    registration
    && registration.showInNavigation
    && registration.availability !== 'closed'
    && registration.options.length > 0,
  );
}

function storedOptions(value: unknown): RegistrationOption[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_OPTIONS).map((entry, index) => {
    const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    return {
      audienceKey: cleanString(item.audience_key ?? item.audienceKey),
      label: cleanString(item.label),
      url: cleanString(item.registration_url ?? item.url),
      sortOrder: Number.isInteger(item.sort_order ?? item.sortOrder) ? Number(item.sort_order ?? item.sortOrder) : index,
      active: item.is_active === true || item.active === true,
    };
  });
}

function storedTerms(value: unknown): RegistrationTermsSection[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).map((entry) => {
    const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    return { heading: cleanString(item.heading), body: cleanString(item.body) };
  });
}

export function deriveRegistrationTitle(seasonName: string) {
  const seasonLabel = cleanString(seasonName).replace(/\s+Season$/i, '');
  return seasonLabel ? `${seasonLabel} Player Registration` : 'Player Registration';
}

export function registrationEditorFromRow(row: StoredRegistrationRow, seasonName: string): RegistrationEditorSettings {
  const fallbackTitle = deriveRegistrationTitle(seasonName);
  const status = REGISTRATION_STATUSES.includes(row.status as RegistrationStatus)
    ? row.status as RegistrationStatus
    : 'closed';
  return {
    pageTitle: cleanString(row.page_title) || fallbackTitle,
    navigationLabel: cleanString(row.navigation_label) || fallbackTitle,
    introText: cleanString(row.intro_text),
    status,
    opensAt: cleanString(row.opens_at) || null,
    closesAt: cleanString(row.closes_at) || null,
    showInNavigation: row.show_in_navigation === true,
    options: storedOptions(row.registration_options),
    termsTitle: cleanString(row.terms_title) || 'Newcomb and District Cricket Club - Terms and Conditions',
    termsSections: storedTerms(row.terms_sections),
  };
}

export function createFutureSeasonRegistrationDraft(
  seasonName: string,
  source: RegistrationEditorSettings | null,
): RegistrationEditorSettings {
  const title = deriveRegistrationTitle(seasonName);
  return {
    pageTitle: title,
    navigationLabel: title,
    introText: source?.introText || '',
    status: 'closed',
    opensAt: null,
    closesAt: null,
    showInNavigation: false,
    options: (source?.options || []).map((option) => ({ ...option, url: '', active: false })),
    termsTitle: source?.termsTitle || 'Newcomb and District Cricket Club - Terms and Conditions',
    termsSections: source?.termsSections.map((section) => ({ ...section })) || Array.from({ length: 6 }, () => ({ heading: '', body: '' })),
  };
}

export function validateRegistrationSettings(value: unknown): RegistrationValidationResult {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const errors: string[] = [];
  const pageTitle = cleanString(input.pageTitle);
  const navigationLabel = cleanString(input.navigationLabel);
  const introText = cleanString(input.introText);
  const termsTitle = cleanString(input.termsTitle);

  if (!pageTitle || pageTitle.length > 160) errors.push('Page title is required and must be 160 characters or fewer.');
  if (!navigationLabel || navigationLabel.length > MAX_LABEL_LENGTH) errors.push(`Navigation label is required and must be ${MAX_LABEL_LENGTH} characters or fewer.`);
  if (!introText || introText.length > MAX_INTRO_LENGTH) errors.push(`Introductory text is required and must be ${MAX_INTRO_LENGTH} characters or fewer.`);
  if (!termsTitle || termsTitle.length > 200) errors.push('Terms title is required and must be 200 characters or fewer.');

  const status = REGISTRATION_STATUSES.includes(input.status as RegistrationStatus)
    ? input.status as RegistrationStatus
    : null;
  if (!status) errors.push('Registration status is invalid.');

  const opensAt = readOptionalDate(input.opensAt, 'Open date', errors);
  const closesAt = readOptionalDate(input.closesAt, 'Close date', errors);
  if (opensAt && closesAt && Date.parse(closesAt) < Date.parse(opensAt)) {
    errors.push('Close date must be after the open date.');
  }
  if (typeof input.showInNavigation !== 'boolean') errors.push('Navigation visibility must be true or false.');

  const rawOptions = Array.isArray(input.options) ? input.options : [];
  if (rawOptions.length < 1 || rawOptions.length > MAX_OPTIONS) errors.push(`Add between 1 and ${MAX_OPTIONS} registration options.`);
  const seenAudienceKeys = new Set<string>();
  const options = rawOptions.slice(0, MAX_OPTIONS).map((entry, index) => {
    const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const audienceKey = cleanString(item.audienceKey).toLowerCase();
    const label = cleanString(item.label);
    const url = cleanString(item.url);
    const sortOrder = Number(item.sortOrder);
    const active = item.active === true;

    if (!AUDIENCE_KEY_PATTERN.test(audienceKey)) errors.push(`Option ${index + 1} needs a stable lowercase audience key.`);
    if (seenAudienceKeys.has(audienceKey)) errors.push(`Audience key "${audienceKey}" must be unique within this season.`);
    seenAudienceKeys.add(audienceKey);
    if (!label || label.length > MAX_LABEL_LENGTH) errors.push(`Option ${index + 1} label is required and must be ${MAX_LABEL_LENGTH} characters or fewer.`);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999) errors.push(`Option ${index + 1} sort order must be a whole number from 0 to 999.`);
    if (url && !validatePlayHQRegistrationUrl(url)) errors.push(`Option ${index + 1} must use a valid HTTPS www.playhq.com cricket registration URL.`);
    if (active && !url) errors.push(`Option ${index + 1} needs a PlayHQ URL before it can be active.`);
    return { audienceKey, label, url, sortOrder: Number.isInteger(sortOrder) ? sortOrder : index, active };
  });

  const rawTerms = Array.isArray(input.termsSections) ? input.termsSections : [];
  if (rawTerms.length !== 6) errors.push('Exactly six Terms and Conditions sections are required.');
  const termsSections = rawTerms.slice(0, 6).map((entry, index) => {
    const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const heading = cleanString(item.heading);
    const body = cleanString(item.body);
    if (!heading || heading.length > 160) errors.push(`Terms section ${index + 1} heading is required and must be 160 characters or fewer.`);
    if (!body || body.length > MAX_TERMS_BODY_LENGTH) errors.push(`Terms section ${index + 1} body is required and must be ${MAX_TERMS_BODY_LENGTH} characters or fewer.`);
    return { heading, body };
  });

  const publishableOptions = options.filter((option) => option.active && Boolean(validatePlayHQRegistrationUrl(option.url)));
  if ((status === 'open' || status === 'waitlist' || input.showInNavigation === true) && publishableOptions.length === 0) {
    errors.push('Open, waitlist or navigation-visible registration requires at least one active valid PlayHQ option.');
  }

  if (errors.length || !status) return { success: false, errors };
  return {
    success: true,
    data: {
      pageTitle,
      navigationLabel,
      introText,
      status,
      opensAt,
      closesAt,
      showInNavigation: input.showInNavigation === true,
      options: options.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
      termsTitle,
      termsSections,
    },
  };
}

export function toRegistrationSettingsDatabase(settings: RegistrationEditorSettings) {
  return {
    // Retire the legacy single-link field whenever the canonical JSONB
    // options are saved so another reader cannot surface a stale URL.
    registration_url: null,
    page_title: settings.pageTitle,
    navigation_label: settings.navigationLabel,
    intro_text: settings.introText,
    status: settings.status,
    opens_at: settings.opensAt,
    closes_at: settings.closesAt,
    show_in_navigation: settings.showInNavigation,
    registration_options: settings.options.map((option) => ({
      audience_key: option.audienceKey,
      label: option.label,
      registration_url: option.url,
      sort_order: option.sortOrder,
      is_active: option.active,
    })),
    terms_title: settings.termsTitle,
    terms_sections: settings.termsSections,
  };
}

export function publicRegistrationFromRow(
  row: StoredRegistrationRow,
  seasonName: string,
  now = new Date(),
): PublicPlayerRegistration {
  const editor = registrationEditorFromRow(row, seasonName);
  const availability = getRegistrationAvailability(editor.status, editor.opensAt, editor.closesAt, now);
  const validatedOptions = editor.options
    .filter((option) => option.active && AUDIENCE_KEY_PATTERN.test(option.audienceKey) && Boolean(option.label))
    .map((option) => ({ ...option, url: validatePlayHQRegistrationUrl(option.url) || '' }))
    .filter((option) => Boolean(option.url))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map((option) => ({ label: option.label, url: option.url }));
  // The server client bypasses RLS, so publication controls belong in the DTO
  // mapper as well as the page. Closed, archived, expired and not-yet-open
  // settings must never disclose registration destinations to a direct caller.
  const options = availability === 'open' || availability === 'waitlist' ? validatedOptions : [];
  const termsSections = editor.termsSections.filter((section) => section.heading && section.body).slice(0, 6);
  return {
    pageTitle: editor.pageTitle,
    navigationLabel: editor.navigationLabel,
    introText: editor.introText,
    status: editor.status,
    opensAt: editor.opensAt,
    closesAt: editor.closesAt,
    showInNavigation: editor.showInNavigation && options.length > 0,
    options,
    termsTitle: editor.termsTitle,
    termsSections,
    availability,
  };
}
