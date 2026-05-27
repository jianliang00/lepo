
#import <Foundation/Foundation.h>
#import <Lynx/LynxModule.h>
#import "../src/generated/NativeLocalStorageModuleSpec.h"

NS_ASSUME_NONNULL_BEGIN

@LynxAutolinkNativeModule("NativeLocalStorageModule")
@interface NativeLocalStorageModule : NSObject <NativeLocalStorageModuleSpec>

@end

NS_ASSUME_NONNULL_END
