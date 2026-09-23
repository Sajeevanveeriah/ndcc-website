/** Convert repository viewer links to image resources, without fetching URLs. */
import assetRedirects from './asset-redirects.json' with { type: 'json' };

const ASSET_REDIRECTS: Record<string, string> = assetRedirects;
const SITE_HOSTS = new Set(['www.ndcc.com.au', 'ndcc.com.au']);

// Optimised/de-duplicated public files keep permanent redirects, but the
// next/image optimiser does not follow redirects, so stored CMS paths are
// mapped to their current file here before rendering.
function currentAssetPath(path: string): string {
  return ASSET_REDIRECTS[path] ?? path;
}

export function normaliseMediaUrl(value: string): string {
  const input = value.trim().replace(/^\/?public\//, '/').replace(/^images\//, '/images/');
  if (input.startsWith('/') && !input.startsWith('//')) {
    const cut = input.search(/[?#]/);
    return cut === -1 ? currentAssetPath(input) : currentAssetPath(input.slice(0, cut)) + input.slice(cut);
  }
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password) return input;
    if (SITE_HOSTS.has(url.hostname) && ASSET_REDIRECTS[url.pathname]) {
      url.pathname = ASSET_REDIRECTS[url.pathname];
      return url.toString();
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.hostname === 'github.com' && parts[2] === 'blob' && parts.length > 4) {
      const [owner, repo, , ref, ...path] = parts;
      if (owner.toLowerCase() === 'sajeevanveeriah' && repo === 'ndcc-website' && ref === 'main' && path[0] === 'public') {
        return '/' + path.slice(1).join('/');
      }
      return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path.join('/')}`;
    }
    return input;
  } catch { return input; }
}
