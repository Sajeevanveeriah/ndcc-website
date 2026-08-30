/**
 * Dependency-free validation for public membership and kitchen order bodies.
 *
 * The browser controls these payloads, so the API routes must bound every
 * collection and text field before issuing database queries or doing price
 * arithmetic. Prices are converted to integer AUD cents before multiplication
 * to avoid accepting non-finite values or accumulating floating-point drift.
 */

export const PUBLIC_ORDER_LIMITS = Object.freeze({
  bodyBytes: 32 * 1024,
  nameLength: 120,
  emailLength: 254,
  phoneLength: 32,
  notesLength: 2_000,
  identifierLength: 128,
  membershipAddonLines: 25,
  membershipAddonQuantity: 20,
  membershipAddonUnits: 50,
  kitchenItemLines: 40,
  kitchenItemQuantity: 50,
  kitchenItemUnits: 100,
  maximumOrderCents: 1_000_000, // AUD 10,000
});

type ValidationFailure = { ok: false; error: string };
type ValidationSuccess<T> = { ok: true; value: T };
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export type MembershipOrderInput = {
  fullName: string;
  email: string;
  phone: string;
  notes: string;
  membershipPlanId: string;
  addons: Array<{ addonId: string; quantity: number }>;
  hpField: string;
  submittedAt: number;
};

export type KitchenOrderInput = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: Array<{ itemId: string; quantity: number }>;
  hpField: string;
  submittedAt: number;
};

export type RaffleCheckoutInput = {
  name: string;
  email: string;
  phone: string;
  quantity: number;
};

export type ContactFormInput = {
  name: string;
  email: string;
  message: string;
  enquiryType: string;
  hpField: string;
  submittedAt: number;
};

export type VolunteerFormInput = {
  name: string;
  email: string;
  phone: string;
  role: string;
  availability: string;
  notes: string;
  hpField: string;
  submittedAt: number;
};

const CONTACT_MESSAGE_LENGTH = 5_000;
const VOLUNTEER_ROLE_LENGTH = 120;
const ALLOWED_ENQUIRY_TYPES = new Set([
  'general',
  'membership',
  'sponsorship',
  'facilities',
  'juniors',
  'other',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value: unknown, maxLength: number, label: string): ValidationResult<string> {
  if (typeof value !== 'string') return { ok: false, error: `${label} is required.` };
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: `${label} is required.` };
  if (trimmed.length > maxLength) return { ok: false, error: `${label} is too long.` };
  return { ok: true, value: trimmed };
}

function optionalText(value: unknown, maxLength: number, label: string): ValidationResult<string> {
  if (value === undefined || value === null || value === '') return { ok: true, value: '' };
  if (typeof value !== 'string') return { ok: false, error: `${label} is invalid.` };
  const trimmed = value.trim();
  if (trimmed.length > maxLength) return { ok: false, error: `${label} is too long.` };
  return { ok: true, value: trimmed };
}

function identifier(value: unknown, label: string): ValidationResult<string> {
  const parsed = requiredText(value, PUBLIC_ORDER_LIMITS.identifierLength, label);
  if (!parsed.ok) return parsed;
  if (!/^[A-Za-z0-9_-]+$/.test(parsed.value)) return { ok: false, error: `${label} is invalid.` };
  return parsed;
}

function positiveInteger(value: unknown, maximum: number, label: string): ValidationResult<number> {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
    return { ok: false, error: `${label} must be a whole number between 1 and ${maximum}.` };
  }
  return { ok: true, value };
}

function antiBotFields(body: Record<string, unknown>): ValidationResult<{ hpField: string; submittedAt: number }> {
  const hpField = optionalText(body.hp_field, 200, 'Honeypot field');
  if (!hpField.ok) return hpField;
  if (typeof body.submitted_at !== 'number' || !Number.isFinite(body.submitted_at) || body.submitted_at <= 0) {
    return { ok: false, error: 'Invalid form submission.' };
  }
  return { ok: true, value: { hpField: hpField.value, submittedAt: body.submitted_at } };
}

export function validateMembershipOrderInput(value: unknown): ValidationResult<MembershipOrderInput> {
  if (!isRecord(value)) return { ok: false, error: 'Invalid request body.' };

  const fullName = requiredText(value.full_name, PUBLIC_ORDER_LIMITS.nameLength, 'Name');
  if (!fullName.ok) return fullName;
  const email = requiredText(value.email, PUBLIC_ORDER_LIMITS.emailLength, 'Email');
  if (!email.ok) return email;
  const phone = optionalText(value.phone, PUBLIC_ORDER_LIMITS.phoneLength, 'Phone');
  if (!phone.ok) return phone;
  const notes = optionalText(value.notes, PUBLIC_ORDER_LIMITS.notesLength, 'Notes');
  if (!notes.ok) return notes;
  const membershipPlanId = identifier(value.membership_plan_id, 'Membership plan');
  if (!membershipPlanId.ok) return membershipPlanId;
  const antiBot = antiBotFields(value);
  if (!antiBot.ok) return antiBot;

  const rawAddons = value.addons === undefined || value.addons === null ? [] : value.addons;
  if (!Array.isArray(rawAddons)) return { ok: false, error: 'Add-ons must be a list.' };
  if (rawAddons.length > PUBLIC_ORDER_LIMITS.membershipAddonLines) {
    return { ok: false, error: 'Too many membership add-ons were selected.' };
  }

  const seen = new Set<string>();
  const addons: MembershipOrderInput['addons'] = [];
  let totalUnits = 0;
  for (const rawAddon of rawAddons) {
    if (!isRecord(rawAddon)) return { ok: false, error: 'One or more membership add-ons are invalid.' };
    const addonId = identifier(rawAddon.addon_id, 'Add-on');
    if (!addonId.ok) return addonId;
    if (seen.has(addonId.value)) return { ok: false, error: 'Duplicate membership add-ons are not allowed.' };
    seen.add(addonId.value);

    const quantity = positiveInteger(
      rawAddon.quantity,
      PUBLIC_ORDER_LIMITS.membershipAddonQuantity,
      'Add-on quantity'
    );
    if (!quantity.ok) return quantity;
    totalUnits += quantity.value;
    if (totalUnits > PUBLIC_ORDER_LIMITS.membershipAddonUnits) {
      return { ok: false, error: 'Too many membership add-on units were selected.' };
    }
    addons.push({ addonId: addonId.value, quantity: quantity.value });
  }

  return {
    ok: true,
    value: {
      fullName: fullName.value,
      email: email.value,
      phone: phone.value,
      notes: notes.value,
      membershipPlanId: membershipPlanId.value,
      addons,
      hpField: antiBot.value.hpField,
      submittedAt: antiBot.value.submittedAt,
    },
  };
}

export function validateKitchenOrderInput(value: unknown): ValidationResult<KitchenOrderInput> {
  if (!isRecord(value)) return { ok: false, error: 'Invalid request body.' };

  const customerName = requiredText(value.customer_name, PUBLIC_ORDER_LIMITS.nameLength, 'Name');
  if (!customerName.ok) return customerName;
  const customerEmail = requiredText(value.customer_email, PUBLIC_ORDER_LIMITS.emailLength, 'Email');
  if (!customerEmail.ok) return customerEmail;
  const customerPhone = requiredText(value.customer_phone, PUBLIC_ORDER_LIMITS.phoneLength, 'Phone');
  if (!customerPhone.ok) return customerPhone;
  const antiBot = antiBotFields(value);
  if (!antiBot.ok) return antiBot;

  if (!Array.isArray(value.items) || value.items.length === 0) {
    return { ok: false, error: 'At least one kitchen item is required.' };
  }
  if (value.items.length > PUBLIC_ORDER_LIMITS.kitchenItemLines) {
    return { ok: false, error: 'Too many kitchen item lines were submitted.' };
  }

  const seen = new Set<string>();
  const items: KitchenOrderInput['items'] = [];
  let totalUnits = 0;
  for (const rawItem of value.items) {
    if (!isRecord(rawItem)) return { ok: false, error: 'One or more kitchen items are invalid.' };
    const itemId = identifier(rawItem.item_id, 'Kitchen item');
    if (!itemId.ok) return itemId;
    if (seen.has(itemId.value)) return { ok: false, error: 'Duplicate kitchen items are not allowed.' };
    seen.add(itemId.value);

    const quantity = positiveInteger(rawItem.quantity, PUBLIC_ORDER_LIMITS.kitchenItemQuantity, 'Kitchen quantity');
    if (!quantity.ok) return quantity;
    totalUnits += quantity.value;
    if (totalUnits > PUBLIC_ORDER_LIMITS.kitchenItemUnits) {
      return { ok: false, error: 'Too many kitchen items were selected.' };
    }
    items.push({ itemId: itemId.value, quantity: quantity.value });
  }

  return {
    ok: true,
    value: {
      customerName: customerName.value,
      customerEmail: customerEmail.value,
      customerPhone: customerPhone.value,
      items,
      hpField: antiBot.value.hpField,
      submittedAt: antiBot.value.submittedAt,
    },
  };
}

export function validateRaffleCheckoutInput(value: unknown): ValidationResult<RaffleCheckoutInput> {
  if (!isRecord(value)) return { ok: false, error: 'Invalid request body.' };

  const name = requiredText(value.name, PUBLIC_ORDER_LIMITS.nameLength, 'Name');
  if (!name.ok) return name;
  if (name.value.length < 2) return { ok: false, error: 'Name is too short.' };
  const email = requiredText(value.email, PUBLIC_ORDER_LIMITS.emailLength, 'Email');
  if (!email.ok) return email;
  const phone = optionalText(value.phone, PUBLIC_ORDER_LIMITS.phoneLength, 'Phone');
  if (!phone.ok) return phone;
  const quantity = positiveInteger(value.quantity, 20, 'Raffle quantity');
  if (!quantity.ok) return quantity;

  return {
    ok: true,
    value: {
      name: name.value,
      email: email.value.toLowerCase(),
      phone: phone.value,
      quantity: quantity.value,
    },
  };
}

export function validateContactFormInput(value: unknown): ValidationResult<ContactFormInput> {
  if (!isRecord(value)) return { ok: false, error: 'Invalid request body.' };

  const name = requiredText(value.name, PUBLIC_ORDER_LIMITS.nameLength, 'Name');
  if (!name.ok) return name;
  const email = requiredText(value.email, PUBLIC_ORDER_LIMITS.emailLength, 'Email');
  if (!email.ok) return email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value)) {
    return { ok: false, error: 'Please provide a valid email address.' };
  }
  const message = requiredText(value.message, CONTACT_MESSAGE_LENGTH, 'Message');
  if (!message.ok) return message;
  const enquiryType = optionalText(value.enquiry_type, 40, 'Enquiry type');
  if (!enquiryType.ok) return enquiryType;
  const selectedEnquiryType = enquiryType.value || 'general';
  if (!ALLOWED_ENQUIRY_TYPES.has(selectedEnquiryType)) {
    return { ok: false, error: 'Please select a valid enquiry type.' };
  }
  const antiBot = antiBotFields(value);
  if (!antiBot.ok) return antiBot;

  return {
    ok: true,
    value: {
      name: name.value,
      email: email.value.toLowerCase(),
      message: message.value,
      enquiryType: selectedEnquiryType,
      ...antiBot.value,
    },
  };
}

export function validateVolunteerFormInput(value: unknown): ValidationResult<VolunteerFormInput> {
  if (!isRecord(value)) return { ok: false, error: 'Invalid request body.' };

  const name = requiredText(value.name, PUBLIC_ORDER_LIMITS.nameLength, 'Name');
  if (!name.ok) return name;
  const email = requiredText(value.email, PUBLIC_ORDER_LIMITS.emailLength, 'Email');
  if (!email.ok) return email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value)) {
    return { ok: false, error: 'Please provide a valid email address.' };
  }
  const phone = requiredText(value.phone, PUBLIC_ORDER_LIMITS.phoneLength, 'Phone');
  if (!phone.ok) return phone;
  const phoneDigits = phone.value.replace(/\D/g, '');
  if (phoneDigits.length < 8
    || phoneDigits.length > 15
    || !/^[0-9+()\-\s]+$/.test(phone.value)) {
    return { ok: false, error: 'Please provide a valid phone number.' };
  }
  const role = requiredText(value.role, VOLUNTEER_ROLE_LENGTH, 'Volunteer role');
  if (!role.ok) return role;
  const availability = optionalText(value.availability, PUBLIC_ORDER_LIMITS.notesLength, 'Availability');
  if (!availability.ok) return availability;
  const notes = optionalText(value.notes, PUBLIC_ORDER_LIMITS.notesLength, 'Notes');
  if (!notes.ok) return notes;
  const antiBot = antiBotFields(value);
  if (!antiBot.ok) return antiBot;

  return {
    ok: true,
    value: {
      name: name.value,
      email: email.value.toLowerCase(),
      phone: phone.value,
      role: role.value,
      availability: availability.value,
      notes: notes.value,
      ...antiBot.value,
    },
  };
}

export function audAmountToCents(
  value: unknown,
  { allowZero = true, maximumCents = PUBLIC_ORDER_LIMITS.maximumOrderCents } = {}
): ValidationResult<number> {
  let amount: number;
  if (typeof value === 'number') {
    amount = value;
  } else if (typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value.trim())) {
    amount = Number(value.trim());
  } else {
    return { ok: false, error: 'Invalid AUD amount.' };
  }

  if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: 'Invalid AUD amount.' };
  const rawCents = amount * 100;
  const cents = Math.round(rawCents);
  if (!Number.isSafeInteger(cents) || Math.abs(rawCents - cents) > 0.000001) {
    return { ok: false, error: 'Invalid AUD amount.' };
  }
  if ((!allowZero && cents === 0) || cents > maximumCents) {
    return { ok: false, error: 'AUD amount is outside the allowed range.' };
  }
  return { ok: true, value: cents };
}

export async function readLimitedJsonObject(
  request: Request,
  maximumBytes = PUBLIC_ORDER_LIMITS.bodyBytes
): Promise<ValidationResult<Record<string, unknown>>> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maximumBytes) {
    return { ok: false, error: 'Request body is too large.' };
  }
  if (!request.body) return { ok: false, error: 'Invalid request body.' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, error: 'Request body is too large.' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, error: 'Invalid request body.' };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return isRecord(parsed) ? { ok: true, value: parsed } : { ok: false, error: 'Invalid request body.' };
  } catch {
    return { ok: false, error: 'Invalid request body.' };
  }
}
