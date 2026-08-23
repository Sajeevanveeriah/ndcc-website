import fs from 'node:fs/promises';
import path from 'node:path';
import { getServerSharp } from './server-fonts.mjs';

const CLUB_ABN = '20 096 157 051';
const PAGE_WIDTH = 1786;
const PAGE_HEIGHT = 2526;
const PDF_WIDTH = 595.32;
const PDF_HEIGHT = 841.92;

export type PaymentReceiptData = {
  purchaserName: string;
  purchaserEmail: string;
  paymentDate: Date | string;
  issuedDate?: Date | string;
  amountCents: number;
  paymentType: string;
  paymentMethod: string;
  reference: string;
  descriptionLines: string[];
  isTest?: boolean;
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  }[character] || character));
}

function clean(value: unknown, label: string, maxLength = 100): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text.slice(0, maxLength);
}

function dateValue(value: Date | string, label: string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be a valid date.`);
  return parsed;
}

function formatDate(value: Date | string, label: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Australia/Melbourne',
  }).format(dateValue(value, label));
}

function filenameDate(value: Date | string): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Australia/Melbourne',
  }).formatToParts(dateValue(value, 'Payment date'));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}${part('month')}${part('day')}`;
}

function wrapLine(value: string, maxCharacters: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const candidate = lines.length > 0 ? `${lines[lines.length - 1]} ${word}` : word;
    if (candidate.length <= maxCharacters) {
      if (lines.length === 0) lines.push(candidate);
      else lines[lines.length - 1] = candidate;
    } else {
      lines.push(word.slice(0, maxCharacters));
    }
  }
  return lines;
}

function buildPdfWithJpeg(jpeg: Buffer): Buffer {
  const content = `q\n${PDF_WIDTH} 0 0 ${PDF_HEIGHT} 0 0 cm\n/ReceiptImage Do\nQ\n`;
  const objects: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'ascii'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'ascii'),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Resources << /XObject << /ReceiptImage 4 0 R >> >> /Contents 5 0 R >>`, 'ascii'),
    Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${PAGE_WIDTH} /Height ${PAGE_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, 'ascii'),
      jpeg,
      Buffer.from('\nendstream', 'ascii'),
    ]),
    Buffer.from(`<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}endstream`, 'ascii'),
  ];

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xff\xff\xff\xff\n', 'binary')];
  const offsets = [0];
  let offset = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(offset);
    const wrapped = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, 'ascii'),
      object,
      Buffer.from('\nendobj\n', 'ascii'),
    ]);
    chunks.push(wrapped);
    offset += wrapped.length;
  });

  const xrefOffset = offset;
  const xref = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.slice(1).map((value) => `${String(value).padStart(10, '0')} 00000 n `),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    `startxref\n${xrefOffset}`,
    '%%EOF',
  ].join('\n');
  chunks.push(Buffer.from(`${xref}\n`, 'ascii'));
  return Buffer.concat(chunks);
}

export function buildPaymentReceiptFilename(data: Pick<PaymentReceiptData, 'paymentDate' | 'reference'>): string {
  const date = filenameDate(data.paymentDate);
  const reference = clean(data.reference, 'Payment reference', 60)
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'Payment';
  return `${date}-NDCC-Payment-Receipt-${reference}.pdf`;
}

export async function buildPaymentReceiptPdf(data: PaymentReceiptData): Promise<Buffer> {
  const purchaserName = escapeXml(clean(data.purchaserName, 'Purchaser name', 70));
  const purchaserEmail = escapeXml(clean(data.purchaserEmail, 'Purchaser email', 80));
  const paymentType = escapeXml(clean(data.paymentType, 'Payment type', 55));
  const paymentMethod = escapeXml(clean(data.paymentMethod, 'Payment method', 45));
  const reference = escapeXml(clean(data.reference, 'Payment reference', 60));
  if (!Number.isInteger(data.amountCents) || data.amountCents <= 0) {
    throw new Error('Amount must be a positive whole number of cents.');
  }
  if (!Array.isArray(data.descriptionLines) || data.descriptionLines.length === 0) {
    throw new Error('At least one payment description is required.');
  }

  const paymentDate = formatDate(data.paymentDate, 'Payment date');
  const issuedDate = formatDate(data.issuedDate || new Date(), 'Issued date');
  const amount = new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD', minimumFractionDigits: 2,
  }).format(data.amountCents / 100);
  const descriptionLines = data.descriptionLines
    .flatMap((line) => wrapLine(clean(line, 'Payment description', 180), 74))
    .slice(0, 5)
    .map(escapeXml);
  const descriptionSvg = descriptionLines
    .map((line, index) => `<text x="168" y="${1690 + index * 54}" class="value description">${line}</text>`)
    .join('');

  const [logo, font] = await Promise.all([
    fs.readFile(path.join(process.cwd(), 'public/images/logo.jpg')),
    fs.readFile(path.join(process.cwd(), 'public/fonts/NotoSans-Regular.ttf')),
  ]);
  const logoUri = `data:image/jpeg;base64,${logo.toString('base64')}`;
  const fontUri = `data:font/ttf;base64,${font.toString('base64')}`;
  const testOverlay = data.isTest ? `
    <g transform="translate(893 1263) rotate(-24)">
      <rect x="-720" y="-78" width="1440" height="156" rx="18" fill="#fff" fill-opacity="0.92" stroke="#b91c1c" stroke-width="9"/>
      <text x="0" y="22" text-anchor="middle" font-size="66" font-weight="900" letter-spacing="5" fill="#b91c1c">DUMMY TEST - NO PAYMENT RECEIVED</text>
    </g>` : '';

  const svg = `<svg width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <style>
      @font-face { font-family: 'Receipt'; src: url('${fontUri}') format('truetype'); font-weight: 100 900; }
      text { font-family: 'Receipt', sans-serif; }
      .label { font-size: 31px; font-weight: 700; fill: #5f6670; letter-spacing: 1.5px; }
      .value { font-size: 39px; font-weight: 500; fill: #1f2937; }
      .section { font-size: 34px; font-weight: 800; fill: #640818; letter-spacing: 2px; }
      .description { font-size: 37px; }
    </style>
    <rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="#fffdf9"/>
    <rect x="74" y="72" width="1638" height="2382" rx="18" fill="#ffffff" stroke="#ded7cf" stroke-width="3"/>
    <rect x="74" y="72" width="34" height="2382" fill="#650818"/>
    <image href="${logoUri}" x="150" y="130" width="330" height="250" preserveAspectRatio="xMidYMid meet"/>
    <text x="1618" y="190" text-anchor="end" font-size="48" font-weight="800" fill="#4a0000">NEWCOMB &amp; DISTRICT</text>
    <text x="1618" y="250" text-anchor="end" font-size="48" font-weight="800" fill="#4a0000">CRICKET CLUB</text>
    <text x="1618" y="338" text-anchor="end" font-size="74" font-weight="900" letter-spacing="3" fill="#800000">PAYMENT RECEIPT</text>
    <rect x="150" y="425" width="1468" height="10" fill="#800000"/>

    <rect x="150" y="485" width="1468" height="158" rx="14" fill="#f8f3ef"/>
    <text x="200" y="545" class="label">DATE ISSUED</text><text x="200" y="604" class="value">${issuedDate}</text>
    <text x="1030" y="545" class="label">CLUB ABN</text><text x="1030" y="604" class="value">${CLUB_ABN}</text>

    <text x="150" y="735" class="section">PURCHASER DETAILS</text>
    <line x1="150" y1="765" x2="1618" y2="765" stroke="#d6c8c0" stroke-width="3"/>
    <text x="168" y="830" class="label">NAME</text><text x="560" y="830" class="value">${purchaserName}</text>
    <text x="168" y="910" class="label">EMAIL</text><text x="560" y="910" class="value">${purchaserEmail}</text>

    <text x="150" y="1020" class="section">PAYMENT DETAILS</text>
    <line x1="150" y1="1050" x2="1618" y2="1050" stroke="#d6c8c0" stroke-width="3"/>
    <text x="168" y="1120" class="label">TYPE</text><text x="560" y="1120" class="value">${paymentType}</text>
    <text x="168" y="1200" class="label">REFERENCE</text><text x="560" y="1200" class="value">${reference}</text>
    <text x="168" y="1280" class="label">PAYMENT DATE</text><text x="560" y="1280" class="value">${paymentDate}</text>
    <text x="168" y="1360" class="label">METHOD</text><text x="560" y="1360" class="value">${paymentMethod}</text>

    <rect x="150" y="1435" width="1468" height="150" rx="14" fill="#76091c"/>
    <text x="205" y="1495" font-size="31" font-weight="700" letter-spacing="2" fill="#f7dce1">AMOUNT PAID</text>
    <text x="1560" y="1540" text-anchor="end" font-size="72" font-weight="900" fill="#ffffff">${escapeXml(amount)} AUD</text>

    <text x="150" y="1650" class="section">PAYMENT DESCRIPTION</text>
    <line x1="150" y1="1672" x2="1618" y2="1672" stroke="#d6c8c0" stroke-width="3"/>
    ${descriptionSvg}

    <rect x="150" y="2020" width="1468" height="156" rx="14" fill="#f8f3ef"/>
    <text x="200" y="2080" class="label">ISSUED BY</text><text x="560" y="2080" class="value">Newcomb &amp; District Cricket Club</text>
    <text x="200" y="2140" class="label">POSITION</text><text x="560" y="2140" class="value">Automated payment system</text>

    <rect x="150" y="2225" width="1468" height="130" rx="12" fill="#fff7e8" stroke="#e4b65a" stroke-width="3"/>
    <text x="185" y="2270" font-size="25" font-weight="700" fill="#714b05">PAYMENT RECORD</text>
    <text x="185" y="2310" font-size="24" fill="#604b2d">The ABN shown is not currently registered for GST, so no GST is charged or separately stated.</text>
    <text x="185" y="2342" font-size="24" fill="#604b2d">This is not a tax-deductible donation receipt. Keep it with your payment record.</text>
    <text x="884" y="2415" text-anchor="middle" font-size="24" fill="#7b7b7b">Grinter Reserve, 141 Coppards Road, Moolap VIC 3224  |  ndcc.com.au</text>
    ${testOverlay}
  </svg>`;

  const sharp = await getServerSharp();
  const jpeg = await sharp(Buffer.from(svg))
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();
  return buildPdfWithJpeg(jpeg);
}
