/**
 * 设置界面 —— 一块"翻过来的机身背板"。
 *
 * 视觉上和取景屏幕共用 `INK` / `UI_MONO`（见 `src/constants/theme.ts`）：
 * 同一台机器上不该出现两种字体气质。刻意不引 react-navigation ——
 * 全 App 就两个界面，一个绝对定位的整屏覆盖层足够了，
 * 引了导航库反而要给取景器套一层 navigator，得不偿失。
 *
 * 用整屏 `ScrollView` 而不是 `View`：iPhone SE 上"语言 6 行 + 定位 4 行 + 页脚"
 * 会超出一屏，而设置界面**绝不能有滚不动的选项**。
 */
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { INK, UI_MONO } from '../constants/theme';
import { useI18n } from '../i18n';
import { LOCALES } from '../i18n/locales';
import { useSettings } from '../hooks/useSettings';
import { LOCATION_FAILURE_COPY } from '../utils/locationStamp';
import type { LocalePreference, LocationMode, LocationStampState } from '../types';

export interface SettingsScreenProps {
  visible: boolean;
  onClose: () => void;
  /** 定位这一格当前的状态（复用取景屏幕那次探测的结果，不重复定位）。 */
  locationState: LocationStampState;
}

export function SettingsScreen({ visible, onClose, locationState }: SettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const { t, localeId, preference, setLocalePreference } = useI18n();
  const { settings, setLocationMode } = useSettings();

  /** 定位状态 → 一行说明（就地算，免得在 JSX 里塞三元）。 */
  const locationStatus = useMemo(() => {
    if (locationState.kind === 'off') return t('settings.location.off');
    if (locationState.kind === 'locating') return t('location.locating');
    if (locationState.kind === 'ready') {
      return t('lcd.location.on', { value: locationState.text });
    }
    // 这里用 `full`：设置界面有两行位置，放得下完整句子，
    // 而取景器 LCD 只有一行，用 `short`（见 CameraScreen 的 lcdLocationLine）。
    return t(LOCATION_FAILURE_COPY[locationState.reason].full);
  }, [locationState, t]);

  // 不可见时直接不渲染：省掉一整套 ScrollView 的布局开销，
  // 也避免设置界面里的无障碍焦点被取景屏幕抢走。
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: Math.max(insets.bottom, 16) + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 标题栏 */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('settings.title')}</Text>
            <Text style={styles.subtitle}>{t('settings.subtitle')}</Text>
          </View>
          {/* 关闭键写"完成"而不是 ×：这个 App 的语汇里没有"叉号"，
              而且中文"完成"、英文 "Done" 都是自解释的，× 在多语言下反而更含糊。 */}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('settings.close')}
            style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
            hitSlop={8}
          >
            <Text style={styles.closeText} numberOfLines={1}>
              {t('settings.close')}
            </Text>
          </Pressable>
        </View>

        {/* ① 语言 */}
        <SectionHeading label={t('settings.language.head')} />
        <View style={styles.group}>
          <OptionRow
            label={t('settings.language.system')}
            note={localeId}
            selected={preference === 'auto'}
            onPress={() => setLocalePreference('auto')}
            a11yLabel={t('settings.locale.a11y', { label: t('settings.language.system') })}
          />
          {LOCALES.map((locale) => (
            <OptionRow
              key={locale.id}
              // 语言名永远用自己的语言写，绝不翻译（否则找不到中文界面的人会迷路）
              label={locale.label}
              selected={preference === (locale.id as LocalePreference)}
              onPress={() => setLocalePreference(locale.id as LocalePreference)}
              a11yLabel={t('settings.locale.a11y', { label: locale.label })}
            />
          ))}
        </View>

        {/* ② 定位 */}
        <SectionHeading label={t('settings.location.head')} />
        <View style={styles.group}>
          {LOCATION_ROWS.map((row) => (
            <OptionRow
              key={row.mode}
              label={t(row.labelKey)}
              selected={settings.locationMode === row.mode}
              onPress={() => setLocationMode(row.mode)}
              a11yLabel={t('settings.locationMode.a11y', { label: t(row.labelKey) })}
            />
          ))}
        </View>
        <Text style={styles.hint}>{t('settings.location.hint')}</Text>
        <View style={styles.statusLine}>
          <View
            style={[
              styles.statusDot,
              locationState.kind === 'ready' && styles.statusDotOn,
              locationState.kind === 'error' && styles.statusDotError,
            ]}
          />
          <Text style={styles.statusText} numberOfLines={2}>
            {locationStatus}
          </Text>
        </View>

        <Text style={styles.footer}>{t('settings.footer')}</Text>
      </ScrollView>
    </View>
  );
}

/** 定位三个档位的顺序（数组顺序 = 界面顺序 = 从最保守到最具体）。 */
const LOCATION_ROWS: readonly { mode: LocationMode; labelKey: 'settings.location.off' | 'settings.location.place' | 'settings.location.coords' }[] = [
  { mode: 'off', labelKey: 'settings.location.off' },
  { mode: 'place', labelKey: 'settings.location.place' },
  { mode: 'coords', labelKey: 'settings.location.coords' },
];

function SectionHeading({ label }: { label: string }) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionRule} />
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

interface OptionRowProps {
  label: string;
  /** 右侧那行小字（比如"跟随系统"当前实际解析成了哪门语言）。 */
  note?: string;
  selected: boolean;
  onPress: () => void;
  a11yLabel: string;
}

/**
 * 一行可选项。选中态用**左侧琥珀小方块**而不是勾选框：
 * 和取景屏幕上的 LCD 色标是同一个视觉语言，而且 8pt 的字号里"打勾"根本看不清。
 */
function OptionRow({ label, note, selected, onPress, a11yLabel }: OptionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={a11yLabel}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.mark, selected && styles.markOn]} />
      <Text style={[styles.rowLabel, selected && styles.rowLabelOn]} numberOfLines={1}>
        {label}
      </Text>
      {note !== undefined ? (
        <Text style={styles.rowNote} numberOfLines={1}>
          {note}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    // 注意：RN 0.86 已移除 StyleSheet.absoluteFillObject，只能用 absoluteFill
    ...StyleSheet.absoluteFill,
    // 压在 DevelopOverlay（zIndex 20）之上：显影过程中打开设置也不该被盖住
    zIndex: 30,
    backgroundColor: 'rgba(12, 12, 11, 0.97)',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: INK.paper,
    fontFamily: UI_MONO,
    fontSize: 18,
    letterSpacing: 4,
  },
  subtitle: {
    marginTop: 6,
    color: INK.paperDim,
    fontFamily: UI_MONO,
    fontSize: 9,
    letterSpacing: 2,
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
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 10,
  },
  sectionRule: {
    width: 2,
    height: 12,
    backgroundColor: 'rgba(194, 122, 48, 0.60)',
    marginRight: 8,
  },
  sectionLabel: {
    color: INK.paperDim,
    fontFamily: UI_MONO,
    fontSize: 10,
    letterSpacing: 2.4,
  },
  group: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: INK.hairline,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: INK.hairline,
  },
  rowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  mark: {
    width: 7,
    height: 7,
    marginRight: 12,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: INK.paperFaint,
  },
  markOn: {
    backgroundColor: INK.amber,
    borderColor: INK.amber,
  },
  rowLabel: {
    flex: 1,
    color: INK.paperDim,
    fontSize: 15,
    letterSpacing: 0.6,
  },
  rowLabelOn: {
    color: INK.paper,
  },
  rowNote: {
    marginLeft: 12,
    color: INK.paperFaint,
    fontFamily: UI_MONO,
    fontSize: 10,
    letterSpacing: 1,
    maxWidth: 120,
  },
  hint: {
    marginTop: 10,
    color: INK.paperFaint,
    fontSize: 11,
    lineHeight: 17,
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: INK.hairline,
  },
  statusDot: {
    width: 6,
    height: 6,
    marginRight: 8,
    borderRadius: 3,
    backgroundColor: INK.paperFaint,
  },
  statusDotOn: {
    backgroundColor: INK.amber,
  },
  statusDotError: {
    backgroundColor: INK.amberDeep,
  },
  statusText: {
    flex: 1,
    color: INK.amberSoft,
    fontFamily: UI_MONO,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  footer: {
    marginTop: 30,
    color: INK.paperFaint,
    fontFamily: UI_MONO,
    fontSize: 9,
    lineHeight: 15,
    letterSpacing: 1.2,
  },
});
