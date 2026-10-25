const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText, filename);

const { sceneGamma } = require('../src/utils/adaptiveGrade.ts');
const { findFrameMaterial } = require('../src/constants/frameVariants.ts');
const base = { contrast: 0.16, midShare: 0.4, highlightShare: 0.04, clipShare: 0,
  warmth: 0, tintBias: 0, saturation: 0.3, samples: 64 };
const night = { ...base, meanLuma: 0.22, shadowShare: 0.70, midShare: 0.26 };
const day = { ...base, meanLuma: 0.50, shadowShare: 0.20, midShare: 0.76 };
const dimPortrait = { ...base, meanLuma: 0.36, shadowShare: 0.54, midShare: 0.40 };
assert(sceneGamma(night) > 1, 'night scene must retain dark density');
assert(sceneGamma(dimPortrait) >= 1, 'dim portrait must not receive a second lift');
assert.equal(sceneGamma(day), 1, 'daylight stays unchanged');
assert.equal(sceneGamma(null), 1, 'missing scene stays neutral');

const graphite = findFrameMaterial('obsidian');
assert.equal(graphite.base, '#32312F');
assert.equal(graphite.dateColor, '#D5CAB6');
const patch = fs.readFileSync('patches/expo-camera+57.0.6.patch', 'utf8');
for (const marker of [
  'case .critical: target = 15',
  'case .serious: target = 24',
  'default: target = 30',
  'min(currentSeconds, 1.0 / 30.0)',
  'min(device.activeFormat.maxISO, 640)',
  'photoQualityPrioritization = .speed',
  'isAutoVirtualDeviceFusionEnabled = false',
  'restoreFilmExposure()',
]) assert(patch.includes(marker), `native capture safeguard missing: ${marker}`);
console.log('v2.5.1 camera exposure, night density and graphite stock checks passed');
