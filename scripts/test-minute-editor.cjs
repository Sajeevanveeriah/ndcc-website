const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
const row = { id: 'saved', title: 'Saved minutes', meeting_date: '2026-09-21', status: 'draft', content: '', attachment_name: 'existing.pdf' };
let fail = false, requests = [], draftCleared = 0;
const imports = {
  react: React,
  'react/jsx-runtime': require('react/jsx-runtime'),
  '@/components/ui/Input': { default: props => React.createElement('input', props), Textarea: props => React.createElement('textarea', props) },
  '@/components/ui/Button': { default: props => React.createElement('button', props) },
  '@/lib/meeting-minute-files': { MINUTE_FILE_ACCEPT: '.pdf,.doc,.docx', MINUTE_FILE_LIMIT: 4194304, minuteFileType: name => /\.(pdf|doc|docx)$/i.test(name) },
  '@/lib/admin-client': { parseApiResponse: async response => response.json() },
  // Draft autosave/unsaved-change hooks are covered by scripts/test-admin-drafts.mjs.
  '@/components/admin/DraftRestorePrompt': { default: () => null },
  '@/components/admin/useDraftAutosave': { useDraftAutosave: () => ({ dirty: false, pendingDraft: null, restoreDraft: () => null, discardDraft() {}, clearDraft() { draftCleared += 1; } }) },
  '@/components/admin/useUnsavedChangesGuard': { useUnsavedChangesGuard() {} },
};
const exports1 = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/admin/minutes/page.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: exports1, require: name => imports[name], FormData, Error,
  fetch: async (_url, options) => { if (options?.method) { requests.push(options); if (fail) throw new Error('Network unavailable'); return { json: async () => ({ success: true }) }; } return { json: async () => ({ minutes: [row] }) }; }
});
(async () => {
 let view;
 await act(async () => { view = create(React.createElement(exports1.default)); });
 const input = id => view.root.findByProps({ id });
 const button = text => view.root.findAllByType('button').find(node => node.props.children === text);
 assert(input('minutes-file')); assert.equal(input('content').props.required, true);
 await act(async () => button('Edit').props.onClick());
 assert.equal(input('content').props.required, false);
 assert(view.root.findAllByType('a').some(a => a.props.href === '/api/meeting-minutes/saved/document'));
 fail = true;
 await act(async () => view.root.findByType('form').props.onSubmit({ preventDefault() {} }));
 assert.equal(view.root.findByType('fieldset').props.disabled, false);
 assert.equal(input('title').props.value, row.title);
 assert.equal(view.root.findByProps({ role: 'status' }).props.children, 'Network unavailable');
 fail = false;
 await act(async () => button('Remove attachment').props.onClick());
 assert.equal(input('content').props.required, true);
 await act(async () => button('Undo').props.onClick());
 assert.equal(input('content').props.required, false);
 await act(async () => button('Cancel editing').props.onClick());
 assert.equal(input('title').props.value, '');
 await act(async () => input('content').props.onChange({ target: { value: 'Typed minutes' } }));
 await act(async () => input('title').props.onChange({ target: { value: 'Typed meeting' } }));
 await act(async () => input('meeting_date').props.onChange({ target: { value: '2026-09-21' } }));
 await act(async () => view.root.findByType('form').props.onSubmit({ preventDefault() {} }));
 assert.equal(requests.at(-1).body.get('content'), 'Typed minutes');
 assert.equal(requests.at(-1).headers['X-NDCC-CSRF'], '1');
 assert.equal(input('content').props.value, '');
 assert.equal(draftCleared, 1, 'local draft is cleared only after a successful save');
 console.log('PASS rendered editor: file input, attachment edit/download, required text, remove/undo, cancel, network recovery and typed save/reset');
})().catch(error => { console.error(error); process.exit(1); });
