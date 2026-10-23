const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const locales = ['zh-Hans', 'zh-Hant', 'en', 'ja', 'fr'];
const messages = {};
for (const locale of locales) {
  const file = path.join(__dirname, '../src/i18n/locales', `${locale}.ts`);
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const seen = new Set();
  function visit(node) {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) {
      assert(!seen.has(node.name.text), `${locale}: duplicate ${node.name.text}`);
      seen.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const m = { exports: {} };
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('module','exports',output)(m,m.exports);
  messages[locale] = Object.values(m.exports).find(value => value && typeof value === 'object');
  assert(messages[locale], `Missing messages: ${locale}`);
}
const keys = Object.keys(messages['zh-Hans']).sort();
for (const locale of locales) {
  assert.deepEqual(Object.keys(messages[locale]).sort(), keys, `${locale}: key mismatch`);
  for (const key of keys) {
    const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
    assert.deepEqual(placeholders(messages[locale][key]), placeholders(messages['zh-Hans'][key]), `${locale}: ${key} placeholders`);
  }
}
console.log(`i18n: ${keys.length} keys, ${locales.length} languages; keys, duplicates and placeholders passed`);
