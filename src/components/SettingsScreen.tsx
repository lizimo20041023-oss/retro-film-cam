/**
 * 设置界面 —— 一块"翻过来的机身背板"。
 *
 * 视觉上和取景屏幕共用同一套墨色 —— 深/浅两套配色由 `useTheme()` 现取
 * （`src/constants/theme.ts`），字体共用 `UI_MONO`：
 * 同一台机器上不该出现两种字体气质，也不该在系统切成浅色时只有这一屏不跟。
 * 刻意不引 react-navigation ——
 * 全 App 就两个界面，一个绝对定位的整屏覆盖层足够了，
 * 引了导航库反而要给取景器套一层 navigator，得不偿失。
 *
 * 用整屏 `ScrollView` 而不是 `View`：iPhone SE 上"语言 6 行 + 定位 4 行 + 页脚"
 * 会超出一屏，而设置界面**绝不能有滚不动的选项**。本次加了三个分区之后更长了，
 * v1.7.0 的画质分区又添了 3 行，v1.8.0 的日期引擎区一次添了 31 行
 * （13 格式 + 5 字形 + 8 机位 + 5 发光）—— 这也是那个 `ScrollView` 至今
 * 没被换成 `View` 的原因。它是本屏最长的一段，"能滚"在这里不是方便而是必需。
 *
 * ── 为什么所有"拍之前要定好"的参数都收到这里 ──────────────────────────────
 * 颗粒原本是取景器底部的一条横向滑轨。取景时最不该做的事就是分心去调颗粒：
 * 它是**一卷胶卷的属性**，不是每一张的即时决定。收进设置之后取景器只剩
 * "构图、对焦、按快门"三件事。水印版式和地名详细度同理。
 *
 * ── 排序说明 ──────────────────────────────────────────────────────────────
 * 顺序 = 「越常改的越靠上」+「有从属关系的必须相邻」：
 * 语言 → 定位水印 → 地名详细度（只在"地名"档下起作用，所以紧贴其后）
 * → 水印版式（水印长什么样）→ 日期引擎（日期自己长什么样 · v1.8.0）
 * → 画质（成片有多大 · v1.7.0）→ 颗粒（成像质感）→ 页脚。
 *
 * 日期引擎为什么紧跟水印版式、而不是另起一段更靠下：这两段说的是同一件事的两半
 * —— 版式决定"地名与日期怎么排"，日期引擎决定"日期本身的格式/字形/机位/发光"。
 * 更要紧的是机位会**反作用**于版式：一旦选画内机位，日期就从版式里被摘出去，
 * 那条白边只剩地名（规则落在 `FilmCompositor.planWatermark`）。隔开摆会让
 * "我只换了机位、版式怎么跟着变了"变成一道要用户自己拼的谜。
 */
import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme, UI_MONO } from '../constants/theme';
import type { Theme } from '../constants/theme';
import { CAPTURE_QUALITIES, captureQualityCapNote } from '../constants/captureQuality';
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
  PlaceDetail,
  WatermarkLayout,
} from '../types';

/**
 * 覆盖层遮罩的**可读性底线**：不透明度 0.985。
 *
 * 为什么必须**几乎不透明**：本屏是挂在相机屏上的整屏覆盖层，取景器一直在后面跑。
 * 更早的版本用的是 `rgba(12, 12, 11, 0.97)`，那 3% 的透明足够让实时预览透出来
 * —— 用户报的就是这个"看着像渲染故障"。
 *
 * 颜色本身现在来自 `useTheme().scrim`（深机身 `rgba(14,15,17,0.985)`、
 * 浅机身 `rgba(237,236,232,0.985)`）。**浅色机身下遮罩跟着一起变浅**：
 * 遮罩底下压着的是本屏的面板文字，而浅机身的墨色是炭黑
 * （`ink.paper` = `rgba(28,28,30,0.92)`）—— 深遮罩配炭黑字就是"深底黑字"，
 * 比透明穿透更难读。挡住取景器靠的是 0.985 这个不透明度，不是颜色的深浅。
 *
 * ⚠️ `src/components/GalleryScreen.tsx` 的相册面板共用同一个 `scrim` token。
 * 两处以前各留一份写死的 `'rgba(18, 18, 18, 0.98)'`，注释还互相指路；
 * 现在都从配色表取，就是为了消灭"改一处忘另一处"这个失败模式。
 *
 * 真正兜住穿透的是两层保险：① 这里 0.985 的遮罩；② `CameraScreen` 在 `covered`
 * 时把整个取景容器压成 `opacity: 0`（见那份注释）。**两层都要在。**
 */

/**
 * 选中项对勾的颜色 —— 现在直接用墨色表里的 `ink.amber`。
 *
 * 以前这里写死 `#E5A93C`，理由是"`✓` 只有 15pt、笔画细，标准琥珀在深色底上发闷"。
 * 那个理由只在深机身下成立：浅机身的 `ink.amber` 是朱红 `#D32F2F`，
 * 它在浅底上本来就够重，再提亮反而会飘。所以交给配色表决定，
 * 深机身拿到琥珀、浅机身拿到朱红，一处都不用再判断。
 */

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
    setDateEngine,
  } = useSettings();

  /**
   * 配色表 + 样式表都从"当前机身配色"现算。
   *
   * 为什么样式表不能留在模块作用域：`StyleSheet.create` 在模块加载那一刻就把颜色
   * 烧死了，系统切深/浅色时本屏一行都不会变 —— 这正是这次要修的病。
   * 用 `useMemo` 缓存而不是每次渲染重建：换肤时才重算一次，
   * 平时滚动/选档都复用同一个对象，`StyleSheet` 的引用比较也才稳定。
   */
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

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

        {/* ④ 地名语言。紧贴地名详细度：两段都只影响成片上那一行地名，
            分开摆会让用户以为是两件互不相干的事。
            这一档**只改地名的书写语言**，不动界面语言 —— 界面语言在①，
            用户完全可能想要"界面中文、地名英文"（发到国外平台时很常见）。 */}
        <SectionHeading label={t('settings.geoLocale.title')} />
        <View style={styles.group}>
          {GEO_LOCALE_ROWS.map((row) => (
            <OptionRow
              key={row.geoLocale}
              label={t(row.labelKey)}
              selected={settings.geoLocale === row.geoLocale}
              onPress={() => handleGeoLocale(row.geoLocale)}
              a11yLabel={t('settings.geoLocale.a11y', { label: t(row.labelKey) })}
            />
          ))}
        </View>
        <Text style={styles.hint}>{t('settings.geoLocale.note')}</Text>

        {/* ⑤ 水印版式 */}
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

        {/* ⑥ 日期引擎（v1.8.0 · 模块五）。四个选择器 = 日期的四个轴，顺序按
            「先决定印什么 → 再决定怎么长 → 最后决定印在哪、发什么光」：
            格式 → 字形 → 机位 → 发光色。
            不把这四组拆成带小标题的四段：小标题要新增四条 i18n 文案，而这四组
            的标签本身已经自解释（格式行直接显示样例串、机位行写"画内左下 · 竖排"、
            发光行写颜色名），再多一层标题只是把这一屏拉得更长。 */}
        <SectionHeading label={t('settings.dateEngine.title')} />

        {/* 轴一 · 格式：决定日期**印什么**（13 档，最后一档是"关闭"）。
            每一行的标签就是这一档的样例串（`settings.dateEngine.format.*` 里
            存的是样例而不是名字）—— 日期烙印这种东西，看样例比看"年月日"这种
            档位名快得多，而且样例本身就是模板渲染出来的真实结果。 */}
        <View style={styles.group}>
          {DATE_FORMAT_ROWS.map((row) => (
            <OptionRow
              key={row.format}
              label={t(row.labelKey)}
              selected={dateEngine.format === row.format}
              onPress={() => handleDateFormat(row.format)}
              a11yLabel={t('settings.dateEngine.a11y.format', { label: t(row.labelKey) })}
            />
          ))}
        </View>

        {/* 轴二 · 字形：决定日期**怎么长**（5 档点阵/数码管/印刷体）。
            这一档是"整个日期引擎"里唯一会改变**字号设计像素**的轴
            （`DATE_DESIGN_PX`，见 `constants/canvasBase.ts`）—— 不过它只改字形档，
            不改"字号跟着画布宽等比锁死"这条不变式。 */}
        <View style={styles.group}>
          {DATE_GLYPH_ROWS.map((row) => (
            <OptionRow
              key={row.glyphStyle}
              label={t(row.labelKey)}
              selected={dateEngine.glyphStyle === row.glyphStyle}
              onPress={() => handleDateGlyph(row.glyphStyle)}
              a11yLabel={t('settings.dateEngine.a11y.glyph', { label: t(row.labelKey) })}
            />
          ))}
        </View>

        {/* 轴三 · 机位：决定日期**印在哪**（画内 6 档 + 白边 2 档）。
            顺序 = 先画内、后白边；画内那 6 档按"左下 → 右下 → 右上 → 底部居中"排，
            与 `DateStampSpot` 的枚举顺序一致。标签里那句"竖排"是真的 90° 旋转，
            不是换行 —— 所以这一档的选项文字本身也是唯一需要带方向的标签。 */}
        <View style={styles.group}>
          {DATE_SPOT_ROWS.map((row) => (
            <OptionRow
              key={row.spot}
              label={t(row.labelKey)}
              selected={dateEngine.spot === row.spot}
              onPress={() => handleDateSpot(row.spot)}
              a11yLabel={t('settings.dateEngine.a11y.spot', { label: t(row.labelKey) })}
            />
          ))}
        </View>

        {/* 轴四 · 发光色：决定日期的灯丝发什么颜色的光（5 档）。
            放在机位之后，因为这四轴里只有它和"印在哪"无关、纯粹是观感，
            顺序上排最后也就最不容易和"我要它印在哪儿"混起来。 */}
        <View style={styles.group}>
          {DATE_GLOW_ROWS.map((row) => (
            <OptionRow
              key={row.glow}
              label={t(row.labelKey)}
              selected={dateEngine.glow === row.glow}
              onPress={() => handleDateGlow(row.glow)}
              a11yLabel={t('settings.dateEngine.a11y.glow', { label: t(row.labelKey) })}
            />
          ))}
        </View>
        <Text style={styles.hint}>{t('settings.dateEngine.hint')}</Text>

        {/* ⑦ 画质（v1.7.0 · 模块一）：成片长边像素。 */}
        <SectionHeading label={t('settings.quality.title')} />
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
              onPress={() => handleCaptureQuality(spec.id)}
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

        {/* ⑧ 颗粒。从取景器底部那条横向滑轨搬过来的（见文件头）。 */}
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

/**
 * 地名语言四档的顺序 = 从"交给系统"到越来越具体。
 *
 * 为什么「跟随界面」排第一：它和上面两段一样，默认档必须排在最前 ——
 * 用户打开这一屏时，当前档位就在第一行，"我现在是不是在跟随系统"一眼可见。
 * 后三档按使用人数排，中文两档在英文之前（这个 App 的界面语言里中文占多数）。
 */
const GEO_LOCALE_ROWS: readonly {
  geoLocale: GeoLocale | 'auto';
  labelKey:
    | 'settings.geoLocale.auto'
    | 'settings.geoLocale.zhHans'
    | 'settings.geoLocale.zhHant'
    | 'settings.geoLocale.en';
}[] = [
  { geoLocale: 'auto', labelKey: 'settings.geoLocale.auto' },
  { geoLocale: 'zh-Hans', labelKey: 'settings.geoLocale.zhHans' },
  { geoLocale: 'zh-Hant', labelKey: 'settings.geoLocale.zhHant' },
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
 * 日期引擎四张行的表（v1.8.0 · 模块五）。
 *
 * 为什么这四张表的 `labelKey` 写成 `MessageKey` 而不是像上面几张表那样逐条列出
 * 字面量联合：格式一档就有 13 行，四张表加起来 31 行，逐条写等于把同一份枚举
 * 抄第二遍 —— 抄漏一条编译器不会报，而是让那一行在界面上变成空白。
 * `MessageKey` 本身就是"所有键的字面量联合"，写错键名照样过不了编译，
 * 保护一点没少。
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

/** 字形五档：从最"电子的"到最"印刷的"。 */
const DATE_GLYPH_ROWS: readonly { glyphStyle: DateGlyphStyleId; labelKey: MessageKey }[] = [
  { glyphStyle: 'led_7seg', labelKey: 'settings.dateEngine.glyph.led_7seg' },
  { glyphStyle: 'led_dot_matrix', labelKey: 'settings.dateEngine.glyph.led_dot_matrix' },
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

function SectionHeading({ label }: { label: string }) {
  // 每个用到样式的组件各取一份"当前机身配色"。理由见 SettingsScreen 里 `styles` 的注释：
  // 模块作用域的 StyleSheet 会把颜色烧死，系统换肤时不会重渲染。
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

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
 * 一行可选项。
 *
 * 选中态 = **最右侧一个琥珀橙对勾**（用户明确要求的那种"设置列表"写法），
 * 文字一律靠左。v1.2.0 用的是"左侧 7pt 小方块 + 整行文字提亮"，问题是扫描
 * 一列选项时眼睛要**左右横跳**才能确认选中了哪个；对勾固定在右端，
 * 一列看下来是一条竖线，一眼就能找到当前档位。
 *
 * 为什么对勾写在 `note` **后面**而不是取代它：`note` 是"这一档的代号"
 * （颗粒的 `STD` / 语言的 `zh-Hans`），它是内容不是状态，选中时更不该消失
 * —— 用户想知道"标准档的代号是 STD"。所以顺序固定为：文字 → 代号 → 对勾。
 */
function OptionRow({ label, note, selected, onPress, a11yLabel, disabled }: OptionRowProps) {
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
 * 为什么不是模块级常量：见 SettingsScreen 里 `styles` 那段注释（颜色会被烧死）。
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
    // 必须不透明：取景器的实时预览就在这块下面跑（见上面 SCRIM 的注释）
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
    marginBottom: 24,
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
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 10,
  },
  sectionRule: {
    width: 2,
    height: 12,
    // 小竖线用"深一档的强调色"，不是写死的琥珀：浅机身下 `amberDeep` 是朱红，
    // 写死 `rgba(194,122,48,0.60)` 会在浅底上变成一块土黄。
    backgroundColor: ink.amberDeep,
    marginRight: 8,
  },
  sectionLabel: {
    color: ink.paperDim,
    fontFamily: UI_MONO,
    fontSize: 10,
    letterSpacing: 2.4,
  },
  group: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ink.hairline,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ink.hairline,
  },
  rowPressed: {
    backgroundColor: glass,
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
