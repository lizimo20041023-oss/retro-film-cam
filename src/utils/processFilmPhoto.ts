/**
 * 拍后处理管线 —— 本项目"出片"的唯一入口。
 *
 * 成片顺序：可选归一化 → 一次原生裁切与 LUT 输入缩放 → 场景测光 → JS 像素
 * 显影（双曝、LUT、暗角、颗粒、辉光）→ 合成相框及水印 → 一次截图。
 * 默认预设不归一化；裁切与 LUT 缩放共享同一个 ImageManipulator context，
 * 不额外写一张全尺寸裁切 JPEG。相册写入由 processAndSaveFilmPhoto 接续完成。
 *
 * 为什么截图要"挂到屏幕上"而不是离屏渲染？
 * iOS 的 `RCTView` 截图（`renderInContext`）对未上屏 / opacity 0 的视图会得到空图或黑图。
 * 所以这里的做法是：调色阶段在取景器上方铺一层**几乎不透明**的"显影"遮罩，
 * 挡住底下的实时相机预览，把合成视图正常渲染出来，截完图立刻卸载。
 * 实际耗时依赖设备和像素尺寸，开发环境用 `[filmPerf]` 分段日志测量。
 *
 * 原生图片操作与截图需要在设备运行；纯 JS 的像素渲染可独立测。
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { lutSourceLongEdgeFor } from '../constants/filmRender';
import { clampIntensityScale } from '../constants/intensity';
import { DEFAULT_NO_FRAME_ASPECT, resolveFrame } from '../constants/frames';
import { PRESETS, applyPresetIntensity, findPresetIndex, resolvePreset } from '../constants/presets';
import type {
  CapturedPhoto,
  DevelopStage,
  FilmPreset,
  FilmStageHost,
  FilmStageInput,
  FrameLayout,
  FrameSpec,
  NoFrameAspect,
  NormalizedPhoto,
  PlaceDetail,
  PresetIntensityTier,
  ProcessedPhoto,
  ResolvedFilmPreset,
  ResolvedPlace,
  SaveOutcome,
  SceneStats,
  Size,
  StockMode,
  WatermarkAlign,
  WatermarkLayout,
  WatermarkZone,
} from '../types';
import type { LocaleId } from '../i18n/types';
import { renderFilmToFile } from './applyFilmRender';
import { planPhotoCrop } from './cameraGeometry';
import { planCapture } from './captureOptions';
import { describeError } from './describeError';
import { deleteLocalFilesBestEffort } from './fileCleanup';
import { computeFrameLayout, resolveFrameOrientation } from './geometry';
import { normalizePhoto } from './normalizePhoto';
import { probeScene } from './sceneProbe';
import { recommendStockAndIntensity } from './sceneMatch';
import { saveToLibrary } from './saveToLibrary';

export interface ProcessFilmPhotoInput {
  /** `takePictureAsync` 的结果。 */
  photo: CapturedPhoto;
  /** 相框（`FRAMES` 里的一项）。 */
  frame: FrameSpec;
  /**
   * 无相框（`00 NO FRAME`）的画幅比（v1.8.1）。**可选**：只有 `frame.fullBleed === true`
   * 时才被读，纸框一律忽略。不传时按 `DEFAULT_NO_FRAME_ASPECT`（`'3:4'`）算。
   *
   * 为什么放在这里而不是让调用方先 `resolveFrame` 再传：`processFilmPhoto` 是
   * "相框 → 几何 → 画布"的**唯一**入口，解析放在入口内侧，取景器预览
   * （`CameraScreen` 自己也调 `resolveFrame`）与成片就必然是同一个函数的同参调用；
   * 让调用方解析就得把这个默认值复制到每个调用点，哪天改了默认值必然漏一处。
   */
  noFrameAspect?: NoFrameAspect;
  /** 预设（`PRESETS` 里的一项，原始数据即可，内部会补默认值）。 */
  preset: FilmPreset;
  /**
   * 合成舞台的逻辑尺寸（pt）。
   * 建议 = 取景器里相框预览的实际尺寸，这样"所见即所得"。
   */
  stage: Size;
  /**
   * 相机档位的**数码裁切因子**（v1.8.4）：1 = 该镜头原生视场，>1 = 在窗口内再中心裁一刀。
   *
   * 由 `CameraScreen` 里 `resolveStop()` 的结果给出（35mm 档 `35/26`、52mm 档 `2`）。
   * 为什么和取景器共用同一个数：live 的相机盒按同一因子放大（`planCameraLayer`），
   * 窗口露出的传感器范围就缩小到 `1 / digitalFactor`；成片在这里按同样比例裁
   * —— 两处消费同一套纯函数几何，所以「取景器里看到多少 = 成片里有多少」是结构性的。
   *
   * 不传 = 1（老调用方 / 缩放档位为光学时的行为完全不变）。
   */
  digitalFactor?: number;
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
  place?: ResolvedPlace | null | Promise<ResolvedPlace | null>;
  /**
   * 拍这张时的界面语言。合成层用它把 `place` 拼成那一行字。
   * 不传 = 简体中文。
   */
  locale?: LocaleId;
  /** 水印版式（四选一）；不传 = `'split'`。 */
  watermarkLayout?: WatermarkLayout;
  /**
   * 水印纵向位置（v1.8.11）；不传 = `'auto'`（相框自己决定，= v1.8.10 行为）。
   * 非 auto 时合成层按它覆盖默认 baseline / region（见 `computeWatermarkPlan` 的 `zone`）。
   */
  watermarkZone?: WatermarkZone;
  /** 水印横向对齐（v1.8.11）；不传 = `'auto'`（旧行为）。 */
  watermarkAlign?: WatermarkAlign;
  /**
   * 场景自适应调色（v1.8.11 起；v1.9.0 改成 64×64 极速测光）；不传 = **开**。
   *
   * 打开时会在这里把裁切后的底片送去 `probeScene`：原生侧缩到 64×64 JPEG（约 2KB）
   * 再只解 DC 系数，把 `SceneStats` 挂到 `preset.scene` 上；关掉则完全不采样，
   * 图层栈逐字节回到静态曲线。采样失败（非 baseline JPEG / 文件读不了）也等于
   * "没有数据"，同样退化，不抛。
   */
  adaptiveGrade?: boolean;
  /**
   * 底片模式（v2.1.0 手术三）：`'auto'` = 整卷由场景引擎选（`utils/sceneMatch.ts`），
   * 不传 / `'manual'` = 用 `preset` 那卷（缺省行为，与 v2.0.1 完全一致）。
   *
   * AUTO 选出来的卷只在**成片**生效：取景器和底片库里挂着的还是用户选的 `preset`
   * （所以返回值里 `presetId` 是"用户的选择"、`effectivePresetId` 才是"实际洗出来的卷"）。
   */
  stockMode?: StockMode;
  /**
   * 预设强度档位（v2.1.0 手术二）：`'auto'` = 场景引擎给倍率，其余档 = 固定倍率
   * （subtle 0.35 / soft 0.65 / standard 1 / rich 1.3 / max 1.6）。
   * 不传 = 交给 `recommendStockAndIntensity` 的缺省（标准 100%）。
   */
  intensityTier?: PresetIntensityTier | null;
  /**
   * **已经解析好的**强度倍率（0.35~1.00）。UI 三处入口传它最直接：
   * 传了就以它为准（`intensityTier` 仍透传给场景引擎，但算出的倍率不生效）。
   * 不传 = 用场景引擎算出的 `intensityScale`。
   */
  intensityScale?: number;
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
   * 重曝：暂存的**第一张**底片，等第二张按下快门后叠在同一格画面里（§五.3）。
   *
   * 不传 / `null` / 空串 = 单次曝光（和 v1.3.0 完全一样）。
   * 传了就是把两张底片叠在同一格上洗一次 —— 注意调节的时机：
   * 叠加发生在**画面窗口内、调色之前**（见 `renderFilmFrame`），
   * 所以调色 / 颗粒 / 暗角作用在"合成结果"上，而不是各洗一遍再叠。
   */
  overlayUri?: string | null;
  /** 双曝首张的原始尺寸；与 overlayUri 一起在第一次快门时冻结。 */
  overlayPhoto?: CapturedPhoto | null;
  /** 双曝首张快门时的数码裁切，不能沿用第二张的焦段设置。 */
  overlayDigitalFactor?: number;
  /**
   * 重曝那一张的不透明度；默认 **0.5**。
   *
   * 只有 `overlayUri` 有值时才有意义。为什么不默认 1：两张都全量叠上去就是"后一张盖住前一张"，
   * 那不是重曝是替换；0.5 才是"两次曝光各占一半"的物理直觉。
   */
  overlayOpacity?: number;
  /** 进度回调：'normalizing' → 'capturing' → 'saving'。 */
  onStage?: (stage: DevelopStage) => void;
}

export interface ProcessAndSaveResult {
  photo: ProcessedPhoto;
  save: SaveOutcome;
}

/**
 * 显式居中裁切的结果。
 *
 * 为什么不用 `NormalizedPhoto`：那是"归一化这一步的产物"（带 `resized` / `note`），
 * 而裁切是**独立的一步**，它要回答的是另外两个问题（"裁了没有""为什么没裁"）。
 * 把两件事塞进同一个类型里，将来只看 `resized` 会分不清"没缩"和"没裁"。
 */
interface CroppedPhoto extends CapturedPhoto {
  /** 真的裁了（像素变少了）。`false` = 这一步是恒等变换，下游拿到的还是归一化那张图。 */
  cropped: boolean;
  /** 给用户看的降级说明；`undefined` = 没出岔子。 */
  note?: string;
}

/**
 * 这张照片该按什么宽高比裁 —— **就是合成层窗口的宽高比**。
 *
 * 返回 `null` = 这一步不做（调用方原样把归一化那张图交给合成层）。
 * 现在**只有一种**情况会返回 `null`：**`photoFit: 'contain'` 的相框**。`contain`
 * 的语义是"整张完整放入、可以留黑边"，按窗口比例裁掉两边正好是它承诺**不做**的事。
 * （当前 5 款全是 `'cover'`，这条分支是为将来新增相框留的；渲染侧用的是同一个判断
 * ——`FilmCompositor.tsx` 三处都是 `frame.photoFit === 'contain' ? 'contain' : 'cover'`，
 * 所以不会出现"这里按 cover 裁、那里按 contain 画"的错配。）
 *
 * ⚠️ 曾经还有第二种：**有开槽（`frame.slots`）的相框**不裁切。那条随 v1.6.1 精简相框库
 * 一起删除了 —— 半格双联框下线后全仓库再没有任何相框带 `slots`，`slots` 机制本身也已
 * 从 `types` / `geometry` / `FilmCompositor` 里整条摘掉。**将来若真要做"一框多图"，
 * 这里必须同时恢复"有槽就不裁"的判断**：那时照片摆进的是槽位矩形而不是 `layout.window`，
 * 按窗口比例裁出来的图会被槽里的 `cover` 再裁一次（不是恒等变换），白付一次全图
 * 解码 + 重编码的内存峰值。
 *
 * 为什么读的是 `layout.window`（`Rect`，逻辑点）而不是 `frame.window`（归一化）：
 * 两者比例只差一次取整，但 `layout.window` 才是**合成层真正拿去摆照片的那个矩形**
 * （`FilmCompositor` 的 `styles.window` 用的就是它）。裁切比对的基准必须是同一份数据，
 * 否则"结构性一致"就退化成"数值上很接近"。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 画幅强锁（v1.7.0）：这里的比例 == 取景器中央镂空视窗的比例
 * ─────────────────────────────────────────────────────────────────────────
 *   取景器：`CameraScreen` 用 `computeFrameLayout(frame, previewBox - 2×PREVIEW_PADDING)`
 *           算 `previewLayout`，再让预览层把相框与照片按它摆好 ——
 *           用户从镂空里看到的那块画面就是 `previewLayout.window`
 *           （`FramePreviewLayer.tsx:7-14` 把"两边共用同一个 `previewLayout`"写在组件那边）。
 *   成片：  同一个 `computeFrameLayout(frame, stage.width, stage.height)` 得到 `layout`，
 *           `FilmCompositor` 摆照片用的也是 `layout.window`，而这里裁切用的比例
 *           正是它的 `width / height`。
 * 两边是**同一个纯函数 + 同一份 `frame` 几何**，只差一次 `Math.round` 取整，
 * 所以"取景器看见多大，成片就是多大"是结构性成立的（不是靠凑巧）。
 * `FilmCompositor.tsx:12` / `:80`（预览与成片共用同一个 `FrameSkin`）也是同一条规矩，
 * `geometry.ts` 头注释同样是。
 * ⚠️ 真要动窗口几何，就动 `geometry.ts` —— 两边会一起变，这正是要的效果；别只改一边。
 */
function resolveCropAspect(frame: FrameSpec, layout: FrameLayout): number | null {
  if (frame.photoFit === 'contain') {
    return null;
  }
  const { width, height } = layout.window;
  if (!(width > 0) || !(height > 0)) {
    return null;
  }
  const aspect = width / height;
  return Number.isFinite(aspect) && aspect > 0 ? aspect : null;
}

/**
 * 归一化后的图 → 按 `aspect` **居中裁出最大内接矩形**（显式 WYSIWYG，§六）。
 *
 * ─── 为什么必须在这一步做 ───────────────────────────────────────────────────
 * 合成层给照片的是 `resizeMode="cover"`，也就是**它本来就会居中裁切**。
 * 于是"取景框所见 = 成片内容"过去只是**凑巧**成立（只要没人改 `photoFit`、
 * 没人动窗口坐标、没人换 `resizeMode`，它就一直成立，也一直没人能断言它）。
 * 在这里先把图裁成窗口比例之后，`cover` 面对的是一张**比例已经相同**的图：
 * 缩放是唯一剩下的动作，裁切量为零 —— `cover` 成了恒等变换。
 * 换句话说，"所见即所得"从"依赖渲染器的行为"变成"图本身的属性"，可以被断言了。
 *
 * ⚠️ **不会改变现有成片的构图**：`cover` 本来就居中，这里的裁切也是居中的，
 * 两者裁掉的是同一块区域（差别只在取整和 JPEG 多解码了一次）。所以这一步
 * **不是为了"修好构图"，是为了让构图变成结构上必然的**。要断言这一点，
 * 拿同一张照片改动前后各出一张片，逐像素对比即可（本轮没在真机上做，见报告）。
 *
 * ─── 为什么在归一化**之后**裁（顺序不能换）─────────────────────────────────
 * 归一化会改像素数量（`resize`），裁切比例是按像素算的。先裁再缩的话，
 * 缩放的取整误差会落在**裁切之后**的那张图上，而裁切本身已经按"老尺寸"算过了 ——
 * 两处独立的取整叠在一起，裁出来的区域就不是"居中最大内接矩形"了
 * （宽高各差 1px，比例误差在高分辨率图上还能被 `cover` 吃掉，在缩略图上就会露出来）。
 * 反过来先缩后裁只有**一次**取整，而且那次取整是 `normalizePhoto` 里
 * 已经验证过的那一次。而且裁完的图直接进合成层，中间不再有任何改像素的步骤 ——
 * "裁出来的比例"和"渲染时看到的比例"之间没有第三个环节可以插进来。
 *
 * ─── 失败与降级 ────────────────────────────────────────────────────────────
 * 这一步是**优化**（把隐式行为变显式），不是"不出片"的理由，所以：
 *   · 比例已经相同（差 < 1px）→ 不裁，也不重编码；
 *   · 比例不可用（窗口宽高为 0 / 非有限数）→ 这一步根本不会被调到，
 *     `resolveCropAspect` 已经先返回 `null` 了；
 *   · 裁切矩形算出来是空的（宽或高取整成 0）→ 不裁；
 *   · 裁切抛异常 → 退回归一化那张图，记一条 `note`；
 *   · 任何一条降级路径都不会让 `processFilmPhoto` 抛错（整体 try/catch）。
 *
 * 单位：`CroppedPhoto` 的 `width` / `height` 是**像素**。
 */

async function centerCropPhoto(
  photo: NormalizedPhoto,
  aspect: number,
  digitalFactor = 1,
): Promise<CroppedPhoto> {
  const { width, height } = photo;
  if (!(width > 0) || !(height > 0)) {
    return { ...photo, cropped: false, note: '裁切跳过：原图宽高不可用（宽或高为 0）' };
  }

  /*
   * v1.8.4：「窗口裁切」与「档位数码裁切」合并成一次裁切，尺寸交给 `planPhotoCrop()`。
   *
   * 它和取景器里的 `planCameraLayer()` 是**同一个几何模型**：相机盒放大 `digitalFactor` 倍
   * ⇒ 取景窗口露出的传感器范围缩小到 `1 / digitalFactor`；成片就按同样比例从中心裁掉
   * ⇒ 「所见即所得」由结构保证，而不是两处各写一遍公式再对参数。
   *
   * 一个像素都不裁（比例已经相同、且 `digitalFactor === 1`）时直接返回：裁出来的矩形
   * 等于原图，却要付一次全图解码 + 重编码（12MP 图约 48MB 峰值），所以跳过。
   */
  const rect = planPhotoCrop({ width, height }, aspect, digitalFactor);
  if (rect.width >= width && rect.height >= height) {
    return { ...photo, cropped: false };
  }
  /*
   * 空矩形保护：`aspect` 极端小（窗口只有一两像素宽）时取整会把它压成 0，
   * 而 `crop()` 的宽高必须是 ≥ 1 的整数。调原生之前先判一次，
   * 免得把"参数非法"变成一个需要用户重拍的错误。
   */
  if (rect.width < 1 || rect.height < 1) {
    return { ...photo, cropped: false, note: '裁切跳过：算出来的裁切矩形宽或高为 0' };
  }

  try {
    /*
     * 落点沿用 v1.8.3 的 `centerCropOrigin`（floor 居中、奇数余量归左）：
     * 这一版只换了「裁多大」的口径，没有动「裁在哪」的规则 —— 居中只允许有一个落点，
     * 两处各算一遍就会差出 ±1px 的偏心。
     */
    const { originX, originY } = centerCropOrigin(width, height, rect.width, rect.height);

    const context = ImageManipulator.manipulate(photo.uri);
    context.crop({ originX, originY, width: rect.width, height: rect.height });
    const image = await context.renderAsync();
    /*
     * 用 JPEG 而不是 PNG：源图在归一化那一步已经是 JPEG（`normalizePhoto` 的
     * `saveAsync({ format: JPEG, compress: 0.98 })`），这里再存一次不会引入新的
     * 格式损失等级；PNG 会把 12MP 的中间文件写到几十 MB，而它下一秒就被截图替代掉了。
     * 质量 v1.8.4 起统一取 **0.98**（用户要求 quality 0.98）：归一化 / 裁切 / 成片截图
     * 三处是同一个数，任何一处不对齐就等于悄悄多降了一次质。
     */
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.98 });
    return { uri: saved.uri, width: saved.width, height: saved.height, cropped: true };
  } catch (error) {
    return {
      ...photo,
      cropped: false,
      note: `裁切失败，已退回归一化后的整图：${describeError(error)}`,
    };
  }
}

/**
 * 最大内接矩形的**居中落点** —— 裁切框左上角在归一化图里的像素坐标。
 *
 * 为什么单独抽成一个纯函数（而不是留两行在 `centerCropPhoto` 里）：这是"严格居中"这条
 * 产品要求的**唯一落点**，两轮真机反馈里那句"照片缩在相纸一角"一度被怀疑是这里算错了。
 * 抽出来之后它可以在 Node 里跑真函数直接断言（`core = (i - c) / 2`，两侧余量最多差 1px），
 * 而不必为了验算去 mock `expo-image-manipulator` —— `centerCropPhoto` 里剩下的部分
 * 只有原生调用和降级分支，那些在 Node 里本来就跑不起来。
 *
 * ⚠️ 结论先写在这里，免得下一轮再怀疑一次：**这段公式没有错**。`floor` 让余量偏向
 * 左上，所以"左余量 + 裁切宽 = 右余量"最多差 1px（奇数差的那 1px 永远归左边）——
 * 这是随手可证的，不是"看着差不多"。至于真机上"横图缩在相纸一角 + 另一侧一条大白边"，
 * 病根不在这里，而在**当时那张成片用的是横版纸**：横版 PNG 是竖版纸转 90° 出来的，
 * 窗口坐标跟着转了 90°，于是窗口本身就落在纸的一侧（见 `frames.ts` 里
 * `polaroid-600-landscape` 的 `window.x = 0.219626`）。朝向已在
 * `resolveFrameOrientation` 里钉死成竖版，那条路现在不可达。
 *
 * `cropWidth` / `cropHeight` 由调用方按"图比窗口宽就裁左右、高就裁上下"算好传进来，
 * 这里只回答"往哪落"，不重复判一次方向（判两次就可能出现"按宽度裁、按高度居中"的错配）。
 */
function centerCropOrigin(
  imageWidth: number,
  imageHeight: number,
  cropWidth: number,
  cropHeight: number,
): { originX: number; originY: number } {
  return {
    originX: Math.floor((imageWidth - cropWidth) / 2),
    originY: Math.floor((imageHeight - cropHeight) / 2),
  };
}

/**
 * 把裁切后的底片准备成「LUT 输入图」（v2.0.1 单次截图的关键一步）。
 *
 * 用户红线（m02361 第四条）：pass1 的截图必须消失，又不许有两遍 view-shot，
 * 于是照片像素层的来源从「view-shot 截一张 PNG」换成「ImageManipulator 直接输出 PNG」。
 * `expo-image-manipulator` 从 v2.0.0 起就在依赖里（SDK 57 的 `~57.0.21`），
 * 是本次改造**唯一**动到的原生模块 —— 零新依赖。
 *
 * 输出规范：
 * - 长边 = `lutSourceLongEdgeFor(captureLongEdge)` 再夹到源图长边（不凭空插值放大）；
 * - 格式 **PNG**：`decodePng` 只吃 PNG（JPEG 要走另一套整图解码器，v2.0.1 不做）；
 * - 宽高取整到 ≥1，比例保持裁切图不变（裁切图已经是窗口比例）。
 *
 * 失败直接抛给调用方的 try/catch（→ 声明式兜底），这里不吞异常。
 */
async function prepareLutSource(
  photo: CapturedPhoto,
  targetLongEdge: number,
  crop: { originX: number; originY: number; width: number; height: number } | null,
  outputSize?: Size,
): Promise<CapturedPhoto> {
  const width = crop?.width ?? Math.max(1, Math.round(photo.width));
  const height = crop?.height ?? Math.max(1, Math.round(photo.height));
  const sourceLongEdge = Math.max(width, height);
  const target = Math.max(1, Math.min(Math.round(targetLongEdge), sourceLongEdge));
  const context = ImageManipulator.manipulate(photo.uri);
  // 原生 context 在后台线程依次裁切、缩放，只解码一次；中途不落全尺寸 JPEG。
  if (crop !== null) {
    context.crop(crop);
  }
  if (outputSize !== undefined) {
    context.resize({ width: outputSize.width, height: outputSize.height });
  } else if (target !== sourceLongEdge) {
    const scale = target / sourceLongEdge;
    const resizedWidth = width >= height ? target : Math.max(1, Math.round(width * scale));
    const resizedHeight = width >= height ? Math.max(1, Math.round(height * scale)) : target;
    context.resize({ width: resizedWidth, height: resizedHeight });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.PNG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/**
 * 显影：调色 → 颗粒/暗角 → 烧日期 → 套相框 → 截图，返回成片信息。
 * 不写相册（写相册是 `saveToLibrary` 的事，方便单独重试一次保存）。
 */
export async function processFilmPhoto(input: ProcessFilmPhotoInput): Promise<ProcessedPhoto> {
  const { photo, preset: rawPreset, stage, host } = input;
  /*
   * v1.8.1 无相框（`00 NO FRAME`）：相框先在**入口**解析一次，后面全用 `frame`。
   *
   * `resolveFrame` 对纸框返回**同一个引用**（零开销、零行为变化），只对全铺帧返回
   * 一个新对象：`aspect` 换成设置里那一档（1:1 / 3:4 / 3:2）、`window` 铺满整幅。
   *
   * 一处解析、全链受益：`computeFrameLayout` / `resolveCropAspect` / `stageInput.frame` /
   * 返回的 `frameId` 全部自动一致 —— 尤其 `resolveCropAspect` 读的是
   * `layout.window.width / layout.window.height`，所以"照片按所选画幅比裁一刀"
   * 这件事不需要另写一行代码，`normalizePhoto` / `planCapture` 也不用改。
   */
  const frame = resolveFrame(input.frame, input.noFrameAspect ?? DEFAULT_NO_FRAME_ASPECT);

  // 1) 预设补默认值 —— 纯函数
  const preset = resolvePreset(rawPreset);

  // 2) 排版：相框 + 照片窗口 + 日期位置，全部由数据算出来
  /*
   * 朝向：`resolveFrameOrientation` 现在**恒返回 `'portrait'`**（v1.6.0 的有意回退，
   * 完整理由写在该函数顶部），所以这里的 `photo` 只用于满足签名 —— 它不再影响结果。
   *
   * ⚠️ 这段注释以前写的是"先按原图的实际长宽比选朝向"，那句话在横版变体真的会被选中时
   * 是对的，现在**已经不成立**了。之所以改写而不是删掉：留下的这行 `orientation` 是
   * "相纸永远正向直立"这条产品决定的**唯一语义锚点** —— 布局拿竖版几何、渲染层再反推
   * 也必然是竖版，整条链都从这里出发。哪天要按比例重新选朝向，改的是这里一处。
   *
   * 形参仍传 `photo` 而不是 `normalized`（老习惯，保持调用形状不变）：
   * 归一化只改像素不改比例，两者换算出的形状是同一个。
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
  const devTiming = __DEV__
    ? { mark: startedAt, normalizeCrop: 0, lutInput: 0, sceneProbe: 0, pixelGrade: 0, placeWait: 0, stageReady: 0, capture: 0 }
    : null;
  const warnings: string[] = [];

  // 3) 归一化（失败自动降级，只记一条 warning）
  input.onStage?.('normalizing');
  const normalized = await normalizePhoto(photo, maxLongEdge);
  if (!normalized.resized && normalized.note) {
    warnings.push(normalized.note);
  }

  // 4) 显式居中裁切：把"合成层自己会居中裁"变成"图本来就是窗口比例"（§六.2）
  /*
   * 这一步放在归一化**之后**、挂载**之前**，理由见 `centerCropPhoto` 的注释。
   * 默认路径只记录裁切矩形，直接在 LUT 输入 PNG 中执行裁切；`rawUri` 因此仍是
   * 原图 URI。最终合成层只绘制 `lutUri`，不会再读取 `rawUri` 的像素。
   *
   * 旧的声明式路径里，`rawUri` 是"这次成片用的那张底片"（`FilmCompositor` 拿它画照片、拿它喂调色图层，
   * 还有"同一张图只算一个就绪信号"`countStageImages`）。为了让"重放"两个字成立 ——
   * 同一个 `stageInput` 重新挂一次必须得到同一张成片 —— 它必须指向**真正被合成的那张图**。
   * 指向归一化那张的话，重放等于让 `cover` 再做一次隐式裁切：
   * 结果是"看着差不多"，而不是"逐像素一样"（多一次取整、多一次重采样）。
   * 当前像素路径里，裁切几何由 `lutCrop` 承载，输出 PNG 才是真正参与截图的图。
   * 用户要的"原图"不在这里 —— 那是相册里的 `asset.uri`，本函数从头到尾没碰过它。
   */
  const cropAspect = resolveCropAspect(frame, layout);
  let lutCrop: { originX: number; originY: number; width: number; height: number } | null = null;
  let cropped: CroppedPhoto;
  if (cropAspect === null) {
    cropped = { ...normalized, cropped: false };
  } else if (normalized.resized) {
    // 显式归一化是少数路径，保留原来的裁切几何与缓存语义。
    cropped = await centerCropPhoto(normalized, cropAspect, input.digitalFactor ?? 1);
  } else {
    // 默认不归一化：只规划裁切矩形，在生成 LUT 输入图时与缩放一次完成。
    // 成片只绘制 lutUri，没必要先把原图整幅重编码成一张临时 JPEG。
    const rect = planPhotoCrop(normalized, cropAspect, input.digitalFactor ?? 1);
    if (rect.width < 1 || rect.height < 1) {
      cropped = { ...normalized, cropped: false, note: '裁切跳过：算出来的裁切矩形宽或高为 0' };
    } else if (rect.width >= normalized.width && rect.height >= normalized.height) {
      cropped = { ...normalized, cropped: false };
    } else {
      const { originX, originY } = centerCropOrigin(
        normalized.width, normalized.height, rect.width, rect.height,
      );
      lutCrop = { originX, originY, width: rect.width, height: rect.height };
      cropped = { ...normalized, width: rect.width, height: rect.height, cropped: true };
    }
  }
  if (normalized.uri !== photo.uri && normalized.uri !== cropped.uri) {
    // 裁切已经生成了下一张中间图；上一张归一化缓存不会再被舞台或像素管线读取。
    deleteLocalFilesBestEffort([normalized.uri], '归一化中间图');
  }
  if (cropped.note) {
    warnings.push(cropped.note);
  }
  if (devTiming !== null) {
    const now = Date.now();
    devTiming.normalizeCrop = now - devTiming.mark;
    devTiming.mark = now;
  }

  /*
   * 4.5) 场景统计（v1.8.11，用户 m06849 第一条）：「明部暗部要根据拍摄场景自己计算」。
   *
   *      为什么放在**裁切之后**：取样的是"这张成片真正会用的那块画面"——相框窗口裁掉的
   *      边角不参与测光，否则一张天空过曝的照片会因为角落的阴影被算成"暗部多"。
   *      为什么放在**挂载之前**：`SceneStats` 要钉进 `stageInput.preset.scene`，合成层
   *      拿到的必须已经是"带场景数据的那一版预设"；挂载之后再补就是两套数据。
   *
   *      采样本身是 `probeScene(uri)`（v1.9.0 极速测光）：原生侧先把这张裁切后的底片
   *      缩到 64×64 JPEG（base64，约 2KB，iOS 上几毫秒），再只解 DC 系数 → MCU 格亮度
   *      → `SceneStats`。**整条链不读原图全尺寸字节**，所以快门之后不会再有几百毫秒到
   *      几秒的纯 JS 解码卡顿（v1.9.0 手术一）。
   *
   *      失败/关闭 = `scene === null`：`scenePreset` 就是 `preset` **同一个引用**，
   *      自适应规划返回 null、补偿原样跳过 —— 图层栈与静态曲线逐字节相同。
   *      这是"缺省即旧行为"的机械保证。
   *
   *      取景器实时预览**不跑**这一步（v1.8.6 发热纪律：预览每帧开销已被卡死）。
   */
  const adaptiveEnabled = input.adaptiveGrade !== false;
  const sourceLongEdge = Math.max(cropped.width, cropped.height);
  const initialCapture = planCapture({
    width: layout.width,
    height: layout.height,
    targetLongEdge: preset.captureLongEdge,
    sourceLongEdge,
  });
  const lutLongEdge = lutSourceLongEdgeFor(initialCapture.targetLongEdge);
  let lutSource: CapturedPhoto;
  try {
    // 先生成实际参与显影的那块画面；场景测光也从它取样，避免再解码
    // 一张全尺寸裁切 JPEG。默认路径只做一次原生裁切 + 缩放 + PNG 写入。
    lutSource = await prepareLutSource(
      cropped,
      lutLongEdge,
      lutCrop,
    );
  } catch (error) {
    if (lutCrop === null) {
      if (cropped.uri !== photo.uri) {
        deleteLocalFilesBestEffort([cropped.uri], '显影源图缓存');
      }
      throw new Error(`真胶片像素管线失败，成片未保存：${describeError(error)}`);
    }
    // 原来的 centerCropPhoto 在裁切失败时会退回原图。合并裁切与缩放后
    // 保留这条容错路：只在失败时重试整图，合成层仍会按 cover 隐式居中裁切。
    try {
      lutSource = await prepareLutSource(normalized, lutLongEdge, null);
      warnings.push(`裁切失败，已退回整图：${describeError(error)}`);
    } catch (fallbackError) {
      throw new Error(`真胶片像素管线失败，成片未保存：${describeError(fallbackError)}`);
    }
  }
  if (devTiming !== null) {
    const now = Date.now();
    devTiming.lutInput = now - devTiming.mark;
    devTiming.mark = now;
  }
  let scene: SceneStats | null;
  try {
    scene = adaptiveEnabled ? await probeScene(lutSource.uri) : null;
  } catch (error) {
    deleteLocalFilesBestEffort([lutSource.uri, cropped.uri !== photo.uri ? cropped.uri : null], '测光失败缓存');
    throw error;
  }
  if (devTiming !== null) {
    const now = Date.now();
    devTiming.sceneProbe = now - devTiming.mark;
    devTiming.mark = now;
  }
  /*
   * 4.6) AUTO 底片 / 自动强度（v2.1.0 手术三，用户 m03050）：
   *
   *      `recommendStockAndIntensity` 是纯函数（`utils/sceneMatch.ts`），吃同一份
   *      `SceneStats`，返回「最匹配的卷 + 强度倍率」。两条独立的路：
   *      · `stockMode === 'auto'` → 场景选卷，`preset` 那卷只做 UI 展示；
   *      · `intensityTier === 'auto'` → 卷不动，只按场景调强度（70%~95%）。
   *      两者都不 auto 时它原样把用户选的卷还回来（`match.stockId === preset.id`），
   *      所以手动模式的像素路径与 v2.0.1 逐字节相同。
   *
   *      换卷时**只换"卷的身份"**（名称/ISO/色彩/颗粒档/暗角/mono/水印配置…），
   *      用户级的设置（颗粒刻度、成片长边、归一化长边）原样保留 —— AUTO 选的是卷，
   *      不是把用户在设置页里拧的东西一起换掉。
   */
  let match: ReturnType<typeof recommendStockAndIntensity>;
  let effectivePreset: ResolvedFilmPreset = preset;
  try {
    match = recommendStockAndIntensity(scene, {
      stockMode: input.stockMode,
      manualStockId: preset.id,
      intensityTier: input.intensityTier,
    });
    if (match.stockId !== preset.id) {
      const switched = resolvePreset(PRESETS[findPresetIndex(match.stockId)]);
      effectivePreset = {
        ...switched,
        grain: preset.grain,
        captureLongEdge: preset.captureLongEdge,
        normalizeMaxLongEdge: preset.normalizeMaxLongEdge,
      };
    }
  } catch (error) {
    deleteLocalFilesBestEffort([lutSource.uri, cropped.uri !== photo.uri ? cropped.uri : null], '选卷失败缓存');
    throw error;
  }
  const intensityScale = clampIntensityScale(input.intensityScale ?? match.intensityScale);
  const scenePreset: ResolvedFilmPreset =
    scene === null ? effectivePreset : { ...effectivePreset, scene };
  /*
   * 采样成功**不进 warnings**：这不是"降级提示"，是正常路径。真正决定观感的证据在
   * `layers` 里（⑧.7 的两层 label 自带「暗部占比 / 高光占比 / 溢出」实测值），
   * 每次拍照往用户面前的提示区塞一行"平均亮度 43%"反而是噪音。
   */

  /*
   * 5) 调色口径（v2.1.0）：**只有像素管线一条路**。
   *
   * v2.0.1 还保留 `buildGradeLayers(scenePreset)` 算一份声明式图层当兜底；用户要求
   * （m03050 手术三）「像素管线失败必须报错，不许静默回退成声明式图层」之后，这条路
   * 已经不存在了 —— 成片要么是洗好的 `lutUri`，要么整次显影抛错。
   * 取景器的实时预览仍用声明式图层（`FilmLookLayers`），但那条链不经过本函数。
   */

  /*
   * 5.5) 尺寸规划：画质档（`captureQuality.ts`）最终就是在**这里**变成成片像素的。
   *      必须在挂载之前算完，因为它的结果要吃进 `stageInput.preset` —— 真正决定文件
   *      大小的是合成层拿到的 `preset.captureLongEdge`（`FilmCompositor` 也调这个纯函数
   *      去算 `captureRef` 的 width/height，见 `useFilmStage.capture`）。两条路径共用
   *      同一个数，报告给用户的像素数才不会和实际文件对不上。
   *
   *      v1.7.0"不凭空上采样"：底片到这里已经过归一化 + 中心裁切，源长边常常**小于**
   *      画质档的目标长边（尤其 max 档 4032px）。这时照样把画布开到目标值，只会得到
   *      "小源图插值放大成大文件"：更慢、更吃内存、清晰度一点没涨。所以把裁完这张的
   *      **长边**传给 `planCapture` 当上限；真被夹了就把夹过的目标回写进 `preset`，
   *      让合成层实际截出的画布 = 我们报告的像素数（两边一致，不撒谎）。
   */
  // AUTO 换卷只替换胶片参数，captureLongEdge 在上面的 effectivePreset 中保留
  // 自用户选择的档位，所以场景分析前算好的尺寸与最终尺寸相同。
  const capture = initialCapture;
  const capturePreset: ResolvedFilmPreset =
    capture.clampedToSource && capture.targetLongEdge !== scenePreset.captureLongEdge
      ? { ...scenePreset, captureLongEdge: capture.targetLongEdge }
      : scenePreset;
  if (capture.clampedToSource) {
    warnings.push(
      `底片长边只有 ${sourceLongEdge}px（相框窗口裁切后），不再请求 ${scenePreset.captureLongEdge}px 的画布：有效目标 ${capture.targetLongEdge}px（若仍低于屏幕原生尺寸，就按屏幕原生出图）`,
    );
  }

  // 6) 挂载合成视图 → 等布局和图片就绪 → 截图 → 立刻卸载
  /*
   * v2.1.0 预设强度的**声明式**侧：`stageInput.preset` 先按强度乘数缩放好再交出去。
   *
   * 为什么在这里乘：挂载的合成层如果走 `<FilmLookLayers>` 声明式图层（无 `lutUri`
   * 的重放/预览路径），它拿到的必须是**已缩放**的 preset —— 像素管线那份强度已经
   * 烘进 `lutUri` 了，两条路径只有读同一个数才能"预览与成片一致"。
   * 缩放只动声明式字段（sCurve / lift / chromaLock / crush / 染色 / temperature /
   * vignette），`captureLongEdge` / `grain` / `id` 不动，所以画布尺寸与 LUT 渲染
   * 都不受影响（LUT 那份用的是下面 `capturePreset` + `intensity` 参数）。
   *
   * ⚠️ 因为这里已经乘过一遍，`FilmCompositor` **不要**再拿 `stage.intensity` 二次
   * `applyPresetIntensity` —— `stage.intensity` 只作展示/重放文案用。
   */
  const stagedPreset = applyPresetIntensity(capturePreset, intensityScale);
  const stageInput: FilmStageInput = {
    rawUri: cropped.uri,
    layout,
    preset: stagedPreset,
    frame,
    capturedAt,
    locationText: input.locationText ?? null,
    // 地名可能仍在查询；像素处理完成后、挂载水印前才读取其结果。
    place: null,
    locale: input.locale ?? 'zh-Hans',
    watermarkLayout: input.watermarkLayout ?? 'split',
    /*
     * v1.8.11 水印位置的两个新轴（用户 m06849 第二条）。同样**只在这里抄一次、默认值
     * 在合成层解析**：这里补 `'auto'` 是为了让 `FilmStageInput` 的类型收窄，
     * 合成层拿到的永远是具体值，不需要再判 undefined。
     */
    watermarkZone: input.watermarkZone ?? 'auto',
    watermarkAlign: input.watermarkAlign ?? 'auto',
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
     * §五.3 的两个字段按同样的规矩抄下来：`overlayUri` 保持
     * `string | null | undefined` 原样（渲染层用"是字符串且非空"判断），
     * `overlayOpacity` 也**不在这里补 0.5** —— 默认值只在渲染层生效一次，
     * 两边各补一次默认值，将来改默认就可能只改一处，出现"数据说 0.5、界面是 0.8"。
     */
    exposureIndex: input.exposureIndex ?? undefined,
    overlayUri: input.overlayUri ?? null,
    overlayOpacity: input.overlayOpacity,
    /*
     * v2.1.0 预设强度。有 `lutUri` 时它已经烘进像素；声明式那份已经乘进
     * `stageInput.preset`（见上面 `stagedPreset`）。这里这个数**只作展示/重放**
     * 用，`FilmCompositor` 不要再拿它二次缩放，否则与 `stagedPreset` 叠乘。
     */
    intensity: intensityScale,
  };
  /*
   * 6) 真胶片像素管线（v2.0.1）· **单次截图**
   *
   * 用户红线（m02361 第四条）①：严禁两遍 view-shot。v2.0.0 先截照片 → JS 洗 →
   * 再截合成图，要挂两次合成视图、等两次 onLoad：慢、会闪、还多一次 PNG 编解码。
   * v2.0.1 把照片像素层的来源换成 `ImageManipulator`（**已有依赖，零新增**）：
   * 从裁切后的底片直接输出一张长边 1024~1440 的 PNG → 单趟像素管线 → 只挂一次
   * 合成视图、只截一次图。
   *
   * 照片像素层因此与成片画布**解耦**：成片仍是 2048/3024/4032 的相框画布
   * （`FilmCompositor` 按 `capturePreset.captureLongEdge` 算），洗好的照片图由合成层
   * 以 `cover` 铺满窗口 —— 这正是"照片像素层"该有的角色（用户红线只约定 LUT 输入尺寸）。
   *
   * ⚠️ v2.1.0 起**失败不再兜底**（用户 m03050 手术三）：任何一步抛错都转成
   * `throw new Error('真胶片像素管线失败，成片未保存：…')` 抛给调用方，
   * 由 UI 明确告诉用户"这次没洗出来" —— 绝不静默返回一张没上卷的原图。
   * 所以 `renderMode` 恒为 `'lut'`，`layers` 恒是像素管线的真实参数。
   */
  const renderTemporaryUris: string[] = [lutSource.uri];
  let lutUri: string;
  let renderLayers: string[];
  try {
    input.onStage?.('grading');
    let overlaySourceUri: string | undefined;
    if (input.overlayUri) {
      const overlay = input.overlayPhoto;
      if (!overlay || overlay.uri !== input.overlayUri) {
        throw new Error('双重曝光的第一张底片尺寸缺失');
      }
      const rect = cropAspect === null
        ? null
        : planPhotoCrop(overlay, cropAspect, input.overlayDigitalFactor ?? 1);
      const overlayCrop = rect !== null && rect.width > 0 && rect.height > 0 &&
        (rect.width < overlay.width || rect.height < overlay.height)
        ? {
            ...centerCropOrigin(overlay.width, overlay.height, rect.width, rect.height),
            width: rect.width,
            height: rect.height,
          }
        : null;
      // 现有内置相框全部是 cover：两张先各自裁到同一窗口比例，再缩到相同像素尺寸，
      // 因此这里不会拉伸构图。若未来加入 contain 相框且两次快门画幅比不同，
      // 下面的 outputSize 会拉伸首张；该组合尚未保证，需改为等比居中并处理透明留白。
      const preparedOverlay = await prepareLutSource(
        overlay,
        Math.max(lutSource.width, lutSource.height),
        overlayCrop,
        { width: lutSource.width, height: lutSource.height },
      );
      overlaySourceUri = preparedOverlay.uri;
      renderTemporaryUris.push(overlaySourceUri);
    }
    /*
     * 种子取"快门时间戳 ^ 当前毫秒"：同一张照片重试两次会得到不同颗粒（用户不会察觉），
     * 但同一次显影内部固定 —— 这是 `renderFilmToFile` 的确定性契约。
     * `>>> 0` 后再 & 掉符号位，保证跨平台落在 31 位非负整数。
     */
    const seed = ((capturedAt.getTime() ^ Date.now()) >>> 0) & 0x7fffffff;
    /*
     * v2.1.1：`renderFilmToFile` 改为 async —— 输入若不是 PNG（JPEG / 其它容器），
     * 它要先走一次原生「重存 8-bit PNG」的兜底转码，所以这里必须 await。
     * 失败语义不变：它内部不 catch，异常会直接落到下面这个 catch 里抛给调用方。
     */
    const rendered = await renderFilmToFile({
      sourceUri: lutSource.uri,
      overlaySourceUri,
      overlayOpacity: input.overlayOpacity,
      stockId: capturePreset.id,
      preset: {
        id: capturePreset.id,
        grain: capturePreset.grain,
        vignette: capturePreset.vignette,
        mono: capturePreset.mono,
        scene,
      },
      seed,
      /* v2.1.0：强度乘数交给像素循环（LUT 插值 + 暗角/颗粒/halation 一起缩放） */
      intensity: intensityScale,
    });
    lutUri = rendered.uri;
    renderTemporaryUris.push(rendered.uri);
    /*
     * v2.3.2（用户 m04906 读写照片慢）：**立刻**回收 LUT 输入 PNG。
     *
     * `renderFilmToFile` 已经把它的字节读进内存、洗进了 `rendered.uri`；这一行之后
     * 合成层只画 `lutUri`，返回的 `rawUri` 是裁切前的 `cropped.uri` —— 没有任何消费者
     * 还会读 `lutSource.uri`。提前删掉，就不必让它陪跑后面的挂载/截图（一张 1024~
     * 1440 的 PNG 约 2~5MB，双曝时还有第二张）。末尾的 `renderTemporaryUris` 清理
     * 仍保留（里面还包括 `rendered.uri`，而且重复删一个已不存在的文件是无害的）。
     */
    deleteLocalFilesBestEffort([lutSource.uri], 'LUT 输入图缓存');
    renderLayers = [
      `lut:${capturePreset.id}`,
      /* 回报的是**生效值**（`rendered.params` 已经乘过强度并夹取） */
      `intensity ${rendered.params.intensity.toFixed(2)}`,
      `halation ${rendered.params.halation.toFixed(2)}`,
      `vignette ${rendered.params.vignette.toFixed(2)}`,
      `grain ${rendered.params.grain.toFixed(3)}`,
      `gamma ${rendered.params.gamma.toFixed(3)}`,
    ];
  } catch (error) {
    deleteLocalFilesBestEffort(renderTemporaryUris, '显影中间图');
    if (cropped.uri !== photo.uri) deleteLocalFilesBestEffort([cropped.uri], '显影源图缓存');
    /*
     * 用户红线（m03050 手术三）：**严禁静默回退声明式图层**。以前这里只 push 一条
     * warning 就继续返回原图，用户拿到的是一张"没上卷"的照片却以为成功了；
     * 现在一律抛错，由调用方（`CameraScreen` / `GalleryScreen`）提示失败。
     */
    throw new Error(`真胶片像素管线失败，成片未保存：${describeError(error)}`);
  }
  if (devTiming !== null) {
    const now = Date.now();
    devTiming.pixelGrade = now - devTiming.mark;
    devTiming.mark = now;
  }

  /*
   * 7) 唯一一次挂载 + 截图：把"洗好的照片"（`lutUri`）连同相框 / 日期 / 水印截成成片。
   *    有 `lutUri` 时合成层会跳过声明式调色层与重曝叠图（它们已经烘进像素）。
   */
  input.onStage?.('capturing');
  let uri = '';
  try {
    const placeWaitStartedAt = devTiming !== null ? Date.now() : 0;
    const place = (await input.place) ?? null;
    if (devTiming !== null) devTiming.placeWait = Date.now() - placeWaitStartedAt;
    const finalStageInput: FilmStageInput = {
      ...stageInput,
      place,
      lutUri,
    };
    const stageReadyStartedAt = devTiming !== null ? Date.now() : 0;
    host.mount(finalStageInput);
    await host.whenReady();
    if (devTiming !== null) devTiming.stageReady = Date.now() - stageReadyStartedAt;
    const captureStartedAt = devTiming !== null ? Date.now() : 0;
    uri = await host.capture();
    if (devTiming !== null) devTiming.capture = Date.now() - captureStartedAt;
  } catch (error) {
    deleteLocalFilesBestEffort(renderTemporaryUris, '显影中间图');
    if (cropped.uri !== photo.uri) deleteLocalFilesBestEffort([cropped.uri], '显影源图缓存');
    throw error;
  } finally {
    // 失败也必须收掉显影层，否则界面会卡在"显影中"
    host.unmount();
  }

  // 这两张 PNG 只服务本次 LUT 与最终截图；ViewShot 返回后已没有消费者，立即回收。
  deleteLocalFilesBestEffort(renderTemporaryUris, '显影中间图');
  if (devTiming !== null) {
    console.info(
      `[filmPerf] normalize+crop=${devTiming.normalizeCrop}ms ` +
      `lutInput=${devTiming.lutInput}ms scene=${devTiming.sceneProbe}ms ` +
      `pixelGrade=${devTiming.pixelGrade}ms placeWait=${devTiming.placeWait}ms ` +
      `stageReady=${devTiming.stageReady}ms capture=${devTiming.capture}ms`,
    );
  }

  // 尺寸已经在 5.5) 算过（`capture`），这里只负责回报 —— 它和合成层用的是同一个纯函数、
  // 同一份 `layout`、同一个（可能被夹过的）`captureLongEdge`，所以数字和文件必然一致。

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
    rawUri: cropped.uri,
    durationMs: Date.now() - startedAt,
    layers: renderLayers,
    renderMode: 'lut',
    /* v2.1.0：AUTO 场景引擎的结果（`presetId` 仍是"用户当时挂的那卷"） */
    effectivePresetId: effectivePreset.id,
    intensity: intensityScale,
    /* v2.1.2：AUTO 标签只给取景器 toast 用，**不进 stage**（绝不烧进成片画布）。 */
    autoBadge: match.label,
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
  const saveStartedAt = __DEV__ ? Date.now() : 0;
  const save = await saveToLibrary(photo.uri);
  if (__DEV__) {
    console.info(`[filmPerf] librarySave=${Date.now() - saveStartedAt}ms ok=${save.ok}`);
  }
  return { photo, save };
}
