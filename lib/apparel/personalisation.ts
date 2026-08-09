export const NUMBER_REQUEST_STATUS = 'subject_to_availability' as const;
const SURNAME_PATTERN = new RegExp("^[\\p{L}\\p{M}]+(?:[ '\\-\\u2019][\\p{L}\\p{M}]+)*$", 'u');

export type PersonalisationInput = {
  custom_name?: unknown;
  custom_number?: unknown;
  alternate_number?: unknown;
  personalisation_confirmed?: unknown;
};

export type ValidatedPersonalisation = {
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

export function validatePersonalisation(input: PersonalisationInput): PersonalisationResult {
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
