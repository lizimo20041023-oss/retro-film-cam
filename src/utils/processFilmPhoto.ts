/**
 * 拍后处理管线 —— 本项目"出片"的唯一入口。
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ 管线（顺序 = 执行顺序，每一步都对应真实存在的 RN / Expo 能力）            │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ 0. 归一化    expo-image-manipulator 新 API：把原图最长边压到 2048 px      │
 * │              （只是为了省内存；失败自动退回原图，不阻塞出片）             │
 * │ 1. 调色      声明式图层 + mixBlendMode（Expo Go 新架构原生支持）：        │
 * │              · temperature / tint  → 纯色层 + 'soft-light'               │
 * │              · saturation          → 中灰或高饱和色层 + 'saturation'     │
 * │              · contrast > 1        → **同一张照片再叠一层 + 'overlay'**  │
 * │                contrast < 1        → 中灰层 + 'normal'                   │
 * │              · fade                → '#1C1C1C' 层 + 'lighten'（只抬黑场）│
 * │              · exposure            → 白层 'screen' / 黑层 'multiply'     │
 * │              （为什么不用 `filter`：iOS 上 RN 只支持 brightness/opacity）│
 * │ 2. 颗粒/暗角 预生成 PNG：grain 平铺 + 'overlay'、vignette 拉伸 +         │
 * │              'multiply'、light-leak 拉伸 + 'screen'                      │
 * │ 3. 日期烧录  <Text> 叠在画面右下角（或相框下留白）：橙色 #FF8A00、         │
 * │              等宽数码字体、可配 letterSpacing / 格式串                   │
 * │ 4. 套相框    相框 PNG `resizeMode="stretch"` 铺满合成舞台，压在照片之上   │
 * │ 5. 截图      react-native-view-shot 的 captureRef（Expo Go 内置）         │
 * │ 6. 存相册    expo-media-library 新 API：`Asset.create(uri)`               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 为什么截图要"挂到屏幕上"而不是离屏渲染？
 * iOS 的 `RCTView` 截图（`renderInContext`）对未上屏 / opacity 0 的视图会得到空图或黑图。
 * 所以这里的做法是：调色阶段在取景器上方铺一层**几乎不透明**的"显影"遮罩，
 * 挡住底下的实时相机预览，把合成视图正常渲染出来，截完图立刻卸载。
 * 整个过程约 0.4~1.2 秒，观感上就是"显影中"。见 `src/components/CameraScreen.tsx`。
 *
 * 可单测性：本文件不直接调用任何原生模块 —— 截图通过 `FilmStageHost` 注入，
 * 单测时传一个假 host（`capture()` 返回固定 uri）即可跑完整条管线。
 */
import { resolvePreset } from '../constants/presets';
import type {
  CapturedPhoto,
  DevelopStage,
  FilmPreset,
  FilmStageHost,
  FilmStageInput,
  FrameSpec,
  ProcessedPhoto,
  SaveOutcome,
  Size,
} from '../types';
import { planCapture } from './captureOptions';
import { computeFrameLayout } from './geometry';
import { buildGradeLayers } from './gradeLayers';
import { normalizePhoto } from './normalizePhoto';
import { saveToLibrary } from './saveToLibrary';

export interface ProcessFilmPhotoInput {
  /** `takePictureAsync` 的结果。 */
  photo: CapturedPhoto;
  /** 相框（`FRAMES` 里的一项）。 */
  frame: FrameSpec;
  /** 预设（`PRESETS` 里的一项，原始数据即可，内部会补默认值）。 */
  preset: FilmPreset;
  /**
   * 合成舞台的逻辑尺寸（pt）。
   * 建议 = 取景器里相框预览的实际尺寸，这样"所见即所得"。
   */
  stage: Size;
  /** 宿主：负责把 `<FilmCompositor />` 挂到屏幕上并截图（App 里由 `useFilmStage` 提供）。 */
  host: FilmStageHost;
  /** 拍摄时间；默认 `new Date()`。显式传入便于单测（断言烧进照片的日期）。 */
  capturedAt?: Date;
  /** 覆盖预设里的 `normalizeMaxLongEdge`；0 = 跳过归一化。 */
  maxLongEdge?: number;
  /** 进度回调：'normalizing' → 'capturing' → 'saving'。 */
  onStage?: (stage: DevelopStage) => void;
}

export interface ProcessAndSaveResult {
  photo: ProcessedPhoto;
  save: SaveOutcome;
}

/**
 * 显影：调色 → 颗粒/暗角 → 烧日期 → 套相框 → 截图，返回成片信息。
 * 不写相册（写相册是 `saveToLibrary` 的事，方便单独重试一次保存）。
 */
export async function processFilmPhoto(input: ProcessFilmPhotoInput): Promise<ProcessedPhoto> {
  const { photo, frame, preset: rawPreset, stage, host } = input;

  // 1) 预设补默认值 —— 纯函数
  const preset = resolvePreset(rawPreset);

  // 2) 排版：相框 + 照片窗口 + 日期位置，全部由数据算出来
  const layout = computeFrameLayout(frame, stage.width, stage.height);
  const capturedAt = input.capturedAt ?? new Date();
  const maxLongEdge = input.maxLongEdge ?? preset.normalizeMaxLongEdge;
  const startedAt = Date.now();
  const warnings: string[] = [];

  // 3) 归一化（失败自动降级，只记一条 warning）
  input.onStage?.('normalizing');
  const normalized = await normalizePhoto(photo, maxLongEdge);
  if (!normalized.resized && normalized.note) {
    warnings.push(normalized.note);
  }

  // 4) 调色图层：这里就决定了成片长什么样（纯数据，可断言）
  const layers = buildGradeLayers(preset).map((layer) => layer.label);

  // 5) 挂载合成视图 → 等布局和图片就绪 → 截图 → 立刻卸载
  const stageInput: FilmStageInput = {
    rawUri: normalized.uri,
    layout,
    preset,
    frame,
    capturedAt,
  };
  input.onStage?.('capturing');
  let uri = '';
  try {
    host.mount(stageInput);
    await host.whenReady();
    uri = await host.capture();
  } finally {
    // 失败也必须收掉显影层，否则界面会卡在"显影中"
    host.unmount();
  }

  // 和 FilmCompositor 用同一个纯函数推尺寸，保证报告的像素数和真截出来的文件一致
  const capture = planCapture({
    width: layout.width,
    height: layout.height,
    targetLongEdge: preset.captureLongEdge,
  });

  return {
    uri,
    width: layout.width,
    height: layout.height,
    pixelRatio: capture.pixelRatio,
    pixelWidth: capture.pixelWidth,
    pixelHeight: capture.pixelHeight,
    frameId: frame.id,
    presetId: preset.id,
    capturedAtIso: capturedAt.toISOString(),
    rawUri: normalized.uri,
    durationMs: Date.now() - startedAt,
    layers,
    warnings,
  };
}

/**
 * 完整出片：显影 + 写相册。
 * 保存失败**不会**抛错，而是返回 `save.ok === false` + 原因，成片 uri 依然可用
 * （UI 可以把 uri 显示给用户，或稍后重试保存）。
 */
export async function processAndSaveFilmPhoto(
  input: ProcessFilmPhotoInput,
): Promise<ProcessAndSaveResult> {
  const photo = await processFilmPhoto(input);
  input.onStage?.('saving');
  const save = await saveToLibrary(photo.uri);
  return { photo, save };
}
