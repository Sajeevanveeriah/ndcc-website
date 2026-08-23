import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

type PaymentMetadataRow = {
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

export async function getPaymentMetadata(
  supabase: SupabaseClient,
  paymentId: string,
): Promise<{ metadata: Record<string, unknown>; error?: string }> {
  const { data, error } = await supabase
    .from('order_payments')
    .select('metadata,updated_at')
    .eq('id', paymentId)
    .maybeSingle();
  if (error || !data) return { metadata: {}, error: error?.message || 'Payment was not found.' };
  return { metadata: (data as PaymentMetadataRow).metadata || {} };
}

export async function mergePaymentMetadata(
  supabase: SupabaseClient,
  paymentId: string,
  patch: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from('order_payments')
      .select('metadata,updated_at')
      .eq('id', paymentId)
      .maybeSingle();
    if (error || !data) return { ok: false, reason: error?.message || 'Payment was not found.' };

    const current = data as PaymentMetadataRow;
    const { data: updated, error: updateError } = await supabase
      .from('order_payments')
      .update({ metadata: { ...(current.metadata || {}), ...patch } })
      .eq('id', paymentId)
      .eq('updated_at', current.updated_at)
      .select('id')
      .maybeSingle();
    if (updateError) return { ok: false, reason: updateError.message };
    if (updated) return { ok: true };
  }
  return { ok: false, reason: 'Payment metadata changed concurrently too many times.' };
}
