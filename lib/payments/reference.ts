import { createServerClient } from '@/lib/supabase-server';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export async function generateUniquePaymentReference() {
  const now = new Date();
  const datePart = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const supabase = createServerClient();

  for (let i = 0; i < 10; i += 1) {
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const reference = `NDCC-${datePart}-${suffix}`;
    const { data } = await supabase.from('orders').select('id').eq('payment_reference', reference).limit(1);
    if (!data || data.length === 0) return reference;
  }

  return `NDCC-${datePart}-${Date.now().toString().slice(-6)}`;
}
