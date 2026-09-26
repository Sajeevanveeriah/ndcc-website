import BalancePayment from '@/components/payments/BalancePayment';
// Payment surface: always rendered per request, never from the ISR cache.
export const dynamic = 'force-dynamic';
export const metadata = { title:'Payment options and bank deposit', robots:{index:false,follow:false}, referrer:'no-referrer' as const };
export default function PayBalancePage() { return <><section className="page-hero"><div className="container-width"><h1 className="page-hero-title">Payment options and bank deposit</h1></div></section><section className="section-padding"><div className="container-width max-w-2xl"><BalancePayment /></div></section></>; }
