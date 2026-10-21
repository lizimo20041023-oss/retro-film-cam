// Focused regression check for overseas reverse-geocode parsing. No device or live network is needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const state = { responses: [], calls: 0 };
const emptyAddress = {
  city: null,
  district: null,
  streetNumber: null,
  street: null,
  region: null,
  subregion: null,
  country: null,
  postalCode: null,
  name: null,
  isoCountryCode: null,
  timezone: null,
  formattedAddress: null,
};
const paris = {
  ...emptyAddress,
  city: 'Paris',
  region: 'Île-de-France',
  country: 'France',
  isoCountryCode: 'FR',
  formattedAddress: 'Paris, Île-de-France, France',
};
const native = {
  'expo-location': {
    async reverseGeocodeAsync() {
      state.calls += 1;
      return state.responses.shift() ?? [];
    },
  },
};

let photonCalls = 0;
global.fetch = async (url) => {
  photonCalls += 1;
  assert.match(String(url), /^https:\/\/photon\.komoot\.io\/reverse\?/);
  return {
    ok: true,
    async json() {
      return {
        features: [
          {
            properties: {
              name: 'Paris',
              city: 'Paris',
              state: 'Île-de-France',
              country: 'France',
              countrycode: 'FR',
            },
          },
        ],
      };
    },
  };
};

const modules = new Map();
function loadTs(filename) {
  const file = filename.endsWith('.ts') ? filename : `${filename}.ts`;
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} };
  modules.set(file, module);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (name) => name.startsWith('.')
    ? loadTs(path.resolve(path.dirname(file), name))
    : native[name] ?? require(name);
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
  return module.exports;
}

const placeNames = loadTs(path.resolve(__dirname, '../src/utils/placeNames.ts'));
const locationStamp = loadTs(path.resolve(__dirname, '../src/utils/locationStamp.ts'));

// Android overseas results may expose only formattedAddress.
const formattedOnly = placeNames.resolvePlaceFromGeocode(
  { formattedAddress: 'Reykjavík, Capital Region, Iceland', isoCountryCode: 'IS' },
  64.1466,
  -21.9426,
);
assert.equal(formattedOnly.city, 'Reykjavík, Capital Region, Iceland');
assert.notEqual(placeNames.formatResolvedPlace(formattedOnly, 'zh-Hans', 'archive'), formattedOnly.coords);

// Countries outside the app's old hand-maintained table must still render instead of becoming coords.
const croatia = placeNames.resolvePlaceFromGeocode(
  { city: 'Dubrovnik', region: 'Dubrovnik-Neretva', country: 'Croatia', isoCountryCode: 'HR' },
  42.6507,
  18.0944,
);
const croatiaZh = placeNames.formatResolvedPlace(croatia, 'zh-Hans', 'full');
assert.match(croatiaZh, /Dubrovnik/);
assert.doesNotMatch(croatiaZh, /Dubrovnik市|Dubrovnik-Neretva省/);
assert.notEqual(croatiaZh, croatia.coords);

const countryOnly = placeNames.resolvePlaceFromGeocode(
  { country: 'Croatia', isoCountryCode: 'HR' },
  44.5,
  16.5,
);
assert.notEqual(placeNames.formatResolvedPlace(countryOnly, 'zh-Hans', 'archive'), countryOnly.coords);

async function main() {
  // The first reverse-geocode item can be empty while a later item contains the locality.
  state.responses = [[{ ...emptyAddress, postalCode: '75001' }, paris]];
  state.calls = 0;
  const best = await locationStamp.reverseGeocodeWithRetry({ latitude: 48.8566, longitude: 2.3522 });
  assert.equal(best.status, 'ok');
  assert.equal(best.address.city, 'Paris');
  assert.equal(state.calls, 1);

  // A native empty result falls back to Photon and returns a real place, not raw coordinates.
  state.responses = [[]];
  state.calls = 0;
  photonCalls = 0;
  const fallback = await locationStamp.resolvePlaceFromCoords(
    { latitude: 48.8566, longitude: 2.3522 },
    'en',
    'en',
  );
  assert.equal(fallback.status, 'ok');
  assert.equal(fallback.channel, 'photon');
  assert.equal(fallback.place.city, 'Paris');
  assert.equal(fallback.place.countryCode, 'FR');
  assert.equal(state.calls, 1);
  assert.equal(photonCalls, 1);

  // Nearby duplicate work reuses the rounded-coordinate cache and does not hit the service again.
  state.responses = [[]];
  const cached = await locationStamp.resolvePlaceFromCoords(
    { latitude: 48.85661, longitude: 2.35221 },
    'en',
    'en',
  );
  assert.equal(cached.status, 'ok');
  assert.equal(cached.channel, 'photon');
  assert.equal(photonCalls, 1);

  // A fast native result wins without starting an external request.
  state.responses = [[paris]];
  const nativeResult = await locationStamp.resolvePlaceFromCoords(
    { latitude: 48.8577, longitude: 2.3533 },
    'en',
    'en',
  );
  assert.equal(nativeResult.status, 'ok');
  assert.equal(nativeResult.channel, 'native');
  assert.equal(photonCalls, 1);

  // Imported EXIF coordinates can still use Photon when Android blocks its native geocoder.
  const nativeCallsBeforePermissionFallback = state.calls;
  const permissionFallback = await locationStamp.resolvePlaceFromCoords(
    { latitude: 48.8588, longitude: 2.3544 },
    'en',
    'en',
    false,
  );
  assert.equal(permissionFallback.status, 'ok');
  assert.equal(permissionFallback.channel, 'photon');
  assert.equal(state.calls, nativeCallsBeforePermissionFallback);
  assert.equal(photonCalls, 2);

  console.log('overseas location checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
