Pod::Spec.new do |s|
  s.name = 'FilmRenderer'
  s.version = '1.0.0'
  s.summary = 'Background native film pixel renderer'
  s.description = 'Native single-pass LUT, grain and highlight processing for FretroCam.'
  s.license = { :type => 'MIT' }
  s.author = 'FretroCam'
  s.homepage = 'https://github.com/lizimo20041023-oss/retro-film-cam'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.swift_version = '5.9'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_OPTIMIZATION_LEVEL' => '-O' }
end
