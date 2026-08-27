import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync('app/api/admin/resources/[resource]/route.ts', 'utf8');
const button = readFileSync('components/admin/DeleteRecordButton.tsx', 'utf8');
const enquiries = readFileSync('app/admin/enquiries/page.tsx', 'utf8');
const volunteers = readFileSync('app/admin/volunteers/page.tsx', 'utf8');
const orders = readFileSync('app/admin/orders/page.tsx', 'utf8');
const events = readFileSync('app/admin/events/page.tsx', 'utf8');
const memberships = readFileSync('app/admin/memberships/page.tsx', 'utf8');
const kitchen = readFileSync('app/admin/kitchen/page.tsx', 'utf8');

assert.match(route, /Unknown resource[\s\S]*status: 404/, 'Unknown resource is rejected.');
assert.match(route, /Delete is disabled for this resource[\s\S]*status: 405/, 'Deletion disabled resources return 405.');
assert.match(route, /Your role cannot delete this record[\s\S]*status: 403/, 'Non-admin deletes are rejected for admin-only resources.');
assert.match(route, /authoriseResource\(params\.resource\)/, 'Unauthenticated requests go through the resource permission guard.');
assert.match(route, /delete\(\)\.eq\('id', id\)\.select\('id'\)/, 'Delete verifies selected id.');
assert.match(route, /rpc\('delete_test_order_atomic'/, 'Order deletion delegates all dependent cleanup to one transactional RPC.');
assert.match(route, /Record not found[\s\S]*status: 404/, 'Missing IDs return 404.');
assert.match(route, /status: 409/, 'Foreign-key conflicts return 409.');
assert.match(route, /data: \{ id: deleted\.id \}/, 'Successful delete returns deleted id.');

for (const resource of ['enquiries', 'volunteerExpressions', 'orders', 'eventRegistrations', 'membershipApplications', 'kitchenOrders']) {
  assert.match(route, new RegExp(`${resource}: \\{[^\\n]+deleteRoles: \\[\\'admin\\'\\]`), `${resource} delete is admin-only.`);
}

assert.match(button, /data\.user\?\.role === 'admin'/, 'Delete button is visible only for admins.');
assert.match(button, /setIsOpen\(true\)/, 'First click opens confirmation modal.');
assert.match(button, /variant="secondary"[\s\S]*Cancel/, 'Cancel button is present.');
assert.match(button, /method: 'DELETE'/, 'Confirm sends DELETE.');
assert.match(button, /deleteStartedRef/, 'Double-click duplicate submissions are blocked.');
assert.match(button, /typedConfirmation === 'DELETE'/, 'Strong confirmation requires DELETE.');
assert.match(button, /aria-busy=\{deleting\}/, 'Delete modal exposes busy state.');
assert.match(button, /parseApiResponse/, 'Delete control uses parseApiResponse.');

assert.match(enquiries, /resource="enquiries"/, 'Enquiries page can delete enquiries.');
assert.match(enquiries, /setSelectedContact\(\(current\) => \(current\?\.id === id \? null : current\)\)/, 'Deleting selected enquiry closes modal.');
assert.match(volunteers, /resource="volunteerExpressions"/, 'Volunteers page can delete EOIs.');
assert.match(orders, /resource="orders"/, 'Orders page can delete orders.');
assert.match(orders, /requireTypedConfirmation\s/, 'Every test-order deletion requires typed confirmation.');
assert.match(orders, /confirmationPhrase="DELETE TEST ORDER"/, 'Order deletion requires the dedicated strong confirmation phrase.');
assert.match(events, /resource="eventRegistrations"/, 'Event registrations can be deleted.');
assert.match(memberships, /resource="membershipApplications"/, 'Membership applications can be deleted.');
assert.match(kitchen, /resource="kitchenOrders"/, 'Kitchen orders can be deleted.');

assert.match(enquiries, /handleMarkResponded/, 'Existing enquiry responded action remains present.');
assert.match(volunteers, /handleMarkContacted/, 'Existing volunteer contacted action remains present.');
assert.match(orders, /handleRecordPayment/, 'Existing order payment action remains present.');
assert.match(orders, /handleSetProcessed/, 'Existing order processed action remains present.');

console.log('Admin delete structural tests passed. No production data was accessed or deleted.');
