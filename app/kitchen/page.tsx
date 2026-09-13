import { loadPublicKitchenMenu } from '@/lib/public-kitchen';
import KitchenClient, { type KitchenItem } from './KitchenClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function KitchenPage() {
  const { menu, items } = await loadPublicKitchenMenu();
  return <KitchenClient initialMenuName={menu?.name || 'Kitchen Menu'} initialItems={items as KitchenItem[]} />;
}
