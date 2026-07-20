#!/usr/bin/env node
// Database-backed tests for the gallery albums migration
// (20260720090000_gallery_albums_bulk_upload.sql).
//
// Run: npm run test:gallery-albums
// Requires a local postgres like the other migration tests (see
// scripts/lib/local-db.mjs). Applies the ENTIRE lineage so this doubles as a
// replay check for the new file.

import { readdirSync } from 'node:fs';
import { createTestDatabase, dropTestDatabase, applyMigrations, psql, check, finish, migrationsDir } from './lib/local-db.mjs';

const DB = 'ndcc_gallery_albums';
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
createTestDatabase(DB);
for (const f of files) applyMigrations(DB, [f]);

// Idempotency: the gallery migration must replay onto an existing database.
applyMigrations(DB, ['20260720090000_gallery_albums_bulk_upload.sql']);
check('gallery migration is idempotent (re-apply succeeds)', true, '');

// --- schema shape ------------------------------------------------------------
const albumCols = psql(DB, `select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema='public' and table_name='gallery_albums'`);
for (const col of ['id', 'title', 'slug', 'description', 'event_date', 'season_label', 'cover_image_url', 'sort_order', 'allow_download', 'published', 'publish_confirmed_at', 'publish_confirmed_by', 'created_at', 'updated_at']) {
  check(`gallery_albums has ${col}`, albumCols.includes(col), albumCols);
}
const imageCols = psql(DB, `select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema='public' and table_name='gallery_images'`);
for (const col of ['album_id', 'original_url', 'storage_path', 'original_filename', 'mime_type', 'file_size_bytes', 'width', 'height', 'content_hash', 'uploaded_at']) {
  check(`gallery_images has ${col}`, imageCols.includes(col), imageCols);
}

// --- legacy rows remain valid and published ----------------------------------
const legacy = psql(DB, `select count(*) from gallery_images where album_id is null and published`);
check('legacy seeded gallery images stay valid and ungrouped', Number(legacy) >= 4, legacy);

// --- album defaults + slug rules ---------------------------------------------
const inserted = psql(DB, `insert into gallery_albums (title, slug) values ('Finals Day', 'finals-day-2026') returning published, allow_download`);
check('new albums default to draft with downloads allowed', inserted === 'f\tt', inserted);
const badSlug = psql(DB, `insert into gallery_albums (title, slug) values ('Bad', 'Bad Slug!!')`, { expectFailure: true });
check('slug format constraint rejects invalid slugs', badSlug.failed === true, String(badSlug.message).slice(0, 120));
const dupSlug = psql(DB, `insert into gallery_albums (title, slug) values ('Dup', 'finals-day-2026')`, { expectFailure: true });
check('slug uniqueness enforced', dupSlug.failed === true, String(dupSlug.message).slice(0, 120));

// --- updated_at trigger ------------------------------------------------------
psql(DB, `update gallery_albums set title = 'Finals Day 2026' where slug = 'finals-day-2026'`);
const touched = psql(DB, `select (updated_at >= created_at) from gallery_albums where slug = 'finals-day-2026'`);
check('updated_at trigger fires on album update', touched === 't', touched);

// --- RLS: anon reads published albums only -----------------------------------
const rls = psql(DB, `select relrowsecurity from pg_class where oid = 'public.gallery_albums'::regclass`);
check('RLS enabled on gallery_albums', rls === 't', rls);
const policy = psql(DB, `select pg_get_expr(polqual, polrelid) from pg_policy where polrelid='public.gallery_albums'::regclass and polname='public_read_published_gallery_albums'`);
check('public read policy limits anon to published albums', policy.includes('published = true'), policy);

// --- FK preservation: deleting an album detaches, never deletes, images ------
const albumId = psql(DB, `select id from gallery_albums where slug = 'finals-day-2026'`);
psql(DB, `insert into gallery_images (title, image_url, album_id, storage_path, content_hash, published) values ('P1', 'https://example.supabase.co/p1.jpg', '${albumId}', 'albums/${albumId}/2026/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee-p1.jpg', 'abc123abc123abc123', true)`);
const dupHash = psql(DB, `insert into gallery_images (title, image_url, album_id, content_hash) values ('P1 dup', 'https://example.supabase.co/p1-dup.jpg', '${albumId}', 'abc123abc123abc123')`, { expectFailure: true });
check('duplicate content hash within one album is blocked', dupHash.failed === true, String(dupHash.message).slice(0, 120));
const dupPath = psql(DB, `insert into gallery_images (title, image_url, storage_path) values ('P1 path dup', 'https://example.supabase.co/x.jpg', 'albums/${albumId}/2026/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee-p1.jpg')`, { expectFailure: true });
check('storage_path uniqueness blocks object-row duplication', dupPath.failed === true, String(dupPath.message).slice(0, 120));
// same hash in a DIFFERENT album is allowed
psql(DB, `insert into gallery_albums (title, slug) values ('Other', 'other-album')`);
psql(DB, `insert into gallery_images (title, image_url, album_id, content_hash) select 'P1 elsewhere', 'https://example.supabase.co/p1.jpg', id, 'abc123abc123abc123' from gallery_albums where slug='other-album'`);
check('same photograph may appear in a different album', true, '');

psql(DB, `delete from gallery_albums where slug = 'finals-day-2026'`);
const orphaned = psql(DB, `select count(*), count(album_id) from gallery_images where title = 'P1'`);
check('album delete preserves image rows with album_id set null', orphaned === '1\t0', orphaned);

dropTestDatabase(DB);
finish('gallery-albums');
