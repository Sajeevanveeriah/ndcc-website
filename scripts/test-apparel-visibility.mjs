import { readFileSync } from 'node:fs';

const admin = readFileSync(new URL('../app/admin/apparel/page.tsx', import.meta.url), 'utf8');
const publicApi = readFileSync(new URL('../app/api/apparel/products/route.ts', import.meta.url), 'utf8');
const serverCatalogue = readFileSync(new URL('../lib/apparel/server-catalogue.ts', import.meta.url), 'utf8');
const checks = [
  ['CMS labels the field Visible on public website', admin.includes('Visible on public website')],
  ['CMS gives every product a Visible or Hidden badge', admin.includes("p.active ? 'Visible' : 'Hidden'")],
  ['CMS exposes Hide from website and Show on website actions', admin.includes("p.active ? 'Hide from website' : 'Show on website'")],
  ['CMS explains that hiding preserves order history', admin.includes('Hiding a product does not delete it or affect existing order history')],
  ['CMS distinguishes permanent deletion from hiding', admin.includes('Permanently delete') && admin.includes('use Hide from website instead')],
  ['CMS announces visibility feedback accessibly', admin.includes('aria-live="polite"') && admin.includes('role="status"')],
  ['public API only selects visible products', publicApi.includes(".eq('active', true)")],
  ['server-side order catalogue only selects visible products', serverCatalogue.includes(".eq('active', true)")],
];
let failed = 0;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${label}`);
  if (!pass) failed += 1;
}
if (failed) process.exit(1);
console.log(`Verified ${checks.length} apparel visibility safeguards.`);
