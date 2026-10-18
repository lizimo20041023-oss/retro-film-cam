/**
 * 冲印状态徽标（v1.9.0 · 用户手术一）：**不再阻塞取景器**。
 *
 * v1.8.x 的那层是全屏暖黑幕布 + 操作防火墙，副作用是用户每拍一张都要盯着它等
 * 5~7 秒（裁切 → 测光 → 离屏合成 → 写相册），快门和取景器都被锁死。v1.9.0 起冲印
 * 搬进异步串行队列（见 `CameraScreen` 的 `pumpQueue`），这层就只剩下"告诉用户后台
 * 在洗第几张"的职责：安全区内一枚小胶囊，不吃触摸、不遮画面。
 *
 * 合成舞台去哪儿了：`FilmStageComposer` 现在挂在 `CameraScreen` 的 `styles.preview`
 * 内部、`cameraClipNode` 之前，平时被 `styles.stageOccluder` 这层不透明挡板盖住
 * （它必须真的上屏、真的可见，否则 iOS 的 `renderInContext` 会截到空图）；只有
 * 截图失败兜底时才把舞台临时抬到挡板之上。所以这个文件里**没有**任何全屏层，
 * 也**没有** `children` 插槽。
 *
 * `computeDevelopStageBox` 仍然留在这里：它是"合成舞台能用的逻辑尺寸"，也是
 * `processFilmPhoto({ stage })` 传的尺寸 —— 两边共用一套几何，保证所见即所得。
 */
import { memo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';
import type { DevelopStage, DevelopStatus, Size } from '../types';

/** 舞台四周留白。 */
export const DEVELOP_STAGE_MARGIN = 16;
/**
 * 底部状态条预留高度。
 * v1.9.0 起舞台藏在取景器后面、不再需要给底部状态条让位，但 `stageBox` 是
 * "排版尺寸"的公共约定（合成舞台 / 相框预览共用），改它会连带改所有旧成片的
 * 构图，所以常量与公式**保持不变**。
 */
export const DEVELOP_PANEL_RESERVE = 172;

/**
 * 合成舞台能用的逻辑尺寸。
 * 这个值决定舞台在屏幕上的**排版尺寸**（也是相框在取景器里的排版尺寸，两边共用一套几何，
 * 所以"所见即所得"）；成片的像素数则由预设里的 `captureLongEdge` 单独决定
 * （见 `src/utils/captureOptions.ts`）。别把这个尺寸设得比屏幕小很多，否则舞台上的
 * 颗粒会被挤得更糊。
 */
export function computeDevelopStageBox(viewport: Size): Size {
  return {
    width: Math.max(1, viewport.width - DEVELOP_STAGE_MARGIN * 2),
    height: Math.max(1, viewport.height - DEVELOP_STAGE_MARGIN * 2 - DEVELOP_PANEL_RESERVE),
  };
}

export interface DevelopBadgeProps {
  /** 当前这条冲印链路的状态（`idle` 时整个徽标不渲染）。 */
  status: DevelopStatus;
  /** 队列里还没洗完的张数（含正在洗的这张）；`developing` 时显示成"队列 N"。 */
  queueDepth: number;
}

/** 三个阶段各自的文案键 —— 翻译要跟着语言变，所以这里只存键，取文案在组件里做。 */
const STAGE_TEXT: Record<DevelopStage, MessageKey> = {
  normalizing: 'develop.stage.normalizing',
  capturing: 'develop.stage.capturing',
  saving: 'develop.stage.saving',
};

/**
 * v1.8.6 · 契约 §2/§4 的 `memo` 包装保留；v1.9.0 起它退化成"一枚小胶囊"。
 *
 * 为什么还值得 memo：相机屏顶层有 37 个 state（曝光 / 色温 / 变焦都在上面），
 * 参数条一动就整屏重渲染；徽标只关心 `status` / `queueDepth` 两个 props，
 * 父级把它们放进 `useMemo` 节点里就能挡掉绝大多数重渲染。
 *
 * 内部实现名 `DevelopOverlayImpl` 是刻意保留的：`_verify_ipa_v190.py` 的
 * `IF_LOCAL_NAMES_KEPT` 表按名字断言它（canary 在时必须存在）。
 *
 * 这层不渲染 `onPress`、不铺 backdrop：done/error 的自动退场是 CameraScreen 的
 * `useEffect` 做的（那里才有 `setStatus`），点按任何位置都不会打断取景。
 */
function DevelopOverlayImpl({ status, queueDepth }: DevelopBadgeProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  if (status.kind === 'idle') {
    return null;
  }

  return (
    <View pointerEvents="none" style={[styles.layer, { paddingTop: insets.top + 8 }]}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={
          status.kind === 'developing'
            ? `${t(STAGE_TEXT[status.stage])} ${t('develop.queue.count', { count: queueDepth })}`
            : status.kind === 'done'
              ? t(status.saved ? 'develop.done.saved' : 'develop.done.unsaved')
              : `${t('develop.error.title')} ${status.message}`
        }
        style={styles.pill}
      >
        {status.kind === 'developing' ? (
          <>
            <ActivityIndicator size="small" color="#FFB562" />
            <Text style={styles.title}>{t(STAGE_TEXT[status.stage])}</Text>
            {queueDepth > 0 ? (
              <Text style={styles.queue}>{t('develop.queue.count', { count: queueDepth })}</Text>
            ) : null}
          </>
        ) : null}

        {status.kind === 'done' ? (
          <Text style={styles.title}>{t(status.saved ? 'develop.done.saved' : 'develop.done.unsaved')}</Text>
        ) : null}

        {status.kind === 'error' ? (
          <>
            <Text style={styles.errorTitle}>{t('develop.error.title')}</Text>
            <Text style={styles.message} numberOfLines={1}>
              {status.message}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

export const DevelopBadge = memo(DevelopOverlayImpl);

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // 安全区内居中的一条窄带：宽度撑满才能居中，但整层不吃触摸
    alignItems: 'center',
    zIndex: 21,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '92%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(10, 10, 11, 0.82)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  title: {
    marginLeft: 8,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  queue: {
    marginLeft: 8,
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 12,
    fontWeight: '500',
  },
  errorTitle: {
    color: '#FFB4A2',
    fontSize: 12,
    fontWeight: '700',
  },
  message: {
    marginLeft: 8,
    maxWidth: 220,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
  },
});
