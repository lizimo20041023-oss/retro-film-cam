// Generate real JS reference pixels for the Swift engine; run in CI before Xcode.
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, file);
const { PRESETS, resolvePreset } = require('../src/constants/presets.ts');
const { getLutForStock } = require('../src/utils/lutAssets.ts');
const { renderFilmFrame, filmLookParamsFor, filmLookWithIntensity } = require('../src/utils/filmRender.ts');
const fixtures = [];
for (const preset of PRESETS) {
  for (const intensity of [0.35, 0.8, 1]) {
    const width = 19, height = 13;
    const input = Uint8Array.from({ length: width * height * 4 }, (_, i) => i % 4 === 3 ? 255 : (i * 47 + (i % 17) * 21) % 256);
    // Include a high-key field to exercise highlight mask and its boundaries.
    for (let i = 0; i < width * 5 * 4; i += 4) input.fill(250, i, i + 3);
    const overlay = intensity === 0.35 ? Uint8Array.from(input, (v, i) => i % 4 === 3 ? v : 255 - v) : null;
    const lut = getLutForStock(preset.id);
    const base = filmLookParamsFor(resolvePreset(preset));
    const params = filmLookWithIntensity({ ...base, gamma: intensity === 1 ? 1 : 0.94 }, intensity, preset.id);
    const expected = input.slice();
    renderFilmFrame(expected, width, height, { ...base, gamma: params.gamma, intensity,
      stockId: preset.id, lut, seed: 1234567, overlayRgba: overlay, overlayOpacity: 0.3 });
    fixtures.push({ id: `${preset.id}-${intensity}`, width, height, input: [...input],
      expected: [...expected], overlay: overlay ? [...overlay] : null, lut: [...lut.data], size: lut.size,
      params: { ...params, seed: 1234567, overlayOpacity: 0.3 } });
  }
}
fs.writeFileSync(process.argv[2], JSON.stringify(fixtures));
console.log(`Generated ${fixtures.length} Swift / JS reference fixtures`);
