/**
 * English.
 *
 * Do NOT rename or drop keys — the source of truth is `zh-Hans.ts`;
 * run `npm run typecheck` and it will tell you exactly what is missing.
 */
import type { Messages } from '../types';

export const en: Messages = {
  /* ---------------- generic ---------------- */
  'common.unknownError': 'Unknown error',

  /* ---------------- ① top bar ---------------- */
  'camera.flash.label': 'FLASH',
  // State descriptions (not actions): the same string is both the button's a11y
  // label and the transient hint over the viewfinder — the two must never drift.
  'camera.flash.state.off': 'Flash · Off',
  'camera.flash.state.on': 'Flash · On',
  'camera.flash.state.auto': 'Flash · Auto',
  'camera.flip.a11y': 'Switch between front and back camera',
  'camera.flip.label': 'FLIP',
  'camera.settings.a11y': 'Open settings',
  'camera.settings.label': 'SET',

  /* ---------------- ③ dashboard ---------------- */
  'camera.preset.head': 'PRESET',
  'camera.preset.a11y': 'Current preset {name}, tap to switch',
  'camera.preset.hint': '{index}/{total} · switch',
  'camera.frame.hint': 'Swipe the viewfinder',
  'camera.frame.label': 'FRAME',
  'camera.frame.next': 'Next frame',
  'camera.frame.prev': 'Previous frame',
  'camera.frame.switcher': 'Frame switcher',
  'camera.frame.switcherHint': 'Swipe left or right to change the frame',
  'camera.shutter.a11y': 'Take a photo',
  'camera.shutter.busy': 'Developing',

  /* ---------------- film library (the reel button at the bottom right) ---------------- */
  // The panel heading = the printed English plate (never translated) + a word in
  // the current language, separated by ' · '. The plate is engraved on the body;
  // the word after it is what actually tells the photographer where they are.
  'film.drawer.title': 'SELECT FILM STOCK · FILM LIBRARY',
  'film.drawer.a11y': 'Film library, choose a film preset',
  'film.drawer.close': 'Done',
  'film.drawer.hint': 'Tap a film to choose it · the reel button at the bottom right switches anytime',
  'film.card.a11y': '{name}, {description}',
  'film.card.selected': 'Selected',

  /* ---------------- frame names (shown in the top bar) ----------------
     Keep these short: the top bar is a single line of 10pt mono,
     and a long frame name pushes the preset name off the right edge. */
  'frame.polaroid600': 'INSTANT',
  'frame.instaxMini': 'MINI',
  'frame.neg135': '135',
  'frame.slideMount': 'SLIDE',
  'frame.badge.a11y': 'Frame {name}, photo {count}',
  'frame.variant.a11y': 'Frame style {name}',
  'drawer.frame.title': 'Frame',
  'drawer.frame.hint': 'Swipe to change the style',

  /* ---------------- ② zoom rail on the viewfinder ---------------- */
  'zoom.a11y': 'Zoom {percent} percent, tap a stop to switch',
  'zoom.label': 'ZOOM',
  'zoom.role.ultraWide': 'ultra wide',
  'zoom.role.wide': 'standard',
  'zoom.role.tele': 'telephoto',
  'zoom.stop.a11y': 'Switch to {label}',
  'zoom.stop.digital': 'digital zoom',
  'camera.gallery.a11y': 'Open the in-app album',
  'camera.gallery.label': 'ALBUM',
  'gallery.title': 'ALBUM',
  'gallery.close': 'Done',
  'gallery.empty': 'No photos yet',
  'gallery.emptyHint': 'Anything you shoot shows up here — no need to open Photos.',
  'gallery.photo': 'Photo {index}, {date}',
  'gallery.delete': 'Delete this photo',
  'gallery.cancel': 'Cancel',
  'gallery.lightbox.a11y': 'Photo {index}, tap to close',
  'gallery.share': 'Share',
  'gallery.shareFailed': 'Share failed: {message}',
  'gallery.saved': 'Saved to "{album}"',
  // The album name is the same string in all five locales: the user has to
  // recognise one and the same album in the Photos app.
  'album.name': 'RETRO CAM',
  'camera.focus.a11y': 'Tap the frame to focus',

  /* ---------------- ③.5 grain ---------------- */
  'grain.a11y': 'Grain strength {label}',
  'grain.label': 'GRAIN',
  'grain.level.off': 'Off',
  'grain.level.light': 'Light',
  'grain.level.std': 'Standard',
  'grain.level.heavy': 'Heavy',
  'grain.level.max': 'Extreme',
  'grain.note': 'Adds one more step of density on top of the grain the film already has.',

  /* ---------------- ④ LCD ---------------- */
  'lcd.date.off': 'DATE · OFF',
  'lcd.date.on': 'DATE {format} · ANCHOR {anchor}',
  'lcd.font.custom': 'custom',
  'lcd.font.mono': 'mono',
  // The two short ones are for the LCD only — it is one line of mono text,
  // so a full sentence such as the one in the settings screen gets clipped.
  'lcd.location.denied': 'LOCATION · DENIED',
  'lcd.location.off': 'LOCATION · OFF',
  'lcd.location.on': 'LOCATION {value}',
  'lcd.location.servicesOff': 'LOCATION · SYS OFF',
  'lcd.params': 'GRAIN {code} {grain} · VIGNETTE {vignette} · LEAK {leak} · FONT {font}',

  /* ---------------- save banner ---------------- */
  'banner.dismiss': 'Got it',
  'banner.openSettings': 'Open Settings',

  /* ---------------- permissions ---------------- */
  'perm.camera.allow': 'Allow camera access',
  'perm.camera.hint':
    'iOS: Settings → Privacy & Security → Camera. Android: Settings → Apps → Permissions. After granting, come back and tap "Check again".',
  'perm.camera.message':
    'This app only frames and develops photos on your device. Nothing is ever uploaded.',
  'perm.camera.openSettings': 'Open system settings',
  'perm.camera.recheck': 'Check again',
  'perm.camera.title': 'Camera access needed',
  'perm.mount.hint':
    'If it keeps failing: force-quit the app (swipe it away) and open it again; if that does not help, restart the phone. Another app holding the camera (recording or on a video call) can block it too.',
  'perm.mount.retry': 'Retry',
  'perm.mount.title': 'Camera failed to start',

  /* ---------------- develop overlay ---------------- */
  'develop.done.saved': 'Saved to your album',
  'develop.done.unsaved': 'Developed (not saved)',
  'develop.error.title': 'Development failed',
  'develop.queue.count': 'Queue {count}',
  'develop.stage.capturing': 'Exposing and developing',
  'develop.stage.normalizing': 'Preparing the negative',
  'develop.stage.saving': 'Saving to your album',
  'develop.tapToContinue': 'Tap the screen to keep shooting',

  /* ---------------- errors ---------------- */
  'error.noPhoto': 'The camera did not return a photo. Please try again.',
  'save.denied.retry': 'No permission to write to your album. Tap save again and choose "Allow".',
  'save.denied.settings':
    'Album access was denied for good. Open Settings → Privacy & Security → Photos and allow it.',
  'save.unsupported':
    'This version of expo-media-library has no save API. Please upgrade the Expo SDK.',

  /* ---------------- settings screen ---------------- */
  'settings.close': 'Done',
  'settings.footer': 'Changes apply right away and are remembered next time you open the app.',
  'settings.grain.title': 'Grain',
  'settings.grain.a11y': 'Grain strength, currently {level}',
  'settings.language.head': 'LANGUAGE',
  'settings.language.system': 'Follow system',
  'settings.location.head': 'LOCATION STAMP',
  'settings.location.hint':
    'When on, one extra line of location text is burned into the bottom-left of the photo (paper white, on the same baseline as the amber date on the right). Coordinates are computed entirely offline; place names go through the system reverse geocoder (Apple on iOS, Google on Android) and only that step uses the network — the location is written into your photo only, and the app itself never uploads anything.',
  'settings.location.off': 'Off',
  'settings.location.place': 'Place name',
  'settings.location.coords': 'Coordinates',
  'settings.locationMode.a11y': 'Location stamp: {label}',
  'settings.locale.a11y': 'Language: {label}',
  'settings.placeDetail.title': 'Place detail',
  'settings.placeDetail.a11y': 'Place detail: {label}',
  'settings.placeDetail.archive': 'Compact (city · code)',
  'settings.placeDetail.full': 'Full (administrative)',
  'settings.placeDetail.note': 'Taiwan, Hong Kong and Macau are prefixed with “China”.',
  'settings.subtitle': 'SETTINGS',
  'settings.title': 'Settings',
  'settings.watermark.title': 'Watermark layout',
  'settings.quality.title': 'Image quality',
  'settings.quality.a11y': 'Image quality: {label}',
  'settings.quality.standard': 'Standard',
  'settings.quality.high': 'High',
  'settings.quality.max': 'Maximum',
  'settings.quality.note':
    'Sets the long edge of the final print. Bigger is sharper, and costs more memory.',
  'settings.quality.capNote':
    'Long edge {longEdge}px. A true 48MP capture needs a native camera module — this setting only sets the print size.',

  'settings.watermark.a11y': 'Watermark layout: {label}',
  'settings.watermark.split': 'Place left · date right',
  'settings.watermark.stacked': 'Place above · date below',
  'settings.watermark.centered': 'One line · centred',
  'settings.watermark.dateOnly': 'Date only',

  'settings.watermarkZone': 'Watermark vertical position',
  'settings.watermarkZone.a11y': 'Watermark vertical position: {label}',
  'settings.watermarkZone.auto': 'Follow frame',
  'settings.watermarkZone.paper': 'On the paper margin',
  'settings.watermarkZone.photoTop': 'Top of the image',
  'settings.watermarkZone.photoBottom': 'Bottom of the image',
  'settings.watermarkAlign': 'Watermark alignment',
  'settings.watermarkAlign.a11y': 'Watermark alignment: {label}',
  'settings.watermarkAlign.auto': 'Follow layout',
  'settings.watermarkAlign.left': 'Left',
  'settings.watermarkAlign.center': 'Centre',
  'settings.watermarkAlign.right': 'Right',
  'settings.adaptiveGrade': 'Scene-adaptive grade',
  'settings.adaptiveGrade.a11y': 'Scene-adaptive grade: {label}',
  'settings.adaptiveGrade.on': 'On',
  'settings.adaptiveGrade.off': 'Off',
  'settings.adaptiveGrade.hint':
    'Fine-tunes the development from the shot’s brightness, contrast and colour cast. Turn it off to always use the preset’s default grade.',

  /* ---------------- location ---------------- */
  'location.denied':
    'Location permission was denied. Open Settings → Privacy & Security → Location Services and allow it.',
  'location.failed': 'Location unavailable',
  'location.locating': 'Locating',
  'location.servicesOff': 'System Location Services is turned off.',
  /* ---------------- importing from the photo library ---------------- */
  'gallery.import': 'Import',
  'gallery.import.a11y': 'Import photos from the library and re-develop them',
  'gallery.import.busy': 'Developing…',
  'gallery.import.denied':
    'No photo library access. Open Settings → Privacy & Security → Photos and allow it.',
  'gallery.import.failed': 'Import failed: {message}',
  'gallery.import.noExif': 'The original has no capture date, so it is dated today.',

  /* ---------------- negative strip ---------------- */
  'gallery.mode.strip': 'Strip',
  'gallery.mode.grid': 'Grid',
  'gallery.mode.a11y': 'Album view: {label}',
  'gallery.strip.count': '{count} frames',

  /* ---------------- strip export ---------------- */
  'gallery.export.entry': 'Export strip',
  'gallery.export.a11y': 'Join the {count} selected frames into one long poster',
  'gallery.export.hint': '{count} more to go',
  'gallery.export.busy': 'Joining…',
  'gallery.export.saved': 'Strip saved to album',
  'gallery.export.failed': 'Export failed: {message}',

  /* ---------------- deleting a frame ---------------- */
  'gallery.delete.a11y': 'Delete this frame',
  'gallery.delete.title': 'Delete this frame?',
  'gallery.delete.message': 'The local copy goes with it. This cannot be undone.',
  'gallery.delete.cancel': 'Cancel',
  'gallery.delete.confirm': 'Delete',
  'gallery.deleted': 'Deleted',

  // ---- v1.4.0：取景器极简重构新增 ----
  'settings.geoLocale.title': 'Place name language',
  'settings.geoLocale.a11y': 'Place name language, currently {label}',
  'settings.geoLocale.auto': 'Match interface',
  'settings.geoLocale.zhHans': '简体中文',
  'settings.geoLocale.zhHant': '繁體中文',
  'settings.geoLocale.ja': '日本語',
  'settings.geoLocale.en': 'English',
  'settings.geoLocale.note': 'Affects only the place name on the print, not the interface',
  'camera.bar.temp': 'Temp',
  'camera.bar.focal': 'Focal',
  'camera.bar.ev': 'EV',
  'camera.bar.temp.a11y': 'Color temperature, currently {label}. Hold and slide to adjust, tap to reset',
  'camera.bar.focal.a11y': 'Focal length {label}. Hold and slide to adjust, tap to open the stops',
  'camera.bar.ev.a11y': 'Exposure compensation {value}. Hold and slide to adjust, tap to reset',
  'camera.bar.ev.hint': 'Swipe up or down to adjust exposure',
  'camera.tool.import': 'Import',
  'camera.tool.double': 'Double',
  'camera.tool.timer': 'Timer',
  'camera.tool.flash': 'Flash',
  'camera.tool.flip': 'Flip',
  'camera.tool.preview': 'Preview',
  'camera.tool.preview.on': 'On',
  'camera.tool.preview.off': 'Off',
  'camera.tool.preview.a11y': 'Live frame preview, {state}',
  'camera.tool.double.on': 'Double exposure on',
  'camera.tool.double.hint': 'Press the shutter again to stack two frames',
  'camera.tool.timer.off': 'Off',
  'camera.tool.timer.3': '3 sec',
  'camera.tool.timer.10': '10 sec',
  'camera.timer.counting': 'Shooting in {seconds}s',
  'camera.focus.hint': 'Tap to focus',
  'camera.exposure.a11y': 'Exposure slider, swipe up or down',
  'camera.frame.slot2': 'Shoot the second frame',
  'frame.fp100c': 'Peel-apart',
  'camera.thumb.a11y': 'Open the album',
  /* ---------------- v1.8.0：相框改成三大暗房卡纸材质 ---------------- */
  'frame.variant.archival': 'Archival white',
  'frame.variant.baryta': 'Baryta warm',
  'frame.variant.obsidian': 'Obsidian black',
  /* ---------------- v1.8.1: borderless full-bleed capture (00 NO FRAME) ---------------- */
  'frame.noFrame': 'No frame',
  // Ratio digits only — see the zh-Hans section comment for why no "landscape/portrait"
  // wording is allowed here (the 3:2 slot is frozen to a 2:3 portrait canvas).
  'frame.noFrame.aspect11': 'Frame 1:1',
  'frame.noFrame.aspect34': 'Frame 3:4',
  'frame.noFrame.aspect32': 'Frame 3:2',
  'settings.noFrame.title': 'No-frame aspect',
  'settings.noFrame.a11y': 'No-frame aspect, currently {label}',
  'settings.noFrame.hint':
    'Used only while "No frame (00)" is selected: with no paper to fix the shape, the photo fills the canvas at this ratio. The 3:2 slot yields a 2:3 portrait canvas (taller than 3:4), not a landscape one — that value is frozen by this repo\u2019s gate scripts.',

  /* ---------------- v1.8.0：日期烙印引擎（13 格式 × 5 字形 × 8 机位 × 5 发光色） ---------------- */
  'settings.dateEngine.title': 'Date imprint',
  'settings.dateEngine.hint': 'Type is locked to a 1440px reference canvas, so its pixel height never drifts. Month and weekday stay in English, exactly as printed by a real camera back.',
  'settings.dateEngine.a11y.format': 'Date format, {label}',
  'settings.dateEngine.a11y.glyph': 'Date glyph, {label}',
  'settings.dateEngine.a11y.spot': 'Date position, {label}',
  'settings.dateEngine.a11y.glow': 'Date glow, {label}',
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
  'settings.dateEngine.format.OFF': 'Off',
  'settings.dateEngine.glyph.quartz_led': 'Quartz LED',
  'settings.dateEngine.glyph.ccd_osd': 'CCD OSD',
  'settings.dateEngine.glyph.lab_inkjet': 'Darkroom inkjet',
  'settings.dateEngine.glyph.archival_steel': 'Archival steel',
  'settings.section.dateFormat': 'DATE FORMAT',
  'settings.section.dateFont': 'STAMP FONT',
  'settings.section.datePos': 'STAMP POSITION',
  'settings.section.dateColor': 'LED COLOR',
  'settings.section.quality': 'RESOLUTION',
  'settings.section.grain': 'FILM GRAIN',
  'settings.dateEngine.spot.in_bl_v': 'In frame, lower left · vertical',
  'settings.dateEngine.spot.in_bl_h': 'In frame, lower left · horizontal',
  'settings.dateEngine.spot.in_br_h': 'In frame, lower right · horizontal',
  'settings.dateEngine.spot.in_br_v': 'In frame, lower right · vertical',
  'settings.dateEngine.spot.in_tr_v': 'In frame, upper right · vertical',
  'settings.dateEngine.spot.in_cb_h': 'In frame, bottom center',
  'settings.dateEngine.spot.strip_split': 'Paper margin · split',
  'settings.dateEngine.spot.strip_center': 'Paper margin · centered',
  'settings.dateEngine.glow.coral_red': 'Coral red',
  'settings.dateEngine.glow.classic_amber': 'Tungsten amber',
  'settings.dateEngine.glow.warm_gold': 'Champagne gold',
  'settings.dateEngine.glow.ccd_green': 'Y2K green',
  'settings.dateEngine.glow.cyber_cyan': 'Cyber cyan',
};
