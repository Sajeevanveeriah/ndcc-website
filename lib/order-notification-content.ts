export type StaffOrderCategory = 'apparel' | 'kitchen';
export type StaffOrderNotificationStage = 'created' | 'paid';

export type StaffOrderItem = {
  name?: unknown;
  size?: unknown;
  quantity?: unknown;
  price?: unknown;
  applied_options?: unknown;
  custom_name?: unknown;
  custom_number?: unknown;
  alternate_number?: unknown;
};

export type StaffOrderNotificationInput = {
  orderId: string;
  paymentReference: string;
  category: StaffOrderCategory;
  stage: StaffOrderNotificationStage;
  paymentMade: boolean;
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  items: StaffOrderItem[];
  totalAmount: number;
};

export type StaffOrderNotificationContent = {
  recipients: string[];
  subject: string;
  title: string;
  bodyHtml: string;
  idempotencyKey: string;
  paymentMadeLabel: 'Yes' | 'No';
};

const SECRETARY_EMAIL = 'ndcc.secretary1@gmail.com';
const APPAREL_EMAILS = [SECRETARY_EMAIL, 'joshwalker20695@gmail.com'] as const;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function quantity(value: unknown): number {
  return Math.max(1, Math.round(finiteNumber(value, 1)));
}

function detailLines(item: StaffOrderItem): string[] {
  const lines: string[] = [];
  const size = typeof item.size === 'string' ? item.size.trim() : '';
  if (size && size !== 'kitchen') lines.push(`Size: ${escapeHtml(size)}`);

  if (Array.isArray(item.applied_options)) {
    for (const option of item.applied_options) {
      if (!option || typeof option !== 'object') continue;
      const group = 'group' in option ? String(option.group ?? '').trim() : '';
      const label = 'label' in option ? String(option.label ?? '').trim() : '';
      if (group && label) lines.push(`${escapeHtml(group)}: ${escapeHtml(label)}`);
    }
  }

  const surname = typeof item.custom_name === 'string' ? item.custom_name.trim() : '';
  if (surname) lines.push(`Surname: ${escapeHtml(surname)}`);

  const numbers = [item.custom_number, item.alternate_number]
    .map((value) => finiteNumber(value, Number.NaN))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 99);
  if (numbers.length > 0) {
    lines.push(`Number preferences: ${numbers.join(', ')} (subject to availability)`);
  }

  return lines;
}

export function getStaffOrderRecipients(category: StaffOrderCategory): string[] {
  return category === 'apparel' ? [...APPAREL_EMAILS] : [SECRETARY_EMAIL];
}

export function buildStaffOrderNotificationContent(
  input: StaffOrderNotificationInput,
): StaffOrderNotificationContent {
  const categoryLabel = input.category === 'apparel' ? 'Apparel' : 'Kitchen';
  const paymentMadeLabel = input.paymentMade ? 'Yes' : 'No';
  const safeReference = escapeHtml(input.paymentReference || input.orderId);
  const safeName = escapeHtml(input.customer.name);
  const safeEmail = escapeHtml(input.customer.email);
  const safePhone = escapeHtml(input.customer.phone || 'Not supplied');
  const safeTotal = finiteNumber(input.totalAmount).toFixed(2);

  const itemRows = input.items
    .map((item) => {
      const itemQuantity = quantity(item.quantity);
      const unitPrice = finiteNumber(item.price);
      const details = detailLines(item);
      const detailsHtml = details.length > 0
        ? `<br><span style="font-size:12px;color:#6b7280;line-height:1.5;">${details.join('<br>')}</span>`
        : '';
      return `<tr>
        <td style="padding:8px;font-size:14px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.name || 'Item')}${detailsHtml}</td>
        <td style="padding:8px;font-size:14px;text-align:center;border-bottom:1px solid #e5e7eb;">${itemQuantity}</td>
        <td style="padding:8px;font-size:14px;text-align:right;border-bottom:1px solid #e5e7eb;">$${(unitPrice * itemQuantity).toFixed(2)}</td>
      </tr>`;
    })
    .join('');

  const stageText = input.stage === 'paid'
    ? 'The order is now fully paid.'
    : 'A new order has been received.';

  return {
    recipients: getStaffOrderRecipients(input.category),
    subject: `${categoryLabel} order ${input.paymentReference || input.orderId} - Payment made: ${paymentMadeLabel}`,
    title: `${categoryLabel} Order Notification`,
    idempotencyKey: `staff-order-${input.stage}-${input.orderId}`,
    paymentMadeLabel,
    bodyHtml: `<p style="font-size:15px;color:#374151;line-height:1.6;">${stageText}</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;width:150px;">Order reference</td><td style="padding:6px 0;font-size:14px;font-weight:bold;">${safeReference}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Payment made</td><td style="padding:6px 0;font-size:14px;font-weight:bold;">${paymentMadeLabel}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Ordered by</td><td style="padding:6px 0;font-size:14px;">${safeName}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Email</td><td style="padding:6px 0;font-size:14px;">${safeEmail}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Phone</td><td style="padding:6px 0;font-size:14px;">${safePhone}</td></tr>
      </table>
      <h2 style="margin:24px 0 10px;font-size:16px;color:#4a0000;">What was ordered</h2>
      <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px;font-size:13px;text-align:left;color:#6b7280;">Item</th>
            <th style="padding:8px;font-size:13px;text-align:center;color:#6b7280;">Qty</th>
            <th style="padding:8px;font-size:13px;text-align:right;color:#6b7280;">Line total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding:10px 8px;font-size:14px;font-weight:bold;text-align:right;">Order total</td>
            <td style="padding:10px 8px;font-size:15px;font-weight:bold;text-align:right;color:#800000;">$${safeTotal} AUD</td>
          </tr>
        </tfoot>
      </table>`,
  };
}
