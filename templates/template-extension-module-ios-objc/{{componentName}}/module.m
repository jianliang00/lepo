
#import "module.h"
#import "mark.h"

@interface NativeLocalStorageModule()
@property (strong, nonatomic) NSUserDefaults *localStorage;
@end

@implementation NativeLocalStorageModule

static NSString *const NativeLocalStorageKey = @"MyLocalStorage";

- (instancetype)init {
    if (self = [super init]) {
        _localStorage = [[NSUserDefaults alloc] initWithSuiteName:NativeLocalStorageKey];
    }
    return self;
}

MODULE_NAME_DRFINE(@"NativeLocalStorageModule")

+ (NSDictionary<NSString *, NSString *> *)methodLookup {
    return @{
        @"setStorageItem" : NSStringFromSelector(@selector(setStorageItem:value:)),
        @"getStorageItem" : NSStringFromSelector(@selector(getStorageItem:)),
        @"clearStorage" : NSStringFromSelector(@selector(clearStorage))
    };
}

- (void)setStorageItem:(NSString *)key value:(NSString *)value {
    [self.localStorage setObject:value forKey:key];
}

- (NSString*)getStorageItem:(NSString *)key {
    NSString *value = [self.localStorage stringForKey:key];
    return value;
}

- (void)clearStorage {
    NSDictionary *keys = [self.localStorage dictionaryRepresentation];
    for (NSString *key in keys) {
        [self.localStorage removeObjectForKey:key];
    }
}

@end
