npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

> ndcc-website@0.1.0 cms:diagnostics
> node scripts/restore/june16-cms-diagnostics.mjs

file:///workspace/ndcc-website/scripts/restore/june16-cms-diagnostics.mjs:9
if (!url || !serviceKey) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
                               ^

Error: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
    at file:///workspace/ndcc-website/scripts/restore/june16-cms-diagnostics.mjs:9:32
    at ModuleJob.run (node:internal/modules/esm/module_job:437:25)
    at async node:internal/modules/esm/loader:639:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)

Node.js v24.15.0
