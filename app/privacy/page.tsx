import Link from 'next/link';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Privacy | NDCC' };
export default function PrivacyPage() {
  return <section className="section-padding"><div className="container-width max-w-3xl space-y-6">
    <h1 className="section-title">Privacy and your personal information</h1>
    <p>Newcomb and District Cricket Club uses personal information to run club activities and provide the services you request. Your contact details are private and are not a public member directory.</p>
    <h2 className="text-xl font-bold">What we collect and why</h2>
    <p>Depending on the service, we collect your name, email, phone number, account details, membership or registration information, order details and payment references. Dino Coach also records age eligibility, rules acceptance, team selections and results. We use these records to administer memberships, fulfil orders, issue raffle tickets and receipts, organise cricket and respond to enquiries. Optional details can be left blank.</p>
    <h2 className="text-xl font-bold">Who handles your information</h2>
    <p>Access within the club is restricted to authorised people who need it for their duties. We do not sell member contact details or provide them for unrelated marketing. Essential providers process information to deliver the website: Supabase for accounts and database storage, Vercel for hosting, Stripe for card payments and Resend for transactional emails. These providers may process information outside Australia. Player registration through PlayHQ is subject to its own privacy policy. Information may also be disclosed where required by law.</p>
    <p>Card details are entered into Stripe&apos;s payment service. The club website retains payment references and status, rather than full card numbers. Public cricket statistics, published club content and Dino Coach team names and standings may be visible to other visitors; personal contact details are not published as part of those standings.</p>
    <h2 className="text-xl font-bold">Security</h2>
    <p>The website uses encrypted HTTPS connections, authenticated accounts, restricted administrative permissions, database access controls, input validation and request rate limits. These controls help reduce unauthorised access and automated abuse, including AI-assisted attacks. No online service can guarantee protection against every attack. Keep your password private and report suspicious activity to the club.</p>
    <h2 className="text-xl font-bold">Storage, cookies and retention</h2>
    <p>Account and session storage supports sign-in. Website analytics and operational logs help identify usage and faults. Records are kept for club administration, payment reconciliation and applicable record-keeping requirements. You can ask the club to review information that is no longer needed; some transaction and audit records may need to be retained.</p>
    <h2 className="text-xl font-bold">Your choices and questions</h2>
    <p>You can update your account contact details through <Link href="/club-account" className="underline">My club account</Link>. To request access, correction or deletion, raise a privacy concern or ask about service providers, <Link href="/contact" className="underline">contact the club</Link>. We may need to verify your identity before providing or changing private records. Creating an account does not subscribe you to unrelated marketing.</p>
  </div></section>;
}
