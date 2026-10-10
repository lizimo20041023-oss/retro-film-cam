/**
 * 主相机屏幕 —— 单屏完成"取景 → 拍摄 → 显影 → 存相册"。
 *
 * ── 视觉结构（自上而下四段，取景器不再被任何浮层遮挡） ────────────────────────
 *   ① 顶部操作栏 TopPanel   极窄一条，位于灵动岛下方、取景器**之上**：
 *                           左侧是等宽字微标签（相框 · 序号 · 预设），
 *                           右侧是两枚 44pt 机械拨轮（补光 / 镜头反转）。
 *   ② 取景器 Viewfinder     flex:1，只有三样东西（严格遵守"不做实时 GLSL"的约束）：
 *                           `CameraView` 原始实时画面 + 半透明引导 UI + 相框 PNG 遮罩。
 *   ③ 底部主控 Dashboard    预设拨轮 + 纸质标签预设卡 | 快门 | 相框步进器。
 *   ④ 状态条 StatusPanel    超低对比度方框 + 琥珀色等宽字，显示当前显影参数。
 *
 * 底纹：整机背景是一张 160×160 的暗色皮革 tile（`assets/ui/leather-tile.png`，
 * `resizeMode="repeat"`），亮度只有 ±2/255 —— 远看是 #171716 的纯色，近看才有质感。
 *
 * ── 调色/合成 ────────────────────────────────────────────────────────────────
 * 调色/颗粒/暗角/日期/相框这些"重活"全部发生在按快门之后：
 *   takePictureAsync → processFilmPhoto（合成视图 + captureRef）→ Asset.create 存相册。
 * 合成视图渲染在 `DevelopOverlay` 的暖黑幕布上（必须真的上屏，iOS 才截得到），
 * 而这层幕布本身在 ViewShot 之外，不会被截进成片。
 * ⚠️ 因此上面 ①③④ 三段里的任何东西都**不会**出现在成片里 —— 成片只有：
 *    画面 + 调色图层 + 相框 PNG + 日期。想改成片请改 `FilmCompositor`。
 *
 * ── 手势分工 ────────────────────────────────────────────────────────────────
 *   · 取景器区域 → `FrameSwitcher`（左右滑动换相框，拖动只 setValue 不重渲染）；
 *   · 顶部右侧拨轮 → 补光 / 前后摄翻转；
 *   · 底部 → 预设拨轮与预设卡（轻触循环）+ 相框 ‹ › 步进 + 快门。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
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
  DEFAULT_GRAIN_LEVEL_ID,
  GRAIN_LEVELS,
  applyGrainLevel,
  findGrainLevelIndex,
  grainLevelAt,
} from '../constants/grain';
import {
  DEFAULT_PRESET_ID,
  PRESETS,
  findPresetIndex,
  resolvePreset,
  wrapPresetIndex,
} from '../constants/presets';
import { INK, UI_MONO, compact } from '../constants/theme';
import { UI_ASSETS } from '../constants/uiAssets';
import { useI18n } from '../i18n';
import { useFilmFonts } from '../hooks/useFilmFonts';
import { useFilmStage } from '../hooks/useFilmStage';
import { useLocationStamp } from '../hooks/useLocationStamp';
import type { CapturedPhoto, DevelopStatus, Rect, Size } from '../types';
import { describeError } from '../utils/describeError';
import { computeFrameLayout } from '../utils/geometry';
import { LOCATION_FAILURE_COPY } from '../utils/locationStamp';
import { processAndSaveFilmPhoto } from '../utils/processFilmPhoto';
import { DevelopOverlay, computeDevelopStageBox } from './DevelopOverlay';
import { DialButton } from './DialButton';
import { FilmCompositor } from './FilmCompositor';
import { FrameOverlay } from './FrameOverlay';
import { FrameSwitcher } from './FrameSwitcher';
import { PermissionNotice } from './PermissionNotice';
import { SettingsScreen } from './SettingsScreen';
import { ShutterButton } from './ShutterButton';

/** 取景器里相框四周留白。 */
const PREVIEW_PADDING = 10;

export function CameraScreen() {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const fonts = useFilmFonts();
  const filmStage = useFilmStage();
  const locationStamp = useLocationStamp();
  const { t } = useI18n();
  const [cameraPermission, requestCameraPermission, getCameraPermission] = useCameraPermissions();

  /* ---------------- 状态 ---------------- */
  const [frameIndex, setFrameIndex] = useState<number>(() => findFrameIndex(DEFAULT_FRAME_ID));
  const [presetIndex, setPresetIndex] = useState<number>(() => findPresetIndex(DEFAULT_PRESET_ID));
  const [grainIndex, setGrainIndex] = useState<number>(() =>
    findGrainLevelIndex(DEFAULT_GRAIN_LEVEL_ID),
  );
  const [facing, setFacing] = useState<CameraType>('back');
  const [torchOn, setTorchOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [mountError, setMountError] = useState<string | null>(null);
  const [status, setStatus] = useState<DevelopStatus>({ kind: 'idle' });
  const [saveIssue, setSaveIssue] = useState<string | null>(null);
  const [previewBox, setPreviewBox] = useState<Size>({ width: 0, height: 0 });
  /** 设置界面（整屏覆盖层，不是导航栈里的一个页面）。 */
  const [settingsVisible, setSettingsVisible] = useState(false);

  /* ---------------- refs ---------------- */
  const cameraRef = useRef<ComponentRef<typeof CameraView>>(null);
  /** 同步防连点锁：`disabled` 属性挡不住"同一帧内的第二次点击"，这个能。 */
  const shotLockRef = useRef(false);
  const askedCameraRef = useRef(false);

  /* ---------------- 派生数据（全部来自纯数据常量） ---------------- */
  const frame = FRAMES[frameIndex] ?? FRAMES[0];
  const preset = PRESETS[presetIndex] ?? PRESETS[0];
  const grainLevel = grainLevelAt(grainIndex);
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
  const timestampAnchor = resolved.timestamp.anchor ?? frame.defaultTimestampAnchor ?? 'window';
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

  /** 底部 ‹ › 步进换相框（和滑动走同一条 state，所以两边永远同步）。 */
  const handleStepFrame = useCallback((direction: -1 | 1) => {
    void Haptics.selectionAsync();
    setFrameIndex((current) => wrapIndex(current + direction));
  }, []);

  const handlePresetCycle = useCallback(() => {
    void Haptics.selectionAsync();
    setPresetIndex((current) => wrapPresetIndex(current + 1));
  }, []);

  /** 颗粒分段按钮：直接跳到第 index 档（越界夹回边界，不循环）。 */
  const handleGrainSelect = useCallback((next: number) => {
    void Haptics.selectionAsync();
    const last = Math.max(0, GRAIN_LEVELS.length - 1);
    setGrainIndex(Math.min(Math.max(Math.trunc(next), 0), last));
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

  const handleOpenSystemSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const handleOpenSettingsScreen = useCallback(() => {
    void Haptics.selectionAsync();
    setSettingsVisible(true);
  }, []);

  const handleCloseSettingsScreen = useCallback(() => {
    setSettingsVisible(false);
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

      const locationText = await locationPromise;

      const result = await processAndSaveFilmPhoto({
        photo: captured,
        frame,
        // 传乘过颗粒档位的预设：LCD 上显示什么数字，出片就是什么力度
        preset: effectivePreset,
        stage: stageBox,
        host: filmStage.host,
        locationText,
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
    t,
  ]);

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
        <View style={styles.topLabel}>
          <View style={styles.topLabelRule} />
          <Text style={styles.topLabelText} numberOfLines={1}>
            {frameName}
            <Text style={styles.topLabelDim}>{'  ·  '}</Text>
            <Text style={styles.topLabelIndex}>
              {frameIndex + 1}/{FRAMES.length}
            </Text>
            <Text style={styles.topLabelDim}>{'  ·  '}</Text>
            {preset.name}
          </Text>
        </View>

        {/*
          拨轮下面补一行"蚀刻"小字。图标在盘面上只占 21pt，
          纯图形认不出功能（真机身也是靠刻字说明的），
          所以这里不用 tooltip、不弹提示，就把字刻在按钮底下。
        */}
        <View style={styles.topActions}>
          <View style={styles.topActionItem}>
            <DialButton
              icon={torchOn ? UI_ASSETS.iconTorchOn : UI_ASSETS.iconTorch}
              active={torchOn}
              disabled={facing === 'front'}
              onPress={handleToggleTorch}
              accessibilityLabel={torchOn ? t('camera.torch.on') : t('camera.torch.off')}
            />
            <Text style={styles.topActionLabel}>{t('camera.torch.label')}</Text>
          </View>
          <View style={styles.topActionsGap} />
          <View style={styles.topActionItem}>
            <DialButton
              icon={UI_ASSETS.iconFlip}
              onPress={handleFlipCamera}
              accessibilityLabel={t('camera.flip.a11y')}
            />
            <Text style={styles.topActionLabel}>{t('camera.flip.label')}</Text>
          </View>
          <View style={styles.topActionsGap} />
          <View style={styles.topActionItem}>
            <DialButton
              icon={UI_ASSETS.iconSettings}
              active={settingsVisible}
              onPress={handleOpenSettingsScreen}
              accessibilityLabel={t('camera.settings.a11y')}
            />
            <Text style={styles.topActionLabel}>{t('camera.settings.label')}</Text>
          </View>
        </View>
      </View>

      {/* ================= ② 取景器 ================= */}
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
              {resolved.showGuide ? <GuideGrid rect={previewLayout.window} /> : null}
              <FocusBrackets rect={previewLayout.window} />
              <FrameOverlay frame={frame} layout={previewLayout} />
            </View>
          </FrameSwitcher>
        ) : null}

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

      {/* ================= ③ 底部主控 ================= */}
      <View style={styles.dashboard}>
        <View style={styles.dashSide}>
          <DialButton
            icon={UI_ASSETS.iconFilm}
            onPress={handlePresetCycle}
            disabled={!interactive}
            accessibilityLabel={t('camera.preset.a11y', { name: preset.name })}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('camera.preset.a11y', { name: preset.name })}
            onPress={handlePresetCycle}
            disabled={!interactive}
            hitSlop={6}
            style={({ pressed }) => [styles.presetCard, pressed ? styles.pressed : null]}
          >
            <Text style={styles.presetCardHead}>{t('camera.preset.head')}</Text>
            <Text
              style={styles.presetCardName}
              numberOfLines={1}
              /* 预设名最长的 "EXPIRED 64" 在 12pt Menlo 下约 76pt，
                 而卡片实际只有 ~76pt —— 让它自动缩一点比省略号好看（iOS 有效）。 */
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {preset.name}
            </Text>
            <Text style={styles.presetCardHint}>
              {t('camera.preset.hint', { index: presetIndex + 1, total: PRESETS.length })}
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

        <View style={[styles.dashSide, styles.dashSideRight]}>
          <Text style={styles.dashLabel}>{t('camera.frame.label')}</Text>
          <View style={styles.frameNav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('camera.frame.prev')}
              disabled={!interactive}
              onPress={() => handleStepFrame(-1)}
              hitSlop={10}
              style={({ pressed }) => [pressed ? styles.pressed : null]}
            >
              <Text style={styles.frameArrow}>‹</Text>
            </Pressable>
            <Text style={styles.frameNavIndex}>
              {frameIndex + 1}/{FRAMES.length}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('camera.frame.next')}
              disabled={!interactive}
              onPress={() => handleStepFrame(1)}
              hitSlop={10}
              style={({ pressed }) => [pressed ? styles.pressed : null]}
            >
              <Text style={styles.frameArrow}>›</Text>
            </Pressable>
          </View>
          <Text style={styles.dashHint}>{t('camera.frame.hint')}</Text>
        </View>
      </View>

      {/* ============ ③.5 颗粒强度（用户级微调：乘在当前预设之上） ============ */}
      <View style={styles.grainBar}>
        <Text style={styles.grainBarLabel}>{t('grain.label')}</Text>
        <View style={styles.grainSegments}>
          {GRAIN_LEVELS.map((level, index) => {
            const active = index === grainIndex;
            const label = level.labelKey !== undefined ? t(level.labelKey) : level.label;
            return (
              <Pressable
                key={level.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t('grain.a11y', { label })}
                disabled={!interactive}
                onPress={() => handleGrainSelect(index)}
                hitSlop={2}
                style={({ pressed }) => [
                  styles.grainSegment,
                  index > 0 ? styles.grainSegmentDivider : null,
                  active ? styles.grainSegmentActive : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.grainSegmentText,
                    active ? styles.grainSegmentTextActive : null,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ================= ④ 底部 LCD 状态条 ================= */}
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

      {/* ================= 权限 / 错误提示（最上层） ================= */}
      {noticeNode !== null ? (
        <View style={styles.noticeLayer}>{noticeNode}</View>
      ) : null}

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
  topLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    paddingRight: 10,
  },
  topLabelRule: {
    width: 2,
    height: 20,
    marginRight: 8,
    backgroundColor: 'rgba(194, 122, 48, 0.60)',
  },
  topLabelText: {
    flexShrink: 1,
    color: INK.paperDim,
    fontSize: 10,
    letterSpacing: 1.4,
    fontFamily: UI_MONO,
  },
  topLabelIndex: {
    color: INK.amber,
  },
  topLabelDim: {
    color: INK.paperFaint,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topActionItem: {
    alignItems: 'center',
  },
  topActionLabel: {
    marginTop: 2,
    color: INK.paperFaint,
    fontSize: 8,
    letterSpacing: 0.6,
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
  canvas: {
    position: 'absolute',
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

  /* ---------------- ③ 底部主控 ---------------- */
  dashboard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
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
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexShrink: 0,
  },
  presetCard: {
    /* 这一侧总共只有约 141pt（屏幕扣掉两侧留白与快门后对半分），
       所以内边距和左间距都刻意收紧，把宽度让给预设名。 */
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(194, 122, 48, 0.55)',
    borderRadius: 3,
    backgroundColor: 'rgba(211, 158, 89, 0.075)',
    flexShrink: 1,
  },
  presetCardHead: {
    color: 'rgba(211, 158, 89, 0.62)',
    fontSize: 7.5,
    letterSpacing: 1.5,
    fontFamily: UI_MONO,
  },
  presetCardName: {
    marginTop: 2,
    color: INK.amberSoft,
    fontSize: 12,
    letterSpacing: 0.4,
    fontFamily: UI_MONO,
  },
  presetCardHint: {
    marginTop: 2,
    color: INK.paperDim,
    fontSize: 8.5,
    letterSpacing: 0.5,
    fontFamily: UI_MONO,
  },
  dashLabel: {
    color: INK.paperDim,
    fontSize: 9,
    letterSpacing: 1.6,
    fontFamily: UI_MONO,
  },
  frameNav: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  frameArrow: {
    color: INK.paper,
    fontSize: 21,
    lineHeight: 23,
    fontFamily: UI_MONO,
  },
  frameNavIndex: {
    marginHorizontal: 6,
    color: INK.amber,
    fontSize: 11,
    letterSpacing: 1,
    fontFamily: UI_MONO,
  },
  dashHint: {
    marginTop: 1,
    color: 'rgba(226, 222, 214, 0.30)',
    fontSize: 8.5,
    letterSpacing: 0.4,
    fontFamily: UI_MONO,
  },
  pressed: {
    opacity: 0.6,
  },

  /* ---------------- ③.5 颗粒强度分段条 ---------------- */
  grainBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 9,
  },
  grainBarLabel: {
    marginRight: 9,
    color: INK.paperDim,
    fontSize: 9,
    letterSpacing: 1.6,
    fontFamily: UI_MONO,
  },
  grainSegments: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(210, 139, 42, 0.30)',
    borderRadius: 3,
    /* 让首尾分段的底色跟着圆角一起被裁掉 */
    overflow: 'hidden',
  },
  grainSegment: {
    flex: 1,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(210, 139, 42, 0.035)',
  },
  grainSegmentDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(210, 139, 42, 0.22)',
  },
  grainSegmentActive: {
    backgroundColor: 'rgba(210, 139, 42, 0.24)',
  },
  grainSegmentText: {
    color: INK.paperDim,
    fontSize: 10.5,
    letterSpacing: 0.6,
    fontFamily: UI_MONO,
  },
  grainSegmentTextActive: {
    color: INK.amberSoft,
    fontWeight: '700',
  },

  /* ---------------- ④ LCD 状态条 ---------------- */
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
