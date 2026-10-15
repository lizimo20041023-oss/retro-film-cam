/**
 * 底部左侧的相册缩略图。
 *
 * 为什么缩略图自己持有 `useGallery()`：这份列表随拍随变。如果放在相机屏幕里，每存一张
 * 照片整屏都要重渲染一次，而屏幕里挂着 `CameraView` —— 原生侧会重新下发 `zoom` /
 * `selectedLens` 这些 prop，代价远大于"更新一张 44pt 的图"。
 *
 * 为什么还要 `refreshKey`：`useGallery()` 每个调用点各拿一份内存列表，相机屏幕存完照片
 * 后缩略图这份不会自己知道。用一个自增的 key 显式催它刷新，比把整份相册状态提上去便宜得多。
 */
import { useEffect, useRef } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useI18n } from '../i18n';
import { useTheme } from '../constants/theme';
import { useGallery } from '../hooks/useGallery';
import { scheduleWarmImageCache } from '../utils/imageWarmup';

export interface AlbumThumbProps {
  /** 每冲印完一张就 +1：显式告诉这份列表"该重新读盘了"。 */
  refreshKey: number;
  size: number;
  onPress: () => void;
}

export function AlbumThumb({ refreshKey, size, onPress }: AlbumThumbProps) {
  const { ink, glass, glassBorder } = useTheme();
  const { t } = useI18n();
  const { shots, refresh } = useGallery();
  const firstRun = useRef(true);

  useEffect(() => {
    // 首次挂载 hook 自己会读一次盘，这里再读就是白读一遍
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    void refresh();
  }, [refreshKey, refresh]);

  const latest = shots.length > 0 ? shots[0] : null;

  /**
   * 相机页空闲时，把最新那张的**成片**（不是缩略图）先喂进原生图片缓存。
   *
   * 为什么是这一张：缩略图点开进去，默认停在长卷的最左端，而最新那张就在最左端，
   * 所以"用户下一眼会看的那张大图"几乎必然是这一张。它又是唯一一张没有在屏幕上
   * 渲染过的图（缩略图那条路早就解码过了），于是它的 2048px 解码就成了点开大图时
   * 那个"黑屏约 1 秒"里最贵的一段。
   *
   * 为什么用 `scheduleWarm...` 而不是直接预热：拍照后这个列表会变，预热不能挤在
   * 那一帧里（原生缓存查找是同步的）。见 `utils/imageWarmup.ts` 里的说明。
   */
  useEffect(() => {
    if (latest === null) {
      return;
    }
    // 只预热一张：内存里多一张 12 MB 的位图就够呛了，这里不贪。
    // 依赖写 `latest?.uri` 而不是整条记录：每次 `refresh()` 都会重建列表（对象是新引用、
    // uri 没变），盯着对象会让"刚拍完、列表对账"这种刷新也白触发一次预热。
    return scheduleWarmImageCache([latest.uri], 1);
  }, [latest?.uri]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('camera.thumb.a11y')}
      style={({ pressed }) => [
        styles.box,
        { width: size, height: size, borderColor: glassBorder, backgroundColor: glass },
        pressed && styles.pressed,
      ]}
    >
      {latest !== null ? (
        <Image source={{ uri: latest.thumbUri }} style={styles.image} resizeMode="cover" fadeDuration={0} />
      ) : (
        // 空相册也画一个方框：位置先立住，用户才知道"这儿以后会有东西"
        <View style={[styles.placeholder, { borderColor: ink.paperFaint }]} />
      )}
    </Pressable>
  );
}

// 只放几何：颜色现取，模块级配色会把深浅色切换冻在首次渲染那一刻。
const styles = StyleSheet.create({
  box: {
    borderRadius: 3,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '58%',
    height: '58%',
    borderWidth: 1,
    borderRadius: 2,
  },
  pressed: {
    opacity: 0.6,
  },
});
