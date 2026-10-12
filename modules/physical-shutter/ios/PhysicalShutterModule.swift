import AVKit
import ExpoModulesCore
import UIKit

/// The single event this module emits. Declared to Expo through `Events(_:)` below
/// and mirrored by `PHYSICAL_SHUTTER_EVENT` on the JS side.
private let physicalShutterEventName = "onPhysicalShutterPress"

/// Hardware shutter release for the physical capture buttons: the iPhone 16
/// Camera Control button, and volume up / volume down on every device.
///
/// Backed by `AVCaptureEventInteraction` (AVKit, iOS 17.2+), which is the only
/// public API that delivers these presses to an app that is already running its
/// own capture session. Before 17.2 the only options are private APIs, so this
/// module deliberately does nothing there instead.
///
/// Every step is best-effort, because a failure at runtime must never reach the
/// camera screen: on iOS < 17.2, and whenever there is no window to attach to,
/// the module attaches nothing, emits nothing and throws nothing. JS sees `null`
/// or `isSupported == false` and simply stops listening.
public final class PhysicalShutterModule: Module {

  /// `addInteraction(_:)` does not retain the interaction, so we have to. Apple's
  /// own sample keeps it in a property for the same reason.
  ///
  /// The declared type is `UIInteraction` (iOS 11+) rather than
  /// `AVCaptureEventInteraction` on purpose: a stored property whose type only
  /// exists on iOS 17.2 would itself need an availability annotation, and this pod
  /// still supports iOS 16.4.
  private var interaction: UIInteraction?

  /// The exact view the interaction was added to, so `detach` removes it from the
  /// same one. Weak on purpose: the view outlives this module and we must not be
  /// the reason a window is kept alive.
  private weak var hostView: UIView?

  public func definition() -> ModuleDefinition {
    Name("PhysicalShutter")

    // iOS 16.4 - 17.1 have no public API for these buttons at all, so JS needs to
    // be able to tell "this device cannot" apart from "this is broken".
    Constant("isSupported") {
      PhysicalShutterModule.isSupported
    }

    Events(physicalShutterEventName)

    // Expo calls these when the first / last JS listener for the event is added /
    // removed. Tying the interaction to the listener lifetime is what keeps the
    // system's default button behaviour intact whenever nobody is listening, which
    // is exactly what Apple's "Important" note asks for.
    OnStartObserving(physicalShutterEventName) {
      self.attach()
    }

    OnStopObserving(physicalShutterEventName) {
      self.detach()
    }

    OnDestroy {
      self.detach()
    }
  }

  /// Whether the hardware-button API exists on the running system.
  private static var isSupported: Bool {
    if #available(iOS 17.2, *) {
      return true
    }
    return false
  }

  // MARK: - Lifecycle

  /// `AVCaptureEventInteraction` is `@MainActor`, so every UIKit touch has to
  /// happen on the main queue. The Expo callbacks above are not main-actor bound,
  /// hence the hop.
  private func attach() {
    DispatchQueue.main.async { [weak self] in
      self?.attachOnMainThread()
    }
  }

  private func detach() {
    DispatchQueue.main.async { [weak self] in
      self?.detachOnMainThread()
    }
  }

  private func attachOnMainThread() {
    // `OnStartObserving` can fire again if JS resubscribes. Never attach twice, or
    // the same press would be delivered twice.
    if interaction != nil {
      return
    }

    if #available(iOS 17.2, *) {
      // Bail out silently instead of crashing when there is nowhere to attach yet.
      guard let host = PhysicalShutterModule.captureHostView() else {
        return
      }

      // Trailing-closure spelling of the single-handler initializer. Apple names
      // this parameter `handler` on one documentation page and `eventHandler` on
      // another; the trailing-closure form omits the label and so compiles under
      // either name. Apple's own sample uses exactly this shape.
      let newInteraction = AVCaptureEventInteraction { [weak self] event in
        guard let self = self else {
          return
        }
        // `.began` is the press down, `.ended` the release (Apple's documented
        // capture moment) and `.cancelled` means capture became unavailable. All
        // three are forwarded and JS picks one, so changing which phase triggers
        // the shutter never needs a native rebuild.
        var phase = "unknown"
        if event.phase == .began {
          phase = "began"
        } else if event.phase == .ended {
          phase = "ended"
        } else if event.phase == .cancelled {
          phase = "cancelled"
        }
        self.emit(phase: phase)
      }
      newInteraction.isEnabled = true
      host.addInteraction(newInteraction)

      interaction = newInteraction
      hostView = host
    }
  }

  private func detachOnMainThread() {
    if let existing = interaction {
      // Removing the interaction is what restores the system's own volume-button
      // behaviour; an interaction attached to nothing is inert.
      hostView?.removeInteraction(existing)
    }
    interaction = nil
    hostView = nil
  }

  // MARK: - Emitting

  /// Forwards one press to JS.
  ///
  /// `timestamp` is `systemUptime` rather than `Date()`: it is monotonic, it never
  /// repeats, and it does not jump when the user changes the clock, which is what
  /// the JS side relies on to drop duplicate deliveries.
  private func emit(phase: String) {
    let timestamp = ProcessInfo.processInfo.systemUptime * 1000

    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        return
      }
      self.sendEvent(physicalShutterEventName, [
        "phase": phase,
        "timestamp": timestamp
      ])
    }
  }

  // MARK: - Host view

  /// The view the interaction is attached to.
  ///
  /// Apple's own sample does `view.addInteraction(interaction)` on its view
  /// controller's view, and this follows that: the root view controller's view is
  /// always in the window hierarchy and always on screen while the app is
  /// foregrounded.
  ///
  /// Attaching to a view that already exists also means zero effect on
  /// hit-testing. A subview vendored by this module would be hit-testable (only
  /// `alpha`, `isHidden` and `isUserInteractionEnabled` change that) and would sit
  /// on top of the camera UI, swallowing tap-to-focus, pinch-zoom and the shutter
  /// button.
  private static func captureHostView() -> UIView? {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .filter { $0.activationState == .foregroundActive }
      .flatMap { $0.windows }

    let window = windows.first(where: { $0.isKeyWindow }) ?? windows.first
    return window?.rootViewController?.view
  }
}
