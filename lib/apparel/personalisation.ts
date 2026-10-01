export const NUMBER_REQUEST_STATUS = 'subject_to_availability' as const;
const INITIALS_PATTERN = new RegExp('^[\\p{L}]{1,3}$', 'u');

export type PersonalisationKind = 'surname_number' | 'initials';

// Products personalised with initials (the poster artwork shows "XX") rather
// than the playing-kit surname and number. Keyed by catalogue slug.
const INITIALS_PERSONALISATION_SLUGS = new Set(['personalised-backpack']);

export function personalisationKind(slug: string | null | undefined): PersonalisationKind {
  return slug && INITIALS_PERSONALISATION_SLUGS.has(slug) ? 'initials' : 'surname_number';
}
const SURNAME_PATTERN = new RegExp("^[\\p{L}\\p{M}]+(?:[ '\\-\\u2019][\\p{L}\\p{M}]+)*$", 'u');

export type PersonalisationInput = {
  custom_name?: unknown;
  custom_number?: unknown;
  alternate_number?: unknown;
  personalisation_confirmed?: unknown;
  custom_initials?: unknown;
};

export type ValidatedPersonalisation = {
  custom_initials?: string;
  custom_name?: string;
  custom_number?: number;
  alternate_number?: number;
  number_request_status?: typeof NUMBER_REQUEST_STATUS;
  personalisation_confirmed?: true;
};

export type PersonalisationResult =
  | { ok: true; value: ValidatedPersonalisation }
  | { ok: false; error: string };

function parsePreference(value: unknown, label: string): number | undefined | string {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && !/^\d{1,2}$/.test(value.trim())) {
    return `${label} must be a whole number from 1 to 99.`;
  }
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(number) || number < 1 || number > 99) {
    return `${label} must be a whole number from 1 to 99.`;
  }
  return number;
}

function validateInitials(input: PersonalisationInput): PersonalisationResult {
  const hasOther = (typeof input.custom_name === 'string' && input.custom_name.trim() !== '')
    || (input.custom_number !== undefined && input.custom_number !== null && input.custom_number !== '')
    || (input.alternate_number !== undefined && input.alternate_number !== null && input.alternate_number !== '');
  if (hasOther) return { ok: false, error: 'This item is personalised with initials only.' };
  const raw = typeof input.custom_initials === 'string' ? input.custom_initials : '';
  const initials = raw.normalize('NFC').replace(/[\s.]+/g, '').toLocaleUpperCase('en-AU');
  if (!initials) return { ok: true, value: {} };
  if (!INITIALS_PATTERN.test(initials)) {
    return { ok: false, error: 'Enter 1 to 3 letters for your initials.' };
  }
  if (input.personalisation_confirmed !== true) {
    return { ok: false, error: 'Confirm that initials are subject to club confirmation.' };
  }
  return { ok: true, value: { custom_initials: initials, personalisation_confirmed: true } };
}

export function validatePersonalisation(input: PersonalisationInput, kind: PersonalisationKind = 'surname_number'): PersonalisationResult {
  if (kind === 'initials') return validateInitials(input);
  if (typeof input.custom_initials === 'string' && input.custom_initials.trim() !== '') {
    return { ok: false, error: 'Initials are not available for this item.' };
  }
  const rawSurname = typeof input.custom_name === 'string' ? input.custom_name : '';
  const surname = rawSurname.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('en-AU');

  if (surname.length > 40) {
    return { ok: false, error: 'Surname must be 40 characters or fewer.' };
  }
  if (surname && !SURNAME_PATTERN.test(surname)) {
    return { ok: false, error: 'Enter a surname using letters, spaces, apostrophes or hyphens only. Nicknames are not accepted.' };
  }

  const first = parsePreference(input.custom_number, 'First number preference');
  if (typeof first === 'string') return { ok: false, error: first };
  const second = parsePreference(input.alternate_number, 'Second number preference');
  if (typeof second === 'string') return { ok: false, error: second };

  if (second !== undefined && first === undefined) {
    return { ok: false, error: 'Choose a first number preference before adding a second preference.' };
  }
  if (first !== undefined && second !== undefined && first === second) {
    return { ok: false, error: 'First and second number preferences must be different.' };
  }

  const hasNumberRequest = first !== undefined;
  const hasPersonalisation = Boolean(surname) || hasNumberRequest || second !== undefined;
  if (!hasPersonalisation) return { ok: true, value: {} };
  if (input.personalisation_confirmed !== true) {
    return { ok: false, error: 'Confirm that surname and number requests are subject to club approval and availability.' };
  }

  return {
    ok: true,
    value: {
      ...(surname ? { custom_name: surname } : {}),
      ...(first !== undefined ? { custom_number: first } : {}),
      ...(second !== undefined ? { alternate_number: second } : {}),
      ...(hasNumberRequest ? { number_request_status: NUMBER_REQUEST_STATUS } : {}),
      personalisation_confirmed: true,
    },
  };
}
