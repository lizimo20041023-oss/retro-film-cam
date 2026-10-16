/**
 * 相框材质表（v1.8.0）—— 每款相框都能换 A/B/C 三种**暗房卡纸材质**。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * v1.8.0 为什么把 v1.7.0 那一版推翻
 * ─────────────────────────────────────────────────────────────────────────
 * v1.7.0 的 C 档是"手绘涂鸦贴纸"（几何波点 / 空心圈 / 笔触）。用户的原话是
 * **"任何试图用几何图形模拟手绘贴纸感的行为显得极度廉价与割裂"** —— 于是那条路线
 * 连同它的全部代码与常量一起删掉了（不是停用：`FrameSkin.tsx` 里现在搜不到
 * `DOODLE` / 波点 / 笔触任何一个标识符，探针第 5 节守着这件事）。
 *
 * 现在三档是**材质**：纸的颜色、纸的明暗、纸被压出来的那道边、光打在纸沿上的那条线。
 * 真实卡纸的好看之处来自"渐变 + 明暗 + 边界"，不来自往纸上贴图形。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 这个文件为什么单独存在
 * ─────────────────────────────────────────────────────────────────────────
 * 相框本身（纸面、开孔、齿孔、药水痕…）是**素材**，见 `constants/frames.ts`；
 * 材质是**画出来的**（纯 `<View>` 叠加层，见 `components/FrameSkin.tsx`）。两者正交：
 *   · `frames.ts`     决定"这张相纸长什么样、照片从哪个洞露出来"；
 *   · 本文件          是材质的**唯一配方产地**：底色 / 渐变端点 / 压痕 / 晕染 /
 *                     铭文色 / 日期色 / 边缘切边，全都在这里，别处不许再写第二份；
 *   · `FrameSkin.tsx` 是**唯一**的渲染实现 —— 取景器的实时预览、抽屉里的迷你预览、
 *     成片截图三处共用它，所以三处不会对不上。
 *
 * ⚠️ 这里**不 require 任何素材**，也不 import `frames.ts`：这张表要被设置页 /
 *    底片抽屉 / 取景器一起引用，把 PNG 拖进这条依赖链没有任何好处
 *    （所以下面的 `wrapFrameVariant` 自己写了一遍取模，算式与 `frames.ts`
 *    的 `wrapIndex` 完全一致）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 硬规则（改这个文件之前先读）
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **任何材质元素都不许压进照片镂空窗口**（`FrameSkinProps.window`）。v1.7.0 的
 *    B 档是一整幅乘算暖化层、连照片一起泛黄，用户报的"白雾"就是这条的同类问题。
 *    材质只许落在"相纸 − 窗口"那四条边带里（`marginBands()` 已经把留白切好了）。
 * 2. 几何厚度一律写成**相纸短边的比例**（`ratio`），不写死 pt：取景器预览只有
 *    96~120pt 相纸、成片是 300~500pt，写死 pt 会让两边的元素集合分叉。
 * 3. 配方**确定性地**只由 (材质, 相纸尺寸, 窗口) 决定：没有随机数、没有 seed ——
 *    材质是几何与颜色，不该"每次进来长得不一样"（也正因如此，探针能对小预览与
 *    整幅成片逐元素断言全等）。`FrameSkinProps.seed` 字段为兼容保留，本表不使用。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 怎么加一种材质（4 步）
 * ─────────────────────────────────────────────────────────────────────────
 * 1. `src/types/index.ts` 的 `FrameVariant` 联合类型里加字面量（⚠️ 不是本文件）；
 * 2. 五个语言文件里加 `frame.variant.<id>`（读屏用的整句走 `frame.variant.a11y`）；
 * 3. 往下面 `FRAME_MATERIALS`（= `FRAME_VARIANTS`）加一条；
 * 4. 若它需要新的渲染层（比如"边缘切边"之外的什么），去 `FrameSkin.tsx` 的
 *    `buildSkinElements` 里加一节，并在探针里补断言。
 *
 * ⚠️ 顺序不要乱改：`findFrameVariantIndex` 的下标、`wrapFrameVariant` 的环回、
 *    抽屉里的芯片全靠数组顺序（A→B→C）。
 */
import type { MessageKey } from '../i18n/types';
import type { FrameVariant } from '../types';

/** 一种墨色：色值 + 不透明度分开写 —— 渲染层直接吃，探针也能逐字段断言。 */
export interface MaterialInk {
  /** `#RRGGBB`（探针断言色值格式与具体配方）。 */
  color: string;
  /** 0~1。 */
  alpha: number;
}

/**
 * 暗房晕染：从相纸**外沿往里**每一级占该边留白厚度的比例，以及那一级的 alpha。
 * 越靠边越深 = "药水从边上渗进来"。`steps` 与 `alphas` 一一对应、等长。
 */
export interface MaterialBloom {
  /** 墨色 RGB（`rgba(r, g, b, alpha)`，整圈色相统一）。 */
  ink: { r: number; g: number; b: number };
  steps: readonly number[];
  alphas: readonly number[];
}

/**
 * 一条极细的边（压痕 / 接触阴影 / 切边）。
 * `ratio` = 厚度占**相纸短边**的比例（同硬规则 2）。
 */
export interface MaterialLine extends MaterialInk {
  ratio: number;
}

/** 边缘切边（只有暗色材质有）：外沿一道金属高光，四边明暗不同。 */
export interface MaterialCut {
  /** 左右两条边的颜色。 */
  ink: MaterialLine;
  /** 顶边的高光（光从上面来，顶边最亮）。 */
  topHighlight: MaterialInk;
  /** 底边（最暗，收住整块纸的厚度）。 */
  bottomShadow: MaterialInk;
}

/** 一种材质。UI（抽屉芯片）只读 `base` / `engravingColor` / `cut`，别的一律归渲染层。 */
export interface FrameMaterialSpec {
  id: FrameVariant;
  /** i18n 键。五个语言文件里一一对应（`frame.variant.*`）。 */
  labelKey: MessageKey;
  /**
   * 相纸基色 —— 也是抽屉芯片的底色（芯片要显示**真实材质色**，不是文字标签）。
   * 渲染时以 `multiply` 叠在素材相框的纸面上，所以纸本身的纹路/折痕会透出来。
   */
  base: string;
  /** 竖向渐变的顶端色（相纸顶边）。与 `gradientBottom` 相同 = 平色，不再切细条。 */
  gradientTop: string;
  /** 竖向渐变的底端色（相纸底边）。 */
  gradientBottom: string;
  /** 渐变切几条（仅当两端点不同时才 >1；切法见 `FrameSkin.buildSkinElements`）。 */
  gradientSteps: number;
  /** 窗口内侧的内凹压痕：一圈极细的明暗对比（暗在上/左，亮在下/右 = 凹下去）。 */
  emboss: {
    light: MaterialInk;
    dark: MaterialInk;
    ratio: number;
  };
  /** 相纸外沿的接触阴影（相纸**内侧**贴边的一圈）：让纸"贴在底上"而不是飘着。 */
  shade: MaterialLine;
  /** 边缘切边；`null` = 这种材质不画（哑光纸没有金属边）。 */
  cut: MaterialCut | null;
  /** 暗房晕染；`null` = 不画。 */
  bloom: MaterialBloom | null;
  /** 铭文色：相纸留白上的字用它（水印实际取值仍由 `FrameSpec.watermark` 决定）。 */
  engravingColor: string;
  /** 日期墨色的材质默认值（`#RRGGBB`）。 */
  dateColor: string;
  /** 给人看的备注（**不进 UI** —— 界面文案一律走 i18n）。 */
  description: string;
}

/**
 * A 经典原白 `archival`：`#F7F6F1` 平色纸 + 窗口内侧一圈 1px 内凹压痕 + 边缘干净阴影。
 * 铭文 `#8C8881`，日期默认琥珀橙。纸面本身是素材（不做旧、不加花）。
 */
const ARCHIVAL: FrameMaterialSpec = {
  id: 'archival',
  labelKey: 'frame.variant.archival',
  base: '#F7F6F1',
  gradientTop: '#F7F6F1',
  gradientBottom: '#F7F6F1',
  gradientSteps: 1,
  emboss: {
    light: { color: '#FFFFFF', alpha: 0.72 },
    dark: { color: '#000000', alpha: 0.2 },
    ratio: 0.0028,
  },
  shade: { color: '#000000', alpha: 0.1, ratio: 0.0022 },
  cut: null,
  bloom: null,
  engravingColor: '#8C8881',
  dateColor: '#FF8A00',
  description:
    '经典原白：平色 #F7F6F1 纸面 + 窗口内侧 1px 内凹压痕（暗上左 / 亮下右）+ 四边贴边接触阴影。',
};

/**
 * B 岁月暖黄 `baryta`：`#F2E9D5 → #DFCEAE` 自然竖向渐变 + 窗口内侧极淡褐晕染。
 * 晕染最深处只有 0.115（v1.7.0 的 aged 是 0.2），要的是"暗房化学显影"的观感而不是脏。
 */
const BARYTA: FrameMaterialSpec = {
  id: 'baryta',
  labelKey: 'frame.variant.baryta',
  base: '#E9DCBF',
  gradientTop: '#F2E9D5',
  gradientBottom: '#DFCEAE',
  gradientSteps: 12,
  emboss: {
    light: { color: '#FFF9EC', alpha: 0.62 },
    dark: { color: '#3C280F', alpha: 0.24 },
    ratio: 0.0028,
  },
  shade: { color: '#5A421E', alpha: 0.12, ratio: 0.0022 },
  cut: null,
  bloom: {
    ink: { r: 120, g: 88, b: 40 },
    steps: [0.14, 0.16, 0.18, 0.18, 0.18, 0.16],
    alphas: [0.115, 0.09, 0.07, 0.052, 0.038, 0.026],
  },
  engravingColor: '#7A6A4E',
  dateColor: '#FF9E2C',
  description:
    '岁月暖黄：#F2E9D5→#DFCEAE 竖向 12 级渐变 + 窗口内侧 6 级极淡褐晕染（最高 0.115）+ 暖棕贴边阴影。',
};

/**
 * C 暗房雅黑 `obsidian`：`#1A1A1D` 纸面（顶 `#1E1E22` → 底 `#151517` 的极淡明暗）
 * + 外沿一道金属高光切边（顶最亮 / 底最暗）+ 银灰铭文，日期默认 LED 琥珀红。
 */
const OBSIDIAN: FrameMaterialSpec = {
  id: 'obsidian',
  labelKey: 'frame.variant.obsidian',
  base: '#1A1A1D',
  gradientTop: '#1E1E22',
  gradientBottom: '#151517',
  gradientSteps: 12,
  emboss: {
    light: { color: '#FFFFFF', alpha: 0.16 },
    dark: { color: '#000000', alpha: 0.55 },
    ratio: 0.0028,
  },
  shade: { color: '#000000', alpha: 0.45, ratio: 0.0022 },
  cut: {
    ink: { color: '#C9CBD4', alpha: 0.55, ratio: 0.0022 },
    topHighlight: { color: '#F2F3F7', alpha: 0.7 },
    bottomShadow: { color: '#5A5C63', alpha: 0.5 },
  },
  bloom: null,
  engravingColor: '#A9AAB2',
  dateColor: '#FF5A3C',
  description:
    '暗房雅黑：#1A1A1D 纸面（#1E1E22→#151517 极淡明暗）+ 外沿金属切边（顶 #F2F3F7 / 边 #C9CBD4 / 底 #5A5C63）+ 银灰铭文。',
};

/** 三种材质，顺序 = 抽屉里左右滑动的顺序 = 芯片从左到右的顺序（A→B→C）。 */
export const FRAME_VARIANTS: readonly FrameMaterialSpec[] = [ARCHIVAL, BARYTA, OBSIDIAN];

/** 别名：材质 = 配方，名字更直白，新代码读这个。 */
export const FRAME_MATERIALS: readonly FrameMaterialSpec[] = FRAME_VARIANTS;

/**
 * 冷启动 / 存量脏数据回落到哪一档。
 * ⚠️ 必须与 `utils/settingsStore.ts` 的 `DEFAULT_SETTINGS.frameVariant` **一致**
 * （`'archival'`）—— 那边故意不 import 本文件（见它自己的注释），所以这里是两处手抄，
 * 改一处必须改另一处，探针里有一条断言盯着它俩。
 */
export const DEFAULT_FRAME_VARIANT: FrameVariant = 'archival';

/** 按 id 取材质；认不出来返回默认那一档（设置页 / 渲染层都用它兜底，绝不抛错）。 */
export function findFrameMaterial(id: string): FrameMaterialSpec {
  return FRAME_MATERIALS[findFrameVariantIndex(id)];
}

/**
 * 按 id 找材质下标；认不出来返回 0（= `archival`），绝不抛错。
 * 参数放宽到 `string`：它同时服务"设置里读回来的脏数据"和"UI 里选中的值"。
 */
export function findFrameVariantIndex(id: string): number {
  const index = FRAME_VARIANTS.findIndex((material) => material.id === id);
  return index >= 0 ? index : 0;
}

/**
 * 循环取下标：3 档时 -1 → 2，3 → 0。抽屉里左右滑 / 点按上一档下一档都靠它。
 *
 * 算式与 `constants/frames.ts` 的 `wrapIndex` 一字不差（负数先加上 length 再取模），
 * 但不能直接 import 它 —— 那会把 `frames.ts` 里的一堆 PNG require 拖进本模块。
 */
export function wrapFrameVariant(index: number): number {
  const length = FRAME_VARIANTS.length;
  if (length <= 0) {
    return 0;
  }
  return ((index % length) + length) % length;
}
