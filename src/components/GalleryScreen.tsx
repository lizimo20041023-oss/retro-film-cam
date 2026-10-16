/**
 * App 内相册 —— 拍完不用切到系统相册去看（用户需求第 3 条）。
 *
 * 数据来自 `useGallery()` / `utils/galleryStore.ts`，这个文件只负责画：
 * 三列缩略图网格 + 点开看大图 + 删一张。刻意不引 react-navigation，
 * 和 `SettingsScreen.tsx` 一样是一块绝对定位的整屏覆盖层 ——
 * 骨架照着它抄，两台"机身面板"才是同一个视觉语言。
 *
 * ── 三条硬性取舍 ──────────────────────────────────────────────────────────
 * 1. **网格只铺 `thumbUri`**。成片长边 2048，一张位图约 12 MB；`thumbUri` 长边 400
 *    只有约 0.9 MB，差一个数量级。网格一屏二三十格，铺成片会直接把内存吃穿（OOM）。
 *    `shot.uri` 只在"点开看大图"那一步用，而且永远只有一张同时存在。
 * 2. **删除必须二次确认**。删掉的是用户自己的照片，而且 `galleryStore` 是先落索引再删文件、
 *    删完不可恢复；网格里一格才 1/3 屏宽，误触成本远高于多弹一次 `Alert` 的成本。
 * 3. **不可见时返回 `null`**。见下面 `if (!visible)` 那段。
 *
 * ── 本次改动（相册页负责人）──────────────────────────────────────────────
 * · `root` 改成**完全不透明**：以前是 `rgba(12,12,11,0.97)`，相机屏把本屏当覆盖层挂着，
 *   取景器的实时预览会从那 3% 的透明里透出来，看着像渲染故障（用户报的 bug）。
 * · 内嵌的"大图 + 两个按钮"整块抽成 `Lightbox.tsx`。
 * · §十：遮罩定稿 `rgba(18, 18, 18, 0.98)`；删除改成"灯箱问 / 网格长按问，这里静默落库"。
 * · §八：顶栏加【＋ 導入】，选中外部照片后**按当前胶卷/相框重新冲印**并打开大图。
 * · §九：双模式切换（默认**长卷底片**），长卷由 `StripView.tsx` 负责。
 *
 * ── 相框 / 胶卷是从哪来的（重要，别改成"读设置"）─────────────────────────
 * `AppSettings` 里**没有** frameId / presetId —— 相框和胶卷是 `CameraScreen` 的局部
 * state（它才是拍摄现场的owner）。相册页能拿到它们的唯一途径是**最近一张成片**
 * 上记着的 `frameId` / `presetId`（`AddShotInput` 落库时写进去的）。
 * 所以"用当前选中的相框比例重新冲印"在本页的实现 = **用上一张用过的相框**。
 * 这在用户视角是对的："我上次用宝丽来 600 拍的，导入的这张也该是宝丽来 600"。
 *
 * ── 验证状态（诚实记录）──────────────────────────────────────────────────
 * 本文件写完后用任务指定的 `npx tsc ... src/components/GalleryScreen.tsx` 过了类型，
 * 但**没有在真机 / 模拟器上跑过**：`FlatList` 的 `numColumns` 分栏效果、`Alert` 在
 * iOS 上的按钮排列、点击后能否正常从 `file://` 解码出图，都属于"类型对但没实测"的部分。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { DEFAULT_FRAME_ID, FRAMES, findFrameIndex } from '../constants/frames';
import { applyGrainLevel, findGrainLevelIndex, grainLevelAt } from '../constants/grain';
import { DEFAULT_PRESET_ID, PRESETS, findPresetIndex, resolvePreset } from '../constants/presets';
import { themeFor, useTheme, UI_MONO } from '../constants/theme';
import type { Theme } from '../constants/theme';
import { useI18n } from '../i18n';
import { useFilmStage } from '../hooks/useFilmStage';
import { useGallery } from '../hooks/useGallery';
import { useSettings } from '../hooks/useSettings';
import type { Size } from '../types';
import { describeError } from '../utils/describeError';
import { importAndDevelop } from '../utils/importPhoto';
import type { GalleryShot } from '../utils/galleryStore';
import { computeDevelopStageBox } from './DevelopOverlay';
import { FilmCompositor } from './FilmCompositor';
import { Lightbox, type LightboxToast } from './Lightbox';
import { StripView } from './StripView';
import { useFilmFonts } from '../hooks/useFilmFonts';

/** 三列。改这里必须同步改下面 `tileWidth` 的计算，否则最后一行会溢出屏幕。 */
const COLUMNS = 3;

/** 格子之间的缝。 */
const GAP = 3;

/** 网格左右内边距。 */
const PADDING = 12;

/**
 * lightbox 底部操作条占的高度（按钮 36 + 上边距 12 + 一点余量）。
 * 只用来给大图**预留**空间：算少了图会被按钮压住，算多了图会小一圈，
 * 所以这个数必须和 `Lightbox.tsx` 里 `actionBar` 的实际高度对得上。
 * 提示条也按它往上让位（见下面 `styles.toast` 的 `bottom`）。
 */
const ACTION_BAR_HEIGHT = 72;

/**
 * 覆盖层遮罩的**可读性底线**：不透明度 0.985。
 *
 * 为什么必须**几乎不透明**：本屏是挂在相机屏上的整屏覆盖层，取景器一直在后面跑。
 * 只要留一点透明度，实时预览就会透过来（用户报的就是这个"渲染故障"）。
 * 颜色本身来自 `useTheme().scrim`（深机身 `rgba(14,15,17,0.985)`、
 * 浅机身 `rgba(237,236,232,0.985)`）—— 遮罩底下压着的是本屏的面板文字，
 * 浅机身配深遮罩会变成"深底黑字"。挡住取景器靠的是 0.985 这个不透明度，
 * 不是颜色的深浅。
 *
 * ⚠️ `src/components/SettingsScreen.tsx` 的机身后板共用同一个 `scrim` token。
 * 两处以前各留一份写死的 `'rgba(18, 18, 18, 0.98)'`，注释还互相指路；
 * 现在都从配色表取，就是为了消灭"改一处忘另一处"这个失败模式。
 *
 * 真正兜住穿透的是两层保险：① 这里 0.985 的遮罩；② `CameraScreen` 在 `covered`
 * 时把整个取景容器压成 `opacity: 0`（见那份注释）。**两层都要在。**
 */

/** 提示条停留时长（ms）。够读一句话，又不至于挡着下一张照片。 */
const TOAST_MS = 2400;

/**
 * 相册页的两种看片方式。**默认长卷**（用户明确要的第一顺位）——
 * 所以这个 union 的顺序就是"越靠前越默认"，`useState` 的初值直接取 `'strip'`。
 */
export type GalleryViewMode = 'strip' | 'grid';

/** 模式切换那一行占的高度。长卷的可用高度要把它扣掉。 */
const TOOLBAR_HEIGHT = 40;

/** 网格一格的边长：窗口宽减去两侧内边距和所有缝，再三等分。 */
function computeTileWidth(windowWidth: number): number {
  const usable = windowWidth - PADDING * 2 - GAP * (COLUMNS - 1);
  return Math.max(1, Math.floor(usable / COLUMNS));
}

export interface GalleryScreenProps {
  visible: boolean;
  onClose: () => void;
}

export function GalleryScreen({ visible, onClose }: GalleryScreenProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { t, localeId } = useI18n();
  const { shots, loading, error, refresh, refreshSilently, remove } = useGallery();
  const { settings } = useSettings();

  /**
   * 机身配色。**必须在这里现取，不能在模块作用域**：`StyleSheet.create` 一旦写在
   * 模块顶级，颜色就在模块加载那一刻烧死了，系统切深浅色时一行都不会变，
   * 这正是这次要修的病。`useTheme()` 内部是 `useColorScheme()`，所以它得跟着
   * 这个组件每次渲染跑一遍 —— 位置必须在这个函数体里、任何 `if (!visible) return null`
   * 之前，否则切换机身时 hook 数量会对不上。
   */
  const theme = useTheme();
  const { ink, scrim, glass, glassBorder } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);

  /**
   * 冲印幕布**故意不跟随机身**，固定用深色那一套。
   *
   * 为什么：幕布底下盖着的是 `FilmCompositor` 正在合成的照片 —— 那是暗房里的工作台，
   * 不是 App 的外壳。系统切成浅色时把幕布也换成浅的，等于让照片浮在一块白板上，
   * "当着用户的面冲印"这个语境就没了（同一条理由见 `StripView` 的暗房背光）。
   */
  const darkroom = useMemo(() => themeFor('dark'), []);

  /**
   * 合成舞台宿主。**必须挂在 UI 层**（`useFilmStage` 的文件头解释了原因）：
   * iOS 截图对"没真的渲染在屏幕上"的视图可能截到空图，所以导入时 `FilmCompositor`
   * 要真的挂到本屏上、盖一层幕布，等截完再卸。
   */
  const filmStage = useFilmStage();
  const fonts = useFilmFonts();

  /** 看片方式。默认长卷（§九）；不持久化 —— 每次开相册都回到用户最爱的那个模式。 */
  const [viewMode, setViewMode] = useState<GalleryViewMode>('strip');

  /** 导入进行中（选完图到全部冲印完）。用它吃掉重复点击，也用来显示幕布。 */
  const [importing, setImporting] = useState(false);

  /**
   * 正在看大图的那张；`null` = 停留在网格。
   * 存 id 而不是整条记录：`shots` 因为对账刷新换了新数组时，大图靠 id 重新查得到最新数据；
   * 存副本的话会一直显示一份陈旧快照，而且删除后还得手动清理它。
   */
  const [openedId, setOpenedId] = useState<string | null>(null);

  /** 当前那条提示（保存/分享的结果）。`null` = 不显示。 */
  const [toast, setToast] = useState<LightboxToast | null>(null);

  /**
   * `setTimeout` 的句柄。存 ref 是为了两件事：
   * ① 新提示来了要把旧定时器清掉，否则前一条会在后一条刚显示时把它关掉；
   * ② 组件卸载时清掉，避免对已卸载的组件 setState。
   */
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((next: LightboxToast): void => {
    if (toastTimer.current !== null) {
      clearTimeout(toastTimer.current);
    }
    setToast(next);
    toastTimer.current = setTimeout(() => {
      toastTimer.current = null;
      setToast(null);
    }, TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current !== null) {
        clearTimeout(toastTimer.current);
        toastTimer.current = null;
      }
    },
    [],
  );

  /**
   * **每次打开**相册都重新读一次索引。
   *
   * 为什么不是"只有空的时候才刷"：拍照那一侧是直接调 `galleryStore.addShot()`
   * 写盘的，**不走这个 hook**（`CameraScreen` 用 `useGallery()` 会平白多一个跟
   * 取景毫无关系的 re-render 源），所以这个 hook 的 state 并不知道刚拍了一张。
   * 只要列表非空，"空了才刷"就会让最新那张永远差一次刷新才出现 ——
   * 而那恰恰是用户要避免的事（"不用每次都去系统相册查看"）。
   *
   * 用 `wasVisible` 而不是把 `visible` 之外的量塞进依赖数组：要的是
   * "翻成 true 的那一次"，不是"每次 render 都刷一遍盘"。
   * 顺手把上次看的大图关掉（**视图模式不动**：用户上次选了网格就还是网格，
   * 只有大图这种"看某一张"的临时状态该清零）。
   *
   * **走 `refreshSilently` 而不是 `refresh`**：`refresh()` 会置 `loading`，而 `loading`
   * 为真时整块列表被换成一颗 spinner（`{loading ? <ActivityIndicator/> : ...}`），
   * 于是"打开相册"这个动作每次都先把自己擦成黑底再重画一遍 —— 用户实测反馈的
   * "点缩略图先黑屏约一秒"就是这一下。这台机器上 `readGallery()` 还要逐条做
   * `new File(uri).exists` 的 native 往返，那一秒并不短。改成静默对账后，
   * 旧列表一直挂着，新结果回来一次性替换：内容该更新还是更新，只是不再闪黑。
   */
  const wasVisible = useRef(false);
  useEffect(() => {
    if (!visible) {
      wasVisible.current = false;
      return;
    }
    if (wasVisible.current) {
      return;
    }
    wasVisible.current = true;
    setOpenedId(null);
    setToast(null);
    void refreshSilently();
  }, [visible, refreshSilently]);

  /** 当前大图对应的记录；记录被删掉后自动变回 `null`，lightbox 随之关闭。 */
  const opened = useMemo(
    () => (openedId === null ? null : (shots.find((shot) => shot.id === openedId) ?? null)),
    [shots, openedId],
  );

  /*
   * 这里原本还有一段"打开大图时顺手预热相邻两张成片"。
   *
   * 已删除，因为它的前提是假的：注释里写"用户在大图里能做的推进只有左右滑动"，
   * 但 `Lightbox` 里的 `PanResponder` 只做双击/平移缩放和单击关闭，**没有翻页手势**
   * （`Lightbox.tsx` 全局搜不到 `pagingEnabled` / `horizontal` / 翻页 index）。
   * 既然翻不到相邻那张，预热它们就是白解两张 12 MB 的位图 ——
   * 在一台正在跑 `CameraView` 的机器上，这个代价不该付。
   *
   * 哪天给 `Lightbox` 加了左右翻页，再把这段按"只预热下一张"重新加回来。
   */

  /**
   * 离开相册时把显影宿主收掉。
   *
   * 为什么必须要：`filmStage.host` 是**跨屏共享**的一份状态，`CameraScreen` 也在用它。
   * 本屏若是"导入到一半用户按了完成"，宿主要是不 unmount，就会一直挂着一个
   * 已经不存在的舞台 —— 下次拍照时 `mount` 会被上一次的 ready promise 干扰。
   * 正常路径（`importAndDevelop` 内部 finally）已经收过一次，这里只是兜底。
   */
  useEffect(
    () => () => {
      filmStage.host.unmount();
    },
    [filmStage.host],
  );

  /**
   * 导入用的相框 / 胶卷 —— **从最近一张成片上反推**（理由见文件头）。
   * 一条成片都没有时落到相机屏的默认值，这样第一次进相册点导入也不会崩。
   */
  const importFrame = useMemo(() => {
    const last = shots.length > 0 ? shots[0] : null;
    return FRAMES[findFrameIndex(last?.frameId ?? DEFAULT_FRAME_ID)] ?? FRAMES[0];
  }, [shots]);

  const importPreset = useMemo(() => {
    const last = shots.length > 0 ? shots[0] : null;
    const base = PRESETS[findPresetIndex(last?.presetId ?? DEFAULT_PRESET_ID)] ?? PRESETS[0];
    /*
     * 颗粒跟着**用户当前设置**走（不是跟着上一张成片）：颗粒是"这一卷怎么冲"，
     * 用户在设置页改了就该立刻生效；而相框/胶卷是"这台机器装着什么"，只能从成片反推。
     * 这一句和 `CameraScreen` 的 `effectivePreset` 是同一个算法，刻意重复 ——
     * 两边共用就得把 `settings` 也塞进 `constants/presets.ts`，那个文件不该知道设置的存在。
     */
    return applyGrainLevel(base, grainLevelAt(findGrainLevelIndex(settings.grainLevel)).scale);
  }, [settings.grainLevel, shots]);

  /**
   * 导入冲印用的舞台盒子。
   *
   * 刻意**不用** `width`（跟随旋转）：`stage` 一旦变化，`FilmCompositor` 会重排，
   * 而冲印期间用户如果旋转设备，重排会让已经 loaded 的图片回调再触发一次，
   * `useFilmStage` 的就绪计数就会错位。用一个稳定值更安全 —— 这个盒子只决定
   * 合成视图的**逻辑尺寸**，成片像素数由 `captureLongEdge` 单独决定。
   */
  const importStage = useMemo<Size>(
    () => computeDevelopStageBox({ width, height }),
    // 只在窗口尺寸真的变了时才重算（`width`/`height` 是它的全部输入）
    [width, height],
  );

  /**
   * 【＋ 導入】：选外部照片 → 逐张按当前设置重新冲印 → 存进相机胶卷 →
   * 刷新列表并直接打开第一张新成片的大图（用户要的"冲印完成后打开大图预览"）。
   *
   * ⚠️ **绝不使用"当前设备位置"**。`importPhoto.ts` 只调 `expo-location` 的
   * `reverseGeocodeAsync`，输入永远是原图 EXIF 里那一对坐标；原图没有 EXIF GPS 时
   * 地点那一行就留给合成层印摄影代号，绝不能把"用户此刻站在哪"强加给一张
   * 2014 年的老照片（规矩②，见 `importPhoto.ts` 文件头）。
   *
   * 反查**只在设置选了"地名"档时才发生**（`locationMode` 原样透传下去）：
   * `'coords'` 要的就是坐标本身、`'off'` 连地名那一行都不会印 —— 这两种情况下
   * 为每张照片白等 5s 网络、还把 EXIF 坐标发给系统地理编码服务，没有道理。
   */
  const handleImport = useCallback(async (): Promise<void> => {
    if (importing) {
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImporting(true);
    try {
      const result = await importAndDevelop({
        host: filmStage.host,
        frame: importFrame,
        preset: importPreset,
        stage: importStage,
        locale: localeId,
        watermarkLayout: settings.watermarkLayout,
        placeDetail: settings.placeDetail,
        grainLevel: settings.grainLevel,
        locationMode: settings.locationMode,
      });

      if (result.ok) {
        // 先把列表刷新起来：`refresh()` 是异步的，真正拿到新列表要等下一两个 tick
        void refresh();
        const first = result.uris[0];
        if (first !== undefined) {
          const match = shots.find((shot) => shot.uri === first);
          if (match !== undefined) {
            setOpenedId(match.id);
          } else {
            /*
             * 刚冲印好的那张此时**还不在** `shots` 里（`useGallery` 的列表是异步换的），
             * 所以现在没有 id 可以拿来开灯箱。记下 uri，等新列表到了再开 ——
             * 见下面那个 `pendingOpenUri` 的 effect。这是**正常路径**而不是兜底：
             * 导入时列表必然还是旧的，所以每次导入都会走这里。
             */
            pendingOpenUri.current = first;
          }
        }
        if (result.missingExifDate) {
          showToast({ key: `import-noexif-${Date.now()}`, message: t('gallery.import.noExif') });
        }
        return;
      }

      if (result.reason === 'cancelled') {
        // 用户在系统选图器里按了取消：这不是失败，连提示都不该有
        return;
      }
      if (result.reason === 'permission-denied') {
        showToast({ key: `import-denied-${Date.now()}`, message: t('gallery.import.denied') });
        return;
      }
      showToast({
        key: `import-failed-${Date.now()}`,
        message: t('gallery.import.failed', { message: result.message ?? t('common.unknownError') }),
      });
    } finally {
      setImporting(false);
    }
  }, [
    filmStage.host,
    importFrame,
    importPreset,
    importStage,
    importing,
    localeId,
    refresh,
    settings.grainLevel,
    settings.placeDetail,
    settings.watermarkLayout,
    showToast,
    shots,
    t,
  ]);

  /**
   * 刚冲印好的成片，等着"列表刷出来之后自动打开大图"。
   *
   * 为什么不用 `await refresh()` 直接拿新列表：`useGallery.refresh()` 返回的是
   * `Promise<void>`，它把新数组 `setShots` 进去之后才 resolve —— 但 `handleImport`
   * 闭包里的 `shots` 永远是**这次渲染时的那一份**，await 完再读还是旧的。
   * 想拿到新的只有两条路：改 hook 的签名（不在写入范围）或者像这样等状态流回来。
   */
  const pendingOpenUri = useRef<string | null>(null);

  useEffect(() => {
    const uri = pendingOpenUri.current;
    if (uri === null) {
      return;
    }
    const match = shots.find((shot) => shot.uri === uri);
    if (match === undefined) {
      return;
    }
    pendingOpenUri.current = null;
    setOpenedId(match.id);
  }, [shots]);

  /**
   * 删掉这一张。**调用方必须先问过用户** ——
   *   ① 灯箱：`Lightbox.handleDelete` 的 `Alert` 已经问过；
   *   ② 网格：`renderItem` 里的长按（`onLongPress`）问过。
   * 这里只管"退回网格 + 落库"，不再弹第二个框。
   *
   * 为什么退回网格放在这里而不是调用方：删完留在详情页只会看到一张已经不存在的图，
   * 而两个调用方都需要这个收尾动作，写两遍迟早会漏一处。
   * `remove` 内部先改内存再落盘，所以这一步之后网格里那一格已经没了。
   */
  const deleteShotNow = useCallback(
    (shot: GalleryShot): void => {
      setOpenedId(null);
      void remove(shot.id);
      // 删的是整屏盖住的详情页/一格缩略图，不留回音的话用户会怀疑没生效。
      showToast({ key: `deleted-${Date.now()}`, message: t('gallery.deleted') });
    },
    [remove, showToast, t],
  );

  /** 网格那一格被长按：二次确认后才落库。确认框和灯箱用**同一套** `gallery.delete.*`。 */
  const confirmDelete = useCallback(
    (shot: GalleryShot): void => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Alert.alert(t('gallery.delete.title'), t('gallery.delete.message'), [
        { text: t('gallery.delete.cancel'), style: 'cancel' },
        {
          // `destructive` 让 iOS 把这一项标红并排在常规位置，用户一眼能看出哪个不可逆
          text: t('gallery.delete.confirm'),
          style: 'destructive',
          onPress: () => deleteShotNow(shot),
        },
      ]);
    },
    [deleteShotNow, t],
  );

  /** 点开某一格。触感放这里而不是 `Pressable` 的 `onPress` 里，是为了只写一次。 */
  const handleOpen = useCallback((id: string): void => {
    void Haptics.selectionAsync();
    setOpenedId(id);
  }, []);

  const handleCloseLightbox = useCallback((): void => {
    setOpenedId(null);
  }, []);

  const handleCloseScreen = useCallback((): void => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  /** 把一句现成的话吐成提示条（长卷的切片导出回音用它，那里拿不到 `LightboxToast` 的 key）。 */
  const showToastMessage = useCallback(
    (message: string): void => {
      showToast({ key: `msg-${Date.now()}`, message });
    },
    [showToast],
  );

  /**
   * 齿孔轨道 / 切片海报上印的胶卷代号，取最近一张成片的预设**名字**。
   *
   * 为什么用 `name` 而不是 `id`：预设的 `name` 本来就是代号形态
   * （`RT-400`、`PR-400`，见 `constants/presets.ts:93/111`），
   * 而 `id` 是 `retro-400` 这种小写连字符串 —— 印在齿孔旁边像文件名，不像胶卷代号。
   * 一条成片都没有时给空串：`frameCodeText` 收到空串会返回 `null`，轨道上就不印，
   * 而不是印一个假的型号。
   */
  const lastShotCode = useMemo(() => {
    const last = shots.length > 0 ? shots[0] : null;
    if (last?.presetId === undefined) {
      return '';
    }
    const preset = PRESETS[findPresetIndex(last.presetId)];
    return preset?.name ?? '';
  }, [shots]);

  // 不可见时直接不渲染：省掉一整套 FlatList 的布局开销，
  // 也避免相册里的无障碍焦点被取景屏幕抢走。
  if (!visible) {
    return null;
  }

  const tileWidth = computeTileWidth(width);
  /**
   * 大图可用高度：扣掉标题栏、模式切换条、底部操作条和上下安全区。
   * lightbox 自己会再按画幅比算 `contain` 之后的确切尺寸，这里只给"画框"。
   */
  const stageHeight = Math.max(
    160,
    height - insets.top - insets.bottom - ACTION_BAR_HEIGHT - TOOLBAR_HEIGHT - 56,
  );
  /**
   * 长卷可用高度：只要扣掉标题栏和模式切换条 —— 长卷**自己**带底部留白，
   * 不需要给灯箱的 `actionBar` 让位（长卷打开大图时是灯箱铺满整屏，覆盖掉它）。
   */
  const stripHeight = Math.max(200, height - insets.top - TOOLBAR_HEIGHT - 72);

  return (
    <View style={styles.root}>
      {/* 标题栏：左边标题，右边【＋ 導入】和【完成】 */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <Text style={styles.title} numberOfLines={1}>
          {t('gallery.title')}
        </Text>
        {/*
          【＋ 導入】。做在标题栏右侧（任务书要求的位置）。
          `disabled={importing}` 而不是"判断后不响应"：iOS 的 VoiceOver 会把
          `disabled` 读成"变暗"，用户能听出"正在忙"，比静默无响应好。
        */}
        <Pressable
          onPress={() => void handleImport()}
          disabled={importing}
          accessibilityRole="button"
          accessibilityLabel={t('gallery.import.a11y')}
          hitSlop={6}
          style={({ pressed }) => [
            styles.import,
            pressed && styles.importPressed,
            importing && styles.importBusy,
          ]}
        >
          <Text style={styles.importText} numberOfLines={1}>
            {importing ? t('gallery.import.busy') : t('gallery.import')}
          </Text>
        </Pressable>
        {/* 关闭键写"完成"而不是 ×：和设置界面同一个理由 —— 这个 App 的语汇里没有叉号。 */}
        <Pressable
          onPress={handleCloseScreen}
          accessibilityRole="button"
          accessibilityLabel={t('gallery.close')}
          hitSlop={8}
          style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
        >
          <Text style={styles.closeText} numberOfLines={1}>
            {t('gallery.close')}
          </Text>
        </Pressable>
      </View>

      {/*
        模式切换（§九）。放在标题栏**下面**独立一行而不是塞进标题栏：
        标题栏已经有标题 + 導入 + 完成三块，再把两个模式词挤进去，
        在 iPhone SE（320pt）上四个元素会互相压到 —— 这正是灯箱底栏上一轮返工的原因。
      */}
      <View style={styles.toolbar}>
        {(['strip', 'grid'] as const).map((mode) => {
          const active = viewMode === mode;
          const label = t(mode === 'strip' ? 'gallery.mode.strip' : 'gallery.mode.grid');
          return (
            <Pressable
              key={mode}
              onPress={() => {
                if (active) {
                  return;
                }
                void Haptics.selectionAsync();
                setViewMode(mode);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t('gallery.mode.a11y', { label })}
              style={({ pressed }) => [
                styles.modeButton,
                active && styles.modeButtonOn,
                pressed && styles.modeButtonPressed,
              ]}
            >
              <Text style={[styles.modeText, active && styles.modeTextOn]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 失败提示：hook 的 `error` 是诊断原文（"保存到内置相册失败"这类），
          只占一行、不弹窗、不拦操作 —— 相册里已有的照片仍然该看得到。 */}
      {error !== null ? (
        <Text style={styles.errorLine} numberOfLines={2}>
          {error}
        </Text>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ink.amberSoft} />
        </View>
      ) : null}

      {/* 空相册只在"没有内容且不在加载中"时出现；
          否则加载态会和"还没有照片"叠在一起，看起来像相册被清空了。 */}
      {!loading && shots.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>{t('gallery.empty')}</Text>
          <Text style={styles.emptyHint} numberOfLines={3}>
            {t('gallery.emptyHint')}
          </Text>
        </View>
      ) : null}

      {/*
        长卷底片（§九，默认模式）。整块交给 `StripView.tsx` —— 齿孔轨道、帧号暗码、
        6% 打滑、切片导出都在那里，本文件只负责给它尺寸和回调。
        `filmCode` 用**最近一张成片**的胶卷代号（和 `importPreset` 同一个来源）；
        一条成片都没有时就没有长卷可看（上面那个空态已经接住了）。
      */}
      {!loading && shots.length > 0 && viewMode === 'strip' ? (
        <StripView
          shots={shots}
          filmCode={lastShotCode}
          width={width}
          height={stripHeight}
          onOpen={(shot) => handleOpen(shot.id)}
          onLongPress={confirmDelete}
          onSaved={showToastMessage}
          onFailed={showToastMessage}
        />
      ) : null}

      {!loading && shots.length > 0 && viewMode === 'grid' ? (
        <FlatList
          data={shots}
          keyExtractor={(shot) => shot.id}
          numColumns={COLUMNS}
          // 缝交给 `columnWrapperStyle` 的 gap，而不是给每一格加 marginRight：
          // 后者会让"最后一列"也多出一份右边距，三列就不再居中。
          columnWrapperStyle={styles.row}
          contentContainerStyle={[styles.grid, { paddingBottom: Math.max(insets.bottom, 16) }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => handleOpen(item.id)}
              /*
                长按删一格。为什么网格也要有删除入口：删掉的那张如果正好是
                用户不想再看的大图，他得先点开、再点垃圾桶、再确认 —— 三步。
                长按是 iOS 相册里"删一张"的既有手势，用户不用学。
                `delayLongPress` 比默认的 500ms 略短：格子里是图片不是文字，
                长按的意图很明确，而 500ms 在真机上会让人以为没反应。
              */
              onLongPress={() => confirmDelete(item)}
              delayLongPress={420}
              accessibilityRole="image"
              accessibilityLabel={t('gallery.photo', {
                // 序号从 1 开始：这是说给人听的序号，不是数组下标
                index: index + 1,
                date: new Date(item.createdAt).toLocaleString(),
              })}
              style={({ pressed }) => [
                styles.tile,
                { width: tileWidth, height: tileWidth },
                pressed && styles.tilePressed,
              ]}
            >
              <Image
                // 只铺缩略图：成片几十张一起解码会 OOM（见文件头注释 ①）
                source={{ uri: item.thumbUri }}
                style={styles.tileImage}
                // cover 而不是 contain：格子是正方形，成片大多是 4:3，
                // 用 cover 只是视觉裁掉一小条边，但换来的是缩略图按"填满"路径解码，比 contain 更省。
                resizeMode="cover"
                // 关掉自己的无障碍节点：不然 TalkBack / VoiceOver 会在格子的标签之后
                // 把这张图当第二个元素再念一遍（"图像"），同一个格子被读两次。
                accessible={false}
              />
            </Pressable>
          )}
        />
      ) : null}

      {/* 提示条：操作的结果（存到哪个相簿 / 分享失败）要有回音，
          否则用户按了"保存"却什么都没发生，只能自己跑去系统相册翻。 */}
      {toast !== null ? (
        <View
          style={[styles.toast, { bottom: insets.bottom + ACTION_BAR_HEIGHT + 24 }]}
          // 读一句提示，别让它变成要用户去点掉的挡板
          accessibilityLiveRegion="polite"
          pointerEvents="none"
        >
          <Text style={styles.toastText} numberOfLines={2}>
            {toast.message}
          </Text>
        </View>
      ) : null}

      {/*
        导入冲印的合成舞台（§八）。**真的渲染出来**，只是上面盖了一层 96% 不透明的幕布 ——
        `view-shot` 抓的是这棵视图树，它在屏幕上的位置不重要，但"在不在屏幕上"很重要。
        顺序是「幕布 → 合成视图 → 转圈文字」：幕布先画（压暗底下的相册），
        合成视图画在它之上（用户看得见照片在被冲印），转圈在最上面。
        转圈和幕布都在 `FilmCompositor` 之外，所以不会被截进成片。
      */}
      {importing || filmStage.stage !== null ? (
        <View style={styles.stageLayer}>
          <View style={styles.stageVeil} pointerEvents="auto" />
          {filmStage.stage !== null ? (
            <FilmCompositor
              stage={filmStage.stage}
              viewShotRef={filmStage.viewShotRef}
              onLayout={filmStage.handleStageLayout}
              onImageLoad={filmStage.handleStageImageLoad}
              timestampFontFamily={fonts.fontFamily}
              /*
               * 相框风格变体（v1.7.0 · 模块二）。相册导入冲印走的是**同一个**合成舞台，
               * 所以这里也得带上 —— 否则同一个相框设置下，"拍出来的"和"导进来的"
               * 会洗出两种相纸，用户只会觉得 App 坏了。
               *
               * 刻意读**当前设置**而不是这一张拍摄时记下的值：`galleryStore` 里没有
               * 存过变体（历史成片也没有这个概念），而且用户按下"导入"这一刻的意图，
               * 就是他此刻在设置里选的那一档。
               */
              frameVariant={settings.frameVariant}
            />
          ) : null}
          <ActivityIndicator color={darkroom.ink.amberSoft} />
          <Text style={styles.stageBusy} numberOfLines={1}>
            {t('gallery.import.busy')}
          </Text>
        </View>
      ) : null}

      {/*
        大图（lightbox）。整块盖住本屏，连标题栏一起 —— 看图时不该还看见网格的标题。
        `key` 用照片 id：换一张图就重挂一次，缩放/平移状态天然复位，
        不然从"放大过的第 3 张"切到第 4 张会带着上一张的 3 倍缩放。
      */}
      {opened !== null ? (
        <Lightbox
          key={opened.id}
          uri={opened.uri}
          /*
            把缩略图一起递下去垫底（见 `Lightbox.tsx` 文件头）。
            `thumbUri === uri` 是**真实存在**的情况：缩略图生成失败时
            `galleryStore.addShot` 会把它退化成成片自己（长边 2048）。那种情况下
            传空串 —— 垫一张和成片一模一样的图不但没用，还白占一份解码内存。
          */
          thumbUri={opened.thumbUri === opened.uri ? '' : opened.thumbUri}
          position={shots.findIndex((shot) => shot.id === opened.id) + 1}
          aspectRatio={opened.height > 0 ? opened.width / opened.height : 1}
          availableHeight={stageHeight}
          onClose={handleCloseLightbox}
          /*
            灯箱里已经问过一次了（`Lightbox.handleDelete` 的 Alert），
            这里**只能静默删** —— 再弹一次就是在问一件已经发生的事。
            回音（`gallery.deleted`）由 `deleteShotNow` 统一负责。
          */
          onDelete={() => deleteShotNow(opened)}
          onToast={showToast}
        />
      ) : null}
    </View>
  );
}

/**
 * 样式表 = "当前机身配色"的函数（见组件里 `styles` 那段注释）。
 *
 * 为什么把原先写死的白色/琥珀那几处也一并换成 token：
 * - `rgba(255,255,255,0.06)`（按下反馈）在浅机身上是一层白雾，改用 `glass`：
 *   深机身是 `rgba(255,255,255,0.08)`，浅机身自动变成 `rgba(0,0,0,0.06)`。
 * - 【＋ 導入】和模式胶囊原先写死 `rgba(229,169,60,*)` / `#E5A93C`。
 *   它们是"选中 / 主操作"的强调色，浅机身的强调色是朱红，写死琥珀会在浅底上发土。
 *   这里用 `glassBorder` + `ink.amber` 表达同一件事：一块比别人实一点的底色 + 强调色文字。
 * - 只有冲印幕布（`stageVeil` / `stageBusy`）固定走深色，理由见组件里 `darkroom` 那段。
 */
function createStyles(theme: Theme) {
  const { ink, scrim, glass, glassBorder } = theme;
  const darkroom = themeFor('dark');

  return StyleSheet.create({
  root: {
    // 注意：RN 0.86 已移除 StyleSheet.absoluteFillObject，只能用 absoluteFill
    ...StyleSheet.absoluteFill,
    // 压在 DevelopOverlay（zIndex 20）之上、与 SettingsScreen（30）同级：
    // 显影过程中打开相册不该被盖住，两者也不会同时打开
    zIndex: 30,
    // 必须不透明：取景器的实时预览就在这块下面跑（见文件头那段遮罩说明）
    backgroundColor: scrim,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    flex: 1,
    color: ink.paper,
    fontFamily: UI_MONO,
    fontSize: 18,
    letterSpacing: 4,
  },
  close: {
    minWidth: 34,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ink.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closePressed: {
    backgroundColor: glass,
  },
  closeText: {
    color: ink.amberSoft,
    fontFamily: UI_MONO,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  /*
    【＋ 導入】。给它实心一点的底色（而不是和"完成"一样的描边）：
    它是这一页唯一的"产生内容"的动作，另外两个都是"离开"。
    底色用 `glass` 而不是纯色 —— 纯强调色底 + 反色字在面板上会太跳，
    和这台机器的"液晶 + 描边"语汇不符。
  */
  import: {
    minWidth: 34,
    height: 30,
    paddingHorizontal: 12,
    marginRight: 8,
    borderRadius: 15,
    backgroundColor: glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importPressed: {
    // 没有比 `glass` 更"实"的通用 token，用不透明度做按下反馈即可
    opacity: 0.6,
  },
  importBusy: {
    // 忙的时候压暗：配合 `disabled`，让"按不动"这件事看得出来
    opacity: 0.6,
  },
  importText: {
    color: ink.amber,
    fontFamily: UI_MONO,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  /** 模式切换行。`radio` 语义靠 `accessibilityRole`，视觉上就是两枚并排的胶囊。 */
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: TOOLBAR_HEIGHT,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  modeButton: {
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ink.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonOn: {
    borderColor: glassBorder,
    backgroundColor: glass,
  },
  modeButtonPressed: {
    opacity: 0.7,
  },
  modeText: {
    color: ink.paperDim,
    fontFamily: UI_MONO,
    fontSize: 12,
    letterSpacing: 1,
  },
  modeTextOn: {
    color: ink.amber,
  },
  /**
   * 导入冲印的幕布 + 合成舞台。
   *
   * `stageLayer` 必须**真的可见**（不能 `opacity: 0`、不能挪到屏幕外）——
   * iOS 截图对没上屏的视图会截到空图，见 `DevelopOverlay.tsx` 文件头的同一条说明。
   * 所以这不是"藏起来偷偷截"，而是"盖一层布当着用户的面截"。
   * `zIndex: 40` 压住本页所有内容（包括灯箱），冲印完就卸掉。
   */
  stageLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageVeil: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 10, 12, 0.96)',
  },
  stageBusy: {
    marginTop: 12,
    color: darkroom.ink.paperDim,
    fontFamily: UI_MONO,
    fontSize: 12,
    letterSpacing: 2,
  },
  errorLine: {
    marginHorizontal: 20,
    marginBottom: 8,
    color: ink.amberSoft,
    fontFamily: UI_MONO,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.8,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: ink.paperDim,
    fontFamily: UI_MONO,
    fontSize: 13,
    letterSpacing: 2,
  },
  emptyHint: {
    marginTop: 10,
    color: ink.paperFaint,
    fontFamily: UI_MONO,
    fontSize: 11,
    lineHeight: 18,
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  grid: {
    paddingHorizontal: PADDING,
  },
  row: {
    gap: GAP,
    marginBottom: GAP,
  },
  tile: {
    // 照片还没解码完时露出的占位底色，跟机身走（浅机身下不能是一层白）
    backgroundColor: glass,
    overflow: 'hidden',
  },
  tilePressed: {
    opacity: 0.7,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ink.hairline,
  },
  toastText: {
    color: ink.paper,
    fontFamily: UI_MONO,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  });
}
