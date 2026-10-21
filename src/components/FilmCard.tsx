/**
 * 一格胶片预设卡片。抽屉（`FilmDrawer.tsx`）里两列平铺十个。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么颜色块是"算"出来的，不是截图
 * ─────────────────────────────────────────────────────────────────────
 * 「一眼看出这卷是什么味道」最直观的办法当然是拿真实样片，但项目里没有、
 * 也不该为十个预设各烧一张烘焙图（体积、维护、和真实成像对不上，三头不讨好）。
 * 退而求其次的做法是**从预设自己的光学配方反推一个近似色块**：
 * 拿一个中灰当"标准场景"，把 v1.9.4 的零模糊解耦管线（同源 S 曲线 overlay
 * 明度雕塑 → 同源 color 色度锁 → screen 克制提亮 → 化学冷暖分离色 → 暗角边缘）
 * 依次施加一遍，得到的三个色阶就是这卷胶片的性格 —— S 曲线强的顶出高反差、
 * 色度锁强的保色更真、提亮大的中间调更亮、暖卷偏琥珀、冷卷偏青、黑白卷三档全灰。
 *
 * ⚠️ 它**不等于**成片效果（真正的合成在 `FilmCompositor` / `gradeLayers` 里，
 * 还要叠颗粒、漏光、暗角）。这里只是色偏方向和强度的示意，别拿它当取色器。
 *
 * ⚠️ v1.9.4 起 swatch 不再画 color-burn 的压暗项，改成**色度锁对饱和度的影响**：
 * chromaLock 越高 → 染色层的吃料越接近原色 → swatch 的色偏/饱和度越明显；
 * 黑白卷不写 chromaLock，直接走 BT.709 亮度转灰。
 *
 * ─────────────────────────────────────────────────────────────────────
 * ─────────────────────────────────────────────────────────────────────
 * 选中态为什么是"边框 + 右上角 ✓"两条
 * ─────────────────────────────────────────────────────────────────────
 * 用户给的规格就是这两条：当前激活的那张边框高亮成琥珀橙 `#E5A93C`，
 * 右上角再盖一个 `✓`。为什么要两条而不是一条：抽屉里十一张卡的色块颜色本身就
 * 五花八门，只靠一圈描边的话，在浅色色块旁边（比如褪色很重的过期片）对比度
 * 会掉下去；`✓` 是一个**和颜色无关**的形状信号，扫一眼就知道选的是哪张。
 * 左侧那根 2pt 竖条是 v1.2.0 留下的第三个信号，保留 —— 三者在同一个位置
 * （卡片边缘/角上），不会互相打架。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么要 memo，以及为什么 props 里传的是 id 而不是对象
 * ─────────────────────────────────────────────────────────────────────
 * 抽屉共十一张卡。`PRESETS` 是模块级常量、引用永不变化，所以只要传进来的
 * 是**基本类型**（`presetId` / `selected` / `onSelect`），`memo` 就真的能挡住
 * "打开抽屉时父组件重渲染导致十一张卡全部重画"。如果改成把 `preset` 对象或
 * 内联箭头函数传进来，`memo` 会失效 —— 所以调用方必须传稳定的 `onSelect`
 * （`CameraScreen` 里用 `useCallback` 包的）。
 */
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { FilmPreset } from '../types';
import { UI_MONO, useTheme } from '../constants/theme';
import type { Theme } from '../constants/theme';
import { useI18n } from '../i18n';

export interface FilmCardProps {
  preset: FilmPreset;
  selected: boolean;
  /** 卡片在网格里的宽度（由抽屉按窗口宽度算好传进来，卡片自己不做布局计算）。 */
  width: number;
  onSelect: (presetId: string) => void;
}

/** 色块高度。够看出色偏，又不至于把两列网格撑成一条长列表。 */
const SWATCH_HEIGHT = 34;

/**
 * 选中态原来写死 `#E5A93C`，理由是"`INK.amber`（`#D28B2A`）偏暗"。现在主题的
 * `ink.amber` 就是 `#E5A93C`，写死的理由没了 —— 而它会在浅色主题下留下一根
 * 和主题红不一致的橙线，所以改读主题。
 *
 * 为什么不直接写 `rgba(...)`：主题只给纯色，描边要"压"在色块上需要透明度，
 * 于是这里按前缀把 hex 拆成 rgb 再加 alpha。**放在本文件导出**是给 `FilmDrawer`
 * 复用的（它那条标题分隔线同样需要琥珀色 28%），而 `src/utils/**` 不在这次改动范围内。
 */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.startsWith('#') ? color.slice(1) : '';
  if (hex.length !== 6) {
    // 主题值将来若换成 `rgb()` 写法也还能用：退化成不带透明度的原色，
    // 总比抛错或者画出全透明的线要好。
    return color;
  }
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/** `✓` 角标的直径。小到不抢色块，大到 10pt 的字也放得下。 */
const CHECK_SIZE = 16;

/**
 * 描述文字的最小缩放比（配 `adjustsFontSizeToFit`）。
 * 取 0.7 是为了对齐标题那一处（`FilmDrawer` 的 `minimumFontScale={0.7}`），
 * 同时把最窄的机器也罩住：最长那条描述 41 字，9pt 下约 334.6pt 宽，
 * 而 320pt 宽的机器上卡片有 140pt、两行能给 248pt → 需要缩到约 0.74；
 * 再窄到卡片下限 `CARD_MIN_WIDTH`（132pt）时可用 116pt、两行 232pt → 约 0.69。
 * 缩到这个下限还不够就仍是 `…`，但那已经比 `numberOfLines={1}` 好得多。
 */
const DESCRIPTION_MIN_SCALE = 0.7;

/**
 * 把通道值夹回 v1.9.4 的合法区间 [6, 250]。
 *
 * 为什么不是 0~255：饱和/封顶的色块在抽屉里会读成"纯色贴纸"而不是"胶片色"，
 * 而且 0/255 的通道在深色主题下对比度会炸；契约 §6 明确要求通道值夹在 [6,250]。
 */
function clampChannel(value: number): number {
  if (value < 6) {
    return 6;
  }
  if (value > 250) {
    return 250;
  }
  return value;
}

/** 中灰：所有近似都以它为起点，相当于"标准场景的中间调"（v2.1.0 取 88 让九卷染色三档都落在 [6,250] 内且不封顶）。 */
const BASE_GRAY = 88;
/**
 * v1.9.4 黑位托底（同源 multiply 自叠）对色块底部的满量程下压：
 * 覆盖 0~0.12 量程（0.10 时 ≈ 24 阶；全库只有 TX-400 会用到）。
 */
const CRUSH_RANGE = 800;
/**
 * 零模糊真 S 曲线（同源 overlay 自叠）对色块顶部的满量程抬升：
 * 覆盖 0.30~0.62 量程（0.62 时 ≈ 31 阶，底部同步 −1.35 倍压深）。
 */
const S_RANGE = 50;
/**
 * 零模糊曝光提亮（同源 screen 自叠）对色块顶部的满量程抬升：
 * 覆盖 0.06~0.28 量程（0.28 时 ≈ 50 阶，中间调同步 ×0.4）。
 */
const LIFT_RANGE = 180;
/**
 * v1.9.4 暗角对色块底部的边缘下压：覆盖 0.10~0.28 量程
 * （0.10 时 ≈ 10 阶、0.28 时 ≈ 28 阶 —— 暗角只压四角，这里映射到横向色带的下沿做示意）。
 */
const VIGNETTE_RANGE = 100;
/**
 * 色度锁（chroma-lock）的色相/饱和度权重满量程：
 * v2.1.0 契约区间 0.10~0.22 映射到 CHROMA_FLOOR~1.0（色度锁越高 → 越接近原图色 → swatch 越饱和）。
 */
const CHROMA_RANGE = 0.12;
/** 色度锁区间下限：chromaLock = 0.10 时的吃料系数（再低就按 0.10 算）。 */
const CHROMA_MIN = 0.1;
/** 色度锁权重下限（chromaLock = 0.10 时的吃料系数；缺省/mono 卷按 1.0 处理）。 */
const CHROMA_FLOOR = 0.3;
/** 化学暗部偏色的偏移倍率：染色不透明度^1.5 × 通道差 × 权重 × 1.8 × 色度锁系数。 */
const SHADOW_GAIN = 1.8;
/** 化学高光偏色的偏移倍率：染色不透明度^1.5 × 通道差 × 权重 × 7.0 × 色度锁系数。 */
const HIGHLIGHT_GAIN = 7.0;
/**
 * 顶部色阶的公共提亮底量：v2.1.0 的九卷染色对比度很强，顶部档 highlightWeight = 1
 * 会被深色方向整档拉偏、破坏"底部 < 中间调 < 高光"的亮度单调；
 * 这里给顶部补一个与预设参数无关的固定提亮，把单调性从染色手里拿回来。
 */
const TOP_LIFT = 10;
/**
 * 染色不透明度的**非线性吃料指数**：胶片乳剂的染色密度不是线性叠加的，
 * 这里按 `opacity^1.5` 近似 —— 低不透明度的分离色更克制、高不透明度才吃饱，
 * 同时让九卷 swatch 在 [6,250] 通道域里两两可辨（线性档在 v2.1.0 强染色参数下无解）。
 */
const SATURATION_EXPONENT = 1.5;
/**
 * 静态 `temperature` 对色块的冷暖位移满量程：warm +R/−B，cool 反向
 * （映射 `gradeLayers.ts` 的 soft-light 暖/冷亮色层；±0.26 色温 ≈ ±18 阶）。
 */
const TEMPERATURE_RANGE = 70;
/**
 * 静态 `tint` 对色块的绿/品红位移满量程：正绿 +G，负品红 +R/+B
 * （映射 Tint 旋钮的 soft-light 绿/品红亮色层；±0.12 色调 ≈ ±5 阶）。
 */
const TINT_RANGE = 40;


type SwatchZone = {
  readonly top: string;
  readonly mid: string;
  readonly bottom: string;
};

/** 把 `#RRGGBB` 拆成 [r, g, b]；不是六位 hex 就返回 null（调用方跳过那一层）。 */
function hexChannels(hex: string | undefined): readonly [number, number, number] | null {
  if (hex === undefined || hex.length !== 7 || hex[0] !== '#') {
    return null;
  }
  const channels: [number, number, number] = [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  return channels.some((channel) => Number.isNaN(channel)) ? null : channels;
}

/**
 * 色度锁（chroma-lock）对染色层的吃料系数：色度锁越高 → 越接近原图色 → 系数越大。
 * 黑白卷/chromaLock 缺省 → 1.0（染色层按原强度算，真黑白交给 BT.709 转灰）。
 */
function chromaScaleOf(chromaLock: number | undefined): number {
  if (chromaLock === undefined || chromaLock <= 0) {
    return 1;
  }
  const normalized = Math.min(1, Math.max(0, (chromaLock - CHROMA_MIN) / CHROMA_RANGE));
  return CHROMA_FLOOR + normalized * (1 - CHROMA_FLOOR);
}

/**
 * 静态色温/色调对色块的**通道位移**（v2.1.0 九卷性格的一部分）：
 * 暖色温 +R / −B、冷色温反向、绿 tint +G、品红 tint +R/+B。
 *
 * 与 `gradeLayers.ts` 的 soft-light 暖/冷、绿/品红亮色层同向，只是把"多层软光"
 * 近似成每通道一个固定标量位移；量级小（±0.26 色温 ≈ ±18 阶），不会盖过染色层。
 */
function chromaShift(temperature: number, tint: number, channel: number): number {
  const warm = temperature * TEMPERATURE_RANGE;
  const green = tint * TINT_RANGE;
  if (channel === 0) {
    return warm - green * 0.5;
  }
  if (channel === 1) {
    return green - warm * 0.35;
  }
  return -warm - green * 0.5;
}

/**
 * soft-light 分离色在中间调附近的线性近似：按通道差往 tint 方向偏移，
 * 吃料量 = `opacity^1.5 × 通道差 × 权重 × 增益 × 色度锁系数`。
 */
function lightTint(
  base: number,
  tint: number,
  opacity: number,
  weight: number,
  gain: number,
  chromaScale: number,
): number {
  return base + (tint - 128) * Math.pow(opacity, SATURATION_EXPONENT) * weight * gain * chromaScale;
}

/**
 * v2.1.0「九卷强性格」配方 → 三段色阶（高光 / 中间调 / 暗部）。
 *
 * 映射纪律（与 `gradeLayers.ts` 的图层顺序 1~12 对应，photo 层全部 blurRadius 0 自叠）：
 *  1. `sCurveContrast`→ overlay 自叠：底部压深（×1.35）、中间调微抬（×0.055）、顶部提亮（×0.55）
 *  2. `chromaLock`    → color 色度锁：不直接改明度，而是把染色层的吃料按 0.30~1.0 缩放；
 *                       v2.1.0 把契约区间下调到 0.10~0.22，染色终于留得住
 *  3. `exposureLift`  → screen 自叠：顶部提亮（×0.33）、中间调（×0.4）、底部（×0.2）
 *  3b. `TOP_LIFT`     → 与预设无关的顶部固定提亮（+10 阶），抵消深色高光染色的整档拉暗
 *  4. `shadowTint*`   → 化学暗部偏色（只 soft-light），权重 底部 1.0 / 中间 0.45 / 顶部 0.15，增益 ×1.8
 *  5. `highlightTint*`→ 德味暖调分色（只 soft-light），权重 顶部 1.0 / 中间 0.4 / 底部 0.2，增益 ×7.0
 *  6. `shadowCrush`   → multiply 自叠：只压暗部（底部 ×0.3，中间调 ×0.06；只有 TX-400 0.10）
 *  7. `vignette`      → 只压四角；横向色带把它映射到**下沿**（底部 −VIGNETTE_RANGE×0.42）
 *  8. `temperature` / `tint` → 卷静态色温/色调的通道位移（暖 +R/−B、绿 +G、品红 +R/+B）
 *  9. `mono`          → 三档全部取 BT.709 亮度（`#808080 + 'color'` 的去色等价）
 *
 * 暗角不参与中间调/顶部的计算：它只影响四角亮度，画进这条 34pt 的横向色带如果
 * 全档都减，会读成"整条都变暗"，反而失真 —— 因此只让下沿承担边缘感，
 * 卡片角标（ISO / SLIDE / B&W）才是卷种信息。
 */
function swatchZones(preset: FilmPreset): SwatchZone {
  const color = preset.color;
  const sCurveContrast = color.sCurveContrast ?? 0;
  const exposureLift = color.exposureLift ?? 0;
  const shadowCrush = color.shadowCrush ?? 0;
  const temperature = color.temperature ?? 0;
  const tintChroma = color.tint ?? 0;
  const vignette = preset.vignette ?? 0;
  const shadowTint = hexChannels(color.shadowTint);
  const shadowOpacity = color.shadowTintOpacity ?? 0;
  const highlightTint = hexChannels(color.highlightTint);
  const highlightOpacity = color.highlightTintOpacity ?? 0;
  const chromaScale = preset.mono === true ? 1 : chromaScaleOf(color.chromaLock);

  // 每档的"胶片亮度"：先算 S 曲线 / 曝光提亮 / 黑位托底 / 暗角对灰度的整体影响，
  // 再让同源色度锁决定化学分离色吃多少料。
  const zones: {
    readonly level: number;
    readonly shadowWeight: number;
    readonly highlightWeight: number;
  }[] = [
    {
      level:
        BASE_GRAY -
        shadowCrush * CRUSH_RANGE * 0.3 -
        sCurveContrast * S_RANGE * 1.35 +
        exposureLift * LIFT_RANGE * 0.2 -
        vignette * VIGNETTE_RANGE * 0.42,
      shadowWeight: 1,
      highlightWeight: 0.2,
    },
    {
      level:
        BASE_GRAY -
        shadowCrush * CRUSH_RANGE * 0.06 +
        sCurveContrast * S_RANGE * 0.055 +
        exposureLift * LIFT_RANGE * 0.4,
      shadowWeight: 0.45,
      highlightWeight: 0.4,
    },
    {
      level: BASE_GRAY + sCurveContrast * S_RANGE * 0.55 + exposureLift * LIFT_RANGE * 0.33 + TOP_LIFT,
      shadowWeight: 0.15,
      highlightWeight: 1,
    },
  ];

  const build = (zone: (typeof zones)[number]): string => {
    const channels: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      let channel = zone.level;
      if (shadowTint !== null) {
        channel = lightTint(
          channel,
          shadowTint[index],
          shadowOpacity,
          zone.shadowWeight,
          SHADOW_GAIN,
          chromaScale,
        );
      }
      if (highlightTint !== null) {
        channel = lightTint(
          channel,
          highlightTint[index],
          highlightOpacity,
          zone.highlightWeight,
          HIGHLIGHT_GAIN,
          chromaScale,
        );
      }
      channels.push(channel + chromaShift(temperature, tintChroma, index));
    }
    if (preset.mono === true) {
      // `#808080 + mixBlendMode:'color'` 的效果 = 三通道全部换成亮度（真黑白）。
      const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      const gray = Math.round(clampChannel(luminance));
      return `rgb(${gray}, ${gray}, ${gray})`;
    }
    return `rgb(${Math.round(clampChannel(channels[0]))}, ${Math.round(clampChannel(channels[1]))}, ${Math.round(clampChannel(channels[2]))})`;
  };

  return {
    top: build(zones[2]),
    mid: build(zones[1]),
    bottom: build(zones[0]),
  };
}

/**
 * 卡片右上角的**卷种角标**（v1.8.7 模块四）：`ISO 200` / `ISO 400` / `SLIDE` /
 * `800T` / `B&W`。
 *
 * 为什么写显式映射而不是从 `preset.name` 解析：名字是给人看的商品名，不是数据
 * 字段；`EK-100` 实际是反转片（该标 SLIDE 而不是 ISO 100）、`CS-800T` 的 800 在
 * 名字中间 —— 解析迟早出错。十一卷用显式表记录卷种最省心，也不需要给
 * `FilmPreset` 加 `iso` / `stockType` 字段（那会牵动
 * `presets.ts` 与五语言包）。
 * 兜底（将来加卷忘了登记）才退回 `mono` 判断 + 末段数字，绝不抛错。
 */
function stockBadgeOf(preset: FilmPreset): string {
  switch (preset.id) {
    case 'gd-200':
    case 'cp-200':
      return 'ISO 200';
    case 'um-400':
    case 'pt-400':
    case 'fj-400':
    case 'fg-400':
      return 'ISO 400';
    case 'ek-100':
    case 'rb-100':
      return 'SLIDE';
    case 'cs-800t':
      return '800T';
    case 'hp-400':
    case 'tx-400':
      return 'B&W';
    default:
      break;
  }
  if (preset.mono === true) {
    return 'B&W';
  }
  // 兜底：取名字里最后一段连续数字（`800-T` 的 800 在中间，不能用"结尾数字"）。
  const digits = /(\d+)(?!.*\d)/.exec(preset.name.trim());
  return digits === null ? 'FILM' : `ISO ${digits[1]}`;
}

/** 角标的两种配色：浅色色块上用深字，其余用白字。 */
interface BadgeTone {
  readonly background: string;
  readonly color: string;
}

/**
 * 按色块顶部的**相对亮度**选角标底色。
 *
 * 色块颜色是 `swatchZones()` 现算出来的 `rgb(r, g, b)`；`sCurveContrast` / `exposureLift`
 * 双高的卷（提亮 + 真反差）能到 `rgb(240, …)` 这种接近白纸的值，黑底白字会直接消失，
 * 所以这里必须真的看一眼亮度。解析失败（将来色值换成 hex/rgba）就退回黑底 —— 宁可对比
 * 弱一点，也不要因为一行解析把整张卡画崩。
 */
function badgeToneFor(zone: string): BadgeTone {
  const match = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(zone);
  if (match === null) {
    return { background: 'rgba(0, 0, 0, 0.55)', color: 'rgba(255, 255, 255, 0.94)' };
  }
  const red = Number(match[1]);
  const green = Number(match[2]);
  const blue = Number(match[3]);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  if (luminance > 0.62) {
    return { background: 'rgba(255, 255, 255, 0.72)', color: 'rgba(12, 12, 12, 0.86)' };
  }
  return { background: 'rgba(0, 0, 0, 0.55)', color: 'rgba(255, 255, 255, 0.94)' };
}

/**
 * 色块本体：**三色渐变** + 一道"乳剂层"高光 + 右上角卷种角标。
 *
 * v1.8.7 模块四把原来的三条纯色 `View`（`swatchZone`）换成一张
 * `expo-linear-gradient`：三段色阶本来就是"高光→中间调→暗部"的连续明暗，
 * 纯色台阶在 34pt 高的小块上看着像色卡纸；渐变才是胶片乳剂层的观感。
 * 渐变方向 0.15,0 → 0.4,1（略偏右下的斜向），比纯竖直更接近真实光照。
 *
 * 为什么用 `as const`：`expo-linear-gradient` v57 的 `colors` 类型是
 * `readonly [string, string, ...string[]]`（至少两色），普通 `string[]` 会
 * 被 TS 判成"可能只有 0/1 个"，编译不过。
 */
function FilmSwatch({
  zones,
  badge,
  styles,
}: {
  zones: SwatchZone;
  badge: string;
  styles: FilmStyles;
}) {
  const { ink } = useTheme();
  const tone = badgeToneFor(zones.top);
  return (
    <View style={styles.swatch}>
      <LinearGradient
        colors={[zones.top, zones.mid, zones.bottom] as const}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.4, y: 1 }}
        style={styles.swatchFill}
      />
      {/* 顶部一条极淡的白线，模拟乳剂层的高光，让色块不至于像纯色卡纸。 */}
      <View style={[styles.swatchSheen, { backgroundColor: ink.paperFaint }]} pointerEvents="none" />
      {/* 卷种角标：只做识别用，不是按钮 —— 点它必须等价于点整张卡。 */}
      <View style={[styles.badge, { backgroundColor: tone.background }]} pointerEvents="none">
        <Text style={[styles.badgeText, { color: tone.color }]}>{badge}</Text>
      </View>
    </View>
  );
}

export const FilmCard = memo(function FilmCard({
  preset,
  selected,
  width,
  onSelect,
}: FilmCardProps) {
  const { t } = useI18n();
  const theme = useTheme();
  // 颜色必须在组件里现取：模块级 StyleSheet 会把深浅色在加载那一刻冻结住，
  // 而这十一张卡是抽屉里唯一会整片换肤的东西。
  const styles = useMemo(() => createStyles(theme), [theme]);
  const description = preset.description ?? '';
  const badge = stockBadgeOf(preset);
  // 选中态在无障碍里也要说出来：读屏用户不会看到那根琥珀色指示条。
  // 角标是视觉信息，读屏拿不到，所以附在 label 末尾（本就是 ASCII 代号，不占语言包）。
  const label = `${
    selected
      ? `${t('film.card.a11y', { name: preset.name, description })} · ${t('film.card.selected')}`
      : t('film.card.a11y', { name: preset.name, description })
  } · ${badge}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={() => {
        onSelect(preset.id);
      }}
      style={({ pressed }) => [
        styles.card,
        { width },
        selected ? styles.cardSelected : null,
        pressed ? styles.cardPressed : null,
      ]}
    >
      <FilmSwatch zones={swatchZones(preset)} badge={badge} styles={styles} />
      <View style={styles.body}>
        <Text style={[styles.code, selected ? styles.codeSelected : null]} numberOfLines={1}>
          {preset.name}
        </Text>
        {description.length > 0 ? (
          /*
            两行 + 自动缩字，两个都要，理由是一条实测算出来的：
            · 这五条描述是简中硬编码（`frames.ts`，不走 i18n），最长那条 41 字，
              在 9pt 等宽/CJK 混排下约 334.6pt 宽；
            · 卡片里能放字的宽度只有 `cardWidth - 16`（`body` 的 paddingHorizontal 8×2）
              —— 390pt 屏上是 159pt，两行一共 318pt，**仍然小于 334.6pt**；
            · 所以再挂 `adjustsFontSizeToFit` + `minimumFontScale`：iOS 侧
              （`NSTextStorage+FontScaling.m` 的 `scaleFontSizeToFitSize:`）会二分字号，
              直到布局管理器不再报告截断为止。390pt 屏只需 0.95、375pt 屏 0.90、
              320pt 宽的机器 0.74、再窄到卡片下限 0.69。
            宁可同一屏上最长的那两张卡小半号字，也不要出现 `…`（用户明确要求）。
          */
          <Text
            style={styles.description}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={DESCRIPTION_MIN_SCALE}
          >
            {description}
          </Text>
        ) : null}
      </View>
      {/* 选中指示 ①：右上角 ✓。绝对定位 + `pointerEvents="none"` ——
          它只是标记，点它必须等价于点整张卡（卡片本体才是 Pressable）。 */}
      {selected ? (
        <View style={styles.selectedCheck} pointerEvents="none">
          <Text style={styles.selectedCheckMark}>✓</Text>
        </View>
      ) : null}
      {/* 选中指示 ②：左侧一根竖条。用绝对定位而不是改内边距，
          这样选中时卡片内容**不会位移**（和变焦档位同一套原则）。 */}
      {selected ? <View style={styles.selectedRail} pointerEvents="none" /> : null}
    </Pressable>
  );
});

type FilmStyles = ReturnType<typeof createStyles>;

function createStyles(theme: Theme) {
  const { ink } = theme;
  return StyleSheet.create({
    card: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
      borderRadius: 3,
      backgroundColor: theme.glass,
      overflow: 'hidden',
    },
    cardSelected: {
      // 规格：激活卡片边框高亮成琥珀橙。描边只有 1px（hairline），
      // 角上再给一点同色暖底，远看才"亮着"。
      borderColor: ink.amber,
      backgroundColor: withAlpha(ink.amber, 0.12),
    },
    cardPressed: {
      opacity: 0.62,
    },
    swatch: {
      height: SWATCH_HEIGHT,
    },
    /** 三色渐变铺满整个色块区；`swatchSheen` / 角标都压在它上面。 */
    swatchFill: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
    /** 右上角卷种角标（`ISO 200` 等）：8pt 等宽、2pt 圆角，压在渐变上。 */
    badge: {
      position: 'absolute',
      top: 4,
      right: 4,
      paddingHorizontal: 3,
      paddingVertical: 1,
      borderRadius: 2,
    },
    badgeText: {
      fontSize: 8,
      letterSpacing: 0.6,
      fontFamily: UI_MONO,
    },
    swatchSheen: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height: 1,
    },
    body: {
      paddingHorizontal: 8,
      paddingTop: 6,
      paddingBottom: 7,
    },
    code: {
      color: ink.paper,
      fontSize: 15,
      letterSpacing: 1.1,
      fontFamily: UI_MONO,
    },
    codeSelected: {
      color: ink.amberSoft,
    },
    description: {
      marginTop: 3,
      color: ink.paperDim,
      fontSize: 9,
      // 9pt 的字不带行高时两行会粘成一块（CJK 尤其明显），12 = 1.33 倍行距；
      // 固定行高还有个好处：`adjustsFontSizeToFit` 缩字号时**行高不跟着变**，
      // 卡片高度不会被撑开，两列卡片仍然对齐。
      lineHeight: 12,
      letterSpacing: 0.4,
      fontFamily: UI_MONO,
    },
    selectedRail: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 2,
      backgroundColor: ink.amber,
    },
    /**
     * 左上角 `✓`（v1.8.7 从右上角挪来：右上角让给卷种角标，否则 8pt 角标与
     * 16pt 圆标会叠在一起）。压在色块上，所以自己带一层实心底 + 一圈琥珀描边 ——
     * 否则遇到浅色色块（褪色很重的过期片）这个字会糊在背景里看不见。
     * left 取 6 是为了让开 `selectedRail` 那根 2pt 竖条。
     */
    selectedCheck: {
      position: 'absolute',
      top: 4,
      left: 6,
      width: CHECK_SIZE,
      height: CHECK_SIZE,
      borderRadius: CHECK_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.panel,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ink.amber,
    },
    selectedCheckMark: {
      color: ink.amber,
      fontSize: 10,
      fontFamily: UI_MONO,
    },
  });
}
