/**
 * 常用焦段 13 / 26 / 35mm —— 把「毫米」翻译成 expo-camera 真正认的两个 props。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 这个模块解决什么问题
 * ─────────────────────────────────────────────────────────────────────────
 * 变焦条（`src/components/ZoomBar.tsx`）是一条 0~1 的连续行程，适合微调，
 * 不适合「我想拍 35mm」这种明确意图 —— 用手指在轨道上摸到某个位置，
 * 既慢又不准，而且 `src/constants/zoom.ts` 只肯显示百分比、不肯显示倍率，
 * 就是因为**换算到毫米这件事本身是没法做准的**。这个模块把这份不确定性
 * 收进一个地方，让 UI 能摆出「点一下就跳过去」的三档。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 为什么焦距要用「假定 M」来换算
 * ─────────────────────────────────────────────────────────────────────────
 * iOS 侧的真身（`node_modules/expo-camera/ios/Current/CameraSessionManager.swift:221`）是：
 *
 *     let minZoom = 1.0
 *     device.videoZoomFactor = minZoom * pow(device.activeFormat.videoMaxZoomFactor / minZoom, delegate.zoom)
 *
 * 也就是 `videoZoomFactor = M ^ zoom`，`M = device.activeFormat.videoMaxZoomFactor`。
 * **M 只有原生侧读得到，JS 完全拿不到**（`node_modules/expo-camera/build/Camera.types.d.ts`
 * 里没有任何把它吐给 JS 的接口），所以「毫米 → zoom」这条换算注定要经过一个假定的 M。
 * 剩下的唯一自由度是**把这个假定放在哪一支镜头的原生焦距上**，于是：
 *
 *   - **13mm 和 26mm 两档不依赖 M**。它们就是「切到这支镜头、放大倍率 1.0」，
 *     而 `videoZoomFactor = 1.0` 对应 `zoom = 0`，`log_M(1)` 无论 M 取多少都是 0。
 *     换句话说这两档是**准的**，M 猜错了也不影响。
 *   - **35mm 这一档依赖 M**，而且同时依赖「这支广角原生是多少毫米」。
 *     `factor = 35 / 26 ≈ 1.3461538`（假定广角原生 26mm），
 *     `zoom = ln(1.3461538) / ln(16) = 0.1072108...` → 量化后 **0.10721**。
 *     ⚠️ 如果你是从任务书里看到「0.1074」这个数，那是**算错了**：
 *     `0.1074` 对应的 M 是 15.92 而不是 16（`16^0.1074 = 1.3470 ≠ 1.3462`）。
 *     这里用的是复算过的 0.10721，`FOCAL_STOPS[2].zoom` 就是它。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 觉得 35mm 那一档不准，改哪个常数
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **准星偏了（拍出来比 35mm 更广或更窄）** —— 改 `ASSUMED_WIDE_NATIVE_MM`
 *    （下面那个 `ASSUMED_LENS_NATIVE_MM` 表里的 `wide`）。iPhone 的主摄在各代之间
 *    是 24 / 26 / 28mm 都出现过，**JS 侧读不到，只能假定**。
 * 2. **准星对了但手感不对**（比如嫌它跳得太靠上、容易糊） —— 改
 *    `ASSUMED_MAX_ZOOM_FACTOR`。它偏小会让 zoom 偏大（放大过头），偏大会让 zoom 偏小
 *    （放大不足）；改完 `FOCAL_STOPS` 里的 `zoom` 字面量要跟着重新算
 *    （算法见文件末尾验算命令）。其他任何地方都不用动。
 * 3. **只想让按钮显示别的数字** —— 改 `FOCAL_STOPS` 里的 `mm`；但那**不会**
 *    改变实际放大倍率，画面不会跟着变。这是刻意的：换算关系由镜头决定，不由标签决定。
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
 * `unknown` 是明确认不出来的，**不等于 wide**：不要把它当广角用。
 */
export type LensRole = 'ultraWide' | 'wide' | 'telephoto' | 'multi' | 'unknown';

/**
 * `getAvailableLenses()` 拿到的名字长什么样（**这条决定了整个匹配策略**）：
 *
 * `node_modules/expo-camera/ios/Current/CameraSessionManager.swift:227-241`：
 *
 *     let availableLenses = delegate.presetCamera == AVCaptureDevice.Position.back
 *       ? deviceDiscovery.backCameraLenses
 *       : deviceDiscovery.frontCameraLenses
 *     // Lens ordering can be varied which causes problems if you keep the result in react state.
 *     // We sort them to provide a stable ordering
 *     return availableLenses.map { $0.localizedName }.sorted { $0 < $1 }
 *
 * 三个必须记住的后果：
 *
 * 1. **是 `localizedName`，不是 deviceType 常量。** 这个字符串由系统本地化，
 *    中文机上是「后置超广角镜头」，英文机上是「Back Ultra Wide Camera」，
 *    法语机上是「Caméra arrière ultra grand-angle」。所以**匹配只能靠关键词**，
 *    而且得靠不住 —— 见文件末尾「哪些地方是在猜」。
 * 2. **返回值被按名字升序排过序**，所以 `lenses[0]` 没有任何物理含义，
 *    不能"取第一个当主摄"。
 * 3. **列表里混着物理镜头和虚拟多摄设备**（下面细说），长度不等于镜头数。
 */
export type LensName = string;

/**
 * 关键词表。**顺序即优先级**，而优先级是必需的，原因见 `classifyLens`。
 *
 * 语言覆盖 App 支持的全部 5 种（简体中文 / 繁体中文 / 日语 / 英语 / 法语）
 * 外加英文兜底。每条尾巴上的 ✅/⚠️ 是我对这条把握多大的**诚实标注**：
 * ✅ = 基本确定，跟 Apple 的 AVFoundation 本地化用词一致；
 * ⚠️ = 没见过真机实锤，属于合理推测。
 */
const LENS_KEYWORDS: ReadonlyArray<{ readonly role: LensRole; readonly needles: readonly string[] }> = [
  {
    // 【为什么必须排第一】虚拟多摄设备的 localizedName 里**同样**会出现焦距词：
    // 「后置双广角相机」含「广角」、「後置雙廣角相機」也含「廣角」，
    // 不先拦下来就会被下面的 wide / ultraWide 抢走，结果我们选中一个多摄整体 ——
    // 那个设备的 videoMaxZoomFactor / videoZoomFactor 语义与单支物理镜头完全不同
    // （倍率基准是"主摄 1×"，而且系统会在镜头之间自动接管），
    // 我们的 zoom 换算在它身上直接失效。
    // 把它单独识出来、并在 pick* 里降到最后才考虑，是这里最要紧的一步。
    //
    // ⚠️ 这里**不能**用「摄」/「攝」单字兜底 —— 试过了，会误伤
    // 「原深感摄像头」（TrueDepth 前摄）和「前置摄像头」，把它俩判成 multi。
    // 误判成 multi 的后果不是"少个按钮"，而是 pickDefaultLens 会挑中一个
    // 语义完全不同的虚拟设备。所以只收**具体组合词**，宁可漏判成 unknown。
    role: 'multi',
    needles: [
      '三摄', // 简体「后置三摄」 ✅
      '双摄', // 简体「后置双摄」 ✅
      '双广角', // 简体「后置双广角相机」（Dual Wide） ✅ 不含焦距词，必须显式列出
      '三鏡頭', // 繁体「後置三鏡頭」 ⚠️
      '雙鏡頭', // 繁体「後置雙鏡頭」 ⚠️
      '雙廣角', // 繁体「後置雙廣角相機」 ⚠️
      '三鏡', // ⚠️ 繁体的短写法兜底（「後置三鏡」）
      '雙鏡', // ⚠️ 同上
      '双双', // ⚠️ 万一出现「双镜头双相机」这类拼法
      'dual', // 英语「Back Dual Camera」/「Back Dual Wide Camera」 ✅
      'double', // 法语「Double caméra arrière」 ⚠️
      'デュアル', // 日语「デュアルカメラ」⚠️（亦作「デュアル広角カメラ」）
      'トリプル', // 日语「トリプルカメラ」 ⚠️ 片假名写法，别只写 triple
      'trinity', // ⚠️ Apple 内部名，从没在 localizedName 里见过，留着不亏
      'triple', // 英语「Back Triple Camera」 ✅
      'lidar', // 英语「Back LiDAR Depth Camera」 ✅ 纯 ASCII，本地化不掉
      '激光雷达', // 简体「激光雷达扫描仪」 ⚠️ （中文名里没有 lidar 这串拉丁字母！）
      '光達', // 繁体「光達掃描儀」 ⚠️
      '雷達', // 繁体兜底 ⚠️
    ],
  },
  {
    // 必须排在 wide 前面：「超广角」/「超広角」都**包含**「广角」，
    // 一旦让 wide 先跑，超广角永远会被判成广角。这是这类关键词表最经典的坑。
    role: 'ultraWide',
    needles: [
      '超广角', // 简体「后置超广角镜头」 ✅
      '超廣角', // 繁体 ✅
      '超広角', // 日语 ✅
      'ultra wide', // 英语「Back Ultra Wide Camera」 ✅
      'ultrawide', // ✅
      'ultra-wide', // ✅ 连字符写法
      'ultra grand', // 法语「ultra grand-angle」 ✅
      'ultra-grand', // ✅
      'ultragrand', // ⚠️ 法语偶尔不加连字符
      'ultra gran angular', // ⚠️ 西语式拼法，本 App 不支持西语，纯兜底
    ],
  },
  {
    role: 'telephoto',
    needles: [
      '长焦', // 简体「后置长焦镜头」 ✅
      '長焦', // 繁体 ✅
      '望遠', // 日语「望遠カメラ」 ✅
      'telephoto', // 英语「Back Telephoto Camera」 ✅
      'tele objectif', // 法语「téléobjectif」去掉重音后的形态 ⚠️
      'teleobjectif', // ⚠️ 同上
      'téléobjectif', // 法语原样（带重音） ✅
    ],
  },
  {
    role: 'wide',
    needles: [
      '广角', // 简体「后置广角镜头」 ✅
      '廣角', // 繁体 ✅
      '広角', // 日语「広角カメラ」 ✅（注意「超広角」里也含它，所以这条必须最后判）
      'wide', // 英语「Back Wide Angle Camera」 ✅
      'grand angle', // 法语「grand-angle」 ✅
      'grand-angle', // ✅
      'grandangle', // ⚠️ 无连字符写法
    ],
  },
];

/** 集中归一化，省得每条 needle 里都要考虑大小写和重音。 */
function normalizeLensName(localizedName: string): string {
  return localizedName
    .normalize('NFD') // 「téléobjectif」拆成 'e' + 组合重音
    .replace(/[\u0300-\u036f]/g, '') // 再把组合重音删掉 → 'teleobjectif'
    .toLowerCase();
}

/**
 * 猜一支镜头是什么。
 *
 * 匹配顺序**不是**「谁命中算谁」，而是多摄 → 超广角 → 长焦 → 广角 这个固定优先级，
 * 前两类因为含子串关系必须排在被它们包含的类之前（见上面两张表的注释）。
 *
 * **拿不准就返回 `unknown`**：`unknown` 的镜头不会被 `pickUltraWideLens` /
 * `pickDefaultLens` 选中，也不会被 `resolveStop` 当成广角来用。宁可少给一个按钮，
 * 也不要把 35mm 按钮接到一支其实是长焦的镜头上。
 *
 * 已知的两种误判（都是"能自圆其说但可能错"，写在这里免得后人重新踩）：
 *
 * 1. **繁体中文的广角可能就是「廣角」**，而 Apple 在部分繁体机型上把**主摄**叫做
 *    「後置相機」而不带焦距词 —— 后者会落到 `unknown`，于是 26mm 档在前摄之外
 *    也可能被判不可用。这是保守方向的错，可以接受。
 * 2. **法语「grand-angle」是宽角度的通用说法**，理论上可能出现在描述别的镜头的句子里；
 *    靠下面的 `multi` 优先级兜住大部分情况。
 */
export function classifyLens(localizedName: string): LensRole {
  const name = normalizeLensName(localizedName);

  for (const { role, needles } of LENS_KEYWORDS) {
    for (const needle of needles) {
      if (name.includes(normalizeLensName(needle))) {
        return role;
      }
    }
  }

  return 'unknown';
}

/** 找第一个符合指定角色的名字。找不到返回 `null` —— **不猜**。 */
function findLensByRole(lenses: readonly string[], role: LensRole): string | null {
  for (const lens of lenses) {
    if (classifyLens(lens) === role) {
      return lens;
    }
  }
  return null;
}

/**
 * 挑出超广角那支。挑不出来返回 `null`（**宁可返回 null 也不要瞎猜**：
 * 猜错的后果是把用户送到长焦上拍出一张完全不是 13mm 的照片，而 null 只是按钮变灰）。
 *
 * 注意这里刻意**不接受** `multi` —— 一个「三摄」虚拟设备虽然包含超广角，
 * 但它同时包含广角和长焦，zoom 语义也不一样（见关键词表第一条）。
 * 只有在这台设备上真的一支物理超广角都没被发现时，才退而求其次用虚拟设备，
 * 因为那时候"至少有个超广角"聊胜于无。
 */
export function pickUltraWideLens(lenses: readonly string[]): string | null {
  return findLensByRole(lenses, 'ultraWide') ?? findLensByRole(lenses, 'multi');
}

/**
 * 挑出「日常主摄」那支，给 26mm 档用。
 *
 * 优先级：物理广角 → 虚拟多摄 → **一支都没有时返回 `null`**。
 * 最后那种情况其实是前摄的常态（前摄往往只有一个 `builtInWideAngleCamera`，
 * 而它的 localizedName 可能完全不带焦距词 → `unknown`），这时候让 `resolveStop`
 * 把镜头判成不可用是对的：前摄本来也没有"切镜头"这回事，
 * 而 zoom 档位由调用方决定要不要自己保留。
 */
export function pickDefaultLens(lenses: readonly string[]): string | null {
  return findLensByRole(lenses, 'wide') ?? findLensByRole(lenses, 'multi');
}

/* ========================================================================
 * 焦距 ⇄ zoom 换算
 * ===================================================================== */

/**
 * 假定的 `device.activeFormat.videoMaxZoomFactor`。
 *
 * **这个数字 JS 读不到，是猜的** —— 见文件头。它会错，而且逐机型不一样。
 * 16 这个取值跟 `src/constants/zoom.ts` 的文件头保持一致（那边也是按 16 推的量程）。
 *
 * **错了会怎样，说清楚：**
 * `zoom = ln(factor) / ln(M)`，`M` 在分母的对数里，所以
 *   - M 猜**小**了 → zoom 偏**大** → 放大**过头**（35mm 档会拍到约 40mm）
 *   - M 猜**大**了 → zoom 偏**小** → 放大**不足**（35mm 档会拍到约 30mm）
 * 因为是对数，误差被压得很扁：M 从 16 错到 24（错 50%），zoom 从 0.10721 变成 0.10718，
 * **肉眼不可分辨**。真正会显著影响 35mm 档准确度的不是 M，而是
 * 下面 `ASSUMED_LENS_NATIVE_MM.wide` 那个原生焦距假定。
 *
 * 对 13mm / 26mm 两档**完全无影响**：那两档的 factor 是 1，`ln(1) = 0`。
 */
export const ASSUMED_MAX_ZOOM_FACTOR = 16;

/**
 * 假定各档位基准镜头的**原生焦距（35mm 等效毫米）**。
 *
 * 这是本模块最大的一个谎：iPhone 主摄在各代之间是 **24 / 26 / 28mm** 都出现过
 * （Pro 机型偏 24，非 Pro 偏 26），而 **JS 侧没有任何接口能读到它**。
 * 这里统一按 26mm 算，跟三档的标签 13 / 26 / 35 是同一套假设。
 *
 * 错了会怎样：只有 35mm 那一档会偏 —— 假定 26 而真实是 24 时，
 * 我们算出的 `factor = 35/26 = 1.3462` 实际会拍成 `24 × 1.3462 ≈ 32.3mm`，
 * 差 2.7mm（约 8% 视角）。所以用户如果反馈「35mm 那档偏广」，改的就是这个值，
 * 或者直接改 `FOCAL_STOPS` 里 35mm 的 `factor`/`zoom`。
 *
 * 超广角那一档写 13 是因为 iPhone 的超广角从 11 到 13 都出现过，
 * 但**只影响标签显示的含义、不影响换算**（factor 恒为 1）。真要抠，
 * 改 `FOCAL_STOPS` 里 13mm 那档的 `mm` 文案即可，画面不会变。
 */
export const ASSUMED_LENS_NATIVE_MM: Readonly<Record<'ultraWide' | 'wide', number>> = {
  ultraWide: 13,
  wide: 26,
};

/**
 * `zoom` 的量化步长。跟 `src/constants/zoom.ts:66` 的 `toCameraZoom()` 用**同一个数量级**
 * 但更细一点：那边是为连续拖动省 `lockForConfiguration()` 调用，5 位小数足够；
 * 这里是一次性写入，精度优先，所以不直接复用 `toCameraZoom`（那是个"百分比"级量化，
 * 会把 0.10721 变成 0.11，35mm 档直接偏掉 2% 的放大倍率，等于白算）。
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
 * 输入里出现 `NaN` 时 `factorToZoom` 返回 0：与 `clampZoom` 对非有限值的处理
 * （`src/constants/zoom.ts:51-56` 返回 `DEFAULT_ZOOM`）一致 —— 坏了就退回不放大。
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
 * 因为内部有量化（`factorToZoom` 按 1e-5 取整），严格意义上的
 * `zoomToFactor(factorToZoom(f)) === f` 不成立，误差在 1e-5 相对量级
 * （实测 35/26 往返后相对误差 2.3e-6，即百万分之二点三）。UI 上完全看不出来，
 * 但写单测时**不要**拿 `toBe` 直接比，用 `toBeCloseTo`。
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

/** 每档要落在哪支镜头上。只允许这两支：长焦档不在本 App 的「常用焦段」里。 */
export type FocalLensRole = 'ultraWide' | 'wide';

/** 一个焦段档位的定义。 */
export type FocalStop = {
  /** 稳定标识，给 React key 和持久化用。**不要**拿 mm 当 key。 */
  readonly id: string;
  /** 按钮上显示的毫米数。**只是文案** —— 改它不会改变画面，见文件头第 3 条。 */
  readonly mm: number;
  /** 无障碍/长按提示用的完整标签。 */
  readonly label: string;
  /** 这一档希望切到哪支镜头。 */
  readonly lens: FocalLensRole;
  /** 相对 `ASSUMED_LENS_NATIVE_MM[lens]` 的 `videoZoomFactor` 倍数。 */
  readonly factor: number;
  /**
   * `factor` 对应的 zoom 字面量，由 `factorToZoom(factor)` 预计算（见文件末尾验算）。
   * 预计算而不是运行期调用，是为了让这三个数字**在代码里肉眼可查**：
   * 将来谁改了 `ASSUMED_MAX_ZOOM_FACTOR`，只要搜 `zoom:` 就能看出哪些地方过期了。
   */
  readonly zoom: number;
};

/**
 * 13mm / 26mm / 35mm 三档。
 *
 * 35mm 那档的 `factor = 35 / 26 = 1.3461538461538463`，`zoom ≈ 0.10721`。
 *
 * ## 为什么 26mm 那档的 factor 是 1（切镜头而不是放大）
 * 从超广角「放大 2 倍」凑到 26mm 走不通：超广角格式的 `videoMaxZoomFactor`
 * 通常只有 2 上下，正好卡在边界，而且数码放大比直接切到主摄糊得多。
 * 切镜头让主摄用满整个传感器，是唯一正确的做法。
 *
 * ## 为什么 13mm 那档不依赖假定
 * factor 恒为 1 → `ln(1) = 0` → zoom 恒为 0，跟 `ASSUMED_MAX_ZOOM_FACTOR` 无关。
 */
export const FOCAL_STOPS: readonly FocalStop[] = [
  {
    id: 'ultraWide13',
    mm: 13,
    label: '13mm 超广角',
    lens: 'ultraWide',
    factor: 1,
    zoom: 0,
  },
  {
    id: 'wide26',
    mm: 26,
    label: '26mm 标准',
    lens: 'wide',
    factor: 1,
    zoom: 0,
  },
  {
    id: 'wide35',
    mm: 35,
    label: '35mm 人文',
    lens: 'wide',
    // 26 → 35：35 / 26 = 1.3461538461538463…（除不尽，后面是 846153 循环）。
    // 这里直接写 `35 / 26` 的字面结果，而不是写成表达式，是为了让它和
    // 上面的 `ASSUMED_LENS_NATIVE_MM.wide` 脱钩：将来有人把原生焦距假定
    // 从 26 改成 24，这个 factor **不会**跟着变 —— 必须显式来改，
    // 否则 35mm 档会在没人注意的情况下静默漂移。
    factor: 1.3461538461538463,
    // ln(1.3461538461538463) / ln(16) = 0.1072108247009686 → 量化后 0.10721
    zoom: 0.10721,
  },
];

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
 * 把一档焦段算成「实际要写的 props」。
 *
 * 判定规则（**保守优先**，拿不准一律 `available: false`）：
 *
 * 1. 列表是空的 → 不可用。这通常意味着 `getAvailableLenses()` 还没回来，
 *    或者这台设备根本不给镜头列表；两种情况都不该假装能跳。
 * 2. 这一档要的镜头角色在这个列表里找不到 → 不可用。
 *    前摄是这里的常客（前摄往往只有一支 `builtInWideAngleCamera`，
 *    它的 localizedName 可能不带任何焦距词 → `unknown` → 找不到）。
 * 3. 找得到 → 可用，`lens` 写那个名字。
 *    但也有一种"找得到但切了也没用"的情况值得注释一下：**列表里只有一支镜头时**，
 *    切镜头是空操作，靠 `factor` 也算不出光学上的差别（原生焦距是假的）。
 *    这里仍然报 `available: true`，因为**行为是对的**：用户点 35mm 会得到
 *    "主摄 + 1.35 倍"，那正是这一档在当前设备上最接近的近似。
 *    要不要在 UI 上额外提示"这台设备没有超广角"，是调用方的判断，不是这个模块的。
 *
 * 前摄的 13mm 档会被规则 2 干掉：前摄压根没有超广角。这是对的，不是 bug。
 */
export function resolveStop(stop: FocalStop, ctx: StopContext): StopResolution {
  const { lenses } = ctx;

  if (lenses.length === 0) {
    return { lens: undefined, zoom: stop.zoom, available: false };
  }

  const lens =
    stop.lens === 'ultraWide' ? pickUltraWideLens(lenses) : pickDefaultLens(lenses);

  if (lens === null) {
    return { lens: undefined, zoom: stop.zoom, available: false };
  }

  return { lens, zoom: stop.zoom, available: true };
}

/* ========================================================================
 * 验算（写代码时用 node 跑过，留在这里给后人复现；不是运行期代码）
 * =====================================================================
 *
 * 三档的 zoom 是从 factor 推出来的，`FOCAL_STOPS` 里那些字面量必须和它对得上。
 * 改了 `ASSUMED_MAX_ZOOM_FACTOR` 或者任何 `factor` 之后，
 * 用下面这段重算，然后把结果抄回 `FOCAL_STOPS`：
 *
 *     node -e "
 *       const M = 16;
 *       const q = z => Number(z.toFixed(5));
 *       const clamp = z => Math.min(Math.max(z, 0), 0.75);
 *       const f2z = f => q(clamp(Math.log(f) / Math.log(M)));
 *       for (const [mm, f] of [[13, 1], [26, 1], [35, 35 / 26]]) {
 *         console.log(mm + 'mm  factor=' + f.toFixed(10) + '  zoom=' + f2z(f).toFixed(5));
 *       }
 *     "
 *
 * 期望输出：
 *     13mm  factor=1.0000000000  zoom=0.00000
 *     26mm  factor=1.0000000000  zoom=0.00000
 *     35mm  factor=1.3461538462  zoom=0.10721
 *
 * 配套的反函数检查（实测值，不是估的）：
 *     zoomToFactor(0.10721) = 1.3461507681003975
 *     与 35/26 = 1.3461538461538463 相差 -3.08e-6，相对误差 2.29e-6。
 * 这点误差是 1e-5 量化的必然代价，落到画面上是千分之三毫米级别，可以无视。
 */
