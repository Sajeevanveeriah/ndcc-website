#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const execute = process.argv.includes('--execute');
const confirm = process.argv.includes('--confirm-production');
function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { stdio: 'inherit', env: process.env });
  if (res.status) process.exit(res.status);
}
console.log(`NDCC production closeout runner (${execute && confirm ? 'execute' : 'dry-run'}). Secrets will not be printed.`);
run('npm', ['run', 'admin:provision-users', '--', '--diagnostics']);
run('npm', ['run', 'production:upsert-sponsors', '--', ...(execute && confirm ? ['--execute'] : [])]);
if (execute && confirm) {
  run('npm', ['run', 'admin:provision-users', '--', '--execute']);
} else {
  run('npm', ['run', 'admin:provision-users', '--']);
}
if (process.env.AUTH_TEST_BASE_URL && process.env.AUTH_TEST_EMAIL && process.env.AUTH_TEST_PASSWORD) {
  run('npm', ['run', 'test:admin-login']);
} else {
  console.log('Skipping login verification: AUTH_TEST_BASE_URL, AUTH_TEST_EMAIL, and AUTH_TEST_PASSWORD are required.');
}
console.log('Closeout runner finished. Provisioning writes require --execute --confirm-production and env-only temporary password variables.');
