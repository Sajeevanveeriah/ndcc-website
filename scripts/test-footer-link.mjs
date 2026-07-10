// Regression check: the footer credit must link to Saj's portfolio with safe
// new-tab semantics. Static source assertion so it runs without a browser.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'components/layout/Footer.tsx'), 'utf8');

const checks = [
  ['portfolio href', source.includes('href="https://sajeevanveeriah.github.io/"')],
  ['visible label', source.includes('Built by Sajeevan Veeriah')],
  ['new tab', source.includes('target="_blank"')],
  ['noopener noreferrer', source.includes('rel="noopener noreferrer"')],
  ['accessible label', source.includes('aria-label="Built by Sajeevan Veeriah')],
  ['no stale github profile link', !source.includes('https://github.com/Sajeevanveeriah')],
];

const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) {
  console.error(`Footer link regression check failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('Footer link regression check passed.');
