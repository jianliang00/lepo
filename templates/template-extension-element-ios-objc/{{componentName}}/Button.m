
#import "Button.h"
#import <Lynx/LynxComponentRegistry.h>
#import <Lynx/LynxPropsProcessor.h>

@implementation LynxButton

LYNX_LAZY_REGISTER_UI("button")

LYNX_PROP_SETTER("text", setValue, NSString *) {
    self.view.text = value;
}

- (UILabel *)createView {
    UILabel *view = [[UILabel alloc] init];
    view.textAlignment = NSTextAlignmentCenter;
    view.font = [UIFont systemFontOfSize:18];
        
    UITapGestureRecognizer *tapGesture = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(handleViewTap:)];
    [view addGestureRecognizer:tapGesture];
    view.userInteractionEnabled = YES;
    return view;
}

- (void)handleViewTap:(UITapGestureRecognizer *)gesture {
    LynxCustomEvent * event = [[LynxDetailEvent alloc] initWithName:@"clickevent" targetSign:self.sign];
    [self.context.eventEmitter dispatchCustomEvent:event];
}

@end
