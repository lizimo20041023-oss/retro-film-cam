/**
 * 主相机屏幕 —— 单屏完成"取景 → 拍摄 → 显影 → 存相册"。
 *
 * ── 视觉结构（自上而下五段，取景器不再被任何浮层遮挡） ────────────────────────
 *   ① 顶部操作栏 TopPanel   极窄一条，位于灵动岛下方、取景器**之上**：
 *                           左侧是**画幅徽章**（等比例小方框 + 画幅名，点一下换下一张），
 *                           右侧是**胶片计数徽章**（`[01A]`，数本卷拍了几张）
 *                           加四枚 44pt 机械拨轮（补光 / 反转 / 设置 / 相册）。
 *                           这里**不出现任何句子** —— 文字标签一律删除，
 *                           拨轮只留图标（刻字说明的活交给无障碍标签）。
 *   ② 取景器 Viewfinder     flex:1，只有三样东西（严格遵守"不做实时 GLSL"的约束）：
 *                           `CameraView` 原始实时画面 + 半透明引导 UI + 相框 PNG 遮罩。
 *   ③ 变焦档位 Bar          `0.5×` / `1×` / `2×` 三个等宽机械档位，居中。
 *   ④ 底部主控 FilmLine     一行"胶片名"（两侧 ◀ ▶ 只是**装饰性提示**）——
 *                           轻触换下一卷（带淡入淡出），长按 400ms 开胶卷库。
 *                           中间是快门；右侧是倍率读数。
 *   ⑤ 状态条 StatusPanel    超低对比度方框 + 琥珀色等宽字，显示当前显影参数。
 *
 * 底纹：整机背景是一张 160×160 的暗色皮革 tile（`assets/ui/leather-tile.png`，
 * `resizeMode="repeat"`），亮度只有 ±2/255 —— 远看是 #171716 的纯色，近看才有质感。
 *
 * ── 调色/合成 ────────────────────────────────────────────────────────────────
 * 调色/颗粒/暗角/日期/相框这些"重活"全部发生在按快门之后：
 *   takePictureAsync → processFilmPhoto（合成视图 + captureRef）→ Asset.create 存相册。
 * 合成视图渲染在 `DevelopOverlay` 的暖黑幕布上（必须真的上屏，iOS 才截得到），
 * 而这层幕布本身在 ViewShot 之外，不会被截进成片。
 * ⚠️ 因此上面 ①③④⑤ 里的任何东西都**不会**出现在成片里 —— 成片只有：
 *    画面 + 调色图层 + 相框 PNG + 日期。想改成片请改 `FilmCompositor`。
 *
 * ── 手势分工 ────────────────────────────────────────────────────────────────
 *   · 取景器区域 → 单击对焦 / 双指捏合变焦 / 左右滑动换相框（`FrameSwitcher`）；
 *   · 顶部左侧徽章 → 换下一张画幅；
 *   · 顶部右侧拨轮 → 补光 / 反转 / 设置 / 相册；
 *   · 变焦档位 → 点一下切到那一档；
 *   · 底部胶片名 → 轻触循环下一卷，长按 400ms 开胶卷库。
 *
 * ── 震动分工（只有两档力度，别再加） ────────────────────────────────────────
 *   `selectionAsync()`  切换类：档位 / 画幅 / 胶卷 / 颗粒 / 补光 / 对焦 / 开面板
 *   `impactAsync(Light)` 机械动作类：快门、拨轮（反转、开设置、开相册）
 *   为什么不再用 `Medium`：这台机器的所有按键都是"轻档"手感的机械拨轮，
 *   Medium 在 iPhone 上听起来像系统警告，和这台相机的音色不是一回事。
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
import { DEFAULT_FRAME_ID, FRAMES, findFrameIndex, wrapIndex } from '../constants/frames';
import { applyGrainLevel, findGrainLevelIndex, grainLevelAt } from '../constants/grain';
import {
  DEFAULT_PRESET_ID,
  PRESETS,
  findPresetIndex,
  resolvePreset,
  wrapPresetIndex,
} from '../constants/presets';
import { ZOOM_STOPS, isDigitalStop, resolveStop, zoomToFactor } from '../constants/lenses';
import { INK, UI_MONO, compact } from '../constants/theme';
import { UI_ASSETS } from '../constants/uiAssets';
import { DEFAULT_ZOOM, ZOOM_MAX, toCameraZoom } from '../constants/zoom';
import { useI18n } from '../i18n';
import { useFilmFonts } from '../hooks/useFilmFonts';
import { useFilmStage } from '../hooks/useFilmStage';
import { useLocationStamp } from '../hooks/useLocationStamp';
import { usePhysicalShutter } from '../hooks/usePhysicalShutter';
import { usePinchZoom } from '../hooks/usePinchZoom';
import { useSettings } from '../hooks/useSettings';
import type { CapturedPhoto, DevelopStatus, Rect, Size } from '../types';
import { describeError } from '../utils/describeError';
import { addShot } from '../utils/galleryStore';
import { computeFrameLayout } from '../utils/geometry';
import { LOCATION_FAILURE_COPY } from '../utils/locationStamp';
import { processAndSaveFilmPhoto } from '../utils/processFilmPhoto';
import { DevelopOverlay, computeDevelopStageBox } from './DevelopOverlay';
import { DialButton } from './DialButton';
import { FilmCompositor } from './FilmCompositor';
import { FilmDrawer } from './FilmDrawer';
import { FocusReticle } from './FocusReticle';
import type { FocusTarget } from './FocusReticle';
import { FrameBadge } from './FrameBadge';
import { FrameOverlay } from './FrameOverlay';
import { FrameSwitcher } from './FrameSwitcher';
import { GalleryScreen } from './GalleryScreen';
import { PermissionNotice } from './PermissionNotice';
import { SettingsScreen } from './SettingsScreen';
import { ShutterButton } from './ShutterButton';
import { ZoomStops } from './ZoomStops';
import type { ZoomStopView } from './ZoomStops';

/** 取景器里相框四周留白。 */
const PREVIEW_PADDING = 10;

/** 长按胶卷名打开胶卷库的时长（ms）。用户点名要 400ms。 */
const FILM_LONG_PRESS_MS = 400;

/** 换一卷胶卷时的淡入时长（ms）。短到"换了"，长到"看得出是换了"。 */
const FILM_FADE_MS = 160;

/** 长按胶卷名时的"顶一下"位移（pt）：位移量刻意很小，是提示不是动画表演。 */
const FILM_NUDGE = 7;

/**
 * expo-camera 57.0.6 的 `CameraViewProps` 里**没有** `focusPoint` —— 它是
 * `patches/expo-camera+57.0.6.patch` 往 iOS 原生加的 prop。
 *
 * 之所以不用改库的 JS/TS 就能用：`node_modules/expo-camera/build/utils/props.js`
 * 的 `convertNativeProps()` 是 `Object.entries(props)` **全量透传**，只对
 * `type` / `flash` 两张表做转换，不做白名单过滤。运行期直接传就行，
 * 只有类型上缺一块 —— 用一次交叉类型补上，全项目仅此一处。
 */
type FocusPointProp = { focusPoint?: { x: number; y: number } };

/** 夹到 0~1。 */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

/**
 * 胶片计数徽章上的"齿孔字母"。
 *
 * 为什么要有这个字母：真胶片边缘的编号是 `26A` / `27` 这种带字母的（字母是
 * 厂家在片边上印的批号段），只写数字反而像页码。这里用**前后摄**去决定字母 ——
 * 它每翻一次镜头就变，正好给"当前是哪一支镜头"一个余光可见的提示；
 * 而计数本身按用户要求**换镜头就归零**（新的卷、新的计数）。
 */
function filmCounterLetter(facing: CameraType): string {
  return facing === 'back' ? 'A' : 'B';
}

export function CameraScreen() {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const fonts = useFilmFonts();
  const filmStage = useFilmStage();
  const locationStamp = useLocationStamp();
  const { settings } = useSettings();
  const { t, localeId } = useI18n();
  const [cameraPermission, requestCameraPermission, getCameraPermission] = useCameraPermissions();

  /* ---------------- 状态 ---------------- */
  const [frameIndex, setFrameIndex] = useState<number>(() => findFrameIndex(DEFAULT_FRAME_ID));
  const [presetIndex, setPresetIndex] = useState<number>(() => findPresetIndex(DEFAULT_PRESET_ID));
  const [facing, setFacing] = useState<CameraType>('back');
  const [flashOn, setFlashOn] = useState(false);
  /**
   * 变焦。值就是传给 `<CameraView zoom={...}>` 的那个数（0 = 不放大），
   * 不是倍数 —— 为什么见 `src/constants/zoom.ts` 的文件头。
   */
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);
  /**
   * 点亮的焦段档位。只在"点了档位按钮"时非空 —— 捏合之后清空，
   * 因为那时候读数已经不在任何一档上了，还亮着会骗人。
   */
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  /** `getAvailableLenses()` 的结果（异步，初值是空数组）。 */
  const [lenses, setLenses] = useState<readonly string[]>([]);
  /** 要写给 `<CameraView selectedLens>` 的名字。`undefined` = 不传这个 prop。 */
  const [lens, setLens] = useState<string | undefined>(undefined);
  /**
   * 本卷已拍张数（胶片计数徽章显示的就是它）。用户要求**换镜头归零**：
   * 前后摄是两套镜头模组，把前摄拍的张数记在后摄的卷上会误导人。
   * 从 0 开始 —— 徽章显示的是"这张会在胶片的第几格"，拍完才 +1。
   */
  const [exposureCount, setExposureCount] = useState(0);
  /**
   * 手动对焦点。x / y 是**取景器上的 0~1 归一化坐标**（原点左上，和
   * `Pressable` 的 `locationX` / `locationY` 同向），`at` 是时间戳 ——
   * 同一个点连点两次也要重新对焦，所以它必须是新对象。
   * `null` = 还没点过。
   */
  const [focusTarget, setFocusTarget] = useState<FocusTarget>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [mountError, setMountError] = useState<string | null>(null);
  const [status, setStatus] = useState<DevelopStatus>({ kind: 'idle' });
  const [saveIssue, setSaveIssue] = useState<string | null>(null);
  const [previewBox, setPreviewBox] = useState<Size>({ width: 0, height: 0 });
  /** 设置界面（整屏覆盖层，不是导航栈里的一个页面）。 */
  const [settingsVisible, setSettingsVisible] = useState(false);
  /**
   * App 内相册。同样是整屏覆盖层 —— 用户的原话是「不用每次都去系统相册查看」，
   * 所以它是**本机沙盒里的第二份拷贝**，不是系统相册的镜像。
   */
  const [galleryVisible, setGalleryVisible] = useState(false);
  /** 胶卷库抽屉（长按底部胶片名 400ms 打开）。 */
  const [filmDrawerVisible, setFilmDrawerVisible] = useState(false);

  /* ---------------- refs ---------------- */
  const cameraRef = useRef<ComponentRef<typeof CameraView>>(null);
  /** 同步防连点锁：`disabled` 属性挡不住"同一帧内的第二次点击"，这个能。 */
  const shotLockRef = useRef(false);
  const askedCameraRef = useRef(false);
  /**
   * 长按胶卷名时先触发 `onLongPress` 再触发 `onPress`（RN 的既有行为），
   * 用一个 ref 记下来，让松开那一下**不要再换一卷**。
   * 用 ref 而不是 state：它在一次触摸里被读写，重新渲染反而会被覆盖。
   */
  const filmLongPressRef = useRef(false);

  /* ---------------- 派生数据（全部来自纯数据常量） ---------------- */
  const frame = FRAMES[frameIndex] ?? FRAMES[0];
  const preset = PRESETS[presetIndex] ?? PRESETS[0];
  /*
   * 颗粒强度**只从设置里读**，主屏不再自己持有一份。
   *
   * 这里曾经是 `useState(findGrainLevelIndex(DEFAULT_GRAIN_LEVEL_ID))` + 主屏
   * 自己那条分段条，后果是：设置页里改了颗粒、成片一点没变（两边各说各话），
   * 而且同一件事在界面上出现两次。唯一的真源是 `settings.grainLevel`，
   * 写入方只有设置页；主屏分段条已删除。
   */
  const grainLevel = grainLevelAt(findGrainLevelIndex(settings.grainLevel));
  /**
   * 颗粒档位是**乘在预设之上**的，所以顺序必须是「先乘档位 → 再补默认值」。
   * 这样 LCD 状态条显示的数字、和真正进 `buildGradeLayers` 的数字，永远是同一个。
   */
  const effectivePreset = useMemo(
    () => applyGrainLevel(preset, grainLevel.scale),
    [preset, grainLevel.scale],
  );
  const resolved = useMemo(() => resolvePreset(effectivePreset), [effectivePreset]);

  /**
   * 相框显示名。内置相框带 `nameKey`（跟着语言走），
   * 用户自己加的相框没这个键，就直接显示配置里写的 `name`。
   */
  const frameName = frame.nameKey !== undefined ? t(frame.nameKey) : frame.name;

  const developing = status.kind === 'developing';
  const cameraGranted = cameraPermission?.granted === true;
  const interactive = !developing && cameraGranted;
  /**
   * 镜头列表还没回来时**不要**把按钮画成禁用 —— 不然回到相机那一刻
   * 三个档位全是灰的，看着像坏了。这时候点了会退化成"只设 zoom、不切镜头"，
   * 行为仍然是对的（1× 本来就是主摄的原生焦距）。
   */
  const lensesKnown = lenses.length > 0;

  /**
   * 三个倍率档位的展示数据。`resolveStop` 是保守的：拿不到镜头列表，
   * 或者这台设备没有超广角（前摄是常客）时，那一档会报 `available: false`。
   *
   * 档位是**数码裁切**时（2×），无障碍标签里补一句 `zoom.stop.digital` ——
   * 读屏用户看不到格子上那个小 `D` 角标，得用文字告诉他"这一档是裁切，不是换镜头"。
   */
  const zoomStops = useMemo<readonly ZoomStopView[]>(
    () =>
      ZOOM_STOPS.map((stop) => {
        const roleKey = stop.lens === 'ultraWide' ? 'zoom.role.ultraWide' : 'zoom.role.wide';
        const label = `${stop.multiplier}× ${t(roleKey)}`;
        const digital = isDigitalStop(stop);
        const stopResolved = resolveStop(stop, { lenses, facing });
        return {
          id: stop.id,
          short: `${stop.multiplier}×`,
          a11y: digital
            ? `${t('zoom.stop.a11y', { label })} · ${t('zoom.stop.digital')}`
            : t('zoom.stop.a11y', { label }),
          disabled: lensesKnown && !stopResolved.available,
          digital,
        };
      }),
    [lenses, lensesKnown, facing, t],
  );

  /**
   * 倍率读数（右下角）。和档位按钮**用同一套换算**：`zoomToFactor()` 是
   * `zoom.ts` 里那条指数曲线的反函数（`videoZoomFactor = 16^zoom`）。
   *
   * 它是**估算**，不是实测值 —— 真机的 `videoMaxZoomFactor` 从 JS 读不到，
   * 只能按 16 假设（详见 `src/constants/lenses.ts` 的文件头）。之所以还要显示，
   * 是因为取景器画面本身看不出"现在放大了多少"，而这个数字在捏合时是唯一的反馈。
   */
  const zoomFactor = zoomToFactor(zoom);

  /**
   * 传给 `<CameraView>` 的 `focusPoint`。
   *
   * **必须是 memo 化的对象**：原生那个 prop 是命令式的，刻意没做等值短路
   * （这样同一个点连点两次也能重新对焦），所以只要这个对象的引用变了，
   * 原生就会重新对焦一次。写成内联字面量的话，每一次 re-render ——
   * 比如手指在变焦档位上点一下 —— 都会变成一次对焦。
   *
   * 没有手动对焦点时返回**空对象**，而不是 `{ focusPoint: undefined }`：
   * `convertNativeProps` 用的是 `Object.entries`，值为 `undefined` 的键也会被算进去，
   * 展开一个空对象才是真的什么都没传。
   */
  const cameraFocusProps = useMemo<CameraViewProps & FocusPointProp>(
    () =>
      focusTarget === null ? {} : { focusPoint: { x: focusTarget.x, y: focusTarget.y } },
    [focusTarget],
  );

  // 取景器里相框的排版（和成片用同一个 computeFrameLayout，所以构图一致）
  const previewLayout = useMemo(() => {
    const availableWidth = previewBox.width > 1 ? previewBox.width : window.width;
    const availableHeight = previewBox.height > 1 ? previewBox.height : window.height * 0.62;
    return computeFrameLayout(
      frame,
      Math.max(1, availableWidth - PREVIEW_PADDING * 2),
      Math.max(1, availableHeight - PREVIEW_PADDING * 2),
    );
  }, [frame, previewBox.width, previewBox.height, window.width, window.height]);

  const frameOffset = useMemo(
    () => ({
      left: Math.max(0, (previewBox.width - previewLayout.width) / 2),
      top: Math.max(0, (previewBox.height - previewLayout.height) / 2),
    }),
    [previewBox.width, previewBox.height, previewLayout.width, previewLayout.height],
  );

  // 成片合成舞台的尺寸（同时决定成片像素：逻辑尺寸 × PixelRatio）
  const stageBox = useMemo(
    () => computeDevelopStageBox({ width: window.width, height: window.height }),
    [window.width, window.height],
  );

  // 底部 LCD 状态条的三行文案（只是把 resolved 里的数字排成紧凑的机器打印格式）
  const timestampAnchor = resolved.timestamp.anchor ?? frame.watermark?.anchor ?? 'window';
  const lcdDateLine = resolved.timestamp.enabled
    ? t('lcd.date.on', { format: resolved.timestamp.format, anchor: timestampAnchor.toUpperCase() })
    : t('lcd.date.off');
  const lcdParamLine = t('lcd.params', {
    code: grainLevel.code,
    grain: compact(resolved.grain),
    vignette: compact(resolved.vignette),
    leak: compact(resolved.lightLeak),
    font: fonts.source === 'custom' ? t('lcd.font.custom') : t('lcd.font.mono'),
  });
  /**
   * 定位那一行。三种失败都只把原因写出来，**绝不拦快门** ——
   * 定位只是水印里的一行小字，没拿到就这张不写，不该耽误出片。
   *
   * 这里用 `LOCATION_FAILURE_COPY[...].short`：LCD 是单行，放不下完整句子。
   */
  const lcdLocationLine =
    locationStamp.state.kind === 'ready'
      ? t('lcd.location.on', { value: locationStamp.state.text })
      : locationStamp.state.kind === 'locating'
        ? t('location.locating')
        : locationStamp.state.kind === 'error'
          ? t(LOCATION_FAILURE_COPY[locationStamp.state.reason].short)
          : t('lcd.location.off');

  /**
   * 是否有整屏面板盖在相机上。`SettingsScreen` / `GalleryScreen` 的遮罩是
   * `rgba(12,12,11,0.97)`，`FilmDrawer` 是实心 —— 单看每一个都够厚，但 0.97
   * 仍然会让高亮的取景画面在背后"隐隐发亮"。这里把整个取景容器压成 `opacity: 0`，
   * 从根上保证"面板下面没有相机画面"。
   *
   * 为什么改透明度而不是卸载 `CameraView`：卸载会触发一次完整的原生相机会话重建
   * （关一次设置界面就黑屏一下），而透明度是纯合成层的属性，代价为零。
   */
  const covered = settingsVisible || galleryVisible || filmDrawerVisible;

  /* ---------------- 权限：首次进来自动问一次 ---------------- */
  useEffect(() => {
    if (askedCameraRef.current || cameraPermission === null) {
      return;
    }
    if (cameraPermission.granted || !cameraPermission.canAskAgain) {
      return;
    }
    askedCameraRef.current = true;
    void requestCameraPermission();
  }, [cameraPermission, requestCameraPermission]);

  /* ---------------- 回调 ---------------- */
  const handlePreviewLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setPreviewBox((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  }, []);

  /**
   * 问一次可用镜头列表。`onAvailableLensesChanged` 是主路径，这个是兜底：
   * 有的机型要等 `onCameraReady` 之后镜头才登记进 discovery session。
   * 两个来源写同一个 state，谁先回来算谁的。
   */
  const refreshLenses = useCallback(async () => {
    const camera = cameraRef.current;
    if (camera === null) {
      return;
    }
    try {
      setLenses(await camera.getAvailableLensesAsync());
    } catch {
      // 拿不到就当没有 —— `zoomStops` 会退化成"只调 zoom、不切镜头"
      setLenses([]);
    }
  }, []);

  const handleLensesChanged = useCallback((event: { lenses: string[] }) => {
    setLenses(event.lenses ?? []);
  }, []);

  const handleCameraReady = useCallback(() => {
    setCameraReady(true);
    setMountError(null);
    void refreshLenses();
  }, [refreshLenses]);

  const handleMountError = useCallback((event: { message: string }) => {
    setCameraReady(false);
    setMountError(event.message);
  }, []);

  const handleRetryCamera = useCallback(() => {
    setMountError(null);
    setCameraReady(false);
    // 换 key → CameraView 重新挂载（比反复调 API 可靠）
    setCameraKey((current) => current + 1);
  }, []);

  /** 滑动换相框：FrameSwitcher 已经取过模，这里再兜一次。 */
  const handleFrameChange = useCallback((next: number) => {
    setFrameIndex(wrapIndex(next));
  }, []);

  /**
   * 顶部左侧的画幅徽章：点一下 = 换下一张。
   * 和 `FrameSwitcher` 的滑动、底部 ‹ › 步进共用同一个 `frameIndex`，
   * 所以三条路径永远同步（也共用同一种"选择"震动）。
   */
  const handleBadgeFramePress = useCallback(() => {
    void Haptics.selectionAsync();
    setFrameIndex((current) => wrapIndex(current + 1));
  }, []);

  /** 底部 ‹ › 步进换相框（和滑动走同一条 state，所以两边永远同步）。 */
  const handleStepFrame = useCallback((direction: -1 | 1) => {
    void Haptics.selectionAsync();
    setFrameIndex((current) => wrapIndex(current + direction));
  }, []);

  /** 底部胶片名：轻触换下一卷。 */
  const handlePresetCycle = useCallback(() => {
    void Haptics.selectionAsync();
    setPresetIndex((current) => wrapPresetIndex(current + 1));
  }, []);

  const handleFlipCamera = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
    // iOS 的 AVCapturePhotoOutput 在前置上没有闪光灯档位（Retina Flash 是系统相机
    // 自己做的，第三方拿不到），翻转时顺手关掉，避免按钮亮着但什么也没发生。
    setFlashOn(false);
    // 前后摄的镜头模组不一样（后置广角的最大数码变焦和前置差很多），
    // 沿用旧值会让翻转后突然变成另一档放大，直接归零最不容易出意外。
    setZoom(DEFAULT_ZOOM);
    // 镜头列表是**按摄像头**给的，不清掉会拿着后摄的超广角去点前摄的档位按钮。
    setLens(undefined);
    setActiveStopId(null);
    setLenses([]);
    // 手动对焦点是上一个摄像头的坐标，换摄像头之后它没有任何意义
    setFocusTarget(null);
    // 换卷：胶片计数归零（用户要求"翻转相机重置计数"）
    setExposureCount(0);
  }, []);

  /**
   * 双指捏合。手动调出来的读数不在任何一档上，顺手把档位灯灭掉 ——
   * 否则会出现「亮着 2×，读数却是 1.4×」这种自相矛盾的显示。
   */
  const handleZoomChange = useCallback((next: number) => {
    setZoom(toCameraZoom(next));
    setActiveStopId(null);
  }, []);

  /**
   * 点倍率档位：切镜头 + 设 zoom。
   *
   * 0.5× / 1× 两档的 zoom 都是 0（靠换镜头而不是数码放大）；2× 那档是主摄
   * × 2 的数码裁切。为什么不真的切长焦、`factor` 为什么要写死，
   * 见 `src/constants/lenses.ts` 的文件头。
   *
   * 镜头列表还没回来时（`lensesKnown === false`）不拦着：`resolveStop` 会
   * 返回 `lens: undefined`，这时就只设 zoom、不切镜头，行为仍然是对的。
   */
  const handleStopPress = useCallback(
    (id: string) => {
      const stop = ZOOM_STOPS.find((candidate) => candidate.id === id);
      if (stop === undefined) {
        return;
      }
      const stopResolved = resolveStop(stop, { lenses, facing });
      if (lensesKnown && !stopResolved.available) {
        return;
      }
      void Haptics.selectionAsync();
      setLens(stopResolved.lens);
      setZoom(stopResolved.zoom);
      setActiveStopId(stop.id);
    },
    [lenses, lensesKnown, facing],
  );

  /**
   * 点画面对焦。
   *
   * `locationX` / `locationY` 是相对那层透明接收层的坐标，而它和 `CameraView`
   * 完全重合，所以除以取景器宽高就是原生要的 0~1 归一化坐标。
   *
   * **竖屏旋转、前摄镜像、`resizeAspectFill` 的裁切都不在这里算** —— 那一层交给
   * `AVCaptureVideoPreviewLayer.captureDevicePointConverted(fromLayerPoint:)`
   * 在原生侧做（见 `patches/expo-camera+57.0.6.patch`）。手写的 x/y 交换迟早会在
   * 某一个朝向上指向错误的地方，而对焦点错了是**无声的**：照片照样能拍，
   * 只是焦点落在别处，用户根本不会知道是坐标算错了。
   */
  const handleTapFocus = useCallback(
    (event: GestureResponderEvent) => {
      const { width, height } = previewLayout;
      if (width <= 0 || height <= 0) {
        return;
      }
      const { locationX, locationY } = event.nativeEvent;
      void Haptics.selectionAsync();
      setFocusTarget({
        x: clamp01(locationX / width),
        y: clamp01(locationY / height),
        // 时间戳是身份的一部分：同一点连点两次必须是新对象，否则原生收不到通知
        at: Date.now(),
      });
    },
    [previewLayout],
  );

  /**
   * 取景器上的双指捏合。和档位按钮走同一个 `handleZoomChange`，
   * 所以两种调法（捏合 / 点档位）永远只有一个真值来源。
   * 为什么要用 capture 阶段的细节见 `src/hooks/usePinchZoom.ts` 的文件头。
   */
  const pinchHandlers = usePinchZoom({
    enabled: interactive,
    zoom,
    maxZoom: ZOOM_MAX,
    onChange: handleZoomChange,
  });

  const handleToggleFlash = useCallback(() => {
    void Haptics.selectionAsync();
    setFlashOn((current) => !current);
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
  }, []);

  /* ---------------- 胶卷名那一行 ---------------- */
  // 换卷时的淡入：`setValue(0)` 是**同步**的，所以 index 一变这一行立刻变淡，
  // 再花 160ms 淡回来。只动 opacity（原生驱动），滚动时不掉帧。
  const filmReveal = useRef(new Animated.Value(1)).current;
  /** 长按时的"顶一下"。由 `onPressIn` / `onPressOut` 驱动，不跟任何 state 走。 */
  const filmNudge = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    filmReveal.setValue(0);
    const animation = Animated.timing(filmReveal, {
      toValue: 1,
      duration: FILM_FADE_MS,
      useNativeDriver: true,
    });
    animation.start();
    return () => {
      animation.stop();
    };
  }, [filmReveal, presetIndex]);

  const handleFilmPress = useCallback(() => {
    // 长按已经开过胶卷库了，松开这一下不要再换一卷
    if (filmLongPressRef.current) {
      filmLongPressRef.current = false;
      return;
    }
    handlePresetCycle();
  }, [handlePresetCycle]);

  /**
   * 长按 400ms 开胶卷库。手感和开设置/相册一致（机械动作 → Light 冲击），
   * 同时胶片名会"顶一下"（`filmNudge`），让人知道"长按是有反应的"。
   */
  const handleFilmLongPress = useCallback(() => {
    filmLongPressRef.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFilmDrawerVisible(true);
  }, []);

  const handleFilmPressOut = useCallback(() => {
    filmNudge.setValue(0);
  }, [filmNudge]);

  const handleCloseFilmDrawer = useCallback(() => {
    setFilmDrawerVisible(false);
  }, []);

  /**
   * 在胶卷库里选中一卷：换预设 + 关抽屉。
   * 这里用 `selectionAsync`（"选择"类动作），关抽屉本身不再补一次震动 ——
   * 一次操作只该有一次反馈。
   */
  const handleFilmDrawerSelect = useCallback((presetId: string) => {
    void Haptics.selectionAsync();
    setPresetIndex(findPresetIndex(presetId));
    setFilmDrawerVisible(false);
  }, []);

  const handleDismiss = useCallback(() => {
    setStatus({ kind: 'idle' });
    setSaveIssue(null);
  }, []);

  /** 快门：拿原图 → 显影 → 存相册。整条链路都在 try/catch 里，绝不白屏。 */
  const handleShutter = useCallback(async (): Promise<void> => {
    const camera = cameraRef.current;
    if (shotLockRef.current) {
      return;
    }
    if (!camera || !cameraReady || developing) {
      return;
    }

    shotLockRef.current = true;
    setSaveIssue(null);
    setStatus({ kind: 'developing', stage: 'normalizing' });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      // 定位和拍照**并行**：按快门那一刻就把定位请求发出去。
      // 它有自己的截止时间（`useLocationStamp` 里的 SHOT_DEADLINE_MS），
      // 到点拿不到就这张不写定位 —— 照片永远不等 GPS。
      const locationPromise = locationStamp.resolveForShot();

      const shot = await camera.takePictureAsync({ quality: 1, exif: false });
      if (!shot || !shot.uri) {
        throw new Error(t('error.noPhoto'));
      }

      const captured: CapturedPhoto = {
        uri: shot.uri,
        width: shot.width,
        height: shot.height,
      };

      const place = await locationPromise;

      const result = await processAndSaveFilmPhoto({
        photo: captured,
        frame,
        // 传乘过颗粒档位的预设：LCD 上显示什么数字，出片就是什么力度
        preset: effectivePreset,
        stage: stageBox,
        host: filmStage.host,
        /*
          传**结构**而不是拼好的字符串：合成层要按"拍这张时的界面语言"重新拼那一行字。
          一行拼好的中文地名在用户切成英文之后没法重排，而 `ResolvedPlace`
          带着城市/地区/国家的分档信息，四种水印版式才排得出来。
          详情见 `src/utils/placeNames.ts` 的文件头。
        */
        place,
        locale: localeId,
        /*
          水印版式和地名详细度必须**每次都从设置里读**，不能用合成层的默认值。
          合成层（`FilmCompositor`）是会按拍这张时的设置重排那一行字的，
          而它拿到的只有这里传下去的东西 —— 少传一个，设置页里那一项就只是装饰。
        */
        watermarkLayout: settings.watermarkLayout,
        placeDetail: settings.placeDetail,
        onStage: (nextStage) => setStatus({ kind: 'developing', stage: nextStage }),
      });

      setStatus({ kind: 'done', uri: result.photo.uri, saved: result.save.ok });
      // 这一格用掉了 → 胶片计数 +1（徽章显示的是"下一张会在第几格"）
      setExposureCount((current) => current + 1);
      /*
        再往 App 内相册存一份。**故意不 await**：成片此刻已经落盘了，
        这一步只是拷一份到沙盒，慢几百毫秒不该让"冲洗完成"多等。
        也不用 `useGallery()` —— 那会给这个组件引入一个跟取景毫无关系的
        re-render 源；相册界面每次打开自己重新读索引。
      */
      void addShot({
        sourceUri: result.photo.uri,
        width: result.photo.width,
        height: result.photo.height,
        frameId: frame.id,
        presetId: effectivePreset.id,
      }).catch((error: unknown) => {
        // `addShot` 按约定不抛（失败返回 null），这里是最后一道兜底
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
    filmStage.host,
    frame,
    effectivePreset,
    stageBox,
    // 只依赖这个稳定的 useCallback，不依赖整个 controller 对象
    // （controller 每次渲染都是新对象，会把 handleShutter 也一起重建）
    locationStamp.resolveForShot,
    localeId,
    // 依赖具体字段而不是整个 settings 对象：设置一变这里就该重建，
    // 但只有这两项真的影响出片，其余设置不该让快门回调失效。
    settings.watermarkLayout,
    settings.placeDetail,
    t,
  ]);

  /**
   * 音量键 / 蓝牙快门线（`usePhysicalShutter` 在不支持的设备上是 no-op）。
   *
   * 为什么包一层箭头函数：那个 hook 把 `onPress` 存进 ref 并用原生事件订阅回调去调它，
   * 这里传的是已经 memo 过的 `handleShutter`，订阅不会因为重渲染反复重建。
   */
  usePhysicalShutter({
    enabled: cameraGranted && cameraReady && !developing,
    onPress: () => {
      void handleShutter();
    },
  });

  /* ---------------- 覆盖层内容（权限 / 加载 / 相机错误） ---------------- */
  let noticeNode: ReactNode = null;
  if (cameraPermission === null) {
    noticeNode = <ActivityIndicator color="#FFB562" />;
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

  /**
   * 胶片计数徽章的文字：`[01A]`。序号补零到两位 —— 等宽字体下位数变化本来
   * 也不会抖，补零是为了让这个徽章在任何张数下都保持同样的宽度和"片边编号"的味道。
   */
  const filmCounterText = `[${String(exposureCount).padStart(2, '0')}${filmCounterLetter(facing)}]`;
  const filmNudgeX = filmNudge.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -FILM_NUDGE],
  });

  /**
   * 右下角读数下面那行小字。
   *
   * 没有点亮任何档位（捏合过、或者刚翻转镜头）时只写 `变焦`；点亮了档位就写
   * "点亮的是哪一档" —— 这样它和上面那三个格子说的是同一件事，不会出现
   * "格子亮着 1×、下面写着别的东西"的矛盾。
   *
   * 数码裁切那一档额外补一句 `zoom.stop.digital`：那一格的边框、格内小 `D`
   * 角标都在别的组件里，这是主界面上唯一能写清"这一档不是换镜头"的地方。
   */
  const activeZoomStop = zoomStops.find((stop) => stop.id === activeStopId);
  const activeStopHint =
    activeZoomStop === undefined
      ? t('zoom.label')
      : activeZoomStop.digital === true
        ? `${activeZoomStop.short} ${t('zoom.stop.digital')}`
        : activeZoomStop.short;

  return (
    <View style={styles.root}>
      {/* 机身底纹：极低对比度的皮革/磨砂 tile，远看是纯色。
          包一层 View 是为了 `pointerEvents` —— RN 的类型里它只属于 ViewStyle，
          不能直接写在 <Image> 上（写了 tsc 会报 property does not exist）。 */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Image
          source={UI_ASSETS.leatherTile}
          style={styles.backdrop}
          resizeMode="repeat"
          fadeDuration={0}
        />
      </View>

      {/* ================= ① 顶部操作栏（独立一行，不遮挡取景器） ================= */}
      <View style={[styles.topPanel, { paddingTop: insets.top + 4 }]}>
        {/*
          左上：画幅徽章。它替代了原来那行"相框 · 序号 · 预设"的等宽字标签 ——
          那一行要读一眼才知道在说什么，而画幅是一个**可以点**的东西，
          点一下换下一张，序号直接印在徽章上。
        */}
        <FrameBadge
          name={frameName}
          index={frameIndex}
          count={FRAMES.length}
          aspect={frame.aspect}
          disabled={!interactive}
          onPress={handleBadgeFramePress}
        />

        {/*
          右上：胶片计数徽章 + 四枚拨轮。
          拨轮底下原来各刻一行小字（补光 / 反转 / 设置 / 相册），现在全部去掉 ——
          用户明确要求"图标保留、说明文字去掉"。认不出图标的问题交给无障碍标签和
          真实机身的习惯（闪光灯、翻转、设置、相册都是通用图形）。
        */}
        <View style={styles.topActions}>
          <Text style={styles.filmCounter} numberOfLines={1}>
            {filmCounterText}
          </Text>
          <View style={styles.topActionsGap} />
          <DialButton
            icon={flashOn ? UI_ASSETS.iconFlashOn : UI_ASSETS.iconFlash}
            active={flashOn}
            disabled={facing === 'front'}
            onPress={handleToggleFlash}
            accessibilityLabel={flashOn ? t('camera.flash.on') : t('camera.flash.off')}
            size={38}
          />
          <View style={styles.topActionsGap} />
          <DialButton
            icon={UI_ASSETS.iconFlip}
            onPress={handleFlipCamera}
            accessibilityLabel={t('camera.flip.a11y')}
            size={38}
          />
          <View style={styles.topActionsGap} />
          <DialButton
            icon={UI_ASSETS.iconSettings}
            active={settingsVisible}
            onPress={handleOpenSettingsScreen}
            accessibilityLabel={t('camera.settings.a11y')}
            size={38}
          />
          <View style={styles.topActionsGap} />
          <DialButton
            icon={UI_ASSETS.iconAlbum}
            active={galleryVisible}
            onPress={handleOpenGalleryScreen}
            accessibilityLabel={t('camera.gallery.a11y')}
            size={38}
          />
        </View>
      </View>

      {/* ================= ② 取景器 =================
          `covered` 时整块压成透明：面板下面不能有任何相机画面（详见 covered 的注释）。 */}
      <View
        style={[styles.preview, covered ? styles.previewCovered : null]}
        pointerEvents={covered ? 'none' : 'auto'}
        onLayout={handlePreviewLayout}
        {...pinchHandlers}
      >
        {cameraGranted ? (
          <CameraView
            key={cameraKey}
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
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
              <FocusBrackets rect={previewLayout.window} />
              <FrameOverlay frame={frame} layout={previewLayout} />
            </View>

            {/*
              点画面对焦。这一层是**透明**的，铺满整个取景器（和 `CameraView` 同尺寸，
              所以 `locationX / 取景器宽` 就是原生要的 0~1 归一化坐标）。

              特意放在 FrameSwitcher **里面**：手势路径于是是
              `Pressable → FrameSwitcher → preview`。单击不会被它抢走
              （它的 `onStartShouldSetPanResponder` 恒为 false，只在移动时接管），
              而横向滑动换相框时它照样能接管过去（Pressable 默认允许被终止）。
            */}
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

        {/*
          对焦框。纯展示（`pointerEvents="none"`），所以放在取景器这一层 ——
          不参与任何手势，也不会挡住上面那层点击区域。
        */}
        <FocusReticle
          target={focusTarget}
          width={previewLayout.width}
          height={previewLayout.height}
        />

        {/* 保存失败（通常是相册权限）：不阻塞拍摄，给一次"去设置" */}
        {saveIssue !== null ? (
          <View style={[styles.banner, { bottom: 12 }]}>
            <Text style={styles.bannerText}>{saveIssue}</Text>
            <View style={styles.bannerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('banner.openSettings')}
                onPress={handleOpenSystemSettings}
                hitSlop={8}
              >
                <Text style={styles.bannerAction}>{t('banner.openSettings')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('banner.dismiss')}
                onPress={() => setSaveIssue(null)}
                hitSlop={8}
              >
                <Text style={styles.bannerAction}>{t('banner.dismiss')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      {/* ================= ③ 变焦档位 =================
          放在取景器和主控之间：上面是"看画面调"的手势（滑动换相框 / 捏合变焦），
          这里是"点一下就到"的精确档位。三个等宽格子居中，选中态画在格子**内部**，
          所以点哪一档整条轨道都不会挪位。详见 ZoomStops 的文件头。 */}
      {cameraGranted ? (
        <View style={styles.zoomBar}>
          <ZoomStops
            stops={zoomStops}
            activeStopId={activeStopId}
            enabled={interactive}
            onSelect={handleStopPress}
          />
        </View>
      ) : null}

      {/* ================= ④ 底部主控 ================= */}
      <View style={styles.dashboard}>
        <View style={styles.dashSide}>
          <DialButton
            icon={UI_ASSETS.iconFilm}
            onPress={handlePresetCycle}
            disabled={!interactive}
            accessibilityLabel={t('camera.preset.a11y', { name: preset.name })}
          />
          {/*
            胶片名这一行。用户要的形态是"一行文字，两侧小三角"：
              · 轻触 → 换下一卷（淡入淡出 + 选择震动）；
              · 长按 400ms → 打开胶卷库。
            两个三角是**提示**，不是独立的按钮 —— 所以整行只有一个 Pressable，
            三角用 `pointerEvents` 由父级接管（它们本来就不接收触摸）。
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('camera.preset.a11y', { name: preset.name })}
            accessibilityHint={t('film.drawer.hint')}
            onPress={handleFilmPress}
            onLongPress={handleFilmLongPress}
            onPressIn={() => {
              Animated.timing(filmNudge, {
                toValue: 1,
                duration: FILM_LONG_PRESS_MS,
                useNativeDriver: true,
              }).start();
            }}
            onPressOut={handleFilmPressOut}
            delayLongPress={FILM_LONG_PRESS_MS}
            disabled={!interactive}
            hitSlop={6}
            style={({ pressed }) => [styles.filmLine, pressed ? styles.pressed : null]}
          >
            <Animated.View
              style={[styles.filmLineInner, { transform: [{ translateX: filmNudgeX }] }]}
            >
              {/* 序号：固定两位宽（`padStart` + 等宽字体 = 位宽恒定），
                  所以右边的三角和胶片名永远不会因为位数变化而挪动。 */}
              <Text style={styles.filmLineIndex} numberOfLines={1}>
                {String(presetIndex + 1).padStart(2, '0')}
              </Text>
              <Text style={styles.filmArrow}>◀</Text>
              <Animated.Text
                style={[styles.filmName, { opacity: filmReveal }]}
                numberOfLines={1}
                /* 最长的 `CCD-CYBER` 在 13pt Menlo 下约 78pt，一侧只有 ~90pt —— 让它
                   自动缩一点比截断好看（和旧预设卡同一条理由）。 */
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {preset.name}
              </Animated.Text>
              <Text style={styles.filmArrow}>▶</Text>
            </Animated.View>
          </Pressable>
        </View>

        <ShutterButton
          onPress={() => {
            void handleShutter();
          }}
          busy={developing}
          disabled={!cameraReady || !cameraGranted}
        />

        <View style={[styles.dashSide, styles.dashSideRight]}>
          {/*
            右下角的倍率读数。用户明确要求保留它 —— 底部一行只有胶片名的话，
            右侧会空一大块，快门会显得偏右。它同时也是捏合变焦时唯一的数字反馈。
          */}
          <Text style={styles.zoomReadout} numberOfLines={1}>
            {`${zoomFactor.toFixed(1)}×`}
          </Text>
          <Text style={styles.dashHint} numberOfLines={1}>
            {activeStopHint}
          </Text>
        </View>
      </View>

      {/* ================= ⑥ 底部 LCD 状态条 ================= */}
      <View style={[styles.lcdWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.lcdPanel}>
          <View style={styles.lcdRow}>
            <View
              style={[
                styles.lcdSwatch,
                {
                  backgroundColor: resolved.timestamp.enabled
                    ? resolved.timestamp.color
                    : 'rgba(210, 139, 42, 0.22)',
                },
              ]}
            />
            <Text style={styles.lcdText} numberOfLines={1}>
              {lcdDateLine}
            </Text>
          </View>
          <Text style={[styles.lcdText, styles.lcdTextIndent]} numberOfLines={1}>
            {lcdParamLine}
          </Text>
          <Text style={[styles.lcdText, styles.lcdTextIndent]} numberOfLines={1}>
            {lcdLocationLine}
          </Text>
        </View>
      </View>

      {/* ================= 显影层（在 ViewShot 之外，不会被截进成片） ================= */}
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

      {/*
        胶卷库（长按胶片名打开）。放在显影层**之后**：它必须盖住一切，
        否则长按一下还能从抽屉里看到显影幕布在动。
      */}
      <FilmDrawer
        visible={filmDrawerVisible}
        presetIndex={presetIndex}
        onSelect={handleFilmDrawerSelect}
        onClose={handleCloseFilmDrawer}
      />

      {/* ================= 权限 / 错误提示（最上层） ================= */}
      {noticeNode !== null ? (
        <View style={styles.noticeLayer}>{noticeNode}</View>
      ) : null}

      {/*
        App 内相册。（和设置界面同级，都在最顶上；两个都 `visible=false`
        时自己 return null，不占层级也不吃触摸。）
      */}
      <GalleryScreen visible={galleryVisible} onClose={handleCloseGalleryScreen} />

      {/*
        设置界面压在**最顶上**（包括权限提示之上）：
        它是一个显式打开的模态，用户按了"设置"就必须能看到它。
        `visible=false` 时组件自己 return null，不占层级也不吃触摸。
      */}
      <SettingsScreen
        visible={settingsVisible}
        onClose={handleCloseSettingsScreen}
        locationState={locationStamp.state}
      />
    </View>
  );
}

/* ==========================================================================
 * 内部小组件
 * ========================================================================== */

/**
 * 三分构图参考线（纯静态，不做实时水平仪）。
 * 对齐的是**画面窗口**不是整张相框 —— 所以 `rect` 传的是 `layout.window`。
 * 刻意做得很淡（0.125 白）：它只是给眼睛一个参考，不该在取景时"跳出来"。
 */
function GuideGrid({ rect }: { rect: Rect }) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.guide,
        { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      ]}
    >
      <View style={[styles.guideVertical, { left: rect.width / 3 }]} />
      <View style={[styles.guideVertical, { left: (rect.width * 2) / 3 }]} />
      <View style={[styles.guideHorizontal, { top: rect.height / 3 }]} />
      <View style={[styles.guideHorizontal, { top: (rect.height * 2) / 3 }]} />
    </View>
  );
}

/**
 * 四角 L 形对焦框 + 中心微小准星。
 *
 * 只画四个角而不是四个完整的框：视觉重量低得多，但在任何背景上都读得出"这是取景范围"。
 * 也**不在取景器里做实时对焦动画** —— 那会引入逐帧计算，违反"取景器只做呈现"的约束。
 */
function FocusBrackets({ rect }: { rect: Rect }) {
  const inset = Math.max(4, Math.round(rect.width * 0.014));
  const size = Math.max(14, Math.round(Math.min(rect.width, rect.height) * 0.07));
  const corner = { width: size, height: size };
  const top = { top: inset };
  const bottom = { bottom: inset };
  const left = { left: inset };
  const right = { right: inset };

  return (
    <View
      pointerEvents="none"
      style={[
        styles.focusLayer,
        { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      ]}
    >
      <View style={[styles.corner, corner, styles.cornerTL, top, left]} />
      <View style={[styles.corner, corner, styles.cornerTR, top, right]} />
      <View style={[styles.corner, corner, styles.cornerBL, bottom, left]} />
      <View style={[styles.corner, corner, styles.cornerBR, bottom, right]} />

      <View
        style={[
          styles.reticle,
          { left: rect.width / 2 - RETICLE / 2, top: rect.height / 2 - RETICLE / 2 },
        ]}
      >
        <View style={styles.reticleH} />
        <View style={styles.reticleV} />
        <View style={styles.reticleDot} />
      </View>
    </View>
  );
}

/** 准星画布边长（pt）。 */
const RETICLE = 24;
/** 准星中心留空的直径 —— 留空比实心十字更"轻"，也更像真机的对焦标记。 */
const RETICLE_GAP = 5;

/* ==========================================================================
 * 样式
 * ========================================================================== */

// INK / UI_MONO / compact 都搬到了 `src/constants/theme.ts` ——
// 设置界面和取景屏幕必须共用同一套墨色，否则两边会慢慢漂成两个 App。

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#171716',
  },
  backdrop: {
    // 注意：RN 0.86 已移除 StyleSheet.absoluteFillObject，只能用 absoluteFill
    ...StyleSheet.absoluteFill,
    opacity: 0.95,
  },

  /* ---------------- ① 顶部操作栏 ---------------- */
  topPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 9,
    backgroundColor: 'rgba(10, 10, 9, 0.34)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: INK.hairline,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  /**
   * 胶片计数徽章。用户要的样子是"胶片片边上的机器编号"：极小、等宽、
   * 琥珀色打在深底上。宽度由补零固定，所以 9 → 10 也不会把右边的拨轮推走。
   */
  filmCounter: {
    minWidth: 42,
    textAlign: 'right',
    color: INK.amber,
    fontSize: 10,
    letterSpacing: 0.8,
    fontFamily: UI_MONO,
  },
  topActionsGap: {
    width: 6,
  },

  /* ---------------- ② 取景器 ---------------- */
  preview: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#0A0A0B',
  },
  /** 有整屏面板盖着时：取景器整块隐去（保持挂载，只改透明度）。 */
  previewCovered: {
    opacity: 0,
  },
  canvas: {
    position: 'absolute',
  },
  /**
   * 点画面对焦的透明接收层。写死四边而不是用 `StyleSheet.absoluteFillObject`，
   * 免得跟着 RN 版本的 API 变动走。它和 `CameraView` 完全重合，
   * 所以 `locationX / previewLayout.width` 直接就是 0~1。
   */
  focusCatcher: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  guide: {
    position: 'absolute',
    overflow: 'hidden',
  },
  guideVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.125)',
  },
  guideHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.125)',
  },
  focusLayer: {
    position: 'absolute',
  },
  corner: {
    position: 'absolute',
    borderColor: 'rgba(255, 255, 255, 0.30)',
  },
  cornerTL: { borderTopWidth: 1, borderLeftWidth: 1 },
  cornerTR: { borderTopWidth: 1, borderRightWidth: 1 },
  cornerBL: { borderBottomWidth: 1, borderLeftWidth: 1 },
  cornerBR: { borderBottomWidth: 1, borderRightWidth: 1 },
  reticle: {
    position: 'absolute',
    width: RETICLE,
    height: RETICLE,
  },
  reticleH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: RETICLE / 2,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
  },
  reticleV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: RETICLE / 2,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
  },
  reticleDot: {
    position: 'absolute',
    left: RETICLE / 2 - RETICLE_GAP / 2,
    top: RETICLE / 2 - RETICLE_GAP / 2,
    width: RETICLE_GAP,
    height: RETICLE_GAP,
    borderRadius: RETICLE_GAP / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.50)',
  },

  /* 相册保存失败横幅 */
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    padding: 12,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(194, 122, 48, 0.45)',
    backgroundColor: 'rgba(18, 15, 12, 0.94)',
  },
  bannerText: {
    color: 'rgba(232, 228, 220, 0.88)',
    fontSize: 13,
    lineHeight: 19,
  },
  bannerActions: {
    marginTop: 10,
    flexDirection: 'row',
  },
  bannerAction: {
    marginRight: 18,
    color: INK.amber,
    fontSize: 14,
    fontWeight: '700',
  },

  /* ---------------- ③ 变焦档位 ---------------- */
  /**
   * 只负责"横向居中 + 上下留白"。容器宽度由 `ZoomStops` 自己按窗口宽度算，
   * 这里**不能**给固定宽度或 `flex: 1` —— 那会把居中这件事交给父布局，
   * 而父布局的宽度里还夹着左右 padding，最后会偏一点点。
   *
   * 也不在这里再叠一层底色：`ZoomStops` 自己已经带了和主控同一档的
   * `rgba(10,10,9,0.34)`，两边都写会让这条带子比上下两段明显更黑。
   */
  zoomBar: {
    alignItems: 'center',
  },

  /* ---------------- ④ 底部主控 ---------------- */
  dashboard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: 'rgba(10, 10, 9, 0.34)',
  },
  dashSide: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  dashSideRight: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexShrink: 0,
  },
  /**
   * 胶片名那一行。整行是**一个** Pressable（"点哪儿都换下一卷"），
   * 所以这里只能有内边距，不能给两侧三角单独做按钮。
   */
  filmLine: {
    marginLeft: 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
    flexShrink: 1,
  },
  filmLineInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  /**
   * 序号槽：固定两位、右对齐、等宽字体。
   * 这三条加起来保证"位宽恒定" —— 9 → 10 时右边的三角和胶片名一格都不动。
   */
  filmLineIndex: {
    width: 18,
    textAlign: 'right',
    color: INK.paperDim,
    fontSize: 11,
    letterSpacing: 0.5,
    fontFamily: UI_MONO,
  },
  /** 两侧小三角：**只是提示**（可以点、点的是整行），所以刻意做得很小很暗。 */
  filmArrow: {
    marginHorizontal: 5,
    color: INK.paperFaint,
    fontSize: 8,
    fontFamily: UI_MONO,
  },
  /** 胶片名：工业代号，等宽大字，和旧的预设卡同一个视觉重量。 */
  filmName: {
    flexShrink: 1,
    color: INK.amberSoft,
    fontSize: 13,
    letterSpacing: 0.6,
    fontFamily: UI_MONO,
  },
  /**
   * 右下角倍率读数。用户要求保留它（右侧空了快门会显偏）。
   * 它是**估算值**，为什么显示估算值见 `zoomFactor` 附近的注释。
   */
  zoomReadout: {
    color: INK.amber,
    fontSize: 13,
    letterSpacing: 0.8,
    fontFamily: UI_MONO,
  },
  dashHint: {
    marginTop: 2,
    color: 'rgba(226, 222, 214, 0.30)',
    fontSize: 8.5,
    letterSpacing: 0.4,
    fontFamily: UI_MONO,
  },
  pressed: {
    opacity: 0.6,
  },

  /* ---------------- ⑥ LCD 状态条 ---------------- */
  lcdWrap: {
    paddingHorizontal: 14,
    paddingTop: 9,
  },
  lcdPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(210, 139, 42, 0.20)',
    borderRadius: 2,
    backgroundColor: 'rgba(210, 139, 42, 0.045)',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  lcdRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lcdSwatch: {
    width: 6,
    height: 6,
    marginRight: 7,
    borderRadius: 1,
  },
  lcdText: {
    flexShrink: 1,
    color: INK.amber,
    fontSize: 10,
    letterSpacing: 1.1,
    opacity: 0.86,
    fontFamily: UI_MONO,
  },
  lcdTextIndent: {
    marginTop: 3,
    marginLeft: 13,
  },

  /* ---------------- 覆盖层 ---------------- */
  noticeLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
});
