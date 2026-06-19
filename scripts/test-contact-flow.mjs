#!/usr/bin/env node
const baseUrl = (process.env.SMOKE_BASE_URL || process.env.CONTACT_TEST_BASE_URL || '').replace(/\/$/, '');
if (!baseUrl) {
  console.log('Contact flow structural test only. Set SMOKE_BASE_URL to exercise the live API.');
  process.exit(0);
}

const payload = {
  name: 'NDCC Contact Flow Test',
  email: process.env.NDCC_TEST_EMAIL_TO || 'test@example.com',
  enquiry_type: 'general',
  message: 'Automated contact flow closeout test. This is test-only content.',
  hp_field: '',
  submitted_at: Date.now() - 5000,
};

const response = await fetch(`${baseUrl}/api/contacts`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
const data = await response.json().catch(() => null);
if (!data || typeof data !== 'object' || !('dbStatus' in data) || !('emailStatus' in data)) {
  console.error(`Contact API returned an unstructured response with HTTP ${response.status}.`);
  process.exit(1);
}
if (response.status >= 500 && data.emailStatus === undefined) {
  console.error('Contact API returned unstructured 5xx response.');
  process.exit(1);
}
console.log(`Contact flow response structured: HTTP ${response.status}; dbStatus=${data.dbStatus}; emailStatus=${data.emailStatus}.`);
if (!response.ok && response.status !== 202 && response.status !== 503) process.exit(1);
