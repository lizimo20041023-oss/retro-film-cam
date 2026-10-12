/**
 * 变焦档位：三个等宽的拟物机械按键 `0.5×` / `1×` / `2×`。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么把滑轨换成档位
 * ─────────────────────────────────────────────────────────────────────
 * 原来的 `ZoomBar` 是一条 0~0.75 的连续行程（`src/constants/zoom.ts`），
 * 适合"再过去一点点"的微调，但它有两个问题：
 *   1. 那条行程的百分比**本身没有物理含义**（原生的 maxZoomFactor 从 JS 读不到，
 *      见 `zoom.ts` 文件头），用户拖到一个数字也不知道自己站在哪；
 *   2. 手机上的单指拖动要和取景器的点按对焦抢手势。
 * 换成三个固定档位之后，"我想用超广角"这个意图变成一次点击，
 * 而且每一档对应的是**镜头**或**明确的裁切倍率**，不是某个虚线数字。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 选中态为什么不改变布局（这是这个组件最容易写错的地方）
 * ─────────────────────────────────────────────────────────────────────
 * 三个格子用 `flex: 1` 等分一个**固定宽度**的容器，容器的宽度由
 * `useWindowDimensions()` 算出来（见 `trackWidth`），**和选中哪一档完全无关**。
 * 选中态只体现在格子**内部**：一个"抬起"的琥珀色小柱（`styles.pillar`）。
 * 也就是说选中第一个档位时，抬起的是最左边那一格，而**整条轨道仍在屏幕正中** ——
 * 早期版本把选中项做成"更宽的 pill"并用 `flex` 分配宽度，结果点第一档整排往左挪，
 * 那是绝不允许的回归。改这个组件时请守住这条：**轨道宽度只能依赖窗口宽度**。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么不用原生组件
 * ─────────────────────────────────────────────────────────────────────
 * 不用 `Slider`（Android 上是 Material 风格、iOS 上是系统轨道，两边的"机械感"都不对，
 * 而且拖动语义和点按语义冲突）；也不用分段控件（`SegmentedControl` 在 RN 里
 * 只有 iOS 有，Android 得自己实现，等于白搭一层平台分支）。
 * 这里的"拟物"全部靠嵌套 `View` 的边框和底色叠出来：
 *   外框（凹槽） → 格子分隔线 → 抬起柱（琥珀底 + 亮上边 + 暗下边）。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 现状：这个组件当前**没有挂载点**
 * ─────────────────────────────────────────────────────────────────────
 * 新规格把档位条从取景器上撤了（焦段改成胶囊循环 + 捏合），所以 `CameraScreen` 不再
 * 引用它。文件保留是因为 `constants/zoom.ts`、`constants/lenses.ts`、
 * `hooks/usePinchZoom.ts` 的文件头都指向这里，删掉会让那几段解释失去落点。
 * 颜色已按 `useTheme()` 迁移过一次，将来要重新挂载时不用再补一遍。
 */
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { UI_MONO, useTheme } from '../constants/theme';
import type { Theme } from '../constants/theme';

/** 一档在 UI 上的形状。数据来自 `src/constants/lenses.ts` 的 `ZOOM_STOPS`。 */
export type ZoomStopView = {
  /** 稳定 id（`ZOOM_STOPS` 里那个）。 */
  id: string;
  /** 按钮正面显示的倍率文案，例如 `0.5×`。 */
  short: string;
  /** 无障碍标签（已翻译，含倍率和镜头角色）。 */
  a11y: string;
  /** 硬件上确实没有这一档（且镜头列表已经回来了）。 */
  disabled?: boolean;
  /**
   * 这一档是数码裁切而不是切光学镜头。
   * 为 `true` 时格子上会多一个极小的 `D` 角标，并且无障碍标签里已经说明了
   * "数码变焦"（由调用方拼进 `a11y`，因为文案要吃 `zoom.stop.digital`）。
   */
  digital?: boolean;
};

export interface ZoomStopsProps {
  /** 三个档位，按显示顺序。 */
  stops: readonly ZoomStopView[];
  /** 当前选中的档位 id；捏合之后会变成 `null`（表示"不在任何档位上"）。 */
  activeStopId: string | null;
  /** 整体是否可交互（没有权限 / 正在显影时为 false）。 */
  enabled?: boolean;
  onSelect: (id: string) => void;
}

/** 轨道的最大宽度，以及它占屏幕宽度的比例（取小者）。 */
const TRACK_MAX_WIDTH = 232;
const TRACK_WIDTH_RATIO = 0.62;
/** 抬起柱的高度（格子内部，不参与轨道布局）。 */
const PILLAR_HEIGHT = 17;

/**
 * `memo` 的理由：父组件 `CameraScreen` 每次显影进度变化都会重渲染，
 * 而档位条只在 `stops` / `activeStopId` / `enabled` 变化时才需要重画。
 */
export const ZoomStops = memo(function ZoomStops({
  stops,
  activeStopId,
  enabled = true,
  onSelect,
}: ZoomStopsProps) {
  const window = useWindowDimensions();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  // 见文件头：宽度只依赖窗口宽度，**绝不**依赖 activeStopId。
  const trackWidth = Math.min(TRACK_MAX_WIDTH, Math.round(window.width * TRACK_WIDTH_RATIO));

  return (
    <View style={styles.row}>
      <View style={[styles.track, { width: trackWidth }]}>
        {stops.map((stop, index) => {
          const active = stop.id === activeStopId;
          const disabled = !enabled || stop.disabled === true;
          return (
            <Pressable
              key={stop.id}
              accessibilityRole="button"
              accessibilityLabel={stop.a11y}
              accessibilityState={{ disabled, selected: active }}
              disabled={disabled}
              onPress={() => {
                onSelect(stop.id);
              }}
              // 捏合手势的判定区在取景器上，档位条不在里面；这里用 hitSlop 把
              // 每个格子的可点区域往上下各撑 6pt，免得 17pt 高的柱子太难点。
              hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
              style={({ pressed }) => [
                styles.cell,
                index > 0 ? styles.cellDivider : null,
                pressed ? styles.cellPressed : null,
              ]}
            >
              {/* 抬起柱画在文字**之前**：同层里后画的在上，这样文字压在柱子上；
                  而按下时整格一起变淡（`cellPressed` 改的是 opacity），不会出现
                  "柱子还在、字没了"的错位。 */}
              <View style={[styles.pillar, active ? styles.pillarActive : null]} />
              <Text
                style={[
                  styles.label,
                  stop.digital === true ? styles.labelDigital : null,
                  active ? styles.labelActive : null,
                  disabled ? styles.labelDisabled : null,
                ]}
                // 系统字号放大时不要把三个等宽格子撑变形：允许缩到 0.8 倍。
                allowFontScaling
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
              >
                {stop.short}
              </Text>
              {stop.digital === true ? (
                <Text style={[styles.digitalMark, active ? styles.digitalMarkActive : null]}>D</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

function createStyles(theme: Theme) {
  const { ink } = theme;
  return StyleSheet.create({
    row: {
      // 只负责"把轨道放在屏幕正中"，轨道宽度由上面的 trackWidth 决定。
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 8,
      paddingBottom: 4,
      backgroundColor: theme.glass,
    },
    track: {
      flexDirection: 'row',
      // 凹槽：深底 + 细描边。原来这里跟 LCD 面板共用一套琥珀描边，
      // 面板已按新规格删掉，凹槽就跟着主题的中性描边走。
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
      borderRadius: 4,
      backgroundColor: theme.panel,
      // RN 0.86 仍然支持 overflow: 'hidden'；用来让格子的分隔线止于圆角内。
      overflow: 'hidden',
    },
    cell: {
      // `flex: 1` + 固定宽度的父容器 = 三格严格等宽，且宽度与选中态无关。
      flex: 1,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellDivider: {
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: ink.hairline,
    },
    cellPressed: {
      opacity: 0.55,
    },
    pillar: {
      position: 'absolute',
      left: 4,
      right: 4,
      top: 4,
      height: PILLAR_HEIGHT,
      borderRadius: 2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
      backgroundColor: theme.glass,
    },
    pillarActive: {
      // 抬起的琥珀柱：亮上边 + 暗下边，制造"被按下去/弹起来"的机械感。
      backgroundColor: theme.glass,
      borderColor: ink.amber,
      borderTopColor: ink.paper,
      borderBottomColor: theme.scrim,
    },
    label: {
      color: ink.paperDim,
      fontSize: 12,
      letterSpacing: 0.8,
      fontFamily: UI_MONO,
    },
    labelActive: {
      color: ink.amberSoft,
      fontWeight: '700',
    },
    labelDisabled: {
      color: ink.paperFaint,
    },
    labelDigital: {
      // 数码档的文字略小一点，暗示"这不是一支独立镜头"。
      fontSize: 11.5,
    },
    digitalMark: {
      position: 'absolute',
      right: 3,
      bottom: 1,
      color: ink.paperFaint,
      fontSize: 6.5,
      fontFamily: UI_MONO,
    },
    digitalMarkActive: {
      color: ink.amberSoft,
    },
  });
}
