const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const cache = new Map();
let storedJson = null;
function loadTs(filename) {
  let file = filename.endsWith('.ts') ? filename : `${filename}.ts`;
  if (!fs.existsSync(file)) file = path.join(filename, 'index.ts');
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (specifier) => {
    if (specifier === '@react-native-async-storage/async-storage') {
      return { getItem: async () => storedJson, setItem: async () => {} };
    }
    return specifier.startsWith('.')
      ? loadTs(path.resolve(path.dirname(file), specifier))
      : require(specifier);
  };
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
  return module.exports;
}

const { computeWatermarkPlan, dateStampWidth } = loadTs(
  path.resolve(__dirname, '../src/utils/geometry.ts'),
);
const layout = {
  width: 358,
  height: 640,
  aspect: 358 / 640,
  window: { left: 20, top: 20, width: 318, height: 500 },
  bottomStripHeight: 120,
  rightMargin: 20,
};
const frame = { watermark: { anchor: 'frame', tone: 'amber', align: 'right' } };
const timestamp = {
  enabled: true,
  format: 'YY MM DD',
  color: '#ff8a00',
  fontSizeRatio: 0.03,
  letterSpacingRatio: 0.09,
  glow: false,
  fontWeight: '700',
  fontFamily: null,
  anchor: null,
  insetRatio: 0.04,
};
const plan = (size) => computeWatermarkPlan(
  layout, timestamp, frame, 'Paris', "10  17  '26", 'en',
  'split', '', 'quartz_led', 'auto', 'auto', size,
);
const small = plan('small');
const standard = plan('standard');
const large = plan('large');
assert.deepEqual(
  computeWatermarkPlan(layout, timestamp, frame, 'Paris', "10  17  '26", 'en'),
  standard,
  'legacy callers must retain standard size',
);

const date = (watermark) => watermark.lines.find((line) => line.kind === 'date').quartz;
const place = (watermark) => watermark.lines.find((line) => line.kind === 'place');
assert.ok(date(small).fontSize < date(standard).fontSize);
assert.ok(date(standard).fontSize < date(large).fontSize);
assert.ok(date(small).width < date(standard).width);
assert.ok(date(standard).width < date(large).width);
assert.equal(place(small).fontSize, place(standard).fontSize);
assert.equal(place(standard).fontSize, place(large).fontSize);
for (const watermark of [small, standard, large]) {
  const quartz = date(watermark);
  assert.equal(
    quartz.width,
    dateStampWidth(quartz.text, quartz.fontSize, quartz.letterSpacing, 0.5),
    'the fixed date box must match the rendered glyph size and spacing',
  );
}
async function checkStoredSettings() {
  storedJson = JSON.stringify({
    dateEngine: {
      format: 'CJK_KANJI', glyphStyle: 'lab_inkjet', spot: 'in_bl_v', glow: 'coral_red',
    },
    presetIntensity: 'rich',
  });
  const { loadSettings } = loadTs(path.resolve(__dirname, '../src/utils/settingsStore.ts'));
  const settings = await loadSettings();
  assert.equal(settings.dateEngine.size, 'standard');
  assert.equal(settings.dateEngine.format, 'CJK_KANJI');
  assert.equal(settings.dateEngine.spot, 'in_bl_v');
  assert.equal(settings.presetIntensity, 'rich');
  console.log('date size: geometry and legacy settings checks passed');
}

checkStoredSettings().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
