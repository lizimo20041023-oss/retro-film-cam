const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, file);
const { avoidDateCollision } = require('../src/utils/watermarkCollision.ts');
const { resolveDateSpot, computeWatermarkPlan } = require('../src/utils/geometry.ts');
const { savePhotoBatch } = require('../src/utils/batchSave.ts');
const { galleryFilmLabel } = require('../src/utils/galleryLabels.ts');

const timestamp = { enabled: true, format: 'YY MM DD', color: '#ff8a00',
  fontSizeRatio: 0.03, letterSpacingRatio: 0.09, glow: false,
  fontWeight: '700', fontFamily: null, anchor: null, insetRatio: 0.04 };
let collisionCases = 0;
for (const width of [240, 358, 430, 1800]) for (const aspect of [1, 3/4, 3/2]) {
  const height = width / aspect;
  const layout = { width, height, aspect, window: { left: 0, top: 0, width, height }, bottomStripHeight: 0, rightMargin: 0 };
  for (const size of ['small','standard','large']) for (const spot of ['in_bl_v','in_bl_h','in_br_h','in_br_v','in_tr_v','in_cb_h']) {
    const frame = { fullBleed: true, watermark: { anchor: 'window', align: 'left' } };
    const date = computeWatermarkPlan(layout, timestamp, frame, '', "10 24 '26", 'en', 'dateOnly', '', 'quartz_led', 'auto', 'auto', size).lines[0].quartz;
    const bounds = resolveDateSpot(spot, layout, { width: date.width, height: date.fontSize * 1.6 }, width*.04).bounds;
    const place = { left: width*.04, bottom: width*.04, maxWidth: width*.92, fontSize: width*.022, id: 'Paris' };
    const [moved] = avoidDateCollision([place], layout, bounds);
    const h = moved.fontSize * 1.6;
    const x = moved.left ?? width - moved.right - moved.maxWidth;
    const y = height - moved.bottom - h;
    assert(x >= 0 && moved.maxWidth >= 0 && x + moved.maxWidth <= width + 0.01, `outside canvas: ${spot}`);
    assert(y >= 0 && y+h <= height + 0.01, `outside vertical canvas: ${spot}`);
    assert(!(x < bounds.left+bounds.width && x+moved.maxWidth > bounds.left
      && y < bounds.top+bounds.height && y+h > bounds.top), `date collision: ${spot}/${size}`);
    assert.deepEqual(avoidDateCollision([moved],layout,bounds),[moved], 'avoidance must be stable');
    collisionCases++;
  }
}
assert.equal(galleryFilmLabel('rb-100'), 'RB-100');
assert.equal(galleryFilmLabel('mt-500'), 'MT-500');
assert.equal(galleryFilmLabel('fj-400'), 'FG-400');
assert.equal(galleryFilmLabel(undefined), '—');
assert.equal(galleryFilmLabel('mystery-stock'), 'MYSTERY-STOCK');

async function batches() {
  const photos = ['a','b','c'].map(id=>({id,uri:`file://${id}.jpg`}));
  let active=0, max=0, calls=0;
  const progress=[];
  const partial=await savePhotoBatch(photos,async uri=>{
    calls++; active++; max=Math.max(active,max);
    await new Promise(r=>setTimeout(r,1)); active--;
    return uri.includes('b.jpg') ? {ok:false,reason:'failed',message:'disk error'} : {ok:true,uri};
  },{onProgress:(done,total)=>progress.push([done,total])});
  assert.equal(max,1); assert.equal(calls,3);
  assert.deepEqual(partial.savedIds,['a','c']); assert.deepEqual(partial.failedIds,['b']);
  assert.deepEqual(progress,[[1,3],[2,3],[3,3]]);
  calls=0;
  const denied=await savePhotoBatch(photos,async()=>{calls++;return {ok:false,reason:'permission-denied',message:'denied'};});
  assert.equal(calls,1); assert.equal(denied.failedIds.length,3);
  calls=0; let cancelled=false;
  const stopped=await savePhotoBatch(photos,async uri=>{calls++; cancelled=true;return {ok:true,uri};},{shouldCancel:()=>cancelled});
  assert.equal(calls,1); assert.equal(stopped.cancelled,true); assert.deepEqual(stopped.savedIds,['a']);
  const thrown=await savePhotoBatch(photos,async()=>{throw new Error('write failure');});
  assert.equal(thrown.failedIds.length,3);
  console.log(`v2.5 regressions: ${collisionCases} collision layouts, mixed film labels, serial/partial/denied/cancelled batch saves passed`);
}
batches().catch(error=>{console.error(error);process.exitCode=1;});
