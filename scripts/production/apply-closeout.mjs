#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const execute = process.argv.includes('--execute');
const confirm = process.argv.includes('--confirm-production');
function run(cmd, args) { console.log(`> ${cmd} ${args.join(' ')}`); const res = spawnSync(cmd, args, { stdio: 'inherit', env: process.env }); if (res.status) process.exit(res.status); }
console.log(`NDCC production closeout runner (${execute && confirm ? 'execute' : 'dry-run'}). Secrets will not be printed.`);
run('npm', ['run', 'admin:provision-users', '--', '--diagnostics']);
run('npm', ['run', 'production:upsert-sponsors', '--', ...(execute && confirm ? ['--execute'] : [])]);
console.log('Closeout runner finished. User provisioning writes require running admin:provision-users with --only=<key> --execute and env-only password.');
