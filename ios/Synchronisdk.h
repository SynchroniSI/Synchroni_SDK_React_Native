#import <sensor/sensor.h>
#import <React/RCTEventEmitter.h>


@interface SensorDataCtx: NSObject<SensorProfileDelegate>

@property (atomic, retain) SensorProfile* profile;
@property (atomic, weak) id delegate;
@end

@interface SensorData(REACT)

-(NSDictionary*)reactSamples:(SensorProfile*) profile;

@end




#ifdef RCT_NEW_ARCH_ENABLED
#import <React/RCTBridgeModule.h>
#import "RNSynchronisdkSpec.h"

@interface Synchronisdk : RCTEventEmitter <NativeSynchronisdkSpec>
#else
#import <React/RCTBridgeModule.h>

@interface Synchronisdk : RCTEventEmitter <RCTBridgeModule>
#endif
@property (atomic, strong) NSMutableDictionary<NSString* , SensorDataCtx* >* sensorDataCtxMap;

-(instancetype)init;
-(void) sendEvent:(NSString*)name params:(id)params;

@end
