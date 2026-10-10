/**
 * 主相机屏幕 —— 单屏完成"取景 → 拍摄 → 显影 → 存相册"。
 *
 * 取景器里**只有**三样东西（严格遵守"不做实时 GLSL / 不逐帧处理"的约束）：
 *   1. `CameraView` 原始实时画面；
 *   2. 半透明引导 UI（九宫格 + 相框轮廓）；
 *   3. 相框 PNG 遮罩（按 `computeFrameLayout` 算出来的位置和尺寸画）。
 *
 * 调色/颗粒/暗角/日期/相框这些"重活"全部发生在按快门之后：
 *   takePictureAsync → processFilmPhoto（合成视图 + captureRef）→ Asset.create 存相册。
 * 合成视图渲染在 `DevelopOverlay` 的暖黑幕布上（必须真的上屏，iOS 才截得到），
 * 而这层幕布本身在 ViewShot 之外，不会被截进成片。
 *
 * 手势分工：
 *   · 取景器区域 → `FrameSwitcher`（左右滑动换相框，拖动只 setValue 不重渲染）；
 *   · 顶部右侧 → 补光 / 前后摄翻转；
 *   · 底部 → 预设胶囊（轻触循环）+ 快门。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { CameraType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_FRAME_ID, FRAMES, findFrameIndex, wrapIndex } from '../constants/frames';
import {
  DEFAULT_PRESET_ID,
  PRESETS,
  findPresetIndex,
  resolvePreset,
  wrapPresetIndex,
} from '../constants/presets';
import { useFilmFonts } from '../hooks/useFilmFonts';
import { useFilmStage } from '../hooks/useFilmStage';
import type { CapturedPhoto, DevelopStatus, Rect, Size } from '../types';
import { describeError } from '../utils/describeError';
import { computeFrameLayout } from '../utils/geometry';
import { processAndSaveFilmPhoto } from '../utils/processFilmPhoto';
import { DevelopOverlay, computeDevelopStageBox } from './DevelopOverlay';
import { FilmCompositor } from './FilmCompositor';
import { FrameOverlay } from './FrameOverlay';
import { FrameSwitcher } from './FrameSwitcher';
import { PermissionNotice } from './PermissionNotice';
import { ShutterButton } from './ShutterButton';

/** 取景器里相框四周留白。 */
const PREVIEW_PADDING = 10;

export function CameraScreen() {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const fonts = useFilmFonts();
  const filmStage = useFilmStage();
  const [cameraPermission, requestCameraPermission, getCameraPermission] = useCameraPermissions();

  /* ---------------- 状态 ---------------- */
  const [frameIndex, setFrameIndex] = useState<number>(() => findFrameIndex(DEFAULT_FRAME_ID));
  const [presetIndex, setPresetIndex] = useState<number>(() => findPresetIndex(DEFAULT_PRESET_ID));
  const [facing, setFacing] = useState<CameraType>('back');
  const [torchOn, setTorchOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [mountError, setMountError] = useState<string | null>(null);
  const [status, setStatus] = useState<DevelopStatus>({ kind: 'idle' });
  const [saveIssue, setSaveIssue] = useState<string | null>(null);
  const [previewBox, setPreviewBox] = useState<Size>({ width: 0, height: 0 });

  /* ---------------- refs ---------------- */
  const cameraRef = useRef<ComponentRef<typeof CameraView>>(null);
  /** 同步防连点锁：`disabled` 属性挡不住"同一帧内的第二次点击"，这个能。 */
  const shotLockRef = useRef(false);
  const askedCameraRef = useRef(false);

  /* ---------------- 派生数据（全部来自纯数据常量） ---------------- */
  const frame = FRAMES[frameIndex] ?? FRAMES[0];
  const preset = PRESETS[presetIndex] ?? PRESETS[0];
  const resolved = useMemo(() => resolvePreset(preset), [preset]);

  const developing = status.kind === 'developing';
  const cameraGranted = cameraPermission?.granted === true;
  const interactive = !developing && cameraGranted;

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

  const handleCameraReady = useCallback(() => {
    setCameraReady(true);
    setMountError(null);
  }, []);

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

  const handlePresetCycle = useCallback(() => {
    void Haptics.selectionAsync();
    setPresetIndex((current) => wrapPresetIndex(current + 1));
  }, []);

  const handleFlipCamera = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
    // 前置没有补光灯，翻转时顺手关掉，避免状态残留
    setTorchOn(false);
  }, []);

  const handleToggleTorch = useCallback(() => {
    void Haptics.selectionAsync();
    setTorchOn((current) => !current);
  }, []);

  const handleOpenSettings = useCallback(() => {
    void Linking.openSettings();
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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const shot = await camera.takePictureAsync({ quality: 1, exif: false });
      if (!shot || !shot.uri) {
        throw new Error('相机没有返回照片，请重试（Expo Go 里偶尔会拿不到临时文件）');
      }

      const captured: CapturedPhoto = {
        uri: shot.uri,
        width: shot.width,
        height: shot.height,
      };

      const result = await processAndSaveFilmPhoto({
        photo: captured,
        frame,
        preset,
        stage: stageBox,
        host: filmStage.host,
        onStage: (nextStage) => setStatus({ kind: 'developing', stage: nextStage }),
      });

      setStatus({ kind: 'done', uri: result.photo.uri, saved: result.save.ok });
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
  }, [cameraReady, developing, filmStage.host, frame, preset, stageBox]);

  /* ---------------- 覆盖层内容（权限 / 加载 / 相机错误） ---------------- */
  let noticeNode: ReactNode = null;
  if (cameraPermission === null) {
    noticeNode = <ActivityIndicator color="#FFB562" />;
  } else if (!cameraPermission.granted) {
    noticeNode = (
      <PermissionNotice
        title="需要相机权限"
        message="App 只在本地取景和合成，不会上传任何照片。"
        actionLabel={cameraPermission.canAskAgain ? '允许使用相机' : '去系统设置'}
        onAction={() => {
          if (cameraPermission.canAskAgain) {
            void requestCameraPermission();
          } else {
            handleOpenSettings();
          }
        }}
        secondaryLabel={cameraPermission.canAskAgain ? undefined : '重新检测'}
        onSecondary={
          cameraPermission.canAskAgain
            ? undefined
            : () => {
                void getCameraPermission();
              }
        }
        hint={
          cameraPermission.canAskAgain
            ? undefined
            : 'iOS：设置 → 隐私与安全性 → 相机；Android：设置 → 应用 → 权限。授权后回到 App 点"重新检测"。'
        }
      />
    );
  } else if (mountError !== null) {
    noticeNode = (
      <PermissionNotice
        title="相机启动失败"
        message={mountError}
        actionLabel="重试"
        onAction={handleRetryCamera}
        hint="如果一直失败：关掉 Expo Go 重新扫码，或改用 npx expo start --tunnel。"
      />
    );
  }

  return (
    <View style={styles.root}>
      {/* ================= 取景器 ================= */}
      <View style={styles.preview} onLayout={handlePreviewLayout}>
        {cameraGranted ? (
          <CameraView
            key={cameraKey}
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mode="picture"
            flash="off"
            enableTorch={torchOn && facing === 'back'}
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
              {resolved.showGuide ? <GuideLines rect={previewLayout.window} /> : null}
              <FrameOverlay frame={frame} layout={previewLayout} />
            </View>
          </FrameSwitcher>
        ) : null}

        {/* 顶部信息 + 快捷开关 */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <View style={styles.pill} pointerEvents="none">
            <Text style={styles.pillTitle}>{frame.name}</Text>
            <Text style={styles.pillSub}>
              {frameIndex + 1}/{FRAMES.length} · {preset.name}
            </Text>
          </View>

          <View style={styles.topActions} pointerEvents="box-none">
            <RoundButton
              glyph="☀"
              active={torchOn}
              disabled={facing === 'front'}
              onPress={handleToggleTorch}
              accessibilityLabel={torchOn ? '关闭补光' : '打开补光'}
            />
            <RoundButton
              glyph="⟲"
              onPress={handleFlipCamera}
              accessibilityLabel="切换前后摄像头"
            />
          </View>
        </View>

        {/* 保存失败（通常是相册权限）：不阻塞拍摄，给一次"去设置" */}
        {saveIssue !== null ? (
          <View style={[styles.banner, { bottom: 12 }]}>
            <Text style={styles.bannerText}>{saveIssue}</Text>
            <View style={styles.bannerActions}>
              <Pressable accessibilityRole="button" onPress={handleOpenSettings} hitSlop={8}>
                <Text style={styles.bannerAction}>去设置</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSaveIssue(null)}
                hitSlop={8}
              >
                <Text style={styles.bannerAction}>知道了</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      {/* ================= 底部控制 ================= */}
      <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        <View style={styles.side}>
          <Text style={styles.sideLabel}>预设</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`当前预设 ${preset.name}，轻触切换`}
            onPress={handlePresetCycle}
            disabled={!interactive}
            hitSlop={8}
            style={({ pressed }) => [styles.presetChip, pressed ? styles.pressed : null]}
          >
            <Text style={styles.presetName}>{preset.name}</Text>
            <Text style={styles.presetSub}>
              {presetIndex + 1}/{PRESETS.length} · 轻触切换
            </Text>
          </Pressable>
        </View>

        <ShutterButton
          onPress={() => {
            void handleShutter();
          }}
          busy={developing}
          disabled={!cameraReady || !cameraGranted}
        />

        <View style={[styles.side, styles.sideRight]}>
          <Text style={styles.sideLabel}>相框</Text>
          <Text style={styles.sideHint}>← 滑动取景器 →</Text>
        </View>
      </View>

      {/* 底部一行：当前参数（调参时最有用的反馈） */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={[styles.swatch, { backgroundColor: resolved.timestamp.color }]} />
        <Text style={styles.footerText} numberOfLines={2}>
          {resolved.timestamp.enabled
            ? `日期 ${resolved.timestamp.format} · ${resolved.timestamp.anchor ?? frame.defaultTimestampAnchor ?? 'window'}`
            : '日期已关闭'}
          {` · 颗粒 ${resolved.grain.toFixed(2)} · 暗角 ${resolved.vignette.toFixed(2)} · 漏光 ${resolved.lightLeak.toFixed(2)}`}
          {` · 字体 ${fonts.source === 'custom' ? '自定义' : '系统等宽'}`}
        </Text>
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

      {/* ================= 权限 / 错误提示（最上层） ================= */}
      {noticeNode !== null ? (
        <View style={styles.noticeLayer}>{noticeNode}</View>
      ) : null}
    </View>
  );
}

/* ==========================================================================
 * 内部小组件
 * ========================================================================== */

/** 九宫格 + 中心参考点（纯静态，不做实时水平仪）。对齐的是**画面窗口**，不是整张相框。 */
function GuideLines({ rect }: { rect: Rect }) {
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
      <View style={[styles.guideCenter, { left: rect.width / 2 - 9, top: rect.height / 2 - 1 }]} />
    </View>
  );
}

interface RoundButtonProps {
  glyph: string;
  onPress: () => void;
  accessibilityLabel: string;
  active?: boolean;
  disabled?: boolean;
}

function RoundButton({
  glyph,
  onPress,
  accessibilityLabel,
  active = false,
  disabled = false,
}: RoundButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.roundButton,
        active ? styles.roundButtonActive : null,
        disabled ? styles.roundButtonDisabled : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={[styles.roundButtonGlyph, active ? styles.roundButtonGlyphActive : null]}>
        {glyph}
      </Text>
    </Pressable>
  );
}

/* ==========================================================================
 * 样式
 * ========================================================================== */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  preview: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#0A0A0B',
  },
  canvas: {
    position: 'absolute',
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    maxWidth: '62%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  pillTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  pillSub: {
    marginTop: 2,
    color: 'rgba(255, 255, 255, 0.66)',
    fontSize: 11,
  },
  roundButton: {
    width: 42,
    height: 42,
    marginLeft: 10,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  roundButtonActive: {
    backgroundColor: 'rgba(255, 138, 0, 0.9)',
  },
  roundButtonDisabled: {
    opacity: 0.35,
  },
  roundButtonGlyph: {
    color: '#FFFFFF',
    fontSize: 19,
    lineHeight: 23,
  },
  roundButtonGlyphActive: {
    color: '#1A1005',
  },
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(20, 16, 12, 0.92)',
  },
  bannerText: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 13,
    lineHeight: 19,
  },
  bannerActions: {
    marginTop: 10,
    flexDirection: 'row',
  },
  bannerAction: {
    marginRight: 18,
    color: '#FF8A00',
    fontSize: 14,
    fontWeight: '700',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 16,
    backgroundColor: '#0B0B0C',
  },
  side: {
    flex: 1,
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  sideLabel: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
    letterSpacing: 1,
  },
  sideHint: {
    marginTop: 6,
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 13,
  },
  presetChip: {
    marginTop: 4,
  },
  presetName: {
    color: '#FF8A00',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  presetSub: {
    marginTop: 2,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
  },
  pressed: {
    opacity: 0.65,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 10,
    backgroundColor: '#0B0B0C',
  },
  swatch: {
    width: 12,
    height: 12,
    marginRight: 8,
    borderRadius: 3,
  },
  footerText: {
    flex: 1,
    color: 'rgba(255, 255, 255, 0.42)',
    fontSize: 11,
    lineHeight: 16,
  },
  noticeLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  guideHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  guideCenter: {
    position: 'absolute',
    width: 18,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
});
