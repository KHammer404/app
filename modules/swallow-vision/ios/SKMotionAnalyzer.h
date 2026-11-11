#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN
@interface SKMotionAnalyzer : NSObject
- (void)reset;
- (NSDictionary<NSString *, id> *)analyzeImage:(UIImage *)image
                                  landmarks:(NSArray<NSArray<NSNumber *> *> *)landmarks
                                  timestamp:(double)timestamp NS_SWIFT_NAME(analyze(image:landmarks:timestamp:));
@end
NS_ASSUME_NONNULL_END
