#!/usr/bin/env node
// Admin editor draft recovery: useDraftAutosave + useUnsavedChangesGuard
// behaviour (rendered with react-test-renderer against a fake window), and
// wiring into the news, publications, meeting minutes and events editors.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');

function createFakeWindow({ storageThrows = false } = {}) {
  const store = new Map();
  const listeners = new Map();
  return {
    store,
    listeners,
    localStorage: {
      getItem(key) { if (storageThrows) throw new Error('blocked'); return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { if (storageThrows) throw new Error('blocked'); store.set(key, String(value)); },
      removeItem(key) { if (storageThrows) throw new Error('blocked'); store.delete(key); },
    },
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); return true; },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
  };
}

function loadModule(file, fakeWindow) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: (name) => (name === 'react' ? React : require(name)), window: fakeWindow, JSON, Date, Error });
  return module.exports;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

async function renderHook(fakeWindow, initialProps) {
  const { useDraftAutosave, ADMIN_BEFORE_LOGOUT_EVENT } = loadModule('components/admin/useDraftAutosave.ts', fakeWindow);
  const result = { current: null };
  function Harness(props) {
    result.current = useDraftAutosave(props);
    return null;
  }
  let view;
  await act(async () => { view = create(React.createElement(Harness, initialProps)); });
  const rerender = async (props) => act(async () => view.update(React.createElement(Harness, props)));
  return { result, rerender, ADMIN_BEFORE_LOGOUT_EVENT, unmount: () => act(async () => view.unmount()) };
}

await test('autosaves a dirty editor after the debounce and clears on save', async () => {
  const win = createFakeWindow();
  const base = { editor: 'news', recordId: 'abc', active: true };
  const hook = await renderHook(win, { ...base, value: { title: 'Loaded' } });
  assert.equal(hook.result.current.dirty, false);
  await hook.rerender({ ...base, value: { title: 'Edited' } });
  assert.equal(hook.result.current.dirty, true);
  assert.equal(win.store.size, 0, 'not written before the debounce');
  await act(async () => { await sleep(1_100); });
  const stored = JSON.parse(win.store.get('ndcc-admin-draft:news:abc'));
  assert.deepEqual(stored.value, { title: 'Edited' });
  await act(async () => hook.result.current.clearDraft());
  assert.equal(win.store.has('ndcc-admin-draft:news:abc'), false);
  await hook.unmount();
});

await test('offers a stored draft when the editor reopens and restores it', async () => {
  const win = createFakeWindow();
  win.store.set('ndcc-admin-draft:events:new', JSON.stringify({ version: 1, savedAt: new Date().toISOString(), value: { title: 'Unsaved' } }));
  const hook = await renderHook(win, { editor: 'events', recordId: null, active: false, value: { title: '' } });
  assert.equal(hook.result.current.pendingDraft, null, 'closed editors do not prompt');
  await hook.rerender({ editor: 'events', recordId: null, active: true, value: { title: '' } });
  assert.equal(hook.result.current.pendingDraft?.value.title, 'Unsaved');
  let restored;
  await act(async () => { restored = hook.result.current.restoreDraft(); });
  assert.deepEqual(restored, { title: 'Unsaved' });
  assert.equal(hook.result.current.pendingDraft, null);
  await hook.unmount();
});

await test('discard removes the stored draft; drafts are keyed per record', async () => {
  const win = createFakeWindow();
  win.store.set('ndcc-admin-draft:publications:one', JSON.stringify({ version: 1, savedAt: new Date().toISOString(), value: { title: 'Draft one' } }));
  const hook = await renderHook(win, { editor: 'publications', recordId: 'two', active: true, value: { title: 'Two' } });
  assert.equal(hook.result.current.pendingDraft, null, 'another record draft is not offered');
  await hook.rerender({ editor: 'publications', recordId: 'one', active: true, value: { title: 'One' } });
  assert.equal(hook.result.current.pendingDraft?.value.title, 'Draft one');
  await act(async () => hook.result.current.discardDraft());
  assert.equal(win.store.has('ndcc-admin-draft:publications:one'), false);
  await hook.unmount();
});

await test('flushes immediately before an inactivity sign-out', async () => {
  const win = createFakeWindow();
  const base = { editor: 'meeting-minutes', recordId: 'm1', active: true };
  const hook = await renderHook(win, { ...base, value: { content: '' } });
  await hook.rerender({ ...base, value: { content: 'Typed minutes' } });
  win.dispatchEvent({ type: hook.ADMIN_BEFORE_LOGOUT_EVENT });
  assert.deepEqual(JSON.parse(win.store.get('ndcc-admin-draft:meeting-minutes:m1')).value, { content: 'Typed minutes' });
  await hook.unmount();
});

await test('blocked localStorage never breaks editing', async () => {
  const win = createFakeWindow({ storageThrows: true });
  const base = { editor: 'news', recordId: null, active: true };
  const hook = await renderHook(win, { ...base, value: { title: '' } });
  await hook.rerender({ ...base, value: { title: 'x' } });
  win.dispatchEvent({ type: hook.ADMIN_BEFORE_LOGOUT_EVENT });
  await act(async () => { await sleep(1_100); });
  await act(async () => hook.result.current.clearDraft());
  assert.equal(hook.result.current.dirty, false);
  await hook.unmount();
});

await test('unsaved-changes guard registers beforeunload only while dirty', async () => {
  const win = createFakeWindow();
  const { useUnsavedChangesGuard } = loadModule('components/admin/useUnsavedChangesGuard.ts', win);
  function Harness({ dirty }) { useUnsavedChangesGuard(dirty); return null; }
  let view;
  await act(async () => { view = create(React.createElement(Harness, { dirty: false })); });
  assert.equal(win.listeners.get('beforeunload')?.size ?? 0, 0);
  await act(async () => view.update(React.createElement(Harness, { dirty: true })));
  assert.equal(win.listeners.get('beforeunload').size, 1);
  const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, returnValue: undefined };
  for (const fn of win.listeners.get('beforeunload')) fn(event);
  assert.equal(event.defaultPrevented, true);
  await act(async () => view.update(React.createElement(Harness, { dirty: false })));
  assert.equal(win.listeners.get('beforeunload').size, 0);
  await act(async () => view.unmount());
});

await test('editors and the inactivity guard are wired to draft recovery', async () => {
  for (const [file, editor] of [
    ['app/admin/news/page.tsx', 'news'],
    ['app/admin/publications/page.tsx', 'publications'],
    ['app/admin/minutes/page.tsx', 'meeting-minutes'],
    ['app/admin/events/page.tsx', 'events'],
  ]) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, new RegExp(`useDraftAutosave\\(\\{ editor: '${editor}'`), `${file} autosaves drafts`);
    assert.match(source, /useUnsavedChangesGuard\(/, `${file} warns before unload`);
    assert.match(source, /draft\.clearDraft\(\)/, `${file} clears the draft after saving`);
    assert.match(source, /<DraftRestorePrompt /, `${file} offers draft restore`);
  }
  const guard = readFileSync('components/admin/InactivityGuard.tsx', 'utf8');
  assert.match(guard, /saveDraftsBeforeLogout\(\);\s*onLogout\(\);/);
});

console.log(`Admin draft recovery tests passed (${passed} checks).`);
