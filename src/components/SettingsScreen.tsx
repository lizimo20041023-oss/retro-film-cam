/**
 * 设置界面 —— 一块"翻过来的机身背板"。
 *
 * 视觉上和取景屏幕共用 `INK` / `UI_MONO`（见 `src/constants/theme.ts`）：
 * 同一台机器上不该出现两种字体气质。刻意不引 react-navigation ——
 * 全 App 就两个界面，一个绝对定位的整屏覆盖层足够了，
 * 引了导航库反而要给取景器套一层 navigator，得不偿失。
 *
 * 用整屏 `ScrollView` 而不是 `View`：iPhone SE 上"语言 6 行 + 定位 4 行 + 页脚"
 * 会超出一屏，而设置界面**绝不能有滚不动的选项**。本次加了三个分区之后更长了 ——
 * 这也是那个 `ScrollView` 至今没被换成 `View` 的原因。
 *
 * ── 为什么所有"拍之前要定好"的参数都收到这里 ──────────────────────────────
 * 颗粒原本是取景器底部的一条横向滑轨。取景时最不该做的事就是分心去调颗粒：
 * 它是**一卷胶卷的属性**，不是每一张的即时决定。收进设置之后取景器只剩
 * "构图、对焦、按快门"三件事。水印版式和地名详细度同理。
 *
 * ── 排序说明 ──────────────────────────────────────────────────────────────
 * 顺序 = 「越常改的越靠上」+「有从属关系的必须相邻」：
 * 语言 → 定位水印 → 地名详细度（只在"地名"档下起作用，所以紧贴其后）
 * → 水印版式（水印长什么样）→ 颗粒（成像质感）→ 页脚。
 */
import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { INK, UI_MONO } from '../constants/theme';
import { GRAIN_LEVELS } from '../constants/grain';
import { useI18n } from '../i18n';
import { LOCALES } from '../i18n/locales';
import { useSettings } from '../hooks/useSettings';
import { LOCATION_FAILURE_COPY } from '../utils/locationStamp';
import type {
  GrainLevelId,
  LocalePreference,
  LocationMode,
  LocationStampState,
  PlaceDetail,
  WatermarkLayout,
} from '../types';

/**
 * 覆盖层的不透明底色。
 *
 * 为什么必须**不透明**：本屏是挂在相机屏上的整屏覆盖层，取景器一直在后面跑。
 * 以前用的是 `rgba(12, 12, 11, 0.97)`，那 3% 的透明足够让实时预览透出来
 * —— 用户报的就是这个"看着像渲染故障"。色值贴近 `INK` 那套深色。
 *
 * 为什么写在这里而不是 `src/constants/theme.ts`：常量目录不在本次改动的写入范围内，
 * 而且这个值只服务于"覆盖层"这一个场景。`GalleryScreen.tsx` 里有一份同值的常量，
 * 两个文件改一处必须同时改另一处。
 */
const SCRIM = '#0E0F11';

export interface SettingsScreenProps {
  visible: boolean;
  onClose: () => void;
  /** 定位这一格当前的状态（复用取景屏幕那次探测的结果，不重复定位）。 */
  locationState: LocationStampState;
}

export function SettingsScreen({ visible, onClose, locationState }: SettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const { t, localeId, preference, setLocalePreference } = useI18n();
  const {
    settings,
    setLocationMode,
    setWatermarkLayout,
    setPlaceDetail,
    setGrainLevel,
  } = useSettings();

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

  /**
   * 地名详细度只有在"写地名"那一档下才起作用 —— 关掉定位、或改成写坐标时，
   * 这一档点了也不会改变任何一张成片。
   *
   * 处理方式是**灰掉而不是藏起来**：会消失的设置等于用户找不到的设置，
   * 下次他想改的时候只会怀疑"这个 App 没有这个功能"。
   */
  const placeDetailDisabled = settings.locationMode !== 'place';

  /**
   * 下面五个 handler 都只做两件事：一次选择触感 + 落设置。
   *
   * 为什么都走 `useCallback`：`OptionRow` 是纯展示组件，但它在 `map` 里被创建，
   * handler 每次渲染换新会让每一行都白重渲染一次；也顺便让依赖关系显式可见。
   */
  const handleLocalePreference = useCallback(
    (next: LocalePreference): void => {
      // 语言行以前直接内联 `setLocalePreference`，是唯一一行"按下去没反馈"的选项
      // —— 不是有意为之，补上。
      void Haptics.selectionAsync();
      setLocalePreference(next);
    },
    [setLocalePreference],
  );

  const handleLocationMode = useCallback(
    (next: LocationMode): void => {
      // 选择用 selectionAsync、主操作用 impactAsync(Light)，全 App 只有这两档强度
      void Haptics.selectionAsync();
      setLocationMode(next);
    },
    [setLocationMode],
  );

  const handlePlaceDetail = useCallback(
    (next: PlaceDetail): void => {
      void Haptics.selectionAsync();
      setPlaceDetail(next);
    },
    [setPlaceDetail],
  );

  const handleWatermarkLayout = useCallback(
    (next: WatermarkLayout): void => {
      void Haptics.selectionAsync();
      setWatermarkLayout(next);
    },
    [setWatermarkLayout],
  );

  const handleGrainLevel = useCallback(
    (next: GrainLevelId): void => {
      void Haptics.selectionAsync();
      setGrainLevel(next);
    },
    [setGrainLevel],
  );

  const handleClose = useCallback((): void => {
    // 关闭是个"主操作"（整页收起），所以用 Light impact 而不是 selection
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

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
            onPress={handleClose}
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

        {/* ① 语言。用户只点了四种语言，但日语/法语在仓库里已经是**完整**翻译
            （不是占位），砍掉等于把已经做好的工作藏起来，所以六种全留。 */}
        <SectionHeading label={t('settings.language.head')} />
        <View style={styles.group}>
          <OptionRow
            label={t('settings.language.system')}
            note={localeId}
            selected={preference === 'auto'}
            onPress={() => handleLocalePreference('auto')}
            a11yLabel={t('settings.locale.a11y', { label: t('settings.language.system') })}
          />
          {LOCALES.map((locale) => (
            <OptionRow
              key={locale.id}
              // 语言名永远用自己的语言写，绝不翻译（否则找不到中文界面的人会迷路）
              label={locale.label}
              selected={preference === (locale.id as LocalePreference)}
              // `LOCALES` 是常量表，它的 `id` 声明成 `string` 而不是那个联合类型，
              // 所以这里必须断言一次（沿用本文件原有的那处写法，没有新增）。
              onPress={() => handleLocalePreference(locale.id as LocalePreference)}
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
              onPress={() => handleLocationMode(row.mode)}
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

        {/* ③ 地名详细度。必须紧跟定位：它只在"地名"那一档下才起作用，
            两段相邻才看得出从属关系。 */}
        <SectionHeading label={t('settings.placeDetail.title')} />
        <View style={styles.group}>
          {PLACE_DETAIL_ROWS.map((row) => (
            <OptionRow
              key={row.detail}
              label={t(row.labelKey)}
              selected={settings.placeDetail === row.detail}
              // 灰掉而不是藏起来（理由见 placeDetailDisabled 上面的注释）
              disabled={placeDetailDisabled}
              onPress={() => handlePlaceDetail(row.detail)}
              a11yLabel={t('settings.placeDetail.a11y', { label: t(row.labelKey) })}
            />
          ))}
        </View>
        {/* 港澳台前缀那条规则**必须原样出现**，不折叠也不改写 ——
            它描述的是一条用户看不见实现、却会出现在成片上的行为差异。 */}
        <Text style={styles.hint}>{t('settings.placeDetail.note')}</Text>

        {/* ④ 水印版式 */}
        <SectionHeading label={t('settings.watermark.title')} />
        <View style={styles.group}>
          {WATERMARK_ROWS.map((row) => (
            <OptionRow
              key={row.layout}
              label={t(row.labelKey)}
              selected={settings.watermarkLayout === row.layout}
              onPress={() => handleWatermarkLayout(row.layout)}
              a11yLabel={t('settings.watermark.a11y', { label: t(row.labelKey) })}
            />
          ))}
        </View>

        {/* ⑤ 颗粒。从取景器底部那条横向滑轨搬过来的（见文件头）。 */}
        <SectionHeading label={t('settings.grain.title')} />
        <View style={styles.group}>
          {GRAIN_LEVELS.map((level) => (
            <OptionRow
              key={level.id}
              // 档位名走 i18n（`grain.level.*`），绝不直接显示 `level.label`
              // —— 那是常量表里的中文原文，只适合当开发期兜底。
              label={t(level.labelKey ?? 'grain.label')}
              note={level.code}
              selected={settings.grainLevel === level.id}
              onPress={() => handleGrainLevel(level.id)}
              a11yLabel={t('settings.grain.a11y', { label: t(level.labelKey ?? 'grain.label') })}
            />
          ))}
        </View>
        <Text style={styles.hint}>{t('grain.note')}</Text>

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

/** 地名详细度两档的顺序 = 从省地方到全称。 */
const PLACE_DETAIL_ROWS: readonly {
  detail: PlaceDetail;
  labelKey: 'settings.placeDetail.archive' | 'settings.placeDetail.full';
}[] = [
  { detail: 'archive', labelKey: 'settings.placeDetail.archive' },
  { detail: 'full', labelKey: 'settings.placeDetail.full' },
];

/** 水印版式四档的顺序 = 成片上"占的地方从多到少"。 */
const WATERMARK_ROWS: readonly {
  layout: WatermarkLayout;
  labelKey:
    | 'settings.watermark.split'
    | 'settings.watermark.stacked'
    | 'settings.watermark.centered'
    | 'settings.watermark.dateOnly';
}[] = [
  { layout: 'split', labelKey: 'settings.watermark.split' },
  { layout: 'stacked', labelKey: 'settings.watermark.stacked' },
  { layout: 'centered', labelKey: 'settings.watermark.centered' },
  { layout: 'dateOnly', labelKey: 'settings.watermark.dateOnly' },
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
  /**
   * 灰掉这一行。**仍然可聚焦、仍然会被读出来**，只是点了不生效 ——
   * 无障碍上这叫"不可用"，而不是"不存在"（后者根本不该出现在树里）。
   */
  disabled?: boolean;
}

/**
 * 一行可选项。选中态用**左侧琥珀小方块**而不是勾选框：
 * 和取景屏幕上的 LCD 色标是同一个视觉语言，而且 8pt 的字号里"打勾"根本看不清。
 */
function OptionRow({ label, note, selected, onPress, a11yLabel, disabled }: OptionRowProps) {
  /** 灰掉时按"不可用"报给读屏，而不是报成普通可选但点了没反应。 */
  const a11yState = useMemo(
    () => (disabled === true ? { selected, disabled: true } : { selected }),
    [disabled, selected],
  );

  return (
    <Pressable
      onPress={onPress}
      // 灰掉就真的不响应点击：能点但没反应比"看得出的灰"更让人困惑
      disabled={disabled === true}
      accessibilityRole="radio"
      accessibilityState={a11yState}
      accessibilityLabel={a11yLabel}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.mark, selected && styles.markOn]} />
      <Text
        style={[
          styles.rowLabel,
          selected && styles.rowLabelOn,
          disabled === true && styles.rowLabelDim,
        ]}
        numberOfLines={1}
      >
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
    // 必须不透明：取景器的实时预览就在这块下面跑（见上面 SCRIM 的注释）
    backgroundColor: SCRIM,
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
  /** 灰掉的行：压到 0.38 —— 还读得清是什么，但一眼看得出"现在不生效"。 */
  rowLabelDim: {
    opacity: 0.38,
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
