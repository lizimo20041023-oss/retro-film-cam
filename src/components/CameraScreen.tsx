/**
 * 取景器主屏。
 *
 * 这一版把"实时取景"和"相框"彻底拆开了：取景阶段画面上只有一条极细的画幅参考线，
 * 相框贴图只在按下快门后的合成阶段（`FilmCompositor`）出现。实时就贴一张拍立得白边，
 * 用户会以为拍出来就是那样 —— 而负片的画幅里根本不可能有白边。
 *
 * 屏幕从上到下四层（全部按安全区避让）：
 *   ① 顶栏      画幅徽标 / 底片计数 / 设置
 *   ② 取景器    相机预览 + 画幅参考线 + 对焦曝光层 + 悬浮胶囊行
 *   ③ 工具行    导入 / 重曝 / 定时 / 闪光灯 / 翻转
 *   ④ 核心区    相册缩略图 / 快门 / 胶卷抽屉入口
 *
 * 触感只有两档：`selectionAsync`（"切换/选中"类）与 `impactAsync(Light)`（机械动作类）。
 * 唯一的例外是物理侧键的 `Heavy` —— 那一下要隔着手机壳也能确认"按下去了"。
 *
 * 性能上有两条硬约束：切焦段**不能**重载 `CameraView`（原生会话重建会闪黑一下），
 * 拖曝光也**不能**让整屏跟着重渲染（所以相册缩略图、工具行、胶囊行各自成组件，
 * 状态尽量往里收，`cameraFocusProps` 这种传给原生的对象用 `useMemo` 稳住形状）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { CameraType, CameraViewProps } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../i18n';
import { useFilmFonts } from '../hooks/useFilmFonts';
import { useFilmStage } from '../hooks/useFilmStage';
import { useLocationStamp } from '../hooks/useLocationStamp';
import { usePhysicalShutter } from '../hooks/usePhysicalShutter';
import { usePinchZoom } from '../hooks/usePinchZoom';
import { useSettings } from '../hooks/useSettings';
import { DEFAULT_FRAME_ID, FRAMES, findFrameIndex, wrapIndex } from '../constants/frames';
import { applyGrainLevel, findGrainLevelIndex, grainLevelAt } from '../constants/grain';
import { ASSUMED_LENS_NATIVE_MM, ZOOM_STOPS, resolveStop, zoomToFactor } from '../constants/lenses';
import { DEFAULT_PRESET_ID, PRESETS, findPresetIndex, resolvePreset } from '../constants/presets';
import { UI_MONO, useTheme } from '../constants/theme';
import { UI_ASSETS } from '../constants/uiAssets';
import { DEFAULT_ZOOM, ZOOM_MAX, toCameraZoom } from '../constants/zoom';
import { describeError } from '../utils/describeError';
import { addShot } from '../utils/galleryStore';
import { computeFrameLayout } from '../utils/geometry';
import { importAndDevelop } from '../utils/importPhoto';
import { processAndSaveFilmPhoto } from '../utils/processFilmPhoto';
import { AlbumThumb } from './AlbumThumb';
import { AspectGuide } from './AspectGuide';
import { DevelopOverlay, computeDevelopStageBox } from './DevelopOverlay';
import { DialButton } from './DialButton';
import { FilmCompositor } from './FilmCompositor';
import { FilmDrawer } from './FilmDrawer';
import { FocusExposure } from './FocusExposure';
import { FrameBadge } from './FrameBadge';
import { FrameSwitcher } from './FrameSwitcher';
import { GalleryScreen } from './GalleryScreen';
import { PermissionNotice } from './PermissionNotice';
import { SettingsScreen } from './SettingsScreen';
import { ShutterButton } from './ShutterButton';
import { ToolRow } from './ToolRow';
import { ViewfinderBar } from './ViewfinderBar';
import type { FocusTarget } from './FocusReticle';
import type { TimerSeconds } from './ToolRow';
import type { ThemeInk } from '../constants/theme';
import type { ZoomStop } from '../constants/lenses';
import type { CapturedPhoto, DevelopStatus, Rect, Size } from '../types';

/** 画幅参考线四周留白：贴着屏幕边看不出画幅比，留一点才像取景框 */
const PREVIEW_PADDING = 10;

/** 取景器中央那枚 24pt 十字（手动对焦唯一的"画面中心"参照） */
const RETICLE = 24;

/** 参考线顶部的格式标签。写的是参照画幅，不是当前焦段 —— 当前焦段在胶囊上 */
const GUIDE_LABEL = '35mm';

/**
 * 切档时画面先被"推"进去多少。幅度必须很小：这是镜头马达的步进，
 * 不是镜头在拉近，缩多了用户会以为画幅变了（参考线不跟着缩就是这个道理）。
 */
const LENS_PUSH_SCALE = 0.965;
const LENS_PUSH_SPEED = 28;
const LENS_PUSH_BOUNCINESS = 7;

/** 重曝第二张压在第一张上的强度：太实会把第一张吃掉，太淡等于没叠 */
const DOUBLE_OVERLAY_OPACITY = 0.5;

/**
 * 开屏默认停在 1×那一档。`ZOOM_STOPS` 的顺序是 0.5× / 1× / 2×，
 * 下标写死是因为它是相机硬件的档位顺序，不是可变列表。
 */
const DEFAULT_STOP_INDEX = 1;

/** 定时档位顺序：关 → 3s → 10s */
const TIMER_STEPS: readonly TimerSeconds[] = [0, 3, 10];

/** 底部核心区左右两侧的拟物尺寸：比快门小一圈，视觉重心才在中间 */
const CORE_THUMB_SIZE = 46;
const CORE_ENTRY_SIZE = 46;

/**
 * `CameraView` 的原生扩展属性。对焦点与曝光补偿都打在原生补丁上，
 * 集中放同一个类型别名里，`cameraFocusProps` 才有稳定、可复用的形状。
 * `exposureBias` 为 `nil` 时原生完全不动测光，所以 EV 归零就不下发这个键。
 */
type FocusPointProp = {
  focusPoint?: { x: number; y: number };
  exposureBias?: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
}

/** 底片计数后缀：后摄 A 卷、前摄 B 卷 */
function filmCounterLetter(facing: CameraType): string {
  return facing === 'back' ? 'A' : 'B';
}

/** 取景器里的静态几何：只有尺寸没有颜色，所以放在模块级也不会被深浅色冻结 */
const chrome = StyleSheet.create({
  guide: { position: 'absolute' as const, overflow: 'hidden' as const },
  guideLine: { position: 'absolute' as const },
  layer: { position: 'absolute' as const },
  reticle: { position: 'absolute' as const, width: RETICLE, height: RETICLE },
  reticleH: { position: 'absolute' as const, left: 0, right: 0, top: RETICLE / 2, height: StyleSheet.hairlineWidth },
  reticleV: { position: 'absolute' as const, top: 0, bottom: 0, left: RETICLE / 2, width: StyleSheet.hairlineWidth },
  reticleDot: {
    position: 'absolute' as const,
    left: (RETICLE - 5) / 2,
    top: (RETICLE - 5) / 2,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

/** 三分构图线：只帮构图，压得越淡越好 */
function GuideGrid({ rect }: { rect: Rect }) {
  const { ink } = useTheme();
  // 浅色主题下虚线反而要比深色更暗才压得住画面，所以颜色交给主题，
  // 整体再乘一个透明度把三分线拉回"几乎看不见"的强度
  const lineColor = ink.paperFaint;
  const hairline = StyleSheet.hairlineWidth;
  return (
    <View
      pointerEvents="none"
      style={[
        chrome.guide,
        { left: rect.left, top: rect.top, width: rect.width, height: rect.height, opacity: 0.6 },
      ]}
    >
      <View style={[chrome.guideLine, { left: rect.width / 3, top: 0, bottom: 0, width: hairline, backgroundColor: lineColor }]} />
      <View style={[chrome.guideLine, { left: (rect.width / 3) * 2, top: 0, bottom: 0, width: hairline, backgroundColor: lineColor }]} />
      <View style={[chrome.guideLine, { top: rect.height / 3, left: 0, right: 0, height: hairline, backgroundColor: lineColor }]} />
      <View style={[chrome.guideLine, { top: (rect.height / 3) * 2, left: 0, right: 0, height: hairline, backgroundColor: lineColor }]} />
    </View>
  );
}

/** 四角括号 + 中央十字：提示"画幅里真正会被拍到的区域" */
function FocusBrackets({ rect }: { rect: Rect }) {
  const { ink } = useTheme();
  const color = ink.paperFaint;
  const hairline = StyleSheet.hairlineWidth;
  // 角标随画幅缩放：小画幅上固定 14pt 会显得像四块补丁
  const inset = Math.max(4, Math.round(rect.width * 0.014));
  const size = Math.max(14, Math.round(Math.min(rect.width, rect.height) * 0.07));
  const box = { position: 'absolute' as const, width: size, height: size };
  return (
    <View
      pointerEvents="none"
      style={[chrome.layer, { left: rect.left, top: rect.top, width: rect.width, height: rect.height }]}
    >
      <View style={[box, { left: inset, top: inset, borderLeftWidth: hairline, borderTopWidth: hairline, borderColor: color }]} />
      <View style={[box, { right: inset, top: inset, borderRightWidth: hairline, borderTopWidth: hairline, borderColor: color }]} />
      <View style={[box, { left: inset, bottom: inset, borderLeftWidth: hairline, borderBottomWidth: hairline, borderColor: color }]} />
      <View style={[box, { right: inset, bottom: inset, borderRightWidth: hairline, borderBottomWidth: hairline, borderColor: color }]} />
      <View style={[chrome.reticle, { left: (rect.width - RETICLE) / 2, top: (rect.height - RETICLE) / 2 }]}>
        <View style={[chrome.reticleH, { backgroundColor: color }]} />
        <View style={[chrome.reticleV, { backgroundColor: color }]} />
        <View style={[chrome.reticleDot, { borderColor: color }]} />
      </View>
    </View>
  );
}

export function CameraScreen() {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const fonts = useFilmFonts();
  const filmStage = useFilmStage();
  const locationStamp = useLocationStamp();
  const { settings } = useSettings();
  const { t, localeId } = useI18n();
  const theme = useTheme();
  const { ink } = theme;
  const styles = useMemo(() => createStyles(theme.ink, theme.scheme), [theme.ink, theme.scheme]);
  const [cameraPermission, requestCameraPermission, getCameraPermission] = useCameraPermissions();

  const [frameIndex, setFrameIndex] = useState(() => findFrameIndex(DEFAULT_FRAME_ID));
  const [presetIndex, setPresetIndex] = useState(() => findPresetIndex(DEFAULT_PRESET_ID));
  const [facing, setFacing] = useState<CameraType>('back');
  const [flashOn, setFlashOn] = useState(false);
  /** 直接就是 `CameraView` 的 zoom 值（0~1 归一化），捏合与档位都往这里写 */
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);
  const [stopIndex, setStopIndex] = useState(DEFAULT_STOP_INDEX);
  const [lenses, setLenses] = useState<readonly string[]>([]);
  const [lens, setLens] = useState<string | undefined>(undefined);
  const [exposureCount, setExposureCount] = useState(0);
  const [focusTarget, setFocusTarget] = useState<FocusTarget>(null);
  const [focusSeen, setFocusSeen] = useState(false);
  const [exposure, setExposure] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState<TimerSeconds>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [doubleExposure, setDoubleExposure] = useState(false);
  const [pendingExposureUri, setPendingExposureUri] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [mountError, setMountError] = useState<string | null>(null);
  const [status, setStatus] = useState<DevelopStatus>({ kind: 'idle' });
  const [saveIssue, setSaveIssue] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewBox, setPreviewBox] = useState<Size>({ width: 0, height: 0 });
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [filmDrawerVisible, setFilmDrawerVisible] = useState(false);
  /** 相册缩略图自己那份列表不会跟着别处变，用这个键催它重读 */
  const [albumKey, setAlbumKey] = useState(0);

  const cameraRef = useRef<ComponentRef<typeof CameraView>>(null);
  /** 同步锁：`setState` 是异步的，连点两下快门会漏进来两次 */
  const shotLockRef = useRef(false);
  const askedCameraRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lensScale = useRef(new Animated.Value(1)).current;

  const frame = FRAMES[frameIndex] ?? FRAMES[0];
  const preset = PRESETS[presetIndex] ?? PRESETS[0];
  const grainLevel = grainLevelAt(findGrainLevelIndex(settings.grainLevel));
  const effectivePreset = useMemo(() => applyGrainLevel(preset, grainLevel.scale), [preset, grainLevel.scale]);
  const resolved = useMemo(() => resolvePreset(effectivePreset), [effectivePreset]);
  const frameName = frame.nameKey !== undefined ? t(frame.nameKey) : frame.name;
  const developing = status.kind === 'developing';
  const cameraGranted = cameraPermission?.granted === true;
  const interactive = !developing && cameraGranted;
  const lensesKnown = lenses.length > 0;
  const stop: ZoomStop = ZOOM_STOPS[stopIndex] ?? ZOOM_STOPS[DEFAULT_STOP_INDEX];
  // 焦段读数按"这颗镜头的原生等效焦距 × 当前变焦倍数"算：JS 读不到真实焦距，
  // 用的是 `ASSUMED_LENS_NATIVE_MM` 里的假定值，捏合变焦时它也跟着连续变
  const focalMm = Math.round(ASSUMED_LENS_NATIVE_MM[stop.lens] * zoomToFactor(zoom));

  /**
   * 对焦点与曝光补偿一起下发给原生。EV 归零时故意省略 `exposureBias` 键：
   * 原生收到 `nil` 就完全不碰测光，同时也少一次无意义的 prop diff。
   */
  const cameraFocusProps = useMemo<CameraViewProps & FocusPointProp>(() => {
    const props: CameraViewProps & FocusPointProp = {};
    if (focusTarget !== null) {
      props.focusPoint = { x: focusTarget.x, y: focusTarget.y };
    }
    if (exposure !== 0) {
      props.exposureBias = exposure;
    }
    return props;
  }, [focusTarget, exposure]);

  const previewLayout = useMemo(
    () =>
      computeFrameLayout(
        frame,
        Math.max(1, (previewBox.width > 1 ? previewBox.width : window.width) - PREVIEW_PADDING * 2),
        Math.max(1, (previewBox.height > 1 ? previewBox.height : window.height * 0.62) - PREVIEW_PADDING * 2),
      ),
    [frame, previewBox.width, previewBox.height, window.width, window.height],
  );

  const frameOffset = useMemo(
    () => ({
      left: Math.max(0, (previewBox.width - previewLayout.width) / 2),
      top: Math.max(0, (previewBox.height - previewLayout.height) / 2),
    }),
    [previewBox.width, previewBox.height, previewLayout.width, previewLayout.height],
  );

  const stageBox = useMemo(
    () => computeDevelopStageBox({ width: window.width, height: window.height }),
    [window.width, window.height],
  );

  /**
   * 三个面板打开时取景器整体隐藏（但**不卸载**）：卸载 `CameraView` 会让 iOS
   * 重建一次采集会话，关掉面板回来时要黑一下，那是比"看不见"更糟的体验。
   */
  const covered = settingsVisible || galleryVisible || filmDrawerVisible;

  /**
   * 相机权限只在"系统还愿意弹窗"的时候自动问一次。被永久拒绝后再调 `request`
   * 也不会弹，反而会盖掉下面那张带"去设置"按钮的提示卡。
   */
  useEffect(() => {
    if (askedCameraRef.current) {
      return;
    }
    if (cameraPermission === null || cameraPermission.granted || !cameraPermission.canAskAgain) {
      return;
    }
    askedCameraRef.current = true;
    void requestCameraPermission();
  }, [cameraPermission, requestCameraPermission]);

  const handlePreviewLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setPreviewBox((current) => (current.width === width && current.height === height ? current : { width, height }));
  }, []);

  const refreshLenses = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera) {
      return;
    }
    try {
      const available = await camera.getAvailableLensesAsync();
      setLenses(available);
    } catch {
      // 拿不到镜头列表不该拦住拍照：档位退化成"只改 zoom，不指定镜头"
      setLenses([]);
    }
  }, []);

  const handleLensesChanged = useCallback(({ lenses: available }: { lenses: string[] }) => {
    setLenses(available);
  }, []);

  const handleCameraReady = useCallback(() => {
    setCameraReady(true);
    setMountError(null);
    void refreshLenses();
  }, [refreshLenses]);

  const handleMountError = useCallback(({ message }: { message: string }) => {
    setMountError(message);
    setCameraReady(false);
  }, []);

  const handleRetryCamera = useCallback(() => {
    setMountError(null);
    // 重挂载而不是重试 API：会失败的通常是整个会话，重建一次比逐个重试可靠
    setCameraKey((current) => current + 1);
  }, []);

  const handleFrameChange = useCallback((next: number) => {
    setFrameIndex(wrapIndex(next));
  }, []);

  const handleBadgeFramePress = useCallback(() => {
    void Haptics.selectionAsync();
    setFrameIndex((current) => wrapIndex(current + 1));
  }, []);

  const handleFlipCamera = useCallback(() => {
    // 翻转是机械动作 → Light。换镜头的同时焦段、对焦点、底片计数都要归位，
    // 否则前摄会继承后摄的档位，拍出来跟读数对不上
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
    setFlashOn(false);
    setZoom(DEFAULT_ZOOM);
    setLens(undefined);
    setLenses([]);
    setFocusTarget(null);
    setExposureCount(0);
    setStopIndex(DEFAULT_STOP_INDEX);
  }, []);

  const handleZoomChange = useCallback((next: number) => {
    // 捏合是连续变焦，档位高亮没有意义，焦段读数直接跟着 zoom 走
    setZoom(toCameraZoom(next));
  }, []);

  // 捏合与档位共用同一个 `zoom`：两条路都只改这一个值，切档时不会把捏合的结果丢掉
  const pinchHandlers = usePinchZoom({
    enabled: interactive,
    zoom,
    maxZoom: ZOOM_MAX,
    onChange: handleZoomChange,
  });

  const applyStop = useCallback(
    (index: number) => {
      const next: ZoomStop | undefined = ZOOM_STOPS[index];
      if (next === undefined) {
        return;
      }
      const resolution = resolveStop(next, { lenses, facing });
      setStopIndex(index);
      setLens(resolution.lens);
      setZoom(resolution.zoom);
      // 推拉只作用在画面容器上：参考线和对焦层跟着缩的话，等于告诉用户"画幅变了"
      lensScale.setValue(LENS_PUSH_SCALE);
      Animated.spring(lensScale, {
        toValue: 1,
        speed: LENS_PUSH_SPEED,
        bounciness: LENS_PUSH_BOUNCINESS,
        useNativeDriver: true,
      }).start();
    },
    [facing, lenses, lensScale],
  );

  const handleCycleFocal = useCallback(() => {
    if (ZOOM_STOPS.length === 0) {
      return;
    }
    void Haptics.selectionAsync();
    // 从当前档往后找第一个"这台机器真的有"的档：前摄没有超广角，
    // 切过去再假装现在是 13mm，不如直接跳过
    for (let step = 1; step <= ZOOM_STOPS.length; step += 1) {
      const index = (stopIndex + step) % ZOOM_STOPS.length;
      const candidate: ZoomStop | undefined = ZOOM_STOPS[index];
      if (candidate === undefined) {
        continue;
      }
      if (!lensesKnown || resolveStop(candidate, { lenses, facing }).available) {
        applyStop(index);
        return;
      }
    }
    applyStop(stopIndex);
  }, [applyStop, facing, lenses, lensesKnown, stopIndex]);

  const handleExposureChange = useCallback((next: number) => {
    setExposure(next);
  }, []);

  const handleFocusIdle = useCallback(() => {
    // 对焦框和滑块由 FocusExposure 自己淡出，淡完才回来清状态，
    // 否则"清除即消失"会把淡出动画一起吃掉
    setFocusTarget(null);
  }, []);

  const handleTapFocus = useCallback(
    (event: GestureResponderEvent) => {
      if (!interactive) {
        return;
      }
      if (previewBox.width <= 1 || previewBox.height <= 1) {
        return;
      }
      const { locationX, locationY } = event.nativeEvent;
      void Haptics.selectionAsync();
      // 手势层铺满整个取景器，坐标就该按取景器算。旧版除以画幅框的尺寸，
      // 于是点画面边角时对焦点会落到别处（原生按可见预览层的比例取点）
      setFocusTarget({
        x: clamp01(locationX / previewBox.width),
        y: clamp01(locationY / previewBox.height),
        at: Date.now(),
      });
      setFocusSeen(true);
    },
    [interactive, previewBox.width, previewBox.height],
  );

  const handleToggleFlash = useCallback(() => {
    if (facing !== 'back') {
      return;
    }
    void Haptics.selectionAsync();
    setFlashOn((current) => !current);
  }, [facing]);

  const handleCycleTimer = useCallback(() => {
    void Haptics.selectionAsync();
    setTimerSeconds((current) => {
      const at = TIMER_STEPS.indexOf(current);
      return TIMER_STEPS[(at + 1) % TIMER_STEPS.length] ?? 0;
    });
  }, []);

  const handleToggleDouble = useCallback(() => {
    void Haptics.selectionAsync();
    setDoubleExposure((current) => !current);
    // 任何一次切换都把没冲的半成品丢掉：留着它，下次开重曝会莫名其妙叠上一张旧照片
    setPendingExposureUri(null);
  }, []);

  const handleOpenSystemSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const handleOpenSettingsScreen = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSettingsVisible(true);
  }, []);

  const handleCloseSettingsScreen = useCallback(() => {
    setSettingsVisible(false);
  }, []);

  const handleOpenGalleryScreen = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGalleryVisible(true);
  }, []);

  const handleCloseGalleryScreen = useCallback(() => {
    setGalleryVisible(false);
    // 相册里可能删过、也可能导入过照片，回来时底部缩略图要重读一次
    setAlbumKey((current) => current + 1);
  }, []);

  const handleOpenFilmDrawer = useCallback(() => {
    if (!interactive) {
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFilmDrawerVisible(true);
  }, [interactive]);

  const handleCloseFilmDrawer = useCallback(() => {
    setFilmDrawerVisible(false);
  }, []);

  const handleFilmDrawerSelect = useCallback((presetId: string) => {
    void Haptics.selectionAsync();
    setPresetIndex(findPresetIndex(presetId));
    setFilmDrawerVisible(false);
  }, []);

  /** 冲印层自己的收尾（只在 done/error 可点），顺手把两条轻提示也清掉 */
  const handleDismiss = useCallback(() => {
    setStatus({ kind: 'idle' });
    setSaveIssue(null);
    setNotice(null);
  }, []);

  const handleDismissBanner = useCallback(() => {
    // 只清提示，不动 `status`：这条横幅可能是在冲印层还开着的时候弹出来的
    setSaveIssue(null);
    setNotice(null);
  }, []);

  /**
   * 拍摄主流程。
   *
   * 重曝（§一.7）在这里分叉：开着重曝时第一次按快门只把照片存进 `pendingExposureUri`，
   * **不冲印**；第二次才把两张一起交给合成器。判据是"按下时手上有没有上一张"，
   * 而不是"这是第几次" —— 中途关掉重曝不该把半成品冲出去。
   */
  const handleShutter = useCallback(async () => {
    const camera = cameraRef.current;
    if (shotLockRef.current) {
      return;
    }
    if (!camera || !cameraReady || developing) {
      return;
    }
    shotLockRef.current = true;

    const overlayUri = doubleExposure ? pendingExposureUri : null;

    try {
      setSaveIssue(null);
      setNotice(null);
      setStatus({ kind: 'developing', stage: 'normalizing' });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // 定位与拍摄并行：等 GPS 定下来再按快门，手机会多举一秒
      const locationPromise = locationStamp.resolveForShot();
      const shot = await camera.takePictureAsync({ quality: 1, exif: false });
      if (!shot || !shot.uri) {
        throw new Error(t('error.noPhoto'));
      }
      const captured: CapturedPhoto = { uri: shot.uri, width: shot.width, height: shot.height };
      const place = await locationPromise;

      if (doubleExposure && overlayUri === null) {
        // 重曝第一张：先留着不冲，等第二张叠上去一起冲
        setPendingExposureUri(captured.uri);
        setStatus({ kind: 'idle' });
        setNotice(t('camera.tool.double.hint'));
        return;
      }

      const result = await processAndSaveFilmPhoto({
        photo: captured,
        frame,
        preset: effectivePreset,
        stage: stageBox,
        host: filmStage.host,
        place,
        locale: localeId,
        watermarkLayout: settings.watermarkLayout,
        placeDetail: settings.placeDetail,
        exposureIndex: exposureCount + 1,
        overlayUri: overlayUri ?? undefined,
        overlayOpacity: overlayUri === null ? undefined : DOUBLE_OVERLAY_OPACITY,
        onStage: (nextStage) => setStatus({ kind: 'developing', stage: nextStage }),
      });

      setStatus({ kind: 'done', uri: result.photo.uri, saved: result.save.ok });
      setExposureCount((current) => current + 1);
      // 重曝是一次性的：叠完就散伙，否则用户会以为后面每张都会叠
      setPendingExposureUri(null);
      setDoubleExposure(false);
      setAlbumKey((current) => current + 1);
      // 存 App 相册故意不 await：失败也不该让已经冲好的照片看起来像失败
      void addShot({
        sourceUri: result.photo.uri,
        width: result.photo.width,
        height: result.photo.height,
        frameId: frame.id,
        presetId: effectivePreset.id,
      }).catch((error: unknown) => {
        console.warn('[retro-film-cam] 存进 App 相册失败：', describeError(error));
      });
      if (!result.save.ok) {
        setSaveIssue(result.save.message);
      }
      if (result.photo.warnings.length > 0) {
        console.warn('[retro-film-cam] 非致命提示：', result.photo.warnings.join(' / '));
      }
    } catch (error) {
      setStatus({ kind: 'error', message: describeError(error) });
    } finally {
      shotLockRef.current = false;
    }
  }, [
    cameraReady,
    developing,
    doubleExposure,
    pendingExposureUri,
    filmStage.host,
    frame,
    effectivePreset,
    stageBox,
    locationStamp.resolveForShot,
    localeId,
    settings.watermarkLayout,
    settings.placeDetail,
    exposureCount,
    t,
  ]);

  const stopCountdown = useCallback(() => {
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  // 组件走了还在跳的定时器会一直抓着相机引用
  useEffect(() => () => stopCountdown(), [stopCountdown]);

  const handleCancelCountdown = useCallback(() => {
    stopCountdown();
    setCountdown(null);
  }, [stopCountdown]);

  /** 真正的倒计时：归零那一下才拍照，中途点快门键/物理键都是取消 */
  const runShutter = useCallback(() => {
    if (countdownRef.current !== null) {
      return;
    }
    if (timerSeconds === 0) {
      void handleShutter();
      return;
    }
    let remaining = timerSeconds;
    setNotice(null);
    setCountdown(remaining);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        stopCountdown();
        setCountdown(null);
        void handleShutter();
        return;
      }
      setCountdown(remaining);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 1000);
  }, [handleShutter, stopCountdown, timerSeconds]);

  const handleShutterPress = useCallback(() => {
    if (countdownRef.current !== null) {
      handleCancelCountdown();
      return;
    }
    runShutter();
  }, [handleCancelCountdown, runShutter]);

  usePhysicalShutter({
    // 倒计时中 `developing` 是 false，物理键照样能按 —— 按下去就是取消
    enabled: cameraGranted && cameraReady && !developing,
    onPress: () => {
      // 唯一的 Heavy 触感。两行都故意不 await：快门响应不能被触感或异步流程拖慢
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      handleShutterPress();
    },
  });

  /**
   * 从系统相册导入并重新冲印（§一.4 的 `＋导入`）。
   *
   * 注意 `setStatus(developing)` 必须发生在调用之前：`FilmCompositor` 得在屏幕上
   * 真实布局过，iOS 的 `renderInContext` 抓不到没上屏的内容。
   */
  const handleImport = useCallback(async () => {
    if (developing) {
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNotice(null);
    setStatus({ kind: 'developing', stage: 'normalizing' });
    const result = await importAndDevelop({
      host: filmStage.host,
      frame,
      preset: effectivePreset,
      stage: stageBox,
      locale: localeId,
      watermarkLayout: settings.watermarkLayout,
      placeDetail: settings.placeDetail,
      grainLevel: settings.grainLevel,
    });
    if (!result.ok) {
      setStatus({ kind: 'idle' });
      if (result.reason === 'cancelled') {
        // 用户自己按掉的选择器不是错误，不该弹提示
        return;
      }
      setNotice(
        result.reason === 'permission-denied'
          ? t('gallery.import.denied')
          : t('gallery.import.failed', { message: result.message ?? t('common.unknownError') }),
      );
      return;
    }
    // 导入的照片不算"曝光"，底片计数不动；但相册里确实多了东西，缩略图要重读
    setAlbumKey((current) => current + 1);
    setStatus({ kind: 'idle' });
    if (result.missingExifDate) {
      setNotice(t('gallery.import.noExif'));
    }
  }, [
    developing,
    effectivePreset,
    filmStage.host,
    frame,
    localeId,
    settings.grainLevel,
    settings.placeDetail,
    settings.watermarkLayout,
    stageBox,
    t,
  ]);

  const handleImportPress = useCallback(() => {
    void handleImport();
  }, [handleImport]);

  const filmCounterText = `[${String(exposureCount).padStart(2, '0')}${filmCounterLetter(facing)}]`;
  const bannerMessage = saveIssue ?? notice;
  const focusHintVisible = !focusSeen && interactive && focusTarget === null;

  let noticeNode: ReactNode = null;
  if (cameraPermission === null) {
    noticeNode = <ActivityIndicator color={ink.amber} />;
  } else if (!cameraPermission.granted) {
    noticeNode = (
      <PermissionNotice
        title={t('perm.camera.title')}
        message={t('perm.camera.message')}
        actionLabel={cameraPermission.canAskAgain ? t('perm.camera.allow') : t('perm.camera.openSettings')}
        onAction={() => {
          if (cameraPermission.canAskAgain) {
            void requestCameraPermission();
          } else {
            handleOpenSystemSettings();
          }
        }}
        secondaryLabel={cameraPermission.canAskAgain ? undefined : t('perm.camera.recheck')}
        onSecondary={
          cameraPermission.canAskAgain
            ? undefined
            : () => {
                void getCameraPermission();
              }
        }
        hint={cameraPermission.canAskAgain ? undefined : t('perm.camera.hint')}
      />
    );
  } else if (mountError !== null) {
    noticeNode = (
      <PermissionNotice
        title={t('perm.mount.title')}
        message={mountError}
        actionLabel={t('perm.mount.retry')}
        onAction={handleRetryCamera}
        hint={t('perm.mount.hint')}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.body }]}>
      {/* 深色主题下才铺皮革底纹：浅色主题要的是一块浅底板，铺深色皮革等于把主题又变回深色 */}
      {theme.scheme === 'dark' ? (
        <View style={styles.fill} pointerEvents="none">
          <Image source={UI_ASSETS.leatherTile} style={styles.backdrop} resizeMode="repeat" fadeDuration={0} />
        </View>
      ) : null}

      {/* ① 顶栏：画幅徽标 + 底片计数 + 设置。闪光灯/翻转/相册都搬去了工具行与核心区 */}
      <View style={[styles.topPanel, { paddingTop: insets.top + 4 }]}>
        <View style={[styles.panelPlate, { backgroundColor: theme.panel }]} pointerEvents="none" />
        <FrameBadge
          code={frame.code}
          name={frameName}
          index={frameIndex}
          count={FRAMES.length}
          disabled={!interactive}
          onPress={handleBadgeFramePress}
        />
        <View style={styles.topActions}>
          <Text style={[styles.filmCounter, { color: ink.amber }]} allowFontScaling={false}>
            {filmCounterText}
          </Text>
          <DialButton
            icon={UI_ASSETS.iconSettings}
            active={settingsVisible}
            onPress={handleOpenSettingsScreen}
            accessibilityLabel={t('camera.settings.a11y')}
            size={38}
          />
        </View>
      </View>

      {/* ② 取景器 */}
      <View
        style={[styles.preview, covered ? styles.previewCovered : null]}
        pointerEvents={covered ? 'none' : 'auto'}
        onLayout={handlePreviewLayout}
        {...pinchHandlers}
      >
        {cameraGranted ? (
          // 只给画面容器做推拉，`CameraView` 本身不动：`key` 恒定，
          // 切焦段/换预设都只是改 props，原生会话不会重建
          <Animated.View style={[styles.fill, { transform: [{ scale: lensScale }] }]}>
            <CameraView
              key={cameraKey}
              ref={cameraRef}
              style={styles.fill}
              facing={facing}
              mode="picture"
              {...cameraFocusProps}
              flash={flashOn && facing === 'back' ? 'on' : 'off'}
              selectedLens={lens}
              onAvailableLensesChanged={handleLensesChanged}
              zoom={zoom}
              animateShutter
              onCameraReady={handleCameraReady}
              onMountError={handleMountError}
            />
          </Animated.View>
        ) : null}

        {previewBox.width > 1 && previewBox.height > 1 ? (
          <FrameSwitcher
            index={frameIndex}
            count={FRAMES.length}
            onChange={handleFrameChange}
            enabled={interactive}
          >
            <View
              style={[
                styles.canvas,
                {
                  left: frameOffset.left,
                  top: frameOffset.top,
                  width: previewLayout.width,
                  height: previewLayout.height,
                },
              ]}
            >
              {resolved.showGuide ? <GuideGrid rect={previewLayout.window} /> : null}
              {/* 画幅参考线：只有这一条 1px 白线，相框贴图留到合成阶段 */}
              <AspectGuide window={previewLayout.window} label={GUIDE_LABEL} />
              <FocusBrackets rect={previewLayout.window} />
            </View>
            {interactive ? (
              <Pressable
                style={styles.focusCatcher}
                onPress={handleTapFocus}
                accessibilityRole="button"
                accessibilityLabel={t('camera.focus.a11y')}
              />
            ) : null}
          </FrameSwitcher>
        ) : null}

        {/* 坐标按整个取景器归一化，跟 Tap 手势层对齐 */}
        <FocusExposure
          target={focusTarget}
          width={Math.max(previewBox.width, 1)}
          height={Math.max(previewBox.height, 1)}
          exposure={exposure}
          onExposure={handleExposureChange}
          onIdle={handleFocusIdle}
        />

        {focusHintVisible ? (
          <View style={styles.focusHint} pointerEvents="none">
            <View style={styles.focusHintChip}>
              <Text style={[styles.focusHintText, { color: ink.paper }]} allowFontScaling={false}>
                {t('camera.focus.hint')}
              </Text>
            </View>
          </View>
        ) : null}

        {/* 倒计时：画面里只有数字，读屏才念"3 秒后拍摄" */}
        {countdown !== null ? (
          <View
            style={styles.countdownLayer}
            pointerEvents="none"
            accessible
            accessibilityLabel={t('camera.timer.counting', { seconds: countdown })}
          >
            <Text style={[styles.countdownDigit, { color: ink.paper }]} allowFontScaling={false}>
              {String(countdown)}
            </Text>
          </View>
        ) : null}

        {/* 重曝两下之间的轻提示（不走 DevelopOverlay：那层会挡住取景器） */}
        {pendingExposureUri !== null ? (
          <View style={styles.doubleHint} pointerEvents="none">
            <View style={styles.focusHintChip}>
              <Text style={[styles.doubleHintText, { color: ink.amber }]} allowFontScaling={false}>
                {t('camera.tool.double.hint')}
              </Text>
            </View>
          </View>
        ) : null}

        {bannerMessage !== null ? (
          <View style={[styles.banner, { backgroundColor: theme.panel, borderColor: ink.amberDeep }]}>
            <Text style={[styles.bannerText, { color: ink.paper }]}>{bannerMessage}</Text>
            <View style={styles.bannerActions}>
              {saveIssue !== null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('banner.openSettings')}
                  onPress={handleOpenSystemSettings}
                  hitSlop={8}
                >
                  <Text style={[styles.bannerAction, { color: ink.amber }]}>{t('banner.openSettings')}</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('banner.dismiss')}
                onPress={handleDismissBanner}
                hitSlop={8}
              >
                <Text style={[styles.bannerAction, { color: ink.amber }]}>{t('banner.dismiss')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* 悬浮胶囊行贴着取景器底边；容器不吃触摸，只有胶囊本身吃 */}
        <View style={styles.barLayer} pointerEvents="box-none">
          <ViewfinderBar
            temperature={resolved.color.temperature}
            focalMm={focalMm}
            exposure={exposure}
            onPickFilm={handleOpenFilmDrawer}
            onCycleFocal={handleCycleFocal}
            onExposure={handleExposureChange}
          />
        </View>
      </View>

      {/* ③ + ④ 控制台：工具行 + 核心区。齿轮/开关类的改动只脏这一块 */}
      <View style={[styles.console, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={[styles.panelPlate, { backgroundColor: theme.panel }]} pointerEvents="none" />
        <ToolRow
          doubleExposure={doubleExposure}
          timerSeconds={timerSeconds}
          flashOn={flashOn}
          flashDisabled={facing !== 'back'}
          busy={developing}
          onImport={handleImportPress}
          onToggleDouble={handleToggleDouble}
          onCycleTimer={handleCycleTimer}
          onToggleFlash={handleToggleFlash}
          onFlip={handleFlipCamera}
        />
        <View style={styles.coreRow}>
          <View style={styles.coreSide}>
            <AlbumThumb refreshKey={albumKey} size={CORE_THUMB_SIZE} onPress={handleOpenGalleryScreen} />
          </View>
          {/* 倒计时期间不传 busy：ShutterButton 内部是 `disabled || busy`，
              传了它按钮就点不动了，"再点一次取消"这条规则会失效 */}
          <ShutterButton
            onPress={handleShutterPress}
            busy={developing}
            disabled={!cameraReady || !cameraGranted}
          />
          <View style={[styles.coreSide, styles.coreSideRight]}>
            <DialButton
              icon={UI_ASSETS.iconFilm}
              onPress={handleOpenFilmDrawer}
              disabled={!interactive}
              accessibilityLabel={t('camera.preset.a11y', { name: preset.name })}
              size={CORE_ENTRY_SIZE}
            />
            <Text
              style={[styles.filmName, { color: ink.paperDim }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              allowFontScaling={false}
            >
              {preset.name}
            </Text>
          </View>
        </View>
      </View>

      <DevelopOverlay status={status} onDismiss={handleDismiss}>
        {filmStage.stage !== null ? (
          <FilmCompositor
            stage={filmStage.stage}
            viewShotRef={filmStage.viewShotRef}
            onLayout={filmStage.handleStageLayout}
            onImageLoad={filmStage.handleStageImageLoad}
            timestampFontFamily={fonts.fontFamily}
          />
        ) : null}
      </DevelopOverlay>

      <FilmDrawer
        visible={filmDrawerVisible}
        presetIndex={presetIndex}
        onSelect={handleFilmDrawerSelect}
        onClose={handleCloseFilmDrawer}
      />

      {noticeNode !== null ? <View style={styles.noticeLayer}>{noticeNode}</View> : null}

      <GalleryScreen visible={galleryVisible} onClose={handleCloseGalleryScreen} />
      <SettingsScreen
        visible={settingsVisible}
        onClose={handleCloseSettingsScreen}
        locationState={locationStamp.state}
      />
    </View>
  );
}

/**
 * 样式工厂：几何写死在这里，颜色全部由主题注入。
 * 模块级的 `StyleSheet.create` 会把深浅色冻结在加载那一刻，所以必须按主题重建。
 */
function createStyles(ink: ThemeInk, scheme: 'dark' | 'light') {
  const fill = { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 };
  const hairline = StyleSheet.hairlineWidth;
  return StyleSheet.create({
    root: { flex: 1 },
    fill,
    backdrop: { ...fill, opacity: 0.95 },
    topPanel: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingBottom: 9,
      borderBottomWidth: hairline,
      borderBottomColor: ink.hairline,
      overflow: 'hidden',
    },
    // 半透明衬板：让下面的皮革底纹还能透出一点，纯色面板会把机身质感整片盖掉
    panelPlate: { ...fill, opacity: 0.88 },
    topActions: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
    filmCounter: {
      minWidth: 42,
      marginRight: 10,
      textAlign: 'right',
      fontFamily: UI_MONO,
      fontSize: 10,
      letterSpacing: 0.8,
    },
    preview: { flex: 1, overflow: 'hidden', backgroundColor: '#0A0A0B' },
    previewCovered: { opacity: 0 },
    canvas: { position: 'absolute' },
    focusCatcher: { ...fill },
    focusHint: { position: 'absolute', left: 0, right: 0, bottom: 68, alignItems: 'center' },
    focusHintChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.42)',
    },
    focusHintText: { fontFamily: UI_MONO, fontSize: 11, letterSpacing: 1.2 },
    countdownLayer: { ...fill, alignItems: 'center', justifyContent: 'center' },
    countdownDigit: {
      fontFamily: UI_MONO,
      fontSize: 96,
      letterSpacing: 2,
      textShadowColor: 'rgba(0,0,0,0.6)',
      textShadowRadius: 14,
      textShadowOffset: { width: 0, height: 2 },
    },
    doubleHint: { position: 'absolute', left: 0, right: 0, top: 26, alignItems: 'center' },
    doubleHintText: { fontFamily: UI_MONO, fontSize: 10, letterSpacing: 0.8 },
    // 横幅抬到胶囊行上方：压住胶囊的话，出问题时连焦段都点不了
    banner: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 56,
      padding: 12,
      borderRadius: 4,
      borderWidth: hairline,
    },
    bannerText: { fontSize: 13, lineHeight: 19 },
    bannerActions: { flexDirection: 'row', marginTop: 10 },
    bannerAction: { fontSize: 14, fontWeight: '700', marginRight: 18 },
    barLayer: { position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center' },
    console: {
      paddingTop: 8,
      borderTopWidth: hairline,
      borderTopColor: ink.hairline,
      overflow: 'hidden',
    },
    coreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      marginTop: 6,
    },
    coreSide: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
    coreSideRight: { justifyContent: 'flex-end' },
    filmName: { marginLeft: 8, maxWidth: 74, fontFamily: UI_MONO, fontSize: 9, letterSpacing: 0.6 },
    noticeLayer: {
      ...fill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: scheme === 'dark' ? 'rgba(0,0,0,0.72)' : 'rgba(236,236,232,0.86)',
    },
  });
}
