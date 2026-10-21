// Focused GPS import check. The iOS MediaLibrary boundary is mocked; no device is needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const state = {
  permission: { granted: true, accessPrivileges: 'all', canAskAgain: false },
  locations: new Map(),
  legacyInfo: new Map(),
  assetIds: [],
  legacyIds: [],
  permissionReads: 0,
  permissionRequests: 0,
  mediaLocationGranted: true,
};
const platform = { OS: 'ios', Version: 18 };
const native = {
  'expo-location': {},
  'react-native': {
    Platform: platform,
    PermissionsAndroid: {
      PERMISSIONS: { ACCESS_MEDIA_LOCATION: 'android.permission.ACCESS_MEDIA_LOCATION' },
      async check() { return state.mediaLocationGranted; },
    },
  },
  'expo-media-library': {
    async getPermissionsAsync() {
      state.permissionReads += 1;
      return state.permission;
    },
    async requestPermissionsAsync() {
      state.permissionRequests += 1;
      return state.permission;
    },
    Asset: class {
      constructor(id) {
        this.id = id;
        state.assetIds.push(id);
      }
      async getLocation() {
        return state.locations.get(this.id) ?? null;
      }
    },
  },
  'expo-media-library/legacy': {
    async getPermissionsAsync() { return state.permission; },
    async requestPermissionsAsync() {
      state.permissionRequests += 1;
      return state.permission;
    },
    async getAssetInfoAsync(id) {
      state.legacyIds.push(id);
      return state.legacyInfo.get(id);
    },
  },
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

const { readExifGps } = loadTs(path.resolve(__dirname, '../src/utils/exifGps.ts'));
const { createPhotoAssetGpsReader } = loadTs(path.resolve(__dirname, '../src/utils/importLocation.ts'));

assert.deepEqual(readExifGps({ GPSLatitude: 31.5, GPSLongitude: 121.25 }),
  { latitude: 31.5, longitude: 121.25 });
assert.deepEqual(readExifGps({ GPSLatitude: -31.5, GPSLatitudeRef: 'S', GPSLongitude: -121.25, GPSLongitudeRef: 'W' }),
  { latitude: -31.5, longitude: -121.25 });
assert.deepEqual(readExifGps({ GPSLatitude: '31/1,30/1,0/1', GPSLatitudeRef: 'S', GPSLongitude: '121/1,15/1,0/1', GPSLongitudeRef: 'W' }),
  { latitude: -31.5, longitude: -121.25 });
assert.deepEqual(readExifGps({ '{GPS}': {
  Latitude: [{ numerator: 31, denominator: 1 }, { num: 30, den: 1 }, 0],
  LatitudeRef: 'N', Longitude: [121, 15, 0], LongitudeRef: 'E',
} }), { latitude: 31.5, longitude: 121.25 });
assert.deepEqual(readExifGps({ GPSLatitude: 999, GPSLongitude: 999, '{GPS}': { Latitude: 31.5, Longitude: 121.25 } }),
  { latitude: 31.5, longitude: 121.25 });
assert.equal(readExifGps({}), null);
assert.equal(readExifGps({ GPSLatitude: 31.5 }), null);
assert.equal(readExifGps({ GPSLatitude: '31/0,30/1,0/1', GPSLongitude: 121.25 }), null);

async function checkAssetFallback() {
  state.locations.set('ph://first/L0', { latitude: 31.5, longitude: 121.25 });
  state.locations.set('ph://second/L0', { latitude: -31.5, longitude: -121.25 });
  const readAssetGps = createPhotoAssetGpsReader();
  assert.deepEqual(await readAssetGps('first/L0'), { latitude: 31.5, longitude: 121.25 });
  assert.deepEqual(await readAssetGps('ph://second/L0'), { latitude: -31.5, longitude: -121.25 });
  assert.deepEqual(state.assetIds, ['ph://first/L0', 'ph://second/L0']);
  assert.equal(state.permissionReads, 1, 'one permission check per import batch');
  assert.equal(await readAssetGps(null), null);
  assert.equal(state.permissionReads, 1, 'no permission check for missing assetId');
  assert.equal(await readAssetGps('no-location/L0'), null, 'asset without location stays unstamped');

  state.permission = { granted: true, accessPrivileges: 'limited', canAskAgain: false };
  state.locations.set('ph://limited/L0', { latitude: 12, longitude: 34 });
  assert.deepEqual(await createPhotoAssetGpsReader()('limited/L0'), { latitude: 12, longitude: 34 });
  assert.equal(state.permissionRequests, 0, 'limited access must not request full access');

  state.permission = { granted: false, accessPrivileges: 'none', canAskAgain: false };
  const assetsBeforeDenied = state.assetIds.length;
  assert.equal(await createPhotoAssetGpsReader()('denied/L0'), null);
  assert.equal(state.assetIds.length, assetsBeforeDenied, 'denied access must not query the asset');

  platform.OS = 'android';
  platform.Version = 34;
  state.permission = { granted: true, accessPrivileges: 'all', canAskAgain: false };
  state.mediaLocationGranted = true;
  state.legacyInfo.set('123', { location: { latitude: -31.5, longitude: 121.25 } });
  assert.deepEqual(await createPhotoAssetGpsReader()('123'), { latitude: -31.5, longitude: 121.25 });
  assert.deepEqual(state.legacyIds, ['123']);
  assert.equal(await createPhotoAssetGpsReader()('content://some-file'), null);
  assert.deepEqual(state.legacyIds, ['123'], 'non-MediaStore IDs must not be queried');
  state.mediaLocationGranted = false;
  assert.equal(await createPhotoAssetGpsReader()('123'), null);
  assert.deepEqual(state.legacyIds, ['123'], 'without ACCESS_MEDIA_LOCATION, original EXIF is not queried');
  console.log('import GPS: focused checks passed');
}

checkAssetFallback().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
