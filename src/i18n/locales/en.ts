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
  'camera.flash.on': 'Turn the flash off',
  'camera.flash.off': 'Turn the flash on',
  'camera.flash.label': 'FLASH',
  'camera.flip.a11y': 'Switch between front and back camera',
  'camera.flip.label': 'FLIP',
  'camera.settings.a11y': 'Open settings',
  'camera.settings.label': 'SET',

  /* ---------------- ③ dashboard ---------------- */
  'camera.preset.head': 'PRESET',
  'camera.preset.a11y': 'Current preset {name}, tap to switch',
  'camera.preset.hint': '{index}/{total} · tap to switch',
  'camera.frame.hint': 'Swipe the viewfinder',
  'camera.frame.label': 'FRAME',
  'camera.frame.next': 'Next frame',
  'camera.frame.prev': 'Previous frame',
  'camera.frame.switcher': 'Frame switcher',
  'camera.frame.switcherHint': 'Swipe left or right to change the frame',
  'camera.shutter.a11y': 'Take a photo',
  'camera.shutter.busy': 'Developing',

  /* ---------------- film library (long-press the film name under the viewfinder) ---------------- */
  // The panel heading is a printed English plate: like the LCD labels it stays
  // untranslated, and all five locales carry the identical string.
  'film.drawer.title': 'SELECT FILM STOCK',
  'film.drawer.a11y': 'Film library, choose a film preset',
  'film.drawer.close': 'Done',
  'film.drawer.hint': 'You can also long-press the film name under the viewfinder',
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
  'settings.watermark.a11y': 'Watermark layout: {label}',
  'settings.watermark.split': 'Place left · date right',
  'settings.watermark.stacked': 'Place above · date below',
  'settings.watermark.centered': 'One line · centred',
  'settings.watermark.dateOnly': 'Date only',

  /* ---------------- location ---------------- */
  'location.denied':
    'Location permission was denied. Open Settings → Privacy & Security → Location Services and allow it.',
  'location.failed': 'Location unavailable',
  'location.locating': 'Locating',
  'location.servicesOff': 'System Location Services is turned off.',
};
