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
  'camera.torch.on': 'Turn the light off',
  'camera.torch.off': 'Turn the light on',
  'camera.torch.label': 'LIGHT',
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

  /* ---------------- frame names (shown in the top bar) ----------------
     Keep these short: the top bar is a single line of 10pt mono,
     and a long frame name pushes the preset name off the right edge. */
  'frame.classicWhite': 'FIBRE',
  'frame.instant': 'INSTANT',
  'frame.film35': '35mm',
  'frame.darkroom': 'DARKROOM',
  'frame.slideMount': 'SLIDE',
  'frame.orangeBase': 'NEGATIVE',
  'frame.cropMarks': 'PROOF',
  'frame.archiveCard': 'ARCHIVE',

  /* ---------------- ② zoom rail on the viewfinder ---------------- */
  'zoom.a11y': 'Zoom {percent} percent, drag up or down to adjust',
  'zoom.label': 'ZOOM',

  /* ---------------- ③.5 grain ---------------- */
  'grain.a11y': 'Grain strength {label}',
  'grain.label': 'GRAIN',
  'grain.level.off': 'Off',
  'grain.level.light': 'Light',
  'grain.level.std': 'Standard',
  'grain.level.heavy': 'Heavy',
  'grain.level.max': 'Extreme',

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
  'settings.subtitle': 'SETTINGS',
  'settings.title': 'Settings',

  /* ---------------- location ---------------- */
  'location.denied':
    'Location permission was denied. Open Settings → Privacy & Security → Location Services and allow it.',
  'location.failed': 'Location unavailable',
  'location.locating': 'Locating',
  'location.servicesOff': 'System Location Services is turned off.',
};
