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
import { INK, UI_MONO } from '../constants/theme';
import { useI18n } from '../i18n';
import { useGallery } from '../hooks/useGallery';
import type { GalleryShot } from '../utils/galleryStore';

/** 三列。改这里必须同步改下面 `tileWidth` 的计算，否则最后一行会溢出屏幕。 */
const COLUMNS = 3;

/** 格子之间的缝。 */
const GAP = 3;

/** 网格左右内边距。 */
const PADDING = 12;

/** 大图下方的操作条高度，用来给大图留出不被压住的空间。 */
const ACTION_BAR_HEIGHT = 72;

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
  const { t } = useI18n();
  const { shots, loading, error, refresh, remove } = useGallery();

  /**
   * 正在看大图的那张；`null` = 停留在网格。
   * 存 id 而不是整条记录：`shots` 因为对账刷新换了新数组时，大图靠 id 重新查得到最新数据；
   * 存副本的话会一直显示一份陈旧快照，而且删除后还得手动清理它。
   */
  const [openedId, setOpenedId] = useState<string | null>(null);

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
   * 顺手把上次看的大图关掉，保证每次进来都落在网格上。
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
    void refresh();
  }, [visible, refresh]);

  /** 当前大图对应的记录；记录被删掉后自动变回 `null`，详情视图随之关闭。 */
  const opened = useMemo(
    () => (openedId === null ? null : (shots.find((shot) => shot.id === openedId) ?? null)),
    [shots, openedId],
  );

  /**
   * 大图里的"删除这张"。二次确认后才落库。
   * `useCallback` 是为了让下面那个 `onPress={() => { ... }}` 不必每次渲染都新建闭包，
   * 也顺便让 `t` 的依赖关系显式可见。
   */
  const confirmDelete = useCallback(
    (shot: GalleryShot): void => {
      Alert.alert(t('gallery.delete'), undefined, [
        { text: t('gallery.cancel'), style: 'cancel' },
        {
          // `destructive` 让 iOS 把这一项标红并排在常规位置，用户一眼能看出哪个不可逆
          text: t('gallery.delete'),
          style: 'destructive',
          onPress: () => {
            // 删完退回网格：留在详情页只会看到一张已经不存在的图。
            // `remove` 内部先改内存再落盘，所以这一步之后网格里那一格已经没了。
            setOpenedId(null);
            void remove(shot.id);
          },
        },
      ]);
    },
    [remove, t],
  );

  // 不可见时直接不渲染：省掉一整套 FlatList 的布局开销，
  // 也避免相册里的无障碍焦点被取景屏幕抢走。
  if (!visible) {
    return null;
  }

  const tileWidth = computeTileWidth(width);
  /** 大图区域：铺满宽度，高度扣掉标题栏、操作条和上下安全区。 */
  const detailHeight = Math.max(160, height - insets.top - insets.bottom - ACTION_BAR_HEIGHT - 56);

  return (
    <View style={styles.root}>
      {/* 标题栏 */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <Text style={styles.title} numberOfLines={1}>
          {t('gallery.title')}
        </Text>
        {/* 关闭键写"完成"而不是 ×：和设置界面同一个理由 —— 这个 App 的语汇里没有叉号。 */}
        <Pressable
          onPress={onClose}
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

      {/* 失败提示：hook 的 `error` 是诊断原文（"保存到内置相册失败"这类），
          只占一行、不弹窗、不拦操作 —— 相册里已有的照片仍然该看得到。 */}
      {error !== null ? (
        <Text style={styles.errorLine} numberOfLines={2}>
          {error}
        </Text>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={INK.amberSoft} />
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

      {!loading && shots.length > 0 ? (
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
              onPress={() => setOpenedId(item.id)}
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

      {/* 大图 */}
      {opened !== null ? (
        <View style={styles.detail}>
          <Image
            source={{ uri: opened.uri }}
            style={[styles.detailImage, { height: detailHeight }]}
            // 大图必须完整看到，任何裁切都会让用户以为照片拍坏了
            resizeMode="contain"
          />
          <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable
              onPress={() => confirmDelete(opened)}
              accessibilityRole="button"
              accessibilityLabel={t('gallery.delete')}
              hitSlop={8}
              style={({ pressed }) => [styles.action, pressed && styles.closePressed]}
            >
              <Text style={styles.actionDanger} numberOfLines={1}>
                {t('gallery.delete')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setOpenedId(null)}
              accessibilityRole="button"
              accessibilityLabel={t('gallery.close')}
              hitSlop={8}
              style={({ pressed }) => [styles.action, pressed && styles.closePressed]}
            >
              <Text style={styles.closeText} numberOfLines={1}>
                {t('gallery.close')}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    // 注意：RN 0.86 已移除 StyleSheet.absoluteFillObject，只能用 absoluteFill
    ...StyleSheet.absoluteFill,
    // 压在 DevelopOverlay（zIndex 20）之上、与 SettingsScreen（30）同级：
    // 显影过程中打开相册不该被盖住，两者也不会同时打开
    zIndex: 30,
    backgroundColor: 'rgba(12, 12, 11, 0.97)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    flex: 1,
    color: INK.paper,
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
    borderColor: INK.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closePressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  closeText: {
    color: INK.amberSoft,
    fontFamily: UI_MONO,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  errorLine: {
    marginHorizontal: 20,
    marginBottom: 8,
    color: INK.amberSoft,
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
    color: INK.paperDim,
    fontFamily: UI_MONO,
    fontSize: 13,
    letterSpacing: 2,
  },
  emptyHint: {
    marginTop: 10,
    color: INK.paperFaint,
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
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    overflow: 'hidden',
  },
  tilePressed: {
    opacity: 0.7,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  detail: {
    ...StyleSheet.absoluteFill,
  },
  detailImage: {
    width: '100%',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  action: {
    minWidth: 88,
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: INK.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDanger: {
    color: INK.amberDeep,
    fontFamily: UI_MONO,
    fontSize: 12,
    letterSpacing: 1.2,
  },
});
