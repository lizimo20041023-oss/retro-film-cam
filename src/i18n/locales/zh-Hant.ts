/**
 * 繁體中文。
 *
 * 键名不能改、不能少 —— 母本在 `zh-Hans.ts`，改完跑 `npm run typecheck` 会校验完整性。
 */
import type { Messages } from '../types';

export const zhHant: Messages = {
  /* ---------------- 通用 ---------------- */
  'common.unknownError': '未知錯誤',

  /* ---------------- ① 頂部操作列 ---------------- */
  'camera.flash.on': '關閉閃光燈',
  'camera.flash.off': '打開閃光燈',
  'camera.flash.label': '閃光燈',
  'camera.flip.a11y': '切換前後鏡頭',
  'camera.flip.label': '翻轉',
  'camera.settings.a11y': '打開設定',
  'camera.settings.label': '設定',

  /* ---------------- ③ 底部主控 ---------------- */
  'camera.preset.head': '預設 PRESET',
  'camera.preset.a11y': '目前預設 {name}，輕觸切換',
  'camera.preset.hint': '{index}/{total} · 輕觸切換',
  'camera.frame.hint': '滑動觀景窗',
  'camera.frame.label': '相框',
  'camera.frame.next': '下一個相框',
  'camera.frame.prev': '上一個相框',
  'camera.frame.switcher': '相框切換',
  'camera.frame.switcherHint': '左右滑動切換相框',
  'camera.shutter.a11y': '拍照',
  'camera.shutter.busy': '正在顯影',

  /* ---------------- 底片庫（長按觀景窗下方的底片名打開） ---------------- */
  // 面板標題是印上去的英文標牌，和 LCD 上的字一樣不翻譯，五種語言共用同一串。
  'film.drawer.title': 'SELECT FILM STOCK',
  'film.drawer.a11y': '底片庫，選擇底片預設',
  'film.drawer.close': '完成',
  'film.drawer.hint': '長按觀景窗下方的底片名稱也可以打開這裡',
  'film.card.a11y': '{name}，{description}',
  'film.card.selected': '已選擇',

  /* ---------------- 相框名（頂列那行小字裡顯示） ---------------- */
  'frame.polaroid600': '一次成像',
  'frame.instaxMini': '迷你畫幅',
  'frame.neg135': '135 負片',
  'frame.slideMount': '幻燈裝裱',
  'frame.badge.a11y': '畫幅 {name}，第 {count} 張',

  /* ---------------- ② 取景器右緣的變焦軌道 ---------------- */
  'zoom.a11y': '變焦 {percent}%，左右輕點切換檔位',
  'zoom.label': '變焦',
  'zoom.role.ultraWide': '超廣角',
  'zoom.role.wide': '標準',
  'zoom.role.tele': '長焦',
  'zoom.stop.a11y': '切換到 {label}',
  'zoom.stop.digital': '數位變焦',
  'camera.gallery.a11y': '打開 App 相簿',
  'camera.gallery.label': '相簿',
  'gallery.title': '相簿',
  'gallery.close': '完成',
  'gallery.empty': '還沒有照片',
  'gallery.emptyHint': '拍一張就會出現在這裡，不用再去系統相簿找。',
  'gallery.photo': '第 {index} 張，{date}',
  'gallery.delete': '刪除這張',
  'gallery.cancel': '取消',
  'gallery.lightbox.a11y': '第 {index} 張，點擊關閉',
  'gallery.share': '分享',
  'gallery.shareFailed': '分享失敗：{message}',
  'gallery.saved': '已存到「{album}」',
  // 系統相簿名：五種語言共用同一串，使用者要在「照片」裡認出是同一個相簿。
  'album.name': 'RETRO CAM',
  'camera.focus.a11y': '點擊畫面手動對焦',

  /* ---------------- ③.5 顆粒強度 ---------------- */
  'grain.a11y': '顆粒強度 {label}',
  'grain.label': '顆粒 GRAIN',
  'grain.level.off': '關',
  'grain.level.light': '輕',
  'grain.level.std': '標準',
  'grain.level.heavy': '重',
  'grain.level.max': '極重',
  'grain.note': '在底片自帶的顆粒上再乘一檔濃淡。',

  /* ---------------- ④ LCD 狀態列 ---------------- */
  'lcd.date.off': '日期 已關閉',
  'lcd.date.on': '日期 {format} · 錨點 {anchor}',
  'lcd.font.custom': '自訂',
  'lcd.font.mono': '等寬',
  // 定位的兩個短句只在 LCD 上用（LCD 是單行等寬小字，長句會被截掉）
  'lcd.location.denied': '定位 未授權',
  'lcd.location.off': '定位 已關閉',
  'lcd.location.on': '定位 {value}',
  'lcd.location.servicesOff': '定位 系統未開啟',
  'lcd.params': '顆粒 {code} {grain} · 暗角 {vignette} · 漏光 {leak} · 字體 {font}',

  /* ---------------- 儲存失敗橫幅 ---------------- */
  'banner.dismiss': '知道了',
  'banner.openSettings': '去設定',

  /* ---------------- 權限 / 異常提示 ---------------- */
  'perm.camera.allow': '允許使用相機',
  'perm.camera.hint':
    'iOS：設定 → 隱私權與安全性 → 相機；Android：設定 → 應用程式 → 權限。授權後回到 App 點「重新檢測」。',
  'perm.camera.message': 'App 只在本地取景和合成，不會上傳任何照片。',
  'perm.camera.openSettings': '去系統設定',
  'perm.camera.recheck': '重新檢測',
  'perm.camera.title': '需要相機權限',
  'perm.mount.hint':
    '如果一直失敗：把 App 徹底關掉（往上滑掉）再重新打開；還是不行就重開手機。相機被別的 App 佔用（正在錄影、視訊通話）也會起不來。',
  'perm.mount.retry': '重試',
  'perm.mount.title': '相機啟動失敗',

  /* ---------------- 顯影遮罩 ---------------- */
  'develop.done.saved': '已存入相簿',
  'develop.done.unsaved': '成片已產生（未存相簿）',
  'develop.error.title': '顯影失敗',
  'develop.stage.capturing': '正在曝光顯影',
  'develop.stage.normalizing': '正在整理底片',
  'develop.stage.saving': '正在存入相簿',
  'develop.tapToContinue': '輕觸畫面繼續拍攝',

  /* ---------------- 錯誤 / 失敗文案 ---------------- */
  'error.noPhoto': '相機沒有回傳照片，請重試。',
  'save.denied.retry': '沒有相簿寫入權限，請再點一次儲存，並在彈窗裡選「允許」。',
  'save.denied.settings':
    '相簿權限被拒絕且不再詢問，請到 系統設定 → 隱私權與安全性 → 照片 裡打開權限。',
  'save.unsupported': '目前的 expo-media-library 版本沒有可用的儲存介面，請升級 Expo SDK。',

  /* ---------------- 設定介面 ---------------- */
  'settings.close': '完成',
  'settings.footer': '改完立刻生效，並且會記住 —— 下次打開還是這個設定。',
  'settings.grain.title': '顆粒',
  'settings.grain.a11y': '顆粒強度，目前 {level}',
  'settings.language.head': '語言 LANGUAGE',
  'settings.language.system': '跟隨系統',
  'settings.location.head': '定位浮水印 LOCATION',
  'settings.location.hint':
    '開啟後，成片左下角會多燒一行定位小字（紙白色，和右下角橘色日期同一條基線）。座標是純離線算出來的；地名要用系統的反查服務（iOS 走蘋果、Android 走谷歌），那一步會連網 —— 但位置只寫進你這張照片，App 自己不上傳任何東西。',
  'settings.location.off': '關閉',
  'settings.location.place': '地名',
  'settings.location.coords': '座標',
  'settings.locationMode.a11y': '定位浮水印：{label}',
  'settings.locale.a11y': '介面語言：{label}',
  'settings.placeDetail.title': '地名詳細度',
  'settings.placeDetail.a11y': '地名詳細度：{label}',
  'settings.placeDetail.archive': '精簡（城市 · 代碼）',
  'settings.placeDetail.full': '完整（行政全稱）',
  'settings.placeDetail.note': '港澳台會帶上「中國」前綴。',
  'settings.subtitle': 'SETTINGS',
  'settings.title': '設定',
  'settings.watermark.title': '水印版式',
  'settings.watermark.a11y': '水印版式：{label}',
  'settings.watermark.split': '地名在左 · 日期在右',
  'settings.watermark.stacked': '地名在上 · 日期在下',
  'settings.watermark.centered': '合成一行 · 置中',
  'settings.watermark.dateOnly': '只打日期',

  /* ---------------- 定位 ---------------- */
  'location.denied': '定位權限被拒絕，請到 系統設定 → 隱私權與安全性 → 定位服務 裡打開。',
  'location.failed': '定位失敗',
  'location.locating': '正在定位',
  'location.servicesOff': '系統的「定位服務」總開關沒有打開。',
};
