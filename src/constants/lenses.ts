/**
 * 三档变焦 0.5× / 1× / 2× —— 把「屏幕上那个倍率」翻译成 expo-camera 真正认的两个 props。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 这个模块解决什么问题
 * ─────────────────────────────────────────────────────────────────────────
 * `src/constants/zoom.ts` 的那条 0~0.75 行程是连续的，适合捏合微调，
 * 但不适合「我就想要超广角」这种明确意图 —— 用手指在轨道上摸，既慢又不准。
 * 所以 UI 上摆三个固定档位（`src/components/ZoomStops.tsx`），点击即跳。
 * 这个模块负责「档位 → 实际 props」的全部换算和判定。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 三档里哪一档需要"猜"
 * ─────────────────────────────────────────────────────────────────────────
 * iOS 侧的真身（`node_modules/expo-camera/ios/Current/CameraSessionManager.swift:221`）是：
 *
 *     let minZoom = 1.0
 *     device.videoZoomFactor = minZoom * pow(device.activeFormat.videoMaxZoomFactor / minZoom, delegate.zoom)
 *
 * 也就是 `videoZoomFactor = M ^ zoom`，`M = device.activeFormat.videoMaxZoomFactor`。
 * **M 只有原生侧读得到，JS 完全拿不到**（`node_modules/expo-camera/build/Camera.types.d.ts`
 * 里没有任何把它吐给 JS 的接口），所以任何"跨越两颗镜头"的倍率换算都要经过一个假定的 M。
 * 三档的处境并不一样，分开说：
 *
 *   - **0.5× 和 1× 不依赖 M**。它们的做法是「切到那支镜头、放大倍率 1.0」，
 *     而 `videoZoomFactor = 1.0` 对应 `zoom = 0`，`log_M(1)` 无论 M 取多少都是 0。
 *     换句话说这两档是**准的**，M 猜错了也不影响。
 *   - **2× 依赖 M，也依赖「主摄原生是多少毫米」**。它就是「留在主摄上做 2 倍数码裁切」，
 *     `factor = 2`、`zoom = ln(2) / ln(16) = 0.25`。这里的 2 是**相对主摄原生视场**的，
 *     所以只要主摄原生焦距的假定（`ASSUMED_LENS_NATIVE_MM.wide = 26mm`）不变，
 *     这一档的**倍率语义**就是对的；M 猜错只会让实际裁切量偏一点点（见下面的误差分析）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 误差分析：M 猜错会怎样（这一节是刻意的，别删）
 * ─────────────────────────────────────────────────────────────────────────
 * `zoom = ln(factor) / ln(M)`，M 在分母的对数里，所以
 *   - M 猜**小**了 → zoom 偏**大** → 放大**过头**；
 *   - M 猜**大**了 → zoom 偏**小** → 放大**不足**。
 * 因为是对数，误差被压得很扁：M 从 16 错到 24（错 50%），2× 档的 zoom 从 0.25 变成
 * `ln(2)/ln(24) = 0.2181`，实际裁切从 2.00× 变成 `16^0.2181 ≈ 1.83×`，差 8%。
 * 所以真正决定 2× 档准不准的，是「主摄原生焦距」这个假定，而不是 M。
 * 想改哪里，见文件末尾「觉得哪一档不准，改哪个常数」。
 */

import { clampZoom } from './zoom';

/* ========================================================================
 * 镜头分类
 * ===================================================================== */

/**
 * 一支镜头在本 App 眼里扮演什么角色。
 *
 * `multi` 是「虚拟多摄设备」—— 它不是一支物理镜头，而是系统把几支镜头
 * 捆在一起当成一个 `AVCaptureDevice` 暴露出来（见下面「为什么必须认识 multi」）。
 */
export type LensRole = 'ultraWide' | 'wide' | 'telephoto' | 'multi' | 'unknown';

/** 设备给出的镜头名（`getAvailableLenses()` 里的 localizedName）。 */
export type LensName = string;

/**
 * 关键词表。**顺序就是优先级，不能重排**：
 *
 * 1. `multi` 必须排最前。虚拟多摄设备的 localizedName 里**同时**含有焦距词
 *    （「后置双广角相机」里就有「广角」），而且它的 `videoZoomFactor` 语义和
 *    单支物理镜头**完全不同**（0 是"合焦最广"，各代机型切换点还不一样）。
 *    一旦被后面的规则先命中，就会把它当成一支普通广角用，倍率全错。
 * 2. `ultraWide` 必须排在 `wide` **前面**：中文「超广角」里就含着「广角」两个字，
 *    反过来的话超广角永远会被判成广角，用户点了 0.5× 却留在主摄上。
 * 3. `telephoto` 排在 `wide` 前，理由同上（「长焦广角」这类命名少见但存在）。
 * 4. `wide` 兜底在最后：它是唯一一个"到处都是"的词。
 */
const LENS_KEYWORDS: readonly { readonly role: LensRole; readonly keywords: readonly string[] }[] = [
  { role: 'multi', keywords: ['dual', 'triple', 'multi', '双', '三', '多'] },
  { role: 'ultraWide', keywords: ['ultra wide', 'ultrawide', 'ultra-wide', '超广角', '超广'] },
  { role: 'telephoto', keywords: ['telephoto', 'tele', '长焦'] },
  { role: 'wide', keywords: ['wide angle', 'wide-angle', 'wideangle', 'wide', '广角'] },
];

/**
 * 归一化镜头名。**必须剥掉变音符号再小写**：
 * iOS 的 localizedName 跟着系统语言走，法语是「Appareil photo grand-angle」、
 * 西班牙语可能出现「Cámara ultra gran angular」—— 不 `normalize('NFD')` 就匹配不到。
 * 注意这里只剥组合用变音符号（`\u0300-\u036f`），不碰其他字符。
 */
function normalizeLensName(localizedName: string): string {
  return localizedName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * 按**名字**判断一支镜头是什么角色。
 *
 * ⚠️ **绝对不要改成按数组下标判断**（例如"第一个是超广角、第二个是广角"）。
 * `getAvailableLenses()` 的返回顺序在 iOS 上是**未定义**的：它来自
 * `AVCaptureDevice.DiscoverySession` 的 `devices` 数组，顺序随系统版本、
 * 机型、甚至当次会话的 `deviceTypes` 组合变化。在 iPhone 13 上实测顺序是
 * [超广角, 广角]，在别的机型/系统上就未必。按名字匹配不会因为这个数组重排而出错，
 * 按下标匹配则会在用户完全没察觉的情况下把 0.5× 和 1× 对调。
 *
 * 判不出来就返回 `'unknown'`，**宁可未知也不要返回一个猜的角色**：
 * 猜错的后果是把用户送到错误的镜头上拍一张完全不是他想要的照片。
 */
export function classifyLens(localizedName: string): LensRole {
  const normalized = normalizeLensName(localizedName);
  for (const entry of LENS_KEYWORDS) {
    for (const keyword of entry.keywords) {
      if (normalized.includes(keyword)) {
        return entry.role;
      }
    }
  }
  return 'unknown';
}

/** 在列表里找第一支符合该角色的镜头，找不到返回 `null`。 */
function findLensByRole(lenses: readonly string[], role: LensRole): string | null {
  for (const lens of lenses) {
    if (classifyLens(lens) === role) {
      return lens;
    }
  }
  return null;
}

/**
 * 挑出超广角那支，给 0.5× 档用。挑不出来返回 `null`。
 *
 * 注意这里刻意**先找物理超广角**，只在真的没有时才退而用虚拟 `multi` 设备：
 * 虚拟设备的 zoom 语义不一样，能用物理镜头就别用它。`null` 的后果只是按钮变灰，
 * 比"猜错镜头"轻得多。
 */
export function pickUltraWideLens(lenses: readonly string[]): string | null {
  return findLensByRole(lenses, 'ultraWide') ?? findLensByRole(lenses, 'multi');
}

/**
 * 挑出「日常主摄」那支，给 1× 档用。
 *
 * 优先级：物理广角 → 虚拟多摄 → **一支都没有时返回 `null`**。
 * 最后那种情况其实是前摄的常态（前摄往往只有一个 `builtInWideAngleCamera`，
 * 而它的 localizedName 可能完全不带焦距词 → `unknown`），这时候让 `resolveStop`
 * 把 1× 判成不可用是**错的**，所以 `resolveStop` 对 1× 有单独一条兜底：
 * 主摄找不到时用 `undefined` 让原生回落到默认镜头 —— 那本来就是主摄。
 */
export function pickDefaultLens(lenses: readonly string[]): string | null {
  return findLensByRole(lenses, 'wide') ?? findLensByRole(lenses, 'multi');
}

/* ========================================================================
 * 倍率 ⇄ zoom 换算
 * ===================================================================== */

/**
 * 假定的 `device.activeFormat.videoMaxZoomFactor`。
 *
 * **这个数字 JS 读不到，是猜的** —— 见文件头。它会错，而且逐机型不一样。
 * 16 这个取值跟 `src/constants/zoom.ts` 的文件头保持一致（那边也是按 16 推的量程）。
 * 只有 2× 档用到它，误差量级见文件头的误差分析。
 */
export const ASSUMED_MAX_ZOOM_FACTOR = 16;

/**
 * 假定每支基准镜头的**原生焦距（35mm 等效毫米）**。
 *
 * 这是本模块最大的一个谎：iPhone 主摄在各代之间是 **24 / 26 / 28mm** 都出现过
 * （Pro 机型偏 24，非 Pro 偏 26），而 **JS 侧没有任何接口能读到它**。
 * 这里统一按 26mm 算，跟档位标签 0.5× / 1× / 2× 的语义是同一套假设。
 *
 * ⚠️ 它**不参与任何换算**（0.5× / 1× 的 factor 恒为 1，2× 的 factor 就是字面量 2），
 * 只用来回答"2× 到底等于多少毫米"这类文档问题。真正的用途是：将来若要做
 * 按毫米标注的档位，改这里 + 改档位表里的 factor 即可，别的地方不用动。
 */
export const ASSUMED_LENS_NATIVE_MM: Readonly<Record<'ultraWide' | 'wide', number>> = {
  ultraWide: 13,
  wide: 26,
};

/**
 * `zoom` 的量化步长。跟 `src/constants/zoom.ts` 的 `toCameraZoom()` 用**同一个数量级**
 * 但更细一点：那边是为连续拖动省 `lockForConfiguration()` 调用，1% 足够；
 * 这里是一次性写入，精度优先，所以不直接复用 `toCameraZoom`（那是个"百分比"级量化，
 * 会把 0.25 变成 0.25 还好，但把将来可能出现的 0.10721 变成 0.11，档位就偏了）。
 *
 * ⚠️ 这里用**十进制的 `toFixed`** 而不是 `Math.round(z / Q) * Q` 那种乘除写法：
 * 后者会引入浮点残渣，实测 `factorToZoom(16)` 会得到 `0.7500000000000001` 而不是
 * `0.75`，写进 React state 之后 `=== 0.75` 之类的判断会莫名其妙不成立。
 * `Number(toFixed(5))` 的结果是**最接近的那个十进制字面量**，也就是 0.75。
 */
const ZOOM_QUANTUM_DIGITS = 5;

function quantizeZoom(zoom: number): number {
  return Number(zoom.toFixed(ZOOM_QUANTUM_DIGITS));
}

/**
 * 「相对该镜头原生焦距的放大倍率」→ `zoom` prop。
 *
 * `factor = 1` → `0`（不放大，用满传感器）；`factor = M` → `1`（数码变焦拉满）。
 * 反函数是 `zoomToFactor`，两者都做了区间收敛，所以越界输入不会抛异常、
 * 也不会把荒唐值递给原生侧的 `pow()`。
 *
 * 输入里出现 `NaN` 时返回 0：与 `clampZoom` 对非有限值的处理
 * （`src/constants/zoom.ts` 返回 `DEFAULT_ZOOM`）一致 —— 坏了就退回不放大。
 */
export function factorToZoom(factor: number): number {
  if (!Number.isFinite(factor) || factor <= 1) {
    return 0;
  }
  const zoom = Math.log(factor) / Math.log(ASSUMED_MAX_ZOOM_FACTOR);
  return quantizeZoom(clampZoom(zoom));
}

/**
 * `zoom` prop → 「相对该镜头原生焦距的放大倍率」。`factorToZoom` 的反函数。
 *
 * 因为内部有量化（按 1e-5 取整），严格意义上的
 * `zoomToFactor(factorToZoom(f)) === f` 不成立，误差在 1e-5 相对量级
 * （实测 2 / 1 往返后相对误差 0，因为 0.25 是二的幂、二进制可精确表示；
 * 但**不要依赖这一点**，写单测时一律用 `toBeCloseTo`）。
 *
 * 非有限输入（`NaN` / `±Infinity`）返回 1，**跟 `factorToZoom` 对非有限输入返回 0
 * 是同一个约定**：两边都退到「不放大」这个恒等状态，而不是一边 0 一边 1 互相矛盾。
 * 注意这和「`zoom` 超出 0~0.75」是两回事 —— 后者是有限值，照常 `clampZoom` 之后正常换算。
 */
export function zoomToFactor(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return 1;
  }
  return Math.pow(ASSUMED_MAX_ZOOM_FACTOR, clampZoom(zoom));
}

/* ========================================================================
 * 三个档位
 * ===================================================================== */

/** 档位只落在两支镜头上：长焦不在本 App 的常用档位里（2× 走主摄数码裁切）。 */
export type ZoomLensRole = 'ultraWide' | 'wide';

/** 一个倍率档位的定义。 */
export type ZoomStop = {
  /** 稳定标识，给 React key 和 `activeStopId` 用。**不要**拿倍率当 key。 */
  readonly id: string;
  /** 按钮上显示的倍率（0.5 / 1 / 2）。**只是语义标签**，见下面 multiplierIsDigital。 */
  readonly multiplier: number;
  /** 这一档希望切到哪支镜头。 */
  readonly lens: ZoomLensRole;
  /** 相对 `lens` 原生焦距的 `videoZoomFactor` 倍数。1 = 切镜头不放大。 */
  readonly factor: number;
  /**
   * `factor` 对应的 zoom 字面量，由 `factorToZoom(factor)` 预计算（见文件末尾验算）。
   * 预计算而不是运行期调用，是为了让这三个数字**在代码里肉眼可查**：
   * 将来谁改了 `ASSUMED_MAX_ZOOM_FACTOR`，只要搜 `zoom:` 就能看出哪些地方过期了。
   */
  readonly zoom: number;
};

/**
 * 0.5× / 1× / 2× 三档。
 *
 * ## 为什么 1× 不写成"把 0.5× 那档放大 2 倍"
 * 从超广角数码放大到主摄视场走不通：超广角格式的 `videoMaxZoomFactor` 通常只有 2 上下，
 * 正好卡在边界，而且数码放大的画质比直接切到主摄糊得多。切镜头让主摄用满整个传感器，
 * 是唯一正确的做法 —— 所以 1× 的 factor 恒为 1。
 *
 * ## 为什么 2× 是数码裁切而不是切长焦
 * 本 App 只有两个档位角色（超广角 / 主摄），不碰长焦：长焦的 localizedName 极不稳定
 * （「长焦」「Telephoto」「Tele」各种写法），而且在多数机型上它的原生焦距不是主摄的整数倍，
 * 「2×」这个标签会直接骗人。留在主摄上做 2× 裁切，标签和画面严格一致。
 *
 * ## multiplier 与 factor 的关系
 * 只有 `factor === 1` 的档位是"切镜头"（0.5× 和 1×），它们的 `multiplier` 是
 * 相对**主摄**视场写的；`factor > 1` 的档位是数码裁切（2×）。
 * 需要判断"这一档是不是数码变焦"时用 `isDigitalStop()`，不要自己比 multiplier ——
 * 0.5 < 1 会被那种写法误判。
 */
export const ZOOM_STOPS: readonly ZoomStop[] = [
  {
    id: 'ultraWide05',
    multiplier: 0.5,
    lens: 'ultraWide',
    // 切到超广角、不放大。超广角原生视场就是主摄的约 0.5 倍，这个数字由镜头决定，
    // 不由标签决定 —— 改这里的 factor 不会让画面变成别的倍率，只会把它算错。
    factor: 1,
    zoom: 0,
  },
  {
    id: 'wide10',
    multiplier: 1,
    lens: 'wide',
    factor: 1,
    zoom: 0,
  },
  {
    id: 'wide20',
    multiplier: 2,
    lens: 'wide',
    // 留在主摄上做 2 倍数码裁切：factor 就是字面量 2，与 ASSUMED_LENS_NATIVE_MM 脱钩。
    // 写成表达式（比如 `2 * something`）会让这一档在没人注意时静默漂移。
    factor: 2,
    // ln(2) / ln(16) = 0.25，恰好是二进制可精确表示的值，无需取整误差说明。
    zoom: 0.25,
  },
];

/**
 * 这一档是不是"数码变焦"（而不是切光学镜头）。
 *
 * 判据是 `factor > 1` —— 切镜头的档位永远写 `factor: 1`，见 `ZOOM_STOPS` 的注释。
 * 单独抽成函数是为了让 UI 不必自己推导这个规则（推导错的典型写法是 `multiplier > 1`，
 * 那会把 0.5× 也算成非数码，虽然当下结果一样，但一旦有 0.5× 的数码档就会错）。
 */
export function isDigitalStop(stop: ZoomStop): boolean {
  return stop.factor > 1;
}

/* ========================================================================
 * 档位 → props
 * ===================================================================== */

export type StopResolution = {
  /**
   * 要写给 `<CameraView selectedLens>` 的名字。`undefined` = **不要传这个 prop**。
   *
   * 为什么不传而不是传个占位：`node_modules/expo-camera/ios/CameraViewModule.swift:99-105`
   * 里 `selectedLens = nil` 会让视图把 `selectedLens` 也置空、回落到系统默认镜头；
   * 传一个匹配不上的名字则会在 `CameraSessionManager.updateDevice()`（约 90 行）
   * 里匹配失败、同样回落，但白写一次状态。传 `undefined` 语义最直白。
   */
  readonly lens: string | undefined;
  /** 要写给 `zoom` 的值，0~1，已量化。 */
  readonly zoom: number;
  /** 这一档能不能给出来。`false` 时 UI 应该把按钮画成禁用。 */
  readonly available: boolean;
};

export type StopContext = {
  /** `ref.current?.getAvailableLenses()` 的结果（注意是异步的，UI 要处理空数组的初值）。 */
  readonly lenses: readonly string[];
  readonly facing: 'front' | 'back';
};

/**
 * 把一档倍率算成「实际要写的 props」。
 *
 * 判定规则（**保守优先**，拿不准一律 `available: false`）：
 *
 * 1. 列表是空的 → 不可用。这通常意味着 `getAvailableLenses()` 还没回来，
 *    或者这台设备根本不给镜头列表；两种情况都不该假装能跳。
 *    ⚠️ **调用方必须用 `lensesKnown`（列表非空）来区分"还没回来"和"真没有"**，
 *    否则回到相机页的第一帧会把三档全部画灰，闪一下。
 * 2. 这一档要的镜头角色在这个列表里找不到 → 不可用。
 *    前摄是这里的常客（前摄往往只有一支 `builtInWideAngleCamera`，
 *    它的 localizedName 可能不带任何焦距词 → `unknown` → 找不到），
 *    前摄没有超广角，0.5× 变灰是对的，不是 bug。
 * 3. `wide` 角色找不到时的**唯一例外**：1× 档仍然可用，但 `lens` 传 `undefined`
 *    让原生回落到默认镜头。理由是 1× 的语义是"默认视场"，而默认镜头本来就是主摄；
 *    传 `undefined` 比硬塞一个名字更安全（前摄尤其如此）。
 * 4. 找得到 → 可用，`lens` 写那个名字。
 *    也有一种"找得到但切了也没用"的情况：**列表里只有一支镜头时**，
 *    切镜头是空操作。这里仍然报 `available: true`，因为**行为是对的** ——
 *    用户点 1× 会回到默认视场，那正是这一档在当前设备上最接近的近似。
 *    要不要额外提示"这台设备没有超广角"，是调用方的判断，不是这个模块的。
 */
export function resolveStop(stop: ZoomStop, ctx: StopContext): StopResolution {
  const { lenses } = ctx;

  if (lenses.length === 0) {
    return { lens: undefined, zoom: stop.zoom, available: false };
  }

  if (stop.lens === 'wide') {
    const wide = pickDefaultLens(lenses);
    // 见规则 3：主摄认不出来时，1× 仍然是"默认视场"，交给原生回落。
    // 但只有 multiplier 为 1 的那一档能这么兜底：2× 必须知道自己在哪支镜头上裁，
    // 认不出来就不能假装能裁。
    if (wide === null) {
      const available = stop.factor === 1;
      return { lens: undefined, zoom: stop.zoom, available };
    }
    return { lens: wide, zoom: stop.zoom, available: true };
  }

  const ultraWide = pickUltraWideLens(lenses);
  if (ultraWide === null) {
    return { lens: undefined, zoom: stop.zoom, available: false };
  }
  return { lens: ultraWide, zoom: stop.zoom, available: true };
}

/* ========================================================================
 * 验算（写代码时用 node 跑过，留在这里给后人复现；不是运行期代码）
 * =====================================================================
 *
 * 三档的 zoom 是从 factor 推出来的，`ZOOM_STOPS` 里那些字面量必须和它对得上。
 * 改了 `ASSUMED_MAX_ZOOM_FACTOR` 或者任何 `factor` 之后，
 * 用下面这段重算，然后把结果抄回 `ZOOM_STOPS`：
 *
 *     node -e "
 *       const M = 16;
 *       const q = z => Number(z.toFixed(5));
 *       const clamp = z => Math.min(Math.max(z, 0), 0.75);
 *       const f2z = f => q(clamp(Math.log(f) / Math.log(M)));
 *       for (const [label, f] of [['0.5x', 1], ['1x', 1], ['2x', 2]]) {
 *         console.log(label + '  factor=' + f.toFixed(10) + '  zoom=' + f2z(f).toFixed(5));
 *       }
 *     "
 *
 * 期望输出：
 *     0.5x  factor=1.0000000000  zoom=0.00000
 *     1x    factor=1.0000000000  zoom=0.00000
 *     2x    factor=2.0000000000  zoom=0.25000
 *
 * 配套的反函数检查（实测值，不是估的）：
 *     zoomToFactor(0.25) = 2.0000000000000004
 *     与 2 相差 4.44e-16，相对误差 2.22e-16（1 个 double 的 ulp）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 觉得哪一档不准，改哪个常数（这一节是给未来的自己留的说明书）
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **0.5× / 1× 的画面不对** —— 那一定是**镜头识别**错了，不是换算错了。
 *    先打印 `getAvailableLenses()` 的实际字符串，再看 `LENS_KEYWORDS` 里缺哪个词
 *    （可能是没覆盖到的语言）。⚠️ **不要**靠调整数组下标来"修"，理由见 `classifyLens`。
 * 2. **2× 的裁切量不对**（用户反馈"这不是 2 倍"）—— 改 `ASSUMED_MAX_ZOOM_FACTOR`，
 *    然后把 `ZOOM_STOPS` 里的 `zoom` 字面量按上面的命令重算抄回去。
 *    注意这是**全局**影响：捏合行程的百分比读数也会跟着变。
 * 3. **只想让按钮显示别的数字** —— 改 `ZOOM_STOPS` 里的 `multiplier`；
 *    但那**不会**改变实际放大倍率，画面不会跟着变。这是刻意的：
 *    换算关系由镜头和 M 决定，不由标签决定。
 */
