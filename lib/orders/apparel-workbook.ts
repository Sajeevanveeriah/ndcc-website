export type ApparelWorkbookOrder = {
  id: string;
  customer_name: string;
  created_at: string;
  payment_status?: string | null;
  payment_reference?: string | null;
  processed?: boolean | null;
  items: Array<{
    name?: string;
    slug?: string;
    size?: string;
    quantity?: number;
    applied_options?: Array<{ group: string; value?: string; label: string }>;
    custom_name?: string;
    custom_number?: number;
    alternate_number?: number;
  }>;
};

type CellValue = string | number | null;

const MASTER_ITEMS = [
  'Cap',
  'Baggy',
  'Floppy',
  'Retro jacket',
  'Boss top - fleece',
  'Spray jacket',
  'Soft shell jacket',
  'Puffer jacket',
  'Hoodie - summit',
  'Hoodie - standard',
  'Puffer vest',
  'Social polo',
  'Shorts',
  'Track pants',
  'Training - SS tee',
  'Training - LS tee',
  'Training - singlet',
  'Reversible jumper',
  'Reversible vest',
  'Maroon playing - Pants',
  'Maroon playing - Jumper',
  'Maroon playing - SS shirt',
  'Maroon playing - LS shirt',
  'Cream playing - Pants',
  'Cream playing - Jumper',
  'Cream playing - SS shirt',
  'Cream playing - LS shirt',
] as const;

const SIZE_LABELS: Record<string, string> = {
  XS: '1. XS',
  S: '2. S',
  M: '3. M',
  L: '4. L',
  XL: '5. XL',
  '2XL': '6. 2XL',
  '3XL': '7. 3XL',
  '4XL': '8. 4XL',
  '5XL': '9. 5XL',
  '6XL': '10. 6XL',
  'One Size': 'One size',
};

const SIZE_ORDER = [
  'Other (notes)', 'K10', 'K12', 'K14', 'K16', 'One size',
  '1. XS', '2. S', '3. M', '4. L', '5. XL', '6. 2XL',
  '7. 3XL', '8. 4XL', '9. 5XL', '10. 6XL',
];

function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function selectedOption(item: ApparelWorkbookOrder['items'][number], group: string): string {
  return item.applied_options?.find((option) => option.group.toLowerCase() === group.toLowerCase())?.label || '';
}

export function supplierSizeLabel(size: string | null | undefined): string {
  const trimmed = String(size || '').trim();
  return SIZE_LABELS[trimmed] || trimmed || 'Other (notes)';
}

export function supplierProductName(item: ApparelWorkbookOrder['items'][number]): string {
  const name = String(item.name || item.slug || '').trim();
  const lower = name.toLowerCase();
  const colour = /cr[eè]me/i.test(selectedOption(item, 'Colour')) ? 'Cream' : 'Maroon';
  const longSleeve = /long/i.test(selectedOption(item, 'Sleeve length'));

  if (lower === 'playing shirt' || lower === 'playing-shirt') {
    return `${colour} playing - ${longSleeve ? 'LS' : 'SS'} shirt`;
  }
  if (lower === 'playing pants' || lower === 'playing-pants') return `${colour} playing - Pants`;
  if (lower === 'jumper') return `${colour} playing - Jumper`;
  if (lower === 'tee shirt' || lower === 'tee-shirt') return `Training - ${longSleeve ? 'LS' : 'SS'} tee`;

  const mapped: Record<string, string> = {
    singlet: 'Training - singlet',
    shorts: 'Shorts',
    'track pants': 'Track pants',
    'track-pants': 'Track pants',
    cap: 'Cap',
    'wide brim hat': 'Floppy',
    'wide-brim-hat': 'Floppy',
    'baggy cap': 'Baggy',
    'baggy-cap': 'Baggy',
    'club polo': 'Social polo',
    'club-polo': 'Social polo',
    hoody: 'Hoodie - standard',
    'summit hoodie': 'Hoodie - summit',
    'summit-hoodie': 'Hoodie - summit',
    'boss top fleece': 'Boss top - fleece',
    'boss-top-fleece': 'Boss top - fleece',
    'spray jacket': 'Spray jacket',
    'spray-jacket': 'Spray jacket',
    'soft shell jacket': 'Soft shell jacket',
    'soft-shell-jacket': 'Soft shell jacket',
    'puffer jacket': 'Puffer jacket',
    'puffer-jacket': 'Puffer jacket',
    'puffer vest': 'Puffer vest',
    'puffer-vest': 'Puffer vest',
    'retro jacket': 'Retro jacket',
    'retro-jacket': 'Retro jacket',
    'reversible jumper': 'Reversible jumper',
    'reversible-jumper': 'Reversible jumper',
    'reversible vest': 'Reversible vest',
    'reversible-vest': 'Reversible vest',
  };
  return mapped[lower] || name;
}

function paymentLabel(status: string | null | undefined): string {
  if (status === 'paid') return 'Yes';
  if (status === 'part_paid') return 'Part paid';
  if (status === 'refunded' || status === 'partially_refunded') return 'Refunded';
  return 'No';
}

export function buildApparelDetailRows(orders: ApparelWorkbookOrder[]): CellValue[][] {
  const rows: CellValue[][] = [[
    'Name', 'Item', 'Size', 'Shirt name', 'Shirt number',
    'Invoiced?', 'Paid?', 'Ready for distribution',
  ]];

  orders.forEach((order, orderIndex) => {
    if (orderIndex > 0) rows.push([]);
    let firstLine = true;
    for (const item of Array.isArray(order.items) ? order.items : []) {
      const quantity = Math.max(1, Math.trunc(Number(item.quantity) || 1));
      for (let index = 0; index < quantity; index += 1) {
        const numberPreferences = [item.custom_number, item.alternate_number]
          .filter((value) => value !== undefined && value !== null)
          .join(' / ');
        rows.push([
          firstLine ? order.customer_name : '',
          supplierProductName(item),
          supplierSizeLabel(item.size),
          item.custom_name || '',
          numberPreferences,
          order.payment_reference ? 'Online purchase' : 'No',
          paymentLabel(order.payment_status),
          order.processed ? 'Yes' : 'No',
        ]);
        firstLine = false;
      }
    }
  });
  return rows;
}

export function buildApparelSummaryRows(detailRows: CellValue[][]): CellValue[][] {
  const counts = new Map<string, Map<string, number>>();
  for (const row of detailRows.slice(1)) {
    const product = String(row[1] || '');
    const size = String(row[2] || '');
    if (!product) continue;
    const bySize = counts.get(product) || new Map<string, number>();
    bySize.set(size, (bySize.get(size) || 0) + 1);
    counts.set(product, bySize);
  }

  const usedSizes = Array.from(new Set(Array.from(counts.values()).flatMap((entry) => Array.from(entry.keys()))))
    .sort((a, b) => {
      const ai = SIZE_ORDER.indexOf(a);
      const bi = SIZE_ORDER.indexOf(b);
      return (ai === -1 ? SIZE_ORDER.length : ai) - (bi === -1 ? SIZE_ORDER.length : bi) || a.localeCompare(b);
    });
  const products = Array.from(counts.keys()).sort((a, b) => {
    const ai = MASTER_ITEMS.indexOf(a as typeof MASTER_ITEMS[number]);
    const bi = MASTER_ITEMS.indexOf(b as typeof MASTER_ITEMS[number]);
    return (ai === -1 ? MASTER_ITEMS.length : ai) - (bi === -1 ? MASTER_ITEMS.length : bi) || a.localeCompare(b);
  });

  const rows: CellValue[][] = [
    ['', ...usedSizes, 'Grand Total'],
    ['Row Labels', ...usedSizes.map(() => ''), 'Grand Total'],
  ];
  const columnTotals = usedSizes.map(() => 0);
  let grandTotal = 0;

  for (const product of products) {
    const bySize = counts.get(product)!;
    const values = usedSizes.map((size, index) => {
      const count = bySize.get(size) || 0;
      columnTotals[index] += count;
      return count;
    });
    const total = values.reduce((sum, value) => sum + value, 0);
    grandTotal += total;
    rows.push([product, ...values, total]);
  }
  rows.push(['Grand Total', ...columnTotals, grandTotal]);
  return rows;
}

function columnName(index: number): string {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function worksheetXml(
  rows: CellValue[][],
  widths: number[],
  options: { headerRows?: number; summary?: boolean; autofilter?: boolean } = {},
): string {
  const maxColumns = Math.max(widths.length, ...rows.map((row) => row.length), 1);
  const maxRows = Math.max(rows.length, 1);
  const headerRows = options.headerRows || 1;
  const columns = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
  const body = rows.map((row, rowIndex) => {
    const totalRow = options.summary && rowIndex === rows.length - 1;
    const cells = row.map((value, columnIndex) => {
      if (value === null || value === '') return '';
      const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
      const style = totalRow ? 4 : rowIndex < headerRows ? (options.summary ? 3 : 1) : 2;
      if (typeof value === 'number') return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
      return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  const filter = options.autofilter && rows.length > 0
    ? `<autoFilter ref="A1:${columnName(maxColumns - 1)}${maxRows}"/>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:${columnName(maxColumns - 1)}${maxRows}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRows}" topLeftCell="A${headerRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/><cols>${columns}</cols>` +
    `<sheetData>${body}</sheetData>${filter}` +
    `</worksheet>`;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStored(files: Array<{ name: string; content: string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const data = Buffer.from(file.content, 'utf8');
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function buildApparelWorkbook(orders: ApparelWorkbookOrder[]): Buffer {
  const detailRows = buildApparelDetailRows(orders);
  const summaryRows = buildApparelSummaryRows(detailRows);
  const masterRows: CellValue[][] = [
    ['Name', 'Item', 'Size', 'Shirt name', 'Shirt number', 'Invoiced?', 'Paid?', 'Collected?', '', '', 'Total owing'],
    ...MASTER_ITEMS.map((item) => ['', item]),
  ];
  const customBagsRows: CellValue[][] = [['', 'Name', 'Number']];
  const sheetNames = ['Master', 'Custom bags', '2627 - Order 1', '2627 - Order 1 Summary'];

  const workbookSheets = sheetNames.map((name, index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
  const workbookRelationships = sheetNames.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
  const sheetOverrides = sheetNames.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');

  return zipStored([
    { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}</Types>` },
    { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="2"/></bookViews><sheets>${workbookSheets}</sheets><calcPr calcId="0"/></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRelationships}<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFABABAB"/></left><right style="thin"><color rgb="FFABABAB"/></right><top style="thin"><color rgb="FFABABAB"/></top><bottom style="thin"><color rgb="FFABABAB"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    { name: 'xl/worksheets/sheet1.xml', content: worksheetXml(masterRows, [22, 30, 14, 18, 16, 16, 12, 14, 4, 4, 14], { autofilter: true }) },
    { name: 'xl/worksheets/sheet2.xml', content: worksheetXml(customBagsRows, [24, 24, 14]) },
    { name: 'xl/worksheets/sheet3.xml', content: worksheetXml(detailRows, [24, 32, 15, 20, 20, 18, 14, 24], { autofilter: true }) },
    { name: 'xl/worksheets/sheet4.xml', content: worksheetXml(summaryRows, [32, ...summaryRows[0].slice(1).map(() => 14)], { headerRows: 2, summary: true }) },
  ]);
}
