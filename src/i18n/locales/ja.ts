/**
 * 日本語。
 *
 * 键名不能改、不能少 —— 母本在 `zh-Hans.ts`，改完跑 `npm run typecheck` 会校验完整性。
 */
import type { Messages } from '../types';

export const ja: Messages = {
  /* ---------------- 共通 ---------------- */
  'common.unknownError': '不明なエラー',

  /* ---------------- ① 上部バー ---------------- */
  'camera.flash.label': 'フラッシュ',
  // 状態の説明（動作ではない）：同じ文字列をボタンのアクセシビリティラベルと
  // ファインダー上部の一時ヒントの両方で使う — 文言がずれないようにするため。
  'camera.flash.state.off': 'フラッシュ · オフ',
  'camera.flash.state.on': 'フラッシュ · オン',
  'camera.flash.state.auto': 'フラッシュ · オート',
  'camera.flip.a11y': 'カメラを切り替え',
  'camera.flip.label': '反転',
  'camera.settings.a11y': '設定を開く',
  'camera.settings.label': '設定',

  /* ---------------- ③ 下部コントロール ---------------- */
  'camera.preset.head': 'プリセット PRESET',
  'camera.preset.a11y': '現在のプリセット {name}、タップで切り替え',
  'camera.preset.hint': '{index}/{total} · 切り替え',
  'camera.frame.hint': 'スワイプでフレーム変更',
  'camera.frame.label': 'フレーム',
  'camera.frame.next': '次のフレーム',
  'camera.frame.prev': '前のフレーム',
  'camera.frame.switcher': 'フレーム切り替え',
  'camera.frame.switcherHint': '左右にスワイプしてフレームを切り替え',
  'camera.shutter.a11y': '撮影',
  'camera.shutter.busy': '現像中',

  /* ---------------- フィルムライブラリ（右下のフィルムボタンで開く） ---------------- */
  // パネル見出し = 印刷された英語プレート（翻訳しない）+ 現地語の語、間は ' · ' で区切る。
  // プレートは筐体の刻印、後ろの語が人に向けた説明 —— 5言語で同じ表記ではなくなった。
  'film.drawer.title': 'SELECT FILM STOCK · フィルムライブラリ',
  'film.drawer.a11y': 'フィルムライブラリ、フィルムプリセットを選択',
  'film.drawer.close': '完了',
  'film.drawer.hint': 'タップでフィルムを選択 · 右下のフィルムボタンでいつでも切り替え',
  'film.card.a11y': '{name}、{description}',
  'film.card.selected': '選択中',
  'film.intensity.title': 'PRESET INTENSITY · プリセット強度',
  'film.intensity.hint': 'フィルム全体の強さ · AUTO はシーン判定に任せる',
  'film.intensity.a11y': 'プリセット強度、現在 {label}',
  'film.intensity.auto.hint': 'シーンに合わせて自動調整（70%~95%）',
  'film.stockMode.auto': 'AUTO スマートフィルム',
  'film.stockMode.auto.hint': '撮影画面からフィルムと強度を自動選択',
  'film.stockMode.manual.hint': '手動で選択',
  'film.stockMode.a11y': 'オートスマートフィルム、{state}',

  /* ---------------- フレーム名（上部バーの小さい文字） ----------------
     名前は短く。日本語は特に長くなりやすいので 2〜5 文字に抑えています。 */
  'frame.polaroid600': 'インスタント',
  'frame.instaxMini': 'ミニ',
  'frame.neg135': '135',
  'frame.slideMount': 'スライド',
  'frame.badge.a11y': 'フレーム {name}、{count} 枚目',
  'frame.variant.a11y': 'フレームのスタイル {name}',
  'drawer.frame.title': 'フレーム',
  'drawer.frame.hint': '左右にスワイプでスタイル切替',

  /* ---------------- ② ファインダー右端のズームレール ---------------- */
  'zoom.a11y': 'ズーム {percent}%、左右をタップして切り替え',
  'zoom.label': 'ズーム',
  'zoom.role.ultraWide': '超広角',
  'zoom.role.wide': '標準',
  'zoom.role.tele': '望遠',
  'zoom.stop.a11y': '{label} に切り替え',
  'zoom.stop.digital': 'デジタルズーム',
  'camera.gallery.a11y': 'アプリ内アルバムを開く',
  'camera.gallery.label': 'アルバム',
  'gallery.title': 'アルバム',
  'gallery.close': '完了',
  'gallery.empty': 'まだ写真がありません',
  'gallery.emptyHint': '撮影するとここに並びます。写真アプリを開く必要はありません。',
  'gallery.photo': '{index} 枚目、{date}',
  'gallery.delete': 'この写真を削除',
  'gallery.lightbox.a11y': '{index} 枚目、タップで閉じる',
  'gallery.share': '共有',
  'gallery.shareFailed': '共有に失敗：{message}',
  'gallery.saved': '「{album}」に保存しました',
  // アルバム名は5言語で同じ文字列。写真アプリで同じアルバムだと分かる必要がある。
  'album.name': 'RETRO CAM',
  'camera.focus.a11y': '画面をタップしてピントを合わせる',

  /* ---------------- ③.5 粒子の強さ ---------------- */
  'grain.a11y': '粒子の強さ {label}',
  'grain.label': '粒子 GRAIN',
  'grain.level.off': 'なし',
  'grain.level.light': '弱',
  'grain.level.std': '標準',
  'grain.level.heavy': '強',
  'grain.level.max': '最強',
  'grain.note': 'フィルム本来の粒子に、濃淡を一段重ねます。',

  /* ---------------- ④ LCD ステータスバー ---------------- */
  'lcd.date.off': '日付 オフ',
  'lcd.date.on': '日付 {format} · 基準 {anchor}',
  'lcd.font.custom': 'カスタム',
  'lcd.font.mono': '等幅',
  // 短い2つは LCD 専用（LCD は1行の等幅小文字なので長文は切れる）
  'lcd.location.denied': '位置情報 未許可',
  'lcd.location.off': '位置情報 オフ',
  'lcd.location.on': '位置情報 {value}',
  'lcd.location.servicesOff': '位置情報 システムOFF',
  'lcd.params': '粒子 {code} {grain} · 周辺減光 {vignette} · 光漏れ {leak} · 書体 {font}',

  /* ---------------- 保存失敗バナー ---------------- */
  'banner.dismiss': '了解',
  'banner.openSettings': '設定を開く',

  /* ---------------- 権限 / エラー表示 ---------------- */
  'perm.camera.allow': 'カメラの使用を許可',
  'perm.camera.hint':
    'iOS：設定 → プライバシーとセキュリティ → カメラ；Android：設定 → アプリ → 権限。許可したらアプリに戻って「再確認」をタップ。',
  'perm.camera.message':
    'このアプリは端末の中だけで撮影・合成します。写真は一切アップロードしません。',
  'perm.camera.openSettings': 'システム設定を開く',
  'perm.camera.recheck': '再確認',
  'perm.camera.title': 'カメラの権限が必要です',
  'perm.mount.hint':
    '何度も失敗する場合：アプリを完全に終了（上にスワイプして閉じる）してから開き直してください。それでもだめなら端末を再起動。他のアプリがカメラを使用中（録画・ビデオ通話）でも起動できません。',
  'perm.mount.retry': '再試行',
  'perm.mount.title': 'カメラを起動できません',

  /* ---------------- 現像オーバーレイ ---------------- */
  'develop.done.saved': 'アルバムに保存しました',
  'develop.done.unsaved': '現像が完了しました（未保存）',
  'develop.error.title': '現像に失敗',
  'develop.queue.count': '待ち {count}',
  'develop.stage.capturing': '露光・現像中',
  'develop.stage.grading': 'フィルムを調色中',
  'develop.stage.normalizing': 'フィルムを準備中',
  'develop.stage.saving': 'アルバムに保存中',
  'develop.tapToContinue': '画面をタップして撮影を続ける',
  'develop.auto.badge': 'AUTO 選択：{badge}',

  /* ---------------- エラー文案 ---------------- */
  'error.noPhoto': 'カメラが写真を返しませんでした。もう一度お試しください。',
  'error.filmRender': '現像に失敗しました（LUT ピクセルパイプライン）。写真は保存されていません。もう一度お試しください。',
  'save.denied.retry':
    'アルバムへの書き込み権限がありません。もう一度保存を押して、ダイアログで「許可」を選んでください。',
  'save.denied.settings':
    'アルバムの権限が拒否され、再確認できません。システム設定 → プライバシーとセキュリティ → 写真 で許可してください。',
  'save.unsupported':
    '現在の expo-media-library には保存 API がありません。Expo SDK を更新してください。',

  /* ---------------- 設定画面 ---------------- */
  'settings.close': '完了',
  'settings.footer': '変更はすぐ反映され、次に開いたときも保持されます。',
  'settings.grain.title': '粒子',
  'settings.grain.a11y': '粒子の強さ、現在 {level}',
  'settings.language.head': '言語 LANGUAGE',
  'settings.language.system': 'システムに従う',
  'settings.location.head': '位置情報スタンプ LOCATION',
  'settings.location.hint':
    'オンにすると、写真の左下にもう一行だけ位置情報の小さい文字が焼き込まれます（紙のような白、右下のオレンジの日付と同じベースライン）。座標は完全にオフラインで算出します。地名は OS の逆ジオコーディング（iOS は Apple、Android は Google）を使うため、その処理だけは通信します —— ただし位置はこの写真に書き込まれるだけで、アプリ自身が何かを送信することはありません。',
  'settings.location.off': 'オフ',
  'settings.location.place': '地名',
  'settings.location.coords': '座標',
  'settings.locationMode.a11y': '位置情報スタンプ：{label}',
  'settings.locale.a11y': '表示言語：{label}',
  'settings.placeDetail.title': '地名の詳しさ',
  'settings.placeDetail.a11y': '地名の詳しさ：{label}',
  'settings.placeDetail.archive': '簡略（都市・コード）',
  'settings.placeDetail.full': '詳細（行政名）',
  'settings.placeDetail.note': '香港・マカオ・台湾には「中国」の接頭辞が付きます。',
  'settings.subtitle': 'SETTINGS',
  'settings.title': '設定',
  'settings.watermark.title': '透かしのレイアウト',
  'settings.quality.title': '画質',
  'settings.quality.a11y': '画質：{label}',
  'settings.quality.standard': '標準',
  'settings.quality.high': '高画質',
  'settings.quality.max': '最高',
  'settings.quality.note': '仕上がりの長辺ピクセル数。大きいほど精細で、メモリも使います。',
  'settings.quality.capNote':
    '長辺 {longEdge}px。真の 48MP にはネイティブのカメラモジュールが必要です —— この設定は仕上がりサイズだけを決めます。',

  'settings.watermark.a11y': '透かしのレイアウト：{label}',
  'settings.watermark.split': '地名は左・日付は右',
  'settings.watermark.stacked': '地名は上・日付は下',
  'settings.watermark.centered': '一行に結合・中央揃え',
  'settings.watermark.dateOnly': '日付のみ',

  'settings.watermarkZone': '透かしの縦位置',
  'settings.watermarkZone.a11y': '透かしの縦位置：{label}',
  'settings.watermarkZone.auto': 'フレームに従う',
  'settings.watermarkZone.paper': '台紙の余白',
  'settings.watermarkZone.photoTop': '写真の上部',
  'settings.watermarkZone.photoBottom': '写真の下部',
  'settings.watermarkAlign': '透かしの横位置',
  'settings.watermarkAlign.a11y': '透かしの横位置：{label}',
  'settings.watermarkAlign.auto': 'レイアウトに従う',
  'settings.watermarkAlign.left': '左寄せ',
  'settings.watermarkAlign.center': '中央',
  'settings.watermarkAlign.right': '右寄せ',
  'settings.adaptiveGrade': 'シーン自動調整',
  'settings.adaptiveGrade.a11y': 'シーン自動調整：{label}',
  'settings.adaptiveGrade.on': 'オン',
  'settings.adaptiveGrade.off': 'オフ',
  'settings.adaptiveGrade.hint':
    '写真の明るさ・コントラスト・色かぶりから現像パラメータを自動で調整します。オフにするとプリセットの既定値のまま現像します。',

  /* ---------------- 位置情報 ---------------- */
  'location.denied':
    '位置情報の権限が拒否されました。システム設定 → プライバシーとセキュリティ → 位置情報サービス で許可してください。',
  'location.failed': '位置情報を取得できません',
  'location.locating': '位置情報を取得中',
  'location.servicesOff': 'システムの「位置情報サービス」がオフになっています。',
  /* ---------------- アルバム取り込み（§8） ---------------- */
  'gallery.import': '取り込み',
  'gallery.import.a11y': '写真ライブラリから取り込んで再現像する',
  'gallery.import.busy': '現像中…',
  'gallery.import.denied':
    '写真へのアクセスが許可されていません。システム設定 → プライバシーとセキュリティ → 写真 で許可してください。',
  'gallery.import.failed': '取り込みに失敗しました：{message}',
  'gallery.import.noExif': '元写真に撮影日時がないため、今日の日付で現像します。',

  /* ---------------- フィルム長尺（§9） ---------------- */
  'gallery.mode.strip': '長尺フィルム',
  'gallery.mode.grid': '一覧表示',
  'gallery.mode.a11y': 'アルバムの表示方法：{label}',
  'gallery.strip.count': '全 {count} 枚',

  /* ---------------- 複数選択して削除 ---------------- */
  'gallery.selection.enter': '選択',
  'gallery.selection.photo': '{total}枚中{index}枚目',
  'gallery.selection.count': '{count}枚選択中',
  'gallery.selection.selectAll': 'すべて選択',
  'gallery.selection.clear': 'すべて解除',
  'gallery.selection.delete': '削除',
  'gallery.selection.delete.a11y': '選択した写真{count}枚を削除',
  'gallery.selection.delete.title': '選択した写真（{count}枚）を削除しますか？',
  'gallery.selection.delete.message': 'アプリ内のコピーを完全に削除します。「写真」にあるコピーには影響しません。',
  'gallery.selection.delete.confirm': '{count}枚を削除',
  'gallery.selection.deleting': '削除中…',
  'gallery.selection.cancel': 'キャンセル',
  'gallery.selection.deleted': '{count}枚削除しました',
  'gallery.selection.delete.failed': '{deleted}/{count}枚のみ削除できました。もう一度お試しください',

  /* ---------------- 削除（§10.2） ---------------- */
  'gallery.delete.a11y': 'この一枚を削除',
  'gallery.delete.title': 'この一枚を削除しますか？',
  'gallery.delete.message': '端末内のコピーも一緒に消えます。元に戻せません。',
  'gallery.delete.cancel': 'キャンセル',
  'gallery.delete.confirm': '削除',
  'gallery.deleted': '削除しました',
  'gallery.delete.failed': '削除できませんでした。もう一度お試しください',

  // ---- v1.4.0：取景器极简重构新增 ----
  'settings.geoLocale.title': '地名の言語',
  'settings.geoLocale.a11y': '地名の言語、現在 {label}',
  'settings.geoLocale.auto': '画面に合わせる',
  'settings.geoLocale.zhHans': '簡体字中国語',
  'settings.geoLocale.zhHant': '繁体字中国語',
  'settings.geoLocale.ja': '日本語',
  'settings.geoLocale.en': 'English',
  'settings.geoLocale.note': '仕上がりの地名だけに効きます。画面の言語とは別です',
  'camera.bar.temp': '色温度',
  'camera.bar.focal': '焦点距離',
  'camera.bar.ev': '露出',
  'camera.bar.temp.a11y': '色温度、現在 {label}。長押ししてスライドで調整、タップでリセット',
  'camera.bar.focal.a11y': '焦点距離 {label}。長押ししてスライドで調整、タップで段階を開く',
  'camera.bar.ev.a11y': '露出補正 {value}。長押ししてスライドで調整、タップでリセット',
  'camera.bar.ev.hint': '上下にスワイプして露出を調整',
  'camera.bar.intensity': '強度',
  'camera.bar.intensity.a11y': 'プリセット強度 {label}、タップで段階を開く',
  'camera.tool.import': '読み込み',
  'camera.tool.double': '多重露光',
  'camera.tool.timer': 'タイマー',
  'camera.tool.flash': 'フラッシュ',
  'camera.tool.flip': '前後切替',
  'camera.tool.preview': 'プレビュー',
  'camera.tool.preview.on': 'オン',
  'camera.tool.preview.off': 'オフ',
  'camera.tool.preview.a11y': 'フレームのライブプレビュー、{state}',
  'camera.tool.double.on': '多重露光オン',
  'camera.tool.double.hint': 'もう一度シャッターを切ると重なります',
  'camera.tool.timer.off': 'オフ',
  'camera.tool.timer.3': '3 秒',
  'camera.tool.timer.10': '10 秒',
  'camera.timer.counting': '{seconds} 秒後に撮影',
  'camera.focus.hint': 'タップしてピント合わせ',
  'camera.exposure.a11y': '露出スライダー、上下にスワイプして調整',
  'camera.frame.slot2': '2 コマ目を撮影',
  'frame.fp100c': 'ピールアパート',
  'camera.thumb.a11y': 'アルバムを開く',
  /* ---------------- v1.8.0：相框改成三大暗房卡纸材质 ---------------- */
  'frame.variant.archival': 'クラシック白',
  'frame.variant.baryta': 'バライタ暖黄',
  'frame.variant.obsidian': 'ダークルーム黒',
  /* ---------------- v1.8.1：枠なし全画面（00 NO FRAME） ---------------- */
  'frame.noFrame': '枠なし',
  // 比率の数字だけを出し、方向の語は書かない（理由は zh-Hans の同じ節の注記）。
  'frame.noFrame.aspect11': '画角 1:1',
  'frame.noFrame.aspect34': '画角 3:4',
  'frame.noFrame.aspect32': '画角 3:2',
  'settings.noFrame.title': '枠なしの画角',
  'settings.noFrame.a11y': '枠なしの画角、現在 {label}',
  'settings.noFrame.hint':
    '「枠なし（00）」を選んでいる間だけ効きます。紙がないので比率はここで決まり、写真はこの画角で全面に広がります。3:2 は 2:3 の縦長（3:4 より高い）になり、横長にはなりません — この値はリポジトリのゲートスクリプトで固定されています。',

  /* ---------------- v1.8.0：日期烙印引擎（13 格式 × 5 字形 × 8 机位 × 5 发光色） ---------------- */
  'settings.dateEngine.title': '日付刻印',
  'settings.dateEngine.hint': '文字サイズは基準キャンバス 1440px に固定されているため、仕上がりでのピクセル高は常に一定です。月名と曜日は実機の裏蓋と同じく英語のままです。',
  'settings.dateEngine.a11y.format': '日付フォーマット、現在 {label}',
  'settings.dateEngine.a11y.glyph': '日付の字形、現在 {label}',
  'settings.dateEngine.a11y.spot': '日付の位置、現在 {label}',
  'settings.dateEngine.a11y.glow': '日付の発光色、現在 {label}',
  'settings.dateEngine.format.MM_DD_YY': '10  17  \'26',
  'settings.dateEngine.format.YY_MM_DD': '26 10 17',
  'settings.dateEngine.format.DD_MM_YY': '17 10 26',
  'settings.dateEngine.format.DAY_HH_MM': '17  01:39',
  'settings.dateEngine.format.YY_MM_DD_TIME': '26 10 17 01:39',
  'settings.dateEngine.format.YYYY_DOT_MM_DD': '2026.10.17',
  'settings.dateEngine.format.YYYY_SLASH_TIME': '2026/10/17 01:39',
  'settings.dateEngine.format.ENG_MMM_DD_YY': 'OCT 17 \'26',
  'settings.dateEngine.format.YYYY_MM_DD_WEEK': '2026 10 17 SAT',
  'settings.dateEngine.format.CJK_KANJI': '2026年10月17日',
  'settings.dateEngine.format.EXIF_TECH': '2026:10:17 01:39:07',
  'settings.dateEngine.format.FRAME_DATE': 'OCT 17 2026',
  'settings.dateEngine.format.OFF': 'オフ',
  'settings.dateEngine.glyph.quartz_led': 'クオーツLED',
  'settings.dateEngine.glyph.ccd_osd': 'CCD録画OSD',
  'settings.dateEngine.glyph.lab_inkjet': '暗室インクジェット',
  'settings.dateEngine.glyph.archival_steel': 'アーカイブ鋼印',
  'settings.section.dateFormat': '日付フォーマット DATE FORMAT',
  'settings.section.dateFont': '日付書体 STAMP FONT',
  'settings.section.datePos': '日付位置 STAMP POSITION',
  'settings.section.dateColor': '日付カラー LED COLOR',
  'settings.section.quality': '画質 RESOLUTION',
  'settings.section.grain': '粒子 FILM GRAIN',
  'settings.dateEngine.spot.in_bl_v': '画面内左下 · 縦組み',
  'settings.dateEngine.spot.in_bl_h': '画面内左下 · 横組み',
  'settings.dateEngine.spot.in_br_h': '画面内右下 · 横組み',
  'settings.dateEngine.spot.in_br_v': '画面内右下 · 縦組み',
  'settings.dateEngine.spot.in_tr_v': '画面内右上 · 縦組み',
  'settings.dateEngine.spot.in_cb_h': '画面下部中央',
  'settings.dateEngine.spot.strip_split': '白フチ左右分け',
  'settings.dateEngine.spot.strip_center': '白フチ中央一体',
  'settings.dateEngine.glow.coral_red': 'コーラルレッド',
  'settings.dateEngine.glow.classic_amber': 'タングステン琥珀',
  'settings.dateEngine.glow.warm_gold': 'シャンパンゴールド',
  'settings.dateEngine.glow.ccd_green': 'ミレニアムグリーン',
  'settings.dateEngine.glow.cyber_cyan': 'サイバーシアン',
};
