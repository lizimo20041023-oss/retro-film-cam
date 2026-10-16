/**
 * 成片画质档（v1.7.0）—— 设置页里那排分段按钮（`CAPTURE_QUALITIES`）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 先把话说死：这一档**不是"相机要拍多大"**
 * ─────────────────────────────────────────────────────────────────────────
 * iOS 上 `takePictureAsync` 的输出尺寸由 `AVCaptureSession.sessionPreset` 与
 * `AVCapturePhotoOutput.maxPhotoDimensions` 决定，而 expo-camera 57.0.6 **没有任何
 * 接口**能碰它们（`node_modules/expo-camera/ios/**` 里 grep `activeFormat`/
 * `setActiveFormat`/`device.formats`/`supportedMaxPhotoDimensions` 零命中；
 * 唯一一句尺寸声明是 `CameraPhotoCapture.swift` 的
 * `photoSettings.maxPhotoDimensions = photoOutput.maxPhotoDimensions`，也就是
 * "系统给多少就要多少"）。`getAvailablePictureSizesAsync()` 在 iOS 上更是
 * `CameraViewModule.swift` 里 9 个硬编码枚举 —— 传 "4032x3024" 只会被拒。
 *
 * 结论：**想真的抓到 48MP 传感器像素，必须写原生相机模块（或换掉 expo-camera）**。
 * 本仓库是纯 JS、零新增依赖，所以拿不到，也不假装拿得到。
 * 因此 `max` 这一档是「4032px 成片长边」，**绝不是 "48MP"** —— 谁也不许把这两个
 * 数字混为一谈（UI 上那一句如实说明见 `captureQualityCapNote`）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 它"是"什么
 * ─────────────────────────────────────────────────────────────────────────
 * 它决定**合成舞台截屏时把成片画到多长边**，也就是 `ResolvedFilmPreset.captureLongEdge`
 * 的取值来源：`presets.ts` 的 `PRESET_DEFAULTS.captureLongEdge` 从这里取默认值，
 * 单支预设仍可用自己的 `captureLongEdge` 覆盖（`resolvePreset` 的 `??` 链）。
 *
 * 三档只差在这一个数字上。构图完全不受影响 —— `geometry.ts` 的 `computeFrameLayout`
 * 算出来的一切都是**逻辑点**，成片像素 = 点尺寸 × 设备像素比，所以画质档只买清晰度，
 * 不买焦距、不买取景范围。
 *
 *   档位       id          长边      截屏上下文（宽 × 高 × 4B）粗略峰值
 *   标准       standard    2048 px   约 12 MB
 *   高清       high        3024 px   约 27 MB
 *   极致       max         4032 px   约 48 MB
 *
 * 内存口径的完整推导在 `utils/captureOptions.ts` 头注释里（那里还解释了为什么
 * 截图只能走 `drawViewHierarchyInRect`，以及为什么"传更大的点尺寸"能真的多出像素）。
 * 再叠上原图的解码副本，峰值大致翻倍 —— 这就是默认停在 `standard` 的原因。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 怎么改
 * ─────────────────────────────────────────────────────────────────────────
 * · 想改默认档：改 `DEFAULT_CAPTURE_QUALITY`（当前 'standard'）。
 * · 想改某一档的像素：只改下面的 `longEdge`。UI 是按数组渲染的，不用动布局代码。
 * · 想让某支卷永远更大/更小：给那支卷积的 `captureLongEdge` 写个数（覆盖用户档位）。
 * ─────────────────────────────────────────────────────────────────────────
 */
import type { MessageKey, TranslateFn } from '../i18n/types';
import type { CaptureQuality } from '../types';

/** 一档画质。`longEdge` 的单位是成片长边的**像素数**，不是取景器里的点。 */
export interface CaptureQualitySpec {
  id: CaptureQuality;
  /** i18n 键。五个语言文件里一一对应（`settings.quality.*`）。 */
  labelKey: MessageKey;
  /** 成片长边目标像素数；0 表示"不指定，用屏幕原生分辨率"。 */
  longEdge: number;
  /** 给读代码的人看的备注（不进 UI；UI 用的是 i18n 文案）。 */
  note?: string;
}

const STANDARD: CaptureQualitySpec = {
  id: 'standard',
  labelKey: 'settings.quality.standard',
  longEdge: 2048,
  note: '开机默认。2048px 长边（3:2 时约 3072×2048）：冲印 6 寸、朋友圈、相册网格都够，内存最省。',
};

const HIGH: CaptureQualitySpec = {
  id: 'high',
  labelKey: 'settings.quality.high',
  longEdge: 3024,
  note: '3024px 长边：放大到 100% 仍能看，裁切后还有余量；上下文内存约翻倍。',
};

const MAX: CaptureQualitySpec = {
  id: 'max',
  labelKey: 'settings.quality.max',
  longEdge: 4032,
  note: '4032px 长边：画布最大，冲印 A4 也不糊。注意这只是"画布更大"，不是相机多拍了像素 —— 源图不够大时会被夹回源长边（见 captureOptions.ts 的 clampedToSource）。',
};

/** 三档画质，顺序 = 设置页里从左到右的顺序（由低到高）。 */
export const CAPTURE_QUALITIES: readonly CaptureQualitySpec[] = [STANDARD, HIGH, MAX];

/** 开机用哪一档。'standard' 是绝大多数人想要的默认（也是最省的）。 */
export const DEFAULT_CAPTURE_QUALITY: CaptureQuality = 'standard';

/**
 * 按 id 找档位；认不出来就退回默认档（再不行就用 `standard` 这条常量）。
 * 参数放宽到 `string` 是因为它同时服务于"UI 里选中的值"和"从存储里读回来的脏数据"。
 */
export function findCaptureQualitySpec(id: string | null | undefined): CaptureQualitySpec {
  const found = CAPTURE_QUALITIES.find((spec) => spec.id === id);
  if (found !== undefined) {
    return found;
  }
  const fallback = CAPTURE_QUALITIES.find((spec) => spec.id === DEFAULT_CAPTURE_QUALITY);
  return fallback ?? STANDARD;
}

/** 按 id 找档位 id；认不出来退回 `'standard'`。写回设置、比较选中态都用它。 */
export function findCaptureQuality(id: string | null | undefined): CaptureQuality {
  return findCaptureQualitySpec(id).id;
}

/** 档位 → 成片长边像素数。传给 `planCapture({ targetLongEdge })` 用这个。 */
export function resolveCaptureLongEdge(quality: CaptureQuality): number {
  return findCaptureQualitySpec(quality).longEdge;
}

/**
 * 给 UI 用的**一句话**：这一档买到了什么、买不到什么。必须如实。
 *
 * 它要说清的两件事：
 *  1. 这一档只决定**成片的长边像素**（合成舞台的截屏画布），不改变相机拿到了多少像素 ——
 *     所以「极致 / 4032px」**不是 48MP**，也永远变不成 48MP；
 *  2. 真 48MP 需要原生相机模块（原因见本文件头）。纯 JS 侧没有这条路。
 *
 * `t` 传了就用本地化的 `settings.quality.note` 起头（五种语言都有）；再拼上后半句
 * **语言中立的事实标注**：它只含数字与 `48MP` / `native` 两个专有词，五种语言的读者
 * 读到的信息完全一致，也不会在翻译里漂移成一句"承诺"。
 *
 * 如果 Lead 之后补了 `settings.quality.capNote`（值形如
 * `最长边 {longEdge}px；真 48MP 需原生相机模块`），把 `capabilityFact` 那一行换成
 * `t('settings.quality.capNote', { longEdge: spec.longEdge })` 即可，调用点不用动。
 */
export function captureQualityCapNote(quality: CaptureQuality, t?: TranslateFn): string {
  const spec = findCaptureQualitySpec(quality);
  /*
   * v1.7.0 收尾：五种语言都补上了 `settings.quality.capNote`（Lead 加），所以这句
   * 事实标注现在**跟着语言走**，不再是一句中英混排的英文尾巴 —— 中文界面里
   * 突然冒出一句英文，用户读起来像没翻译完的占位串。
   * 语言中立的那版留作兜底：`t` 没传、或某个语言文件漏了这个键（`t` 返回空串）时用。
   */
  const capabilityFact = `long edge ${spec.longEdge}px · true 48MP needs a native camera module`;
  if (t === undefined) {
    return capabilityFact;
  }
  const localizedCap = t('settings.quality.capNote', { longEdge: spec.longEdge });
  if (localizedCap !== '') {
    return localizedCap;
  }
  const localized = t('settings.quality.note');
  return localized === '' ? capabilityFact : `${localized} · ${capabilityFact}`;
}
