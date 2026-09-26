import type { Metadata } from 'next';
import Link from 'next/link';
import { getMembershipOptions } from '@/lib/public-form-options';
import { getPotClubProductCode } from '@/lib/server/pot-club';
import { DEFAULT_POT_CLUB_PRODUCT_CODE, formatPotClubPrice } from '@/lib/pot-club';
import SocialMembershipForm from '@/app/join/SocialMembershipForm';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pot Club | NDCC', description: 'Order your NDCC Pot Club engraved glass and pay online.' };
export default async function PotClubPage() {
 const [{plans}, productCode]=await Promise.all([getMembershipOptions(), getPotClubProductCode()]); const pots=plans.filter(p=>p.product_code===productCode);
 const plan=pots[0];
 // Price and name come from the selected membership plan; the original product keeps its original wording.
 const intro=!plan?null:productCode===DEFAULT_POT_CLUB_PRODUCT_CODE
  ?`Join the 2026/2027 Pot Club for ${formatPotClubPrice(plan.price)}. Your purchase includes an engraved pot glass and 50 cents off each drink for the season, including spirits, wine, soft drinks, cider and beer.`
  :`Join ${plan.name} for ${formatPotClubPrice(plan.price)}.${plan.description?` ${plan.description}`:''}`;
 return <section className="section-padding"><div className="container-width max-w-2xl space-y-6"><h1 className="section-title">Pot Club</h1>
 {intro&&<p>{intro}</p>}
 <p>Order below and choose secure card payment or bank transfer. You can leave an engraving preference in the notes. For engraving and collection arrangements, <Link href="/contact" className="underline">contact the club</Link>.</p>
 {pots.length?<SocialMembershipForm plans={pots} addons={[]} />:<p role="alert">Pot Club ordering is temporarily unavailable. Please retry shortly or contact the club.</p>}
 </div></section>;
}
