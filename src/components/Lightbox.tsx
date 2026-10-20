/**
 * 全屏看图（lightbox）—— 相册里点开一格之后的那一屏。
 *
 * 从 `GalleryScreen.tsx` 里抽出来的：那块内嵌的大图 + 底部两个按钮越长越像个
 * 独立屏幕，而它需要的东西（手势、缩放、保存、分享）和网格**没有一点重叠**。
 *
 * ── 为什么不用 `src/hooks/usePinchZoom.ts` ────────────────────────────────
 * 那个 hook 是给**相机变焦**写的：量纲是 0~1 的指数刻度，输出的是"增量交给
 * `onChange` 去改相机"，没有平移、没有双击、没有下拖关闭。看图要的是另一套：
 * 1~4 倍的视觉缩放 + 双指平移 + 下拖关闭。硬套那个 hook 只会两边都变形，
 * 所以在**本文件内**自建一个 PanResponder（任务书允许，且禁止新增依赖）。
 * 唯一照抄它的是两条经验：① PanResponder 只建一次，回调里绝不闭包捕获 props，
 * 一律走 ref 每次渲染同步；② 双指必须在**捕获阶段**抢（见下面 START 那段）。
 *
 * ── 为什么要"捏合时那次单击不算关闭" ──────────────────────────────────────
 * 双指捏合结束时，最后一根手指抬起会被 RN 当成一次 tap，用户明明是"放大看看"
 * 却被关掉 —— 这是全屏看图最常见的误关。所以释放时判两件事：
 * `pinchingRef` 是否被这一轮手势置起过，以及累计移动距离是否还在 tap 容差内。
 * 两条都过才认成"点击关闭"。
 *
 * ── 为什么大图下面永远垫着一层缩略图 ──────────────────────────────────────
 * 这一屏以前是"纯黑底 + 一张异步解码的 `<Image>`"：点击到出图之间屏幕上什么都没有，
 * 而那块空窗期里原生正在读盘 + 解码长边 2048 的 JPEG（约 12 MB 位图）——
 * 用户看到的就是"先黑屏约 1 秒，然后大图突然蹦出来"。
 *
 * 垫底那张是同一张照片的缩略图（长边 400，约 0.9 MB）。它**几乎必然已经在缓存里**：
 * 用户是刚从相册的缩略图上点进来的，那张小图刚刚才在屏幕上渲染过。
 * 所以点开的瞬间就能有画面 —— 先是一张对焦不准似的软图，几十到几百毫秒后
 * 上面那层成片解码完盖上来，观感和 iOS 相册"先模糊后清晰"是同一回事。
 *
 * 三个刻意的选择：
 *   · **不做 `onLoad` 切换、不做透明度过渡**。大图是不透明的，它一画出来就盖住垫底那层，
 *     根本不需要谁去"换"；而且 iOS 上 `onLoad` 在缓存命中时可能不触发（`StripView.tsx`
 *     里已经记过这条），拿它当开关等于把"能不能看到图"押在一个会漏的事件上。
 *   · **垫底那层一直挂着**，不在成片出来之后卸掉。它只有约 0.9 MB，而卸早了的代价是
 *     "大图被系统回收 / 解码失败时重新露出黑底"——用一个可能黑屏的风险换 0.9 MB 不划算。
 *   · **`contain` 而不是 `cover`**：垫底和成片必须落在同一个框里，否则成片盖上来时
 *     会看出一次位移或形变。两者的宽高比本来就一样，`contain` 不会变形。
 *
 * ── 诚实记录的未验证项 ───────────────────────────────────────────────────
 * 本文件没过真机/模拟器：双击复位是否和父层 `Pressable` 抢手势、iOS 上
 * `Share.share({ url })` 到底把文件递给哪个 App、下拖过程中 `spring` 回弹的手感、
 * 以及 6pt / 12pt 这两个阈值在真实手指下的边界，都属于"类型对但没实测"。
 * 阈值全部提成上面的常量，就是为了上机之后好调。
 *
 * ── 底栏的两次返工（值得写下来）───────────────────────────────────────────
 * v1.2.0 的底栏是**四个等宽胶囊按钮**（保存 / 分享 / 删除 / 完成）平铺居中。
 * 用户反馈是"重叠挤压"：四个中文两字标签各自要 68pt，加 gap 后在 iPhone SE
 * （320pt 宽）上正好顶到边，而 VoiceOver 开大字时还会溢出。
 *
 * 现在改成**左状态 + 右动作**两段式：
 *   · 左边不是按钮，是一句状态（`gallery.saved`）—— 它原来是个按钮，
 *     但"保存"这个动作对 App 内相册里的照片来说是多余的：这张图**本来就在**
 *     App 的沙盒里，用户要的是"存到系统相册"，而这一步在导入/拍摄流程里
 *     已经做过一次了。留成状态比留成按钮更诚实。
 *   · 右边只有两枚真按钮：分享（带文字）与删除（垃圾桶图标）。
 *     删除用图标而不是文字，是因为它必须一眼从"分享"里分出来，
 *     而"删除"两个字在任何语言里都比图标长。
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  PanResponder,
  Pressable,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeTouchEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { themeFor, UI_MONO } from '../constants/theme';
import type { Theme } from '../constants/theme';
import { useI18n } from '../i18n';
import { describeError } from '../utils/describeError';

/**
 * lightbox 背景：纯黑，比两个面板的 `SCRIM` 还黑。
 * 这里唯一的内容就是一张照片，四周越暗越像在看底片 —— 而照片本身往往是暗调，
 * 用面板那种近黑会让画面和背景糊在一起，看不出照片的边界。
 * 为什么是纯黑、而且**不跟随机身深浅**：这一屏上唯一的内容就是照片本身，
 * 底板越暗越像在看底片；用面板那种近黑（`panel`）会让画面和背景糊在一起。
 * 浅色机身上若把它换成浅底，照片的"底片感"就没了 —— 它是看片台，不是机身。
 * 所以这条常量不进配色表，和同一屏的墨色一样钉死（见组件里 `theme` 那段）。
 */
const BACKDROP = '#000000';

/** 缩放上限。再大只是看像素点，而且平移范围会大到手指够不着边。 */
const MAX_SCALE = 4;

/** 双指间距变化多少算够（小于这个数的抖动直接忽略，否则静止时画面会自己漂）。 */
const PINCH_MOVE_TOLERANCE = 4;

/** 释放时累计位移小于这个数（pt）才算"点击"而不是拖拽。 */
const TAP_TOLERANCE = 12;

/** 下拖超过这个距离（pt）才关闭；太小会把"手滑一下"当成关闭。 */
const DISMISS_DRAG = 96;

/** 双击判定窗口（ms）。 */
const DOUBLE_TAP_MS = 280;

/**
 * 底栏右侧两枚按钮的触控直径（pt）。
 * 44 是 Apple HIG 的最小命中尺寸 —— 用户明确要求"触控区域不小于 44x44pt"。
 * 这里**直接把按钮做成 44pt 的圆**，而不是画小再靠 `hitSlop` 补：
 * `hitSlop` 只扩大触摸判定，不会扩大 VoiceOver 的可聚焦矩形，
 * 读屏用户仍然只能"点到"那个小图标。
 */
const ACTION_SIZE = 44;

/** 两枚按钮之间的间距（pt）。用户点名的 16。 */
const ACTION_GAP = 16;

/** 垃圾桶图标的视觉宽度（pt）。比 44pt 的按钮小一圈，才有"按在圆里"的感觉。 */
const TRASH_WIDTH = 22;

/** 分享按钮的横向内边距（pt）。 */
const SHARE_PADDING = 16;

/** 两指间距。 */
function distanceBetween(a: NativeTouchEvent, b: NativeTouchEvent): number {
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/** 把值夹在 [min, max] 内（避免 `as` 断言和 `!`，写成一个纯函数更好读）。 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 父层要弹的那条提示。文案在父层用 `t()` 拼好，这里只负责说要弹什么。 */
export interface LightboxToast {
  key: string;
  message: string;
}

export interface LightboxProps {
  /** 成片 uri（`shot.uri`，不是缩略图 —— 见 GalleryScreen 文件头 ①）。 */
  uri: string;
  /**
   * 同一张照片的缩略图 uri（`shot.thumbUri`），垫在成片下面顶住解码空窗期。
   * 可选，但**只有传了才不会有"点开先黑一下"**；`thumbUri` 等于 `uri` 时
   * （缩略图生成失败会退化成这样，见 `galleryStore.addShot`）传空串，别垫两层一样的图。
   */
  thumbUri?: string;
  /** 说给人听的序号，从 1 开始（不是数组下标）。 */
  position: number;
  /** 画幅比 = 宽 / 高，用来算 `contain` 之后图片的真实显示尺寸（平移边界要用）。 */
  aspectRatio: number;
  /** 容器可用高度，由父层按屏幕高减掉标题/操作条算好传进来。 */
  availableHeight: number;
  onClose: () => void;
  /** 二次确认由父层统一管（删除是父层在落库）。 */
  onDelete: () => void;
  onToast: (toast: LightboxToast) => void;
}

export function Lightbox({
  uri,
  thumbUri,
  position,
  aspectRatio,
  availableHeight,
  onClose,
  onDelete,
  onToast,
}: LightboxProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensionsSafe();
  const { t } = useI18n();

  /**
   * 灯箱**固定用深色那一套墨**，不跟随机身 —— 这是本次改动里唯一一处刻意不跟随的地方。
   *
   * 为什么：这块底板是 `#000000`（见 `BACKDROP` 的注释），它挡在照片前面，
   * 是"看片台"而不是 App 的外壳。系统切成浅色时如果换成浅色墨，
   * 炭黑 `rgba(28,28,30,0.92)` 压在纯黑底上等于没有字，整条底栏会直接消失。
   * 所以这里用 `themeFor('dark')` 把墨色钉死；底板的黑同理保持原值。
   * 代价是浅机身上这一屏的强调色仍是琥珀而不是朱红 —— 见交付说明里的"没验证/存疑"一节。
   */
  const theme = useMemo(() => themeFor('dark'), []);
  const styles = useMemo(() => createStyles(theme), [theme]);

  /** 缩放值走 state：它会被渲染成 `<Image>` 的 `transform`，变化本来就该重绘。 */
  const [scale, setScale] = useState(1);
  /**
   * 下拖位移走 `Animated.Value`：拖动过程**只 setValue、不 setState**
   * （和 `FrameSwitcher` 同一条经验），否则 60fps 的拖动会带动整棵树重渲染。
   */
  const dragY = useRef(new Animated.Value(0)).current;

  /**
   * 手势回调里只能读 ref，不能读 state/props —— PanResponder 只建一次，
   * 闭包里的 `scale` 会永远停在 1。每次渲染同步一遍。
   */
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const dragYRef = useRef(0);
  const pinchingRef = useRef(false);
  const movedRef = useRef(0);
  const startRef = useRef({ distance: 0, scale: 1 });
  const lastTapRef = useRef(0);

  /** 图片按 `contain` 铺开之后的真实尺寸（平移边界要用）。 */
  const box = useMemo(() => {
    const ratio = aspectRatio > 0 ? aspectRatio : 1;
    const byWidth = width;
    const byHeight = availableHeight;
    return byWidth / ratio <= byHeight
      ? { width: byWidth, height: byWidth / ratio }
      : { width: byHeight * ratio, height: byHeight };
  }, [aspectRatio, availableHeight, width]);

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const panStartOffsetRef = useRef({ x: 0, y: 0 });

  /** 平移边界：只有"图片比容器大"的那一轴才允许拖，否则最多只能在溢出量内移动。 */
  const clampOffset = useCallback(
    (next: { x: number; y: number }): { x: number; y: number } => {
      const roomX = Math.max(0, (box.width * scaleRef.current - width) / 2);
      const roomY = Math.max(0, (box.height * scaleRef.current - availableHeight) / 2);
      return {
        x: clamp(next.x, -roomX, roomX),
        y: clamp(next.y, -roomY, roomY),
      };
    },
    [availableHeight, box.height, box.width, width],
  );

  /** 回到原始大小和位置（关闭前、双击复位时用）。 */
  const resetView = useCallback((): void => {
    dragYRef.current = 0;
    dragY.setValue(0);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [dragY]);

  const handleTap = useCallback((): void => {
    // 捏合结束的那一次抬手不算"点击"（见文件头）
    if (pinchingRef.current) {
      return;
    }
    const now = Date.now();
    const wasDouble = now - lastTapRef.current <= DOUBLE_TAP_MS;
    lastTapRef.current = now;
    // 双击：从放大态回到原始大小。
    // **不做双击放大** —— 放大已经有双指捏合，而"双击一下反而变大了"会让
    // 想退出看图的用户更懵；双击在这里只用来"退回去"。
    if (wasDouble) {
      void Haptics.selectionAsync();
      resetView();
      return;
    }
    /*
     * 单击。**放大态下的第一次单击只复位、不关闭**：
     * 用户放大看完想回到整张，这时把屏幕关掉是最气人的行为 ——
     * 他得重新点开、重新找到那一张。复位之后回到 1 倍，再点一次才关。
     */
    if (scaleRef.current > 1) {
      void Haptics.selectionAsync();
      resetView();
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetView();
    onClose();
  }, [onClose, resetView]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        /**
         * START：**只有双指**在捕获阶段直接接管。
         * 捕获阶段是父 → 子，所以第二根手指落下的瞬间就能从下面那些按钮手里抢走响应权；
         * 否则按住"关闭"的同时捏合会变成按按钮。
         */
        onStartShouldSetPanResponderCapture: (event) =>
          event.nativeEvent.touches.length === 2,
        /**
         * MOVE：单指拖动或双指捏合**都要**接管，所以这里不能再看 touches 数。
         * 用 6pt 的阈值把"点击"和"拖动"分开：小于阈值不接管 → 响应权还在
         * 底下的 `Pressable` 上，关闭按钮照常可点。
         */
        onMoveShouldSetPanResponder: (event, gestureState) => {
          if (event.nativeEvent.touches.length === 2) {
            return true;
          }
          return Math.hypot(gestureState.dx, gestureState.dy) > 6;
        },
        onPanResponderGrant: (event) => {
          const touches = event.nativeEvent.touches;
          pinchingRef.current = touches.length === 2;
          movedRef.current = 0;
          startRef.current = {
            distance: touches.length === 2 ? distanceBetween(touches[0], touches[1]) : 0,
            scale: scaleRef.current,
          };
          panStartOffsetRef.current = offsetRef.current;
        },
        onPanResponderMove: (event, gestureState) => {
          const touches = event.nativeEvent.touches;
          // 双指 → 捏合（缩放）。量纲是"倍数"，所以直接乘比例，和 `usePinchZoom`
          // 的指数刻度不是一回事；间距塌到 0 附近时比例会炸，忽略这一帧。
          if (touches.length === 2) {
            pinchingRef.current = true;
            const start = startRef.current;
            if (start.distance < 1) {
              startRef.current = { distance: distanceBetween(touches[0], touches[1]), scale: scaleRef.current };
              return;
            }
            const distance = distanceBetween(touches[0], touches[1]);
            if (distance < 1) {
              return;
            }
            const next = clamp((start.scale * distance) / start.distance, 1, MAX_SCALE);
            if (Math.abs(next - scaleRef.current) > 0.05) {
              movedRef.current = Math.max(movedRef.current, PINCH_MOVE_TOLERANCE + 1);
              setScale(next);
              if (next === 1) {
                setOffset({ x: 0, y: 0 });
              } else {
                setOffset((current) => clampOffset(current));
              }
            }
            return;
          }
          // 单指：放大态 → 平移画面；原始大小 → 下拖准备关闭。
          movedRef.current = Math.max(movedRef.current, Math.hypot(gestureState.dx, gestureState.dy));
          if (scaleRef.current > 1) {
            const start = panStartOffsetRef.current;
            setOffset(clampOffset({ x: start.x + gestureState.dx, y: start.y + gestureState.dy }));
            return;
          }
          // 只跟手"往下"，往上拖不动：这张图没有上滑手势，跟手会显得滑腻。
          const pull = Math.max(0, gestureState.dy);
          dragYRef.current = pull;
          dragY.setValue(pull);
        },
        onPanResponderRelease: (event, gestureState) => {
          const wasPinching = pinchingRef.current;
          const moved = movedRef.current;
          pinchingRef.current = false;
          movedRef.current = 0;

          // 下拖关闭（只在原始大小、单指时；放大之后下拖是平移）
          if (!wasPinching && scaleRef.current === 1 && dragYRef.current > 0) {
            if (dragYRef.current > DISMISS_DRAG || gestureState.vy > 1.2) {
              resetView();
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onClose();
              return;
            }
            // 没到阈值：弹回去
            Animated.spring(dragY, {
              toValue: 0,
              useNativeDriver: false,
              bounciness: 0,
            }).start(() => {
              dragYRef.current = 0;
            });
            return;
          }

          // 点击关闭：捏合过、或移动超容差，都不算点击
          if (!wasPinching && moved <= TAP_TOLERANCE && event.nativeEvent.touches.length === 0) {
            handleTap();
          }
        },
        onPanResponderTerminate: () => {
          pinchingRef.current = false;
          movedRef.current = 0;
          dragYRef.current = 0;
          dragY.setValue(0);
        },
      }).panHandlers,
    [clampOffset, dragY, handleTap, onClose, resetView],
  );

  /**
   * 分享：用 RN 内置的 `Share` 而不是 `expo-sharing`（后者不在依赖里）。
   * 这是底栏里**唯一**会跳出 App 的动作，所以给一次 Light impact 而不是 selection
   * —— 和"关闭设置页"同级，比切换选项重一档。
   */
  const handleShare = useCallback((): void => {
    void Haptics.selectionAsync();
    void (async (): Promise<void> => {
      try {
        await Share.share({ message: uri, url: uri });
      } catch (error) {
        onToast({
          key: `share-error-${Date.now()}`,
          message: t('gallery.shareFailed', { message: describeError(error) }),
        });
      }
    })();
  }, [onToast, t, uri]);

  /**
   * 删除：二次确认框和网格那一侧同一个理由（删的是用户自己的照片，且不可恢复）。
   *
   * 文案换成 `gallery.delete.title/message/cancel/confirm` 这一套：它们是
   * 专门为"删一张成片"写的，标题是个问句、正文说清了"本地副本也一起删"。
   * 之前复用的是 `gallery.delete`（"删除这张"），那本来是网格长按提示的句子，
   * 当确认框标题时读起来像陈述句，用户按下去之前不知道会发生什么。
   *
   * `onDelete` 只负责落库 —— 这里已经问过一次了，父层**不能再问第二次**。
   */
  const handleDelete = useCallback((): void => {
    void Haptics.selectionAsync();
    Alert.alert(t('gallery.delete.title'), t('gallery.delete.message'), [
      { text: t('gallery.delete.cancel'), style: 'cancel' },
      {
        text: t('gallery.delete.confirm'),
        style: 'destructive',
        onPress: () => {
          resetView();
          onDelete();
        },
      },
    ]);
  }, [onDelete, resetView, t]);

  const handleClose = useCallback((): void => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetView();
    onClose();
  }, [onClose, resetView]);

  return (
    /*
     * 整块纯黑铺满，连系统状态栏那一条也盖住 —— 看图时视线里不该有别的颜色。
     * 手势层和按钮挂在同一层上：按钮是手势层的**兄弟**而且排在后面，
     * 所以它们在自己的范围内先拿到触摸（RN 的响应者系统按 z 序从后往前问）。
     */
    <View
      style={[styles.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      {/* 标题：序号 + 关闭。这一行同时承担"我在看第几张"和"怎么退出" */}
      <View style={styles.header}>
        <Text style={styles.counter} numberOfLines={1}>
          {/* 说给人听的序号，从 1 开始 */}
          {t('gallery.lightbox.a11y', { index: position })}
        </Text>
        <Pressable
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel={t('gallery.close')}
          hitSlop={8}
          style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
        >
          <Text style={styles.closeText} numberOfLines={1}>
            {t('gallery.close')}
          </Text>
        </Pressable>
      </View>

      {/*
        图片区：手势层只覆盖这块，底部按钮永远不被手势吃掉。

        里面是**两层**：先画垫底的缩略图，再把成片盖上去（顺序就是 z 序）。
        理由见文件头"为什么大图下面永远垫着一层缩略图"。
      */}
      <Animated.View
        {...pan}
        style={[styles.stage, { height: availableHeight, transform: [{ translateY: dragY }] }]}
      >
        {/*
          垫底：缩略图铺满整个手势层、内部 `contain`。
          不设 width / height 而是铺满 —— `stage` 有确定尺寸，铺满就等于
          "和成片同一个框"，两者按同样的 contain 规则算出来的画面也必然重合。
          它**不吃触摸**（`pointerEvents` 写在 style 里：`ImageProps` 上没有这个 prop），
          手势得由底下那层 `pan` 接住。
        */}
        {thumbUri !== undefined && thumbUri.length > 0 ? (
          <Image
            source={{ uri: thumbUri }}
            style={styles.thumb}
            resizeMode="contain"
            accessible={false}
          />
        ) : null}
        <Image
          source={{ uri }}
          style={[
            styles.image,
            // 先平移再缩放：`translate` 写在 `scale` 前面，位移量才是屏幕 pt，
            // 反过来写会被 scale 一起放大，放大后拖一格会跑出去半屏。
            { width: box.width, height: box.height, transform: [{ translateX: offset.x }, { translateY: offset.y }, { scale }] },
          ]}
          // 完整看到整张照片，任何裁切都会让用户以为照片拍坏了
          resizeMode="contain"
          // 关掉自己的无障碍节点：上面的序号已经把这个"第 N 张"说清楚了，
          // 不关的话 VoiceOver 会把同一张图当第二个元素再念一遍。
          accessible={false}
        />
      </Animated.View>

      {/*
        底栏 = 左状态 + 右动作（两次返工的结论见文件头）。

        为什么左边是 `Text` 而不是按钮：这张成片**本来就在** App 沙盒里，
        "保存"对 App 内相册是个空动作；用户真正要的是系统相册那一份，
        而那一份在拍摄/导入流程里已经落过盘了。所以这里如实陈述一句
        "已存入相簿"，把右端的位置让给两个真的会改变状态的动作。

        用 `gallery.saved`（`已存到「RETRO CAM」`）而不是 `develop.done.saved`
        （`已存入相册`）：前者带相簿名，用户能据此去系统相册里找到它。
      */}
      <View style={styles.actionBar}>
        <Text style={styles.status} numberOfLines={2} maxFontSizeMultiplier={1.4}>
          {t('gallery.saved', { album: t('album.name') })}
        </Text>

        <View style={styles.actions}>
          <Pressable
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel={t('gallery.share')}
            style={({ pressed }) => [styles.shareAction, pressed && styles.actionPressed]}
          >
            <Text style={styles.shareText} numberOfLines={1} maxFontSizeMultiplier={1.4}>
              {t('gallery.share')}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleDelete}
            accessibilityRole="button"
            // 视觉上只有一个垃圾桶，读屏必须把它念全：`gallery.delete.a11y`
            // 是"删除这张成片"，比直接拿 `gallery.delete`（"删除这张"）更明确。
            accessibilityLabel={t('gallery.delete.a11y')}
            style={({ pressed }) => [styles.iconAction, pressed && styles.actionPressed]}
          >
            <TrashIcon />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * 垃圾桶图标 —— **手画的**，不是 emoji、也不是图片资源。
 *
 * 为什么不用 `🗑`：emoji 的字形由系统字体决定（iOS 上是彩色的 Apple Color Emoji），
 * 在一屏纯黑白琥珀的界面里会突兀，而且它的**宽度随系统版本变**，
 * 44pt 的圆里可能出现"某个 iOS 版本上偏大、边缘被裁"这种只在真机上看得见的问题。
 * 为什么不用图片：`assets/**` 不在本次写入范围内，而且为一个 22pt 的图形加一张位图
 * 不划算（还要配 @2x/@3x）。
 *
 * 全部用 `View` 拼：桶盖（一条横杠 + 一个小提手）+ 桶身（三条竖纹）。
 * 颜色跟深色墨表的 `ink.amberDeep` —— 和取景器上的告警色一致，也和被删掉的那枚
 * "删除"文字按钮同色，用户不会觉得删除键"变淡了"。
 * 这里同样**不跟随机身**：底板永远是纯黑，浅色墨在上面读不出来（见组件里 `theme` 那段）。
 */
function TrashIcon() {
  const theme = useMemo(() => themeFor('dark'), []);
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.trash} accessible={false}>
      {/* 提手：桶盖上方的小凸起 */}
      <View style={styles.trashHandle} />
      {/* 桶盖 */}
      <View style={styles.trashLid} />
      {/* 桶身（上宽下窄做不出来，RN 不支持梯形；用等宽 + 圆角下缘近似） */}
      <View style={styles.trashBody}>
        <View style={styles.trashRib} />
        <View style={styles.trashRib} />
        <View style={styles.trashRib} />
      </View>
    </View>
  );
}

/**
 * 只取窗口宽高。
 *
 * 为什么不直接调 `useWindowDimensions()`：图片是按"容器可用高度"算 contain 尺寸的，
 * 而那个高度由父层传进来（父层才知道标题栏和操作条占了多少）。这里的 `width` 用来
 * 算 contain 后的真实宽度、`height` 只在父层没给可用高度时兜底，两个数一起返回
 * 能让上面的 `useMemo` 依赖表一眼看清。
 */
function useWindowDimensionsSafe(): { width: number; height: number } {
  const { width, height } = useWindowDimensions();
  return { width, height };
}

/**
 * 样式表 = "拿到哪套墨色就用哪套"的函数。
 *
 * 注意这里收的是 `Theme` 而不是四处散落的色值：灯箱永远传深色那一套
 * （见组件里 `theme` 那段说明），所以整张表只有一组实参。
 */
function createStyles(theme: Theme) {
  const { ink, glass } = theme;

  return StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BACKDROP,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  counter: {
    flex: 1,
    color: ink.paperDim,
    fontFamily: UI_MONO,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  close: {
    minWidth: 34,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ink.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closePressed: {
    backgroundColor: glass,
  },
  closeText: {
    color: ink.amberSoft,
    fontFamily: UI_MONO,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    // 图片放大后会溢出手势层，必须裁掉 —— 否则它会盖到底部按钮上（还吃掉触摸）
    overflow: 'hidden',
  },
  image: {
    backgroundColor: 'transparent',
  },
  /**
   * 垫在成片下面的缩略图。铺满整个手势层：
   * 它不参与 `stage` 的居中排版（铺满 = 脱离流），于是成片怎么居中都行，
   * 两层仍然落在同一个框里 —— 这是"成片盖上来时看不出跳动"的前提。
   * `pointerEvents: 'none'` 写在 style 里 —— `ImageProps` 上没有这个 prop。
   */
  thumb: {
    ...StyleSheet.absoluteFill,
    pointerEvents: 'none',
  },
  /**
   * 底栏。`space-between` 把状态推到最左、动作推到最右 ——
   * 两段之间用 `gap` 而不是 `marginLeft: 'auto'`，这样窄屏上状态文字
   * 先被 `flexShrink` 挤窄（换行成两行），而不是把右边的按钮挤出屏幕。
   */
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  status: {
    flexShrink: 1,
    color: ink.paperDim,
    fontFamily: UI_MONO,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.8,
  },
  /** 右侧两枚按钮的容器。间距 16pt 写在这里，不靠父层的 gap。 */
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ACTION_GAP,
  },
  /** 分享：宽 44pt 是命中高度，宽度按文字撑开（各语言的"分享"都是 2~6 个字符）。 */
  shareAction: {
    minWidth: ACTION_SIZE,
    height: ACTION_SIZE,
    paddingHorizontal: SHARE_PADDING,
    borderRadius: ACTION_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ink.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 删除：正圆 44pt。没有 `hitSlop` —— 按钮本身就是 44pt，不需要补。 */
  iconAction: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ink.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPressed: {
    backgroundColor: glass,
  },
  shareText: {
    color: ink.amberSoft,
    fontFamily: UI_MONO,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  /* ── 手画的垃圾桶（见 TrashIcon 的注释） ───────────────────────────── */
  trash: {
    width: TRASH_WIDTH,
    alignItems: 'center',
  },
  trashHandle: {
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: ink.amberDeep,
  },
  trashLid: {
    width: TRASH_WIDTH,
    height: 2,
    borderRadius: 1,
    marginTop: 1,
    backgroundColor: ink.amberDeep,
  },
  trashBody: {
    width: TRASH_WIDTH - 4,
    height: 14,
    marginTop: 2,
    paddingHorizontal: 2,
    paddingTop: 2,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    // 桶身只画左右两道边 + 下缘，中间留空 —— 实心块在深色底上会显成"一坨黑"。
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: ink.amberDeep,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  trashRib: {
    width: 1,
    height: '100%',
    backgroundColor: ink.amberDeep,
  },
  });
}
