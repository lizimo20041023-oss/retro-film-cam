// Focused Node regression check for the pure pixel renderer. No native modules needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const cache = new Map();
function loadTs(filename) {
  const file = filename.endsWith('.ts') ? filename : `${filename}.ts`;
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) return require(specifier);
    return loadTs(path.resolve(path.dirname(file), specifier));
  };
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
  return module.exports;
}

const { renderFilmFrame } = loadTs(path.resolve(__dirname, '../src/utils/filmRender.ts'));
const { planPhotoCrop } = loadTs(path.resolve(__dirname, '../src/utils/cameraGeometry.ts'));
function develop(opacity, gamma = 1) {
  const base = new Uint8Array([20, 40, 60, 255]);
  renderFilmFrame(base, 1, 1, {
    lut: null, halation: 0, vignette: 0, grain: 0, seed: 1,
    gamma, intensity: 1,
    overlayRgba: new Uint8Array([220, 140, 100, 255]),
    overlayOpacity: opacity,
  });
  return [...base];
}

assert.deepEqual(develop(0), [20, 40, 60, 255]);
assert.deepEqual(develop(0.5), [120, 90, 80, 255]);
assert.deepEqual(develop(1), [220, 140, 100, 255]);
// Gamma must act on the mixed exposure, never on each photo separately.
const gammaInput = new Uint8Array([0, 0, 0, 255]);
renderFilmFrame(gammaInput, 1, 1, {
  lut: null, halation: 0, vignette: 0, grain: 0, seed: 1,
  gamma: 2, intensity: 1,
  overlayRgba: new Uint8Array([255, 255, 255, 255]), overlayOpacity: 0.5,
});
assert.deepEqual([...gammaInput], [64, 64, 64, 255]);
assert.throws(() => renderFilmFrame(new Uint8Array(4), 1, 1, {
  lut: null, halation: 0, vignette: 0, grain: 0, seed: 1,
  overlayRgba: new Uint8Array(8),
}), /尺寸不匹配/);

// Cover mode crops each camera shot to the same window ratio before the shared resize.
// The two shutter presses can use different digital zoom factors without stretching.
const secondCrop = planPhotoCrop({ width: 3000, height: 4000 }, 1, 1);
const firstCrop = planPhotoCrop({ width: 2250, height: 3000 }, 1, 2);
assert.equal(secondCrop.width / secondCrop.height, 1);
assert.equal(firstCrop.width / firstCrop.height, 1);
const aligned = new Uint8Array([20, 40, 60, 255, 10, 30, 50, 255]);
renderFilmFrame(aligned, 2, 1, {
  lut: null, halation: 0, vignette: 0, grain: 0, seed: 1,
  overlayRgba: new Uint8Array([220, 140, 100, 255, 110, 130, 150, 255]),
  overlayOpacity: 0.5,
});
assert.deepEqual([...aligned], [120, 90, 80, 255, 60, 80, 100, 255]);

console.log('film overlay: 8 checks passed');
