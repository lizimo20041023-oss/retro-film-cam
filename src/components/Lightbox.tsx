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
 * ── 诚实记录的未验证项 ───────────────────────────────────────────────────
 * 本文件没过真机/模拟器：双击复位是否和父层 `Pressable` 抢手势、iOS 上
 * `Share.share({ url })` 到底把文件递给哪个 App、下拖过程中 `spring` 回弹的手感、
 * 以及 6pt / 12pt 这两个阈值在真实手指下的边界，都属于"类型对但没实测"。
 * 阈值全部提成上面的常量，就是为了上机之后好调。
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
import { INK, UI_MONO } from '../constants/theme';
import { useI18n } from '../i18n';
import { saveToLibraryDetailed } from '../utils/saveToLibrary';
import { describeError } from '../utils/describeError';

/**
 * lightbox 背景：纯黑，比两个面板的 `SCRIM` 还黑。
 * 这里唯一的内容就是一张照片，四周越暗越像在看底片 —— 而照片本身往往是暗调，
 * 用面板那种近黑会让画面和背景糊在一起，看不出照片的边界。
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
            setOffset((current) => clampOffset({ x: current.x + gestureState.dx, y: current.y + gestureState.dy }));
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

  /** 保存到系统相簿（RETRO CAM）。失败/退到相机胶卷都如实说。 */
  const handleSave = useCallback((): void => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void (async (): Promise<void> => {
      const save = await saveToLibraryDetailed(uri);
      if (!save.ok) {
        onToast({ key: `save-error-${Date.now()}`, message: save.message });
        return;
      }
      if (save.destination === 'album') {
        onToast({
          key: `save-album-${Date.now()}`,
          message: t('gallery.saved', { album: save.album }),
        });
        return;
      }
      // 退到相机胶卷：这句文案是相机屏也在用的那句，不另造一句
      onToast({ key: `save-roll-${Date.now()}`, message: t('develop.done.saved') });
    })();
  }, [onToast, t, uri]);

  /**
   * 分享。用 RN 内置的 `Share` 而不是 `expo-sharing` —— 后者**不在依赖里**，
   * 而任务明令不许加依赖。代价要如实说明：Android 的 `Share` 只认 `message`，
   * `url` 在那边会被忽略，所以安卓上分享出去的是一条带句子但没有图片文件的文本。
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

  /** 删除：二次确认框和网格那一侧同一个理由（删的是用户自己的照片，且不可恢复）。 */
  const handleDelete = useCallback((): void => {
    void Haptics.selectionAsync();
    Alert.alert(t('gallery.delete'), undefined, [
      { text: t('gallery.cancel'), style: 'cancel' },
      {
        text: t('gallery.delete'),
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

      {/* 图片区：手势层只覆盖这块，底部按钮永远不被手势吃掉 */}
      <Animated.View
        {...pan}
        style={[styles.stage, { height: availableHeight, transform: [{ translateY: dragY }] }]}
      >
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

      {/* 操作条：四个都是真按钮，不靠手势 —— 手势是给"看图"用的，操作要有明确靶子 */}
      <View style={styles.actionBar}>
        {/* 保存键沿用相机屏显影完成那句"已存入相册"：同一件事在整个 App 里
            只该有一种说法，而 i18n 里没有单独的 `gallery.save`。 */}
        <ActionButton
          label={t('develop.done.saved')}
          a11yLabel={t('develop.done.saved')}
          onPress={handleSave}
        />

        <ActionButton label={t('gallery.share')} a11yLabel={t('gallery.share')} onPress={handleShare} />
        <ActionButton
          label={t('gallery.delete')}
          a11yLabel={t('gallery.delete')}
          onPress={handleDelete}
          danger
        />
        <ActionButton label={t('gallery.close')} a11yLabel={t('gallery.close')} onPress={handleClose} />
      </View>
    </View>
  );
}

/** 底部那排胶囊按钮。抽出来是因为四个的样式/无障碍结构完全一样，只有文案和颜色不同。 */
function ActionButton({
  label,
  a11yLabel,
  onPress,
  danger,
}: {
  label: string;
  a11yLabel: string;
  onPress: () => void;
  /** 删除这类不可逆操作用暗琥珀，和取景器上的告警色一致。 */
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      hitSlop={6}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
    >
      <Text style={[styles.actionText, danger === true && styles.actionDanger]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
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

const styles = StyleSheet.create({
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
    color: INK.paperDim,
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
    borderColor: INK.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closePressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  closeText: {
    color: INK.amberSoft,
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
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    paddingHorizontal: 12,
  },
  action: {
    minWidth: 68,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: INK.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  actionText: {
    color: INK.amberSoft,
    fontFamily: UI_MONO,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  actionDanger: {
    color: INK.amberDeep,
  },
});
