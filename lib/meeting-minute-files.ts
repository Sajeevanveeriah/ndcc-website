export const MINUTE_FILE_LIMIT = 4 * 1024 * 1024;
export const MINUTE_FILE_ACCEPT = '.pdf,.doc,.docx';
export const MINUTE_BUCKET = 'meeting-minute-documents';

export function minuteFileType(name: string): string | null {
  const extension = name.split('.').pop()?.toLowerCase();
  return ({ pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } as Record<string, string>)[extension || ''] || null;
}

export function validateMinuteFile(name: string, bytes: Uint8Array): string {
  const type = minuteFileType(name);
  if (!type || !bytes.length || bytes.length > MINUTE_FILE_LIMIT) throw new Error('Choose a PDF or Word document up to 4 MB.');
  const starts = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  const text = new TextDecoder('latin1').decode(bytes);
  const valid = type === 'application/pdf'
    ? starts(37, 80, 68, 70, 45) && text.slice(-2048).includes('%%EOF')
    : type === 'application/msword'
      ? starts(208, 207, 17, 224, 161, 177, 26, 225)
      : starts(80, 75, 3, 4) && text.includes('[Content_Types].xml') && text.includes('word/document.xml') && !text.includes('vbaProject.bin');
  if (!valid) throw new Error('The document does not match its file type. Export it as PDF or Word and try again.');
  return type;
}

export async function readMinuteForm(request: Request): Promise<FormData> {
  const limit = MINUTE_FILE_LIMIT + 256 * 1024;
  const reader = request.body?.getReader();
  if (!reader) throw new Error('The request is empty.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('Choose a PDF or Word document up to 4 MB.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new Response(bytes, { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData();
}
