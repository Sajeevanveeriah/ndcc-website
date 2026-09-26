const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const {act, create} = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

function component(file, fetch) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022},
  }).outputText, {exports, fetch, require, console});
  return exports.default;
}
const text = tree => JSON.stringify(tree.toJSON());
(async () => {
  let saved = false, unavailable = false, writes = [];
  const Choice = component('components/payments/BankTransferChoice.tsx', async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.action === 'read') return {ok:true, json:async()=>({selected:saved})};
    writes.push(body);
    if (unavailable) return {ok:false, json:async()=>({error:'Please retry your selection.'})};
    saved = body.selected;
    return {ok:true, json:async()=>({selected:saved,message:'Selection saved; receipt unconfirmed.'})};
  });
  let tree;
  const props = {orderId:'order-one',email:'buyer@example.invalid'};
  await act(async()=>{tree=create(React.createElement(Choice,props));});
  assert.equal(tree.root.findByType('input').props.checked,false);
  await act(async()=>tree.root.findByType('input').props.onChange({target:{checked:true}}));
  assert.equal(tree.root.findByType('input').props.checked,true);
  assert.equal(writes[0].order_id,'order-one');
  assert.equal(writes[0].email,props.email);
  assert.equal(writes[0].selected,true);
  assert.match(text(tree),/receipt unconfirmed/);
  await act(async()=>tree.unmount());
  await act(async()=>{tree=create(React.createElement(Choice,props));});
  assert.equal(tree.root.findByType('input').props.checked,true,'choice survives remount');
  unavailable=true;
  await act(async()=>tree.root.findByType('input').props.onChange({target:{checked:false}}));
  assert.equal(tree.root.findByType('input').props.checked,true,'failed write must not pretend to save');
  assert.match(text(tree),/Please retry/);
  unavailable=false;
  await act(async()=>tree.root.findByType('input').props.onChange({target:{checked:false}}));
  assert.equal(tree.root.findByType('input').props.checked,false);
  await act(async()=>tree.unmount());
  await act(async()=>{tree=create(React.createElement(Choice,{orderId:'order-one',balanceToken:'private-link'}));});
  await act(async()=>tree.root.findByType('input').props.onChange({target:{checked:true}}));
  assert.equal(writes.at(-1).token,'private-link');
  assert.equal(writes.at(-1).email,undefined);
  await act(async()=>tree.unmount());

  let caps={card:true,bank_transfer:true}, method='stripe';
  const Method = component('components/payments/PaymentMethodChoice.tsx',async()=>({ok:true,json:async()=>({data:caps})}));
  await act(async()=>{tree=create(React.createElement(Method,{method,onChange:value=>{method=value;}}));});
  await act(async()=>tree.root.findByType('input').props.onChange({target:{checked:true}}));
  assert.equal(method,'bank_transfer');
  await act(async()=>tree.unmount());
  caps={card:false,bank_transfer:true};method='stripe';
  await act(async()=>{tree=create(React.createElement(Method,{method,onChange:value=>{method=value;}}));});
  assert.equal(method,'bank_transfer');
  assert.equal(tree.root.findByType('input').props.disabled,true);
  await act(async()=>tree.unmount());
  caps={card:true,bank_transfer:false};
  await act(async()=>{tree=create(React.createElement(Method,{method:'stripe',onChange:()=>{}}));});
  assert.equal(tree.root.findAllByType('input').length,0);
  await act(async()=>tree.unmount());
  console.log('PASS bank selection UI: persistence, untick, failed-save recovery, private links and configured methods. No payments or messages sent.');
})().catch(error=>{console.error(error);process.exitCode=1;});
