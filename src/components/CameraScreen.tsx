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

import type { MessageKey } from '../i18n';
import { useI18n } from '../i18n';
import { useFilmFonts } from '../hooks/useFilmFonts';
import { useFilmStage } from '../hooks/useFilmStage';
import { useLocationStamp } from '../hooks/useLocationStamp';
import { usePhysicalShutter } from '../hooks/usePhysicalShutter';
import { usePinchZoom } from '../hooks/usePinchZoom';
import { useSettings } from '../hooks/useSettings';
import { DEFAULT_FRAME_ID, FRAMES, findFrameIndex, wrapIndex } from '../constants/frames';
import { applyGrainLevel, findGrainLevelIndex, grainLevelAt } from '../constants/grain';
import {
  ASSUMED_LENS_NATIVE_MM,
  ZOOM_STOPS,
  factorToZoom,
  pickDefaultLens,
  pickTelephotoLens,
  pickUltraWideLens,
  resolveStop,
  zoomToFactor,
} from '../constants/lenses';
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
import { ParameterScrubBar, focalStopIndex } from './ParameterScrubBar';
import { PermissionNotice } from './PermissionNotice';
import { SettingsScreen } from './SettingsScreen';
import { ShutterButton } from './ShutterButton';
import { ToolRow } from './ToolRow';
import { ViewfinderWindow } from './ViewfinderWindow';
import type { FocusTarget } from './FocusReticle';
import type { FlashMode, TimerSeconds } from './ToolRow';
import type { ThemeInk } from '../constants/theme';
import type { ZoomLensRole, ZoomStop } from '../constants/lenses';
import type { CapturedPhoto, DevelopStatus, Size } from '../types';

/** 画幅参考线四周留白：贴着屏幕边看不出画幅比，留一点才像取景框 */
const PREVIEW_PADDING = 10;

/**
 * 镂空取景窗顶部那行标签。写的是**参照画幅**（这块机器按 35mm 的视场标定），
 * 不是当前焦段 —— 当前焦段是变焦档位，读数在胶囊上，而且它每一档都在变。
 */
const GUIDE_LABEL = '35mm';

/**
 * 闪光灯的三档循环顺序：关 → 开 → 自动 → 关。
 *
 * 顺序不是随便排的：关和开是最常用的两档，放在最前面保证**一次点击**就能在
 * "不闪 / 强闪"之间来回；自动要绕两下才回到关，代价最小。
 */
const FLASH_CYCLE: readonly FlashMode[] = ['off', 'on', 'auto'];

/**
 * 档位 → 状态文案的键。同一个串既当按钮的无障碍标签，也当浮在取景器顶部的那句提示
 * —— 两处必须逐字一致，否则读屏念的和眼睛看到的会对不上。
 *
 * `satisfies` 而不是类型标注：既要 `Record<FlashMode, MessageKey>` 保证**三档一个不漏**，
 * 又要保留字面量类型，`t()` 才收得下。
 */
const FLASH_STATE_KEY = {
  off: 'camera.flash.state.off',
  on: 'camera.flash.state.on',
  auto: 'camera.flash.state.auto',
} satisfies Record<FlashMode, MessageKey>;

/**
 * 瞬态提示的停留时长。0.8 秒是用户指定的值：够看清"闪 / 不闪 / 自动"，又不至于
 * 在连续切档时几句话叠在一起。
 */
const FLASH_HINT_MS = 800;

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
 * 悬浮胶囊行与控制台上沿之间的间距。
 *
 * 10pt 是"看得出是两层、又不像断开"的距离：再小两颗胶囊会和工具行图标粘成一块，
 * 再大就飘到取景画面中央去了。真正的 `bottom` 是 `consoleHeight + 这个值`。
 */
const BAR_LAYER_GAP = 10;

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

/*
 * 取景器里的 `chrome` 静态几何表（四角括号 + 中央十字）已删除。
 *
 * 它画的是"画幅窗口的四角 + 中心"，而这两样现在都由 `ViewfinderWindow` 负责：
 *   · 四角的 L 型角标：窗口自己那套是 2pt 纯白 + 92% 不透明，比这里的
 *     `hairline` + `ink.paperFaint` 在实时画面上清楚得多，两套叠着画还会在
 *     切画幅的弹簧动画期间错开（这里硬跳、那里在弹），看起来像角标在滑；
 *   · 中心十字：搬进了窗口那一层的**内部**，于是天然跟着窗口一起弹，
 *     不再需要在这里单独定位。
 * 跟着它一起消失的还有 `chrome.layer` / `chrome.reticle*` / `RETICLE`。
 */

/*
 * 三分构图线（旧 `GuideGrid`）已删除。
 *
 * 它和 `ViewfinderWindow` 的九宫格是**同一件事的两种画法**：都在画幅窗口里切四刀。
 * 两者叠着渲染的话，线宽（hairline vs 1pt）和强度（主题色 ×0.6 vs 白色 0.28）
 * 都对不齐，同一个位置会出现两条虚影 —— 看起来就是"糊了"。
 * 所以保留镂空窗那一套（它和窗口边框、四角角标出自同一次绘制，强度天然一致），
 * 把设置页的"构图辅助线"开关直接接到 `ViewfinderWindow` 的 `grid` prop 上。
 */

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
  /**
   * 闪光灯三档，取值直接就是 `CameraView` 的 `flash` prop 域。
   *
   * 为什么不是 `boolean`（旧版就是）：expo-camera 的 `flash` 本来就吃
   * `'off' | 'on' | 'auto'`（`node_modules/expo-camera/build/Camera.types.d.ts:17`），
   * 把"自动"压掉等于白丢一档 —— 而自动恰恰是白天/夜里来回跑时最省事的那一档。
   * 注意**新架构下 prop 名是 `flash` 而不是旧的 `flashMode`**（同文件 `:324`）。
   */
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  /**
   * 切换闪光灯后浮在取景器顶部的那句话，0.8 秒后自己消失。`null` = 不显示。
   *
   * 存**档位本身**而不是渲染好的字符串：`t()` 依赖当前语言，把成品字符串写进 state
   * 会在切换语言后留一句旧语言的话。渲染时再 `t()`，语言一变它跟着变。
   */
  const [flashHint, setFlashHint] = useState<FlashMode | null>(null);
  /** 直接就是 `CameraView` 的 zoom 值（0~1 归一化），捏合与档位都往这里写 */
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);
  const [stopIndex, setStopIndex] = useState(DEFAULT_STOP_INDEX);
  /**
   * 刻度尺搓出来的**连续**焦段（读数 + 当前真正挂着的那支镜头）。
   *
   * 为什么另开一份 state，而不是只把 `stopIndex` 对齐到最近的档：`stopIndex` 是"档位"
   * （五个固定值），而搓出来的读数是**连续**的；13~26mm 那一段尤其致命 —— 读数是 20mm
   * （超广角数字变焦）时它最近的档是 `wide10`（`stop.lens === 'wide'`），于是拿档位反推
   * 读数会算出 `26mm × 1.54 = 40mm`，胶囊上直接显示一个用户从没拧到过的数字。
   * 所以"读数/镜头"由这里说了算，"档位"只负责给短按循环定位。
   * 五个固定档被点选（`applyStop`）、捏合（`handleZoomChange`）、换前后摄
   * （`handleFlipCamera`）时都要清回 `null`，让那三条路各自的口径重新生效。
   */
  const [scrubFocal, setScrubFocal] = useState<{ readonly mm: number; readonly role: ZoomLensRole } | null>(null);
  const [lenses, setLenses] = useState<readonly string[]>([]);
  const [lens, setLens] = useState<string | undefined>(undefined);
  const [exposureCount, setExposureCount] = useState(0);
  const [focusTarget, setFocusTarget] = useState<FocusTarget>(null);
  const [focusSeen, setFocusSeen] = useState(false);
  const [exposure, setExposure] = useState(0);
  /**
   * 色温刻度尺拧出来的**临时**色温覆盖（−1 ~ +1）。
   *
   * 为什么要单独一份 state 而不是直接改 `preset`：预设是"这卷胶片的本色"，是数据；
   * 手感旋钮只是**这一轮取景**的临时倾向，改数据会让"换卷"失去意义（用户下次进来
   * 发现胶卷默认值被自己上次拧歪了）。所以覆盖只活在本次会话里，且：
   *   · `null` = 没有覆盖，用胶卷自带的色温；
   *   · `0` = **合法的覆盖值**（中性），不等于"没覆盖" —— 不能拿 0 当"空"用，
   *     否则用户把色温拧到 0 会被理解成"恢复胶卷默认"，读数当场跳回 +0.28；
   *   · 换卷（`handleFilmDrawerSelect`）时清回 `null`，这是唯一的"复位"入口。
   */
  const [temperatureOverride, setTemperatureOverride] = useState<number | null>(null);
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
  /**
   * 底部控制台实测高度。
   *
   * 为什么非量不可：控制台在 `root` 的 flex 流里（占屏幕底部），而取景器
   * `styles.preview` 是**铺满全屏的绝对定位层**。悬浮胶囊行是取景器的子层，
   * 它的 `bottom` 因此在"屏幕底"和"控制台上沿"之间失去参照 —— 写死任何数字
   * 都只对一种机型成立（灵动岛机型、SE、横屏各差几十点）。量出来再加间距，
   * 胶囊才会永远恰好浮在控制台上方。
   */
  const [consoleHeight, setConsoleHeight] = useState(0);
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
  /**
   * 真正拿去冲印/导入的预设 = 胶卷本色 + 刻度尺拧出来的临时色温覆盖。
   *
   * 为什么新加一层而不是就地改 `effectivePreset`：`applyGrainLevel`（设置项）与
   * "用户拧色温"（手势）是两条互不相干的链路，各占一层，谁也不会把对方抹掉，
   * 将来再加"临时对比度"之类的旋钮也是同一个插槽。`color` 必须**整块展开复制**：
   * `preset.color` 是 `PRESETS` 里的共享对象，就地改会污染常量表（下次启动还是被改过的值）。
   *
   * 只有成片链路读它（快门 3 处 + 导入 1 处）。取景器的实时预览不跑 `buildGradeLayers`，
   * 所以覆盖是"按下快门才生效"，不会把预览画面染色 —— 这同时也意味着覆盖值**不必**
   * 每帧进 state 才算对，25ms 节流上报的那一版就是最终版本。
   */
  const gradedPreset = useMemo(() => {
    if (temperatureOverride === null) {
      return effectivePreset;
    }
    return {
      ...effectivePreset,
      color: { ...effectivePreset.color, temperature: temperatureOverride },
    };
  }, [effectivePreset, temperatureOverride]);
  const resolved = useMemo(() => resolvePreset(gradedPreset), [gradedPreset]);
  const frameName = frame.nameKey !== undefined ? t(frame.nameKey) : frame.name;
  const developing = status.kind === 'developing';
  const cameraGranted = cameraPermission?.granted === true;
  const interactive = !developing && cameraGranted;
  const lensesKnown = lenses.length > 0;
  const stop: ZoomStop = ZOOM_STOPS[stopIndex] ?? ZOOM_STOPS[DEFAULT_STOP_INDEX];
  // 焦段读数按"这颗镜头的原生等效焦距 × 当前变焦倍数"算：JS 读不到真实焦距，
  // 用的是 `ASSUMED_LENS_NATIVE_MM` 里的假定值，捏合变焦时它也跟着连续变。
  // 刻度尺搓过之后（`scrubFocal`）由搓出来的读数直接说了算 —— 理由见那份 state 的注释
  const focalMm = scrubFocal?.mm ?? Math.round(ASSUMED_LENS_NATIVE_MM[stop.lens] * zoomToFactor(zoom));
  /** 当前**实际**挂着的镜头：优先信搓动记录，其次信档位。它同时是刻度尺的死区记忆初值。 */
  const focalRole: ZoomLensRole = scrubFocal?.role ?? stop.lens;
  /**
   * 刻度尺焦段轴的低端：这台机器**当前这一面**够不够得到超广角。
   *
   * 判据直接从 `ZOOM_STOPS` 里那支 0.5× 档问 `resolveStop`，不自己调 `pickUltraWideLens`
   * 再判空：档位可不可用是 `lenses.ts` 早就定好的口径（挑不出镜头就 `available: false`，
   * 且**刻意不退化**成默认镜头），照抄一份只会在将来改规则时对不上。
   * `!lensesKnown` 时按"够得到"放行，与 `handleCycleFocal` 的 `!lensesKnown || ...` 同一约定：
   * 镜头列表还没回来就先别把用户的手限制住。
   *
   * 为什么需要这个数：没有超广角时相机的 `zoom` 不可能小于 1，主摄最小就是 26mm，
   * 于是焦段尺必须在 26mm 处**硬停**——若还留着 13mm 那一段，用户会拖出一整段
   * 读数在变、画面不动的死区。
   */
  const ultraWideStop = ZOOM_STOPS.find((candidate) => candidate.lens === 'ultraWide');
  const focalMinMm =
    ultraWideStop === undefined || !lensesKnown || resolveStop(ultraWideStop, { lenses, facing }).available
      ? ASSUMED_LENS_NATIVE_MM.ultraWide
      : ASSUMED_LENS_NATIVE_MM.wide;
  /**
   * 刻度尺焦段轴的高端：这台机器**当前这一面**有没有可用的长焦。
   *
   * 与 `focalMinMm` 是同一套判据，但**返回 `undefined` 而不是退到 52mm**：低端退到 26mm
   * 是因为主摄一定存在（那是个安全的下界），高端却没有"一定存在的上界"——52mm 那档是
   * 主摄上的数码裁切，不是物理长焦。若在这里假装有长焦，用户点下去会切镜头失败。
   * 所以口径是"宁缺勿错"：判不出来就只给 13/26/35/52 四档，分段条自己少画一格。
   * `!lensesKnown` 时按"够得到"放行，与 `focalMinMm` / `handleCycleFocal` 同一约定。
   */
  const telephotoStop = ZOOM_STOPS.find((candidate) => candidate.lens === 'telephoto');
  const focalMaxMm =
    telephotoStop === undefined || !lensesKnown || resolveStop(telephotoStop, { lenses, facing }).available
      ? ASSUMED_LENS_NATIVE_MM.telephoto
      : undefined;

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
   * 正是 `ViewfinderWindow` 的 `window` prop 的契约（它自己的四块遮罩只认这个矩形的
   * 四条边，右/下两条用 `right: 0` / `bottom: 0` 补，所以传进来的矩形必须是
   * **容器坐标系**的 —— 传画布坐标会让取景框整体偏出去）。
   * `<View style={styles.canvas}>` 那一层（v1.5.1 已随 `FocusBrackets` 一起删除）用的是
   * `frameOffset + previewLayout.width/height` —— 同一套平移量，只是搬的是画布本身而不是窗口。
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
     * 对焦框必须清掉。它显示的是"上一次点击的落点"，而这个落点是按**上一个相框**
     * 的归一化坐标算的 —— 换了相框，镂空窗的位置和大小都变了，同一个归一化坐标会落到
     * 完全不同的地方。真机实测：不清的话黄框会僵在旧位置上，直到用户再点一下画面。
     * 这和"切镜头都要归位"是同一条规矩（见 `handleFlipCamera`）。
     *
     * （这里原来还有一句"静默丢掉半格缓存"：半格框下线后缓存本身没了，那句一起删。）
     */
    setFocusTarget(null);
  }, []);

  const handleBadgeFramePress = useCallback(() => {
    void Haptics.selectionAsync();
    setFrameIndex((current) => wrapIndex(current + 1));
    // 顶栏徽标点一下也是换相框，和左右滑动同一条规则：清掉对焦框
    setFocusTarget(null);
  }, []);

  const handleFlipCamera = useCallback(() => {
    // 翻转是机械动作 → Light。换镜头的同时焦段、对焦点、底片计数都要归位，
    // 否则前摄会继承后摄的档位，拍出来跟读数对不上
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
    setFlashMode('off');
    // 瞬态提示也要一起抹掉：留着的话翻到前摄后还会飘一句"闪光灯 · 開啟"，
    // 而前摄根本没有闪光灯 —— 那句话会变成假信息
    setFlashHint(null);
    setZoom(DEFAULT_ZOOM);
    setLens(undefined);
    setLenses([]);
    setFocusTarget(null);
    setExposureCount(0);
    setStopIndex(DEFAULT_STOP_INDEX);
    // 换镜头等于换了一支光学系统，搓出来的读数一律作废
    setScrubFocal(null);
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
       *
       * 判据用 `focalRole`（实际挂着的镜头）而不是 `stop.lens`：刻度尺搓到 20mm 时档位
       * 已经被对齐到 `wide10`，但物理上留在超广角上 —— 那时捏合如果信档位，就会拿主摄的
       * 变焦底数去算超广角的画面。
       */
      if (focalRole !== 'wide') {
        const wideStop = ZOOM_STOPS[DEFAULT_STOP_INDEX];
        if (wideStop !== undefined) {
          setStopIndex(DEFAULT_STOP_INDEX);
          setLens(resolveStop(wideStop, { lenses, facing }).lens);
        }
      }
      // 捏合也是"另一种改焦段的方式"，读数从此由 `zoom` 说了算
      setScrubFocal(null);
      setZoom(quantized);
    },
    [facing, focalRole, lenses],
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
      // 档位是"离散的权威"：点了档，搓出来的读数就该让位给档位
      setScrubFocal(null);
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

  /**
   * 色温刻度尺改值。25ms 一次的写入点就在这里（见 `ParameterScrubBar` 的
   * `EMIT_INTERVAL_MS`）—— 它是本项目唯一一条"手势直接写顶层 state"的路径，
   * 所以刻意做得极薄：只 `setState`，不碰相机、不做换算。
   */
  const handleTemperatureChange = useCallback((next: number) => {
    setTemperatureOverride(next);
  }, []);

  /**
   * 焦段刻度尺改值：把"读数 + 镜头 + 真实倍率"落到相机上。
   *
   * 三件事必须**一起**做完，不能拆成两次 `setState` 分给别处：镜头与倍率是两个独立的
   * `CameraView` prop，中间任何一帧的错配都会让原生侧真的按错组合去配会话（画面闪黑）。
   * React 18 会把同一事件里的多次 `setState` 合并成一次提交，所以这里三个 setter 是安全的。
   *
   * 为什么不复用 `applyStop()`：那个函数是给"点档位跳转"用的，它会按 `ZOOM_STOPS` 里的
   * 固定 `zoom` 取值（每个磁吸档一个数），而搓动给出的是**连续**倍率；而且它还会触发
   * `lensScale` 弹一下——那是"换档"的动效，搓动时每帧弹一次会变成抖。所以这里直接写
   * `zoom`，只把 `stopIndex` 对齐到最近的标准位（让焦段胶囊的短按循环能从搓到的位置接着走）。
   *
   * 用 `factorToZoom()` 而不是自己写 `log16`：那是 `lenses.ts` 里唯一的换算口径，
   * 与 `ZOOM_STOPS`/捏合变焦共用，保证"搓到 52mm"和"点 2× 档"落在同一个 `zoom` 上。
   */
  const handleFocalScrub = useCallback(
    (nextFocalMm: number, role: ZoomLensRole, factor: number) => {
      if (role === 'ultraWide' && lensesKnown && pickUltraWideLens(lenses) === null) {
        // 这台机器没有超广角（SE / 模拟器 / 前摄）：读数已经被上层钳在 26mm 以上，
        // 这里再兜一次底，避免把 `selectedLens` 清成 undefined 导致原生换成默认镜头
        return;
      }
      setLens(
        role === 'ultraWide'
          ? pickUltraWideLens(lenses) ?? undefined
          : role === 'telephoto'
            ? pickTelephotoLens(lenses) ?? undefined
            : pickDefaultLens(lenses) ?? undefined,
      );
      setZoom(factorToZoom(factor));
      setStopIndex(focalStopIndex(nextFocalMm));
      // 读数以搓出来的连续值为准（而不是拿档位反推），理由见 `scrubFocal` 的注释
      setScrubFocal({ mm: nextFocalMm, role });
    },
    [lenses, lensesKnown],
  );

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

  /**
   * 闪光灯三档循环。前摄没有闪光灯，直接吞掉这次点击（按钮那边也是灰的）。
   *
   * 为什么在**这里**算 next，而不是写 `setFlashMode(c => ...)` 的纯更新式：
   * 提示语要跟着同一档一起变，而 React 在严格模式下会把更新函数跑两遍 ——
   * 把 `setFlashHint` 写在更新函数里就会变成"副作用执行两次"。读当前 state 现算最直白。
   */
  const handleCycleFlash = useCallback(() => {
    if (facing !== 'back') {
      return;
    }
    void Haptics.selectionAsync();
    const at = FLASH_CYCLE.indexOf(flashMode);
    const next = FLASH_CYCLE[(at + 1) % FLASH_CYCLE.length] ?? 'off';
    setFlashMode(next);
    setFlashHint(next);
  }, [facing, flashMode]);

  /**
   * 0.8 秒后收掉那句提示。
   *
   * 用 `flashHint` 本身当依赖：连续切档时 `'on' → 'auto'` 会换一个新引用，
   * effect 重跑（cleanup 清掉上一支计时器）→ 计时从**最后一次点击**重新开始。
   * 这正是想要的："每点一次，提示再活 0.8 秒"。
   */
  useEffect(() => {
    if (flashHint === null) {
      return;
    }
    const timer = setTimeout(() => setFlashHint(null), FLASH_HINT_MS);
    return () => clearTimeout(timer);
  }, [flashHint]);

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
    /*
     * 换卷 = 回到这卷自己的本色：把刻度尺拧出来的临时色温覆盖清掉。
     *
     * 为什么复位放在这儿而不是"再搓回原值就自动清"：色温的覆盖值可以是 0（中性），
     * 而 0 和"没有覆盖"在读数和画面上都不同 —— 靠值本身回推"用户是不是想恢复"
     * 永远会猜错。换卷是一个语义明确的动作，借它当复位入口既不占新手势，
     * 也符合直觉：换了一卷，上一卷的临时调整跟着走。
     */
    setTemperatureOverride(null);
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
   * 只剩一条"要按两次才出片"的路径：重曝（§一.7）—— 开着重曝时第一次按快门
   * 只把照片存进 `pendingExposureUri`，**不冲印**；第二次才把两张一起交给合成器。
   *
   * 判据是"按下时手上有没有上一张"（`pendingExposureUri`），而不是"这是第几次" ——
   * 中途关掉重曝不该把半成品冲出去。
   *
   * 半格双联（`frame.slots` 至少两格）那条分支已随 v1.6.1 精简相框库**整条删除**：
   * 那款相框下线后，全仓库再没有任何相框带 `slots`。**这个文件里现在既没有
   * `needsTwoShots` 也没有 `halfFrameBuffer`，两个名字都已经不存在了**（不是"恒为 false"）
   * —— 一起被带走的还有"半格两格只 +1 曝光数"的特例，以及"半格优先于重曝"这条规则：
   * 那条规则的前提是"两个并排槽位里不知道该往哪一格叠重曝"，现在这个前提不存在了，
   * 所以重曝恢复成对所有相框一视同仁。
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
    // 依赖写 `gradedPreset` 而不是 `effectivePreset`：色温覆盖一变，这个回调必须拿到
    // 新的预设，否则"拧完色温立刻按快门"会冲印出上一版色温（回调被 useCallback 冻住）
    gradedPreset,
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
      preset: gradedPreset,
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
    // 同快门那处：导入也要用"含临时色温覆盖"的那一版预设
    gradedPreset,
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
              /*
                前摄没有硬件闪光灯，一律按 'off' 下发：`flashDisabled` 只是把按钮画灰，
                真正决定硬件行为的是这里。三档原样透传，'auto' 就是原生测光那一档。
                注意这里是 **JSX 属性位置**，注释必须写成裸块注释（本行上下这两行的形式）；
                写成花括号包起来的 JSX 注释会被解析器当成展开语法，报 TS1005。
              */
              flash={facing === 'back' ? flashMode : 'off'}
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
            {/*
              这里原本还有一个 `styles.canvas` 的绝对定位空层，装的是 `FocusBrackets`。
              它已经删掉（四角 + 中心十字都归了 `ViewfinderWindow`），所以这一层也一起撤了 ——
              留一个没有任何子节点、只为"占个位置"的 View，只会让后来的人以为它还有用。
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

        {/* 坐标按整个取景器归一化，跟 Tap 手势层对齐；`bounds` 再把框和滑条关进镂空窗 */}
        <FocusExposure
          target={focusTarget}
          width={Math.max(previewBox.width, 1)}
          height={Math.max(previewBox.height, 1)}
          bounds={viewfinderWindow}
          exposure={exposure}
          onExposure={handleExposureChange}
          onIdle={handleFocusIdle}
        />

        {/*
          闪光灯档位的瞬态提示：取景框**顶部中央**，0.8 秒后自己消失（`FLASH_HINT_MS`）。
          `pointerEvents="none"` 是必须的 —— 它盖在实时画面上，不关掉命中测试就会把
          点对焦的那一下吞掉。`accessibilityLiveRegion="polite"` 让读屏也念一遍：
          视力用户看这行字，读屏用户靠它知道档位变了。
        */}
        {flashHint !== null ? (
          <View
            style={[styles.flashHint, pendingExposureUri !== null ? styles.flashHintTucked : null]}
            pointerEvents="none"
            accessible
            accessibilityLiveRegion="polite"
          >
            <View style={styles.focusHintChip}>
              <Text style={[styles.flashHintText, { color: ink.amber }]} allowFontScaling={false}>
                {t(FLASH_STATE_KEY[flashHint])}
              </Text>
            </View>
          </View>
        ) : null}

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

        {/*
          悬浮胶囊行。它的 `bottom` **必须**跟着控制台的高度走 —— 见 `barLayer` 的注释。
          `consoleHeight` 为 0（首帧还没量到）时退回 0，胶囊会被控制台挡住一帧，
          比"先停在屏幕底再跳上来"更不容易被看见。
        */}
        <View
          style={[styles.barLayer, { bottom: consoleHeight + BAR_LAYER_GAP }]}
          pointerEvents="box-none"
        >
          {/*
            三颗胶囊**无条件渲染**：`ParameterScrubBar` → `ViewfinderBar` 里没有任何
            "镜头列表为空就把变焦胶囊藏起来"的门控（本轮逐行核实过）。上一轮那份报告
            把"胶囊看不见"归因于 `availableLenses` 为空 —— 那是**误诊**，真实原因未定
            （本轮没有真机，无法复现）。所以这里不许补任何可用性门控：镜头列表回来之前
            （`lenses` 为空）也该看得见胶囊，藏起来只会让同一个 bug 换个形式复发。
          */}
          <ParameterScrubBar
            temperature={resolved.color.temperature}
            focalMm={focalMm}
            exposure={exposure}
            focalRole={focalRole}
            focalMinMm={focalMinMm}
            focalMaxMm={focalMaxMm}
            onTemperature={handleTemperatureChange}
            onFocal={handleFocalScrub}
            onExposure={handleExposureChange}
            onCycleFocal={handleCycleFocal}
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
        onLayout={(event) => setConsoleHeight(event.nativeEvent.layout.height)}
        style={[styles.console, styles.overlayChrome, { paddingBottom: Math.max(insets.bottom, 10) }]}
      >
        <ToolRow
          doubleExposure={doubleExposure}
          timerSeconds={timerSeconds}
          flashMode={flashMode}
          flashDisabled={facing !== 'back'}
          busy={developing}
          onImport={handleImportPress}
          onToggleDouble={handleToggleDouble}
          onCycleTimer={handleCycleTimer}
          onCycleFlash={handleCycleFlash}
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
     *
     * ⚠️ 这个 2 是**全局层级阶梯**里的一格，加新的浮层时请接着往下排，别就地拍一个数：
     *   2  = 顶栏 / 控制台（本文件 `overlayChrome`）
     *   10 = 底片抽屉（`FilmDrawer`，见那边的注释）
     *   20 = 冲印进度遮罩（`DevelopOverlay`）
     *   30 = 相册页 / 设置页
     *   40 = 相册页里的"冲印中"遮罩
     *   50 = 全屏提示遮罩（本文件 `noticeLayer`）
     * 漏掉 `zIndex` 的浮层会被**任何一个**带 `zIndex` 的兄弟压住，哪怕它声明得更晚 ——
     * 真机实测报的"抽屉被快门栏挡住"就是 `FilmDrawer` 漏了这一格。
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
    // 闪光灯的瞬态提示和重曝的轻提示钉在同一个高度（都在取景框顶部中央），
    // 两句同时活着时把闪光灯这句往下让一行 —— 多一次位置判断，好过两行字叠成一团糊
    flashHint: { position: 'absolute', left: 0, right: 0, top: 26, alignItems: 'center' },
    flashHintTucked: { top: 54 },
    flashHintText: { fontFamily: UI_MONO, fontSize: 10, letterSpacing: 0.8 },
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
    /*
     * 胶囊行贴控制台上沿悬浮。
     *
     * ⚠️ 这里**故意不写 `bottom`** —— 它在 JSX 里由 `consoleHeight + BAR_LAYER_GAP` 现算。
     * 本层是 `styles.preview` 的子层，而 `preview` 在上一版被改成"铺满全屏的绝对定位层"，
     * 于是任何写死的 `bottom` 都从"距控制台上沿"变成了"距屏幕底"：写 12 会让整排胶囊
     * 藏进控制台的玻璃面板**背后**（真机实测报的"胶囊栏完全消失"就是这一条）。
     * 改全屏之前 preview 的底边正好压在控制台上沿，所以那个 12 当时是对的。
     */
    barLayer: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
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
    /*
     * 全屏提示遮罩。`zIndex: 50` 是**层级阶梯的最高一格**，理由有两条：
     *   1. 它是一层压暗整屏的蒙版，被任何东西盖住都会显得"屏幕脏了一块"；
     *   2. 它声明在相册页（30）**之前**，而 RN 里 `zIndex` 压过声明顺序 ——
     *      不给数字的话，顶栏和控制台（2）都会浮在这层蒙版上面。
     */
    noticeLayer: {
      ...fill,
      zIndex: 50,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: scheme === 'dark' ? 'rgba(0,0,0,0.72)' : 'rgba(236,236,232,0.86)',
    },
  });
}
