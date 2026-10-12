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
  'camera.flash.on': 'フラッシュを切る',
  'camera.flash.off': 'フラッシュを点ける',
  'camera.flash.label': 'フラッシュ',
  'camera.flip.a11y': 'カメラを切り替え',
  'camera.flip.label': '反転',
  'camera.settings.a11y': '設定を開く',
  'camera.settings.label': '設定',

  /* ---------------- ③ 下部コントロール ---------------- */
  'camera.preset.head': 'プリセット PRESET',
  'camera.preset.a11y': '現在のプリセット {name}、タップで切り替え',
  'camera.preset.hint': '{index}/{total} · タップで切り替え',
  'camera.frame.hint': 'スワイプでフレーム変更',
  'camera.frame.label': 'フレーム',
  'camera.frame.next': '次のフレーム',
  'camera.frame.prev': '前のフレーム',
  'camera.frame.switcher': 'フレーム切り替え',
  'camera.frame.switcherHint': '左右にスワイプしてフレームを切り替え',
  'camera.shutter.a11y': '撮影',
  'camera.shutter.busy': '現像中',

  /* ---------------- フィルムライブラリ（ファインダー下のフィルム名を長押しで開く） ---------------- */
  // パネル見出しは印刷された英語のプレート。LCD の文字と同じく翻訳せず、5言語で同じ表記。
  'film.drawer.title': 'SELECT FILM STOCK',
  'film.drawer.a11y': 'フィルムライブラリ、フィルムプリセットを選択',
  'film.drawer.close': '完了',
  'film.drawer.hint': 'ファインダー下のフィルム名を長押ししても開けます',
  'film.card.a11y': '{name}、{description}',
  'film.card.selected': '選択中',

  /* ---------------- フレーム名（上部バーの小さい文字） ----------------
     名前は短く。日本語は特に長くなりやすいので 2〜5 文字に抑えています。 */
  'frame.polaroid600': 'インスタント',
  'frame.instaxMini': 'ミニ',
  'frame.neg135': '135',
  'frame.slideMount': 'スライド',
  'frame.badge.a11y': 'フレーム {name}、{count} 枚目',

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
  'gallery.cancel': 'キャンセル',
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
  'develop.stage.capturing': '露光・現像中',
  'develop.stage.normalizing': 'フィルムを準備中',
  'develop.stage.saving': 'アルバムに保存中',
  'develop.tapToContinue': '画面をタップして撮影を続ける',

  /* ---------------- エラー文案 ---------------- */
  'error.noPhoto': 'カメラが写真を返しませんでした。もう一度お試しください。',
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
  'settings.watermark.a11y': '透かしのレイアウト：{label}',
  'settings.watermark.split': '地名は左・日付は右',
  'settings.watermark.stacked': '地名は上・日付は下',
  'settings.watermark.centered': '一行に結合・中央揃え',
  'settings.watermark.dateOnly': '日付のみ',

  /* ---------------- 位置情報 ---------------- */
  'location.denied':
    '位置情報の権限が拒否されました。システム設定 → プライバシーとセキュリティ → 位置情報サービス で許可してください。',
  'location.failed': '位置情報を取得できません',
  'location.locating': '位置情報を取得中',
  'location.servicesOff': 'システムの「位置情報サービス」がオフになっています。',
};
