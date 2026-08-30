export const ADMIN_CSRF_HEADER = 'x-ndcc-csrf';
export const ADMIN_CSRF_HEADER_VALUE = '1';

const PUBLIC_UNSAFE_ADMIN_PATHS = new Set([
  '/api/admin/auth/login',
]);

const UNSAFE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const MEDIA_UPLOAD_PATH = '/api/admin/media/upload';

type AdminCsrfEnvironment = {
  NEXT_PUBLIC_SITE_URL?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
};

export type AdminCsrfRequest = {
  method: string;
  pathname: string;
  hasSessionCookie: boolean;
  origin: string | null;
  secFetchSite: string | null;
  contentType: string | null;
  csrfHeader: string | null;
};

export type AdminCsrfResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'trusted_origin_unavailable'
        | 'origin_missing'
        | 'origin_mismatch'
        | 'fetch_site_mismatch'
        | 'request_surface_rejected';
    };

function validatedOrigin(value: string, requireHttps: boolean): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)
      || (requireHttps && url.protocol !== 'https:')
      || url.username
      || url.password
      || (url.pathname !== '/' && url.pathname !== '')
      || url.search
      || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveTrustedAdminOrigins(
  environment: AdminCsrfEnvironment = process.env,
): ReadonlySet<string> {
  const origins = new Set<string>();
  const isProduction = environment.VERCEL_ENV === 'production'
    || (environment.NODE_ENV === 'production' && !environment.VERCEL_ENV);
  const configured = String(environment.NEXT_PUBLIC_SITE_URL || '').trim();
  if (configured) {
    const origin = validatedOrigin(configured, isProduction);
    if (origin) origins.add(origin);
  }

  // VERCEL_URL is deployment-provided and supports isolated preview deployments.
  // It is deliberately not accepted in production, where NEXT_PUBLIC_SITE_URL is
  // the single canonical browser origin.
  if (!isProduction && environment.VERCEL_URL) {
    const previewOrigin = validatedOrigin(`https://${environment.VERCEL_URL}`, true);
    if (previewOrigin) origins.add(previewOrigin);
  }

  const isLocalDevelopment = environment.NODE_ENV === 'development'
    && (!environment.VERCEL_ENV || environment.VERCEL_ENV === 'development');
  if (isLocalDevelopment || (!isProduction && origins.size === 0)) {
    origins.add('http://localhost:3000');
  }
  return origins;
}

function normaliseRequestOrigin(value: string): string | null {
  return validatedOrigin(value.trim(), false);
}

function hasAllowedRequestSurface(request: AdminCsrfRequest): boolean {
  const method = request.method.toUpperCase();
  const contentType = request.contentType?.split(';', 1)[0].trim().toLowerCase() || '';
  const hasCustomHeader = request.csrfHeader === ADMIN_CSRF_HEADER_VALUE;

  if (contentType === 'application/json' || /^application\/[a-z0-9.+-]+\+json$/.test(contentType)) {
    return true;
  }
  if (contentType === 'multipart/form-data') {
    return request.pathname === MEDIA_UPLOAD_PATH && hasCustomHeader;
  }
  if (contentType) return false;

  // Bodyless POST/PATCH/PUT operations need a non-safelisted custom header.
  // Bodyless DELETE is already protected by the exact Origin check below and
  // remains compatible with existing delete controls.
  if (method === 'DELETE') return true;
  return hasCustomHeader;
}

export function validateAdminCsrfRequest(
  request: AdminCsrfRequest,
  environment: AdminCsrfEnvironment = process.env,
): AdminCsrfResult {
  const method = request.method.toUpperCase();
  const isAdminApi = request.pathname.startsWith('/api/admin/');
  const isCommitteeMinutesApi = request.pathname === '/api/meeting-minutes'
    || request.pathname.startsWith('/api/meeting-minutes/');
  if ((!isAdminApi && !isCommitteeMinutesApi)
    || !UNSAFE_METHODS.has(method)
    || !request.hasSessionCookie
    || PUBLIC_UNSAFE_ADMIN_PATHS.has(request.pathname)) {
    return { ok: true };
  }

  const trustedOrigins = resolveTrustedAdminOrigins(environment);
  if (trustedOrigins.size === 0) return { ok: false, reason: 'trusted_origin_unavailable' };
  if (!request.origin) return { ok: false, reason: 'origin_missing' };

  const requestOrigin = normaliseRequestOrigin(request.origin);
  if (!requestOrigin || !trustedOrigins.has(requestOrigin)) {
    return { ok: false, reason: 'origin_mismatch' };
  }

  if (request.secFetchSite && request.secFetchSite.toLowerCase() !== 'same-origin') {
    return { ok: false, reason: 'fetch_site_mismatch' };
  }
  if (!hasAllowedRequestSurface(request)) {
    return { ok: false, reason: 'request_surface_rejected' };
  }
  return { ok: true };
}
