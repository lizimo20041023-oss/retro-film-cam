/**
 * 取景器主屏。
 *
 * 这一版把"实时取景"和"相框"彻底拆开了：取景阶段画面上只有一层镂空取景窗，
 * 相框贴图只在按下快门后的合成阶段（`FilmCompositor`）出现。实时就贴一张拍立得白边，
 * 用户会以为拍出来就是那样 —— 而负片的画幅里根本不可能有白边。
 *
 * 屏幕从上到下（全部按安全区避让）：
 *   ① 顶栏      画幅徽标 / 底片计数 / 设置      —— 玻璃，贴屏幕顶边
 *   ② 取景器    相机预览 + 镂空取景窗 + 对焦曝光层 + 悬浮胶囊行
 *   ③ 工具行    导入 / 重曝 / 定时 / 闪光灯 / 翻转
 *   ④ 核心区    相册缩略图 / 快门 / 胶卷抽屉入口  —— 玻璃，贴屏幕底边
 *
 * ⚠️ 取景器（②）是**绝对铺满整屏**的，不再夹在顶栏和控制台中间：相机的画面要一直
 * 延伸到灵动岛和 home indicator 底下，顶栏与控制台只是浮在它上面的两层玻璃。
 * 由此带来两条必须守住的规则，改动这一块之前先读：
 *   · `styles.preview` 在 JSX 里排在顶栏**之后**，而 RN 里后声明的兄弟节点画在上面 ——
 *     顶栏和控制台必须各自带 `zIndex`（`styles.overlayChrome`），否则会被画面整个盖掉；
 *   · 取景器自己不参与竖向布局（`position: 'absolute'`），所以 `styles.root` 要靠
 *     `justifyContent: 'space-between'` 才能把顶栏和控制台分别推到两端。
 * 另外两条是这一版新写进规格、必须遵守的：
 *   · 顶栏与控制台**都不许再画自己的分隔线**（原来是 `borderBottomWidth` /
 *     `borderTopWidth`），玻璃的边界由亮度差和折射环给，不该由画线给；
 *   · 两栏里原来垫的那层不透明材料（皮革底纹 `UI_ASSETS.leatherTile` 与
 *     `styles.panelPlate`）必须删干净，理由见渲染树里那段注释。
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
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { ColorValue, GestureResponderEvent, LayoutChangeEvent } from 'react-native';
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
import { DEFAULT_ZOOM, ZOOM_MAX, toCameraZoom } from '../constants/zoom';
import { describeError } from '../utils/describeError';
import { addShot } from '../utils/galleryStore';
import { computeFrameLayout } from '../utils/geometry';
import { importAndDevelop } from '../utils/importPhoto';
import { processAndSaveFilmPhoto } from '../utils/processFilmPhoto';
import { AlbumThumb } from './AlbumThumb';
import { DevelopOverlay, computeDevelopStageBox } from './DevelopOverlay';
import { DialButton } from './DialButton';
import { FilmCompositor } from './FilmCompositor';
import { FilmDrawer } from './FilmDrawer';
import { FocusExposure } from './FocusExposure';
import { FrameBadge } from './FrameBadge';
import { FrameSwitcher } from './FrameSwitcher';
import { GalleryScreen } from './GalleryScreen';
import { GLASS_TEXT_COLOR, LiquidGlassView } from './LiquidGlassView';
import { PermissionNotice } from './PermissionNotice';
import { SettingsScreen } from './SettingsScreen';
import { ShutterButton } from './ShutterButton';
import { ToolRow } from './ToolRow';
import { ViewfinderBar } from './ViewfinderBar';
import { ViewfinderWindow } from './ViewfinderWindow';
import type { FocusTarget } from './FocusReticle';
import type { TimerSeconds } from './ToolRow';
import type { ThemeInk } from '../constants/theme';
import type { ZoomStop } from '../constants/lenses';
import type { CapturedPhoto, DevelopStatus, Rect, Size } from '../types';

/** 画幅参考线四周留白：贴着屏幕边看不出画幅比，留一点才像取景框 */
const PREVIEW_PADDING = 10;

/** 取景器中央那枚 24pt 十字（手动对焦唯一的"画面中心"参照） */
const RETICLE = 24;

/**
 * 镂空取景窗顶部那行标签。写的是**参照画幅**（这块机器按 35mm 的视场标定），
 * 不是当前焦段 —— 当前焦段是变焦档位，读数在胶囊上，而且它每一档都在变。
 */
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
 * 开屏默认停在 1×那一档，也是捏合变焦的落脚档。
 *
 * 用 `id` 反查下标而不是写死数字：档位表现在有五档
 * （0.5× / 1× / 1.4× / 2× / 长焦），它是**语义顺序**而不是什么硬件寄存器顺序，
 * 往表里插一档，写死的 1 就会静默指到别的档上去。
 * `Math.max(0, …)` 兜住"找不到"（表被改空）的情况，退回第一档而不是 -1。
 */
const DEFAULT_STOP_INDEX = Math.max(
  0,
  ZOOM_STOPS.findIndex((stop) => stop.id === 'wide10'),
);

/** 定时档位顺序：关 → 3s → 10s */
const TIMER_STEPS: readonly TimerSeconds[] = [0, 3, 10];

/** 底部核心区左右两侧的拟物尺寸：比快门小一圈，视觉重心才在中间 */
const CORE_THUMB_SIZE = 46;
const CORE_ENTRY_SIZE = 46;

/**
 * 两枚玻璃按钮里那两幅纯 `View` 图形的边长。
 *
 * 写成常量而不是让图形自己撑满：`DialButton` 的盘子是 `size × size`，图形太满会贴着
 * 玻璃边缘，太小又会被盘子吃掉。38pt 的顶栏按钮配 18pt 图形、46pt 的核心区按钮配 22pt，
 * 都和它们各自盘子里的留白成同一个比例（约 0.47，与旧版 `size * 0.48` 的位图一致），
 * 这样将来改按钮尺寸时，两个数字摆在一起就能看出该一起动。
 */
const SETTINGS_GLYPH = 18;
const FILM_GLYPH = 22;

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

/*
 * 三分构图线（旧 `GuideGrid`）已删除。
 *
 * 它和 `ViewfinderWindow` 的九宫格是**同一件事的两种画法**：都在画幅窗口里切四刀。
 * 两者叠着渲染的话，线宽（hairline vs 1pt）和强度（主题色 ×0.6 vs 白色 0.28）
 * 都对不齐，同一个位置会出现两条虚影 —— 看起来就是"糊了"。
 * 所以保留镂空窗那一套（它和窗口边框、四角角标出自同一次绘制，强度天然一致），
 * 把设置页的"构图辅助线"开关直接接到 `ViewfinderWindow` 的 `grid` prop 上。
 */

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

/*
 * 顶栏与核心区那两枚按钮的图形。
 *
 * 都用纯 `View` 画，**不引入任何图片资源**：`DialButton` 的图标尺寸是 `size * 0.48`
 * （38pt 的按钮上只有 18pt 见方），这个尺寸下位图会被缩放糊掉一圈，而线框图形
 * 在任意尺寸都是 1pt 实线。这也和 `ToolRow` 里那五枚图标的画法统一。
 *
 * 坐标全部写成"画布比例"而不是绝对值：图标要在 38pt（顶栏）与 46pt（核心区）
 * 两种按钮上共用同一个函数，写死 18pt 的笔画在其中一边一定错位。
 * 颜色由外面传进来（`DialButton` 已经在禁用态上算好了），画法本身不管配色。
 */

/** 设置：三条长短不一的横线 + 三颗旋钮 —— "可调节"这件事最通用的图形语言 */
function SettingsGlyph({ size, color }: { size: number; color: ColorValue }) {
  const w = size;
  const h = size;
  const bar = Math.max(1, Math.round(h * 0.09));
  const knob = Math.max(2, Math.round(h * 0.19));
  // 轨道长度比例（0~1）：长短交错，一眼就知道是"几个各自可调的档位"而不是列表
  const tracks = [0.34, 0, 0.16];
  const knobs = [0.62, 0.26, 0.74];
  return (
    <View style={{ width: w, height: h, justifyContent: 'space-between', paddingVertical: h * 0.06 }}>
      {tracks.map((start, index) => (
        <View key={index} style={{ height: knob, justifyContent: 'center' }}>
          <View
            style={{
              position: 'absolute',
              left: w * start,
              right: 0,
              height: bar,
              borderRadius: bar / 2,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: Math.min(Math.max(w * knobs[index]! - knob / 2, 0), w - knob),
              width: knob,
              height: knob,
              borderRadius: knob / 2,
              backgroundColor: color,
            }}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * 胶卷抽屉：一个带齿孔的圆角矩形（35mm 暗盒的正面）。
 *
 * 为什么是"矩形 + 两侧齿孔"而不是别的：这枚按钮挨着底部的胶卷名（`preset.name`），
 * 用户要一眼看出"这里是换胶卷的地方"。齿孔是胶片区别于其他任何矩形（卡片、电池、票）
 * 的唯一特征；用半圆凹口画法反而会在 18pt 下缩成一排看不见的锯齿。
 * 齿孔用比边框更细的短横线，是"暗盒"而不是"打孔纸"。
 */
function FilmGlyph({ size, color }: { size: number; color: ColorValue }) {
  const w = size;
  const h = size * 0.78;
  const hairline = Math.max(1, Math.round(w * 0.07));
  const holeHeight = h * 0.14;
  return (
    <View
      style={{
        width: w,
        height: h,
        borderRadius: Math.max(2, w * 0.16),
        borderWidth: hairline,
        borderColor: color,
        justifyContent: 'space-around',
        paddingHorizontal: w * 0.16,
        paddingVertical: h * 0.16,
      }}
    >
      {[0, 1, 2].map((index) => (
        <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', height: holeHeight }}>
          <View style={{ width: w * 0.16, backgroundColor: color }} />
          <View style={{ width: w * 0.16, backgroundColor: color }} />
        </View>
      ))}
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
  /**
   * 一框多图相框（半格双联）的**第一格**：按下第一次快门后先存在这里，等第二格。
   *
   * 为什么存整个 `CapturedPhoto` 而不是只存 uri：冲印管道要按"原图的实际长宽比"
   * 选相框朝向、按原图尺寸算归一化目标（见 `processFilmPhoto` 第 2 步），
   * 只留一个 uri 的话第二格就得拿另一张照片的尺寸去蒙。
   */
  const [halfFrameBuffer, setHalfFrameBuffer] = useState<CapturedPhoto | null>(null);
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
  /**
   * 这个相框是不是"一框多图"（半格双联：左右两个 3:4 竖槽）。
   *
   * 判据**从相框数据推**，不许写死 `frame.id === 'half-frame'`：将来再加一款双联框
   * （竖版三格、2×2 四格）时，这里不用动一行。`FrameSpec.slots` 的类型是
   * `FrameSlot[] | undefined`，所以先判 `undefined` 再判长度。
   *
   * 为什么必须拦快门：合成层对"有槽位但没给第二张"的行为是**那一格留黑**
   * （`FilmCompositor.slotPhotoUri` 返回 null），于是第一次快门就能冲出一张
   * 右半边全黑的成片 —— 那看起来就是"坏了"，而不是"半格只用了一半"。
   */
  const needsTwoShots = frame.slots !== undefined && frame.slots.length >= 2;
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

  /**
   * 镂空取景窗要的坐标是**取景器容器**（`previewBox`）坐标系里的，这里把画布坐标搬过去。
   *
   * 三个量的关系（实测，别凭直觉改）：
   *   · `previewBox`（第 267 行那个 state）：取景器容器自己的实测尺寸，`handlePreviewLayout`
   *     从 `event.nativeEvent.layout` 写入 —— 它是**容器坐标系的原点与量程**；
   *   · `previewLayout`（第 323 行）：`computeFrameLayout(frame, previewBox - 2*PREVIEW_PADDING)`
   *     的结果，`previewLayout.width/height` 是**画布**尺寸，`previewLayout.window` 是画幅窗口
   *     相对**画布左上角**的位置（`geometry.ts` 里那个 `window` 就是这么算出来的）；
   *   · `frameOffset`（第 333 行）：`(previewBox - previewLayout) / 2` 取正 —— 画布在容器里
   *     居中摆放时左上角的落点，也就是**画布坐标系 → 容器坐标系**的平移量。
   *
   * 所以 `frameOffset + previewLayout.window` 才是"相对取景器容器"的窗口位置，
   * 正是 `ViewfinderWindow` 的 `window` prop 的契约（它按 `container.width - (left + width)`
   * 算右边界，交错了右边两块玻璃就直接飘到屏幕外）。
   * `<View style={styles.canvas}>` 那一层用的是 `frameOffset + previewLayout.width/height`
   * —— 同一套平移量，只是搬的是画布本身而不是窗口。
   */
  const viewfinderWindow = useMemo(
    () => ({
      left: frameOffset.left + previewLayout.window.left,
      top: frameOffset.top + previewLayout.window.top,
      width: previewLayout.window.width,
      height: previewLayout.window.height,
    }),
    [frameOffset.left, frameOffset.top, previewLayout.window],
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
    /*
     * 换相框时把半格缓存**静默**丢掉（不弹提示、不冲印）。
     *
     * 为什么必须丢：缓存里那张是给**上一个相框**的槽位拍的 —— 槽位的宽高比、
     * 位置都变了，拿它去填新相框的一格只会得到一张构图错的半格。
     * 为什么静默：这是用户自己的选择（滑了一下相框），不是错误，
     * 弹条提示等于拿一个"你刚才那张白拍了"去打断他。
     * 为什么清得干脆（而不是留到切回来）：留一个跨相框的隐藏状态，
     * 会出现"切回半格框，第一次快门直接出片"这种没人能预期的行为。
     */
    setHalfFrameBuffer(null);
  }, []);

  const handleBadgeFramePress = useCallback(() => {
    void Haptics.selectionAsync();
    setFrameIndex((current) => wrapIndex(current + 1));
    // 顶栏徽标点一下也是换相框，和左右滑动同一条规则：静默丢掉半格缓存
    setHalfFrameBuffer(null);
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

  const handleZoomChange = useCallback(
    (next: number) => {
      const quantized = toCameraZoom(next);
      /*
       * 捏合只在**主摄**上成立。
       *
       * `zoom` 的换算底数（`ASSUMED_MAX_ZOOM_FACTOR = 16`）是主摄的
       * `videoMaxZoomFactor`：超广角那支通常只有 2 上下，长焦又是另一个数，
       * 而且三支镜头的 native 焦距本来就不同。所以**同一个 `zoom` 值落在不同镜头上，
       * 是三种完全不同的放大倍率** —— 不把镜头先钉回主摄，捏合出来的画面就是随机的。
       *
       * 停在 0.5× / 长焦档上捏合时，先把档位落回主摄那一档，只改 `stopIndex` 与 `lens`，
       * **刻意不动 `zoom`** —— 下一行马上就会把这一帧的捏合值写进去。
       * - 不直接无视这次捏合：那会让五档里有两档的手势像坏了一样；
       * - 不调 `applyStop()`：它会把 `zoom` 归零，而 `usePinchZoom` 的基准是
       *   捏合开始那一刻的 `zoom`，中途归零会让接下来的每一帧都跳一下。
       */
      if (stop.lens !== 'wide') {
        const wideStop = ZOOM_STOPS[DEFAULT_STOP_INDEX];
        if (wideStop !== undefined) {
          setStopIndex(DEFAULT_STOP_INDEX);
          setLens(resolveStop(wideStop, { lenses, facing }).lens);
        }
      }
      setZoom(quantized);
    },
    [facing, lenses, stop.lens],
  );

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
   * 两条"要按两次才出片"的路径在这里分叉，**顺序不能换**：
   *
   * 1. **半格双联**（§五.3，`frame.slots` 至少两格）：第一次把底片存进
   *    `halfFrameBuffer`，第二次连同缓存一起冲印成左右两格。
   * 2. 重曝（§一.7）：开着重曝时第一次按快门只把照片存进 `pendingExposureUri`，
   *    **不冲印**；第二次才把两张一起交给合成器。
   *
   * 两条判据都是"按下时手上有没有上一张"（`halfFrameBuffer` / `pendingExposureUri`），
   * 而不是"这是第几次" —— 中途关掉重曝不该把半成品冲出去。
   * 半格必须排前面，理由见下面那条分支上的注释。
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

      /*
       * ---- 半格双联的第一格 ----
       *
       * 拦住这一张：只入缓存，**不冲印、不算曝光数**（`exposureCount` 是"已出片张数"，
       * 底片长卷、顶栏计数、EXP. 代号全读它；半格两格合起来才是 1 张成片）。
       * 这三件事必须一起做：漏了任一条，用户会在第一格就看见成片或看见计数 +1，
       * 而那张成片的右半边是黑的。
       */
      if (needsTwoShots && halfFrameBuffer === null) {
        setHalfFrameBuffer(captured);
        setStatus({ kind: 'idle' });
        // 不设 `notice`：`pendingExposureUri` 的提示是走横幅的，而这条提示要留在
        // 取景器里一直看得见（见下面 `halfFrameBuffer !== null` 那块），两条都弹会打架
        return;
      }

      /*
       * ---- 半格双联的第二格（同时挡掉重曝）----
       *
       * ⚠️ 顺序关键：这两条分支在重曝分支**之前**，所以"半格 + 重曝同时开着"时
       * 重曝被静默忽略。选这条规则的理由（为什么不是别的方案）：
       *
       * - 半格的两个槽是**并排**的，重曝是**叠在同一格**里的 —— 半格没有"往哪一格叠"
       *   的答案。合成层的规则是"重曝只叠在第一格上"（`FilmCompositor` 里
       *   `index === 0 && overlayUri !== null`），那正是半格框最不该有的东西：
       *   左半格是两次曝光的鬼影、右半格是单次曝光，一卷半格片里混进一格
       *   双重曝光的半格，用户看到只会觉得坏了。
       * - "开半格时禁掉重曝"要多改一处开关状态并解释为什么灯自己灭了；
       *   "半格优先"只在快门这一处分叉，用户拍的每一张都符合直觉。
       *
       * 代价（已知且接受）：重曝开关的灯还亮着，但它对半格框不生效。
       */
      if (needsTwoShots && halfFrameBuffer !== null) {
        const first = halfFrameBuffer;
        /*
         * **先拍的进左格、后拍的进右格。**
         *
         * 这张照片站在哪个槽位不是这里说了算的，是合成层写死的：
         * `FilmCompositor.slotPhotoUri(slotIndex, rawUri, secondUri)` 里
         * `slotIndex === 0 → rawUri`、`=== 1 → secondUri`；而 `half-frame` 的
         * `slots[0]` 窗口 x 更小（见 `src/constants/frames.ts`），就是**左格**。
         * 所以要让先拍的落在左格，先拍的必须是**主图** `photo`（→ `rawUri` → 左格），
         * 后拍的走 `secondUri`（→ 右格）。
         *
         * 用第一张当主图还有第二个理由：主图决定相框朝向与归一化尺寸
         * （`processFilmPhoto` 按它的长宽比算 `FrameLayout`）。用户构第一格的时候
         * 取景器里显示的就是这个相框，让它说了算才符合预期。
         */
        const result = await processAndSaveFilmPhoto({
          photo: first,
          frame,
          preset: effectivePreset,
          stage: stageBox,
          host: filmStage.host,
          place,
          locale: localeId,
          watermarkLayout: settings.watermarkLayout,
          placeDetail: settings.placeDetail,
          exposureIndex: exposureCount + 1,
          secondUri: captured.uri,
          onStage: (nextStage) => setStatus({ kind: 'developing', stage: nextStage }),
        });

        setStatus({ kind: 'done', uri: result.photo.uri, saved: result.save.ok });
        // 半格两格 = 1 张成片，所以只 +1
        setExposureCount((current) => current + 1);
        /*
         * 缓存必须在**冲印成功之后**才清：冲印抛错时它还在，用户可以直接补拍第二格。
         * 这就是"只存 uri"不够用的第二个理由 —— 缓存得完整到能重试。
         */
        setHalfFrameBuffer(null);
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
        return;
      }

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
    // 半格那两条分支读的就是这两个：漏了 `halfFrameBuffer`，第二次快门会看到
    // 第一帧的 `null`，于是把第二张又存一遍 —— 永远出不了片
    needsTwoShots,
    halfFrameBuffer,
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
      locationMode: settings.locationMode,
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
      {/*
        ① 顶栏：画幅徽标 + 底片计数 + 设置。闪光灯/翻转/相册都搬去了工具行与核心区。

        皮革底纹那一整块（`UI_ASSETS.leatherTile` 的 `resizeMode="repeat"`）已经删掉。
        理由：这块玻璃材质要能**采到它背后的画面**（`LiquidGlassView` 默认叠 75 强度的
        `BlurView`），底纹是一张完全不透明的平铺位图，铺在下面等于让模糊去采一块死平的布 ——
        那不是液态玻璃，那是一块塑料贴纸。屏幕的底色由 `styles.root` 的 `theme.body` 兜底。

        `styles.overlayChrome` 里的 `zIndex` 见文件头注释：取景器在 JSX 里排在后面。
      */}
      <LiquidGlassView
        radius={0}
        rim={false}
        style={[styles.topPanel, styles.overlayChrome, { paddingTop: insets.top + 4 }]}
      >
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
            glyph={(color) => <SettingsGlyph size={SETTINGS_GLYPH} color={color} />}
            active={settingsVisible}
            onPress={handleOpenSettingsScreen}
            accessibilityLabel={t('camera.settings.a11y')}
            size={38}
          />
        </View>
      </LiquidGlassView>

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

        {/*
          镂空取景窗是**取景器的直接子层**，故意不放进下面 `FrameSwitcher` 里。
          理由：`FrameSwitcher` 是个左右滑动的容器，镂空窗跟着它跑的话，滑到一半时
          四块玻璃的边界只盖住画幅宽度的一半，屏幕两侧会露出没被玻璃压住的实时画面 ——
          那就不再是"取景窗"而是一张会滑动的贴纸。它要始终铺满整个取景器。

          九宫格交给它的 `grid` prop（设置页那个"构图辅助线"开关直接接过来），
          本地那套 `GuideGrid` 已经删掉，理由见它原来所在的模块级注释。
        */}
        {previewBox.width > 1 && previewBox.height > 1 ? (
          <ViewfinderWindow
            window={viewfinderWindow}
            container={previewBox}
            label={GUIDE_LABEL}
            grid={resolved.showGuide}
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
              {/* 画幅参考线现在由上面那层镂空窗画：窗口边框 + 四角角标，都在同一次绘制里 */}
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

        {/* 半格双联：第一格已经进缓存，等第二格。和下面重曝那条同一种写法
            （不走 DevelopOverlay：那层会挡住取景器），常显不闪 —— 它是一条
            "现在还差一张"的状态读数，不是一次性的提示 */}
        {halfFrameBuffer !== null ? (
          <View
            style={styles.halfHint}
            pointerEvents="none"
            accessible
            accessibilityLabel={t('camera.half.hint')}
          >
            <View style={styles.focusHintChip}>
              <Text style={[styles.halfPlateText, { color: ink.amber }]} allowFontScaling={false}>
                {t('camera.half.plate')}
              </Text>
              <Text style={[styles.halfHintText, { color: ink.paper }]} allowFontScaling={false}>
                {t('camera.half.hint')}
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

      {/*
        ③ + ④ 控制台：工具行 + 核心区。齿轮/开关类的改动只脏这一块。

        和顶栏同一套处理：换玻璃、删皮革底纹与 `styles.panelPlate`。
        `paddingBottom` 依旧按 home indicator 让位 —— 玻璃要一直铺到屏幕最下沿，
        那圈安全区是玻璃自己的内边距，不是外面垫的一块留白。
      */}
      <LiquidGlassView
        radius={0}
        rim={false}
        style={[styles.console, styles.overlayChrome, { paddingBottom: Math.max(insets.bottom, 10) }]}
      >
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
              glyph={(color) => <FilmGlyph size={FILM_GLYPH} color={color} />}
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
      </LiquidGlassView>

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
    /*
     * 取景器绝对铺满之后，竖排里只剩顶栏与控制台两层，靠这个把它们顶到两端。
     * 少了它，两层会贴着排在上面、底下留一大片空白（`position: 'absolute'` 的那层
     * 不参与 flex 分配，中间那条"撑开"的余量得由 `space-between` 自己造）。
     */
    root: { flex: 1, justifyContent: 'space-between' },
    fill,
    topPanel: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingBottom: 9,
      overflow: 'hidden',
    },
    topActions: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
    filmCounter: {
      minWidth: 42,
      marginRight: 10,
      textAlign: 'right',
      fontFamily: UI_MONO,
      fontSize: 10,
      letterSpacing: 0.8,
    },
    preview: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      overflow: 'hidden',
      // 权限未给或相机还没上屏时兜一块近黑：玻璃压在半透明底色上比压在纯黑上更像玻璃
      backgroundColor: '#0A0A0B',
    },
    previewCovered: { opacity: 0 },
    /*
     * 浮在画面之上的两层玻璃（顶栏 / 控制台）必须抬到取景器上面。
     *
     * RN 里同级兄弟是**按声明顺序**画的，`styles.preview` 在 JSX 里排在顶栏之后，
     * 不加这个 `zIndex` 的话相机会把两栏整个盖住 —— 而它俩还得能点（快门、设置、胶卷）。
     * 取景器自己是 `position: 'absolute'`，两者都不带 `elevation`（那是 Android 的事），
     * 所以这一个 `zIndex` 就是全部的层级依据。
     */
    overlayChrome: { zIndex: 2 },
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
    /*
     * 半格提示固定在重曝提示**下面**一条（top 26 vs 54），而不是复用同一个位置：
     * 两者虽然被"半格优先"这条规则挡住、不会同时显示（见 `handleShutter`），
     * 但把它们叠在同一坐标上，将来任何一次规则调整都会直接变成两块字压在一起。
     * 竖直排列顺序也正好对应"半格优先"。
     */
    halfHint: { position: 'absolute', left: 0, right: 0, top: 54, alignItems: 'center' },
    halfPlateText: { fontFamily: UI_MONO, fontSize: 12, letterSpacing: 1.6 },
    halfHintText: {
      fontFamily: UI_MONO,
      fontSize: 10,
      letterSpacing: 0.8,
      marginTop: 2,
      opacity: 0.75,
    },
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
      /*
       * 这里原本有一条贴着屏幕上边缘方向的 1pt 分隔线，已删。
       *
       * 它的作用只是"把控制台和上面的画面分开"，而现在这层玻璃自己就有边界：
       * 上下两条 1px 硬边线会把玻璃框成一个矩形面板，恰好把"材质浮在画面之上"这件事
       * 破坏掉 —— 玻璃的边界应该由亮度差和折射环给，不该由画线给。
       * （顶栏同理：靠屏幕边缘那条线更是没意义。）
       */
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
