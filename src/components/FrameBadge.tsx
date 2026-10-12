/**
 * 相框徽章：顶栏左侧那个小矩形按钮。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么是"画"出来的矩形，不是文字
 * ─────────────────────────────────────────────────────────────────────
 * 顶栏原来是一行等宽文字（`白边印刷 · 2/3 · RETRO 400`），信息密度低、还占一整行。
 * 现在的做法是把"画幅"这件事用**形状**说清楚：两个嵌套的 `View` 组成一个按真实
 * 宽高比画的小矩形 —— 外框是画幅纸边，内框是成像窗口。用户扫一眼形状就知道
 * "现在是一张 3:4 的竖幅"，不需要读文字。旁边的比例文案（`3:4`）只是给形状
 * 做一个精确注解，字号刻意做小，不抢视觉重量。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么比例文案是整数比而不是 0.823
 * ─────────────────────────────────────────────────────────────────────
 * `frame.aspect` 是 `宽 / 高` 的浮点数（例如 1408 / 1712 = 0.8224…）。
 * 直接显示小数没人看得懂；换算成 **`: 化简后的整数比`**（`3:4`）才是摄影圈的说法。
 * 化简用最大公约数，并且把两个数都先四舍五入成整数 —— 因为新的四个画幅
 * （1408×1712、1080×1720、1350×1950、1×1）本身都是整数像素，公约数能整除干净；
 * 万一将来出现非整数比例，取整后的比值也只是"最接近的常见比例"，不会崩。
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { INK, UI_MONO } from '../constants/theme';
import { useI18n } from '../i18n';

export interface FrameBadgeProps {
  /** 已翻译的画幅名（`frame.polaroid600` 之类）。 */
  name: string;
  /** 当前画幅序号，从 0 起。 */
  index: number;
  /** 画幅总数，用于无障碍文案里的"第 N 张"。 */
  count: number;
  /** 宽 / 高。 */
  aspect: number;
  disabled?: boolean;
  onPress: () => void;
}

/** 画幅草图的外接框。小到不抢视线的程度，但足够看清横竖。 */
const SKETCH_MAX_WIDTH = 20;
const SKETCH_MAX_HEIGHT = 17;
/** 内外框的间距（= 模拟的纸边宽度）。 */
const SKETCH_INSET = 2;

/** 最大公约数，用于把浮点宽高比化成整数比。 */
function greatestCommonDivisor(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x;
}

/**
 * 浮点宽高比 → 紧凑的整数比文案（`3:4` / `1:1` / `9:16`）。
 *
 * 兜底分支考虑两种坏输入：非有限值、以及两个数取整后没有公约数（互质但很大，
 * 比如 1408:1713 —— 这时硬写出 `1408:1713` 反而是噪音，退化成两位小数更诚实）。
 */
function formatAspectRatio(aspect: number): string {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    return '';
  }
  // 基准按 1000 放大再取整：误差在千分之一以内，足以还原出 3:4 / 9:16 这类常见比例。
  const scaledWidth = Math.max(1, Math.round(aspect * 1000));
  const scaledHeight = 1000;
  const divisor = greatestCommonDivisor(scaledWidth, scaledHeight);
  if (divisor <= 0) {
    return aspect.toFixed(2);
  }
  const ratioWidth = scaledWidth / divisor;
  const ratioHeight = scaledHeight / divisor;
  // 互质且都很大 = 没化简出"人话"，别摆出来。
  if (ratioWidth > 99 || ratioHeight > 99) {
    return aspect.toFixed(2);
  }
  return `${ratioWidth}:${ratioHeight}`;
}

/**
 * 画幅草图：外框恒等于"纸"，内框按宽高比缩放后裁掉内边距。
 *
 * 这里**不做**按比例缩放到同一个外接框的处理（那会让 1:1 和 3:4 的外框一样大，
 * 只是内框不同 —— 视觉上反而更乱）。做法是让**外框跟随画幅比例**、只在极端比例
 * 时被 `maxWidth/maxHeight` 夹住，这样"横幅/竖幅"一眼可辨。
 */
function AspectSketch({ aspect }: { aspect: number }) {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  // 先按外接框夹一次：先以宽度为准算高度，超出就反过来以高度为准。
  let width = SKETCH_MAX_WIDTH;
  let height = width / ratio;
  if (height > SKETCH_MAX_HEIGHT) {
    height = SKETCH_MAX_HEIGHT;
    width = height * ratio;
  }
  return (
    <View style={[styles.sketchFrame, { width, height }]}>
      <View style={styles.sketchWindow} />
    </View>
  );
}

/**
 * `memo` 的理由：顶栏每次拍完照都会重渲染（曝光计数变了），
 * 而这个徽章跟计数无关 —— 只有换画幅时它的 props 才真的变。
 */
export const FrameBadge = memo(function FrameBadge({
  name,
  index,
  count,
  aspect,
  disabled = false,
  onPress,
}: FrameBadgeProps) {
  const { t } = useI18n();
  const ratioLabel = formatAspectRatio(aspect);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('frame.badge.a11y', { name, count })}
      // 轻触换画幅这件事在无障碍里是"切换"，用 state 告诉读屏软件当前是第几个，
      // 而不是把 `1/4` 塞进 label（label 里已经有画幅名和序号语义了）。
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.touch, pressed ? styles.pressed : null]}
    >
      <View style={styles.plate}>
        <AspectSketch aspect={aspect} />
        <View style={styles.caption}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {ratioLabel.length > 0 ? <Text style={styles.ratio}>{ratioLabel}</Text> : null}
        </View>
        <Text style={styles.counter}>
          {index + 1}/{count}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  touch: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.6,
  },
  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(210, 139, 42, 0.45)',
    borderRadius: 3,
    backgroundColor: 'rgba(10, 10, 9, 0.45)',
  },
  sketchFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: INK.paperDim,
    // 外框就是"纸"，给一点点底色让它从深色顶栏上浮起来。
    backgroundColor: 'rgba(232, 228, 220, 0.14)',
  },
  sketchWindow: {
    // 注意：RN 0.86 已移除 StyleSheet.absoluteFillObject，只能用 absoluteFill
    ...StyleSheet.absoluteFill,
    margin: SKETCH_INSET,
    // 内框 = 成像窗口，比纸边更亮，模拟"光从窗口透出来"。
    backgroundColor: 'rgba(232, 228, 220, 0.42)',
  },
  caption: {
    marginLeft: 7,
    flexShrink: 1,
  },
  name: {
    color: INK.paper,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  ratio: {
    marginTop: 1,
    color: INK.amberSoft,
    fontSize: 8.5,
    letterSpacing: 0.8,
    fontFamily: UI_MONO,
  },
  counter: {
    marginLeft: 7,
    color: INK.paperFaint,
    fontSize: 8.5,
    letterSpacing: 0.5,
    fontFamily: UI_MONO,
  },
});
