// Helpers that keep database/driver error text out of public API responses.
//
// Some Dino Coach RPCs (see supabase/migrations/20260919000620_dino_wallet_trades.sql)
// deliberately RAISE EXCEPTION with a player-facing message such as
// "Player price changed. Reload before buying." Those surface either with the
// default PL/pgSQL SQLSTATE P0001 or with an explicit check_violation (23514).
// Only those are passed through; constraint violations, syntax errors,
// connectivity problems and every other error get the caller's generic text.

type DatabaseErrorLike = { code?: unknown; message?: unknown } | null | undefined;

const MAX_PUBLIC_MESSAGE_LENGTH = 240;

export function publicRpcErrorMessage(error: DatabaseErrorLike, fallback: string): string {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message.trim() : '';
  if (!message || message.length > MAX_PUBLIC_MESSAGE_LENGTH) return fallback;
  if (code === 'P0001') return message;
  // A real CHECK constraint failure reads "new row for relation ... violates
  // check constraint ..." and would leak schema names; RPC-raised
  // check_violation messages are plain sentences.
  if (code === '23514' && !/violates|relation|constraint/i.test(message)) return message;
  return fallback;
}

export function logRouteError(scope: string, error: unknown) {
  const detail = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown; name?: unknown } : null;
  console.error(`[${scope}]`, {
    code: typeof detail?.code === 'string' ? detail.code : undefined,
    message: typeof detail?.message === 'string' ? detail.message.slice(0, 300) : String(error).slice(0, 300),
  });
}
