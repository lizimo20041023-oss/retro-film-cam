/**
 * 次级功能横排：导入 / 重曝 / 定时 / 闪光灯 / 翻转。
 *
 * 为什么这五个是"图标 + 无障碍标签"而不是"图标 + 文字"：这一行在 375pt 宽的机型上要塞下
 * 五个 44pt 的触控区，加文字就必然缩到 36pt 以下 —— 那是点不准的尺寸。功能名交给
 * VoiceOver 念，视力用户靠图标和状态点（重曝的小圆点、定时的秒数）就够分辨了。
 *
 * 为什么导入/重曝/定时三个是自己画的线框而不是图标字体：`assets/ui/icon-*.png` 里没有它们，
 * 而"新增一个图标库"是这份任务书明确禁止的。五个 1pt 的 View 足够画出这三个形状。
 *
 * 液态玻璃改版后，这一行的**外壳**换成了一枚 40pt 的玻璃圆盘（见 `ToolButton`），
 * 五个图标的画法、状态判据、无障碍标签一个字节都没动 —— 只换了它们脚下垫的东西。
 */
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AccessibilityState } from 'react-native';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import { UI_MONO, useTheme } from '../constants/theme';
import { UI_ASSETS } from '../constants/uiAssets';
import { GLASS_TEXT_COLOR, glassTextShadow, LiquidGlassView } from './LiquidGlassView';

/** 定时档位：0 = 关。3 / 10 秒是这份任务书定死的两个档，不做成任意秒数。 */
export type TimerSeconds = 0 | 3 | 10;

const ICON_SIZE = 22;
/** 触控区边长。低于 44pt 的按钮在移动端就是"看得到、点不中"。 */
const TOUCH = 44;
/**
 * 玻璃圆盘直径。比触控区小 4pt，留出 2pt 的呼吸边：
 * 五枚盘子如果顶满 44pt，相邻两枚之间就只剩 `space-around` 挤出来的缝，
 * 在 375pt 宽的机型上会连成一整条玻璃带，"五个按钮"这件事就看不出来了。
 */
const DISC = 40;

/**
 * 五个图标的暗晕。和 `glassTextShadow` 是**同一个意图**（白线浮在实时取景上，
 * 背后可能是一片过曝的天空），只是 `glassTextShadow` 那三根 `textShadow*` 属性
 * 只作用于 `<Text>`：这里有三枚图标是 `View` 画的线框，得用 `View` 自己的阴影属性。
 * 颜色沿用同一个 `rgba(0, 0, 0, 0.65)`，两处的暗晕强度才一致。
 *
 * 半径写 2、偏移 0：和 `glassTextShadow` 的 2pt 全向晕对齐，图标各自只偏一点点。
 */
const GLYPH_SHADOW = {
  shadowColor: 'rgba(0, 0, 0, 0.65)',
  shadowOffset: { width: 0, height: 0 },
  shadowRadius: 2,
  shadowOpacity: 1,
} as const;

export interface ToolRowProps {
  doubleExposure: boolean;
  timerSeconds: TimerSeconds;
  flashOn: boolean;
  /** 前摄没有闪光灯：按钮该是灰的，而不是点了没反应 */
  flashDisabled: boolean;
  /** 正在冲印 / 导入：所有会改变拍摄参数的动作都禁用，免得改了参数却不是这一张 */
  busy: boolean;
  onImport: () => void;
  onToggleDouble: () => void;
  onCycleTimer: () => void;
  onToggleFlash: () => void;
  onFlip: () => void;
}

interface ToolButtonProps {
  a11yLabel: string;
  a11yValue?: string;
  a11yState?: AccessibilityState;
  disabled?: boolean;
  /** 左上角状态点（重曝开着的时候要有） */
  dot?: boolean;
  onPress: () => void;
  children: ReactNode;
}

function ToolButton({ a11yLabel, a11yValue, a11yState, disabled = false, dot = false, onPress, children }: ToolButtonProps) {
  const { ink } = useTheme();

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityValue={a11yValue === undefined ? undefined : { text: a11yValue }}
      accessibilityState={{ ...a11yState, disabled }}
      style={({ pressed }) => [styles.button, pressed && !disabled && styles.pressed]}
    >
      {/*
        玻璃盘垫在内容下面，尺寸写死 40pt，**不能让内容把它撑开**：
        定时的秒数会把 22pt 的图标顶成"图标 + 一行字"，内容一变盘子就跟着变，
        五个按钮的直径就会不相等。`pointerEvents="none"` 是必须的 ——
        盘子铺在内容底下，不关掉命中测试就会把每次点击都吞掉。
      */}
      <LiquidGlassView
        radius={DISC / 2}
        style={styles.disc}
        pointerEvents="none"
        // 禁用态和 `DialButton` 用同一个压暗值，两处按钮灰下去的程度才一致
        overlay={disabled ? 'rgba(120, 120, 128, 0.16)' : undefined}
      >
        {children}
      </LiquidGlassView>
      {dot ? <View style={[styles.dot, { backgroundColor: ink.amber }]} /> : null}
    </Pressable>
  );
}

function ToolRowInner({
  doubleExposure,
  timerSeconds,
  flashOn,
  flashDisabled,
  busy,
  onImport,
  onToggleDouble,
  onCycleTimer,
  onToggleFlash,
  onFlip,
}: ToolRowProps) {
  const { ink } = useTheme();
  const { t } = useI18n();

  /*
   * 图标强制纯白 —— 玻璃盘是深浅色自适应的，图标再跟着主题走就变成了
   * "浅色玻璃上画深色线"，那和玻璃是两层语言。
   *
   * ⚠️ 已知代价：浅色主题下玻璃底是 `rgba(255, 255, 255, 0.52)`，纯白图标落在
   * 它上面只靠 `glassTextShadow` 那圈 2pt 暗影撑对比度。深色主题下毫无问题。
   * 这是规格明确要求的表现（"强制纯白 `#FFFFFF`"），所以照做，风险记在报告里。
   */
  const iconColor = busy ? 'rgba(255, 255, 255, 0.38)' : GLASS_TEXT_COLOR;
  /*
   * 点亮态：图标仍是纯白，**状态靠"左上角圆点 + 定时秒数"这两个琥珀标记说**。
   * 上一版是把图标本身染成琥珀，改纯白之后那条路没了 —— 好在琥珀圆点本来就在，
   * 而且在玻璃底上比染色更干净（染色会把 1pt 的线框染糊）。
   *
   * ⚠️ 反过来说，重曝/定时的"开着"现在只剩一个小圆点和一行 8pt 秒数，
   * 比"整枚图标变琥珀"要弱。这里刻意**保留琥珀**而不是也刷成白色：
   * 纯白在浅色玻璃上表达不出"亮/灭"的差别，状态就彻底丢了。
   */
  const litColor = busy ? 'rgba(255, 255, 255, 0.38)' : ink.amber;
  const timerLabel = timerSeconds === 3 ? t('camera.tool.timer.3') : timerSeconds === 10 ? t('camera.tool.timer.10') : t('camera.tool.timer.off');

  return (
    <View style={styles.row}>
      <ToolButton a11yLabel={t('camera.tool.import')} disabled={busy} onPress={onImport}>
        <ImportGlyph color={iconColor} />
      </ToolButton>

      <ToolButton
        a11yLabel={doubleExposure ? t('camera.tool.double.on') : t('camera.tool.double')}
        a11yState={{ selected: doubleExposure }}
        disabled={busy}
        dot={doubleExposure}
        onPress={onToggleDouble}
      >
        <DoubleGlyph color={iconColor} />
      </ToolButton>

      <ToolButton
        a11yLabel={t('camera.tool.timer')}
        a11yValue={timerLabel}
        a11yState={{ selected: timerSeconds > 0 }}
        disabled={busy}
        onPress={onCycleTimer}
      >
        <TimerGlyph color={iconColor} />
        {timerSeconds > 0 ? (
          // 秒数直接印在图标下面：定时是"下一次快门"的属性，用户必须一眼看见它开着
          <Text style={[styles.badge, { color: litColor }]} allowFontScaling={false}>
            {`${timerSeconds}s`}
          </Text>
        ) : null}
      </ToolButton>

      <ToolButton
        a11yLabel={flashOn ? t('camera.flash.on') : t('camera.flash.off')}
        a11yState={{ selected: flashOn }}
        disabled={busy || flashDisabled}
        onPress={onToggleFlash}
      >
        <Image
          source={flashOn ? UI_ASSETS.iconFlashOn : UI_ASSETS.iconFlash}
          style={[styles.icon, { tintColor: flashDisabled ? 'rgba(255, 255, 255, 0.38)' : iconColor }]}
        />
      </ToolButton>

      <ToolButton a11yLabel={t('camera.tool.flip')} disabled={busy} onPress={onFlip}>
        <Image source={UI_ASSETS.iconFlip} style={[styles.icon, { tintColor: iconColor }]} />
      </ToolButton>
    </View>
  );
}

/** 五个按钮、十个原始值 prop、五个稳定回调：整屏重渲染时不该跟着重排一遍布局。 */
export const ToolRow = memo(ToolRowInner);

/* ---------------------------------------------------------------------------
 * 画出来的三个图标。尺寸都按 22pt 的画布对齐，和 PNG 图标视觉重量一致。
 * ------------------------------------------------------------------------ */

function ImportGlyph({ color }: { color: string }) {
  return (
    <View style={styles.glyph}>
      <View style={[styles.importFrame, { borderColor: color }]} />
      <View style={[styles.plusH, { backgroundColor: color }]} />
      <View style={[styles.plusV, { backgroundColor: color }]} />
    </View>
  );
}

function DoubleGlyph({ color }: { color: string }) {
  return (
    <View style={styles.glyph}>
      {/* 后面那张压低透明度：重曝就是"两张叠在一起"，一眼要看得出前后关系 */}
      <View style={[styles.doubleBack, { borderColor: color }]} />
      <View style={[styles.doubleFront, { borderColor: color }]} />
    </View>
  );
}

function TimerGlyph({ color }: { color: string }) {
  return (
    <View style={styles.glyph}>
      <View style={[styles.timerRing, { borderColor: color }]} />
      <View style={[styles.timerNub, { backgroundColor: color }]} />
      <View style={[styles.timerHandUp, { backgroundColor: color }]} />
      <View style={[styles.timerHandRight, { backgroundColor: color }]} />
    </View>
  );
}

// 只放几何：颜色现取，模块级配色会把深浅色切换冻在首次渲染那一刻。
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
  },
  button: {
    width: TOUCH,
    height: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    width: DISC,
    height: DISC,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    ...GLYPH_SHADOW,
  },
  dot: {
    position: 'absolute',
    /*
     * 状态点贴在**盘子边缘**上，不是触控区边缘（老版本是 left/top 4，那是按 44pt
     * 触控区算的）：盘子只有 40pt 且居中，点如果按 44pt 定位会飘在玻璃外面，
     * 看起来像屏幕上的一粒灰。`(TOUCH - DISC) / 2 = 2` 把原点挪到盘子左上角，
     * 再各自 +2 让它压在盘沿上。
     */
    left: (TOUCH - DISC) / 2 + 2,
    top: (TOUCH - DISC) / 2 + 2,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badge: {
    fontFamily: UI_MONO,
    fontSize: 8,
    letterSpacing: 0.5,
    marginTop: 1,
    ...glassTextShadow,
  },
  glyph: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    ...GLYPH_SHADOW,
  },
  importFrame: {
    width: 17,
    height: 13,
    borderWidth: 1,
    borderRadius: 2,
  },
  plusH: {
    position: 'absolute',
    width: 7,
    height: 1,
  },
  plusV: {
    position: 'absolute',
    width: 1,
    height: 7,
  },
  doubleBack: {
    position: 'absolute',
    left: 2,
    top: 6,
    width: 14,
    height: 11,
    borderWidth: 1,
    borderRadius: 2,
    opacity: 0.5,
  },
  doubleFront: {
    position: 'absolute',
    left: 6,
    top: 4,
    width: 14,
    height: 11,
    borderWidth: 1,
    borderRadius: 2,
  },
  timerRing: {
    position: 'absolute',
    left: 3.5,
    top: 4,
    width: 15,
    height: 15,
    borderWidth: 1,
    borderRadius: 7.5,
  },
  timerNub: {
    position: 'absolute',
    left: 9.5,
    top: 1.5,
    width: 3,
    height: 2,
  },
  timerHandUp: {
    position: 'absolute',
    left: 11,
    top: 7,
    width: 1,
    height: 4.5,
  },
  timerHandRight: {
    position: 'absolute',
    left: 11,
    top: 11,
    width: 4,
    height: 1,
  },
});
