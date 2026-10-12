/**
 * 画幅徽标：顶栏左侧那枚「代号胶囊」。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 这里曾经画的是"比例小矩形 + n/N"，用户反馈看不懂，已换成代号徽标
 * ─────────────────────────────────────────────────────────────────────
 * v1.2.0 的做法是用两个嵌套 `View` 按 `frame.aspect` 画一个小矩形（外框 = 纸边、
 * 内框 = 成像窗口），旁边再配一行化简后的整数比（`3:4`）和 `n/N` 计数。
 * 用户的原话是"看不懂"——一个没有图例的抽象小方块既不像相纸也不像画幅，
 * 那行比例又和顶栏其它信息抢同一块注意力。**整块已删除**（含 `AspectSketch`、
 * `greatestCommonDivisor`、`formatAspectRatio` 和它们的样式），
 * 现在只剩一行纯文字：`▌ INSTAX · 02/08`。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么分母取"相框总数"（这条规格没写死，是我的判断）
 * ─────────────────────────────────────────────────────────────────────
 * 用户给的规格里同时出现了 `02/08` 和 `01/04` 两个不同的分母。本机只有 4 个相框，
 * 所以 `08` 不可能是真数据 —— 他是在**示范格式**，没有规定分母是什么。这里取
 * `FRAMES.length`（相框总数），理由是：这枚徽标点一下就是"换到下一个画幅"，
 * 分子分母必须描述**同一件正在被切换的东西**——当前是第几个画幅、一共几个。
 * 如果分母取胶卷张数（8 张一卷之类），那就成了"画幅 2 / 胶卷第 8 张"这种
 * 两个不同维度硬拼在一起的东西，读的人只会更糊涂。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么不显示胶卷名，也不显示画幅比
 * ─────────────────────────────────────────────────────────────────────
 * 用户明确要求"彻底移除重复的胶卷预设名称（不再显示 `RE...` / `PR-400`），
 * 胶卷名称由左下角大卡片独占"。这枚徽标从此只谈画幅：代号 + 序号。
 * 画幅比例同理不出现——它已经由取景器和成片的实际形状说清楚了。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么左边那条竖线是用 `View` 画的，不是 `▌` 字符
 * ─────────────────────────────────────────────────────────────────────
 * `▌`（U+258C）在不同字体、不同字号下的**字宽和贴边程度都不一样**：Menlo 里它
 * 自带一点左侧留白，和文字之间想稳定留出 6pt 根本对不齐，换字体就散架。
 * 用一个 3×12、圆角 1 的 `View` 画出来，宽高和间距完全可控。
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { INK, UI_MONO } from '../constants/theme';
import { useI18n } from '../i18n';

export interface FrameBadgeProps {
  /** 相框代号（`FrameSpec.code`）：纯 ASCII 大写、五语言里都长一样。 */
  code: string;
  /** 已翻译的画幅名（`frame.polaroid600` 之类）。**只用于无障碍标签**，不显示。 */
  name: string;
  /** 当前画幅下标，从 0 起。 */
  index: number;
  /** 分母 = **相框总数**（`FRAMES.length`），理由见文件头。 */
  count: number;
  disabled?: boolean;
  onPress: () => void;
}

/**
 * 规格里给的琥珀橙。刻意**不用** `INK.amber`（`#D28B2A`）：徽标要在
 * `rgba(255,255,255,0.08)` 的浅胶囊底上跳出来，`INK.amber` 在这个底色上偏暗，
 * 用户点名要的就是这个更亮一档的琥珀。
 */
const BADGE_AMBER = '#E5A93C';

/** 序号补零到两位：`01/04`、`02/08`（用户给的样例就是两位）。 */
function twoDigits(value: number): string {
  return String(Math.max(0, value)).padStart(2, '0');
}

/**
 * `memo` 的理由：顶栏每次拍完照都会重渲染（曝光计数变了），而这个徽标跟计数无关 ——
 * 只有换画幅时它的 props 才真的变。
 */
export const FrameBadge = memo(function FrameBadge({
  code,
  name,
  index,
  count,
  disabled = false,
  onPress,
}: FrameBadgeProps) {
  const { t } = useI18n();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('frame.badge.a11y', { name, count })}
      // 轻触换画幅这件事在无障碍里是"切换"，用 state 告诉读屏软件当前是禁用还是可用，
      // 而不是把 `1/4` 塞进 label（label 里已经有画幅名和序号语义了）。
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.touch, pressed ? styles.pressed : null]}
    >
      <View style={styles.plate}>
        {/* 左侧装饰条：3×12 的圆角 View，见文件头"为什么不是 `▌` 字符"。 */}
        <View style={styles.accent} />
        {/*
          文本：`代号 · n/N`。三道保险一起用，目标是"既不断行、也不出现省略号"：
            · `numberOfLines={1}` —— 绝不折成两行（这是用户提的第一条）；
            · `adjustsFontSizeToFit` + `minimumFontScale` —— 42% 宽度装不下时缩小字号，
              而不是截断成 `135 N…`（最长的代号 `135 NEG` 正好卡在这个边界上）；
            · `flexShrink: 1` —— 允许它在胶囊内部被压窄，否则会顶破 maxWidth。
        */}
        <Text
          style={styles.label}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {`${code} · ${twoDigits(index + 1)}/${twoDigits(count)}`}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  touch: {
    // 顶栏右侧还有胶片计数 + 四枚拨轮，42% 是留给徽标的上限 ——
    // 再宽就会把右边的拨轮挤到贴边（尤其 iPhone SE 那档窄屏）。
    maxWidth: '42%',
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.6,
  },
  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    // 用户规格给的暗色微型胶囊底框：白色 8% 叠在深色顶栏上，够看清又不显眼。
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  accent: {
    width: 3,
    height: 12,
    borderRadius: 1,
    backgroundColor: BADGE_AMBER,
  },
  label: {
    // 和装饰条之间固定 6pt（见文件头）。
    marginLeft: 6,
    flexShrink: 1,
    color: INK.paper,
    fontSize: 12,
    letterSpacing: 0.6,
    fontFamily: UI_MONO,
  },
});
