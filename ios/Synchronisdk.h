
#import <React/RCTEventEmitter.h>


#ifdef RCT_NEW_ARCH_ENABLED
#import <React/RCTBridgeModule.h>
#import "RNSynchronisdkSpec.h"

@interface Synchronisdk : RCTEventEmitter <NativeSynchronisdkSpec>
#else
#import <React/RCTBridgeModule.h>

@interface Synchronisdk : RCTEventEmitter <RCTBridgeModule>
#endif

-(instancetype)init;
-(void) sendEvent:(NSString*)name params:(id)params;

@end
