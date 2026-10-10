/**
 * 显影遮罩层：拍摄后盖住实时取景，露出正在合成的画面。
 *
 * 为什么要有这一层（不是纯装饰）：
 * iOS 的视图截图（`renderInContext`）对未上屏 / opacity 0 / 被完全遮住的视图可能截到空图。
 * 所以合成视图必须真的正常渲染在屏幕上 —— 这层的暖黑色半透明背景就是"把实时取景压暗，
 * 让用户看合成结果"的那块幕布，同时它**在 ViewShot 之外**，不会被截进成片。
 *
 * 它同时是"操作防火墙"：显影期间整屏吃掉触摸，避免用户连点快门或乱切相框。
 *
 * 尺寸约定：`computeDevelopStageBox` 给出的盒子 = 合成舞台能用的逻辑尺寸，
 * 也是 `processFilmPhoto({ stage })` 应该传的尺寸 —— 两边用同一个函数，保证"所见即所得"。
 */
import type { ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DevelopStage, DevelopStatus, Size } from '../types';

/** 舞台四周留白。 */
export const DEVELOP_STAGE_MARGIN = 16;
/** 底部状态条预留高度（成片预览/提示文字都在这块里）。 */
export const DEVELOP_PANEL_RESERVE = 172;

/**
 * 合成舞台能用的逻辑尺寸。
 * **这个值同时决定成片分辨率**：captureRef 不传 width/height，
 * 输出像素 = 该尺寸 × PixelRatio，所以别把它设得比屏幕还小很多，否则成片会偏软。
 */
export function computeDevelopStageBox(viewport: Size): Size {
  return {
    width: Math.max(1, viewport.width - DEVELOP_STAGE_MARGIN * 2),
    height: Math.max(1, viewport.height - DEVELOP_STAGE_MARGIN * 2 - DEVELOP_PANEL_RESERVE),
  };
}

export interface DevelopOverlayProps {
  status: DevelopStatus;
  /** 轻触"已完成 / 失败"提示后回到取景（`idle` 时不会触发）。 */
  onDismiss: () => void;
  /** 合成视图插到这里（显影结束后宿主会自动卸载它）。 */
  children?: ReactNode;
}

const STAGE_TEXT: Record<DevelopStage, string> = {
  normalizing: '正在整理底片',
  capturing: '正在曝光显影',
  saving: '正在存入相册',
};

export function DevelopOverlay({ status, onDismiss, children }: DevelopOverlayProps) {
  if (status.kind === 'idle') {
    return null;
  }

  const dismissable = status.kind === 'done' || status.kind === 'error';

  return (
    <Pressable
      // 始终吃掉触摸：显影中防止连点，结束后轻触继续
      onPress={dismissable ? onDismiss : undefined}
      accessibilityRole={dismissable ? 'button' : undefined}
      accessibilityLabel={dismissable ? '轻触继续拍摄' : undefined}
      style={styles.layer}
    >
      <View pointerEvents="none" style={styles.backdrop} />
      <View pointerEvents="none" style={styles.center}>
        {children}
      </View>

      <View pointerEvents="none" style={styles.panel}>
        {status.kind === 'developing' ? (
          <View style={styles.row}>
            <ActivityIndicator color="#FFB562" />
            <Text style={styles.title}>{STAGE_TEXT[status.stage]}…</Text>
          </View>
        ) : null}

        {status.kind === 'done' ? (
          <View style={styles.row}>
            <Image source={{ uri: status.uri }} style={styles.thumb} resizeMode="cover" />
            <View style={styles.column}>
              <Text style={styles.title}>{status.saved ? '已存入相册' : '成片已生成（未存相册）'}</Text>
              <Text style={styles.hint}>轻触画面继续拍摄</Text>
            </View>
          </View>
        ) : null}

        {status.kind === 'error' ? (
          <View style={styles.column}>
            <Text style={styles.errorTitle}>显影失败</Text>
            <Text style={styles.message}>{status.message}</Text>
            <Text style={styles.hint}>轻触画面继续拍摄</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    // 盖住实时取景，但留一点透：用户能看出画面在"显影"
    zIndex: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#140A03',
    opacity: 0.82,
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    // 上下 padding 之和 = 剧场盒子四周的留白，保证合成视图不会压到底部状态条
    paddingTop: DEVELOP_STAGE_MARGIN,
    paddingBottom: DEVELOP_STAGE_MARGIN + DEVELOP_PANEL_RESERVE,
  },
  panel: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 44,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  column: {
    flex: 1,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    marginLeft: 10,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  errorTitle: {
    color: '#FFB4A2',
    fontSize: 16,
    fontWeight: '700',
  },
  message: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    lineHeight: 19,
  },
  hint: {
    marginTop: 6,
    marginLeft: 10,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
  },
});
