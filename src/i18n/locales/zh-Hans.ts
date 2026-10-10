/**
 * 简体中文 —— **文案母本**。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 怎么改 / 怎么加一句话
 * ─────────────────────────────────────────────────────────────────────────
 * 1. 先在这个文件里改或加。**它是唯一的"键"来源** ——
 *    `MessageKey` 就是从这个对象的键推导出来的。
 * 2. 改完跑 `npm run typecheck`：另外 4 个语言文件少哪一句会立刻报错，
 *    不会出现"忘了翻译所以界面上是空白"这种线上事故。
 * 3. `{xxx}` 是占位符，由 `t('某个键', { xxx: '值' })` 填进去。
 *
 * ⚠️ 键名一律用 `区域.用途` 的英文小写写法，**不要**用中文当键名 ——
 *    键名是代码，改中文文案不该动代码。
 * ─────────────────────────────────────────────────────────────────────────
 */
export const zhHans = {
  /* ---------------- 通用 ---------------- */
  'common.unknownError': '未知错误',

  /* ---------------- ① 顶部操作栏（拨轮底下的蚀刻小字） ---------------- */
  'camera.torch.on': '关闭补光',
  'camera.torch.off': '打开补光',
  'camera.torch.label': '补光',
  'camera.flip.a11y': '切换前后摄像头',
  'camera.flip.label': '翻转',
  'camera.settings.a11y': '打开设置',
  'camera.settings.label': '设置',

  /* ---------------- ③ 底部主控 ---------------- */
  'camera.preset.head': '预设 PRESET',
  'camera.preset.a11y': '当前预设 {name}，轻触切换',
  'camera.preset.hint': '{index}/{total} · 轻触切换',
  'camera.frame.hint': '滑动取景器',
  'camera.frame.label': '相框',
  'camera.frame.next': '下一个相框',
  'camera.frame.prev': '上一个相框',
  'camera.frame.switcher': '相框切换',
  'camera.frame.switcherHint': '左右滑动切换相框',
  'camera.shutter.a11y': '拍照',
  'camera.shutter.busy': '正在显影',

  /* ---------------- 相框名（顶栏那行小字里显示） ----------------
     名字一律 2~5 个字：顶栏是单行等宽小字，名字长了会把右边的预设名挤掉。
     相框本身是 `src/constants/frames.ts` 里的数据，这里的键只负责"叫什么"。 */
  'frame.classicWhite': '纤维相纸',
  'frame.instant': '拍立得',
  'frame.film35': '35mm 片边',
  'frame.darkroom': '暗房放大',
  'frame.slideMount': '幻灯装裱',
  'frame.orangeBase': '负片片基',
  'frame.cropMarks': '打样张',
  'frame.archiveCard': '档案卡',

  /* ---------------- ② 取景器右缘的变焦轨道 ---------------- */
  'zoom.a11y': '变焦 {percent}%，上下拖动调整',
  'zoom.label': '变焦',

  /* ---------------- ③.5 颗粒强度 ---------------- */
  'grain.a11y': '颗粒强度 {label}',
  'grain.label': '颗粒 GRAIN',
  'grain.level.off': '关',
  'grain.level.light': '轻',
  'grain.level.std': '标准',
  'grain.level.heavy': '重',
  'grain.level.max': '极重',

  /* ---------------- ④ LCD 状态条 ---------------- */
  'lcd.date.off': '日期 已关闭',
  'lcd.date.on': '日期 {format} · 锚点 {anchor}',
  'lcd.font.custom': '自定义',
  'lcd.font.mono': '等宽',
  // 定位的两个"短句"只在 LCD 上用：LCD 是单行等宽小字，30 字会被截成
  // "定位权限被拒绝，请到 系统设…"。完整那句留给设置界面（有整行空间）。
  'lcd.location.denied': '定位 未授权',
  'lcd.location.off': '定位 已关闭',
  'lcd.location.on': '定位 {value}',
  'lcd.location.servicesOff': '定位 系统未开启',
  'lcd.params': '颗粒 {code} {grain} · 暗角 {vignette} · 漏光 {leak} · 字体 {font}',

  /* ---------------- 保存失败横幅 ---------------- */
  'banner.dismiss': '知道了',
  'banner.openSettings': '去设置',

  /* ---------------- 权限 / 异常提示 ---------------- */
  'perm.camera.allow': '允许使用相机',
  'perm.camera.hint':
    'iOS：设置 → 隐私与安全性 → 相机；Android：设置 → 应用 → 权限。授权后回到 App 点「重新检测」。',
  'perm.camera.message': 'App 只在本地取景和合成，不会上传任何照片。',
  'perm.camera.openSettings': '去系统设置',
  'perm.camera.recheck': '重新检测',
  'perm.camera.title': '需要相机权限',
  'perm.mount.hint': '如果一直失败：把 App 彻底关掉（上滑划掉）再重新打开；还不行就重启手机。相机被别的 App 占着（正在录像、视频通话）也会起不来。',
  'perm.mount.retry': '重试',
  'perm.mount.title': '相机启动失败',

  /* ---------------- 显影遮罩 ---------------- */
  'develop.done.saved': '已存入相册',
  'develop.done.unsaved': '成片已生成（未存相册）',
  'develop.error.title': '显影失败',
  'develop.stage.capturing': '正在曝光显影',
  'develop.stage.normalizing': '正在整理底片',
  'develop.stage.saving': '正在存入相册',
  'develop.tapToContinue': '轻触画面继续拍摄',

  /* ---------------- 错误 / 失败文案 ---------------- */
  'error.noPhoto': '相机没有返回照片，请重试。',
  'save.denied.retry': '没有相册写入权限，请再点一次保存，并在弹窗里选「允许」。',
  'save.denied.settings':
    '相册权限被拒绝且不再询问，请到 系统设置 → 隐私与安全性 → 照片 里打开权限。',
  'save.unsupported': '当前 expo-media-library 版本没有可用的保存接口，请升级 Expo SDK。',

  /* ---------------- 设置界面 ---------------- */
  'settings.close': '完成',
  'settings.footer': '改完立刻生效，并且会记住 —— 下次打开还是这个设置。',
  'settings.language.head': '语言 LANGUAGE',
  'settings.language.system': '跟随系统',
  'settings.location.head': '定位水印 LOCATION',
  'settings.location.hint':
    '开启后，成片左下角会多烧一行定位小字（纸白色，和右下角橙色日期同一条基线）。坐标是纯离线算出来的；地名要用系统的反查服务（iOS 走苹果、Android 走谷歌），那一步会联网 —— 但位置只写进你这张照片，App 自己不上传任何东西。',
  'settings.location.off': '关闭',
  'settings.location.place': '地名',
  'settings.location.coords': '坐标',
  'settings.locationMode.a11y': '定位水印：{label}',
  'settings.locale.a11y': '界面语言：{label}',
  'settings.subtitle': 'SETTINGS',
  'settings.title': '设置',

  /* ---------------- 定位 ---------------- */
  'location.denied': '定位权限被拒绝，请到 系统设置 → 隐私与安全性 → 定位服务 里打开。',
  'location.failed': '定位失败',
  'location.locating': '正在定位',
  'location.servicesOff': '系统的「定位服务」总开关没有打开。',
} as const;
