export const FEEDBACK_KINDS = [
  { value: 'issue', label: 'Something is not working' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'feedback', label: 'Other feedback' },
] as const;

export function validateDinoFeedback(input: Record<string, unknown>) {
  const { id, name, email, kind, message, hpField, submittedAt } = input;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return { ok: false as const, error: 'Please reload the form and try again.' };
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || /[\r\n<>]/.test(name)) return { ok: false as const, error: 'Enter your name, using up to 100 characters.' };
  if (typeof email !== 'string' || email.trim().length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email.trim())) return { ok: false as const, error: 'Enter a valid email so we can reply.' };
  if (!FEEDBACK_KINDS.some(item => item.value === kind)) return { ok: false as const, error: 'Choose a feedback type.' };
  if (typeof message !== 'string' || message.trim().length < 10 || message.trim().length > 5000) return { ok: false as const, error: 'Enter a message between 10 and 5,000 characters.' };
  if (typeof hpField !== 'string' || typeof submittedAt !== 'number' || !Number.isFinite(submittedAt)) return { ok: false as const, error: 'Please reload the form and try again.' };
  return { ok: true as const, value: { id, name: name.trim(), email: email.trim().toLowerCase(), kind: kind as string, message: message.trim(), hpField, submittedAt } };
}
