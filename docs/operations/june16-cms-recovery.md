# June 16 CMS content recovery runbook

## Scope
Restore CMS-backed public content that existed in a verified June 16 database/archive export without using incomplete runtime fallback constants as source data.

## Evidence requirements
Use only a Supabase export, backup, or archive captured on June 16. The restore script accepts a JSON object keyed by table name, for example:

```json
{
  "sponsors": [{ "name": "...", "tier": "...", "logo_url": "/images/...", "active": true }],
  "content_blocks": [{ "block_key": "about.hero", "title": "...", "body": "..." }]
}
```

Do not source missing content from `SEED_SPONSORS` or visible placeholders.

## Dry-run diagnostics

```bash
node scripts/restore/june16-cms-diagnostics.mjs
node scripts/restore/june16-cms-restore.mjs --evidence=private/june16-cms-export.json
```

The restore command defaults to dry-run mode and writes a current-data backup plus a summary under `backups/june16-cms-restore-*`.

## Apply

```bash
node scripts/restore/june16-cms-restore.mjs --evidence=private/june16-cms-export.json --apply=true
```

The apply path is idempotent. It inserts records missing by natural key and only fills current fields that are empty or invalid. It does not delete rows, truncate tables, deactivate rows, or overwrite newer populated values.

## Rollback path
Use the JSON files in the generated backup directory, or the reviewed SQL backup table from `supabase/recovery/june16_restore_reviewed.sql`, to restore only rows touched during apply. If a deployment-only rollback is needed, revert this commit and redeploy the previous Vercel build; database changes remain separate and must be rolled back from the backup export.
