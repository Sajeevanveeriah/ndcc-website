'use client';
import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import type { WheelDrawRow, WheelPrizeRow } from '@/lib/prize-wheel/rules';

export type WheelDetailTicket = {
  id: string; ticket_number: number; ticket_reference: string; voided_at: string | null; raffle_order_id: string;
  order: { customer_name: string; customer_email: string; status: string; payment_method: string } | null;
};

export type WheelDetail = {
  campaign: {
    id: string; name: string; code: string; price_cents: number; draw_at: string; draw_label: string; sales_open_at: string;
    wheel_divisions: number; prize_pool_cents: number; active: boolean;
  };
  prizes: WheelPrizeRow[];
  draws: WheelDrawRow[];
  tickets: WheelDetailTicket[];
  unavailable: number[];
  collections: Array<{ draw_id: string; collected_at: string; note: string | null; staff: { full_name: string } | null }>;
  emails: Array<{ draw_id: string; sent_at: string }>;
  operators: Record<string, string>;
  serverTime: string;
};

export function useWheelDetail(id: string) {
  const [detail, setDetail] = useState<WheelDetail | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try {
      const response = await adminFetch(`/api/admin/raffle/wheel/${encodeURIComponent(id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The prize wheel could not be loaded.');
      setDetail(data as WheelDetail);
      setError('');
      return data as WheelDetail;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The prize wheel could not be loaded.');
      return null;
    }
  }, [id]);
  useEffect(() => { void reload(); }, [reload]);
  return { detail, error, reload };
}

export async function postWheelAction<T = Record<string, unknown>>(url: string, body: object): Promise<T> {
  const response = await adminFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request failed.');
  return data as T;
}

/** "Jordan S." style label for the live draw screen. */
export function drawScreenName(name: string | undefined): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : parts[0];
}
