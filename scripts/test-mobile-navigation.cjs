const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const exportsObject = {};
const listeners = {}, keys = {};
const windowStub = { scrollY: 0, localStorage: { getItem: () => null }, addEventListener: (name, cb) => { listeners[name] = cb; }, removeEventListener: name => { delete listeners[name]; } };
const documentStub = { body: { style: { overflow: 'auto' } }, addEventListener: (name, cb) => { keys[name] = cb; }, removeEventListener: name => { delete keys[name]; } };
const passthrough = ({ children }) => children;
const dependencies = {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': { default: props => React.createElement('a', props) },
  'next/image': { default: props => React.createElement('img', props) },
  'next/navigation': { usePathname: () => '/fantasy/players' },
  'framer-motion': { LazyMotion: passthrough, AnimatePresence: passthrough, domAnimation: {}, m: { div: 'div' }, useReducedMotion: () => true },
  'lucide-react': Object.fromEntries(['Menu', 'X', 'ChevronDown', 'UserRound'].map(name => [name, () => null])),
  '@/components/common/CookieDoughVisibility': { useCookieDoughOpen: () => false },
  '@/lib/cookie-dough': { isCookieDoughLink: href => href.includes('cookie-dough') },
  '@/lib/club-settings-types': { fallbackClubSettings: {} },
  '@/lib/utils': { cn: (...parts) => parts.filter(Boolean).join(' ') },
  '@/components/common/ThemeToggle': { default: () => null },
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/layout/Navbar.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsObject, window: windowStub, document: documentStub, console, require(name) {
  assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name];
} });
(async () => {
  let tree;
  await act(async () => { tree = create(React.createElement(exportsObject.default, { nav: { settings: { club_short: 'NDCC' }, headerLinks: [], dinoCoachPublic: true, rafflePublic: true, reverseRafflePublic: true } })); });
  assert.equal(tree.root.findByType('nav').findByProps({ href: '/club-account' }).type, dependencies['next/link'].default);
  for (const scrollY of [0, 800, 2400]) {
    windowStub.scrollY = scrollY;
    await act(async () => listeners.scroll());
    if (scrollY) assert.match(tree.root.findByType('nav').props.className, /backdrop-blur/);
    await act(async () => tree.root.findByProps({ 'aria-label': 'Open menu' }).props.onClick());
    const menu = tree.root.findByProps({ role: 'dialog' });
    assert.equal(menu.props.id, 'mobile-site-menu');
    assert.equal(documentStub.body.style.overflow, 'hidden');
    assert.ok(menu.findAllByProps({ href: '/pot-club' }).length);
    assert.ok(menu.findAllByProps({ href: '/club-account' }).length);
    // A filtered/transformed ancestor changes the containing block of fixed overlays.
    for (let parent = menu.parent; parent; parent = parent.parent) {
      assert.notEqual(parent.type, 'nav', 'Scrolled header must never contain the full-screen overlay');
      if (typeof parent.type === 'string') assert.doesNotMatch(parent.props.className || '', /backdrop-|transform|overflow-hidden/);
    }
    await act(async () => keys.keydown({ key: 'Escape' }));
    assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 0);
    assert.equal(documentStub.body.style.overflow, 'auto');
  }
  await act(async () => tree.unmount());
  assert.equal(listeners.scroll, undefined);
  console.log('PASS My Account top link and mobile menu opening at top/scrolled positions, viewport ancestry, Escape and scroll-lock cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
