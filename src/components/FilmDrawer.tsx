/**
 * 胶卷库抽屉：点 `CameraScreen` 右下角那颗胶卷按钮打开（`DialButton`，
 * `onPress={handleOpenFilmDrawer}`），从屏幕底部整张滑上来，高度约窗口的 58%。
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
 * 为什么底色是"一整块实心面板色 + 顶部一道微光"，而不是"底色 + 一层皮纹"
 * ─────────────────────────────────────────────────────────────────────
 * 1. 真正的毛玻璃要 `expo-blur` 的 `BlurView` 铺满全屏，而抽屉只占下半屏、上面
 *    40% 还要能看见取景器，铺满反而不对。所以这里的"磨砂"是**材质**意义上的：
 *    一整块实心底色 + 顶部一道从上往下衰减的微光。
 * 2. 底色**只有一块，并且把 Header + 关闭按钮区 + 列表全包在里面**
 *    （用户这次的原话）。多一块底色就多一条分界线：横向的色差看起来是"上下两块
 *    色"，而纵向的色差（一条没铺满宽度、左右两端对不齐的纹理或高光）看起来就是
 *    用户报的那种"竖直断层"。
 * 3. v1.6.0 这里还铺过一张 `leatherTile`（`resizeMode="repeat"`、35% 不透明度）。
 *    v1.7.0 删掉了，因为**它就是用户报的那条竖线的来源**：这张 tile 是 320×320
 *    的 1x 资源（Metro 里没有 @2x 变体，缩放系数 = 1），铺在 390~430pt 宽的
 *    sheet 上时会在 x = 320pt 处留下一条平铺接缝。而这条接缝在**逐像素**意义上是
 *    整张图里最陡的一处：接缝落差 2.065，内部相邻列落差均值 1.280（接缝是它的
 *    1.61 倍，在 320 条边界里排第 1）；乘上 35% 不透明度合成到深色底上之后，
 *    它仍是整幅合成图里最强的一条落差（0.7345，内部均值 0.1493 的 **4.92 倍**，
 *    排名 1/1169），且纵向贯穿整张面板 —— x = 320pt 恰好落在 ✕ 左边十几点
 *    （390pt 屏上 ✕ 的触控区是 [338, 382]），就是用户说的"✕ 旁边一条垂直黑线"。
 *    删掉纹理层之后，抽屉里**每一层都左右均匀**，这一类问题在结构上不再可能发生。
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
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
/**
 * 开合弹簧：`speed` 越大越快，`bounciness` 越大越弹。
 * · speed 14（比 §25.3 那个 120ms / speed 28 的变焦推拉慢一半）：这里的位移是
 *   **整张面板的高度**（约 490pt），比那 3.5% 的推拉大两个数量级，同样的"重量感"
 *   需要慢得多的速度；14 大致落在 250ms 量级。
 * · bounciness **必须是 0**（临界阻尼，不回弹）：面板贴着屏幕底边，开抽屉时任何
 *   正向过冲都会把它顶过静止位，底部露出一条遮罩缝（关抽屉时过冲方向朝下、
 *   反而看不出来，但手感两边得对称，所以统一取 0）。
 * 真机手感没跑过 —— 见交付报告里"没能验证的"那一节。
 */
const SHEET_SPRING_SPEED = 14;
const SHEET_SPRING_BOUNCINESS = 0;
/** 面板高度 = 窗口高度 × 该比例（用户给的 55%~60% 取中值）。 */
const SHEET_HEIGHT_RATIO = 0.58;
/** 面板高度下限：小屏上"5 行卡 + 标题"的最低可用高度。 */
const SHEET_MIN_HEIGHT = 380;
/** 面板高度上限（相对窗口高度）：再高就把取景器吃光了。 */
const SHEET_MAX_RATIO = 0.62;
/** 关闭按钮的触控区边长。用户要求 ≥ 44，所以这里就是 44 —— 不做 hitSlop 取巧。 */
const CLOSE_TOUCH_SIZE = 44;
/** 深色下抽屉的统一底色：用户点名的 `#141416`（比 `theme.panel` 的 `#101013` 亮一档）。 */
const SHEET_SURFACE_DARK = '#141416';
/**
 * 顶部微光渐变。**不引 expo-linear-gradient**，用 RN 0.86 核心自带的
 * `experimental_backgroundImage`：iOS 侧它落到 `RCTViewComponentView` 里
 * 由 `RCTLinearGradient` 造出的 CAGradientLayer 上（见 `_props->backgroundImage`
 * 分支），好处是渐变**画在底色之上、所有子视图之下**（`BACKGROUND_COLOR_ZPOSITION`），
 * 所以不用再叠一层 View —— 也就不会再出现"两块底色拼在一起"的接缝。
 */
const SHEET_SHEEN_DARK =
  'linear-gradient(to bottom, rgba(255, 255, 255, 0.055) 0%, rgba(255, 255, 255, 0.018) 42%, rgba(255, 255, 255, 0) 100%)';
/** 浅色下白微光要比深色重一个数量级才看得出来（底色本来就是 `#F2F2EF`）。 */
const SHEET_SHEEN_LIGHT =
  'linear-gradient(to bottom, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.2) 42%, rgba(255, 255, 255, 0) 100%)';

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
  // 0 → 1 的开合进度：遮罩的不透明度 + 面板的位移都由它驱动。
  // （v1.6.0 还用它驱动整层的淡出，现在面板是"实心滑上来"，不再跟着淡。）
  const reveal = useRef(new Animated.Value(0)).current;
  /*
    为什么要多一个 `mounted`：用户要求"关闭时滑到底再卸载"，
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
    // `spring` + `useNativeDriver`：位移和透明度都交给原生驱动，JS 线程正忙
    // （比如同时在写相册）也不会把抽屉卡在半路。参数理由见上面的常量注释。
    const animation = Animated.spring(reveal, {
      toValue: visible ? 1 : 0,
      speed: SHEET_SPRING_SPEED,
      bounciness: SHEET_SPRING_BOUNCINESS,
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

  /*
    位移量取**面板自己的高度**：progress = 0 时整张面板在屏幕下沿之外（它的顶边
    正好压在屏幕底边上），progress = 1 时归位。v1.6.0 用的是固定 28pt 的小位移，
    那更像"淡出一个浮层"，不是用户这次要的"从屏幕底部升起"。
    这里依赖 `sheetHeight`（每台设备算出来不一样），所以插值写在 render 里。
  */
  const translateY = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight, 0],
  });

  return (
    <Animated.View
      /* 这一层不再做整体淡出：面板要"实心滑上来"，只有遮罩淡入淡出。 */
      style={styles.root}
      /*
        退场动画期间面板还挂在树上，但**不能再接收触摸** —— 否则那 250ms 里
        用户点到的是正在消失的按钮。（`opacity` 为 0 的视图在 iOS 上依然命中测试。）
      */
      pointerEvents={visible ? 'auto' : 'none'}
      // 读屏软件应该只读这张面板，不要读后面的取景器。
      accessibilityViewIsModal
      // 读屏的双指双击 = 关闭（面板上唯一"整块"的无障碍动作）。
      onAccessibilityTap={onClose}
    >
      {/*
        遮罩拆成两层："颜色"必须挂在 `Animated.View` 上才吃得到原生驱动的
        opacity（`Pressable` 不是 Animated 组件，往它 style 里塞 Animated.Value
        只会得到一条警告、动画不生效）；"手势区"还是那个纯 Pressable。
        `accessible={false}` —— 它是个纯手势区，在无障碍树里多一个"按钮"
        只会让读屏用户多滑一次。
      */}
      <Animated.View style={[styles.scrimDim, { opacity: reveal }]} pointerEvents="none" />
      <Pressable style={styles.scrim} accessible={false} onPress={onClose} />

      <Animated.View
        style={[
          styles.sheet,
          { height: sheetHeight, paddingBottom: Math.max(insets.bottom, 8) },
          { transform: [{ translateY }] },
        ]}
      >
        {/* 这里**没有**独立的纹理层：抽屉只有 `sheet` 一块底色 + 一道顶部微光。
            v1.6.0 的皮纹 tile（`resizeMode="repeat"`）就是那条竖线的来源，见文件头。 */}

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
            {/*
              副标题给两行：中文一行放得下，但英/法那句在 390pt 屏上要 1.4 行，
              写 `numberOfLines={1}` 就会把句尾截成 `…`（用户明确不要截断）。
              中文仍然只占一行，面板高度不变。
            */}
            <Text style={styles.hint} numberOfLines={2}>
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
  // 深色用用户点名的 `#141416`；浅色跟主题走 —— 浅色里塞一块近黑面板会跟浅色
  // 遮罩、玻璃控制台打架，取舍写在交付报告的"拿不准的"那一节。微光强度同理。
  const sheetSurface = theme.scheme === 'dark' ? SHEET_SURFACE_DARK : theme.panel;
  const sheetSheen = theme.scheme === 'dark' ? SHEET_SHEEN_DARK : SHEET_SHEEN_LIGHT;
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
      // 遮罩的底色不挂在这一层：这一层不参与动画（面板要实心滑上来），
      // 而遮罩得能淡入淡出，所以颜色挪到了 `scrimDim`。
      justifyContent: 'flex-end',
    },
    scrimDim: {
      ...StyleSheet.absoluteFill,
      // 抽屉只占下半屏，所以遮罩是**半透明**的：上面那 40% 要能看见取景器。
      // 这里刻意不跟 `theme.scrim`（它接近全不透明，是给整屏弹层用的）。
      backgroundColor: 'rgba(6, 6, 6, 0.55)',
    },
    scrim: {
      ...StyleSheet.absoluteFill,
    },
    sheet: {
      borderTopLeftRadius: 14,
      borderTopRightRadius: 14,
      // **唯一**的一块实心底色：Header + 关闭按钮区 + 列表全部住在这一个容器里。
      backgroundColor: sheetSurface,
      // 顶部微光：画在底色之上、子视图之下（理由见常量注释）。整层左右均匀，
      // 不会在横向任何位置切出分界线。
      experimental_backgroundImage: sheetSheen,
      borderTopWidth: StyleSheet.hairlineWidth,
      // 顶部一道亮边：让"纸从下面推上来"这件事有厚度，也是磨砂感的来源之一。
      borderTopColor: ink.hairline,
      // 圆角要把里面的内容（包括那张滚动列表）裁掉，否则四个角会露出直角。
      overflow: 'hidden',
    },
    plate: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: GRID_PADDING,
      paddingRight: GRID_PADDING - 8,
      paddingTop: 14,
      paddingBottom: 10,
      // 这一层**不能有 backgroundColor**：抽屉只有一块底色（`sheet`）。
      // 多一块底色就多一条分界线 —— 横向色差是"上下两块色"，纵向色差（一条左右
      // 对不齐的纹理/高光）就是用户报的那种"竖直断层"。
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
      // 两行之间的呼吸：9pt 的字不带行高时两行会粘在一起（英文尤其明显）。
      lineHeight: 12,
    },
    close: {
      width: CLOSE_TOUCH_SIZE,
      height: CLOSE_TOUCH_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      // 刻意**零背景、零圆角**：用户报的"✕ 外面一块异色背景"在 v1.6.0 的代码里
      // 并不存在（已用 git 逐字节核对过 HEAD），这里保持零背景 —— 别为了"看起来
      // 像个按钮"再加一块底色，抽屉里第二块底色就是第二处接缝的来源。
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
