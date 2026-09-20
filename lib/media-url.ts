/** Convert repository viewer links to image resources, without fetching URLs. */
export function normaliseMediaUrl(value: string): string {
  const input = value.trim().replace(/^\/?public\//, '/').replace(/^images\//, '/images/');
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password) return input;
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
