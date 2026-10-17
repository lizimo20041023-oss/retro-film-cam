/**
 * 一格胶片预设卡片。抽屉（`FilmDrawer.tsx`）里两列平铺十个。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么颜色块是"算"出来的，不是截图
 * ─────────────────────────────────────────────────────────────────────
 * 「一眼看出这卷是什么味道」最直观的办法当然是拿真实样片，但项目里没有、
 * 也不该为十个预设各烧一张烘焙图（体积、维护、和真实成像对不上，三头不讨好）。
 * 退而求其次的做法是**从预设自己的调色参数反推一个近似色块**：
 * 拿一个中灰当"标准场景"，把 `color.temperature / tint / exposure / contrast /
 * saturation / fade` 依次施加一遍，得到的三个色阶就是这卷胶片的性格 ——
 * 暖卷偏橙、冷卷偏青、高对比的拉开明暗、褪色重的整体发灰。
 *
 * ⚠️ 它**不等于**成片效果（真正的合成在 `FilmCompositor` / `gradeLayers` 里，
 * 还要叠颗粒、漏光、暗角）。这里只是色偏方向和强度的示意，别拿它当取色器。
 *
 * ─────────────────────────────────────────────────────────────────────
 * ─────────────────────────────────────────────────────────────────────
 * 选中态为什么是"边框 + 右上角 ✓"两条
 * ─────────────────────────────────────────────────────────────────────
 * 用户给的规格就是这两条：当前激活的那张边框高亮成琥珀橙 `#E5A93C`，
 * 右上角再盖一个 `✓`。为什么要两条而不是一条：抽屉里十张卡的色块颜色本身就
 * 五花八门，只靠一圈描边的话，在浅色色块旁边（比如褪色很重的过期片）对比度
 * 会掉下去；`✓` 是一个**和颜色无关**的形状信号，扫一眼就知道选的是哪张。
 * 左侧那根 2pt 竖条是 v1.2.0 留下的第三个信号，保留 —— 三者在同一个位置
 * （卡片边缘/角上），不会互相打架。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么要 memo，以及为什么 props 里传的是 id 而不是对象
 * ─────────────────────────────────────────────────────────────────────
 * 抽屉一屏要摆十张卡。`PRESETS` 是模块级常量、引用永不变化，所以只要传进来的
 * 是**基本类型**（`presetId` / `selected` / `onSelect`），`memo` 就真的能挡住
 * "打开抽屉时父组件重渲染导致十张卡全部重画"。如果改成把 `preset` 对象或
 * 内联箭头函数传进来，`memo` 会失效 —— 所以调用方必须传稳定的 `onSelect`
 * （`CameraScreen` 里用 `useCallback` 包的）。
 */
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ColorGradeConfig, FilmPreset } from '../types';
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

/** 把 0~255 夹回合法区间。 */
function clampChannel(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 255) {
    return 255;
  }
  return value;
}

/** 中灰：所有近似都以它为起点，相当于"标准场景的中间调"。 */
const BASE_GRAY = 132;
/** 色温 / 色调偏移的满量程（以 0~255 的色阶为单位）。 */
const TINT_RANGE = 26;
/** 曝光偏移的满量程。 */
const EXPOSURE_RANGE = 30;
/** 对比度对暗部/亮部的展开量。 */
const CONTRAST_RANGE = 7;

type SwatchZone = {
  readonly top: string;
  readonly mid: string;
  readonly bottom: string;
};

/**
 * 调色参数 → 三段色阶（高光 / 中间调 / 暗部）。
 *
 * 黑白卷（`saturation ≈ 0` 且没有色偏）走单独一条分支：那时温度不再是"黄蓝轴"，
 * 而是印相纸的冷调/暖调，所以把它折成**亮度**偏移，否则黑白卷会算出一块假彩色。
 */
function swatchZones(color: ColorGradeConfig): SwatchZone {
  const temperature = color.temperature ?? 0;
  const tint = color.tint ?? 0;
  const saturation = color.saturation ?? 1;
  const contrast = color.contrast ?? 1;
  const fade = color.fade ?? 0;
  const exposure = color.exposure ?? 0;

  const exposureShift = exposure * EXPOSURE_RANGE;
  const isMonochrome = saturation <= 0.06 && Math.abs(tint) <= 0.02 && Math.abs(temperature) <= 0.02;

  // 暗部/亮部相对中间调的偏移：对比度越大，两端拉得越开。
  const contrastSpread = Math.max(0, contrast - 1) * CONTRAST_RANGE;

  const midOffset = exposureShift;
  const topOffset = midOffset + contrastSpread;
  const bottomOffset = midOffset - contrastSpread;

  let redShift = temperature * TINT_RANGE;
  let greenShift = -tint * TINT_RANGE;
  let blueShift = -temperature * TINT_RANGE;

  if (isMonochrome) {
    // 黑白：把"色温"折成整体亮度（暖 → 更亮的印相纸白，冷 → 更深的灰）。
    const toneShift = temperature * EXPOSURE_RANGE;
    redShift = toneShift;
    greenShift = toneShift;
    blueShift = toneShift;
  } else {
    // 饱和度整体缩放色偏：饱和度低的卷（比如过期片、淡雅负片）色偏也应该更弱。
    const chromaScale = Math.max(0.2, Math.min(1.6, saturation));
    redShift *= chromaScale;
    greenShift *= chromaScale;
    blueShift *= chromaScale;
  }

  const build = (offset: number, zoneScale: number): string => {
    // 关键：色偏在暗部减半、亮部略增。真实胶片（尤其是负片和过期片）
    // 的色偏几乎都堆在暗部和高光两极，中间调反而很中性 —— 只做整体偏移
    // 会让色块看起来像蒙了一层色纸。
    const red = clampChannel(BASE_GRAY + offset + redShift * zoneScale);
    const green = clampChannel(BASE_GRAY + offset + greenShift * zoneScale);
    const blue = clampChannel(BASE_GRAY + offset + blueShift * zoneScale);
    if (fade <= 0) {
      return `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`;
    }
    // 褪色：把颜色往米白抬，抬高暗场（这是过期胶片最标志性的特征）。
    const fadeAmount = fade * 0.5;
    const fadedRed = red + (238 - red) * fadeAmount;
    const fadedGreen = green + (232 - green) * fadeAmount;
    const fadedBlue = blue + (218 - blue) * fadeAmount;
    return `rgb(${Math.round(fadedRed)}, ${Math.round(fadedGreen)}, ${Math.round(fadedBlue)})`;
  };

  return {
    top: build(topOffset, 1.2),
    mid: build(midOffset, 1),
    bottom: build(bottomOffset, 0.55),
  };
}

/**
 * 卡片右上角的**卷种角标**（v1.8.7 模块四）：`ISO 200` / `ISO 400` / `SLIDE` /
 * `800T` / `B&W`。
 *
 * 为什么写显式映射而不是从 `preset.name` 解析：名字是给人看的商品名，不是数据
 * 字段；`RI-100` 实际是反转片（该标 SLIDE 而不是 ISO 100）、`NT-800T` 的 800 在
 * 名字中间 —— 解析迟早出错。九卷是冻结的（v1.8.10 底片库重做后仍是九卷），一张
 * 表最省心，也不需要给 `FilmPreset` 加 `iso` / `stockType` 字段（那会牵动
 * `presets.ts` 与五语言包）。
 * 兜底（将来加卷忘了登记）才退回 `mono` 判断 + 末段数字，绝不抛错。
 */
function stockBadgeOf(preset: FilmPreset): string {
  switch (preset.id) {
    case 'su-200':
    case 'am-200':
      return 'ISO 200';
    case 'vl-400':
    case 'vx-400':
    case 'nz-400':
      return 'ISO 400';
    case 'ri-100':
      return 'SLIDE';
    case 'nt-800t':
      return '800T';
    case 'mn-400-bw':
    case 'sl-400-bw':
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
 * 色块颜色是 `swatchZones()` 现算出来的 `rgb(r, g, b)`；褪色重的过期片能到
 * `rgb(238, …)` 这种接近白纸的值，黑底白字会直接消失，所以这里必须真的看一眼
 * 亮度。解析失败（将来色值换成 hex/rgba）就退回黑底 —— 宁可对比弱一点，也不要
 * 因为一行解析把整张卡画崩。
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
  // 而这十张卡是抽屉里唯一会整片换肤的东西。
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
      <FilmSwatch zones={swatchZones(preset.color)} badge={badge} styles={styles} />
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
