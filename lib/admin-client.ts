export async function parseApiResponse<T>(response: Response): Promise<T> {
  let body: Record<string, unknown> | null = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = typeof body?.error === 'string' ? body.error : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return (body ?? {}) as T;
}
