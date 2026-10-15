/**
 * 胶卷库抽屉：长按底部的胶片名 400ms 打开，从屏幕底部滑出，高度约窗口的 58%。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么是"底部抽屉"而不是 v1.2.0 那种整屏面板
 * ─────────────────────────────────────────────────────────────────────
 * 用户这次的要求是"从底部滑出高度 55%~60% 的深色磨砂抽屉"。整屏面板的代价是
 * 取景器被完全盖住，而换胶卷恰恰是"想一边看着取景器一边试"的动作 ——
 * 露出上面那 40% 的画面，换卷时心里有底。所以这里把面板收成底部一张纸。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么仍然用自绘覆盖层，而不是 RN 的 `Modal`
 * ─────────────────────────────────────────────────────────────────────
 * 1. `Modal` 在 New Architecture 下会新开一个原生窗口层。这台相机是**设备级**
 *    的（`zoom` / `selectedLens` 都写在 `AVCaptureDevice` 上，见 `zoom.ts` 文件头），
 *    多开一层窗口在部分机型上会让预览短暂黑屏再恢复 —— 换胶卷不该有这种副作用。
 * 2. `Modal` 的 `pageSheet` / `formSheet` 在 iOS 上**默认带圆角和半透明背景**，
 *    面板底色会被系统改写，不如自绘可控。
 * 3. 项目里已经有两个同样形态的覆盖层（`SettingsScreen` / `GalleryScreen`）都是用
 *    `...StyleSheet.absoluteFill` 自绘的，保持同一套结构，后来人不用学两种写法。
 *
 * 代价是 **Android 的物理返回键要自己接**（`Modal` 的 `onRequestClose` 白送了），
 * 见下面那段 `BackHandler` 的 effect。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么面板高度是"窗口高度的比例"，而不是一个固定数值
 * ─────────────────────────────────────────────────────────────────────
 * 抽屉里是 10 款胶卷的 2 列网格 = **5 行**，而每一行的高度取决于卡片宽度
 * （`cardWidth` 由窗口宽度算出，色块 + 两行字的高度都跟着它走）。
 * 也就是说"能不能装下 5 行"这件事本身就是窗口尺寸的函数：
 *   · 写死一个数值 → 大屏上只占一小条、小屏上又会盖满整个取景器；
 *   · 取窗口高度的 **0.58**（用户给的 55%~60% 的中值）→ 跟随屏幕自动缩放；
 *   · 再用 `[380, 窗口高度 × 0.62]` 夹一次：380 是"5 行卡 + 标题"在小屏上的
 *     最低可用高度，0.62 是"不能把取景器吃光"的上限。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么底色是实心面板色 + 一层纹理，而不是半透明"毛玻璃"
 * ─────────────────────────────────────────────────────────────────────
 * 真正的毛玻璃要 `expo-blur`（= 新依赖，本项目禁止）。用半透明黑
 * 假装透光只会让卡片上的等宽小字压在相机画面上，读不清。
 * 这里的"磨砂"是**材质**意义上的：实心打底（`theme.panel`，深色下就是原来写死的
 * `#1A1A1A` 那一档；浅色下跟着换，否则面板是黑板、标题却是深色字）+ 一张极低
 * 透明度的皮纹（和机身、设置页同一张 tile）+ 顶部一道亮边。
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRESETS } from '../constants/presets';
import { UI_MONO, useTheme } from '../constants/theme';
import type { Theme } from '../constants/theme';
import { UI_ASSETS } from '../constants/uiAssets';
import { useI18n } from '../i18n';
import { FilmCard, withAlpha } from './FilmCard';

export interface FilmDrawerProps {
  visible: boolean;
  /** 当前预设下标（用下标而不是 id，方便直接和 `PRESETS` 顺序对齐）。 */
  presetIndex: number;
  /** 选中某卷。`CameraScreen` 负责落库、震动和关闭。 */
  onSelect: (presetId: string) => void;
  onClose: () => void;
}

/** 网格外边距与列间距。 */
const GRID_PADDING = 16;
const GRID_GAP = 8;
/** 单列最小宽度：窗口极窄时宁可横向滚动，也不把工业代号挤成两行。 */
const CARD_MIN_WIDTH = 132;
/** 开合动画时长。够短，不挡手；够长，能看出是"面板推上来 / 收回去"而不是闪一下。 */
const REVEAL_MS = 180;
/** 面板高度 = 窗口高度 × 该比例（用户给的 55%~60% 取中值）。 */
const SHEET_HEIGHT_RATIO = 0.58;
/** 面板高度下限：小屏上"5 行卡 + 标题"的最低可用高度。 */
const SHEET_MIN_HEIGHT = 380;
/** 面板高度上限（相对窗口高度）：再高就把取景器吃光了。 */
const SHEET_MAX_RATIO = 0.62;
/** 关闭按钮的触控区边长。用户要求 ≥ 44，所以这里就是 44 —— 不做 hitSlop 取巧。 */
const CLOSE_TOUCH_SIZE = 44;
/** 面板初始位移：从下方 28pt 处推上来。够看出方向，又不至于飞过整屏。 */
const SHEET_SLIDE = 28;

/**
 * `memo` 的意义有限（父组件只在开关时重渲染它），保留是为了让"这个组件的 props
 * 全是基本类型"这件事在类型上成立 —— 里面那十张卡才是真正需要 `memo` 的地方。
 */
export const FilmDrawer = memo(function FilmDrawer({
  visible,
  presetIndex,
  onSelect,
  onClose,
}: FilmDrawerProps) {
  const { t } = useI18n();
  const theme = useTheme();
  // 颜色必须在组件里现取（模块级 StyleSheet 会被加载那一刻的深浅色冻结），
  // 而这层抽屉贴在取景器上，主题一切换它是最显眼的那块。
  const styles = useMemo(() => createStyles(theme), [theme]);
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // 0 → 1 的开合进度，同时驱动遮罩透明度、面板位移和整体淡出。
  const reveal = useRef(new Animated.Value(0)).current;
  /*
    为什么要多一个 `mounted`：用户这次要求"自动平滑收起"，
    所以 `visible` 变 false 之后面板还得留在树上把退场动画跑完，不能立刻 `return null`。
    `mounted` 就是"还在树上"这件事的开关，动画回调负责把它关掉。
  */
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
    }
  }, [visible]);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const animation = Animated.timing(reveal, {
      toValue: visible ? 1 : 0,
      duration: REVEAL_MS,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      // 只有"收回去"跑完了才卸载。中途又被点开时 `visible` 已经是 true，
      // 这里不会抢着卸载，下一次打开就从当前进度接着往上走。
      if (finished && !visible) {
        setMounted(false);
      }
    });
    return () => {
      animation.stop();
    };
  }, [mounted, visible, reveal]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'android') {
      return;
    }
    // 自绘覆盖层没有 `Modal` 的 `onRequestClose`，返回键必须自己接。
    // 返回 true 表示"这次返回我处理了"，避免用户按返回直接退出 App。
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [visible, onClose]);

  const cardWidth = useMemo(() => {
    const available = window.width - GRID_PADDING * 2 - GRID_GAP;
    return Math.max(CARD_MIN_WIDTH, Math.floor(available / 2));
  }, [window.width]);

  /**
   * 面板高度：先取比例，再夹到 [下限, 上限]。理由见文件头。
   * 上下限同时生效时（极矮的屏幕）**上限优先** —— 宁可让网格滚起来，
   * 也不能让面板盖过取景器。
   */
  const sheetHeight = useMemo(
    () =>
      Math.min(
        Math.max(Math.round(window.height * SHEET_HEIGHT_RATIO), SHEET_MIN_HEIGHT),
        Math.round(window.height * SHEET_MAX_RATIO),
      ),
    [window.height],
  );

  const handleSelect = useCallback(
    (presetId: string) => {
      onSelect(presetId);
    },
    [onSelect],
  );

  /**
   * 网格内容整体 memo：`PRESETS` 是模块级常量，`presetIndex` 只在换卷时变，
   * 所以打开抽屉、下拉滚动都不会重建这十张卡（`FilmCard` 自己也 memo 了）。
   */
  const grid = useMemo(
    () => (
      <View style={styles.grid}>
        {PRESETS.map((preset, index) => (
          <FilmCard
            key={preset.id}
            preset={preset}
            selected={index === presetIndex}
            width={cardWidth}
            onSelect={handleSelect}
          />
        ))}
      </View>
    ),
    [cardWidth, presetIndex, handleSelect],
  );

  if (!mounted) {
    // 从来没打开过、或者退场动画已经跑完 → 不占渲染成本。
    return null;
  }

  const translateY = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [SHEET_SLIDE, 0],
  });

  return (
    <Animated.View
      style={[styles.root, { opacity: reveal }]}
      /*
        退场动画期间面板还挂在树上，但**不能再接收触摸** —— 否则那 180ms 里
        用户点到的是正在消失的按钮。（`opacity` 为 0 的视图在 iOS 上依然命中测试。）
      */
      pointerEvents={visible ? 'auto' : 'none'}
      // 读屏软件应该只读这张面板，不要读后面的取景器。
      accessibilityViewIsModal
      // 读屏的双指双击 = 关闭（面板上唯一"整块"的无障碍动作）。
      onAccessibilityTap={onClose}
    >
      {/*
        遮罩：点空白处收起抽屉。`accessible={false}` —— 它是个纯手势区，
        在无障碍树里多一个"按钮"只会让读屏用户多滑一次。
      */}
      <Pressable style={styles.scrim} accessible={false} onPress={onClose} />

      <Animated.View
        style={[
          styles.sheet,
          { height: sheetHeight, paddingBottom: Math.max(insets.bottom, 8) },
          { transform: [{ translateY }] },
        ]}
      >
        {/* 磨砂材质：实心 #1A1A1A 打底（见文件头），上面一张极淡的皮纹。
            包一层 View 是为了 `pointerEvents` —— RN 的类型里它只属于 ViewStyle，
            不能直接写在 <Image> 上（写了 tsc 会报 property does not exist）。 */}
        <View style={styles.sheetTexture} pointerEvents="none">
          <Image
            source={UI_ASSETS.leatherTile}
            style={StyleSheet.absoluteFill}
            resizeMode="repeat"
            fadeDuration={0}
          />
        </View>

        <View style={styles.plate}>
          <View style={styles.plateTitles}>
            {/*
              标题：等宽 + 宽字距的"机器印字"。文案（`SELECT FILM STOCK · 胶卷库`）
              由语言包给出，这里只管排版；`adjustsFontSizeToFit` 是给窄屏兜底的 ——
              五语言里英文最长，加上 2.4 的字距在 320pt 宽的机器上会顶到 ✕。
            */}
            <Text
              style={styles.title}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {t('film.drawer.title')}
            </Text>
            <Text style={styles.hint} numberOfLines={1}>
              {t('film.drawer.hint')}
            </Text>
          </View>
          {/*
            极简关闭按钮：一个 `✕` 字符（比画两条线少一层布局，且天然居中）。
            触控区 44×44 —— 用户明确要求，所以不做 hitSlop 的"假放大"。
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('film.drawer.close')}
            onPress={onClose}
            style={({ pressed }) => [styles.close, pressed ? styles.pressed : null]}
          >
            <Text style={styles.closeMark}>✕</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          accessibilityLabel={t('film.drawer.a11y')}
          showsVerticalScrollIndicator={false}
        >
          {grid}
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
});

function createStyles(theme: Theme) {
  const { ink } = theme;
  return StyleSheet.create({
    root: {
      // 注意：RN 0.86 已移除 StyleSheet.absoluteFillObject，只能用 absoluteFill
      ...StyleSheet.absoluteFill,
      /*
       * `zIndex: 10` —— 全局层级阶梯里"底片抽屉"那一格（见 `CameraScreen.tsx`
       * 的 `overlayChrome` 注释）。
       *
       * 为什么必须有：顶栏和控制台都带 `zIndex: 2`，而 RN 里 **`zIndex` 压过声明顺序**。
       * 抽屉虽然声明在它们之后、又是全屏覆盖层，少了这个数字照样会被那 2 压住 ——
       * 真机实测报的"打开底片库时底部工具图标 + 快门 + 相册缩略图浮在抽屉上面挡住
       * 半截列表"就是这一条。取 10（而不是随手 3）：它是阶梯里抽屉自己那一格，
       * 上面还要给冲印遮罩（20）、相册/设置页（30）、全屏提示（50）留出位置。
       */
      zIndex: 10,
      // 抽屉只占下半屏，所以遮罩是**半透明**的：上面那 40% 要能看见取景器。
      // 这里刻意不跟 `theme.scrim`（它接近全不透明，是给整屏弹层用的）。
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(6, 6, 6, 0.55)',
    },
    scrim: {
      ...StyleSheet.absoluteFill,
    },
    sheet: {
      borderTopLeftRadius: 14,
      borderTopRightRadius: 14,
      // 实心面板色（理由见文件头）：不跟 `theme.scrim` 走，因为那会让卡片上的
      // 小字压着相机画面读不清。
      backgroundColor: theme.panel,
      borderTopWidth: StyleSheet.hairlineWidth,
      // 顶部一道亮边：让"纸从下面推上来"这件事有厚度，也是磨砂感的来源之一。
      borderTopColor: ink.hairline,
      // 圆角要把内部的纹理层裁掉，否则四个角会露出直角。
      overflow: 'hidden',
    },
    sheetTexture: {
      ...StyleSheet.absoluteFill,
      opacity: 0.35,
    },
    plate: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: GRID_PADDING,
      paddingRight: GRID_PADDING - 8,
      paddingTop: 14,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      // 标题下面那道暖色分隔线：琥珀色压到 28%，只留一点温度，不抢标题。
      borderBottomColor: withAlpha(ink.amber, 0.28),
    },
    plateTitles: {
      flexShrink: 1,
      paddingRight: 8,
    },
    title: {
      color: ink.amberSoft,
      fontSize: 13,
      letterSpacing: 2.4,
      fontFamily: UI_MONO,
    },
    hint: {
      marginTop: 3,
      color: ink.paperDim,
      fontSize: 9,
      letterSpacing: 0.4,
    },
    close: {
      width: CLOSE_TOUCH_SIZE,
      height: CLOSE_TOUCH_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeMark: {
      color: ink.paperDim,
      fontSize: 15,
      fontFamily: UI_MONO,
    },
    pressed: {
      opacity: 0.6,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: GRID_PADDING,
      paddingTop: 12,
      // 面板自己已经带了下安全区内边距，这里只留一点呼吸空间。
      paddingBottom: 16,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: GRID_GAP,
    },
  });
}
