/**
 * 次级功能横排：导入 / 重曝 / 定时 / 闪光灯 / 翻转。
 *
 * 为什么这五个是"图标 + 无障碍标签"而不是"图标 + 文字"：这一行在 375pt 宽的机型上要塞下
 * 五个 44pt 的触控区，加文字就必然缩到 36pt 以下 —— 那是点不准的尺寸。功能名交给
 * VoiceOver 念，视力用户靠图标和状态点（重曝的小圆点、定时的秒数）就够分辨了。
 *
 * 为什么导入/重曝/定时三个是自己画的线框而不是图标字体：`assets/ui/icon-*.png` 里没有它们，
 * 而"新增一个图标库"是这份任务书明确禁止的。五个 1pt 的 View 足够画出这三个形状。
 */
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AccessibilityState } from 'react-native';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import { UI_MONO, useTheme } from '../constants/theme';
import { UI_ASSETS } from '../constants/uiAssets';

/** 定时档位：0 = 关。3 / 10 秒是这份任务书定死的两个档，不做成任意秒数。 */
export type TimerSeconds = 0 | 3 | 10;

const ICON_SIZE = 22;
/** 触控区边长。低于 44pt 的按钮在移动端就是"看得到、点不中"。 */
const TOUCH = 44;

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
      {children}
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

  const iconColor = busy ? ink.paperFaint : ink.paper;
  const litColor = busy ? ink.paperFaint : ink.amber;
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
        <DoubleGlyph color={doubleExposure ? litColor : iconColor} />
      </ToolButton>

      <ToolButton
        a11yLabel={t('camera.tool.timer')}
        a11yValue={timerLabel}
        a11yState={{ selected: timerSeconds > 0 }}
        disabled={busy}
        onPress={onCycleTimer}
      >
        <TimerGlyph color={timerSeconds > 0 ? litColor : iconColor} />
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
          style={[styles.icon, { tintColor: flashOn ? litColor : flashDisabled ? ink.paperFaint : iconColor }]}
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
  pressed: {
    opacity: 0.6,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  dot: {
    position: 'absolute',
    left: 4,
    top: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badge: {
    fontFamily: UI_MONO,
    fontSize: 8,
    letterSpacing: 0.5,
    marginTop: 1,
  },
  glyph: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
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
