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
  AppState,
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
import { CAPTURE_QUALITIES, findCaptureQualitySpec, resolveCaptureLongEdge } from '../constants/captureQuality';
import { DEFAULT_FRAME_ID, FRAMES, findFrameIndex, resolveFrame, wrapIndex } from '../constants/frames';
import { applyGrainLevel, findGrainLevelIndex, grainLevelAt } from '../constants/grain';
import {
  ASSUMED_LENS_NATIVE_MM,
  TELEPHOTO_FOCAL_STOP,
  ZOOM_STOPS,
  factorToZoom,
  pickDefaultLens,
  pickTelephotoLens,
  pickUltraWideLens,
  resolveStop,
  zoomToFactor,
} from '../constants/lenses';
import { DEFAULT_PRESET_ID, PRESETS, findPresetIndex, resolvePreset } from '../constants/presets';
import { DARK_THEME, ThemeScope, UI_MONO } from '../constants/theme';
import { DEFAULT_ZOOM, ZOOM_MAX, toCameraZoom } from '../constants/zoom';
import { describeError } from '../utils/describeError';
import { addShot } from '../utils/galleryStore';
import { focusPointInCamera, planCameraLayer } from '../utils/cameraGeometry';
import { computeFrameLayout } from '../utils/geometry';
import { importAndDevelop } from '../utils/importPhoto';
import { processAndSaveFilmPhoto } from '../utils/processFilmPhoto';
import { AlbumThumb } from './AlbumThumb';
import { DevelopOverlay, computeDevelopStageBox } from './DevelopOverlay';
import { DialButton } from './DialButton';
import { planWatermark } from './FilmCompositor';
import { FilmStageComposer } from './FilmStageComposer';
import { FilmLookLayers } from './FilmLookLayers';
import { FilmDrawer } from './FilmDrawer';
import { FocusExposure } from './FocusExposure';
import { FrameBadge } from './FrameBadge';
import { FramePreviewLayer } from './FramePreviewLayer';
import { FrameSwitcher } from './FrameSwitcher';
import { GalleryScreen } from './GalleryScreen';
import { LiquidGlassView } from './LiquidGlassView';
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
import type { CapturedPhoto, DevelopStatus, ResolvedPlace, Size } from '../types';

/** 画幅参考线四周留白：贴着屏幕边看不出画幅比，留一点才像取景框 */
const PREVIEW_PADDING = 10;

/**
 * 胶片外观（颗粒 / 微尘 / 漏光）的随机种子（v1.8.0 · 模块一）。
 *
 * **取景器实时预览与成片合成必须用同一个值**，否则颗粒与微尘的位置对不上，
 * 用户按快门前后会看到两张不同分布的颗粒图 —— 那正好是"所见即所得"的反面。
 * 代价是分布不随张次变化；要"每张都不一样"就得把种子绑到曝光序号并一路穿透
 * `FilmStage`（v1.8.0 没做，如实记在 README 里）。
 */
const LOOK_SEED = 1;

/**
 * 相框实时预览的心跳间隔（v1.7.0 · 模块三）。
 *
 * 30 秒是"日期/地名都对得上"与"别白白耗电"之间的折中，理由写在那个 effect 的注释里。
 * 调小它没有收益：跨零点最多晚 30 秒翻页，而用户不会举着手机盯到零点。
 */
const FRAME_PREVIEW_REFRESH_MS = 30_000;

/**
 * 取景器水印里"地名"的最短刷新间隔（v1.8.8 · 用户 m05280 降发热）。
 *
 * 心跳是 30 秒一次（日期要跨零点翻页），但**地点几乎不会在十分钟内变一次**。
 * v1.8.7 及以前每次心跳都调 `locationStamp.resolveForShot()`，而 `useLocationStamp`
 * 的缓存 TTL 只有 60 秒 —— 于是举着手机不动，也变成"每 60 秒醒一次 GPS + 反向地理
 * 编码网络请求"。现在 30 秒心跳只更新日期，地名走这个窗口，首次仍立刻取一次。
 */
const PREVIEW_LOCATION_REFRESH_MS = 10 * 60_000;

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

/**
 * 每次切档时 `autofocus` 打多长的 `'on'` 脉冲（v1.8.4）。
 *
 * expo-camera 的原生语义（`node_modules/expo-camera/ios/Current/CameraEnums.swift:48-50`）：
 *   · `'on'`  → `.autoFocus`：**单次对焦后锁定**，画面不再自己追焦；
 *   · `'off'` → `.continuousAutoFocus`：连续 AF。
 * 用户要的是"切档时重新锁一次焦点"，所以常态必须是 `'off'`（连续 AF），切档瞬间打
 * 50ms 的 `'on'` 再回 `'off'` —— 50ms 足够让原生跑一次 focus，又不至于让用户在取景时
 * 看见"画面卡住不追焦"。
 */
const FOCUS_PULSE_MS = 50;

/** 重曝第二张压在第一张上的强度：太实会把第一张吃掉，太淡等于没叠 */
const DOUBLE_OVERLAY_OPACITY = 0.5;

/**
 * 开屏默认停在 1×那一档（26mm），也是捏合变焦的落脚档。
 *
 * 用 `id` 反查下标而不是写死数字：档位表是**语义顺序**而不是什么硬件寄存器顺序，
 * 往表里插一档，写死的 1 就会静默指到别的档上去（v1.8.4 从五档变四档时就差点撞上）。
 * `Math.max(0, …)` 兜住"找不到"（表被改空）的情况，退回第一档而不是 -1。
 */
const DEFAULT_STOP_INDEX = Math.max(
  0,
  ZOOM_STOPS.findIndex((stop) => stop.id === 'wide26'),
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
 * 相机主界面**永远**的暗色底座（v1.8.3 · 模块四 D1）。
 *
 * 用户实测：系统切浅色时底栏变成米白，白色图标全部融进白底。根因不在某一枚按钮，
 * 而在这一屏整棵树跟着 `useColorScheme()` 走（`LIGHT_THEME.body` + 浅色玻璃材质）。
 * v1.8.3 起相机树用 `ThemeScope` 锁进 `DARK_THEME`，这层根底色再钉死成近黑 ——
 * 就算系统在系统外观切换的过渡帧里短暂读不到颜色，背后也不会露出一块浅色。
 */
const CAMERA_ROOT_BACKGROUND = '#09090C';

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

/**
 * 从 `getAvailablePictureSizesAsync()` 的结果里挑**当前画质档需要、且不改变取景范围**的
 * 照片档（v1.8.6 重写，v1.8.4 只挑"最大"）。
 *
 * iOS 返回的不是像素尺寸，而是 `AVCaptureSession.Preset` 的枚举串（实测
 * `["3840x2160","1920x1080","1280x720","640x480","352x288","Photo","High","Medium","Low"]`）。
 * 其中只有 `'Photo'` 是 4:3（传感器原生比例）；`3840x2160 / 1920x1080 / 1280x720` 全是 16:9，
 * `High/Medium/Low` 语义上也是视频档。`pictureSize` 是**全局 sessionPreset**
 * （`CameraView.swift:296-303` → `updateSessionPreset`），选 16:9 的代价不是"小一点"，
 * 而是预览流与画幅比例一起跳：`planCameraLayer` 的 3:4 传感器假设、`planPhotoCrop` 的
 * 成片裁切、以及 `captureQuality.ts:29-31` 那句「画质档只买清晰度，不买焦距、不买取景范围」
 * 会同时被打破。
 *
 * 判据因此是**先保 4:3 取景范围，再谈长边**（用户 m03551 第五条"分辨率策略"）：
 *   1. 广告列表里找到 **4:3**（宽高比 4/3 ±0.02）且按 3:4 居中裁切后长边仍 ≥ `targetLongEdge`
 *      的**最小**一项 —— 将来系统若给出 4:3 中间档，这里会自动用上，不必改代码；
 *   2. 否则 `'Photo'`（传感器 4:3 全幅，`AVCaptureSession.Preset.photo`）；
 *   3. 否则 `'High'`；最后 `undefined`（不传 prop，退回 expo 默认）。
 *
 * 为什么 `'Photo'` 同时满足三档：它是 4032×3024（4:3，长边 4032），而 2048 / 3024 / 4032
 * 三档只是**导出画布**的长边（`resolveCaptureLongEdge`），源图始终是 4032×3024 ——
 * 不降画质，也**不伪造 48MP**（iOS 上不存在 8064×6048 的通道，见 `captureQuality.ts` 头注释）。
 */
function pickPictureSize(sizes: readonly string[], targetLongEdge: number): string | undefined {
  if (sizes.length === 0) {
    return undefined;
  }
  const target = Math.max(0, Math.round(targetLongEdge));
  let best: string | undefined;
  let bestLong = Number.POSITIVE_INFINITY;
  for (const size of sizes) {
    const match = /^(\d+)x(\d+)$/.exec(size);
    if (match === null) {
      continue;
    }
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width <= 0 || height <= 0) {
      continue;
    }
    const long = Math.max(width, height);
    const short = Math.min(width, height);
    const isFourThree =
      Math.abs(width / height - 4 / 3) <= 0.02 || Math.abs(height / width - 4 / 3) <= 0.02;
    if (!isFourThree) {
      // 16:9 / 其它比例：绝不能喂 sessionPreset（会改取景范围，见上），直接跳过
      continue;
    }
    // 居中裁到 4:3 之后，长边最多只剩短边 × 4/3
    const croppedLong = Math.min(long, Math.round(short * (4 / 3)));
    if (croppedLong >= target && croppedLong < bestLong) {
      bestLong = croppedLong;
      best = size;
    }
  }
  if (best !== undefined) {
    return best;
  }
  /*
   * iOS 唯一的 4:3 全幅档。注意这里**不是**"最大分辨率就选它"：標準档也用它，
   * 因为换任何更小的 4:3 档都会让取景范围缩水，而标准/高清买的是成片长边、
   * 不是传感器面积（见 `captureQuality.ts` 头注释）。
   */
  if (sizes.includes('Photo')) {
    return 'Photo';
  }
  if (sizes.includes('High')) {
    return 'High';
  }
  return undefined;
}

/** 镜头列表逐项比较：原生事件与 effect 会重复给同一份列表，同值不写 state */
function sameLensList(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
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
  const { settings, setCaptureQuality } = useSettings();
  const { t, localeId } = useI18n();
  /*
   * v1.8.3 · 模块四 D1：**这一屏不再跟随系统深浅色**。
   *
   * 用户实测：系统切浅色时底部工具栏变成米白，白色图标全糊进白底。根因是整棵树
   * 跟着 `useColorScheme()` 走：`LiquidGlassView` 浅色用 `...MaterialLight` +
   * `rgba(255, 255, 255, 0.52)` 覆盖层，根容器背景是 `LIGHT_THEME.body`。
   * 现在的方案：`theme` 直接钉成 `DARK_THEME`，返回的整棵树再包一层
   * `<ThemeScope value={DARK_THEME}>` —— 子树里三十几处 `useTheme()` 全部读它，
   * 不需要逐个组件去传色值。
   *
   * ⚠️ 副作用：挂在相机树下的 `SettingsScreen` / `GalleryScreen` 会一起锁暗。
   * 这是可接受的（暗房 App 的主场景本来就是深色）；如果将来要单独支持浅色相册，
   * 得把这两个页面挪到 `ThemeScope` 外面单独挂载。
   */
  const theme = DARK_THEME;
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
  /** 直接就是 `CameraView` 的 zoom 值（0~1 归一化），捏合与「刻度尺连续行程」都往这里写 */
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);
  const [stopIndex, setStopIndex] = useState(DEFAULT_STOP_INDEX);
  /**
   * 当前档位的**布局裁切因子**（v1.8.4）：1 = 用满传感器，35 档 35/26，52 档 2。
   *
   * 为什么另开一份 state 而不是每次从 `stop.digitalFactor` 现读：捏合与刻度尺会把
   * 镜头切回主摄、把原生 `zoom` 写成一个连续值 —— 那两条路上"数码倍率"由原生
   * `zoom` 负责，布局必须**立刻回到 1**，否则会和原生变焦叠乘。档位按钮则相反：
   * 原生 zoom 恒 0、倍率全交给布局。所以它是"当前哪条通道在负责放大"的开关，
   * 由三个写入点（`applyStop` / `handleZoomChange` / `handleFocalScrub`）各自维护。
   */
  const [digitalFactor, setDigitalFactor] = useState(1);
  /**
   * 要显式写给 `CameraView.pictureSize` 的最大照片档（v1.8.4）。
   *
   * `undefined` = 不传这个 prop（相机还没就绪 / API 不可用），让 expo 用默认值。
   * 值由 `getAvailablePictureSizesAsync()` + `pickPictureSize()` 算出来，见那个 effect。
   */
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  /**
   * `CameraView.autofocus` 的一次性脉冲（v1.8.4）：`true` → `'on'`（单次对焦后锁定），
   * `false` → `'off'`（连续 AF）。每次切档/换镜头后 50ms 内为 `true`，然后自己落回。
   * 语义推导见 `FOCUS_PULSE_MS` 的注释。
   */
  const [focusPulse, setFocusPulse] = useState(false);
  /**
   * 手动切焦段的**单调令牌**（v1.8.6 性能）。
   *
   * 对焦脉冲只跟这个数走，不跟 `stop.id / lens / facing` 走 —— 以前那三个依赖意味着
   * **搓一次刻度尺**从 13mm 扫到 52mm，每跨一个档就打一次原生 `autofocus='on'`
   * （单次对焦后锁定），镜头对焦马达在整个行程里来回抽，是真机发热与"画面抽一下"
   * 的主要来源之一。连续行程本来就该由连续 AF（`autofocus='off'`）负责。
   *
   * 自增点只有三处：`applyStop`（点档位 / 短按循环）、`handleFlipCamera`（换光学系统）、
   * 以及将来任何"用户显式要求重锁"的入口。渲染周期里**不许**碰它。
   */
  const [focusPulseToken, setFocusPulseToken] = useState(0);
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
  /**
   * 相框实时预览开关（v1.7.0 · 模块三）。
   *
   * 为什么是**本地 state 而不是设置项**：它和重曝 / 定时器是同一类东西 ——
   * "这一张我想怎么看"，不是"这个 App 该怎么工作"。做成设置项还要多一个持久化键、
   * 多一处迁移，收益只是重启后还开着；而它开着的时候取景器边缘一直是半透明的，
   * 那不该是用户忘了关就一直背着的状态。
   */
  const [framePreview, setFramePreview] = useState(false);
  /**
   * 预览层的"当前时刻"与"当前位置"。
   *
   * 这两个量本来只有按快门那一刻才需要（`resolveForShot` + `new Date()`）。预览要
   * 显示**同一行日期和地名**，但一个实时时钟 + 一次 GPS 反查不能塞进渲染路径 ——
   * 所以由下面那个 effect 低频刷新，这里只存结果。
   */
  const [previewClock, setPreviewClock] = useState<Date>(() => new Date());
  const [previewPlace, setPreviewPlace] = useState<ResolvedPlace | null>(null);
  /**
   * App 是否在前台（v1.8.8 · 用户 m05280 降发热）。
   *
   * 退到后台时：取景器心跳停、定位轮询停、相机会话也停（`CameraView active={false}`
   * 在 iOS 上直接 `AVCaptureSession.stopRunning()`）。回到前台自动恢复 —— 用户不会
   * 觉得"回来黑一下"，因为后台本来就看不见取景器。
   */
  const [appActive, setAppActive] = useState(true);
  /**
   * 底部胶囊的"唤醒信号"（v1.8.0 · 模块三）。
   *
   * 胶囊的自动隐藏由 `useCapsuleAutoHide` 在 `ParameterScrubBar` **内部**管，
   * 而"用户刚点了取景器对焦"这件事只有这里知道。传一个单调递增的整数过去，
   * 组件用 `useEffect(..., [wakeSignal])` 重新计时 —— 这是唯一不需要把 ref
   * 从外往里塞的通道（也方便探针直接驱动）。
   */
  const [capsuleWake, setCapsuleWake] = useState(0);
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
  /** 上一次真正去取定位的时刻（v1.8.8：地名不再跟着 30 秒心跳走，见 `PREVIEW_LOCATION_REFRESH_MS`） */
  const lastPreviewPlaceAtRef = useRef(0);
  /** `getAvailableLensesAsync` 的 in-flight 去重（v1.8.6）：同一时刻只允许一次原生往返 */
  const lensesInFlightRef = useRef(false);
  const lensScale = useRef(new Animated.Value(1)).current;

  const frame = FRAMES[frameIndex] ?? FRAMES[0];
  /*
   * v1.8.1 无相框（`00 NO FRAME`）：`frame` 是**用户选中的那一项**（可能是全铺帧，
   * 其 `window` 恒为 `{0,0,1,1}`、`aspect` 只是占位 3/4），真正拿去做几何的必须是
   * `resolveFrame(frame, settings.noFrameAspect)` 的结果 —— 全铺帧的画幅比来自
   * 设置里的那一档（1:1 / 3:4 / 3:2），`resolveFrame` 会现算 `aspect` 并返回新对象；
   * 纸框则原样返回同一个引用（零开销、零行为变化）。
   *
   * 取景器预览、成片、导入三条路都用这一个 `resolvedFrame`：
   *   · `previewLayout` / `previewPieces` / `<FramePreviewLayer>` 用解析后的；
   *   · 快门那条路把**原始** `frame` 交给 `processFilmPhoto`，由它内部按
   *     `noFrameAspect` 再解析一次（那边是唯一入口，避免"解析两次、默认值不知道
   *     用户档"的分叉）；
   *   · `addShot({ frameId })` 存的是**原始 id**（`resolveFrame` 不改 id），
   *     所以相册里那一格仍然是 `00`，重冲印时才按当时的设置再解析。
   */
  const resolvedFrame = useMemo(
    () => resolveFrame(frame, settings.noFrameAspect),
    [frame, settings.noFrameAspect],
  );
  const preset = PRESETS[presetIndex] ?? PRESETS[0];
  const grainLevel = grainLevelAt(findGrainLevelIndex(settings.grainLevel));
  /**
   * 冲印用的预设 = 胶卷本色 + 颗粒刻度 + **画质档**（v1.7.0 · 模块一）。
   *
   * 画质档必须在这里并进去，而不是在 `processFilmPhoto` 里现读设置：`preset` 是
   * 整条成片链路唯一的"像素口径"入口（`processFilmPhoto.ts:430` 拿它的
   * `captureLongEdge` 去 `planCapture`），拍摄与相册导入两条路都从
   * `effectivePreset` / `gradedPreset` 派生 ⇒ 改这一处，两条路一起生效。
   *
   * 用户档位**无条件**覆盖预设自带值：`PRESETS` 里至今没有任何一支卷显式声明
   * `captureLongEdge`（只有 `PRESET_DEFAULTS` 那份默认，而它本身也由默认档位算出），
   * 所以"用户选了极致档却因为某支卷写死 2048 而拍出小图"这种事现在不可能发生；
   * 将来真有卷要锁自己的像素口径，再改成 `preset.captureLongEdge ?? ...`。
   */
  const effectivePreset = useMemo(
    () => ({
      ...applyGrainLevel(preset, grainLevel.opacity),
      captureLongEdge: resolveCaptureLongEdge(settings.captureQuality),
    }),
    [preset, grainLevel.opacity, settings.captureQuality],
  );
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
  // 焦段读数 = 假定原生焦距 × 布局裁切因子 × 原生变焦因子（v1.8.4）：
  //   · 13 / 26 档：digitalFactor 1、zoom 0 ⇒ 就是 13 / 26mm；
  //   · 35 / 52 档：digitalFactor 35/26 / 2、zoom 0 ⇒ 26 × 1.346 ≈ 35、26 × 2 = 52；
  //   · 捏合：digitalFactor 1，倍率全部来自 `zoom`（`zoomToFactor`）；
  //   · 刻度尺：由搓出来的读数（`scrubFocal`）直接说了算，见那份 state 的注释。
  // JS 读不到真实焦距，`ASSUMED_LENS_NATIVE_MM` 是假定值。
  const focalMm =
    scrubFocal?.mm ??
    Math.round(ASSUMED_LENS_NATIVE_MM[stop.lens] * digitalFactor * zoomToFactor(zoom));
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
  const focalMaxMm =
    !lensesKnown || resolveStop(TELEPHOTO_FOCAL_STOP, { lenses, facing }).available
      ? ASSUMED_LENS_NATIVE_MM.telephoto
      : undefined;

  const previewLayout = useMemo(
    () =>
      computeFrameLayout(
        resolvedFrame,
        Math.max(1, (previewBox.width > 1 ? previewBox.width : window.width) - PREVIEW_PADDING * 2),
        Math.max(1, (previewBox.height > 1 ? previewBox.height : window.height * 0.62) - PREVIEW_PADDING * 2),
      ),
    [resolvedFrame, previewBox.width, previewBox.height, window.width, window.height],
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

  /**
   * 取景窗里的**相机层几何**（v1.8.4，`cameraGeometry.ts` 的 `planCameraLayer`）。
   *
   * 这一个对象同时决定三件事，所以必须**只有一处**算：
   *   · `clip`   —— 裁剪容器的矩形 = 镂空取景窗（`<Animated.View>` 的 left/top/w/h）；
   *   · `box`    —— `CameraView` 自己的布局尺寸，宽高比恒为 4:3 传感器比例、
   *                 被 `digitalFactor` 等比放大（35 / 52 档的"确定性数码裁切"）；
   *   · `offset` —— 盒子左上角相对窗口的偏移（居中 ⇒ 负数）。
   * 成片侧 `planPhotoCrop` 用的是同一个公式，所以取景与成片逐点对应。
   *
   * 窗口还没量出来时（`previewBox` 是 0×0）它会退化成一个 0 尺寸的恒等计划；
   * 渲染那边也用 `previewBox` 做了门控，不会把 0×0 的相机层挂到原生会话上。
   */
  const cameraLayer = useMemo(
    () => planCameraLayer(viewfinderWindow, digitalFactor),
    [viewfinderWindow, digitalFactor],
  );

  /**
   * 对焦点与曝光补偿一起下发给原生。EV 归零时故意省略 `exposureBias` 键：
   * 原生收到 `nil` 就完全不碰测光，同时也少一次无意义的 prop diff。
   *
   * 定义在 `cameraLayer` 之后（v1.8.4）：`focusPoint` 要把"预览容器里的点"换算成
   * "相机层里的点"，没有 `cameraLayer` 就算不出来。
   */
  const cameraFocusProps = useMemo<CameraViewProps & FocusPointProp>(() => {
    const props: CameraViewProps & FocusPointProp = {};
    if (focusTarget !== null) {
      /*
       * 对焦点必须换算到**相机层**的 0~1 坐标（v1.8.4）：预览容器上点哪，不等于
       * 相机层上哪 —— 相机盒子被居中放大、被窗口裁掉一圈，直接拿预览比例下发给
       * 原生会让对焦框和实际焦点错位（35 / 52 档裁切后，错位随 digitalFactor 变大）。
       */
      props.focusPoint = focusPointInCamera(focusTarget, previewBox, cameraLayer);
    }
    if (exposure !== 0) {
      props.exposureBias = exposure;
    }
    return props;
  }, [focusTarget, exposure, previewBox, cameraLayer]);

  const stageBox = useMemo(
    () => computeDevelopStageBox({ width: window.width, height: window.height }),
    [window.width, window.height],
  );

  /**
   * 三个面板打开时取景器整体隐藏（但**不卸载**）：卸载 `CameraView` 会让 iOS
   * 重建一次采集会话，关掉面板回来时要黑一下，那是比"看不见"更糟的体验。
   */
  const covered = settingsVisible || galleryVisible || filmDrawerVisible;

  /*
   * 先解构出来：`useLocationStamp()` 每次渲染都返回**新的对象字面量**，
   * 直接把它当 effect 依赖会让那个心跳 effect 每渲染一次就重建一次 ——
   * 而心跳自己会 `setPreviewClock`，于是"重建 → 立刻 tick → setState → 重渲染"
   * 变成一个无限循环。`resolveForShot` 是 `useCallback` 出来的稳定引用
   * （只随 mode / 地名语言 / 界面语言 / 详细度档变化），它才是正确的依赖。
   */
  const { resolveForShot } = locationStamp;

  /** 面板盖住取景器时预览必须一起灭掉：看不见的东西没有理由还在占渲染预算 */
  const framePreviewVisible = framePreview && !covered;

  /**
   * 相机会话是否该跑着（v1.8.8 · 用户 m05280 降发热）。
   *
   * `expo-camera` 的 `active` prop 在 iOS 上直接映射到 `AVCaptureSession.stopRunning()` /
   * `startRunning()`（`node_modules/expo-camera/ios/Current/CameraSessionManager.swift` 的
   * `updateCameraIsActive`）。相框设置、相册、胶片抽屉盖住取景器时，预览看不见却还在
   * 满帧出图 —— 那是真机持续发热的固定大头。这里让它只在"取景器真的看得见"时跑：
   *   · 面板打开（`covered`）/ 正在冲印（`developing`）→ 停采集；
   *   · 退到后台（`appActive === false`）→ 停采集；
   *   · 相机权限没给时本来就没挂载，这里恒 false 也无害。
   *
   * 注意 `CameraView` **不卸载**（卸载会重建采集会话、回来黑一下）：只是 `active` 开关。
   */
  const cameraActive = cameraGranted && !covered && !developing && appActive;

  /**
   * 预览要画的水印片段（v1.7.0 · 模块三）。
   *
   * **一行都不能自己算**：`planWatermark` 就是 `FilmCompositor` 用来排成片水印的那个
   * 函数（`FilmCompositor.tsx:147`），传进去的 `layout` 是取景器里的相纸矩形、
   * `frame` / `timestamp` / 版式 / 详细度 / 语言全部与成片同源。所以预览里看到的
   * "地名被精简成 中国 · 上海""日期不被挤压"这些行为，和洗出来的那张**是同一份代码
   * 决定的**，不是"照着成片又写了一遍"。
   *
   * 唯一的差别是 `capturedAt`：成片用快门那一刻，预览用 `previewClock`（30 秒心跳）。
   * `locationText` 传空串是刻意的 —— 相机页的定位一律走 `place` 结构（经纬度档在
   * hook 里也会返回一个"只有坐标"的结构），传空串就走不到那个向后兼容的兜底分支，
   * 与按快门那次调用的行为一致。
   *
   * `presetName` 取 `resolved.name`：关闭定位时"摄影代号 + 第几张"顶上地名那一行，
   * 代号必须和这张要用的预设一致，否则预览会印着上一卷的代号。
   */
  const previewPieces = useMemo(() => {
    if (!framePreviewVisible) {
      return [];
    }
    return planWatermark({
      layout: previewLayout,
      frame: resolvedFrame,
      timestamp: resolved.timestamp,
      capturedAt: previewClock,
      locationText: '',
      place: previewPlace,
      locale: localeId,
      watermarkLayout: settings.watermarkLayout,
      placeDetail: settings.placeDetail,
      presetName: resolved.name,
      exposureIndex: exposureCount + 1,
      /*
       * 日期引擎（v1.8.0 · 模块四）与成片**同源**：预览里印的日期格式 / 字形 /
       * 机位 / 荧光色，必须与洗出来那张逐字相同，否则「所见即所得」在这一行上
       * 就是假的。它是全局设置而不是预设字段（理由见 FilmCompositor 调用点那段）。
       */
      dateEngine: settings.dateEngine,
    });
  }, [
    framePreviewVisible,
    previewLayout,
    resolvedFrame,
    resolved.timestamp,
    resolved.name,
    previewClock,
    previewPlace,
    localeId,
    settings.watermarkLayout,
    settings.placeDetail,
    settings.dateEngine,
    exposureCount,
  ]);

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

  /**
   * 相框实时预览的**低频心跳**（v1.7.0 · 模块三）。
   *
   * 预览里的日期与地名必须和"按下去会洗出来的那张"是同一行字，所以它们得是真的
   * 当前时刻与当前位置 —— 但这两样都不能放在渲染路径上：`new Date()` 每帧都会变
   * （水印就会每帧重排），`resolveForShot()` 是一次 GPS + 反查。
   *
   * 折中成一次 30 秒的心跳：
   *   · 日期只有跨零点才会真的变，30 秒的粒度绰绰有余；
   *   · 地名是"举着手机在原地构图"期间的东西，30 秒内不会走到另一个城市；
   *   · 关掉预览、或任何一个面板盖住取景器时**立刻停跳**（`covered` 就是那个条件），
   *     不给一次都没打开预览的用户平白加一次 GPS 轮询。
   *
   * 为什么先 `setPreviewClock` 再取定位：日期是纯本地的、立刻就该更新；地名要等
   * 网络/卫星，回来再补。两件事都成功才更新会让日期也跟着晚 300ms 跳一下。
   */
  useEffect(() => {
    if (!framePreview || covered || !appActive) {
      return;
    }
    let alive = true;
    const tick = () => {
      setPreviewClock(new Date());
      /*
       * v1.8.8（用户 m05280 降发热）：地名不再跟着 30 秒心跳走。
       *
       * 以前这里每 30 秒调一次 `resolveForShot()`，而 `useLocationStamp` 的缓存 TTL
       * 只有 60 秒 ⇒ 等于每 60 秒真的醒一次 GPS + 反向地理编码网络请求，举着手机
       * 不动也一直在耗电发热。地点十分钟都不会变一次，所以只有到了刷新窗口才去取；
       * 首次进入预览仍立刻取一次（ref 初值 0）。日期照旧每 30 秒翻（跨零点用）。
       */
      if (!alive || Date.now() - lastPreviewPlaceAtRef.current < PREVIEW_LOCATION_REFRESH_MS) {
        return;
      }
      lastPreviewPlaceAtRef.current = Date.now();
      void locationStamp.resolveForShot().then((place) => {
        if (alive) {
          setPreviewPlace(place);
        }
      });
    };
    tick();
    const timer = setInterval(tick, FRAME_PREVIEW_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [framePreview, covered, appActive, resolveForShot]);

  const handlePreviewLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setPreviewBox((current) => (current.width === width && current.height === height ? current : { width, height }));
  }, []);

  /**
   * 前后台监听（v1.8.8 · 用户 m05280 降发热）。
   *
   * 只区分 `'active'` 与其余状态（`'background'` / `'inactive'`）：`'inactive'` 是来电
   * 横幅、下拉控制中心这类短暂打断，那几秒里取景器同样看不见，没有理由还在跑采集。
   * 回到 `'active'` 会同时恢复相机会话（`cameraActive` 变 true）和上面那个心跳 effect。
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      setAppActive(next === 'active');
    });
    return () => {
      subscription.remove();
    };
  }, []);

  /**
   * 拉一次可用镜头列表（v1.8.6 加 in-flight 去重）。
   *
   * `getAvailableLensesAsync()` 是一次原生往返：相机就绪、翻面、`onAvailableLensesChanged`
   * 事件都会走到这里，而 effect 里的依赖又可能在同一次提交里重复触发。同一时刻只允许
   * 一个请求在飞，回来就用（同值不写 state，避免一次原生往返变成一次整屏重渲染）。
   */
  const refreshLenses = useCallback(async () => {
    if (lensesInFlightRef.current) {
      return;
    }
    const camera = cameraRef.current;
    if (!camera) {
      return;
    }
    lensesInFlightRef.current = true;
    try {
      const available = await camera.getAvailableLensesAsync();
      setLenses((current) => (sameLensList(current, available) ? current : available));
    } catch {
      // 拿不到镜头列表不该拦住拍照：档位退化成"只改 zoom，不指定镜头"
      setLenses((current) => (current.length === 0 ? current : []));
    } finally {
      lensesInFlightRef.current = false;
    }
  }, []);

  const handleLensesChanged = useCallback(({ lenses: available }: { lenses: string[] }) => {
    setLenses((current) => (sameLensList(current, available) ? current : available));
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

  /**
   * 当前画质档要买到的**成片长边**（v1.8.6）。
   *
   * 三档只是导出画布的长边：2048 / 3024 / 4032（`captureQuality.ts`）。它同时是
   * `pickPictureSize` 的判据（源图长边必须 ≥ 它，才谈得上"不减画质"）与
   * `pictureSize` effect 的依赖 —— 换画质档要重新挑一次预设，换镜头则**不**需要。
   */
  const targetLongEdge = useMemo(
    () => findCaptureQualitySpec(settings.captureQuality).longEdge,
    [settings.captureQuality],
  );

  /**
   * 拉一次「这台相机支持哪些照片尺寸」，并按当前画质档绑定 4:3 的照片预设（v1.8.6）。
   *
   * 与 v1.8.4 的区别：以前是"永远挑最大"，于是每换一次镜头都重拉一遍并对同一份
   * 枚举串重新 setState。现在挑出来的结果由画质档决定（见 `pickPictureSize` 的
   * 判据），同值直接 bailout —— 少掉的是原生往返与一次整树重渲染，画质一分不降。
   * 拿不到尺寸就保持现状（`pictureSize` 为 `undefined` ⇒ 不传这个 prop，用 expo 默认）。
   */
  const refreshPictureSize = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera) {
      return;
    }
    try {
      const sizes = await camera.getAvailablePictureSizesAsync();
      const next = pickPictureSize(sizes, targetLongEdge);
      setPictureSize((current) => (current === next ? current : next));
    } catch {
      // 拿不到尺寸不该拦住拍照：退回"不传 pictureSize"，让 expo 用自己的默认值
    }
  }, [targetLongEdge]);

  /**
   * `pictureSize` 的刷新时机（v1.8.6 收紧）：相机就绪、前后摄切换、重建视图、换画质档。
   *
   * **不再依赖 `lens`**：`pictureSize` 是全局 sessionPreset，与"当前挂哪支镜头"无关；
   * 以前把 `lens` 放进依赖，意味着搓一次焦段刻度尺（13→52mm 会跨好几档）就发一次
   * `getAvailablePictureSizesAsync()` 原生往返，然后可能再触发一次 `sessionPreset`
   * 重配置 —— 相机在发热，而画面没有任何变化。
   */
  useEffect(() => {
    if (!cameraReady) {
      return;
    }
    void refreshPictureSize();
  }, [cameraReady, facing, cameraKey, refreshPictureSize]);

  /**
   * 翻过面之后补拉一次镜头列表（v1.8.4 修 bug）。
   *
   * `handleFlipCamera` 会把 `lenses` 清空（避免前摄继承后摄的档位），但以前没有
   * 任何地方再拉一次 —— 翻到前摄后 0.5× 会整档变灰，直到下一次 `onCameraReady`。
   * 相机不换 `key` 时那个回调不会再来，所以必须显式补这一下。
   */
  useEffect(() => {
    if (cameraReady) {
      void refreshLenses();
    }
  }, [cameraReady, facing, refreshLenses]);

  /**
   * **用户手动**切焦段后的对焦重锁（v1.8.4 起，v1.8.6 收紧触发面）：`autofocus` 打一个
   * 50ms 的 `'on'` 脉冲。
   *
   * 为什么不是一直 `'on'`：原生 `'on'` = 单次对焦后**锁定**，一直开着等于关了连续 AF，
   * 用户稍微换个角度画面就不追焦了。所以常态 `'off'`（连续 AF），只在"用户真的换了
   * 焦段、画面尺度和景深都变了"的这一刻重锁一次。
   *
   * 依赖**只有令牌**：以前是 `[cameraReady, stop.id, lens, facing]`，搓一次刻度尺
   * 13→52mm 每跨一档就重锁一次，对焦马达全程来回抽 —— 真机发热、取景器画面一抽一抽
   * 都是这个原因。现在只有点档位 / 短按循环（`applyStop`）或翻面（`handleFlipCamera`）
   * 才自增令牌；连续行程交给连续 AF。渲染周期里绝不触发。
   */
  useEffect(() => {
    if (!cameraReady) {
      return;
    }
    setFocusPulse(true);
    const timer = setTimeout(() => setFocusPulse(false), FOCUS_PULSE_MS);
    return () => clearTimeout(timer);
  }, [cameraReady, focusPulseToken]);

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

  /**
   * 抽屉里那颗 `00` 角标点名要某一款相框（v1.8.1）。
   *
   * 与 `handleFrameChange` 的区别只有一个：那边给的是**步进下标**（左右滑），
   * 这边给的是**id**（抽屉只认 id，见 `FilmDrawerProps.frameId` 的注释）。
   * 落点仍然只改 `frameIndex` 这一个 state —— 不复用 `handleFrameChange`，
   * 因为 `wrapIndex(next)` 收到"找不到的 id 兜回来的出厂下标"时会把它当步进量，
   * 语义对不上；这里的 `findFrameIndex` 负责兜底（找不到就回出厂款）。
   * 对焦框同一条规矩：换了相框必须清掉。
   */
  const handleSelectFrame = useCallback((id: string) => {
    setFrameIndex(findFrameIndex(id));
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
    setDigitalFactor(1);
    setLens(undefined);
    setLenses([]);
    setFocusTarget(null);
    setExposureCount(0);
    setStopIndex(DEFAULT_STOP_INDEX);
    // 换镜头等于换了一支光学系统，搓出来的读数一律作废
    setScrubFocal(null);
    // 翻面换掉整套光学系统 → 显式请求一次对焦重锁（v1.8.6 令牌，见 focusPulseToken 注释）
    setFocusPulseToken((current) => current + 1);
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
      // 捏合是"原生变焦"通道：数码倍率全部由 `zoom` 表达，布局裁切必须立刻归 1，
      // 否则会和原生变焦叠乘（拍出来比读数远一档）。
      setDigitalFactor(1);
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
      // 档位走"布局裁切"通道（v1.8.4）：原生 zoom 恒 0（档位表里就是 0），倍率交给
      // `digitalFactor` —— 13/26 档为 1，35/52 档分别为 35/26 与 2。
      setDigitalFactor(resolution.digitalFactor);
      // 档位是"离散的权威"：点了档，搓出来的读数就该让位给档位
      setScrubFocal(null);
      // 用户真的点了档位 / 短按循环焦段 → 请求一次对焦重锁（v1.8.6 令牌）
      setFocusPulseToken((current) => current + 1);
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
      // 刻度尺走"原生变焦"通道（v1.8.3 口径）：布局裁切归 1，连续倍率交给 zoom；
      // 长焦段的 factor 恒为 1 ⇒ zoom 0 ⇒ 那支镜头的完整原生视场。
      setDigitalFactor(1);
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
      // 用户刚点了对焦：叫醒底部胶囊并重新计时（v1.8.0 · 模块三）。
      // 放在两个 early return **之后** —— 取景器还没量出尺寸时那一击不该算数。
      setCapsuleWake((current) => current + 1);
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

  /**
   * 顶栏画质档：点一下往后轮一档（标准 → 高清 → 极致 → 标准）。
   *
   * 为什么是"轮转"而不是弹一个选择器：顶栏是单手够得着的地方，三档轮一圈最多点三下，
   * 比"点开 → 选 → 关"少两次操作；而画质是**改一次就长期不动**的东西，不值得为它
   * 常驻一块选择器。设置页里那排分段按钮仍然是"一眼看到全部三档 + 一句如实说明"的地方。
   *
   * 为什么顺序是 low → high → max 而不是反过来：轮转的语义是"越点越清晰"，和设置页
   * 从左到右的排列一致；点到头回到最省的一档，误触多点的代价只是画质回到默认，不是爆内存。
   *
   * `findIndex` 认不出来时返回 -1，`(-1 + 1) % 3 === 0` 正好落回第一档 —— 脏数据不会变成
   * "点了没反应"。
   */
  const handleCycleCaptureQuality = useCallback(() => {
    void Haptics.selectionAsync();
    const at = CAPTURE_QUALITIES.findIndex((spec) => spec.id === settings.captureQuality);
    const next = CAPTURE_QUALITIES[(at + 1) % CAPTURE_QUALITIES.length];
    if (next !== undefined) {
      setCaptureQuality(next.id);
    }
  }, [settings.captureQuality, setCaptureQuality]);

  const handleToggleDouble = useCallback(() => {
    void Haptics.selectionAsync();
    setDoubleExposure((current) => !current);
    // 任何一次切换都把没冲的半成品丢掉：留着它，下次开重曝会莫名其妙叠上一张旧照片
    setPendingExposureUri(null);
  }, []);

  /**
   * 相框实时预览开关（v1.7.0 · 模块三）。
   *
   * 关掉时**顺手把地名清空**：留着一个上次的位置没有害处，但下次开预览时那一帧会先
   * 印着旧地名再跳到新地名 —— 清掉之后是"先不出地名、定到了再补上"，读起来是加载，
   * 而不是闪一下。日期不清：它是纯本地的，心跳那一下就会刷新。
   */
  const handleToggleFramePreview = useCallback(() => {
    void Haptics.selectionAsync();
    setFramePreview((current) => {
      if (current) {
        setPreviewPlace(null);
      }
      return !current;
    });
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
      // 走 expo-camera 的**高画质静态拍摄**通道（v1.7.0 · 模块一第 2 条）：
      //   · `quality: 1`   —— JPEG 压缩质量拉满，不再从实时预览流上截帧；
      //   · `skipProcessing: false` —— **显式**声明"要完整后处理"。它本来就是 expo-camera
      //     的默认值（`Options.kt:15 val skipProcessing: Boolean = false`），这里写出来
      //     是为了让"我们特意走这条路"留在代码里可查：置 true 会跳过后处理，
      //     换来的是方向不确定（官方文档原话 "Enabling skipProcessing would cause
      //     orientation uncertainty"）——那正是"画质模糊/马赛克 + 方向乱"的来源。
      //     注：该开关在 expo-camera 57 里**只有 Android 读**（`ResolveTakenPicture.kt:81`），
      //     iOS 无论传什么都走后处理；写上它对两端都安全。
      //   · `exif: false` —— 我们不用相机 EXIF 的时间/地点（日期走 App 自己的时钟、
      //     地点走 `resolveForShot()`），少解一份 EXIF 省一次内存峰值。
      const shot = await camera.takePictureAsync({ quality: 1, skipProcessing: false, exif: false });
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
        /*
         * v1.8.1：无相框的画幅比只在这里交给冲印链路，**传原始 `frame`**。
         * `processFilmPhoto` 内部会 `resolveFrame(frame, noFrameAspect)` 解析出真正的
         * 画幅（纸框原样返回），这样"取景器预览用的解析"和"成片用的解析"是同一个函数的
         * 两次同参调用；这里若先解析一遍再传进去，就得把默认值也复制一份，迟早分叉。
         */
        noFrameAspect: settings.noFrameAspect,
        /*
         * 必须是 `gradedPreset`（= `effectivePreset` + 用户拖过的色温），不是
         * `effectivePreset`：取景器的实时滤镜与底部胶囊读数都读 `resolved`
         * （`resolvePreset(gradedPreset)`），相册导入那条路也已经用 `gradedPreset`，
         * 只有这里少一层色温覆盖 ⇒ 拖完色温"取景器暖了、成片没暖"。
         */
        preset: gradedPreset,
        /*
         * 布局裁切因子（v1.8.4）：与取景器 `planCameraLayer` 收到的是**同一个 state**，
         * 冲印链路用它算 `planPhotoCrop` —— 取景里看到的窗口区域与成片逐点对应。
         */
        digitalFactor,
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
        /*
         * 相册副本跟着**画质档**走（v1.7.0 · 模块一）。不传的话它恒被压到 2048px，
         * 用户选了极致档、回 App 相册里看到的还是一张 2048 的小图。
         * `planResize` 只缩不放，所以小底片不会因此被拉伸。
         */
        maxLongEdge: resolveCaptureLongEdge(settings.captureQuality),
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
    digitalFactor,
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
  /*
   * 画质档（v1.7.0 · 模块一）在顶栏的**紧凑读数**。
   *
   * ⚠️ 这里刻意**不写 "48MP"**：`captureQuality.ts` 的文件头把话说死了 —— iOS 上
   * `takePictureAsync` 的输出尺寸由 `AVCaptureSession.sessionPreset` 决定，expo-camera
   * 57.0.6 没有任何接口能碰它，所以这一档买到的是**成片长边像素**（2048 / 3024 / 4032），
   * **不是**传感器像素。印 "48MP" 就是撒谎，而撒谎的代价是用户拿成片去跟"48MP"对账。
   * 档位名（标准 / 高清 / 极致）走 i18n，真数字留给设置页那一句如实说明。
   */
  const captureSpec = findCaptureQualitySpec(settings.captureQuality);
  const captureLabel = t(captureSpec.labelKey);
  const qualityText = `[${captureLabel}]`;
  const bannerMessage = saveIssue ?? notice;
  const focusHintVisible = !focusSeen && interactive && focusTarget === null;

  /*
   * ── v1.8.6 · 高频渲染隔离 ──────────────────────────────────────────────────
   *
   * 这个屏幕有三个每秒 20~60 次改写顶层 state 的手势：捏合变焦（`zoom`）、对焦框上下
   * 拖动（`exposure`）、刻度尺 / 色温搓动（`scrubFocal` / `temperatureOverride`）。
   * 它们每次 setState 都会让本组件整个函数体重跑 —— 本身很便宜，**贵的是重建元素树**：
   * 未 memo 的 `FramePreviewLayer`、`ViewfinderWindow`、`DevelopOverlay` 都会跟着重新
   * reconcile 一遍（相框层里还有 PNG + 幕布 + 相纸 + 水印一整套）。
   *
   * 下面六个 `useMemo` 把元素树切成稳定块：只要某一块的依赖没变，React 拿到的就是
   * **同一个元素引用**，整块子树直接跳过 reconcile。隔离粒度按"谁真的会变"来切：
   *
   *   cameraClipNode    ← 相机几何 / 硬件参数（捏合只改 zoom，会进来；色温不会）
   *   liveLookNode      ← 实时滤镜（色温、曝光档、胶片预设会进来）
   *   viewfinderNode    ← 镂空窗 + 九宫格（只有几何/辅助线开关会进来）
   *   framePreviewNode  ← 相框实时预览（换框、换相框材质、日期水印会进来）
   *   controlNode       ← 底部控制台（工具行状态、底片计数、缩略图）
   *   overlayNode       ← 取景器内的瞬时字幕/横幅/胶囊行（倒计时每秒一次只动这里）
   *
   * 刻意**不**进 memo 的：`FrameSwitcher`（里面装着"点哪对哪"的 `focusCatcher`，
   * 手势命中区必须每次都能拿到最新的 `handleTapFocus`）与 `FocusExposure`（对焦框
   * 自己的动画在内部 native driver 跑，props 也只跟 `focusTarget/exposure` 有关）。
   *
   * 注意：`cameraFocusProps` 里含 `exposure`，所以 EV 变化会重建 `cameraClipNode` ——
   * 这是**必须**的（`exposure` 是 `CameraView` 的原生 prop），但重建范围只有相机这一块，
   * 相框/颗粒/控制台都不会再跟着重画。
   */
  const cameraClipNode = useMemo(
    () =>
      cameraGranted && previewBox.width > 1 && previewBox.height > 1 ? (
        <Animated.View
          style={[
            styles.cameraClip,
            {
              left: viewfinderWindow.left,
              top: viewfinderWindow.top,
              width: viewfinderWindow.width,
              height: viewfinderWindow.height,
            },
            { transform: [{ scale: lensScale }] },
          ]}
        >
          <CameraView
            key={cameraKey}
            ref={cameraRef}
            style={{
              position: 'absolute',
              left: cameraLayer.offset.x,
              top: cameraLayer.offset.y,
              width: cameraLayer.box.width,
              height: cameraLayer.box.height,
            }}
            facing={facing}
            mode="picture"
            {...cameraFocusProps}
            flash={facing === 'back' ? flashMode : 'off'}
            selectedLens={lens}
            onAvailableLensesChanged={handleLensesChanged}
            zoom={zoom}
            pictureSize={pictureSize}
            autofocus={focusPulse ? 'on' : 'off'}
            animateShutter
            /* v1.8.8（用户 m05280 降发热）：看不见时就停采集，别在后台空转出图 */
            active={cameraActive}
            onCameraReady={handleCameraReady}
            onMountError={handleMountError}
          />
        </Animated.View>
      ) : null,
    [
      cameraGranted,
      previewBox.width,
      previewBox.height,
      styles,
      viewfinderWindow,
      lensScale,
      cameraKey,
      cameraLayer,
      facing,
      cameraFocusProps,
      flashMode,
      lens,
      handleLensesChanged,
      zoom,
      pictureSize,
      focusPulse,
      handleCameraReady,
      handleMountError,
      cameraActive,
    ],
  );

  const liveLookNode = useMemo(
    () =>
      previewBox.width > 1 && previewBox.height > 1 ? (
        <View
          style={[
            styles.liveLook,
            {
              left: viewfinderWindow.left,
              top: viewfinderWindow.top,
              width: viewfinderWindow.width,
              height: viewfinderWindow.height,
            },
          ]}
          pointerEvents="none"
        >
          <FilmLookLayers
            preset={resolved}
            width={viewfinderWindow.width}
            height={viewfinderWindow.height}
            surface="live"
            seed={LOOK_SEED}
          />
        </View>
      ) : null,
    [previewBox.width, previewBox.height, styles, viewfinderWindow, resolved],
  );

  const viewfinderNode = useMemo(
    () =>
      previewBox.width > 1 && previewBox.height > 1 ? (
        <ViewfinderWindow window={viewfinderWindow} grid={resolved.showGuide} />
      ) : null,
    [previewBox.width, previewBox.height, viewfinderWindow, resolved.showGuide],
  );

  const framePreviewNode = useMemo(
    () =>
      framePreviewVisible && previewBox.width > 1 && previewBox.height > 1 ? (
        <FramePreviewLayer
          frame={resolvedFrame}
          layout={previewLayout}
          left={frameOffset.left}
          top={frameOffset.top}
          variant={settings.frameVariant}
          pieces={previewPieces}
          fontFamily={fonts.fontFamily}
          glow={resolved.timestamp.glow}
          dateEngine={settings.dateEngine}
        />
      ) : null,
    [
      framePreviewVisible,
      previewBox.width,
      previewBox.height,
      resolvedFrame,
      previewLayout,
      frameOffset.left,
      frameOffset.top,
      settings.frameVariant,
      // v1.8.7 模块一：日期引擎四个轴（格式/字形/机位/发光色）必须进依赖 ——
      // 少一行，用户改「字形」时取景器就不重渲染，看起来就是"设置无效"。
      settings.dateEngine,
      previewPieces,
      fonts.fontFamily,
      resolved.timestamp.glow,
    ],
  );

  const controlNode = useMemo(
    () => (
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
          framePreview={framePreview}
          busy={developing}
          onImport={handleImportPress}
          onToggleDouble={handleToggleDouble}
          onCycleTimer={handleCycleTimer}
          onCycleFlash={handleCycleFlash}
          onFlip={handleFlipCamera}
          onToggleFramePreview={handleToggleFramePreview}
        />
        <View style={styles.coreRow}>
          <View style={styles.coreSide}>
            <AlbumThumb refreshKey={albumKey} size={CORE_THUMB_SIZE} onPress={handleOpenGalleryScreen} />
          </View>
          <ShutterButton onPress={handleShutterPress} busy={developing} disabled={!cameraReady || !cameraGranted} />
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
    ),
    [
      styles,
      insets.bottom,
      ink.paperDim,
      doubleExposure,
      timerSeconds,
      flashMode,
      facing,
      framePreview,
      developing,
      handleImportPress,
      handleToggleDouble,
      handleCycleTimer,
      handleCycleFlash,
      handleFlipCamera,
      handleToggleFramePreview,
      albumKey,
      cameraReady,
      cameraGranted,
      handleShutterPress,
      handleOpenGalleryScreen,
      handleOpenFilmDrawer,
      interactive,
      t,
      preset.name,
    ],
  );

  const overlayNode = useMemo(
    () => (
      <>
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
        <View
          style={[styles.barLayer, { bottom: consoleHeight + BAR_LAYER_GAP }]}
          pointerEvents="box-none"
        >
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
            wakeSignal={capsuleWake}
          />
        </View>
      </>
    ),
    [
      styles,
      theme.panel,
      ink.amberDeep,
      flashHint,
      pendingExposureUri,
      focusHintVisible,
      countdown,
      bannerMessage,
      saveIssue,
      handleOpenSystemSettings,
      handleDismissBanner,
      t,
      consoleHeight,
      resolved.color.temperature,
      focalMm,
      exposure,
      focalRole,
      focalMinMm,
      focalMaxMm,
      handleTemperatureChange,
      handleFocalScrub,
      handleExposureChange,
      handleCycleFocal,
      capsuleWake,
    ],
  );

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
    // v1.8.3 · D1：整棵树锁暗。副作用（设置页/相册页一起变暗）见上面 `theme` 处的注释。
    <ThemeScope value={DARK_THEME}>
    <View style={[styles.root, { backgroundColor: CAMERA_ROOT_BACKGROUND }]}>
      {/*
        ① 顶栏：画幅徽标 + 底片计数 + 画质档 + 设置。闪光灯/翻转/相册都搬去了工具行与核心区。

        皮革底纹那一整块（`UI_ASSETS.leatherTile` 的 `resizeMode="repeat"`）已经删掉。
        理由：这块玻璃材质要能**采到它背后的画面**（`LiquidGlassView` 默认叠 75 强度的
        `BlurView`），底纹是一张完全不透明的平铺位图，铺在下面等于让模糊去采一块死平的布 ——
        那不是液态玻璃，那是一块塑料贴纸。屏幕的底色由根容器的
        `CAMERA_ROOT_BACKGROUND`（`#09090C`）兜底。

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
          {/*
            画质档（v1.7.0 · 模块一）。用户要的是"顶部工具栏也有一个 [ 12MP / 48MP ] 开关"。

            这里给的是 `[标准] / [高清] / [极致]`，**没有写 12MP / 48MP** —— 原因见
            `constants/captureQuality.ts` 文件头：纯 JS 拿不到传感器像素，写 "48MP" 就是谎报。
            真数字（2048 / 3024 / 4032）留给设置页那一句如实说明，这里只放档位名。

            为什么不做成 ToolRow 的第 7 枚按钮：那一行已经是六枚的上限了（见 `ToolRow` 文件头，
            6×44pt 在 320pt 的老 SE 上只剩 4pt 的缝）。画质不像闪光灯那样"每一张都要看一眼"，
            它放在顶栏这条**读数带**上更合适 —— 和 `[00K]` 底片计数并排，两个方括号读数
            属于同一种"这台机器现在的状态"的语言，用户扫一眼就知道。
          */}
          <Pressable
            onPress={handleCycleCaptureQuality}
            disabled={developing}
            accessibilityRole="button"
            accessibilityLabel={t('settings.quality.title')}
            accessibilityValue={{ text: captureLabel }}
            hitSlop={8}
            style={({ pressed }) => [
              styles.qualityChip,
              pressed ? styles.qualityChipPressed : null,
              developing ? styles.qualityChipDisabled : null,
            ]}
          >
            <Text style={[styles.qualityLabel, { color: ink.amber }]} allowFontScaling={false}>
              {qualityText}
            </Text>
          </Pressable>
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
        {cameraClipNode}

        {/*
          胶片色彩实时预览（v1.8.0 · 模块一）。

          **位置是唯一的正解**：排在 `CameraView` 之后（排前面会被原生画面盖住），
          排在 `ViewfinderWindow` **之前**（九宫格与四块哑光玻璃要压在滤镜之上；
          反过来就会把构图辅助线一起染色）。

          几何**一个新数都不算**：`viewfinderWindow` 就是上面挖镂空窗用的那个矩形，
          所以滤镜层与镂空窗逐点重合。`overflow: 'hidden'` 是关键 —— 滤镜层内部是
          绝对定位的整块叠图，不裁的话会溢出到取景器四角的控制栏上。

          成片与实时预览共用 `FilmLookLayers`（`surface` 只决定要不要渲染"需要静帧
          位图"的自叠层），两边**同一份渲染代码**，所以不会再出现"取景器里是一个
          色调、洗出来是另一个色调"。种子也用同一个 `LOOK_SEED`：微尘与颗粒分布
          必须与成片逐点一致，"所见即所得"优先于"每张随机换个心情"。
        */}
        {liveLookNode}

        {/*
          镂空取景窗是**取景器的直接子层**，故意不放进下面 `FrameSwitcher` 里。
          理由：`FrameSwitcher` 是个左右滑动的容器，镂空窗跟着它跑的话，滑到一半时
          四块玻璃的边界只盖住画幅宽度的一半，屏幕两侧会露出没被玻璃压住的实时画面 ——
          那就不再是"取景窗"而是一张会滑动的贴纸。它要始终铺满整个取景器。

          九宫格交给它的 `grid` prop（设置页那个"构图辅助线"开关直接接过来），
          本地那套 `GuideGrid` 已经删掉，理由见它原来所在的模块级注释。
        */}
        {viewfinderNode}

        {/*
          相框实时预览（v1.7.0 · 模块三）。

          **它在 `ViewfinderWindow` 之后、`FrameSwitcher` 之前，这个位置是唯一的正解**：
            · 排在镂空窗**之后** —— 镂空窗那四块玻璃是压暗实时画面的哑光遮罩，相纸必须
              盖在它上面才看得见，排前面就等于把相框画在遮罩底下；
            · 排在 `FrameSwitcher` **之前** —— 那一层里装着"点哪对哪"的 `focusCatcher`，
              预览层排在它后面就会把那一下点击整个吞掉。预览层自己也写了
              `pointerEvents="none"`，两道保险。

          几何**一个数都不新算**：`previewLayout` 与 `frameOffset` 正是上面用来挖镂空窗
          的同两个量，所以预览纸面和镂空窗天然逐点重合（推导见 `viewfinderWindow` 的
          注释）。`previewLayout.window` 是窗口相对**相纸**的位置，正好是 `FrameSkin`
          要的坐标系。
        */}
        {framePreviewNode}

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
          取景器内所有瞬时字幕 / 横幅 / 悬浮胶囊行（v1.8.6 收进 `overlayNode`）：
          闪光灯档位提示、对焦提示、倒计时数字、重曝提示、错误横幅、胶囊行。

          它们各自都 `pointerEvents="none"`（胶囊行是 `box-none`），不会吞掉点对焦
          那一下；`accessibilityLiveRegion="polite"` 让读屏也念一遍。
          倒计时每秒一次 `setState` 只重建这一个元素 —— 相机层、相框层、控制台一概不动。
        */}
        {overlayNode}
      </View>

      {/*
        ③ + ④ 控制台：工具行 + 核心区。齿轮/开关类的改动只脏这一块。

        和顶栏同一套处理：换玻璃、删皮革底纹与 `styles.panelPlate`。
        `paddingBottom` 依旧按 home indicator 让位 —— 玻璃要一直铺到屏幕最下沿，
        那圈安全区是玻璃自己的内边距，不是外面垫的一块留白。

        v1.8.6：整块收进 `controlNode`。底片计数、缩略图钥匙、工具行档位这些
        "每张照片才变一次"的东西都在这里，不该跟着捏合/对焦的 60Hz 手势重画。
      */}
      {controlNode}

      {/*
        冲印舞台（v1.8.6 · 按需瞬时挂载）。

        这里过去是一个「stage 非空才渲染合成器」的内联三元 —— 门控本身是对的，但它是
        **调用方的自觉**：任何一次重构去掉条件，就会多挂一棵常驻的合成树
        （`ViewShot` + 相框 PNG + 整条图层栈）。现在门控收进 `FilmStageComposer`：
        `stage === null` 时它直接 `return null`，一个原生节点都不挂；`stage` 只在一张
        照片真的要走存盘流程时由 `useFilmStage.mount()` 填上，`unmount()`（`processFilmPhoto`
        的 finally）随后清空 —— 洗完就彻底卸掉。
      */}
      <DevelopOverlay status={status} onDismiss={handleDismiss}>
        <FilmStageComposer
          stage={filmStage.stage}
          viewShotRef={filmStage.viewShotRef}
          onLayout={filmStage.handleStageLayout}
          onImageLoad={filmStage.handleStageImageLoad}
          /*
           * 相框风格变体（v1.7.0 · 模块二）**必须**从设置里传下去。
           *
           * 漏了这一行的后果不是"少个装饰"，而是**预览与成片对不上**：取景器里的
           * `FramePreviewLayer` 拿的是 `settings.frameVariant`，而默认是 `'classic'`，
           * 用户会看到"取景器里是泛黄的老相纸，洗出来却是干净白卡纸" —— 那正是模块三
           * 「所见即所得」要消灭的东西。
           */
          frameVariant={settings.frameVariant}
          /*
           * 日期引擎（v1.8.0 · 模块四）与胶片外观种子（v1.8.0 · 模块一）。
           *
           * `dateEngine` 是**全局设置**而不是预设字段：日期长得像什么与"这卷胶片
           * 是什么性格"是两件事，混进 `presets.ts` 会让同一支卷在不同地区印出
           * 不同格式的日期。取景器预览、成片合成、设置页三处都读它。
           *
           * `lookSeed` 与取景器实时预览用**同一个常量** —— 颗粒与微尘的分布要
           * 逐点重合，否则"所见即所得"就是假的。
           */
          dateEngine={settings.dateEngine}
          lookSeed={LOOK_SEED}
          timestampFontFamily={fonts.fontFamily}
        />
      </DevelopOverlay>

      <FilmDrawer
        visible={filmDrawerVisible}
        presetIndex={presetIndex}
        /*
         * 相框 id 只用来**显示**抽屉里那一行"现在套的是哪款相框"（v1.7.0 · 模块二）。
         * 换相框仍然归取景器左右滑 / 顶栏 `FrameBadge` 管 —— 抽屉里那条横向手势
         * 已经给了 A/B/C 变体，再叠一层"横向换相框"会让同一根手指有两种含义。
         *
         * v1.8.1 的例外是那颗 `00` 角标：它**是**一个按下去就切档的按钮
         * （`onSelectFrame`），因为用户要的是"相框抽屉首页能直接进无相框"，
         * 而左右滑要滑 6 下才轮到 00。它只改 `frameIndex`，不碰抽屉那条手势。
         */
        frameId={frame.id}
        onSelectFrame={handleSelectFrame}
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
    </ThemeScope>
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
    /*
     * 画质档那枚蚀刻标签。刻意长得和 `filmCounter` 是同一族：等宽字体、方括号、
     * 同一支琥珀。区别只在它有描边和一圈内衬 —— 那是"可以按"的暗示。
     *
     * 描边用 `ink.hairline` 而不是琥珀：琥珀在这台机器上是"亮着的东西"（指示灯、
     * 当前档位），一圈琥珀描边会让它看起来**一直在被选中**，反而看不出"现在只是能按"。
     * 按下时才换成 `amberDeep`（见 `qualityChipPressed`）。
     *
     * 内边距 7×3 是量出来的：`[极致]` 在 10pt UI_MONO 下约 34pt 宽，加内衬与描边约 50pt；
     * 和 `filmCounter`（minWidth 42 + marginRight 10）、齿轮（38）并排约 140pt，
     * 375pt 的机型上顶栏还剩约 200pt 给左边的 `FrameBadge`，够。
     */
    qualityChip: {
      marginRight: 10,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ink.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qualityChipPressed: {
      borderColor: ink.amberDeep,
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
    },
    qualityChipDisabled: {
      opacity: 0.4,
    },
    qualityLabel: {
      fontFamily: UI_MONO,
      fontSize: 10,
      letterSpacing: 0.6,
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
    /**
     * 相机层的裁剪容器（v1.8.4）：矩形由 JSX 现算成镂空取景窗的几何，这里只管
     * "绝对定位 + 裁掉窗口外"两件事。`CameraView` 是它的子层，尺寸/偏移来自
     * `cameraGeometry.planCameraLayer()`。
     */
    cameraClip: { position: 'absolute', overflow: 'hidden' },
    liveLook: { position: 'absolute', overflow: 'hidden' },
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
