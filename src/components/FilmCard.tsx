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
 * 色块本体：三段色阶 + 一道"乳剂层"高光。
 * 刻意不做圆角以外的装饰，它不是缩略图，只是一个色彩示意。
 */
function FilmSwatch({ zones, styles }: { zones: SwatchZone; styles: FilmStyles }) {
  const { ink } = useTheme();
  return (
    <View style={styles.swatch}>
      <View style={[styles.swatchZone, styles.swatchZoneTop, { backgroundColor: zones.top }]} />
      <View style={[styles.swatchZone, { backgroundColor: zones.mid }]} />
      <View style={[styles.swatchZone, { backgroundColor: zones.bottom }]} />
      {/* 顶部一条极淡的白线，模拟乳剂层的高光，让色块不至于像纯色卡纸。 */}
      <View style={[styles.swatchSheen, { backgroundColor: ink.paperFaint }]} pointerEvents="none" />
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
  // 选中态在无障碍里也要说出来：读屏用户不会看到那根琥珀色指示条。
  const label = selected
    ? `${t('film.card.a11y', { name: preset.name, description })} · ${t('film.card.selected')}`
    : t('film.card.a11y', { name: preset.name, description });

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
      <FilmSwatch zones={swatchZones(preset.color)} styles={styles} />
      <View style={styles.body}>
        <Text style={[styles.code, selected ? styles.codeSelected : null]} numberOfLines={1}>
          {preset.name}
        </Text>
        {description.length > 0 ? (
          <Text style={styles.description} numberOfLines={1}>
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
    swatchZone: {
      flex: 1,
    },
    swatchZoneTop: {
      flex: 1.1,
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
     * 右上角 `✓`。压在色块上，所以自己带一层实心底 + 一圈琥珀描边 ——
     * 否则遇到浅色色块（褪色很重的过期片）这个字会糊在背景里看不见。
     */
    selectedCheck: {
      position: 'absolute',
      top: 4,
      right: 4,
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
