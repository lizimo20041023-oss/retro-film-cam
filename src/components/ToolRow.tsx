/**
 * 次级功能横排：导入 / 重曝 / 定时 / 闪光灯 / 翻转。
 *
 * 为什么这五个是"图标 + 无障碍标签"而不是"图标 + 文字"：这一行在 375pt 宽的机型上要塞下
 * 五个 44pt 的触控区，加文字就必然缩到 36pt 以下 —— 那是点不准的尺寸。功能名交给
 * VoiceOver 念，视力用户靠图标和状态点（重曝的小圆点、定时的秒数）就够分辨了。
 *
 * 为什么导入/重曝/定时三个是自己画的线框而不是图标字体：`assets/ui/icon-*.png` 里没有它们，
 * 而"新增一个图标库"是这份任务书明确禁止的。几个 1pt 的 View 足够画出这三个形状。
 * 闪光灯后来也走上了同一条路：贴图只有两张、斜杠与角标根本没有素材（见 `FlashGlyph`）。
 *
 * 液态玻璃改版后，这一行的**外壳**换成了一枚 40pt 的玻璃圆盘（见 `ToolButton`），
 * 当时五个图标的画法、状态判据、无障碍标签一个字节都没动 —— 只换了它们脚下垫的东西。
 *
 * 例外是闪光灯那一枚（v1.6.2 重做）：用户反馈"⚡️ 按钮看不出开没开"，它从两档布尔值
 * 变成了三档（off / on / auto），并拿到了这一行里唯一一块会变色的底盘与描边。
 * 另外四枚仍然是"图标 + 状态点"，判据没动。
 */
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AccessibilityState, ColorValue } from 'react-native';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import { UI_MONO, useTheme } from '../constants/theme';
import { UI_ASSETS } from '../constants/uiAssets';
import { GLASS_TEXT_COLOR, glassTextShadow, LiquidGlassView } from './LiquidGlassView';

/** 定时档位：0 = 关。3 / 10 秒是这份任务书定死的两个档，不做成任意秒数。 */
export type TimerSeconds = 0 | 3 | 10;

/** 闪光灯三档。expo-camera 的 `FlashMode` 还多一个 `'screen'`，那是"屏幕补光"，本 App 不做。 */
export type FlashMode = 'off' | 'on' | 'auto';

/**
 * 闪光灯的点亮色。**刻意不取 `ink.amber`**：浅色机身下 `ink.amber` 是朱红 `#D32F2F`
 * （`theme.ts:83`），而"闪光灯亮着"和 `theme.focus` 的真黄一样是**硬件信号**，
 * 不该跟着机身换色 —— 用户给的规格也把这个值写死成 `#E5A93C`。深色机身下两者恰好同值。
 */
const FLASH_AMBER = '#E5A93C';

/**
 * 开启态压在玻璃上的琥珀底。0.28 是规格给定值：亮到一眼看出"这块玻璃在发光"，
 * 又不至于把里面的闪电吃掉。
 */
const FLASH_AMBER_FILL = 'rgba(229, 169, 60, 0.28)';

/**
 * 关闭态的图标与描边色。比另外四枚的纯白图标暗一档 —— 关闭是"没在工作"，
 * 一眼扫过时它必须退到后面去。
 */
const FLASH_OFF_INK = 'rgba(255, 255, 255, 0.45)';

/** 灰下去的图标色（`busy` 与 `flashDisabled` 共用，两处必须是同一个值）。 */
const INACTIVE_INK = 'rgba(255, 255, 255, 0.38)';

/** 灰下去的盘子底色。禁用态和 `DialButton` 用同一个压暗值。 */
const INACTIVE_FILL = 'rgba(120, 120, 128, 0.16)';

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

/**
 * 开启态闪电的琥珀发光。写法和 `GLYPH_SHADOW` 完全一样（零偏移的全向晕），
 * 只换掉颜色与强度：那一条是"白线浮在画面上要压暗"，这一条是"灯亮着"。
 * 半径 3 / 不透明度 0.8 落在规格给的 2~4 与 0.6~0.9 中间。
 */
const FLASH_GLOW = {
  shadowColor: FLASH_AMBER,
  shadowOffset: { width: 0, height: 0 },
  shadowRadius: 3,
  shadowOpacity: 0.8,
} as const;

export interface ToolRowProps {
  doubleExposure: boolean;
  timerSeconds: TimerSeconds;
  /** 闪光灯三档。轮转顺序由父组件决定（off → on → auto → off）。 */
  flashMode: FlashMode;
  /** 前摄没有闪光灯：按钮该是灰的，而不是点了没反应 */
  flashDisabled: boolean;
  /** 正在冲印 / 导入：所有会改变拍摄参数的动作都禁用，免得改了参数却不是这一张 */
  busy: boolean;
  onImport: () => void;
  onToggleDouble: () => void;
  onCycleTimer: () => void;
  onCycleFlash: () => void;
  onFlip: () => void;
}

interface ToolButtonProps {
  a11yLabel: string;
  a11yValue?: string;
  a11yState?: AccessibilityState;
  disabled?: boolean;
  /** 左上角状态点（重曝开着的时候要有） */
  dot?: boolean;
  /**
   * 点亮态的琥珀底盘。**刻意不经过 `LiquidGlassView.overlay`** —— 那个 prop 是
   * "替换"深色玻璃底的，换掉之后按钮底下就只剩实时画面，一片过曝的天空会把琥珀图标淹掉；
   * 这里改成在玻璃**上面**再压一层，深色底还在，对比度就不看天气了。
   */
  accentFill?: ColorValue;
  /** 点亮态的 1pt 描边色。画在盘子最外圈，正好盖住那圈白色折射环。 */
  accentRing?: ColorValue;
  /** 右上角角标（闪光灯的 auto）。 */
  cornerBadge?: ReactNode;
  onPress: () => void;
  children: ReactNode;
}

function ToolButton({
  a11yLabel,
  a11yValue,
  a11yState,
  disabled = false,
  dot = false,
  accentFill,
  accentRing,
  cornerBadge,
  onPress,
  children,
}: ToolButtonProps) {
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
        overlay={disabled ? INACTIVE_FILL : undefined}
      >
        {/*
          琥珀底盘必须排在 `children` **前面**：它和图标是同一个父容器的兄弟节点，
          晚出现的会盖住早出现的，顺序反了就是把图标压在色块底下。
        */}
        {!disabled && accentFill !== undefined ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.accentFill, { backgroundColor: accentFill }]} />
        ) : null}
        {children}
        {!disabled && accentRing !== undefined ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.accentRing, { borderColor: accentRing }]} />
        ) : null}
      </LiquidGlassView>
      {/* 灰下去的按钮不该还挂着角标：角标在说"自动"，而按钮已经按不动了 */}
      {!disabled && cornerBadge !== undefined ? cornerBadge : null}
      {dot ? <View style={[styles.dot, { backgroundColor: ink.amber }]} /> : null}
    </Pressable>
  );
}

function ToolRowInner({
  doubleExposure,
  timerSeconds,
  flashMode,
  flashDisabled,
  busy,
  onImport,
  onToggleDouble,
  onCycleTimer,
  onCycleFlash,
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
  const iconColor = busy ? INACTIVE_INK : GLASS_TEXT_COLOR;
  /*
   * 点亮态：图标仍是纯白，**状态靠"左上角圆点 + 定时秒数"这两个琥珀标记说**。
   * 上一版是把图标本身染成琥珀，改纯白之后那条路没了 —— 好在琥珀圆点本来就在，
   * 而且在玻璃底上比染色更干净（染色会把 1pt 的线框染糊）。
   *
   * ⚠️ 反过来说，重曝/定时的"开着"现在只剩一个小圆点和一行 8pt 秒数，
   * 比"整枚图标变琥珀"要弱。这里刻意**保留琥珀**而不是也刷成白色：
   * 纯白在浅色玻璃上表达不出"亮/灭"的差别，状态就彻底丢了。
   */
  const litColor = busy ? INACTIVE_INK : ink.amber;
  const timerLabel = timerSeconds === 3 ? t('camera.tool.timer.3') : timerSeconds === 10 ? t('camera.tool.timer.10') : t('camera.tool.timer.off');

  /*
   * 闪光灯三档的视觉语言。用户的原话是"状态变化太微弱"，所以三档的差别刻意落在
   * **三条互相独立**的通道上，任何一条失效都不会退化成"看不出开没开"：
   *   描边：off 暗灰 1pt → on 琥珀 1pt → auto 不描边
   *   图标：off 暗灰 + 斜杠 → auto 亮白 → on 琥珀 + 发光
   *   底盘：off / auto 深色毛玻璃原样 → on 再压一层琥珀
   * 三档只发生在这枚按钮上，另外四枚的"图标 + 状态点"没动。
   */
  const flashInactive = busy || flashDisabled;
  const flashColor = flashInactive
    ? INACTIVE_INK
    : flashMode === 'off'
      ? FLASH_OFF_INK
      : flashMode === 'on'
        ? FLASH_AMBER
        : GLASS_TEXT_COLOR;
  const flashFill = flashMode === 'on' ? FLASH_AMBER_FILL : undefined;
  const flashRing = flashMode === 'on' ? FLASH_AMBER : flashMode === 'off' ? FLASH_OFF_INK : undefined;
  /*
   * 无障碍标签说的是"现在是哪一档"，不是"按下去会怎样"：三档之后一个动作名覆盖不了
   * 三种状态。旧的两个键（`camera.flash.on` / `camera.flash.off`）描述的是**动作**，
   * 三档之后一个动作名覆盖不了三种状态 —— 那两个键已在 v1.6.1 从五个语言包里删除
   * （全仓零消费，留着只会让人以为还有第二套闪光灯文案）。
   */
  const flashLabel =
    flashMode === 'off'
      ? t('camera.flash.state.off')
      : flashMode === 'on'
        ? t('camera.flash.state.on')
        : t('camera.flash.state.auto');

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
        a11yLabel={flashLabel}
        a11yState={{ selected: flashMode !== 'off' }}
        disabled={flashInactive}
        accentFill={flashFill}
        accentRing={flashRing}
        cornerBadge={
          flashMode === 'auto' ? (
            <View style={styles.autoBadge}>
              <Text style={styles.autoBadgeText} allowFontScaling={false}>
                A
              </Text>
            </View>
          ) : undefined
        }
        onPress={onCycleFlash}
      >
        <FlashGlyph color={flashColor} mode={flashMode} inactive={flashInactive} />
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
 * 画出来的图标。尺寸都按 22pt 的画布对齐，和 PNG 图标视觉重量一致。
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

/**
 * 闪光灯图标。off 在闪电上多画一道斜杠（`⚡️̸`），on 让它发光。
 *
 * 为什么斜杠是一个 `View`：`assets/ui/` 里只有两张闪电贴图，"不许新增 PNG / 图标字体"
 * 是硬约束 —— 一根 1.5pt 的横条转 -45° 就把斜杠画出来了（RN 的 `rotate` 正角是顺时针，
 * 负角逆时针，横条右端抬起，落成 U+0338 那个方向的斜杠）。
 *
 * 为什么两张贴图选哪张只影响语义：它们的 **alpha 通道逐字节相同**（28224 字节，
 * 不透明像素 3951 个、包围盒 76×140 也完全一致），只有 PNG 里预烤的 RGB 不同
 * （灰 196,192,184 / 琥珀 210,139,42），而 RN 的 `tintColor` 按 alpha 上色 ——
 * 两张图在运行时长得一模一样。这里仍然按"没点亮用 `iconFlash`、点亮用 `iconFlashOn`"
 * 取图：一是保住原始语义，二是免得 `uiAssets.ts` 里的条目因为全仓没人引用而被摇掉。
 */
function FlashGlyph({ color, mode, inactive }: { color: string; mode: FlashMode; inactive: boolean }) {
  return (
    <View style={styles.glyph}>
      <Image
        source={mode === 'on' ? UI_ASSETS.iconFlashOn : UI_ASSETS.iconFlash}
        style={[styles.icon, { tintColor: color }, mode === 'on' && !inactive ? styles.flashGlow : undefined]}
      />
      {mode === 'off' ? <View style={[styles.flashSlash, { backgroundColor: color }]} /> : null}
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
  // `StyleSheet.absoluteFill` 负责铺满，这里只管圆角：盘子是圆的，色块不能是方的
  accentFill: {
    borderRadius: DISC / 2,
  },
  accentRing: {
    borderWidth: 1,
    borderRadius: DISC / 2,
  },
  flashGlow: {
    ...FLASH_GLOW,
  },
  flashSlash: {
    position: 'absolute',
    /*
     * 比 22pt 的图标画布还长 4pt：闪电的包围盒只有 18pt 高，斜杠两头都得露出来
     * 才读得出"划掉"而不是"闪电上多了个短线"。多出来的部分落在盘子里的空白处
     * （图标居中，左右各有 9pt），顶不到盘沿。
     */
    width: 26,
    height: 1.5,
    borderRadius: 0.75,
    left: (ICON_SIZE - 26) / 2,
    top: (ICON_SIZE - 1.5) / 2,
    transform: [{ rotate: '-45deg' }],
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
  autoBadge: {
    position: 'absolute',
    /*
     * 贴在 40pt 盘子的右上盘沿上，用的是和 `dot` 同一套坐标系：先按
     * `(TOUCH - DISC) / 2` 把原点从 44pt 触控区挪到盘子左上角，再各偏一点。
     * 右上角会有一小半压在盘外 —— 圆盘的右上角本来就没有玻璃，全塞进去反而会
     * 顶到闪电的尖端（闪电在触控区里占 x 17.2~27.0，角标从 x 26 起）。
     */
    right: (TOUCH - DISC) / 2 + 1,
    top: (TOUCH - DISC) / 2 + 1,
    width: 15,
    height: 13,
    borderRadius: 6.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FLASH_AMBER,
    /*
     * 1pt 暗描边：和 `GLYPH_SHADOW` 同一个理由 —— 这一行随时可能浮在一片过曝的
     * 天空上，纯琥珀的胶囊落在白底上只剩 2:1 的对比，加一圈暗边才不会糊掉。
     */
    borderWidth: 1,
    borderColor: 'rgba(26, 18, 6, 0.35)',
  },
  autoBadgeText: {
    fontFamily: UI_MONO,
    fontSize: 9,
    fontWeight: '700',
    /*
     * 近黑的深棕，而不是规格里那个"纯白"：9px 的白字压在 #E5A93C 上只有 2.1:1 的
     * 对比度，在取景器上会被亮背景吃掉；换成近黑是 8.7:1，"A" 才是一个能一眼读出
     * 的形状。规格把这个选择交给了我（"纯白或琥珀橙底 —— 你定"），理由记在这里。
     */
    color: '#1A1206',
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
