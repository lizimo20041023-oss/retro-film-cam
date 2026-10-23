// Focused regression check for overseas reverse-geocode parsing. No device or live network is needed.
//
// v2.3.2 扩展：语言候选链（zh / ja 不得再发 lang=zh|ja）、HTTP 400 后重发不带 lang、
// 失败负缓存 120 秒、持久化缓存 seed 后零网络、地名档失败绝不输出坐标。
// 门禁口径：只用 typescript transpile + 桩，不新增任何依赖；断言数用 Proxy 计数。
const baseAssert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

/** 断言计数：每条 `assert.*` 调用 +1（桩内部触发的那几条也算，口径一致）。 */
let assertionCount = 0;
const assert = new Proxy(
  {},
  {
    get(_target, property) {
      const fn = baseAssert[property];
      if (typeof fn !== 'function') return fn;
      return (...args) => {
        assertionCount += 1;
        return fn.apply(baseAssert, args);
      };
    },
  },
);

const state = {
  /** 系统反查每次返回的地址数组（`shift()` 消费，空则 `[]`）。 */
  responses: [],
  /** `reverseGeocodeAsync` 一共被调了几次。 */
  calls: 0,
  /** 给 Photon 的预排队响应（`shift()` 消费，空则默认 Paris 200）。 */
  fetchResponses: [],
  /** Photon 每次请求的真实 URL（按顺序）。 */
  fetchUrls: [],
};

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
const lyon = {
  ...emptyAddress,
  city: 'Lyon',
  region: 'Auvergne-Rhône-Alpes',
  country: 'France',
  isoCountryCode: 'FR',
  formattedAddress: 'Lyon, Auvergne-Rhône-Alpes, France',
};
const marseille = {
  ...emptyAddress,
  city: 'Marseille',
  region: "Provence-Alpes-Côte d'Azur",
  country: 'France',
  isoCountryCode: 'FR',
  formattedAddress: "Marseille, Provence-Alpes-Côte d'Azur, France",
};

/** 设备当前位置：两个用例之间切换（各自坐标不同，避免互相命中缓存）。 */
let deviceCoords = { latitude: 51.5074, longitude: -0.1278 };
/** 系统定位权限状态（`denied` 用例会切到 false 再切回来）。 */
let permissionGranted = true;

const native = {
  'expo-location': {
    Accuracy: {
      Lowest: 1,
      Low: 2,
      Balanced: 3,
      High: 4,
      Highest: 5,
      BestForNavigation: 6,
    },
    async hasServicesEnabledAsync() {
      return true;
    },
    async getForegroundPermissionsAsync() {
      return { granted: permissionGranted, canAskAgain: true, status: 'granted', expires: 'never' };
    },
    async requestForegroundPermissionsAsync() {
      return { granted: permissionGranted, canAskAgain: true, status: 'granted', expires: 'never' };
    },
    async getLastKnownPositionAsync() {
      return null;
    },
    async getCurrentPositionAsync() {
      return {
        coords: {
          ...deviceCoords,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };
    },
    async reverseGeocodeAsync() {
      state.calls += 1;
      return await (state.responses.shift() ?? []);
    },
  },
};

let photonCalls = 0;
global.fetch = async (url) => {
  photonCalls += 1;
  state.fetchUrls.push(String(url));
  assert.match(String(url), /^https:\/\/photon\.komoot\.io\/reverse\?/);
  const next = state.fetchResponses.shift() ?? {
    status: 200,
    city: 'Paris',
    region: 'Île-de-France',
    country: 'France',
    countryCode: 'FR',
  };
  const ok = next.status >= 200 && next.status < 300;
  return {
    ok,
    status: next.status,
    async json() {
      return {
        features: ok
          ? [
              {
                properties: {
                  name: next.city,
                  city: next.city,
                  state: next.region,
                  country: next.country,
                  countrycode: next.countryCode,
                },
              },
            ]
          : [],
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
const geocodePlan = loadTs(path.resolve(__dirname, '../src/utils/geocodePlan.ts'));

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
  state.fetchResponses = [];
  state.fetchUrls = [];
  const fallback = await locationStamp.resolvePlaceFromCoords(
    { latitude: 48.8566, longitude: 2.3522 },
    'en',
    'en',
  );
  assert.equal(fallback.status, 'ok');
  assert.equal(fallback.channel, 'photon');
  assert.equal(fallback.place.city, 'Paris');
  assert.equal(fallback.place.countryCode, 'FR');
  // v2.3.2：GEOCODE_MAX_ATTEMPTS 1→2。系统反查返回"成功但全空"时会在总预算内再试一次，
  // 所以这里从 1 变成 2 —— 期望值随常量更新，断言本身保留。
  assert.equal(state.calls, 2);
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
  // v2.3.2：缓存优先于系统反查，所以这里必须换一座城市（Lyon），否则会命中上面 Paris 的缓存。
  state.responses = [[lyon]];
  const nativeResult = await locationStamp.resolvePlaceFromCoords(
    { latitude: 45.764, longitude: 4.8357 },
    'en',
    'en',
  );
  assert.equal(nativeResult.status, 'ok');
  assert.equal(nativeResult.channel, 'native');
  assert.equal(photonCalls, 1);

  // Imported EXIF coordinates can still use Photon when Android blocks its native geocoder.
  const nativeCallsBeforePermissionFallback = state.calls;
  const permissionFallback = await locationStamp.resolvePlaceFromCoords(
    { latitude: 43.2965, longitude: 5.3698 },
    'en',
    'en',
    false,
  );
  assert.equal(permissionFallback.status, 'ok');
  assert.equal(permissionFallback.channel, 'photon');
  assert.equal(permissionFallback.place.city, 'Paris');
  assert.equal(state.calls, nativeCallsBeforePermissionFallback);
  assert.equal(photonCalls, 2);

  // A stalled native provider must not hold Photon behind its 6-second internal retry budget.
  let finishNative;
  state.responses = [new Promise((resolve) => { finishNative = resolve; })];
  state.calls = 0;
  state.fetchResponses = [{
    status: 200, city: 'Rome', region: 'Lazio', country: 'Italy', countryCode: 'IT',
  }];
  const raced = await locationStamp.resolvePlaceFromCoords(
    { latitude: 41.9028, longitude: 12.4964 }, 'en', 'en',
  );
  assert.equal(raced.status, 'ok');
  assert.equal(raced.channel, 'photon');
  assert.equal(raced.place.city, 'Rome');
  assert.equal(state.calls, 1);
  finishNative([]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(state.calls, 1);

  // --- v2.3.2 新增：语言候选链 -------------------------------------------------------
  // Photon 只支持 default / de / en / fr；zh-Hans / zh-Hant / ja 一律退成 en。
  assert.deepEqual(geocodePlan.photonLanguagePlan('zh-Hans'), ['en']);
  assert.deepEqual(geocodePlan.photonLanguagePlan('zh-Hant'), ['en']);
  assert.deepEqual(geocodePlan.photonLanguagePlan('ja'), ['en']);
  assert.deepEqual(geocodePlan.photonLanguagePlan('auto'), ['en']);
  assert.deepEqual(geocodePlan.photonLanguagePlan('en'), ['en']);
  assert.deepEqual(geocodePlan.photonLanguagePlan('fr'), ['fr']);
  assert.deepEqual(geocodePlan.photonLanguagePlan('de'), ['de']);
  // 候选链：首条带语言，末条不带 lang；zh/ja 永远不许出现在 URL 里。
  const zhCandidates = geocodePlan.photonUrlCandidates({ latitude: 48.8566, longitude: 2.3522 }, 'zh-Hans');
  assert.equal(zhCandidates.length, 2);
  assert.match(zhCandidates[0], /[?&]lang=en(&|$)/);
  assert.doesNotMatch(zhCandidates[1], /[?&]lang=/);
  assert.equal(new Set(zhCandidates).size, zhCandidates.length);
  for (const url of zhCandidates) assert.doesNotMatch(url, /[?&]lang=(zh|ja)(&|$)/);
  const frCandidates = geocodePlan.photonUrlCandidates({ latitude: 48.8566, longitude: 2.3522 }, 'fr');
  assert.match(frCandidates[0], /[?&]lang=fr(&|$)/);
  assert.doesNotMatch(frCandidates[1], /[?&]lang=/);

  // --- v2.3.2 新增：HTTP 400 后重发"不带 lang" --------------------------------------
  // Berlin：第一次 400 → 换不带 lang 的候选 → 200 成功。旧实现里这个 400 被静默吞掉，
  // 中文用户因此永远拿不到海外地名。
  state.responses = [[], []];
  state.calls = 0;
  photonCalls = 0;
  state.fetchUrls = [];
  state.fetchResponses = [
    { status: 400 },
    { status: 200, city: 'Berlin', region: 'Berlin', country: 'Germany', countryCode: 'DE' },
  ];
  const berlin = await locationStamp.resolvePlaceFromCoords(
    { latitude: 52.52, longitude: 13.405 },
    'zh-Hans',
    'zh-Hans',
  );
  assert.equal(berlin.status, 'ok');
  assert.equal(berlin.channel, 'photon');
  assert.equal(berlin.place.city, 'Berlin');
  assert.equal(photonCalls, 2);
  assert.equal(state.fetchUrls.length, 2);
  assert.match(state.fetchUrls[0], /[?&]lang=en(&|$)/);
  assert.doesNotMatch(state.fetchUrls[1], /[?&]lang=/);
  for (const url of state.fetchUrls) assert.doesNotMatch(url, /[?&]lang=(zh|ja)(&|$)/);
  assert.notEqual(state.fetchUrls[0], state.fetchUrls[1]);

  // --- v2.3.2 新增：两次都失败 → status failed 且不带坐标 -----------------------------
  state.responses = [[], []];
  state.calls = 0;
  photonCalls = 0;
  state.fetchUrls = [];
  state.fetchResponses = [{ status: 400 }, { status: 500 }];
  const tokyo = await locationStamp.resolvePlaceFromCoords(
    { latitude: 35.6762, longitude: 139.6503 },
    'zh-Hans',
    'zh-Hans',
    false,
  );
  assert.equal(tokyo.status, 'failed');
  assert.equal(tokyo.place, undefined);
  assert.equal(tokyo.address, undefined);
  assert.equal(tokyo.attempts, 0);
  assert.equal(photonCalls, 2);

  // --- v2.3.2 新增：失败负缓存 120 秒内不再联网 --------------------------------------
  const networkCallsBeforeNegativeCache = photonCalls;
  const nativeCallsBeforeNegativeCache = state.calls;
  const tokyoAgain = await locationStamp.resolvePlaceFromCoords(
    { latitude: 35.6762, longitude: 139.6503 },
    'zh-Hans',
    'zh-Hans',
    false,
  );
  assert.equal(tokyoAgain.status, 'failed');
  assert.equal(photonCalls, networkCallsBeforeNegativeCache);
  assert.equal(state.calls, nativeCallsBeforeNegativeCache);

  // --- v2.3.2 新增：seed 持久化缓存后零网络 ------------------------------------------
  state.calls = 0;
  photonCalls = 0;
  state.fetchUrls = [];
  const seeded = locationStamp.seedGeocodeCache([
    geocodePlan.makeGeocodeCacheEntry({
      latitude: 40.7128,
      longitude: -74.006,
      language: 'en',
      status: 'ok',
      address: {
        city: 'New York',
        region: 'New York',
        country: 'United States',
        isoCountryCode: 'US',
      },
      savedAt: Date.now(),
    }),
  ]);
  assert.equal(seeded, 1);
  const newYork = await locationStamp.resolvePlaceFromCoords(
    { latitude: 40.7128, longitude: -74.006 },
    'en',
    'en',
    false,
  );
  assert.equal(newYork.status, 'ok');
  assert.equal(newYork.channel, 'photon');
  assert.equal(newYork.place.city, 'New York');
  assert.equal(newYork.place.countryCode, 'US');
  assert.equal(photonCalls, 0);
  assert.equal(state.calls, 0);

  // --- v2.3.2 新增：地名档失败绝不输出坐标 -------------------------------------------
  deviceCoords = { latitude: 55.9533, longitude: -3.1883 };
  state.responses = [[], []];
  photonCalls = 0;
  state.fetchUrls = [];
  state.fetchResponses = [{ status: 400 }, { status: 500 }];
  const failedStamp = await locationStamp.fetchLocationStamp('place', 'en', 'archive', 'en');
  assert.equal(failedStamp.ok, false);
  assert.equal(failedStamp.reason, 'failed');
  assert.equal('coords' in failedStamp, false);
  assert.equal(failedStamp.text, undefined);
  assert.equal(failedStamp.place, undefined);
  assert.equal(photonCalls, 2);
  assert.match(state.fetchUrls[0], /[?&]lang=en(&|$)/);
  assert.doesNotMatch(state.fetchUrls[1], /[?&]lang=/);

  // 换一台设备坐标（Manchester）再灌入成功条目：必须直接出地名（且不含坐标串）。
  // 不复用 Edinburgh：那个键刚刚写过失败负缓存，120 秒内会先命中断言中的负缓存。
  deviceCoords = { latitude: 53.4808, longitude: -2.2426 };
  photonCalls = 0;
  state.fetchUrls = [];
  const seedSucceeded = locationStamp.seedGeocodeCache([
    geocodePlan.makeGeocodeCacheEntry({
      latitude: 53.4808,
      longitude: -2.2426,
      language: 'en',
      status: 'ok',
      address: {
        city: 'Manchester',
        region: 'England',
        country: 'United Kingdom',
        isoCountryCode: 'GB',
      },
      savedAt: Date.now(),
    }),
  ]);
  assert.equal(seedSucceeded, 1);
  const successStamp = await locationStamp.fetchLocationStamp('place', 'en', 'archive', 'en');
  assert.equal(successStamp.ok, true);
  assert.match(successStamp.text, /MANCHESTER/i);
  assert.doesNotMatch(successStamp.text, /°/);
  assert.equal(photonCalls, 0);

  // --- v2.3.2 新增：allowCoords:false 时空串；默认仍返回坐标 -------------------------
  const coordsOnly = placeNames.coordsOnlyPlace(48.8566, 2.3522);
  assert.equal(placeNames.formatResolvedPlace(coordsOnly, 'en', 'archive', 'en', { allowCoords: false }), '');
  assert.equal(placeNames.formatResolvedPlace(coordsOnly, 'en', 'archive', 'en'), coordsOnly.coords);
  // 有三个名字字段 + 坐标的完整地名不受 allowCoords 影响。
  assert.equal(
    placeNames.formatResolvedPlace(croatia, 'zh-Hans', 'archive', 'zh-Hans', { allowCoords: false }),
    placeNames.formatResolvedPlace(croatia, 'zh-Hans', 'archive', 'zh-Hans'),
  );

  // --- v2.3.2 新增：持久化快照的序列化 / 反序列化 -------------------------------------
  const snapshot = locationStamp.snapshotGeocodeCache();
  assert.ok(snapshot.length >= 2);
  const serialized = geocodePlan.serializeGeocodeCache(snapshot);
  const reparsed = geocodePlan.parseGeocodeCache(serialized);
  assert.equal(reparsed.length, snapshot.length);
  assert.deepEqual(reparsed.map((entry) => entry.key), snapshot.map((entry) => entry.key));
  assert.deepEqual(geocodePlan.parseGeocodeCache('{not json'), []);
  assert.deepEqual(geocodePlan.parseGeocodeCache(JSON.stringify({ v: 999, entries: [] })), []);
  assert.deepEqual(geocodePlan.parseGeocodeCache(null), []);

  console.log(`overseas location checks passed: ${assertionCount} assertions`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
