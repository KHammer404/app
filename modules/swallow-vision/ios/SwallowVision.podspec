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
  # Headers only (OpenCV 4.5.3). MediaPipeTasksCommon already links that OpenCV
  # binary; vendoring opencv2.framework duplicates ObjC (Mat, Point, …).
  s.preserve_paths = 'Frameworks/opencv2.framework'
  s.dependency 'ExpoModulesCore'
  s.dependency 'MediaPipeTasksVision', '0.10.21'
  s.frameworks = 'UIKit', 'Accelerate', 'AVFoundation', 'CoreMedia', 'CoreVideo'
  s.libraries = 'c++'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'FRAMEWORK_SEARCH_PATHS' => '"${PODS_TARGET_SRCROOT}/Frameworks"',
    'HEADER_SEARCH_PATHS' => '"${PODS_TARGET_SRCROOT}/Frameworks/opencv2.framework/Headers"'
  }
end
