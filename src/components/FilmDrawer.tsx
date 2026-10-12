/**
 * 胶卷库抽屉：长按底部的胶片名 400ms 打开，占据整个屏幕。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么用全屏自绘覆盖层，而不是 RN 的 `Modal`
 * ─────────────────────────────────────────────────────────────────────
 * 1. `Modal` 在 New Architecture 下会新开一个原生窗口层。这台相机是**设备级**
 *    的（`zoom` / `selectedLens` 都写在 `AVCaptureDevice` 上，见 `zoom.ts` 文件头），
 *    多开一层窗口在部分机型上会让预览短暂黑屏再恢复 —— 换胶卷不该有这种副作用。
 * 2. `Modal` 的 `pageSheet` / `formSheet` 在 iOS 上**默认带圆角和半透明背景**，
 *    而这里要求"相机预览绝对不能透出来"（面板必须完全不透明），用自绘层最直接。
 * 3. 项目里已经有两个同样形态的覆盖层（`SettingsScreen` / `GalleryScreen`）都是用
 *    `...StyleSheet.absoluteFill` 自绘的，保持同一套结构，后来人不用学两种写法。
 *
 * 代价是 **Android 的物理返回键要自己接**（`Modal` 的 `onRequestClose` 白送了），
 * 见下面那段 `BackHandler` 的 effect。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么背景是两个纯色层叠起来
 * ─────────────────────────────────────────────────────────────────────
 * 外层是 `#0A0A0B` 的**实心**底（`styles.root`）—— 这就是"预览不会透出来"的保证；
 * 内层再叠一张半透明的皮纹，是为了和整个 App 的材质一致，而不是为了透光。
 * 改这里时**不要**把外层改成 `rgba(...,0.9x)`：那是"半透明遮罩"，不是面板。
 */
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
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
import { INK, UI_MONO } from '../constants/theme';
import { UI_ASSETS } from '../constants/uiAssets';
import { useI18n } from '../i18n';
import { FilmCard } from './FilmCard';

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
/** 打开动画时长。够短，不挡手；够长，能看出是"面板推上来"而不是闪一下。 */
const REVEAL_MS = 180;

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
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // 0 → 1 的打开进度，同时驱动遮罩透明度和面板位移。
  const reveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      // 关掉时直接归零，不做退场动画：面板已经不在树上了，
      // 留着动画只会让下一次打开从"半开"开始。
      reveal.setValue(0);
      return;
    }
    Animated.timing(reveal, {
      toValue: 1,
      duration: REVEAL_MS,
      useNativeDriver: true,
    }).start();
  }, [visible, reveal]);

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

  if (!visible) {
    // 和 `SettingsScreen` / `GalleryScreen` 一致：不可见时不占渲染成本。
    return null;
  }

  const translateY = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 0],
  });

  return (
    <Animated.View
      style={[styles.root, { opacity: reveal }]}
      // 读屏软件在 Android 上应该只读这张面板，不要读后面的取景器。
      accessibilityViewIsModal
      /*
        关闭路径一共三条：右上角"完成"、Android 返回键、读屏的双指双击。
        **没有"点遮罩关闭"** —— 这一层是整屏的实心面板，不存在露在外面的遮罩区
        （用户的原话是"面板底色必须完全不透明，取景器不能透出来"，整屏实心是
        满足它的最强形态）。想改成底部抽屉形态的话，得先让取景器在面板上方
        露出来，那和上面那条要求是冲突的。
      */
      onAccessibilityTap={onClose}
    >
      {/* 实心底：预览在这一层之下，完全不透。 */}
      <Image
        source={UI_ASSETS.leatherTile}
        style={styles.backdrop}
        resizeMode="repeat"
        fadeDuration={0}
      />
      <View style={styles.veil} pointerEvents="none" />
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <View style={[styles.plate, { paddingTop: insets.top + 14 }]}>
          <View style={styles.plateTitles}>
            <Text style={styles.title}>{t('film.drawer.title')}</Text>
            <Text style={styles.hint} numberOfLines={1}>
              {t('film.drawer.hint')}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('film.drawer.close')}
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [styles.done, pressed ? styles.pressed : null]}
          >
            <Text style={styles.doneText}>{t('film.drawer.close')}</Text>
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

const styles = StyleSheet.create({
  root: {
    // 注意：RN 0.86 已移除 StyleSheet.absoluteFillObject，只能用 absoluteFill
    ...StyleSheet.absoluteFill,
    // 实心底色 —— 这条是"预览不透出来"的第一道保证。
    backgroundColor: '#0A0A0B',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    opacity: 0.9,
  },
  veil: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(8, 8, 7, 0.55)',
  },
  sheet: {
    flex: 1,
  },
  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GRID_PADDING,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(210, 139, 42, 0.28)',
  },
  plateTitles: {
    flexShrink: 1,
    paddingRight: 12,
  },
  title: {
    color: INK.amberSoft,
    fontSize: 13,
    letterSpacing: 2.4,
    fontFamily: UI_MONO,
  },
  hint: {
    marginTop: 3,
    color: INK.paperDim,
    fontSize: 9,
    letterSpacing: 0.4,
  },
  done: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(210, 139, 42, 0.55)',
    borderRadius: 3,
    backgroundColor: 'rgba(210, 139, 42, 0.10)',
  },
  doneText: {
    color: INK.amberSoft,
    fontSize: 11,
    letterSpacing: 1,
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
    paddingBottom: 40,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
});
