/**
 * 相框材质表（v1.8.3）—— 每款相框都能换 A/B/C 三种**暗房卡纸材质**。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * v1.8.3 为什么重写
 * ─────────────────────────────────────────────────────────────────────────
 * 用户报："导出的相框顶部/底部下巴有 5~6 道像楼梯/百叶窗的水平长条色带"。
 * 病灶是 v1.8.0 那套「用多块色条拼接模拟材质」的实现：
 *
 *   · BARYTA 的 `gradientSteps: 12` —— 每条边带沿纵轴切成 12 条逐级混色，
 *     相邻条之间的硬色阶在 300~500pt 的成片上就是百叶窗；
 *   · BARYTA 的 `bloom` 6 级晕染 —— 每级一块横带，第二组条纹；
 *   · OBSIDIAN 同样 `gradientSteps: 12`（深色纸上更明显）；
 *   · `shade`（贴边接触阴影）/ `cut`（金属切边）/ `emboss`（四边明暗压痕）
 *     也是一圈多块小色块拼出来的，同属"分段拼接"。
 *
 * 这一版把它们**全部删掉**。材质只剩两件事：
 *   1. `base` —— 一整块单一平整的实色卡纸（每款相纸的 3 种材质各一个色值）；
 *   2. `borderColor` + `borderWidth` —— 照片内窗四周那一条 1pt 压痕内框线。
 *
 * **没有分段就没有条纹**：画布上再也不会出现"相邻两块不同色"的接缝。
 * 非材质装饰（相纸素材 PNG 自带的底纹/划痕/齿孔）不受影响，那属于
 * `constants/frames.ts`，材质层不碰。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 这个文件为什么单独存在
 * ─────────────────────────────────────────────────────────────────────────
 * 相框本身（纸面、开孔、齿孔…）是**素材**，见 `constants/frames.ts`；
 * 材质是**画出来的**（纯 `<View>` 叠层，见 `components/FrameSkin.tsx`）。两者正交：
 *   · `frames.ts`     决定"这张相纸长什么样、照片从哪个洞露出来"；
 *   · 本文件          是材质的**唯一配方产地**：底色 / 内框线都在这里，别处不许写第二份；
 *   · `FrameSkin.tsx` 是**唯一**的渲染实现 —— 取景器实时预览、抽屉迷你预览、
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
 * 1. **任何材质元素都不许压进照片镂空窗口**（`FrameSkinProps.window`）。
 *    材质只许落在"相纸 − 窗口"那四条边带里（`FrameSkin.marginBands()` 负责切）。
 * 2. 内框线宽度是**写死的 pt**（规格要求 1px），不再用短边比例：
 *    现在整层只有这一条线，预览与成片都是 1pt，元素集合天然一致。
 * 3. 配方**确定性地**只由材质 id 决定：没有随机数、没有 seed ——
 *    材质是几何与颜色，不该"每次进来长得不一样"。`FrameSkinProps.seed`
 *    字段为兼容保留，本表与渲染层都不使用。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 怎么加一种材质（4 步）
 * ─────────────────────────────────────────────────────────────────────────
 * 1. `src/types/index.ts` 的 `FrameVariant` 联合类型里加字面量（⚠️ 不是本文件）；
 * 2. 五个语言文件里加 `frame.variant.<id>`（读屏用的整句走 `frame.variant.a11y`）；
 * 3. 往下面的 `FRAME_VARIANTS`（= `FRAME_MATERIALS`）加一条配方；
 * 4. 抽屉里的材质芯片会自动多一枚 —— 它只读 `base` / `borderColor`，不用改。
 *
 * ⚠️ 顺序不要乱改：`findFrameVariantIndex` 的下标、`wrapFrameVariant` 的环回、
 *    抽屉里的芯片全靠数组顺序（A→B→C）。
 */
import type { MessageKey } from '../i18n/types';
import type { FrameVariant } from '../types';

/** 一种材质。UI（抽屉芯片）只读 `base` / `borderColor`，其余归渲染层与铭文层。 */
export interface FrameMaterialSpec {
  id: FrameVariant;
  /** i18n 键。五个语言文件里一一对应（`frame.variant.*`）。 */
  labelKey: MessageKey;
  /**
   * 相纸基色 —— 也是抽屉芯片的底色（芯片要显示**真实材质色**，不是文字标签）。
   * 渲染时铺在"相纸 − 照片窗口"的四条边带上，**不透明、不混色**，
   * 所以用户看到的纸色就是这里的 `#RRGGBB`，不会再被渐变/晕染改掉。
   */
  base: string;
  /**
   * 照片内窗四周的 1pt 压痕内框线颜色（`rgba(...)`）。
   * 三款材质各用一条与纸色协调的线：白纸用 12% 黑、暖黄用 18% 暖棕、黑纸用 14% 白。
   */
  borderColor: string;
  /** 内框线宽度（pt）。规格写死 1px，三款材质一致。 */
  borderWidth: number;
  /** 铭文色：相纸留白上的字用它（水印实际取值仍由 `FrameSpec.watermark` 决定）。 */
  engravingColor: string;
  /** 日期墨色的材质默认值（`#RRGGBB`）。 */
  dateColor: string;
  /** 给人看的备注（**不进 UI** —— 界面文案一律走 i18n）。 */
  description: string;
}

/**
 * A 经典原白 `archival`：`#F6F5F0` 单一平整实色卡纸，照片内窗四周 1pt 内框线
 * `rgba(0, 0, 0, 0.12)`。铭文 `#8C8881`，日期默认琥珀橙。
 */
const ARCHIVAL: FrameMaterialSpec = {
  id: 'archival',
  labelKey: 'frame.variant.archival',
  base: '#F6F5F0',
  borderColor: 'rgba(0, 0, 0, 0.12)',
  borderWidth: 1,
  engravingColor: '#8C8881',
  dateColor: '#FF8A00',
  description: '经典原白：#F6F5F0 单一平整实色卡纸 + 照片内窗四周 1pt 内框线 rgba(0, 0, 0, 0.12)。',
};

/**
 * B 岁月暖黄 `baryta`：`#EDE3CE`（暖杏重晶石）单一平整实色卡纸，
 * 1pt 内框线 `rgba(80, 60, 40, 0.18)`。**严禁拼色条** —— 这就是用户报的百叶窗来源。
 * 铭文 `#7A6A4E`，日期默认暖橙。
 */
const BARYTA: FrameMaterialSpec = {
  id: 'baryta',
  labelKey: 'frame.variant.baryta',
  base: '#EDE3CE',
  borderColor: 'rgba(80, 60, 40, 0.18)',
  borderWidth: 1,
  engravingColor: '#7A6A4E',
  dateColor: '#FF9E2C',
  description: '岁月暖黄：#EDE3CE（暖杏重晶石）单一平整实色卡纸 + 照片内窗四周 1pt 内框线 rgba(80, 60, 40, 0.18)。',
};

/**
 * C 暗房雅黑 `obsidian`：`#141416`（深邃哑光黑）单一平整实色卡纸，
 * 1pt 内框线 `rgba(255, 255, 255, 0.14)`。**严禁浅灰横线**。
 * 铭文 `#A9AAB2`，日期默认 LED 琥珀红。
 */
const OBSIDIAN: FrameMaterialSpec = {
  id: 'obsidian',
  labelKey: 'frame.variant.obsidian',
  base: '#141416',
  borderColor: 'rgba(255, 255, 255, 0.14)',
  borderWidth: 1,
  engravingColor: '#A9AAB2',
  dateColor: '#FF5A3C',
  description: '暗房雅黑：#141416（深邃哑光黑）单一平整实色卡纸 + 照片内窗四周 1pt 内框线 rgba(255, 255, 255, 0.14)。',
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
