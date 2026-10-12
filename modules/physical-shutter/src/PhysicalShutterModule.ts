import { requireOptionalNativeModule } from 'expo';

/**
 * Name of the single event this module emits.
 *
 * Must stay in sync with `physicalShutterEventName` in
 * `modules/physical-shutter/ios/PhysicalShutterModule.swift`, where it is
 * declared to Expo through `Events(_:)`.
 */
export const PHYSICAL_SHUTTER_EVENT = 'onPhysicalShutterPress';

export type PhysicalShutterEventName = typeof PHYSICAL_SHUTTER_EVENT;

/**
 * Which moment of a physical press an event describes.
 *
 * `began` is the press down, `ended` is the release — Apple documents that as the
 * capture moment — and `cancelled` means the system stopped delivering capture
 * events (the app left the foreground, or the camera went away).
 */
export type PhysicalShutterPhase = 'began' | 'ended' | 'cancelled' | 'unknown';

export type PhysicalShutterPressEvent = {
  /**
   * `ProcessInfo.systemUptime` in milliseconds. Monotonic, so it never repeats
   * and never jumps when the device clock changes; the hook uses it to drop a
   * duplicate delivery of the same press.
   */
  timestamp: number;
  phase: PhysicalShutterPhase;
};

export type PhysicalShutterSubscription = {
  remove(): void;
};

/**
 * The subset of the native module surface this app uses.
 *
 * Written as a plain structural type instead of `NativeModule<TEventsMap>` from
 * `expo-modules-core`, because that alias is
 * `typeof ExpoGlobal.NativeModule<TEventsMap>`
 * (`expo-modules-core/build/NativeModule.d.ts:3`) and its generic parameter is not
 * threaded through to the members, so it does not narrow the event payload. The
 * shape below is exactly what the native module hands back at runtime — the
 * Android/iOS module object extends `EventEmitter`
 * (`expo-modules-core/build/ts-declarations/NativeModule.d.ts:5`).
 *
 * There is deliberately no `source` field: `AVCaptureEvent` exposes only `phase`,
 * `shouldPlaySound` and `play(_:)`, so the Camera Control button cannot be told
 * apart from a volume button.
 */
export type PhysicalShutterNativeModule = {
  /** False on iOS below 17.2, where no public API exposes the hardware buttons. */
  readonly isSupported: boolean;
  addListener(
    eventName: PhysicalShutterEventName,
    listener: (event: PhysicalShutterPressEvent) => void
  ): PhysicalShutterSubscription;
};

/**
 * `null` on Android, on web, on an iOS build that predates this module, and on
 * iOS below 17.2.
 *
 * `requireOptionalNativeModule` returns `null` rather than throwing
 * (`expo-modules-core/src/requireNativeModule.ts:32`), and even swallows lookup
 * errors; that is what lets the hook below degrade to a no-op instead of taking
 * the camera screen down with it.
 */
const PhysicalShutter = requireOptionalNativeModule<PhysicalShutterNativeModule>('PhysicalShutter');

export default PhysicalShutter;
