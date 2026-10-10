/**
 * 权限/异常提示卡片：相机没权限、相机挂载失败、相册写入被拒都用它。
 *
 * 设计上只做"展示 + 两个按钮"，不做任何权限逻辑 —— 逻辑在调用方（CameraScreen），
 * 这样同一张卡片既能显示"允许相机"也能显示"去系统设置"。
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

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

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 24,
    padding: 20,
    borderRadius: 18,
    backgroundColor: 'rgba(20, 16, 12, 0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  message: {
    marginTop: 8,
    color: 'rgba(255, 255, 255, 0.78)',
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
    backgroundColor: '#FF8A00',
  },
  primaryText: {
    color: '#1A1005',
    fontSize: 15,
    fontWeight: '700',
  },
  secondary: {
    marginLeft: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  secondaryText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 15,
  },
  pressed: {
    opacity: 0.7,
  },
  hint: {
    marginTop: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    lineHeight: 18,
  },
});
