export async function fetchPlayHqJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  if (!/^https:\/\//i.test(url)) throw new Error('PlayHQ URL must be HTTPS.');
  const response = await fetch(url, { ...init, headers: { Accept: 'application/json', ...(init.headers || {}) } });
  if (!response.ok) throw new Error(`PlayHQ request failed with HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
