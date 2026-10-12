Pod::Spec.new do |s|
  s.name           = 'ExpoPhysicalShutter'
  s.version        = '1.0.0'
  s.summary        = 'Physical capture buttons (Camera Control, volume up/down) as a shutter release.'
  s.description    = 'Local Expo module that exposes AVCaptureEventInteraction (AVKit, iOS 17.2+) as the onPhysicalShutterPress event. No-op on older systems.'
  s.author         = 'FretroCam'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = 'MIT'
  # Must match the app's deployment target (ExpoModulesCore declares 16.4); a
  # higher value here makes `pod install` fail with an incompatible-platform error.
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/expo/expo.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
