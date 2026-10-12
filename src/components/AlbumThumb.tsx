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
