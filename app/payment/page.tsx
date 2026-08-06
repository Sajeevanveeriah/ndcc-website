import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import Card, { CardContent } from '@/components/ui/Card';

export const metadata = {
  title: 'Payment | NDCC Dinos',
  robots: { index: false, follow: false },
};

type PaymentResultPageProps = {
  searchParams?: {
    status?: string;
    return_path?: string;
  };
};

function safeReturnPath(value: string | undefined): string {
  if (!value) return '/';
  if (value === '/merchandise' || value === '/kitchen' || value === '/join' || value === '/events') {
    return value;
  }
  if (/^\/events\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return value;
  }
  return '/';
}

export default function PaymentResultPage({ searchParams }: PaymentResultPageProps) {
  const submitted = searchParams?.status === 'submitted';
  const returnPath = safeReturnPath(searchParams?.return_path);

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">Payment</h1>
        </div>
      </section>
      <section className="section-padding">
        <div className="container-width max-w-2xl mx-auto">
          <Card>
            <CardContent className="p-8 space-y-5 text-center">
              {submitted ? (
                <CheckCircle2 className="mx-auto h-12 w-12 text-green-700" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mx-auto h-12 w-12 text-amber-700" aria-hidden="true" />
              )}
              <h2 className="text-2xl font-display font-bold text-content-primary">
                {submitted ? 'Payment submitted' : 'Payment cancelled'}
              </h2>
              <p className="font-body text-content-secondary">
                {submitted
                  ? 'Stripe has returned you to the club website. The signed payment notification is being matched to your order.'
                  : 'No card payment was completed. Your order or registration remains available for bank transfer.'}
              </p>
              <Link href={returnPath} className="btn-primary inline-flex justify-center">
                Return to the previous page
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
