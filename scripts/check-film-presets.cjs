// Run with `node scripts/check-film-presets.cjs` to check all shipped stocks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const root = path.join(__dirname, '..', 'src');
const { PRESETS, resolvePreset, findPresetIndex } = require(path.join(root, 'constants/presets.ts'));
const { LUT_STOCK_IDS } = require(path.join(root, 'constants/filmRender.ts'));
const { hasLutForStock, getLutForStock } = require(path.join(root, 'utils/lutAssets.ts'));
const { sampleLut3D } = require(path.join(root, 'utils/lut3d.ts'));
const { planFilmLooks } = require(path.join(root, 'utils/gradeLayers.ts'));
const { recommendStockAndIntensity } = require(path.join(root, 'utils/sceneMatch.ts'));

assert.equal(PRESETS.length, 11, 'expected 11 selectable film stocks');
assert.deepEqual(PRESETS.map(({ id }) => id), [...LUT_STOCK_IDS]);
assert(!PRESETS.some(({ id }) => id === 'fj-400' || id === 'tx-400'), 'retired stocks remain selectable');
assert.equal(PRESETS[findPresetIndex('fj-400')].id, 'fg-400');
assert.equal(PRESETS[findPresetIndex('tx-400')].id, 'hp-400');
assert.equal(PRESETS[findPresetIndex('nz-400')].id, 'fg-400');
assert.equal(PRESETS[findPresetIndex('sl-400-bw')].id, 'hp-400');

const luts = {};
for (const preset of PRESETS) {
  assert(hasLutForStock(preset.id), `${preset.id}: missing LUT atlas`);
  const lut = getLutForStock(preset.id);
  assert(lut, `${preset.id}: LUT could not be decoded and baked`);
  luts[preset.id] = lut;

  const selected = recommendStockAndIntensity(null, {
    stockMode: 'manual', manualStockId: preset.id, intensityTier: 'auto',
  });
  assert.equal(selected.stockId, preset.id, `${preset.id}: manual stock was replaced`);

  const live = planFilmLooks(resolvePreset(preset), 'live');
  assert.equal(live.filter(({ kind }) => kind === 'photo').length, 0, `${preset.id}: live photo layer`);
  assert.equal(live.filter(({ textureId }) => textureId === 'grain').length, 0, `${preset.id}: live grain layer`);
  const colorLayers = live.filter(({ kind }) => kind === 'color');
  assert(colorLayers.length <= 1, `${preset.id}: more than one live color layer`);
  if (!preset.mono) assert.equal(colorLayers[0]?.key, 'live-stock-dye', `${preset.id}: no live stock cue`);
  for (const layer of colorLayers) {
    assert.match(layer.color, /^#[0-9a-f]{6}$/i, `${preset.id}: malformed live color`);
  }
  console.log(`${preset.id}: LUT, manual choice, live layer color OK`);
}

const skin = [205, 160, 135];
const sky = [72, 125, 202];
const foliage = [53, 111, 67];
const sample = (id, rgb) => sampleLut3D(luts[id], ...rgb);
for (const id of ['fg-400', 'rb-100', 'dc-200', 'mt-500']) {
  const result = sample(id, skin);
  assert(result[0] > result[1] && result[1] > result[2], `${id}: warm skin hue reversed`);
  const gray = sample(id, [128, 128, 128]);
  assert(Math.max(...gray) - Math.min(...gray) <= 8, `${id}: neutral midgray strongly tinted`);
  console.log(`${id} synthetic skin ${JSON.stringify(skin)} -> ${JSON.stringify(result)}`);
  console.log(`${id} neutral gray -> ${JSON.stringify(gray)}`);
}
const compare = (a, b) => a.reduce((sum, channel, i) => sum + Math.abs(channel - b[i]), 0) / 3;
console.log(`foliage FG ${JSON.stringify(sample('fg-400', foliage))}, DC ${JSON.stringify(sample('dc-200', foliage))}`);
console.log(`sky RB ${JSON.stringify(sample('rb-100', sky))}, EK ${JSON.stringify(sample('ek-100', sky))}, CS ${JSON.stringify(sample('cs-800t', sky))}`);
assert(compare(sample('fg-400', foliage), sample('dc-200', foliage)) > 5, 'green and documentary looks are too similar');
assert(compare(sample('rb-100', sky), sample('ek-100', sky)) > 8, 'Ricoh Blue too similar to EK sky');
assert(compare(sample('rb-100', sky), sample('cs-800t', sky)) > 8, 'Ricoh Blue too similar to CS sky');
assert(compare(sample('dc-200', skin), sample('mt-500', skin)) > 5, 'new looks are too similar on skin');
assert(compare(sample('dc-200', sky), sample('mt-500', sky)) > 5, 'new looks are too similar on sky');
console.log('11 film preset checks passed');
