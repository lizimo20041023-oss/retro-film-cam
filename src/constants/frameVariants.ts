/**
 * 相框风格变体表（v1.7.0）—— 每款相框都能换 A/B/C 三种皮肤。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 这个文件为什么单独存在
 * ─────────────────────────────────────────────────────────────────────────
 * 相框本身（纸面、开孔、齿孔、药水痕…）是**素材**，见 `constants/frames.ts`；
 * 风格变体是**画出来的**（纯 `<View>` 叠加层，见 `components/FrameSkin.tsx`）。
 * 两者正交：
 *   · `frames.ts`     决定"这张相纸长什么样、照片从哪个洞露出来"；
 *   · 本文件          决定"同一张相纸有哪几种做旧 / 涂鸦的花样、抽屉里的顺序"；
 *   · `FrameSkin.tsx` 是**唯一**的渲染实现 —— 取景器里的实时预览与成片截图
 *     共用它，所以预览和成片不会对不上（v1.7.0 的硬要求）。
 *
 * ⚠️ 这里**不 require 任何素材**，也不 import `frames.ts`：
 *    这张表要被设置页 / 胶片抽屉 / 取景器一起引用，把 PNG 拖进这条依赖链
 *    没有任何好处（所以下面的 `wrapFrameVariant` 自己写了一遍取模，
 *    算式与 `frames.ts` 的 `wrapIndex` 完全一致）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 怎么加一种风格（3 步）
 * ─────────────────────────────────────────────────────────────────────────
 * 1. `src/types/index.ts` 的 `FrameVariant` 联合类型里加字面量（⚠️ 不是本文件）；
 * 2. 五个语言文件里加 `frame.variant.<id>`（读屏用的整句走 `frame.variant.a11y`）；
 * 3. 往下面 `FRAME_VARIANTS` 加一条 —— 数组顺序 = 抽屉里左右滑动的顺序 =
 *    胶囊从左到右的顺序；再去 `FrameSkin.tsx` 的 `buildSkinWash` /
 *    `buildSkinElements` 里给它画皮肤。
 *    **别忘了一起守住"确定性"**：图案只由 (variant, seed, 尺寸, 窗口) 决定，
 *    不许用 `Date.now()` / `Math.random()`，否则小尺寸预览与成片大画布会长得不一样。
 *
 * ⚠️ 顺序不要乱改：`findFrameVariantIndex` 的下标、`wrapFrameVariant` 的环回、
 *    抽屉里的胶囊全靠数组顺序。新变体加在末尾；`classic` 必须留在 0 号位 ——
 *    它是 `DEFAULT_FRAME_VARIANT`，也是"没有皮肤"的那个档（见 FrameSkin 的说明）。
 */
import type { MessageKey } from '../i18n/types';
import type { FrameVariant } from '../types';

/** 一种风格变体。UI 只认 `labelKey`，`description` 是写给读代码的人的。 */
export interface FrameVariantSpec {
  id: FrameVariant;
  /** i18n 键。五个语言文件里一一对应（`frame.variant.*`）。 */
  labelKey: MessageKey;
  /**
   * 给人看的备注（**不进 UI** —— 界面文案一律走 i18n，别把这里的字直接渲染出去）。
   * 说明这一档到底画了什么，方便下次改配方时知道自己在动哪一层。
   */
  description?: string;
}

/**
 * A 经典纯净：什么都不画。
 *
 * 这是**默认档**，也是唯一一个 `FrameSkin` 会 `return null` 的档：
 * 没有皮肤时渲染树必须和 v1.6.1 逐像素一致（那些版本发出去的成片不该被改样子）。
 */
const CLASSIC: FrameVariantSpec = {
  id: 'classic',
  labelKey: 'frame.variant.classic',
  description: '原样：只贴素材相框，不叠任何东西。渲染树与 v1.6.1 完全一致。',
};

/**
 * B 泛黄复古：整幅 `#F4EEDC` 暖化层（multiply）+ 四周暗房晕染 + 岁月斑点。
 *
 * 暖化层是**整幅**的（含照片窗口，理由见 FrameSkin.tsx 顶部）；
 * 晕染与斑点只落在相纸留白里，绝不压进照片。
 */
const AGED: FrameVariantSpec = {
  id: 'aged',
  labelKey: 'frame.variant.aged',
  description:
    '发黄的老相纸：整幅 #F4EEDC multiply 暖化 + 四边由外向内 6 级暗房晕染 + 20 颗岁月斑点。',
};

/**
 * C 手绘涂鸦：粉 / 黄 / 蓝撞色波点 + 空心圈 + 2~3 条手绘笔触。
 *
 * 只用留白：所有图形都躲开照片窗口（几何靠 `isOutsideWindow` 过滤，
 * 见 FrameSkin.tsx）。配色故意不收敛 —— 这一档要"潮"，不要像 UI 控件。
 */
const DOODLE: FrameVariantSpec = {
  id: 'doodle',
  labelKey: 'frame.variant.doodle',
  description:
    'Dazz 手绘涂鸦：约 16 颗撞色波点（口径 1.5%~5% 相纸宽）+ 4 个空心圈 + 3 条旋转圆角笔触，全在留白里。',
};

/** 三种风格，顺序 = 抽屉里左右滑动的顺序 = 胶囊从左到右的顺序（A→B→C）。 */
export const FRAME_VARIANTS: readonly FrameVariantSpec[] = [CLASSIC, AGED, DOODLE];

/** 冷启动用哪一档。'classic'（= 不叠皮肤）是默认，别的一档会让老用户的成片突然变样。 */
export const DEFAULT_FRAME_VARIANT: FrameVariant = 'classic';

/**
 * 按 id 找变体下标；认不出来返回 0（= classic），绝不抛错。
 * 参数放宽到 `string`：它同时服务"设置里读回来的脏数据"和"UI 里选中的值"。
 */
export function findFrameVariantIndex(id: string): number {
  const index = FRAME_VARIANTS.findIndex((variant) => variant.id === id);
  return index >= 0 ? index : 0;
}

/**
 * 循环取下标：3 档时 -1 → 2，3 → 0。抽屉里左右滑 / 点按上一下一档都靠它。
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
