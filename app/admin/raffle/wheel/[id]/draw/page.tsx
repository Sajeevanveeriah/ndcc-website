'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { respinReasonLabel, wheelDrawState, type WheelDrawRow } from '@/lib/prize-wheel/rules';
import { rotationForNumber, wheelSegments } from '@/lib/prize-wheel/wheel-geometry';
import { drawScreenName, postWheelAction, useWheelDetail } from '../../useWheelDetail';

// Club colours for the TV screen.
const MAROON = '#880000';
const NAVY = '#162845';
const BLUE = '#8cc6d1';
const GOLD = '#edc266';
const CREAM = '#FBF7F0';
const SPIN_MS = 7000;
const SIZE = 900;

export default function WheelDrawScreen() {
  const id = String(useParams<{ id: string }>().id || '');
  const { detail, error, reload } = useWheelDetail(id);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [reveal, setReveal] = useState<WheelDrawRow | null>(null);
  const [actionError, setActionError] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => { query.removeEventListener('change', update); if (timer.current) window.clearTimeout(timer.current); };
  }, []);

  const divisions = detail?.campaign.wheel_divisions || 0;
  const segments = useMemo(() => (divisions ? wheelSegments(divisions, SIZE / 2 - 20, SIZE / 2) : []), [divisions]);
  if (error && !detail) return <p role="alert">{error}</p>;
  if (!detail) return <p role="status">Loading draw screen...</p>;
  const state = wheelDrawState(detail.prizes, detail.draws);
  const next = state.next;
  const ticketById = new Map(detail.tickets.map(ticket => [ticket.id, ticket]));
  const collected = new Set(detail.collections.map(item => item.draw_id));
  const prizeById = new Map(detail.prizes.map(prize => [prize.id, prize]));
  const latestWon = [...state.prizes].reverse().find(item => item.status === 'won');
  const fontSize = divisions > 60 ? 16 : divisions > 36 ? 22 : 30;

  async function spin(prizeId: string, respin: null | 'no_winner' | 'unclaimed') {
    if (spinning) return;
    setActionError(''); setReveal(null); setSpinning(true);
    try {
      // The server picks and stores the result first; the wheel then turns to it.
      const { draw } = await postWheelAction<{ draw: WheelDrawRow }>(`/api/admin/raffle/wheel/${id}/draw`, { prizeId, respin });
      const target = rotationForNumber(draw.winning_number, divisions, rotation, reducedMotion ? 0 : 6);
      setRotation(target);
      timer.current = window.setTimeout(async () => {
        setReveal(draw); setSpinning(false); await reload();
      }, reducedMotion ? 0 : SPIN_MS);
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : 'The draw could not be recorded.');
      setSpinning(false);
    }
  }

  const revealTicket = reveal?.ticket_id ? ticketById.get(reveal.ticket_id) : null;
  const revealPrize = reveal ? prizeById.get(reveal.prize_id) : null;
  const buttonStyle = { background: GOLD, color: NAVY } as const;

  return <div className="fixed inset-0 z-[100] overflow-auto" style={{ background: NAVY, color: CREAM }}>
    <div className="mx-auto flex min-h-full max-w-[1920px] flex-col gap-6 p-6 lg:flex-row lg:items-center">
      <div className="flex flex-1 items-center justify-center">
        <div className="relative" style={{ width: 'min(88vh, 92vw)', height: 'min(88vh, 92vw)' }}>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full" role="img" aria-label={`Prize wheel with ${divisions} numbered divisions`}>
            <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${SIZE / 2}px ${SIZE / 2}px`, transition: reducedMotion ? 'none' : `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.8, 0.18, 1)` }}>
              <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 8} fill={GOLD} />
              {segments.map(segment => {
                const fill = segment.number % 3 === 1 ? MAROON : segment.number % 3 === 2 ? BLUE : CREAM;
                const text = fill === MAROON ? CREAM : NAVY;
                return <g key={segment.number}>
                  <path d={segment.path} fill={fill} stroke={NAVY} strokeWidth={2} />
                  <text x={segment.labelX} y={segment.labelY} fill={text} fontSize={fontSize} fontWeight={800} textAnchor="middle" dominantBaseline="middle"
                    transform={`rotate(${segment.labelRotation} ${segment.labelX} ${segment.labelY})`}>{segment.number}</text>
                </g>;
              })}
              <circle cx={SIZE / 2} cy={SIZE / 2} r={70} fill={NAVY} stroke={GOLD} strokeWidth={8} />
            </g>
            <path d={`M${SIZE / 2 - 34} 0 L${SIZE / 2 + 34} 0 L${SIZE / 2} 70 Z`} fill={GOLD} stroke={NAVY} strokeWidth={4} />
          </svg>
        </div>
      </div>
      <aside className="w-full space-y-5 lg:w-[640px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg uppercase tracking-widest" style={{ color: BLUE }}>Live draw</p>
            <h1 className="text-4xl font-black">{detail.campaign.name}</h1>
            <p className="text-xl">{detail.campaign.draw_label}</p>
          </div>
          <Link href={`/admin/raffle/wheel/${id}`} className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: BLUE, color: CREAM }}>Exit</Link>
        </div>

        <div aria-live="assertive" className="min-h-[180px] rounded-xl p-5" style={{ background: MAROON }}>
          {spinning && <p className="text-3xl font-bold">Spinning...</p>}
          {!spinning && reveal && <>
            <p className="text-xl">Prize {revealPrize?.position}: {revealPrize?.name}</p>
            <p className="text-6xl font-black" style={{ color: GOLD }}>Number {reveal.winning_number}</p>
            <p className="text-2xl font-bold">{revealTicket ? `Winner: ${drawScreenName(revealTicket.order?.customer_name)} (ticket ${revealTicket.ticket_number})` : 'No winning ticket on this number. Spin again.'}</p>
          </>}
          {!spinning && !reveal && <p className="text-2xl">{state.complete ? 'All prizes have been drawn. Thank you for supporting the club.' : next ? `Ready to draw prize ${next.prize.position}: ${next.prize.name}` : 'Add prizes to start the draw.'}</p>}
        </div>

        {actionError && <p role="alert" className="rounded-md p-3 text-lg font-semibold" style={{ background: CREAM, color: MAROON }}>{actionError}</p>}

        <div className="flex flex-wrap gap-3">
          {next?.status === 'pending' && <button type="button" disabled={spinning} onClick={() => spin(next.prize.id, null)} className="rounded-xl px-6 py-4 text-2xl font-black disabled:opacity-50" style={buttonStyle}>Draw prize {next.prize.position}</button>}
          {next?.status === 'respin' && <button type="button" disabled={spinning} onClick={() => spin(next.prize.id, 'no_winner')} className="rounded-xl px-6 py-4 text-2xl font-black disabled:opacity-50" style={buttonStyle}>Re-spin prize {next.prize.position} (no winner)</button>}
          {latestWon?.latest && !collected.has(latestWon.latest.id) && <button type="button" disabled={spinning}
            onClick={() => { if (window.confirm(`Record that the winner of prize ${latestWon.prize.position} did not claim it, and spin again?`)) void spin(latestWon.prize.id, 'unclaimed'); }}
            className="rounded-xl border-2 px-4 py-3 text-lg font-bold disabled:opacity-50" style={{ borderColor: BLUE, color: CREAM }}>Prize {latestWon.prize.position} unclaimed - re-spin</button>}
        </div>
        <p className="text-sm" style={{ color: BLUE }}>The winning number is chosen by the website&apos;s secure random generator and recorded before the wheel turns. First number drawn wins first prize. A ticket can win only once.</p>

        <section aria-labelledby="draw-log-title">
          <h2 id="draw-log-title" className="mb-2 text-xl font-bold">Draw log</h2>
          <ol className="max-h-[40vh] space-y-1 overflow-auto text-lg">
            {[...detail.draws].reverse().map(draw => {
              const ticket = draw.ticket_id ? ticketById.get(draw.ticket_id) : null;
              return <li key={draw.id} className="border-b pb-1" style={{ borderColor: 'rgba(140,198,209,0.3)' }}>
                #{draw.draw_number} Prize {prizeById.get(draw.prize_id)?.position}: number <strong>{draw.winning_number}</strong> - {ticket ? `winner ${drawScreenName(ticket.order?.customer_name)}` : 'no winner'} <span className="text-base" style={{ color: BLUE }}>({respinReasonLabel(draw.respin_reason)})</span>
              </li>;
            })}
          </ol>
        </section>
      </aside>
    </div>
  </div>;
}
