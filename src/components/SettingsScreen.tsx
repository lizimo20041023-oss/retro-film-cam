/**
 * 设置界面 —— v1.8.3「手风琴折叠」重构（用户 m01534 · 模块一 A1）。
 *
 * ── 为什么推倒重来 ────────────────────────────────────────────────────────
 * v1.8.2 之前这一屏是**全部展开**的：语言 7 行 + 定位 4 行 + 详细度 2 行 +
 * 地名语言 4 行 + 水印版式 4 行 + 日期引擎 31 行（13 格式 + 5 字形 + 8 机位 +
 * 5 发光）+ 画质 3 行 + 颗粒 5 行 + 无相框 3 行 ≈ 60+ 行。
 * 手机上要滑三四屏，而用户看到的其实只有 12 个"大类"。
 * 更糟的是 31 个日期选项平铺在同一栏里，格式/字形/机位/颜色这四条**正交的轴**
 * 混成一片 —— 用户想改"日期颜色"要在一堆日期样例里找，找不到是正常的。
 *
 * 所以改成 **12 个单行折叠栏**（Accordion）：
 *   lang / loc_mode / loc_detail / loc_lang / watermark_layout /
 *   date_format / date_style / date_pos / date_color /
 *   quality / grain / frameless_ratio
 * 默认全部收起 ⇒ 一屏就能看全 12 行，每行右侧是"当前选中的那一档"。
 *
 * ── 状态机（只有一条真源）────────────────────────────────────────────────
 * `const [expandedKey, setExpandedKey] = useState<SectionKey | null>(null)`
 * 单开：点开 B 时 A 自动收起 —— 手风琴的语义就是"一次只展开一个"，
 * 同时展开多个等于把原来那面 60 行的墙拆成几块再拼回去。
 * 展开时 `LayoutAnimation.easeInEaseOut` + selection 触感；选中某一档之后
 * **延迟 180ms 自动收起**（给用户看见"右侧摘要变了"的那一下，再收屏）。
 *
 * ── 为什么标题/摘要这样排 ────────────────────────────────────────────────
 * 左侧一根 2pt 的琥珀/朱红竖条 = 这是"一栏"而不是普通列表行；
 * 中间是栏目标题（14pt/600），右侧是同色系的暗金摘要（`SUMMARY_GOLD`）；
 * 摘要永远只有一个值 —— "现在这一栏是什么档"，不解释、不换行。
 * 展开后的选项列表沿用旧版的 `OptionRow`（文字 → 代号 → 对勾），
 * 对勾槽位恒定占宽，选中瞬间长标签不会被挤成省略号。
 *
 * ── 视觉与配色 ────────────────────────────────────────────────────────────
 * 颜色一律从 `useTheme()` 现取（`src/constants/theme.ts`），字号/间距走
 * `createStyles(theme)`：模块级 `StyleSheet.create` 会把颜色烧死在加载那一刻，
 * 系统换深/浅色时本屏一行都不会变 —— 这个坑 v1.7.x 踩过一次。
 * 唯一的写死色是 `SUMMARY_GOLD = '#C86418'`（用户 m01534 逐字指定的暗金色，
 * 用于收起态的右侧摘要）；v1.8.3 起相机整棵树锁暗（见 `CameraScreen` 的
 * `ThemeScope`），所以这个暗金色在任何模式下都有足够对比度。
 *
 * 刻意不引 react-navigation —— 全 App 就两个界面，一个绝对定位的整屏覆盖层
 * 足够了；引了导航库反而要给取景器套一层 navigator，得不偿失。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme, UI_MONO } from '../constants/theme';
import type { Theme } from '../constants/theme';
import { CAPTURE_QUALITIES, captureQualityCapNote } from '../constants/captureQuality';
import { DATE_GLOW_PALETTE } from '../constants/dateEngine';
import { NO_FRAME_ASPECTS } from '../constants/frames';
import { GRAIN_LEVELS } from '../constants/grain';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';
import { LOCALES } from '../i18n/locales';
import { useSettings } from '../hooks/useSettings';
import { LOCATION_FAILURE_COPY } from '../utils/locationStamp';
import type {
  CaptureQuality,
  DateFormatId,
  DateGlowId,
  DateGlyphStyleId,
  DateStampSpot,
  GeoLocale,
  GrainLevelId,
  LocalePreference,
  LocationMode,
  LocationStampState,
  NoFrameAspect,
  PlaceDetail,
  WatermarkLayout,
} from '../types';

/**
 * 收起态右侧摘要的暗金色（用户 m01534 逐字给定的 `#C86418`）。
 *
 * 为什么不从 `theme.ink` 取：这是"档位值"专用的一个色，语义上既不是正文
 * （`ink.paper`）也不是提示（`ink.paperFaint`）。深机身下它和琥珀强调色
 * 是同族但更暗，不会抢走标题；浅机身理论上用不到 —— v1.8.3 起相机整棵树
 * 用 `DARK_THEME` 锁死（`CameraScreen` 的 `ThemeScope`）。
 */
const SUMMARY_GOLD = '#C86418';

/**
 * 12 个折叠栏的稳定 key（顺序 = 界面顺序）。
 *
 * 单独列一个联合类型而不是 `string`：
 * ① `expandedKey` 只允许装这 12 个值，写错立刻编译报错；
 * ② 展开体用 `switch (key)` 渲染，联合类型能让 tsc 检查"每一栏都有实现"。
 */
type SectionKey =
  | 'lang'
  | 'loc_mode'
  | 'loc_detail'
  | 'loc_lang'
  | 'watermark_layout'
  | 'date_format'
  | 'date_style'
  | 'date_pos'
  | 'date_color'
  | 'quality'
  | 'grain'
  | 'frameless_ratio';

/**
 * 界面顺序 = 「越常改的越靠上」+「有从属关系的必须相邻」：
 * 语言 → 定位 → 地名详细度（只在"地名"档生效，紧跟定位）→ 地名语言（只影响地名那行）
 * → 水印版式（地名与日期怎么排）→ 日期四轴（格式 → 字形 → 机位 → 颜色，
 * 先决定印什么、再决定怎么长、印在哪、发什么光）→ 画质 → 颗粒 → 无相框画幅。
 *
 * 日期四轴为什么各自独立成栏：用户明确要求"严禁把格式、字形、位置、颜色混在一起"。
 * 四者两两正交 —— 换颜色不该看见格式列表，换格式也不该看见机位。
 */
const SECTION_ORDER: readonly SectionKey[] = [
  'lang',
  'loc_mode',
  'loc_detail',
  'loc_lang',
  'watermark_layout',
  'date_format',
  'date_style',
  'date_pos',
  'date_color',
  'quality',
  'grain',
  'frameless_ratio',
];

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
    setGeoLocale,
    setCaptureQuality,
    setNoFrameAspect,
    setDateEngine,
  } = useSettings();

  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  /**
   * 唯一展开状态：`null` = 12 栏全部收起（打开设置页时的默认视图）。
   *
   * 为什么不是 `Record<SectionKey, boolean>`：手风琴只允许同时展开一栏，
   * 一个 `SectionKey | null` 就把"哪一栏开着"这件事表达完了；用 12 个布尔
   * 就得在每次 toggle 时手写"把其它 11 个置 false"，那是最容易漏的地方。
   */
  const [expandedKey, setExpandedKey] = useState<SectionKey | null>(null);

  /**
   * 选中后延迟收起的定时器。
   *
   * 为什么需要 ref 而不是 state：它不参与渲染，只是"过 180ms 来收一下"。
   * 存 ref 才能在同一栏里连续点两档时取消上一个定时器，不会出现
   * "前一次收起把后一次展开的栏也收掉"这种时序错乱。
   */
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 清掉挂起的收起定时器（卸载/关页/连续选择时都要清）。 */
  const clearCollapseTimer = useCallback((): void => {
    if (collapseTimer.current !== null) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
  }, []);

  /**
   * 切换某一栏的展开状态。
   *
   * 逐字按用户 m01534 给的实现：
   *   `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)`
   *   `Haptics.selectionAsync()`
   *   `setExpandedKey(prev => (prev === key ? null : key))`
   * 这里只多清了挂起的收起定时器（否则"点开 B"可能在 180ms 后被
   * 上一栏 A 的旧定时器连坐收起）。
   */
  const toggleSection = useCallback(
    (key: SectionKey): void => {
      clearCollapseTimer();
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      void Haptics.selectionAsync();
      setExpandedKey((prev) => (prev === key ? null : key));
    },
    [clearCollapseTimer],
  );

  /**
   * 选完一档后延迟 180ms 收起。
   *
   * 180ms 是"能看见右侧摘要翻成新值、又不至于让人等"的长度：动画一帧 16ms，
   * 用户读完一个 4 字摘要大约 120~160ms。
   */
  const scheduleCollapse = useCallback((): void => {
    clearCollapseTimer();
    collapseTimer.current = setTimeout(() => {
      collapseTimer.current = null;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedKey(null);
    }, 180);
  }, [clearCollapseTimer]);

  /** 先落设置、再排收起 —— 顺序反了会先收屏、后落值，摘要会闪一下旧值。 */
  const pickAfter = useCallback(
    (apply: () => void): void => {
      apply();
      scheduleCollapse();
    },
    [scheduleCollapse],
  );

  /** 卸载时清定时器：组件卸载后 setState 是 RN 里最常见的警告来源之一。 */
  useEffect(() => clearCollapseTimer, [clearCollapseTimer]);

  /**
   * 每次"打开"设置页都回到全收起。
   *
   * 为什么不是"记住上次展开哪一栏"：这一屏的定位是"一眼看全 12 类"，
   * 记住展开态等于下次打开直接跳到半屏列表，反而丢了设计意图。
   * 在 `visible` 变 true 时复位，也顺带清掉上次关页时挂起的定时器。
   */
  useEffect(() => {
    if (visible) {
      clearCollapseTimer();
      setExpandedKey(null);
    }
  }, [clearCollapseTimer, visible]);

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
   * 日期引擎的当前整份配置。
   *
   * 为什么整份取出来：`setDateEngine` 只收**完整的** `DateEngineConfig`，
   * 不接受部分更新（见 `useSettings` 的注释）—— 单轴改动一律写成
   * `setDateEngine({ ...dateEngine, format: next })`。抽一个局部变量，
   * 四个 handler 的依赖数组也就只有 `[dateEngine, setDateEngine]` 这一种写法，
   * 不会出现"有人忘了把新轴加进依赖"的漏。
   */
  const dateEngine = settings.dateEngine;

  /**
   * 下面十一个 handler 都只做两件事：一次选择触感 + 落设置。
   *
   * 为什么都走 `useCallback`：`OptionRow` 是纯展示组件，但它在 `map` 里被创建，
   * handler 每次渲染换新会让每一行都白重渲染一次；也顺便让依赖关系显式可见。
   * 收起动作统一由外层的 `pickAfter()` 负责，handler 本身不管界面，
   * 这样"选中后要不要收起"就只有一个决策点。
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

  const handleGeoLocale = useCallback(
    (next: GeoLocale | 'auto'): void => {
      void Haptics.selectionAsync();
      setGeoLocale(next);
    },
    [setGeoLocale],
  );

  const handleWatermarkLayout = useCallback(
    (next: WatermarkLayout): void => {
      void Haptics.selectionAsync();
      setWatermarkLayout(next);
    },
    [setWatermarkLayout],
  );

  const handleDateFormat = useCallback(
    (next: DateFormatId): void => {
      void Haptics.selectionAsync();
      // 整份传：四轴共用一条存储记录，部分更新会让"没动的那三轴"落回缺省值
      setDateEngine({ ...dateEngine, format: next });
    },
    [dateEngine, setDateEngine],
  );

  const handleDateGlyph = useCallback(
    (next: DateGlyphStyleId): void => {
      void Haptics.selectionAsync();
      setDateEngine({ ...dateEngine, glyphStyle: next });
    },
    [dateEngine, setDateEngine],
  );

  const handleDateSpot = useCallback(
    (next: DateStampSpot): void => {
      void Haptics.selectionAsync();
      setDateEngine({ ...dateEngine, spot: next });
    },
    [dateEngine, setDateEngine],
  );

  const handleDateGlow = useCallback(
    (next: DateGlowId): void => {
      void Haptics.selectionAsync();
      setDateEngine({ ...dateEngine, glow: next });
    },
    [dateEngine, setDateEngine],
  );

  const handleCaptureQuality = useCallback(
    (next: CaptureQuality): void => {
      void Haptics.selectionAsync();
      setCaptureQuality(next);
    },
    [setCaptureQuality],
  );

  const handleGrainLevel = useCallback(
    (next: GrainLevelId): void => {
      void Haptics.selectionAsync();
      setGrainLevel(next);
    },
    [setGrainLevel],
  );

  /**
   * 无相框画幅（v1.8.1）。和上面几条一样：一次选择触感 + 落设置。
   *
   * 这一行**在任何相框下都能点**（刻意不 `disabled`）：它不是"当前成片会怎么变"，
   * 而是"下次切到 00 时用哪个比例"。灰掉它只会让用户以为无相框模式坏了。
   */
  const handleNoFrameAspect = useCallback(
    (next: NoFrameAspect): void => {
      void Haptics.selectionAsync();
      setNoFrameAspect(next);
    },
    [setNoFrameAspect],
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

  /**
   * 12 栏的标题与摘要。
   *
   * 摘要口径 = 「当前选中的那一档，用和展开列表里**一模一样**的文字」——
   * 收起时看到的是"標準"，展开后对勾就在"標準"那一行，两者不会对不上。
   * 数字类（画质 4032px、无相框 3:4）不翻译：它们不随界面语言变。
   */
  const localeRow = LOCALES.find((row) => row.id === preference);
  const locationRow = findOrFirst(LOCATION_ROWS, (row) => row.mode === settings.locationMode);
  const placeDetailRow = findOrFirst(PLACE_DETAIL_ROWS, (row) => row.detail === settings.placeDetail);
  const geoLocaleRow = findOrFirst(GEO_LOCALE_ROWS, (row) => row.geoLocale === settings.geoLocale);
  const watermarkRow = findOrFirst(WATERMARK_ROWS, (row) => row.layout === settings.watermarkLayout);
  const formatRow = findOrFirst(DATE_FORMAT_ROWS, (row) => row.format === dateEngine.format);
  const glyphRow = findOrFirst(DATE_GLYPH_ROWS, (row) => row.glyphStyle === dateEngine.glyphStyle);
  const spotRow = findOrFirst(DATE_SPOT_ROWS, (row) => row.spot === dateEngine.spot);
  const glowRow = findOrFirst(DATE_GLOW_ROWS, (row) => row.glow === dateEngine.glow);
  const qualitySpec = findOrFirst(CAPTURE_QUALITIES, (spec) => spec.id === settings.captureQuality);
  const grainLevel = findOrFirst(GRAIN_LEVELS, (level) => level.id === settings.grainLevel);
  const noFrameSpec = findOrFirst(NO_FRAME_ASPECTS, (spec) => spec.id === settings.noFrameAspect);

  const sections: Record<SectionKey, SectionMeta> = {
    lang: {
      title: t('settings.language.head'),
      summary:
        preference === 'auto'
          ? t('settings.language.system')
          : (localeRow?.label ?? localeId),
    },
    loc_mode: { title: t('settings.location.head'), summary: t(locationRow.labelKey) },
    loc_detail: {
      title: t('settings.placeDetail.title'),
      summary: t(placeDetailRow.labelKey),
    },
    loc_lang: { title: t('settings.geoLocale.title'), summary: t(geoLocaleRow.labelKey) },
    watermark_layout: {
      title: t('settings.watermark.title'),
      summary: t(watermarkRow.labelKey),
    },
    date_format: {
      title: t('settings.section.dateFormat'),
      summary: t(formatRow.labelKey),
    },
    date_style: {
      title: t('settings.section.dateFont'),
      summary: t(glyphRow.labelKey),
    },
    date_pos: {
      title: t('settings.section.datePos'),
      summary: t(spotRow.labelKey),
    },
    date_color: {
      title: t('settings.section.dateColor'),
      summary: t(glowRow.labelKey),
      // 圆点直接用该档光色的灯丝色（`DATE_GLOW_PALETTE.filament`）——
      // 和成片上日期笔画里那圈颜色是同一份数据，不会"选的和看到的不一样"。
      dotColor: DATE_GLOW_PALETTE[glowRow.glow].filament,
    },
    quality: {
      title: t('settings.section.quality'),
      summary: `${t(qualitySpec.labelKey)} ${qualitySpec.longEdge}px`,
    },
    grain: {
      title: t('settings.section.grain'),
      // 档位名走 i18n（`grain.level.*`），代号（LT/STD/…）不翻译 —— 与展开列表一致。
      summary: `${t(grainLevel.labelKey ?? 'grain.label')} ${grainLevel.code}`,
    },
    frameless_ratio: {
      title: t('settings.noFrame.title'),
      // `NoFrameAspect` 的字面量本身就是比例串（'1:1' / '3:4' / '3:2'），不翻译。
      summary: noFrameSpec.id,
    },
  };

  /**
   * 展开体：`switch` 保证 12 栏都有实现（`SectionKey` 是联合类型，
   * 少写一栏 tsc 会报"函数缺少返回"）。
   *
   * 每台选项列表都复用旧的 `OptionRow`；提示句（hint）放在**展开后**的
   * 列表下方，不再常驻 —— 收起态每栏只有一行，正是"一屏看清 12 大类"的前提。
   */
  const renderBody = (key: SectionKey) => {
    switch (key) {
      case 'lang':
        return (
          <View style={styles.group}>
            <OptionRow
              label={t('settings.language.system')}
              note={localeId}
              selected={preference === 'auto'}
              onPress={() => pickAfter(() => handleLocalePreference('auto'))}
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
                onPress={() => pickAfter(() => handleLocalePreference(locale.id as LocalePreference))}
                a11yLabel={t('settings.locale.a11y', { label: locale.label })}
              />
            ))}
          </View>
        );

      case 'loc_mode':
        return (
          <>
            <View style={styles.group}>
              {LOCATION_ROWS.map((row) => (
                <OptionRow
                  key={row.mode}
                  label={t(row.labelKey)}
                  selected={settings.locationMode === row.mode}
                  onPress={() => pickAfter(() => handleLocationMode(row.mode))}
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
          </>
        );

      case 'loc_detail':
        return (
          <>
            <View style={styles.group}>
              {PLACE_DETAIL_ROWS.map((row) => (
                <OptionRow
                  key={row.detail}
                  label={t(row.labelKey)}
                  selected={settings.placeDetail === row.detail}
                  // 灰掉而不是藏起来（理由见 placeDetailDisabled 上面的注释）
                  disabled={placeDetailDisabled}
                  onPress={() => pickAfter(() => handlePlaceDetail(row.detail))}
                  a11yLabel={t('settings.placeDetail.a11y', { label: t(row.labelKey) })}
                />
              ))}
            </View>
            {/* 港澳台前缀那条规则**必须原样出现**，不折叠也不改写 ——
                它描述的是一条用户看不见实现、却会出现在成片上的行为差异。 */}
            <Text style={styles.hint}>{t('settings.placeDetail.note')}</Text>
          </>
        );

      case 'loc_lang':
        return (
          <>
            <View style={styles.group}>
              {GEO_LOCALE_ROWS.map((row) => (
                <OptionRow
                  key={row.geoLocale}
                  label={t(row.labelKey)}
                  selected={settings.geoLocale === row.geoLocale}
                  onPress={() => pickAfter(() => handleGeoLocale(row.geoLocale))}
                  a11yLabel={t('settings.geoLocale.a11y', { label: t(row.labelKey) })}
                />
              ))}
            </View>
            {/* 这一档**只改地名的书写语言**，不动界面语言 —— 界面语言在 lang，
                用户完全可能想要"界面中文、地名英文"（发到国外平台时很常见）。 */}
            <Text style={styles.hint}>{t('settings.geoLocale.note')}</Text>
          </>
        );

      case 'watermark_layout':
        return (
          <View style={styles.group}>
            {WATERMARK_ROWS.map((row) => (
              <OptionRow
                key={row.layout}
                label={t(row.labelKey)}
                selected={settings.watermarkLayout === row.layout}
                onPress={() => pickAfter(() => handleWatermarkLayout(row.layout))}
                a11yLabel={t('settings.watermark.a11y', { label: t(row.labelKey) })}
              />
            ))}
          </View>
        );

      case 'date_format':
        // 格式：决定日期**印什么**（12 档 + "关闭"）。
        // 每一行的标签就是这一档的样例串（`settings.dateEngine.format.*` 里
        // 存的是样例而不是名字）—— 日期烙印这种东西，看样例比看"年月日"这种
        // 档位名快得多，而且样例本身就是模板渲染出来的真实结果。
        return (
          <View style={styles.group}>
            {DATE_FORMAT_ROWS.map((row) => (
              <OptionRow
                key={row.format}
                label={t(row.labelKey)}
                selected={dateEngine.format === row.format}
                onPress={() => pickAfter(() => handleDateFormat(row.format))}
                a11yLabel={t('settings.dateEngine.a11y.format', { label: t(row.labelKey) })}
              />
            ))}
          </View>
        );

      case 'date_style':
        // 字形：决定日期**怎么长**。v1.8.3 起只剩 4 档，全部是原生等宽字体
        // + 三层叠加发光（或印刷观感），不再有 7 段数码管/点阵这种逐格几何。
        return (
          <>
            <View style={styles.group}>
              {DATE_GLYPH_ROWS.map((row) => (
                <OptionRow
                  key={row.glyphStyle}
                  label={t(row.labelKey)}
                  selected={dateEngine.glyphStyle === row.glyphStyle}
                  onPress={() => pickAfter(() => handleDateGlyph(row.glyphStyle))}
                  a11yLabel={t('settings.dateEngine.a11y.glyph', { label: t(row.labelKey) })}
                />
              ))}
            </View>
            <Text style={styles.hint}>{t('settings.dateEngine.hint')}</Text>
          </>
        );

      case 'date_pos':
        // 机位：决定日期**印在哪**（画内 6 档 + 白边 2 档）。
        // 顺序 = 先画内、后白边；画内那 6 档按"左下 → 右下 → 右上 → 底部居中"排，
        // 与 `DateStampSpot` 的枚举顺序一致。标签里那句"竖排"是真的 90° 旋转。
        return (
          <View style={styles.group}>
            {DATE_SPOT_ROWS.map((row) => (
              <OptionRow
                key={row.spot}
                label={t(row.labelKey)}
                selected={dateEngine.spot === row.spot}
                onPress={() => pickAfter(() => handleDateSpot(row.spot))}
                a11yLabel={t('settings.dateEngine.a11y.spot', { label: t(row.labelKey) })}
              />
            ))}
          </View>
        );

      case 'date_color':
        // 发光色：决定日期的灯丝发什么颜色的光（5 档）。
        // 这一栏的每一行右侧都带一枚圆点，颜色取自 `DATE_GLOW_PALETTE.filament`
        // —— 圆点与成片笔画同源，选完立刻能在收起态摘要上再看到一次。
        return (
          <View style={styles.group}>
            {DATE_GLOW_ROWS.map((row) => (
              <OptionRow
                key={row.glow}
                label={t(row.labelKey)}
                swatch={DATE_GLOW_PALETTE[row.glow].filament}
                selected={dateEngine.glow === row.glow}
                onPress={() => pickAfter(() => handleDateGlow(row.glow))}
                a11yLabel={t('settings.dateEngine.a11y.glow', { label: t(row.labelKey) })}
              />
            ))}
          </View>
        );

      case 'quality':
        return (
          <>
            <View style={styles.group}>
              {CAPTURE_QUALITIES.map((spec) => (
                <OptionRow
                  key={spec.id}
                  // 档位名走 i18n（`settings.quality.*`）。`spec.note` 是常量表里给开发者
                  // 看的中文说明，**不进 UI**；这一列的"代号"位显示真实的长边像素，
                  // 与颗粒行的 `STD` 同类：数字不随语言变，也不该被翻译。
                  label={t(spec.labelKey)}
                  note={`${spec.longEdge}px`}
                  selected={settings.captureQuality === spec.id}
                  onPress={() => pickAfter(() => handleCaptureQuality(spec.id))}
                  a11yLabel={t('settings.quality.a11y', { label: t(spec.labelKey) })}
                />
              ))}
            </View>
            {/*
              如实说明这一档**买不到什么**：真 48MP 要原生相机模块，纯 JS 侧没有这条路。
              第一句是本地化的（`settings.quality.note`），后半句是语言中立的事实标注
              —— 详见 `captureQuality.ts` 里 `captureQualityCapNote` 的注释。
              刻意写在**行下方**而不是塞进某一行：它不是某一档的属性，是三档共同的前提。
            */}
            <Text style={styles.hint}>{captureQualityCapNote(settings.captureQuality, t)}</Text>
          </>
        );

      case 'grain':
        return (
          <>
            <View style={styles.group}>
              {GRAIN_LEVELS.map((level) => (
                <OptionRow
                  key={level.id}
                  // 档位名走 i18n（`grain.level.*`），绝不直接显示 `level.label`
                  // —— 那是常量表里的中文原文，只适合当开发期兜底。
                  label={t(level.labelKey ?? 'grain.label')}
                  note={level.code}
                  selected={settings.grainLevel === level.id}
                  onPress={() => pickAfter(() => handleGrainLevel(level.id))}
                  a11yLabel={t('settings.grain.a11y', { label: t(level.labelKey ?? 'grain.label') })}
                />
              ))}
            </View>
            <Text style={styles.hint}>{t('grain.note')}</Text>
          </>
        );

      case 'frameless_ratio':
        return (
          <>
            <View style={styles.group}>
              {NO_FRAME_ASPECTS.map((spec) => (
                <OptionRow
                  key={spec.id}
                  // 档位名走 i18n（`frame.noFrame.aspect*`）；`note` 位显示真实比例数字，
                  // 与画质行的 `2048px` 同类 —— 数字不随语言变，也不该被翻译。
                  label={t(NO_FRAME_ASPECT_LABEL_KEYS[spec.id])}
                  note={`${spec.ratio.toFixed(2)}`}
                  selected={settings.noFrameAspect === spec.id}
                  onPress={() => pickAfter(() => handleNoFrameAspect(spec.id))}
                  a11yLabel={t('settings.noFrame.a11y', {
                    label: t(NO_FRAME_ASPECT_LABEL_KEYS[spec.id]),
                  })}
                />
              ))}
            </View>
            <Text style={styles.hint}>{t('settings.noFrame.hint')}</Text>
          </>
        );

      default: {
        // 联合类型穷尽性兜底：真出现第 13 个 key 时，这里返回 null 而不是崩。
        // 用 `_exhaustive: never` 让 tsc 在漏写分支时直接报错。
        const _exhaustive: never = key;
        void _exhaustive;
        return null;
      }
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 16) + 8,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
          },
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

        {/* 12 个折叠栏：每次只开一个，默认全收。 */}
        {SECTION_ORDER.map((key) => {
          const meta = sections[key];
          const expanded = expandedKey === key;
          return (
            <View key={key} style={styles.section}>
              <AccordionHeader
                title={meta.title}
                summary={meta.summary}
                dotColor={meta.dotColor}
                expanded={expanded}
                onToggle={() => toggleSection(key)}
              />
              {expanded ? <View style={styles.accBody}>{renderBody(key)}</View> : null}
            </View>
          );
        })}

        <Text style={styles.footer}>{t('settings.footer')}</Text>
      </ScrollView>
    </View>
  );
}

/** 12 栏标题 + 收起态摘要（摘要里只有 `date_color` 带一枚圆点）。 */
interface SectionMeta {
  title: string;
  summary: string;
  dotColor?: string;
}

/**
 * 在常量表里找当前档位，找不到就退回第一档。
 *
 * 为什么不用 `find(...)!`：设置值来自持久化存储，理论上可能是一个已经
 * 被删掉的旧档位（比如从 1.8.2 升级上来时 `glyphStyle` 还是 `led_7seg`）。
 * 这时摘要不能是 `undefined` —— 退回第一档至少能显示出一个合理值，
 * 真正的迁移在 `settingsStore` 里做。
 */
function findOrFirst<T>(rows: readonly T[], match: (row: T) => boolean): T {
  return rows.find(match) ?? rows[0];
}

/**
 * 一行折叠栏的头部（收起态）。
 *
 * 固定 54pt 高 —— 12 行 × 54 = 648pt，iPhone 13 的可用高度约 760pt，
 * 加上标题栏正好一屏，这就是"打开设置页一屏看清 12 大类"的算术依据。
 * 布局从左到右：2pt 竖条 → 标题（占剩余）→ 摘要 → 旋转箭头。
 */
function AccordionHeader({
  title,
  summary,
  dotColor,
  expanded,
  onToggle,
}: {
  title: string;
  summary: string;
  dotColor?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      // `expanded` 是标准无障碍状态：VoiceOver 会念"已展开/已收起"。
      accessibilityState={{ expanded }}
      accessibilityLabel={title}
      style={({ pressed }) => [styles.accHeader, pressed && styles.accHeaderPressed]}
    >
      <View style={styles.accBar} />
      <Text style={styles.accTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.accSpacer} />
      {dotColor !== undefined ? (
        // 圆点是纯装饰：颜色信息已经由摘要文字（色名）和无障碍标签承载。
        <View style={[styles.accDot, { backgroundColor: dotColor }]} accessible={false} />
      ) : null}
      <Text style={styles.accSummary} numberOfLines={1}>
        {summary}
      </Text>
      <Text
        style={[styles.accChevron, expanded && styles.accChevronOpen]}
        numberOfLines={1}
        accessible={false}
      >
        ⌄
      </Text>
    </Pressable>
  );
}

/** 定位三个档位的顺序（数组顺序 = 界面顺序 = 从最保守到最具体）。 */
const LOCATION_ROWS: readonly {
  mode: LocationMode;
  labelKey:
    | 'settings.location.off'
    | 'settings.location.place'
    | 'settings.location.coords';
}[] = [
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

/**
 * 地名语言五档的顺序 = 从"交给系统"到越来越具体。
 *
 * 为什么「跟随界面」排第一：它和上面两段一样，默认档必须排在最前 ——
 * 用户打开这一栏时，当前档位就在第一行，"我现在是不是在跟随系统"一眼可见。
 * 后四档按使用人数排：中文两档 → 日文（v1.8.5 新增，紧挨中文之后，汉字圈连排、
 * 也符合"日本是第二大拍摄地"的产品假设）→ 英文。
 */
const GEO_LOCALE_ROWS: readonly {
  geoLocale: GeoLocale | 'auto';
  labelKey:
    | 'settings.geoLocale.auto'
    | 'settings.geoLocale.zhHans'
    | 'settings.geoLocale.zhHant'
    | 'settings.geoLocale.ja'
    | 'settings.geoLocale.en';
}[] = [
  { geoLocale: 'auto', labelKey: 'settings.geoLocale.auto' },
  { geoLocale: 'zh-Hans', labelKey: 'settings.geoLocale.zhHans' },
  { geoLocale: 'zh-Hant', labelKey: 'settings.geoLocale.zhHant' },
  { geoLocale: 'ja', labelKey: 'settings.geoLocale.ja' },
  { geoLocale: 'en', labelKey: 'settings.geoLocale.en' },
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

/**
 * 日期引擎四张行的表。
 *
 * 四张表各自对应一个折叠栏（格式 / 字形 / 机位 / 发光），**不再混排**：
 * 用户 m01534 明确要求"严禁把格式、字形、位置、颜色混在一起"。
 *
 * 顺序一律 = `types/index.ts` 里那个枚举的声明顺序，不另排一套：
 * 界面顺序与枚举顺序一致，改档位时只需要看一个地方。
 */
const DATE_FORMAT_ROWS: readonly { format: DateFormatId; labelKey: MessageKey }[] = [
  { format: 'MM_DD_YY', labelKey: 'settings.dateEngine.format.MM_DD_YY' },
  { format: 'YY_MM_DD', labelKey: 'settings.dateEngine.format.YY_MM_DD' },
  { format: 'DD_MM_YY', labelKey: 'settings.dateEngine.format.DD_MM_YY' },
  { format: 'DAY_HH_MM', labelKey: 'settings.dateEngine.format.DAY_HH_MM' },
  { format: 'YY_MM_DD_TIME', labelKey: 'settings.dateEngine.format.YY_MM_DD_TIME' },
  { format: 'YYYY_DOT_MM_DD', labelKey: 'settings.dateEngine.format.YYYY_DOT_MM_DD' },
  { format: 'YYYY_SLASH_TIME', labelKey: 'settings.dateEngine.format.YYYY_SLASH_TIME' },
  { format: 'ENG_MMM_DD_YY', labelKey: 'settings.dateEngine.format.ENG_MMM_DD_YY' },
  { format: 'YYYY_MM_DD_WEEK', labelKey: 'settings.dateEngine.format.YYYY_MM_DD_WEEK' },
  { format: 'CJK_KANJI', labelKey: 'settings.dateEngine.format.CJK_KANJI' },
  { format: 'EXIF_TECH', labelKey: 'settings.dateEngine.format.EXIF_TECH' },
  { format: 'FRAME_DATE', labelKey: 'settings.dateEngine.format.FRAME_DATE' },
  // 关掉排在最后：它不是一个"日期长相"，而是让上面十二档全部失效的开关，
  // 混在中间会让用户误以为它也是一种格式。
  { format: 'OFF', labelKey: 'settings.dateEngine.format.OFF' },
];

/**
 * 字形四档（v1.8.3 合并 7 段数码管 + 5×7 点阵为「石英機背發光」）。
 *
 * 顺序 = 从最"电子的"（石英灯管）到最"印刷的"（钢印），全部是原生等宽字体
 * 渲染，没有逐格几何 —— 竖排时不会再出现空心红框/圆圈错位。
 */
const DATE_GLYPH_ROWS: readonly { glyphStyle: DateGlyphStyleId; labelKey: MessageKey }[] = [
  { glyphStyle: 'quartz_led', labelKey: 'settings.dateEngine.glyph.quartz_led' },
  { glyphStyle: 'ccd_osd', labelKey: 'settings.dateEngine.glyph.ccd_osd' },
  { glyphStyle: 'lab_inkjet', labelKey: 'settings.dateEngine.glyph.lab_inkjet' },
  { glyphStyle: 'archival_steel', labelKey: 'settings.dateEngine.glyph.archival_steel' },
];

/** 机位八档：画内六档在前（左下 → 右下 → 右上 → 底部居中），白边两档在后。 */
const DATE_SPOT_ROWS: readonly { spot: DateStampSpot; labelKey: MessageKey }[] = [
  { spot: 'in_bl_v', labelKey: 'settings.dateEngine.spot.in_bl_v' },
  { spot: 'in_bl_h', labelKey: 'settings.dateEngine.spot.in_bl_h' },
  { spot: 'in_br_h', labelKey: 'settings.dateEngine.spot.in_br_h' },
  { spot: 'in_br_v', labelKey: 'settings.dateEngine.spot.in_br_v' },
  { spot: 'in_tr_v', labelKey: 'settings.dateEngine.spot.in_tr_v' },
  { spot: 'in_cb_h', labelKey: 'settings.dateEngine.spot.in_cb_h' },
  { spot: 'strip_split', labelKey: 'settings.dateEngine.spot.strip_split' },
  { spot: 'strip_center', labelKey: 'settings.dateEngine.spot.strip_center' },
];

/** 发光五色：枚举顺序（珊瑚红 → 钨丝琥珀 → 香槟金 → 千禧绿 → 赛博青）。 */
const DATE_GLOW_ROWS: readonly { glow: DateGlowId; labelKey: MessageKey }[] = [
  { glow: 'coral_red', labelKey: 'settings.dateEngine.glow.coral_red' },
  { glow: 'classic_amber', labelKey: 'settings.dateEngine.glow.classic_amber' },
  { glow: 'warm_gold', labelKey: 'settings.dateEngine.glow.warm_gold' },
  { glow: 'ccd_green', labelKey: 'settings.dateEngine.glow.ccd_green' },
  { glow: 'cyber_cyan', labelKey: 'settings.dateEngine.glow.cyber_cyan' },
];

/**
 * 无相框三档的档位名（v1.8.1）。
 *
 * 键名由门禁探针冻结成 `frame.noFrame.aspect11 / aspect34 / aspect32`
 * （后缀是**比例数字**，不是档位序号），所以这里用一张显式映射把
 * `NoFrameAspect` 的字面量接到键上 —— 顺序不再靠 `NO_FRAME_ASPECTS` 的数组下标，
 * 以后谁调整了数组顺序也不会把标签接错档。
 */
const NO_FRAME_ASPECT_LABEL_KEYS: Record<NoFrameAspect, MessageKey> = {
  '1:1': 'frame.noFrame.aspect11',
  '3:4': 'frame.noFrame.aspect34',
  '3:2': 'frame.noFrame.aspect32',
};

interface OptionRowProps {
  label: string;
  /** 右侧那行小字（比如"跟随系统"当前实际解析成了哪门语言）。 */
  note?: string;
  /** 左侧文字前面的一枚色块（日期发光色用，v1.8.3 A1）。 */
  swatch?: string;
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
 * 一行可选项。
 *
 * 选中态 = **最右侧一个琥珀橙对勾**（用户明确要求的那种"设置列表"写法），
 * 文字一律靠左。v1.2.0 用的是"左侧 7pt 小方块 + 整行文字提亮"，问题是扫描
 * 一列选项时眼睛要**左右横跳**才能确认选中了哪个；对勾固定在右端，
 * 一列看下来是一条竖线，一眼就能找到当前档位。
 *
 * 为什么对勾写在 `note` **后面**而不是取代它：`note` 是"这一档的代号"
 * （颗粒的 `STD` / 语言的 `zh-Hans`），它是内容不是状态，选中时更不该消失
 * —— 用户想知道"标准档的代号是 STD"。所以顺序固定为：色块 → 文字 → 代号 → 对勾。
 */
function OptionRow({
  label,
  note,
  swatch,
  selected,
  onPress,
  a11yLabel,
  disabled,
}: OptionRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

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
      {swatch !== undefined ? (
        <View style={[styles.swatch, { backgroundColor: swatch }]} accessible={false} />
      ) : null}
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
      {/*
        对勾的宽度**恒定占位**（无论选中与否都渲染这个 View）。
        否则选中一行会让文字区域突然缩窄 20pt，长标签（"跟随系统"这类）会
        在选中的瞬间被 `numberOfLines={1}` 截出省略号 —— 一个纯粹的视觉抖动。
        未选中时里面那枚字形是空的，但 `accessibilityState.selected` 已经把
        状态报给读屏了，视觉上的留白不损失任何信息。
      */}
      <View style={styles.check}>
        {selected ? (
          <Text
            style={[styles.checkMark, disabled === true && styles.rowLabelDim]}
            numberOfLines={1}
            // 对勾是纯装饰：读屏已经通过 `accessibilityState.selected` 念过选中态了，
            // 不关掉的话 VoiceOver 会再念一遍"勾"，同一件事听两遍。
            accessible={false}
          >
            ✓
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * 样式表 = "当前机身配色"的函数。
 *
 * 为什么不是模块级常量：见文件头注释（`StyleSheet.create` 会把颜色烧死）。
 * 为什么所有颜色都从 `theme` 取、连半透明的按压底色也走 `glass`：
 * `rgba(255,255,255,0.04)` 这类"提亮"在深机身上是按压反馈，在浅机身上会变成
 * 一层白雾糊在浅底上 —— 看着像渲染脏了。`glass` 两套机身各自定义为
 * `rgba(255,255,255,0.08)` / `rgba(0,0,0,0.06)`，语义就是"比底色亮一点/暗一点"。
 */
function createStyles(theme: Theme) {
  const { ink, scrim, glass } = theme;

  return StyleSheet.create({
    root: {
      // 注意：RN 0.86 已移除 StyleSheet.absoluteFillObject，只能用 absoluteFill
      ...StyleSheet.absoluteFill,
      // 压在 DevelopOverlay（zIndex 20）之上：显影过程中打开设置也不该被盖住
      zIndex: 30,
      // 必须不透明：取景器的实时预览就在这块下面跑（见 SCRIM 的注释）
      backgroundColor: scrim,
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
      marginBottom: 18,
    },
    headerText: {
      flex: 1,
    },
    title: {
      color: ink.paper,
      fontFamily: UI_MONO,
      fontSize: 18,
      letterSpacing: 4,
    },
    subtitle: {
      marginTop: 6,
      color: ink.paperDim,
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
      borderColor: ink.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closePressed: {
      backgroundColor: glass,
    },
    closeText: {
      color: ink.amberSoft,
      fontFamily: UI_MONO,
      fontSize: 12,
      letterSpacing: 1.2,
    },
    /** 一栏的外框：栏与栏之间只有一条发丝线，不画卡片、不加圆角。 */
    section: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: ink.hairline,
    },
    /** 收起态头部：固定 54pt（12 行正好一屏，见 AccordionHeader 的注释）。 */
    accHeader: {
      height: 54,
      flexDirection: 'row',
      alignItems: 'center',
    },
    accHeaderPressed: {
      backgroundColor: glass,
    },
    /** 左侧竖条指示器：朱红/琥珀色，语义 = "这是一栏"。 */
    accBar: {
      width: 2,
      height: 14,
      marginRight: 10,
      // 深机身是琥珀 `#E5A93C`，浅机身是朱红 `#D32F2F`（由配色表决定）
      backgroundColor: ink.amberDeep,
    },
    accTitle: {
      color: ink.paper,
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: 0.8,
      flexShrink: 1,
    },
    accSpacer: {
      flex: 1,
    },
    /** 摘要：用户逐字指定的暗金色 `#C86418`，只放当前档位一个值。 */
    accSummary: {
      marginLeft: 10,
      color: SUMMARY_GOLD,
      fontSize: 14,
      letterSpacing: 0.4,
      maxWidth: 170,
    },
    /** 日期发光色摘要前的圆点（仅在 `date_color` 栏出现）。 */
    accDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    accChevron: {
      width: 16,
      marginLeft: 6,
      color: ink.paperFaint,
      fontSize: 12,
      lineHeight: 16,
      textAlign: 'center',
    },
    /** 展开时箭头掉头（180°，用户 m01534 的明确要求）。 */
    accChevronOpen: {
      transform: [{ rotate: '180deg' }],
    },
    /** 展开体：整体往右缩进 12pt，让"这是上一行的内容"一眼成立。 */
    accBody: {
      paddingLeft: 12,
      paddingBottom: 4,
    },
    group: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: ink.hairline,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: ink.hairline,
    },
    rowPressed: {
      backgroundColor: glass,
    },
    /** 发光色行的圆点（18pt 实心，左侧）。 */
    swatch: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: 10,
    },
    rowLabel: {
      flex: 1,
      color: ink.paperDim,
      fontSize: 15,
      letterSpacing: 0.6,
    },
    rowLabelOn: {
      color: ink.paper,
    },
    /** 灰掉的行：压到 0.38 —— 还读得清是什么，但一眼看得出"现在不生效"。 */
    rowLabelDim: {
      opacity: 0.38,
    },
    /**
     * 对勾的固定槽位。宽度写死 20pt，选中与否都占着，避免选中瞬间文字被挤窄。
     * 用 `alignItems: 'flex-end'` 而不是靠外边距对齐：右端就是这一行的右缘，
     * 不随 `note` 的长短漂移。
     */
    check: {
      width: 20,
      marginLeft: 12,
      alignItems: 'flex-end',
    },
    checkMark: {
      // 跟着配色表走：深机身是琥珀 `#E5A93C`，浅机身是朱红 `#D32F2F`（见上方注释）
      color: ink.amber,
      fontSize: 15,
      lineHeight: 20,
    },
    rowNote: {
      marginLeft: 12,
      color: ink.paperFaint,
      fontFamily: UI_MONO,
      fontSize: 10,
      letterSpacing: 1,
      maxWidth: 120,
    },
    hint: {
      marginTop: 10,
      color: ink.paperFaint,
      fontSize: 11,
      lineHeight: 17,
    },
    statusLine: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: ink.hairline,
    },
    statusDot: {
      width: 6,
      height: 6,
      marginRight: 8,
      borderRadius: 3,
      backgroundColor: ink.paperFaint,
    },
    statusDotOn: {
      backgroundColor: ink.amber,
    },
    statusDotError: {
      backgroundColor: ink.amberDeep,
    },
    statusText: {
      flex: 1,
      color: ink.amberSoft,
      fontFamily: UI_MONO,
      fontSize: 11,
      letterSpacing: 0.8,
    },
    footer: {
      marginTop: 30,
      color: ink.paperFaint,
      fontFamily: UI_MONO,
      fontSize: 9,
      lineHeight: 15,
      letterSpacing: 1.2,
    },
  });
}
