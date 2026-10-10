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
  'camera.torch.on': 'ライトを消す',
  'camera.torch.off': 'ライトを点ける',
  'camera.torch.label': 'ライト',
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
  'camera.shutter.a11y': '撮影',
  'camera.shutter.busy': '現像中',

  /* ---------------- フレーム名（上部バーの小さい文字） ----------------
     名前は短く。日本語は特に長くなりやすいので 2〜5 文字に抑えています。 */
  'frame.classicWhite': 'ファイバー',
  'frame.instant': 'ポラロイド',
  'frame.film35': '35mm',
  'frame.darkroom': '暗室',
  'frame.slideMount': 'スライド',
  'frame.orangeBase': 'ネガ',
  'frame.cropMarks': '校正刷り',
  'frame.archiveCard': '台帳',

  /* ---------------- ② ファインダー右端のズームレール ---------------- */
  'zoom.a11y': 'ズーム {percent}%、上下にドラッグして調整',
  'zoom.label': 'ズーム',

  /* ---------------- ③.5 粒子の強さ ---------------- */
  'grain.a11y': '粒子の強さ {label}',
  'grain.label': '粒子 GRAIN',
  'grain.level.off': 'なし',
  'grain.level.light': '弱',
  'grain.level.std': '標準',
  'grain.level.heavy': '強',
  'grain.level.max': '最強',

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
    '何度も失敗する場合：アプリを完全に終了して開き直してください。ケーブルで PC につないで開発中なら npx expo start --tunnel を試してください。',
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
  'settings.subtitle': 'SETTINGS',
  'settings.title': '設定',

  /* ---------------- 位置情報 ---------------- */
  'location.denied':
    '位置情報の権限が拒否されました。システム設定 → プライバシーとセキュリティ → 位置情報サービス で許可してください。',
  'location.failed': '位置情報を取得できません',
  'location.locating': '位置情報を取得中',
  'location.servicesOff': 'システムの「位置情報サービス」がオフになっています。',
};
