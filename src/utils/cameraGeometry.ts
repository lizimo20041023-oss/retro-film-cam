/**
 * 相机取景盒几何（v1.8.4）
 * =====================================================================
 * 为什么需要这个模块
 * ---------------------------------------------------------------------
 * expo-camera 57 的 `<CameraView>` 是「铺满自身 bounds、`.resizeAspectFill`」的
 * 实时预览层（`node_modules/expo-camera/ios/Current/CameraView.swift:248-250`
 * `previewLayer.videoGravity = .resizeAspectFill`）。并且 `takePictureAsync` 出来的
 * 成片**会被裁成预览层的宽高比**：
 *   `node_modules/expo-camera/ios/Current/CameraPhotoCapture.swift:187-190`
 *   `let cropRect = CGRect(x: 0, y: 0, width: takenCgImage.width, height: takenCgImage.height)`
 *   `let croppedSize = AVMakeRect(aspectRatio: previewSize, insideRect: cropRect)`
 *   `takenImage = ExpoCameraUtils.crop(image: takenImage, to: croppedSize)`
 * 上一版把 CameraView 铺满整屏（≈9:19.5），于是 4:3 传感器的照片先被裁成竖条
 * （横向只剩 61.5%），再被相框窗口裁一刀 —— 取景器和成片都被连带放大约 1.6~1.9 倍。
 * 这就是「0.5× 看起来和原生 1× 一样、1× 看起来被数码放大了两倍多」的根因。
 *
 * 修法
 * ---------------------------------------------------------------------
 * 给 CameraView 一个**宽高比恒为 4:3**的盒子（`box`），让它居中于取景窗（`clip`）：
 *   - 盒子宽高比 == 传感器宽高比 ⇒ `.resizeAspectFill` 不裁任何东西、expo 的
 *     成片裁切变成恒等（源图保留 3024×4032）；
 *   - 取景窗只露出盒子的中间一块（`visibleFraction`）⇒ 窗口内容 = 传感器上
 *     与窗口同宽高比的最大内接矩形，和成片按窗口裁出来的区域逐点一致。
 *   - `digitalFactor > 1` 时把盒子等比放大（盒子仍居中），窗口露出的传感器范围
 *     缩小为 1/digitalFactor ⇒ 这就是 35mm / 52mm 两档的「确定性数码裁切」，
 *     不依赖 expo-camera 那个无法从 JS 读到的 `videoMaxZoomFactor`。
 * `planPhotoCrop` 给出成片一侧的对应裁切矩形：两边都从「传感器整幅」出发，
 * 所以取景（WYSIWYG）在结构上成立。
 *
 * 纯函数、无 React Native 依赖、无副作用。越界输入全部退化为恒等（factor=1）。
 */

/** 4:3 传感器竖拍方向的宽/高（0.75）。expo-camera 的 photo 输出默认是 4:3。 */
export const SENSOR_ASPECT = 3 / 4;

export interface CameraSize {
  readonly width: number;
  readonly height: number;
}

export interface CameraRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface CameraLayerPlan {
  /** 取景窗在预览容器坐标系里的矩形，父容器（`overflow:'hidden'`）的裁剪区。 */
  readonly clip: CameraRect;
  /** CameraView 实际布局尺寸：宽高比恒为传感器比例，被 digitalFactor 等比放大。 */
  readonly box: CameraSize;
  /** CameraView 左上角相对 `clip` 左上角的偏移（居中 ⇒ 通常为负）。 */
  readonly offset: { readonly x: number; readonly y: number };
  /** 窗口占传感器整幅的比例（每个分量 ∈ (0, 1]）。成片按它反推裁切矩形。 */
  readonly visibleFraction: { readonly x: number; readonly y: number };
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** 把 digitalFactor 收敛成 ≥1 的有限数；非法输入退化为 1。 */
export function clampDigitalFactor(factor: number | undefined): number {
  if (factor === undefined || !Number.isFinite(factor) || factor < 1) {
    return 1;
  }
  return factor;
}

/**
 * 规划取景窗里的相机层。
 *
 * `window` 用预览容器（`previewBox`）坐标系；`digitalFactor` 是最多 8 倍左右的
 * 数码裁切因子（35mm 档 ≈ 1.346、52mm 档 2、捏合/刻度尺不在其中——那两条走原生
 * `zoom`）。返回值里的 `box` / `offset` 直接给 CameraView 的 `style` 用。
 */
export function planCameraLayer(
  window: CameraRect,
  digitalFactor = 1,
  sensorAspect = SENSOR_ASPECT,
): CameraLayerPlan {
  const clip: CameraRect = {
    left: window.left,
    top: window.top,
    width: Math.max(0, window.width),
    height: Math.max(0, window.height),
  };
  const safeAspect = isPositiveFinite(sensorAspect) ? sensorAspect : SENSOR_ASPECT;
  const factor = clampDigitalFactor(digitalFactor);
  if (!isPositiveFinite(clip.width) || !isPositiveFinite(clip.height)) {
    return {
      clip,
      box: { width: Math.max(0, clip.width), height: Math.max(0, clip.height) },
      offset: { x: 0, y: 0 },
      visibleFraction: { x: 1, y: 1 },
    };
  }

  const windowAspect = clip.width / clip.height;
  // 窗口比传感器「矮胖」：盒子以窗口宽度为准、高度由传感器比例撑开；
  // 否则以窗口高度为准、宽度由比例撑开。两种情况盒子都 ≥ 窗口，居中后被裁。
  let baseWidth: number;
  let baseHeight: number;
  if (windowAspect >= safeAspect) {
    baseWidth = clip.width;
    baseHeight = clip.width / safeAspect;
  } else {
    baseHeight = clip.height;
    baseWidth = clip.height * safeAspect;
  }

  const width = baseWidth * factor;
  const height = baseHeight * factor;
  const offsetX = (clip.width - width) / 2;
  const offsetY = (clip.height - height) / 2;

  return {
    clip,
    box: { width, height },
    offset: { x: offsetX, y: offsetY },
    visibleFraction: {
      x: clip.width / width,
      y: clip.height / height,
    },
  };
}

/**
 * 成片一侧的裁切矩形：从「相机原图整幅」里裁出与 live 窗口完全对应的区域。
 *
 * `photo` 是 `takePictureAsync` 返回的原图尺寸（相机盒子宽高比 = 传感器比例时，
 * 它就是 4:3 全幅，不会被 expo 预先裁掉）；`windowAspect` 是相框窗口的宽高比；
 * `digitalFactor` 必须与 `planCameraLayer` 收到的是同一个值。
 *
 * 结果保证：宽/高 = windowAspect（取整误差 ≤1px）、完全居中、宽高 ≥1 且不越界。
 */
export function planPhotoCrop(
  photo: CameraSize,
  windowAspect: number,
  digitalFactor = 1,
  sensorAspect = SENSOR_ASPECT,
): CameraRect {
  const photoWidth = Math.max(0, Math.round(photo.width));
  const photoHeight = Math.max(0, Math.round(photo.height));
  const safeAspect = isPositiveFinite(windowAspect) ? windowAspect : 1;
  const factor = clampDigitalFactor(digitalFactor);
  if (!isPositiveFinite(photoWidth) || !isPositiveFinite(photoHeight)) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const safeSensor = isPositiveFinite(sensorAspect) ? sensorAspect : photoWidth / photoHeight;

  let width: number;
  let height: number;
  if (safeAspect >= safeSensor) {
    width = photoWidth;
    height = photoWidth / safeAspect;
  } else {
    height = photoHeight;
    width = photoHeight * safeAspect;
  }

  const croppedWidth = Math.max(1, Math.min(photoWidth, Math.round(width / factor)));
  const croppedHeight = Math.max(1, Math.min(photoHeight, Math.round(height / factor)));
  const left = Math.max(0, Math.min(photoWidth - croppedWidth, Math.round((photoWidth - croppedWidth) / 2)));
  const top = Math.max(0, Math.min(photoHeight - croppedHeight, Math.round((photoHeight - croppedHeight) / 2)));

  return { left, top, width: croppedWidth, height: croppedHeight };
}

/**
 * 把「预览容器 0~1 归一化点」（点击对焦用的坐标）换算成「相机层 0~1」。
 *
 * 相机层被 `clip` 裁剪、并且相对窗口有 `offset`，所以不能直接拿预览比例当相机比例。
 * 输入点先按 `preview` 还原成预览容器坐标，再减去窗口原点与偏移、除以盒子尺寸。
 * 结果夹到 [0,1]（窗口边缘外的点会被收敛到边上，避免原生层收到越界坐标）。
 */
export function focusPointInCamera(
  point: { readonly x: number; readonly y: number },
  preview: CameraSize,
  layer: Pick<CameraLayerPlan, 'clip' | 'box' | 'offset'>,
): { x: number; y: number } {
  const previewWidth = Math.max(0, preview.width);
  const previewHeight = Math.max(0, preview.height);
  const boxWidth = Math.max(1, layer.box.width);
  const boxHeight = Math.max(1, layer.box.height);
  const rawX = Number.isFinite(point.x) ? point.x : 0.5;
  const rawY = Number.isFinite(point.y) ? point.y : 0.5;
  const absoluteX = rawX * previewWidth - layer.clip.left - layer.offset.x;
  const absoluteY = rawY * previewHeight - layer.clip.top - layer.offset.y;
  const x = Math.min(1, Math.max(0, absoluteX / boxWidth));
  const y = Math.min(1, Math.max(0, absoluteY / boxHeight));
  return { x, y };
}

/** 预览尺寸包装：给 `focusPointInCamera` 用，避免每个调用点自己拼对象。 */
export function cameraSizeOf(size: CameraSize): CameraSize {
  return { width: Math.max(0, size.width), height: Math.max(0, size.height) };
}
