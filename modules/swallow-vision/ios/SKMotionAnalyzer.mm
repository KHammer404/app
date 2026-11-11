// Keep C++ OpenCV imports ahead of Objective-C headers (the YES/NO macros clash).
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <opencv2/video/tracking.hpp>
#include <opencv2/imgcodecs/ios.h>
#import "SKMotionAnalyzer.h"

static cv::Vec4d Motion(const cv::Mat &before, const cv::Mat &after, cv::Rect box) {
  std::vector<cv::Point2f> points, destinations;
  for (int y = box.y + 2; y < box.y + box.height - 2; y += 4)
    for (int x = box.x + 2; x < box.x + box.width - 2; x += 4) points.emplace_back(x, y);
  if (points.size() < 3) return {0, 0, 0, 0};
  std::vector<uchar> status;
  std::vector<float> error;
  cv::calcOpticalFlowPyrLK(before, after, points, destinations, status, error,
    cv::Size(15, 15), 2, cv::TermCriteria(cv::TermCriteria::COUNT | cv::TermCriteria::EPS, 20, 0.03));
  cv::Vec3d sum(0, 0, 0);
  int count = 0;
  for (size_t i = 0; i < points.size(); i++) {
    if (!status[i] || error[i] >= 30 || !std::isfinite(destinations[i].x) || !std::isfinite(destinations[i].y)) continue;
    const auto delta = destinations[i] - points[i];
    sum += cv::Vec3d(delta.x, delta.y, std::hypot(delta.x, delta.y));
    count++;
  }
  return count < 3 ? cv::Vec4d(0, 0, 0, 0) : cv::Vec4d(sum[0] / count, sum[1] / count, sum[2] / count, double(count) / points.size());
}

@implementation SKMotionAnalyzer {
  cv::Mat _previous;
  double _lastTime;
}
- (void)reset { _previous.release(); _lastTime = 0; }
- (NSDictionary<NSString *, id> *)analyzeImage:(UIImage *)image
                                  landmarks:(NSArray<NSArray<NSNumber *> *> *)landmarks
                                  timestamp:(double)timestamp {
  auto result = ^NSDictionary *(NSString *status) { return @{ @"status": status, @"timestamp": @(timestamp) }; };
  if (landmarks.count < 455) { [self reset]; return result(@"lost"); }
  try {
    cv::Mat rgba, resized, gray;
    UIImageToMat(image, rgba, true);
    const int height = int(std::round(rgba.rows * 320.0 / rgba.cols));
    cv::resize(rgba, resized, cv::Size(320, height));
    cv::cvtColor(resized, gray, cv::COLOR_RGBA2GRAY);
    const auto x = [&](int index) { return landmarks[index][0].doubleValue * gray.cols; };
    const auto y = [&](int index) { return landmarks[index][1].doubleValue * gray.rows; };
    const double left = std::min(x(234), x(454)), right = std::max(x(234), x(454));
    const double top = y(10), chin = y(152), fw = right - left, fh = chin - top, center = (left + right) / 2;
    if (fw < 32 || fh < 32 || top < 1 || chin + fh * 0.6 >= height || left < 1 || right >= gray.cols - 1) { [self reset]; return result(@"lost"); }
    if (std::abs(x(1) - center) / fw > 0.22) { [self reset]; return result(@"turn"); }
    const double dt = (timestamp - _lastTime) / 1000;
    if (_previous.empty() || _previous.size() != gray.size() || dt <= 0 || dt > 0.4) {
      _previous = gray.clone(); _lastTime = timestamp;
      return result(@"warming");
    }
    auto box = [](double x0, double y0, double x1, double y1) {
      return cv::Rect(std::max(1, int(std::floor(x0))), std::max(1, int(std::floor(y0))),
        std::max(2, int(std::floor(x1 - x0))), std::max(2, int(std::floor(y1 - y0))));
    };
    const auto head = Motion(_previous, gray, box(left + fw * 0.15, top, right - fw * 0.15, top + fh * 0.35));
    const double neckTop = chin - fh * 0.04, neckHeight = fh * 0.64, scale = 1 / (fw * dt);
    cv::Vec4d bands[3];
    for (int i = 0; i < 3; i++) bands[i] = Motion(_previous, gray,
      box(center - fw * 0.28, neckTop + neckHeight * i / 3, center + fw * 0.28, neckTop + neckHeight * (i + 1) / 3));
    if (head[3] < 0.3 || bands[0][3] < 0.3 || bands[1][3] < 0.3 || bands[2][3] < 0.3) { [self reset]; return result(@"lost"); }
    const auto mouthBox = box(left + fw * 0.25, top + fh * 0.6, right - fw * 0.25, top + fh * 0.9);
    cv::Mat diff;
    cv::absdiff(_previous(mouthBox), gray(mouthBox), diff);
    const double mouth = cv::mean(diff)[0] / 255;
    double values[] = {-(bands[0][1] - head[1]) * scale, -(bands[1][1] - head[1]) * scale,
      -(bands[2][1] - head[1]) * scale, bands[0][2] * scale, mouth, -head[1] * scale};
    NSMutableArray<NSNumber *> *features = [NSMutableArray arrayWithCapacity:6];
    for (double value : values) [features addObject:@(std::max(-10.0, std::min(10.0, value)))];
    _previous = gray.clone(); _lastTime = timestamp;
    return @{ @"status": @"tracking", @"timestamp": @(timestamp), @"features": features };
  } catch (const cv::Exception &) {
    [self reset];
    return result(@"lost");
  }
}
@end
