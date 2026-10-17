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
  'camera.flash.label': '闪光灯',
  // 三档状态的**状态描述**（不是动作描述）：同一个串既当按钮的无障碍标签，
  // 也当切换瞬间浮在取景器顶部的那句提示 —— 两处用词必须一致，否则用户听到的和看到的对不上。
  'camera.flash.state.off': '闪光灯 · 关闭',
  'camera.flash.state.on': '闪光灯 · 开启',
  'camera.flash.state.auto': '闪光灯 · 自动',
  'camera.flip.a11y': '切换前后摄像头',
  'camera.flip.label': '翻转',
  'camera.settings.a11y': '打开设置',
  'camera.settings.label': '设置',

  /* ---------------- ③ 底部主控 ---------------- */
  'camera.preset.head': '预设 PRESET',
  'camera.preset.a11y': '当前预设 {name}，轻触切换',
  'camera.preset.hint': '{index}/{total} · 切换',
  'camera.frame.hint': '滑动取景器',
  'camera.frame.label': '相框',
  'camera.frame.next': '下一个相框',
  'camera.frame.prev': '上一个相框',
  'camera.frame.switcher': '相框切换',
  'camera.frame.switcherHint': '左右滑动切换相框',
  'camera.shutter.a11y': '拍照',
  'camera.shutter.busy': '正在显影',

  /* ---------------- 胶卷库（点右下角那颗胶卷按钮打开） ---------------- */
  // 面板标题 = 印上去的英文标牌（永远不翻译）+ 一个本地语言的词，中间用 ' · ' 分开。
  // 牌子相当于机身刻字，后面那个词才是给人看的说明 —— 所以这一串不再跨语言相同。
  'film.drawer.title': 'SELECT FILM STOCK · 胶卷库',
  'film.drawer.a11y': '胶卷库，选择胶卷预设',
  'film.drawer.close': '完成',
  'film.drawer.hint': '轻触选择底片 · 点击右下角胶卷按钮可随时切换',
  'film.card.a11y': '{name}，{description}',
  'film.card.selected': '已选择',

  /* ---------------- 相框名（顶栏那行小字里显示） ----------------
     名字一律 2~5 个字：顶栏是单行等宽小字，名字长了会把右边的预设名挤掉。
     相框本身是 `src/constants/frames.ts` 里的数据，这里的键只负责"叫什么"。 */
  'frame.polaroid600': '一次成像',
  'frame.instaxMini': '迷你画幅',
  'frame.neg135': '135 负片',
  'frame.slideMount': '幻灯装裱',
  'frame.badge.a11y': '画幅 {name}，第 {count} 张',
  'frame.variant.a11y': '相框风格 {name}',
  'drawer.frame.title': '相框',
  'drawer.frame.hint': '左右滑动切换风格',

  /* ---------------- ② 变焦条 / 相册 / 手动对焦 ---------------- */
  'zoom.a11y': '变焦 {percent}%，左右轻点切换档位',
  'zoom.label': '变焦',
  'zoom.role.ultraWide': '超广角',
  'zoom.role.wide': '标准',
  'zoom.role.tele': '长焦',
  'zoom.stop.a11y': '切换到 {label}',
  'zoom.stop.digital': '数码变焦',
  'camera.gallery.a11y': '打开 App 相册',
  'camera.gallery.label': '相册',
  'gallery.title': '相册',
  'gallery.close': '完成',
  'gallery.empty': '还没有照片',
  'gallery.emptyHint': '拍一张就会出现在这里，不用再去系统相册找。',
  'gallery.photo': '第 {index} 张，{date}',
  'gallery.delete': '删除这张',
  'gallery.cancel': '取消',
  'gallery.lightbox.a11y': '第 {index} 张，点击关闭',
  'gallery.share': '分享',
  'gallery.shareFailed': '分享失败：{message}',
  'gallery.saved': '已存到「{album}」',
  // 系统相簿名：五种语言共用同一串，用户要在「照片」里认出是同一个相簿。
  'album.name': 'RETRO CAM',
  'camera.focus.a11y': '点击画面手动对焦',

  /* ---------------- ③.5 颗粒强度 ---------------- */
  'grain.a11y': '颗粒强度 {label}',
  'grain.label': '颗粒 GRAIN',
  'grain.level.off': '关',
  'grain.level.light': '轻',
  'grain.level.std': '标准',
  'grain.level.heavy': '重',
  'grain.level.max': '极重',
  'grain.note': '在胶卷自带的颗粒上再乘一档浓淡。',

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
  'settings.grain.title': '颗粒',
  'settings.grain.a11y': '颗粒强度，当前 {level}',
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
  'settings.placeDetail.title': '地名详细度',
  'settings.placeDetail.a11y': '地名详细度：{label}',
  'settings.placeDetail.archive': '精简（城市 · 代码）',
  'settings.placeDetail.full': '完整（行政全称）',
  'settings.placeDetail.note': '港澳台会带上「中国」前缀。',
  'settings.subtitle': 'SETTINGS',
  'settings.title': '设置',
  'settings.watermark.title': '水印版式',
  'settings.quality.title': '画质',
  'settings.quality.a11y': '画质：{label}',
  'settings.quality.standard': '标准',
  'settings.quality.high': '高清',
  'settings.quality.max': '极致',
  'settings.quality.note': '决定成片的长边像素。越大越清晰，冲印时也越吃内存。',
  'settings.quality.capNote':
    '最长边 {longEdge}px。真正的 48MP 需要原生相机模块 —— 这一档只决定成片尺寸。',

  'settings.watermark.a11y': '水印版式：{label}',
  'settings.watermark.split': '地名在左 · 日期在右',
  'settings.watermark.stacked': '地名在上 · 日期在下',
  'settings.watermark.centered': '合成一行 · 居中',
  'settings.watermark.dateOnly': '只打日期',

  /* ---------------- 定位 ---------------- */
  'location.denied': '定位权限被拒绝，请到 系统设置 → 隐私与安全性 → 定位服务 里打开。',
  'location.failed': '定位失败',
  'location.locating': '正在定位',
  'location.servicesOff': '系统的「定位服务」总开关没有打开。',
  /* ---------------- 相册导入（把系统相册里的老照片重新冲印） ---------------- */
  'gallery.import': '导入',
  'gallery.import.a11y': '从系统相册导入照片，重新冲印',
  'gallery.import.busy': '正在冲印…',
  'gallery.import.denied': '没有相册访问权限，请到 系统设置 → 隐私与安全性 → 照片 里打开。',
  'gallery.import.failed': '导入失败：{message}',
  'gallery.import.noExif': '原图没有拍摄时间，按今天冲印。',

  /* ---------------- 底片长卷（§9） ---------------- */
  'gallery.mode.strip': '长卷底片',
  'gallery.mode.grid': '经典大图',
  'gallery.mode.a11y': '相册浏览方式：{label}',
  'gallery.strip.count': '共 {count} 张',

  /* ---------------- 切片导出（§9.4） ---------------- */
  'gallery.export.entry': '导出切片',
  'gallery.export.a11y': '把选中的 {count} 张拼成一张长条海报',
  'gallery.export.hint': '再选 {count} 张',
  'gallery.export.busy': '正在拼合…',
  'gallery.export.saved': '切片已存入相簿',
  'gallery.export.failed': '导出失败：{message}',

  /* ---------------- 删除成片（§10.2） ---------------- */
  'gallery.delete.a11y': '删除这张成片',
  'gallery.delete.title': '删除这张成片？',
  'gallery.delete.message': '本地副本也会一起删掉，无法撤销。',
  'gallery.delete.cancel': '取消',
  'gallery.delete.confirm': '删除',
  'gallery.deleted': '已删除',

  // ---- v1.4.0：取景器极简重构新增 ----
  'settings.geoLocale.title': '地名语言',
  'settings.geoLocale.a11y': '地名语言，当前 {label}',
  'settings.geoLocale.auto': '跟随界面',
  'settings.geoLocale.zhHans': '简体中文',
  'settings.geoLocale.zhHant': '繁體中文',
  'settings.geoLocale.en': 'English',
  'settings.geoLocale.note': '只影响成片上那一行地名，和界面语言互不干扰',
  'camera.bar.temp': '色温',
  'camera.bar.focal': '焦段',
  'camera.bar.ev': '曝光',
  'camera.bar.temp.a11y': '色温，当前 {label}，长按滑动调整，轻点归零',
  'camera.bar.focal.a11y': '焦段 {label}，长按滑动调整，轻点展开档位',
  'camera.bar.ev.a11y': '曝光补偿 {value}，长按滑动调整，轻点归零',
  'camera.bar.ev.hint': '上下滑动调整曝光',
  'camera.tool.import': '导入',
  'camera.tool.double': '重曝',
  'camera.tool.timer': '定时',
  'camera.tool.flash': '闪光灯',
  'camera.tool.flip': '翻转',
  'camera.tool.preview': '预览',
  'camera.tool.preview.on': '开',
  'camera.tool.preview.off': '关',
  'camera.tool.preview.a11y': '相框实时预览，{state}',
  'camera.tool.double.on': '重曝已开',
  'camera.tool.double.hint': '再按一次快门，两张会叠在一起',
  'camera.tool.timer.off': '关',
  'camera.tool.timer.3': '3 秒',
  'camera.tool.timer.10': '10 秒',
  'camera.timer.counting': '{seconds} 秒后拍摄',
  'camera.focus.hint': '轻触对焦',
  'camera.exposure.a11y': '曝光滑块，上下滑动调整',
  'camera.frame.slot2': '拍第二格',
  'frame.fp100c': '撕拉片',
  'camera.thumb.a11y': '打开相册',
  /* ---------------- v1.8.0：相框改成三大暗房卡纸材质 ---------------- */
  'frame.variant.archival': '经典原白',
  'frame.variant.baryta': '岁月暖黄',
  'frame.variant.obsidian': '暗房雅黑',
  /* ---------------- v1.8.1：无相框纯净全屏（00 NO FRAME） ---------------- */
  'frame.noFrame': '无相框',
  // 三档画幅比的**结果**，不是名字：门禁把 `3:2` 那一档冻成了 `ratio = 2/3`
  // （2:3 竖幅，比 3:4 更高），所以标签只报比例数字、不写"横幅 / 竖幅"这种方向词
  // —— 写了就会和实际拿到的画布相反。取舍写在设置页那行 hint 里。
  'frame.noFrame.aspect11': '画幅 1:1',
  'frame.noFrame.aspect34': '画幅 3:4',
  'frame.noFrame.aspect32': '画幅 3:2',
  'settings.noFrame.title': '无相框画幅',
  'settings.noFrame.a11y': '无相框画幅，当前 {label}',
  'settings.noFrame.hint':
    '只在选中「无相框（00）」时起作用：没有纸面定比例，照片按这一档铺满整幅。3:2 一档拿到的是 2:3 竖幅（比 3:4 更高），不是横幅 —— 这个取值由仓库的门禁脚本冻结。',

  /* ---------------- v1.8.0：日期烙印引擎（13 格式 × 5 字形 × 8 机位 × 5 发光色） ---------------- */
  'settings.dateEngine.title': '日期烙印',
  'settings.dateEngine.hint': '字号按标准画布 1440px 等比锁定，成片上的像素高绝对恒定；英文月份与星期按机背原样雕刻。',
  'settings.dateEngine.a11y.format': '日期格式，当前 {label}',
  'settings.dateEngine.a11y.glyph': '日期字形，当前 {label}',
  'settings.dateEngine.a11y.spot': '日期机位，当前 {label}',
  'settings.dateEngine.a11y.glow': '日期发光色，当前 {label}',
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
  'settings.dateEngine.format.OFF': '关闭',
  'settings.dateEngine.glyph.quartz_led': '石英机背发光',
  'settings.dateEngine.glyph.ccd_osd': 'CCD 录制字幕',
  'settings.dateEngine.glyph.lab_inkjet': '暗房喷墨',
  'settings.dateEngine.glyph.archival_steel': '档案钢印',
  'settings.section.dateFormat': '日期格式 DATE FORMAT',
  'settings.section.dateFont': '日期字形 STAMP FONT',
  'settings.section.datePos': '日期位置 STAMP POSITION',
  'settings.section.dateColor': '日期色彩 LED COLOR',
  'settings.section.quality': '画质 RESOLUTION',
  'settings.section.grain': '颗粒 FILM GRAIN',
  'settings.dateEngine.spot.in_bl_v': '画内左下 · 竖排',
  'settings.dateEngine.spot.in_bl_h': '画内左下 · 横排',
  'settings.dateEngine.spot.in_br_h': '画内右下 · 横排',
  'settings.dateEngine.spot.in_br_v': '画内右下 · 竖排',
  'settings.dateEngine.spot.in_tr_v': '画内右上 · 竖排',
  'settings.dateEngine.spot.in_cb_h': '画面底部居中',
  'settings.dateEngine.spot.strip_split': '白边左右分列',
  'settings.dateEngine.spot.strip_center': '白边居中一体',
  'settings.dateEngine.glow.coral_red': '珊瑚暖红',
  'settings.dateEngine.glow.classic_amber': '钨丝琥珀',
  'settings.dateEngine.glow.warm_gold': '香槟金',
  'settings.dateEngine.glow.ccd_green': '千禧绿',
  'settings.dateEngine.glow.cyber_cyan': '赛博青',
} as const;
