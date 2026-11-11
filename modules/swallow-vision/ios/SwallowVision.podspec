Pod::Spec.new do |s|
  s.name = 'SwallowVision'
  s.version = '0.1.0'
  s.summary = 'On-device face landmarks and neck motion features'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Swallow Keeper'
  s.homepage = 'https://github.com/swallow-keeper/app'
  s.source = { :git => 'https://github.com/swallow-keeper/app.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.source_files = '*.{h,mm,swift}'
  s.public_header_files = 'SKMotionAnalyzer.h'
  s.resource_bundles = { 'SwallowVisionModels' => ['Resources/*.task'] }
  s.vendored_frameworks = File.exist?(File.join(__dir__, 'Frameworks/opencv2.xcframework')) ? 'Frameworks/opencv2.xcframework' : 'Frameworks/opencv2.framework'
  s.dependency 'ExpoModulesCore'
  s.dependency 'MediaPipeTasksVision', '0.10.21'
  s.frameworks = 'UIKit', 'Accelerate', 'AVFoundation', 'CoreMedia', 'CoreVideo'
  s.libraries = 'c++'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17' }
end
