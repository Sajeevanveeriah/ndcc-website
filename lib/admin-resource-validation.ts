// Server-side payload validation for CMS resources saved through
// /api/admin/resources/[resource]. Pure (no imports) so tests can load it.
// Each validator runs after sanitising, sees only the writable fields that
// were supplied, and returns a friendly message or null. Checks apply on
// create, and on update only to the fields being changed.

type Payload = Record<string, unknown>;
type Validator = (payload: Payload, isCreate: boolean) => string | null;

type TextRule = { field: string; label: string; required?: boolean; max: number };
type NumberRule = { field: string; label: string; required?: boolean; nullable?: boolean; integer?: boolean; min?: number; max?: number };

const EMAIL_PATTERN = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

function supplied(payload: Payload, field: string) {
  return Object.prototype.hasOwnProperty.call(payload, field);
}

function checkText(payload: Payload, isCreate: boolean, rule: TextRule): string | null {
  if (!supplied(payload, rule.field)) return isCreate && rule.required ? `${rule.label} is required.` : null;
  const value = payload[rule.field];
  if (value === null || value === undefined || value === '') {
    return rule.required ? `${rule.label} is required.` : null;
  }
  if (typeof value !== 'string') return `${rule.label} must be text.`;
  if (rule.required && !value.trim()) return `${rule.label} is required.`;
  if (value.length > rule.max) return `${rule.label} must be ${rule.max.toLocaleString('en-AU')} characters or fewer.`;
  return null;
}

function checkNumber(payload: Payload, isCreate: boolean, rule: NumberRule): string | null {
  if (!supplied(payload, rule.field)) return isCreate && rule.required ? `${rule.label} is required.` : null;
  const value = payload[rule.field];
  if (value === null || value === undefined || value === '') {
    return rule.nullable ? null : `${rule.label} is required.`;
  }
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) return `${rule.label} must be a number.`;
  if (rule.integer && !Number.isInteger(number)) return `${rule.label} must be a whole number.`;
  if (rule.min !== undefined && number < rule.min) return `${rule.label} cannot be less than ${rule.min}.`;
  if (rule.max !== undefined && number > rule.max) return `${rule.label} cannot be more than ${rule.max.toLocaleString('en-AU')}.`;
  return null;
}

function checkDate(payload: Payload, isCreate: boolean, field: string, label: string, required = false): string | null {
  if (!supplied(payload, field)) return isCreate && required ? `${label} is required.` : null;
  const value = payload[field];
  if (value === null || value === undefined || value === '') return required ? `${label} is required.` : null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return `${label} must be a valid date and time.`;
  return null;
}

function checkBoolean(payload: Payload, field: string, label: string): string | null {
  if (!supplied(payload, field) || payload[field] === null) return null;
  return typeof payload[field] === 'boolean' ? null : `${label} must be on or off.`;
}

function checkEmail(payload: Payload, field: string, label: string): string | null {
  if (!supplied(payload, field)) return null;
  const value = payload[field];
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 254 || !EMAIL_PATTERN.test(value.trim())) return `${label} must be a valid email address.`;
  return null;
}

function combine(...checks: Validator[]): Validator {
  return (payload, isCreate) => {
    for (const check of checks) {
      const error = check(payload, isCreate);
      if (error) return error;
    }
    return null;
  };
}

const text = (rule: TextRule): Validator => (payload, isCreate) => checkText(payload, isCreate, rule);
const number = (rule: NumberRule): Validator => (payload, isCreate) => checkNumber(payload, isCreate, rule);
const date = (field: string, label: string, required = false): Validator => (payload, isCreate) => checkDate(payload, isCreate, field, label, required);
const bool = (field: string, label: string): Validator => (payload) => checkBoolean(payload, field, label);
const email = (field: string, label: string): Validator => (payload) => checkEmail(payload, field, label);
const sortOrder = (field = 'sort_order'): Validator => number({ field, label: 'Sort order', nullable: false, integer: true, min: -100000, max: 100000 });

export const validateNewsPayload = combine(
  text({ field: 'title', label: 'Title', required: true, max: 200 }),
  text({ field: 'content', label: 'Content', max: 100000 }),
  text({ field: 'author', label: 'Author', max: 120 }),
  date('published_at', 'Publish date'),
  bool('published', 'Published'),
  sortOrder(),
);

export const validateEventPayload = combine(
  text({ field: 'title', label: 'Title', required: true, max: 200 }),
  text({ field: 'description', label: 'Description', max: 20000 }),
  date('date', 'Event date', true),
  text({ field: 'location', label: 'Location', max: 200 }),
  number({ field: 'capacity', label: 'Capacity', nullable: true, integer: true, min: 0, max: 100000 }),
  number({ field: 'ticket_price', label: 'Ticket price', nullable: true, min: 0, max: 100000 }),
  bool('published', 'Published'),
);

export const validateTeamPayload = combine(
  text({ field: 'name', label: 'Team name', required: true, max: 120 }),
  text({ field: 'grade', label: 'Grade', max: 120 }),
  text({ field: 'description', label: 'Description', max: 5000 }),
  text({ field: 'captain', label: 'Captain', max: 120 }),
  sortOrder(),
  bool('is_active', 'Active'),
);

export const validateSponsorPayload = combine(
  text({ field: 'name', label: 'Sponsor name', required: true, max: 160 }),
  text({ field: 'tier', label: 'Tier', max: 60 }),
  text({ field: 'placement_type', label: 'Placement', max: 60 }),
  text({ field: 'description', label: 'Description', max: 5000 }),
  sortOrder(),
  bool('active', 'Active'),
);

export const validateApparelProductPayload = combine(
  text({ field: 'name', label: 'Product name', required: true, max: 160 }),
  text({ field: 'slug', label: 'Slug', required: true, max: 120 }),
  text({ field: 'description', label: 'Description', max: 10000 }),
  number({ field: 'price', label: 'Price', required: true, min: 0, max: 100000 }),
  text({ field: 'image_alt', label: 'Image description', max: 300 }),
  text({ field: 'category', label: 'Category', max: 80 }),
  number({ field: 'display_order', label: 'Display order', nullable: true, integer: true, min: -100000, max: 100000 }),
  email('order_email', 'Order email'),
  bool('active', 'Active'),
);

export const validateKitchenMenuPayload = combine(
  text({ field: 'name', label: 'Menu name', required: true, max: 120 }),
  bool('is_active', 'Active'),
);

export const validateKitchenItemPayload = combine(
  text({ field: 'menu_id', label: 'Menu', required: true, max: 64 }),
  text({ field: 'name', label: 'Item name', required: true, max: 120 }),
  text({ field: 'description', label: 'Description', max: 2000 }),
  number({ field: 'price', label: 'Price', required: true, min: 0, max: 10000 }),
  sortOrder(),
  bool('is_available', 'Available'),
  bool('is_hidden', 'Hidden'),
);

export const RESOURCE_VALIDATORS: Readonly<Record<string, Validator>> = {
  news: validateNewsPayload,
  events: validateEventPayload,
  teams: validateTeamPayload,
  sponsors: validateSponsorPayload,
  apparelProducts: validateApparelProductPayload,
  kitchenMenus: validateKitchenMenuPayload,
  kitchenItems: validateKitchenItemPayload,
};

/**
 * Map a database error to a message safe to show an administrator. The raw
 * error is logged server-side by the caller.
 */
export function friendlyDatabaseError(error: { code?: string | null; message?: string | null } | null | undefined): { status: number; error: string } {
  const code = error?.code || '';
  const message = error?.message || '';
  if (code === '23505' || /duplicate key/i.test(message)) return { status: 409, error: 'A record with these details already exists. Change the name or slug and try again.' };
  if (code === '23503' || /foreign key/i.test(message)) return { status: 409, error: 'This change refers to a record that no longer exists, or other records still depend on it. Refresh the page and try again.' };
  if (code === '23502' || /null value in column/i.test(message)) return { status: 400, error: 'A required field is missing. Fill in all required fields and try again.' };
  if (code === '23514' || /check constraint/i.test(message)) return { status: 400, error: 'One of the values is not allowed. Check the form and try again.' };
  if (code === '22P02' || code === '22007' || code === '22008' || /invalid input syntax/i.test(message)) return { status: 400, error: 'One of the values is in the wrong format. Check numbers and dates and try again.' };
  if (code === '22001' || /value too long/i.test(message)) return { status: 400, error: 'One of the values is too long. Shorten it and try again.' };
  return { status: 500, error: 'The change could not be saved. Please try again. If it keeps happening, contact the website administrator.' };
}
