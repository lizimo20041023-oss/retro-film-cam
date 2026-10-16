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
  Image,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_FRAME_ID, FRAMES, findFrameIndex, frameSkinSeedOf } from '../constants/frames';
import { FRAME_VARIANTS, findFrameVariantIndex, wrapFrameVariant } from '../constants/frameVariants';
import { PRESETS } from '../constants/presets';
import { UI_MONO, useTheme } from '../constants/theme';
import type { Theme } from '../constants/theme';
import { useSettings } from '../hooks/useSettings';
import { useI18n } from '../i18n';
import { computeFrameLayout, frameSourceOf } from '../utils/geometry';
import { FilmCard, withAlpha } from './FilmCard';
import { FrameSkin } from './FrameSkin';

export interface FilmDrawerProps {
  visible: boolean;
  /** 当前预设下标（用下标而不是 id，方便直接和 `PRESETS` 顺序对齐）。 */
  presetIndex: number;
  /** 选中某卷。`CameraScreen` 负责落库、震动和关闭。 */
  onSelect: (presetId: string) => void;
  /**
   * 当前相框 id（`'polaroid-600'` 等）。**可选** —— 相框下标至今仍是
   * `CameraScreen` 的局部 state（v1.7.0 没把它提进全局设置：提了会让"取景器里
   * 换个框"变成全局副作用）。抽屉只需要 id 来显示"现在套的是哪款相框"，
   * 不传时退回默认相框，这一行照样能用，只是名字固定。
   */
  frameId?: string;
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
 * 「相框风格」那一行的滑动门槛（pt）。**故意用固定值**，不像 `FrameSwitcher`
 * 那样按宽度比例算：那边是铺满整个取景器的整块手势区（390pt 屏上 0.18 ≈ 70pt），
 * 而这里只有一行药丸那么高、手指的可用行程本来就短，70pt 的门槛等于划不动。
 */
const VARIANT_SWIPE_THRESHOLD = 34;
/** 接管手势所需的最小水平位移（和 `FrameSwitcher` 用同一组数）。 */
const VARIANT_SWIPE_MIN = 14;
/** 水平位移必须是纵向的这么多倍才接管 —— 这一行住在纵向 `ScrollView` 里。 */
const VARIANT_SWIPE_SLOPE = 1.4;
/** 拖动时药丸排的跟手系数与最大位移：跟手，但不真的滑出去（下面就是胶卷网格）。 */
const VARIANT_DRAG_FOLLOW = 0.35;
const VARIANT_DRAG_CLAMP = 22;
/**
 * 迷你成片预览的取景框尺寸（pt）。
 * 为什么要有这块：抽屉一打开，取景器整个 `opacity: 0`（`CameraScreen` 的 `covered`），
 * 而抽屉只占屏幕下方 58% —— 用户在抽屉里滑 A/B/C 时**看不到任何变化**，
 * 得关掉抽屉才知道自己选了什么。这块小窗是"边滑边看"的唯一出口。
 * 96×72 是能同时看清"相纸留白比例"和"材质色"的最小尺寸（材质是平色/渐变与极细的
 * 压痕、切边，再小就只剩一块灰）。
 */
const FRAME_PREVIEW_WIDTH = 96;
const FRAME_PREVIEW_HEIGHT = 72;
/** 窄屏（<360pt）上缩到 76×57，免得把左边的相框名挤成省略号。 */
const FRAME_PREVIEW_NARROW_WIDTH = 76;
/**
 * 小窗底色写死深色（不用主题色）：它是"暗房里的观察窗"，浅色主题下用浅底会把
 * 相纸的白色留白和底色糊在一起，看不出窗口边界。
 * ⚠️ 取值必须与 `FramePreviewLayer.CURTAIN_COLOR` 一致：抽屉小窗与取景器幕布
 * 是同一块黑，两处差一点点在切换时会看出一跳。
 */
const FRAME_PREVIEW_BACKDROP = '#0A0A0C';
/**
 * 无障碍动作：`adjustable` 的标准两个（读屏的"上滑 / 下滑"）。
 * 不挂 `activate` —— 点按是留给手指的，读屏用这两个就能在三档之间走完。
 */
const VARIANT_A11Y_ACTIONS = [{ name: 'increment' as const }, { name: 'decrement' as const }];

/** 拖动位移 → 跟手位移（限幅，避免药丸排真的滑出面板）。 */
function clampVariantDrag(dx: number): number {
  const followed = dx * VARIANT_DRAG_FOLLOW;
  return Math.max(-VARIANT_DRAG_CLAMP, Math.min(VARIANT_DRAG_CLAMP, followed));
}

/**
 * `memo` 的意义有限（父组件只在开关时重渲染它），保留是为了让"这个组件的 props
 * 全是基本类型"这件事在类型上成立 —— 里面那十张卡才是真正需要 `memo` 的地方。
 */
export const FilmDrawer = memo(function FilmDrawer({
  visible,
  presetIndex,
  onSelect,
  frameId,
  onClose,
}: FilmDrawerProps) {
  const { t } = useI18n();
  const theme = useTheme();
  // 颜色必须在组件里现取（模块级 StyleSheet 会被加载那一刻的深浅色冻结），
  // 而这层抽屉贴在取景器上，主题一切换它是最显眼的那块。
  const styles = useMemo(() => createStyles(theme), [theme]);
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  /*
    相框风格是**全局设置**（`AppSettings.frameVariant`），不是抽屉自己的 state：
    用户要的是"抽屉里切完，取景器里立刻看到同一个皮肤"（v1.7.0 的相框实时预览），
    所以两边必须读同一份数据。取景器那侧的接线在 `CameraScreen`，我这边只负责写。
  */
  const { settings, setFrameVariant } = useSettings();
  const variantIndex = findFrameVariantIndex(settings.frameVariant);
  const variantLabel = t(FRAME_VARIANTS[variantIndex].labelKey);
  /*
    当前相框的名字：抽屉只拿得到 id。名字算法照抄 `CameraScreen.tsx:445` ——
    有 `nameKey` 走语言包（五语言），否则用数据里写死的 `name`。
  */
  const frame = FRAMES[findFrameIndex(frameId ?? DEFAULT_FRAME_ID)];
  const frameName = frame.nameKey !== undefined ? t(frame.nameKey) : frame.name;
  /*
    迷你成片预览的几何：**和成片走同一个函数**（`computeFrameLayout`），
    所以小窗里的相纸长宽比、内窗矩形都和 `FilmCompositor` 那套一致 —— 不自己乘长宽比。
    照片源同理走 `frameSourceOf(frame, 'portrait')`。
  */
  const previewWidth = window.width < 360 ? FRAME_PREVIEW_NARROW_WIDTH : FRAME_PREVIEW_WIDTH;
  const previewHeight = Math.round((previewWidth * FRAME_PREVIEW_HEIGHT) / FRAME_PREVIEW_WIDTH);
  const previewLayout = useMemo(
    () => computeFrameLayout(frame, previewWidth, previewHeight),
    [frame, previewWidth, previewHeight],
  );
  // 两处都做成 memo：样式对象每帧新建会让 `FrameSkin` 的 memo 失效（它有 6 个依赖）。
  const previewBox = useMemo(
    () => ({ width: previewWidth, height: previewHeight }),
    [previewWidth, previewHeight],
  );
  const previewPaper = useMemo(
    () => ({ width: previewLayout.width, height: previewLayout.height }),
    [previewLayout],
  );
  /*
    「相框」行的手势状态。技法照 `FrameSwitcher`（拖动只 `setValue`、越阈值震一下、
    松手要么提交要么弹回），但**不复用那个组件**：它的无障碍文案写死了
    "相框切换 / 左右滑动切换相框"，摆在这里会把读屏用户念到错的东西（这一行切的是
    风格，不是相框）。
  */
  const variantDrag = useRef(new Animated.Value(0)).current;
  /** 本次手势是否已经震过（越过阈值只震一次）。 */
  const variantArmedRef = useRef(false);
  /** 提交动画进行中 → 忽略新手势，避免连划两下切两档。 */
  const variantBusyRef = useRef(false);
  /*
    最新快照：`PanResponder` 只创建一次（重建会把进行中的手势丢掉），所以它只能靠
    这个 ref 读到当前的档位与 setter。渲染期写 ref 和 `FrameSwitcher.tsx:58-59`
    是同一个套路。
  */
  const variantRef = useRef({ index: variantIndex, onChange: setFrameVariant });
  variantRef.current = { index: variantIndex, onChange: setFrameVariant };
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
   * 提交一次风格切换。`direction` = -1 上一档 / +1 下一档（环回，见 `wrapFrameVariant`）。
   * 三档共用同一棵皮肤树，换档只是换一个字符串 —— 没有第二套渲染路径。
   */
  const commitVariant = useCallback(
    (direction: -1 | 1): void => {
      if (variantBusyRef.current) {
        return;
      }
      const current = variantRef.current;
      const next = wrapFrameVariant(current.index + direction);
      if (next !== current.index) {
        current.onChange(FRAME_VARIANTS[next].id);
      }
      variantBusyRef.current = true;
      // 药丸排不是在"翻页"，所以不用 `FrameSwitcher` 那套 140ms 滑出再入场：
      // 目标档当场就亮（数据已经是新的），位移只负责把手感交代清楚。
      Animated.spring(variantDrag, {
        toValue: 0,
        speed: 18,
        bounciness: 4,
        useNativeDriver: false,
      }).start(() => {
        variantBusyRef.current = false;
      });
    },
    [variantDrag],
  );

  /**
   * 一次性创建的 `PanResponder`（技法照 `FrameSwitcher.tsx:110-160`）。
   * 它拿到的 `commitVariant` 是首次渲染那一份，但那个 `useCallback` 只依赖
   * `variantDrag`（一个永不换对象的 ref 值），所以引用永远有效。
   */
  const variantResponderRef = useRef(
    PanResponder.create({
      // 点按要留给药丸自己（按下不抢），只有明显横划才接管。
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_event, gesture) => {
        if (variantBusyRef.current) {
          return false;
        }
        const horizontal = Math.abs(gesture.dx);
        const vertical = Math.abs(gesture.dy);
        /*
          明显偏水平才接管：这一行住在一个**纵向** `ScrollView` 里，抢错手势列表就
          滑不动了，所以斜率判据和 `FrameSwitcher` 用同一组数（14pt / 1.4 倍）。
        */
        return horizontal > VARIANT_SWIPE_MIN && horizontal > vertical * VARIANT_SWIPE_SLOPE;
      },
      onPanResponderGrant: () => {
        variantArmedRef.current = false;
      },
      onPanResponderMove: (_event, gesture) => {
        // 关键：只有 `setValue`，没有 `setState` —— 一次拖动最多一次重渲染
        //（提交那一刻由 context 触发）。
        variantDrag.setValue(clampVariantDrag(gesture.dx));
        if (!variantArmedRef.current && Math.abs(gesture.dx) > VARIANT_SWIPE_THRESHOLD) {
          variantArmedRef.current = true;
          // 越过"松手就会切"的阈值时震一下：给用户确定性（同 `FrameSwitcher`）。
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      },
      onPanResponderRelease: (_event, gesture) => {
        if (Math.abs(gesture.dx) > VARIANT_SWIPE_THRESHOLD) {
          commitVariant(gesture.dx < 0 ? 1 : -1);
        } else {
          Animated.spring(variantDrag, {
            toValue: 0,
            speed: 18,
            bounciness: 5,
            useNativeDriver: false,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        // 被别的手势抢走（比如列表开始滚动）→ 弹回原位，不切档。
        Animated.spring(variantDrag, {
          toValue: 0,
          speed: 18,
          bounciness: 5,
          useNativeDriver: false,
        }).start();
      },
      onPanResponderTerminationRequest: () => false,
    }),
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
          {/*
            「相框」行（v1.7.0）。放在列表**最上面**而不是钉在标题下方：面板高度是
            固定的（0.58 × 屏高），钉住等于再从十张卡里吃掉一行；放进滚动内容里，
            用户往下翻胶卷时它自然让位。

            这里的"三档"是**同一款相框的三套皮肤**（经典 / 复古 / 涂鸦），不是三个
            相框 —— 换相框仍然是取景器左右滑动 / 顶栏 `FrameBadge` 那件事。
          */}
          <View
            style={styles.framePanel}
            /*
              整行对外是**一个** `adjustable`（读屏用"上/下滑动"换档），和 iOS 原生
              `UISegmentedControl` 的读法一致：`accessibilityLabel` 报当前档
              （"相框风格 复古"），下面那排药丸在无障碍树里被整个摘掉。
            */
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={t('frame.variant.a11y', { name: variantLabel })}
            accessibilityHint={t('drawer.frame.hint')}
            accessibilityActions={VARIANT_A11Y_ACTIONS}
            onAccessibilityAction={(event) => {
              const { actionName } = event.nativeEvent;
              if (actionName === 'increment') {
                commitVariant(1);
              } else if (actionName === 'decrement') {
                commitVariant(-1);
              }
            }}
            {...variantResponderRef.current.panHandlers}
          >
            <View style={styles.frameHead}>
              <View style={styles.frameHeadText}>
                <Text style={styles.frameLabel}>{t('drawer.frame.title')}</Text>
                <Text style={styles.frameName} numberOfLines={1}>
                  {frameName}
                </Text>
                <Text style={styles.frameHint} numberOfLines={2}>
                  {t('drawer.frame.hint')}
                </Text>
              </View>
              {/*
                迷你成片预览（v1.7.0）：相框 PNG 打底 + **同一个 `FrameSkin`** 叠在
                上面，叠放顺序与 `FilmCompositor` 完全一致（皮肤在 PNG 之上、水印之下）；
                几何来自同一个 `computeFrameLayout`。所以"小窗里看到的"就是
                "关掉抽屉后取景器/成片里会有的"。
                · `pointerEvents="none"`：这块只负责看，不抢药丸行和整行的手势；
                · 不画水印：96pt 宽下 11pt 的日期字会糊成一团，反而像 bug ——
                  预览要的是"相纸比例 + 皮肤花纹"；
                · 尺寸跟着窄屏缩（`previewBox`），跟着 `window.width` 走，不横向溢出。
              */}
              <View
                style={[styles.framePreviewBox, previewBox]}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <View style={previewPaper}>
                  <Image
                    source={frameSourceOf(frame, 'portrait')}
                    style={previewPaper}
                    resizeMode="stretch"
                    fadeDuration={0}
                  />
                  <FrameSkin
                    width={previewLayout.width}
                    height={previewLayout.height}
                    window={previewLayout.window}
                    variant={settings.frameVariant}
                    seed={frameSkinSeedOf(frame)}
                  />
                </View>
              </View>
            </View>
            <Animated.View
              style={[styles.framePills, { transform: [{ translateX: variantDrag }] }]}
              // 触控照旧（这两个 prop 只影响无障碍树），只是读屏看不到这三个药丸。
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {FRAME_VARIANTS.map((spec, index) => {
                const active = index === variantIndex;
                return (
                  <Pressable
                    key={spec.id}
                    style={styles.framePill}
                    // 药丸本体 44pt 高（色板 + 名字），纵向各补 5pt 只会更好按；
                    // 横向**不补** —— 相邻两档之间补了就会互相压住。
                    hitSlop={{ top: 5, bottom: 5, left: 0, right: 0 }}
                    onPress={() => {
                      if (!active) {
                        setFrameVariant(spec.id);
                        void Haptics.selectionAsync();
                      }
                    }}
                  >
                    {({ pressed }) => (
                      <View
                        style={[
                          styles.framePillBody,
                          active ? styles.framePillBodyActive : null,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        {/*
                          芯片显示**材质本来的颜色**（v1.8.0 的要求）：色板直接取配方的
                          `base`，底边一道极细的"边缘墨色"（暗色材质用它自己的金属切边色，
                          其余用压痕的暗色）。这样三档在抽屉里一眼就是三种纸/三种暗房卡纸，
                          而不是三个文字标签。
                          ⚠️ 选中态**不许**染在色板上（染了就不是"真实材质色"了）：
                          它只改外框与名字的颜色。
                        */}
                        <View
                          style={[
                            styles.frameSwatch,
                            {
                              backgroundColor: spec.base,
                              borderBottomColor: spec.cut?.ink.color ?? spec.emboss.dark.color,
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.framePillText,
                            active ? styles.framePillTextActive : null,
                          ]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.7}
                        >
                          {t(spec.labelKey)}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </Animated.View>
          </View>

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
    /*
      「相框」行：一块**没有底色**的面板，只靠一道下边线跟胶卷网格分开 ——
      抽屉里第二块底色就是第二处接缝的来源（同 `close` 的取舍）。
    */
    framePanel: {
      paddingBottom: 12,
      marginBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: ink.hairline,
    },
    frameHead: {
      flexDirection: 'row',
      // 预览窗比文字高，`flex-start` 让标题行和窗顶对齐（居中会显得文字在下沉）。
      alignItems: 'flex-start',
      paddingBottom: 8,
    },
    /*
      文字列：`flex: 1` + `minWidth: 0` —— 相框名可能很长（`Polaroid 600`），
      没有 `minWidth: 0` 的话它会顶开右边的预览窗（RN 的 flex 收缩默认不吃内容尺寸）。
    */
    frameHeadText: {
      flex: 1,
      minWidth: 0,
      // 预览窗 72pt 高，文字三行（11 + 12 + 9pt）大约 46pt，靠上摆。
      paddingRight: 10,
      paddingTop: 2,
    },
    frameLabel: {
      color: ink.amberSoft,
      fontSize: 11,
      letterSpacing: 1.6,
      fontFamily: UI_MONO,
    },
    frameName: {
      marginTop: 3,
      color: ink.amber,
      fontSize: 12,
      letterSpacing: 0.6,
      fontFamily: UI_MONO,
    },
    /*
      迷你成片预览窗。**底色写死深色**（不用 `theme`）：它是"暗房观察窗"，
      浅色主题下用浅底会把相纸的白留白和底色糊在一起，看不出窗口在哪。
    */
    framePreviewBox: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 4,
      overflow: 'hidden',
      backgroundColor: FRAME_PREVIEW_BACKDROP,
      // 一道极细的亮边：把"窗"从抽屉底上抠出来，不需要阴影（阴影在深色下看不见）。
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ink.hairline,
    },
    frameHint: {
      color: ink.paperDim,
      fontSize: 9,
      letterSpacing: 0.4,
    },
    framePills: {
      flexDirection: 'row',
      gap: GRID_GAP,
    },
    framePill: {
      flex: 1,
    },
    /*
      材质芯片：上面一块**材质色板**（真实颜色，见渲染处注释）、下面一行名字。
      `overflow: 'hidden'` 是必须的 —— 色板要贴着圆角被裁，否则四个角会露出直角。
    */
    framePillBody: {
      height: 44,
      borderRadius: 8,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ink.hairline,
    },
    // 当前档：琥珀色描边（**不动色板** —— 色板必须是材质本来的颜色）。
    framePillBodyActive: {
      borderColor: withAlpha(ink.amber, 0.85),
    },
    /*
      材质色板。底边那道极细的线由渲染处按材质给（暗色材质给它的金属切边色，
      其余给压痕的暗色）—— 写在样式里的话三档就只能是同一个颜色了。
    */
    frameSwatch: {
      flex: 1,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    framePillText: {
      color: ink.paperDim,
      fontSize: 11,
      letterSpacing: 0.8,
      fontFamily: UI_MONO,
      textAlign: 'center',
      paddingVertical: 3,
    },
    framePillTextActive: {
      color: ink.amberSoft,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: GRID_GAP,
    },
  });
}
