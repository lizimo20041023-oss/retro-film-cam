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
 * │ 3.5 定位水印  地名或经纬度，按**当前水印版式**排在日期旁边。             │
 * │              四种版式（split / stacked / centered / dateOnly）只决定      │
 * │              「地名和日期怎么摆」，摆在哪块矩形里由相框的 watermark 决定。│
 * │              **取值在按快门那一刻完成**，见 input.place / locationText     │
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
  PlaceDetail,
  ProcessedPhoto,
  ResolvedPlace,
  SaveOutcome,
  Size,
  WatermarkLayout,
} from '../types';
import type { LocaleId } from '../i18n/types';
import { planCapture } from './captureOptions';
import { computeFrameLayout, resolveFrameOrientation } from './geometry';
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
  /**
   * 拍摄时间；默认 `new Date()`。
   *
   * `null` = **明确表示"这张没有拍摄时间"，走今天**。为什么区分 `undefined` 和 `null`：
   * §八 的导入路径要表达的是"我找过 EXIF 了，原图**没有** DateTimeOriginal" ——
   * 这和"调用方没管这件事"是两回事。前者要顺便提示用户 `gallery.import.noExif`，
   * 后者只是老调用方（相机屏）没传。两种都落到 `new Date()`，但语义分得清。
   * 显式传入便于单测（断言烧进照片的日期）。
   */
  capturedAt?: Date | null;
  /** 覆盖预设里的 `normalizeMaxLongEdge`；0 = 跳过归一化。 */
  maxLongEdge?: number;
  /**
   * 这次要烧进照片的定位文字（`'上海市 · 中国'` / `'31.230°N 121.474°E'`）。
   *
   * 由**调用方在按快门时**取好再传进来，这里不自己去问 expo-location：
   * 管线要能在没有定位权限、甚至没装 expo-location 的环境里跑完，
   * 单测也就不用造位置桩。不传 / `null` / 空串 = 这张不写定位。
   */
  locationText?: string | null;
  /**
   * 结构化地名（`{ city, region, country, countryCode, coords }`）。
   *
   * 为什么不能只用上面的 `locationText`：那一行字是在**上次界面语言**下拼好的，
   * 用户切成英文以后，已经烧进照片的字不会变。传结构进来，合成层才可能按当前语言
   * 重排。只有 `locationText` 没有它时，合成层原样印那一行字（向后兼容）。
   */
  place?: ResolvedPlace | null;
  /**
   * 拍这张时的界面语言。合成层用它把 `place` 拼成那一行字。
   * 不传 = 简体中文。
   */
  locale?: LocaleId;
  /** 水印版式（四选一）；不传 = `'split'`。 */
  watermarkLayout?: WatermarkLayout;
  /** 地名详细度；不传 = `'archive'`。只影响 `place` 的渲染，不影响经纬度档。 */
  placeDetail?: PlaceDetail;
  /**
   * 这一卷拍到第几张（1 起数），透传进 `FilmStageInput.exposureIndex`。
   *
   * 用途：**关闭定位时**那些照片的水印要印摄影参数代号
   * （`PR-400 // ISO 400 · 35MM · EXP.07`）而不是地名 —— 这正是 §八 要求的
   * "若无坐标，静默显示摄影参数代号，严禁把当前设备位置强加给老照片"。
   *
   * 渲染层读它的地方：`FilmCompositor.tsx` 里
   * `const codeText = placeText.length === 0 ? formatExposureCode(input.presetName, input.exposureIndex) : '';`
   * —— 地名行为空（关定位、或导入的老照片没有 GPS）时才印代号，
   * 有地名时不会两边都印。`exposureIndex` 也在那个 `useMemo` 的依赖表里。
   */
  exposureIndex?: number;
  /**
   * 重曝：**第二张**要叠在同一格画面里的底片（§五.3）。
   *
   * 不传 / `null` / 空串 = 单次曝光（和 v1.3.0 完全一样）。
   * 传了就是把两张底片叠在同一格上洗一次 —— 注意调节的时机：
   * 叠加发生在**画面窗口内、调色之前**（见 `FilmCompositor`），
   * 所以调色 / 颗粒 / 暗角作用在"合成结果"上，而不是各洗一遍再叠。
   */
  overlayUri?: string | null;
  /**
   * 重曝那一张的不透明度；默认 **0.5**。
   *
   * 只有 `overlayUri` 有值时才有意义。为什么不默认 1：两张都全量叠上去就是"后一张盖住前一张"，
   * 那不是重曝是替换；0.5 才是"两次曝光各占一半"的物理直觉。
   */
  overlayOpacity?: number;
  /**
   * 一框多图（半格双联）的**右格**那一张（§五.3）。
   *
   * 只在相框自带 `slots`（至少两格）时有效；相框没有 `slots` 时这个值被忽略，
   * 渲染结果与 v1.3.0 一致（相机页拿到的相框目前都还没有 `slots`）。
   */
  secondUri?: string | null;
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
  /*
   * 先按**原图的实际长宽比**选朝向（§六.1），再拿这个朝向去算布局。
   * 顺序不能反过来：横构图遇上只有竖版窗口的相框，窗口会把照片裁掉两边，
   * 而横版变体自带的 `window` 就是为这个比例准备的。
   * `photo` 而不是 `normalized`：归一化只改像素不改比例，用原图更贴近"用户拍到的"，
   * 而且在归一化失败降级时也不会拿到一个不存在的尺寸。
   */
  const orientation = resolveFrameOrientation(frame, photo);
  const layout = computeFrameLayout(frame, stage.width, stage.height, orientation);
  /*
   * `??` 而不是 `||`：只把 `undefined`（调用方没传）和 `null`（导入时确认原图
   * 没有 EXIF 拍摄时间）落到"现在"，不会把某个非法但为真的值也一起吞掉。
   * 落点之后的类型是 `Date`，下面 `capturedAt.toISOString()` 才是安全的。
   */
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
    locationText: input.locationText ?? null,
    place: input.place ?? null,
    locale: input.locale ?? 'zh-Hans',
    watermarkLayout: input.watermarkLayout ?? 'split',
    placeDetail: input.placeDetail ?? 'archive',
    /*
     * ⚠️ 这两行是**全项目最容易漏的一步**。上面 `ProcessFilmPhotoInput` 里的字段
     * 加好了、类型也过了，但只要忘了在这里抄进 `stageInput`，那个设置就是纯装饰
     * —— 界面能选、存得住、文档里写着，而合成层永远看不到它。
     * `watermarkLayout` / `placeDetail` 就是这么被漏过一次的。
     *
     * `exposureIndex` 用 `?? undefined` 而不是 `?? null`：`FilmStageInput` 上的
     * 类型是 `number | undefined`，多一个 `null` 会把"没填"和"填了 0"混起来
     * （虽然本意上没有第 0 张，但没必要给下游留一个要判的第三种状态）。
     *
     * §五.3 的三个新字段按同样的规矩抄下来：`overlayUri` / `secondUri` 保持
     * `string | null | undefined` 原样（渲染层用"是字符串且非空"判断），
     * `overlayOpacity` 也**不在这里补 0.5** —— 默认值只在渲染层生效一次，
     * 两边各补一次默认值，将来改默认就可能只改一处，出现"数据说 0.5、界面是 0.8"。
     */
    exposureIndex: input.exposureIndex ?? undefined,
    overlayUri: input.overlayUri ?? null,
    overlayOpacity: input.overlayOpacity,
    secondUri: input.secondUri ?? null,
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
