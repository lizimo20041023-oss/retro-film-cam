/**
 * 权限/异常提示卡片：相机没权限、相机挂载失败、相册写入被拒都用它。
 *
 * 设计上只做"展示 + 两个按钮"，不做任何权限逻辑 —— 逻辑在调用方（CameraScreen），
 * 这样同一张卡片既能显示"允许相机"也能显示"去系统设置"。
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme, UI_MONO } from '../constants/theme';
import type { Theme } from '../constants/theme';

export interface PermissionNoticeProps {
  title: string;
  message: string;
  /** 主按钮文案（不传 = 不显示主按钮）。 */
  actionLabel?: string;
  onAction?: () => void;
  /** 次按钮文案（例如"重新检测"）。 */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** 底部小字补充说明。 */
  hint?: string;
  style?: StyleProp<ViewStyle>;
}

export function PermissionNotice({
  title,
  message,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  hint,
  style,
}: PermissionNoticeProps) {
  const { ink, panel, glassBorder } = useTheme();
  const styles = useMemo(() => createStyles(ink, panel, glassBorder), [ink, panel, glassBorder]);

  const hasPrimary = typeof actionLabel === 'string' && actionLabel.length > 0 && onAction !== undefined;
  const hasSecondary =
    typeof secondaryLabel === 'string' && secondaryLabel.length > 0 && onSecondary !== undefined;

  return (
    <View style={[styles.card, style]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>

      <View style={styles.actions}>
        {hasPrimary ? (
          <Pressable
            accessibilityRole="button"
            onPress={onAction}
            style={({ pressed }) => [styles.primary, pressed ? styles.pressed : null]}
          >
            <Text style={styles.primaryText}>{actionLabel}</Text>
          </Pressable>
        ) : null}

        {hasSecondary ? (
          <Pressable
            accessibilityRole="button"
            onPress={onSecondary}
            style={({ pressed }) => [styles.secondary, pressed ? styles.pressed : null]}
          >
            <Text style={styles.secondaryText}>{secondaryLabel}</Text>
          </Pressable>
        ) : null}
      </View>

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/**
 * 样式表改成"按当前机身配色现算"的函数。
 *
 * 为什么不能像以前那样在模块作用域 `StyleSheet.create`：那样颜色会在模块加载那一刻
 * 就烧死，系统切深/浅色时一行都不会重渲染 —— 卡片会永远停在上次启动时的配色上。
 * 调用方用 `useMemo(..., [主题字段])` 缓存，只有真的换肤时才重建一次。
 */
function createStyles(ink: Theme['ink'], panel: string, glassBorder: string) {
  return StyleSheet.create({
    card: {
      marginHorizontal: 24,
      padding: 20,
      borderRadius: 18,
      // 卡片底色改用"浮在机身上的面板底"而不是写死的暖黑：
      // 浅色机身下如果保留 `rgba(20,16,12,0.92)`，卡片会变成深底配深字（读不出来）。
      backgroundColor: panel,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: glassBorder,
    },
    title: {
      color: ink.paper,
      fontFamily: UI_MONO,
      fontSize: 18,
      fontWeight: '700',
    },
    message: {
      marginTop: 8,
      color: ink.paperDim,
      fontSize: 14,
      lineHeight: 20,
    },
    actions: {
      marginTop: 18,
      flexDirection: 'row',
      alignItems: 'center',
    },
    primary: {
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius: 999,
      // 主按钮保留原来的橙红实心观感，但颜色取自墨色表：
      // 深色机身下是琥珀 `#E5A93C`，浅色机身下是朱红 `#D32F2F`，两种底色上都是"最显眼的那一块"。
      backgroundColor: ink.amber,
    },
    primaryText: {
      // 主按钮上的字必须和**按钮底色**反着来，而按钮底色两套机身不同：
      // 深机身是琥珀 `#E5A93C` → 压 `panel`（`#101013`，深字）；
      // 浅机身是朱红 `#D32F2F` → 同样压 `panel`（`#F2F2EF`，浅字）。
      // 也就是说 `panel` 在这两套配色里都恰好是 `amber` 的对比色，一个 token 兼顾两边。
      color: panel,
      fontSize: 15,
      fontWeight: '700',
    },
    secondary: {
      marginLeft: 12,
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: glassBorder,
    },
    secondaryText: {
      color: ink.paper,
      fontSize: 15,
    },
    pressed: {
      opacity: 0.7,
    },
    hint: {
      marginTop: 14,
      color: ink.paperFaint,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
