export type NewsGalleryImage = {
  src: string;
  alt: string;
};

const NEWS_IMAGE_DIRECTIVE = /^\[\[news-image:([^|\]]+)\|([^\]]+)\]\]$/;
const LOCAL_NEWS_IMAGE_PATH = /^\/images\/[A-Za-z0-9/_-]+\.(?:avif|gif|jpe?g|png|webp)$/i;

function normaliseBody(lines: string[]) {
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function normaliseAltText(value: string) {
  return String(value || '')
    .replace(/[|\]\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

export function parseNewsContent(content: string): { body: string; images: NewsGalleryImage[] } {
  const images: NewsGalleryImage[] = [];
  const seenSources = new Set<string>();
  const bodyLines: string[] = [];

  for (const line of String(content || '').split(/\r?\n/)) {
    const match = NEWS_IMAGE_DIRECTIVE.exec(line.trim());
    if (!match) {
      bodyLines.push(line);
      continue;
    }

    const src = match[1].trim();
    const alt = match[2].trim();
    const valid = LOCAL_NEWS_IMAGE_PATH.test(src) && alt.length > 0 && alt.length <= 240;

    if (!valid) {
      bodyLines.push(line);
      continue;
    }

    if (!seenSources.has(src)) {
      seenSources.add(src);
      images.push({ src, alt });
    }
  }

  return { body: normaliseBody(bodyLines), images };
}

export function serializeNewsContent(body: string, images: NewsGalleryImage[]) {
  const cleanBody = String(body || '').trim();
  const seenSources = new Set<string>();
  const directives: string[] = [];

  for (const image of images || []) {
    const src = String(image?.src || '').trim();
    const alt = normaliseAltText(image?.alt || '');
    if (!LOCAL_NEWS_IMAGE_PATH.test(src) || !alt || seenSources.has(src)) continue;

    seenSources.add(src);
    directives.push(`[[news-image:${src}|${alt}]]`);
  }

  if (!directives.length) return cleanBody;
  if (!cleanBody) return directives.join('\n');
  return `${cleanBody}\n\n${directives.join('\n')}`;
}

export function stripNewsGalleryContent(content: string) {
  return parseNewsContent(content).body;
}
