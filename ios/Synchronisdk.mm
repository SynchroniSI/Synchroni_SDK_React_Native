#import "Synchronisdk.h"

@interface Synchronisdk() <SensorControllerDelegate>
{
    bool hasListeners;
    dispatch_queue_t        _methodQueue;
    dispatch_queue_t        _senderQueue;
    SensorController*       _controller;
}
@end

const NSTimeInterval TIMEOUT = 5;
@implementation Synchronisdk

RCT_EXPORT_MODULE()

- (instancetype)init{
    self = [super init];
    if (self) {
        _controller = [SensorController getInstance];
        _controller.delegate = self;
        self.sensorDataCtxMap = [[NSMutableDictionary alloc] init];
        
        hasListeners = NO;
        _methodQueue = dispatch_queue_create("SensorSDK", DISPATCH_QUEUE_SERIAL);
        _senderQueue = dispatch_queue_create("SensorSDK_data", DISPATCH_QUEUE_SERIAL);
    }
    return self;
}

+ (BOOL)requiresMainQueueSetup{
    return NO;
}

- (dispatch_queue_t)methodQueue
{
    return _methodQueue;
}

- (dispatch_queue_t)senderQueue
{
    return _senderQueue;
}

- (NSArray<NSString *> *)supportedEvents
{
    return @[@"GOT_ERROR",
             @"STATE_CHANGED",
             @"GOT_DATA",
             @"GOT_DEVICE_LIST",
    ];
}

-(void)startObserving{
    hasListeners = YES;
}

-(void)stopObserving{
    hasListeners = NO;
}

-(void)sendEvent:(NSString*)name params:(id)params{
    if(hasListeners){
        [self sendEventWithName:name body:params];
    }
}

#pragma mark - JS methods

-(void)_startScan:(NSTimeInterval)timeout resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    
    BOOL result = [_controller startScan:timeout];
    resolve(@(result));
}

-(void)_stopScan:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [_controller stopScan];
    resolve(nil);
}

-(BOOL)_isScaning{
    return _controller.isScaning;
}

-(BOOL)_isEnable{
    return _controller.isEnable;
}

-(void)_initSensor:(NSString*_Nonnull)deviceMac resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    
    if ([deviceMac isEqualToString:@""]){
        resolve(@(FALSE));
        return;
    }
    
    SensorDataCtx* dataCtx = [self.sensorDataCtxMap objectForKey:deviceMac];
    if (!dataCtx){
        SensorProfile* profile = [_controller getSensor:deviceMac];
        if (!profile){
            resolve(@(FALSE));
            return;
        }
        dataCtx = [[SensorDataCtx alloc] init];
        dataCtx.delegate = self;
        dataCtx.profile = profile;
        profile.delegate = dataCtx;
        [self.sensorDataCtxMap setObject:dataCtx forKey:deviceMac];
        resolve(@(TRUE));
        return;
    }
    resolve(@(FALSE));
}

-(void)_connect:(NSString*_Nonnull)deviceMac resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    
    SensorDataCtx* dataCtx = [self.sensorDataCtxMap objectForKey:deviceMac];
    if (dataCtx){
        BOOL result = [dataCtx.profile connect];
        resolve(@(result));
        return;
    }
    resolve(@(FALSE));
}

-(void)_disconnect:(NSString*_Nonnull)deviceMac resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    
    SensorDataCtx* dataCtx = [self.sensorDataCtxMap objectForKey:deviceMac];
    if (dataCtx){
        [dataCtx.profile disconnect];
        resolve(@(TRUE));
        return;
    }
    resolve(@(FALSE));
}

-(void)_startDataNotification:(NSString*_Nonnull)deviceMac resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    
    SensorDataCtx* dataCtx = [self.sensorDataCtxMap objectForKey:deviceMac];
    if (dataCtx){
        if (dataCtx.profile.state != BLEStateReady){
            resolve(@(FALSE));
            return;
        }
        
        BOOL result = [dataCtx.profile startDataNotification];
        resolve(@(result));
        return;
    }
    resolve(@(FALSE));
}

-(void)_stopDataNotification:(NSString*_Nonnull)deviceMac resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    
    SensorDataCtx* dataCtx = [self.sensorDataCtxMap objectForKey:deviceMac];
    if (dataCtx){
        if (dataCtx.profile.state != BLEStateReady){
            resolve(@(FALSE));
            return;
        }
        
        BOOL result = [dataCtx.profile stopDataNotification];
        resolve(@(result));
        return;
    }
    resolve(@(FALSE));
}

-(void)_initECG:(NSString*_Nonnull)deviceMac packageSampleCount:(int)inPackageSampleCount resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    
    SensorDataCtx* dataCtx = [self.sensorDataCtxMap objectForKey:deviceMac];
    if (dataCtx){
        if (dataCtx.profile.state != BLEStateReady){
            resolve(@(FALSE));
            return;
        }
        [dataCtx.profile initECG:inPackageSampleCount timeout:TIMEOUT completion:^(BOOL success) {
            resolve(@(success));
        }];
        return;
    }
    resolve(@(FALSE));
}

- (void)_initEEG:(NSString*_Nonnull)deviceMac packageSampleCount:(int)inPackageSampleCount resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    
    SensorDataCtx* dataCtx = [self.sensorDataCtxMap objectForKey:deviceMac];
    if (dataCtx){
        if (dataCtx.profile.state != BLEStateReady){
            resolve(@(FALSE));
            return;
        }
        [dataCtx.profile initEEG:inPackageSampleCount timeout:TIMEOUT completion:^(BOOL success) {
            resolve(@(success));
        }];
        return;
    }
    resolve(@(FALSE));
}

-(void)_initDataTransfer:(NSString*_Nonnull)deviceMac resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    
    SensorDataCtx* dataCtx = [self.sensorDataCtxMap objectForKey:deviceMac];
    if (dataCtx){
        if (dataCtx.profile.state != BLEStateReady){
            resolve(@(FALSE));
            return;
        }
        [dataCtx.profile initDataTransfer:TIMEOUT completion:^(BOOL success) {
            resolve(@(success));
        }];
        return;
    }
    resolve(@(FALSE));
}

-(void)_getBatteryLevel:(NSString*_Nonnull)deviceMac resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject{
    
    SensorDataCtx* dataCtx = [self.sensorDataCtxMap objectForKey:deviceMac];
    if (dataCtx){
        if (dataCtx.profile.state != BLEStateReady){
            reject(@"getBatteryLevel", @"device not connected", nil);
            return;
        }
        [dataCtx.profile getBattery:TIMEOUT completion:^(int battery) {
            resolve(@(battery));
        }];
        return;
    }
    resolve(@(FALSE));
}

-(void)_getControllerFirmwareVersion:(NSString*_Nonnull)deviceMac resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    
    SensorDataCtx* dataCtx = [self.sensorDataCtxMap objectForKey:deviceMac];
    if (dataCtx){
        if (dataCtx.profile.state != BLEStateReady){
            reject(@"getControllerFirmwareVersion", @"device not connected", nil);
            return;
        }
        [dataCtx.profile getVersion:TIMEOUT completion:^(NSString* version) {
            resolve(version);
        }];
        return;
    }
    resolve(@(FALSE));
}

-(BLEState)_getDeviceState:(NSString*_Nonnull)deviceMac {
    SensorDataCtx* dataCtx = [self.sensorDataCtxMap objectForKey:deviceMac];
    if (dataCtx){
        return dataCtx.profile.state;
    }
    return BLEStateInvalid;
}

#pragma mark - New Module methods





// Don't compile this code when we build for the old architecture.
#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
(const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeSynchronySDKReactNativeSpecJSI>(params);
}


- (void)startScan:(double)periodInMs
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject{
    periodInMs /= 1000;
    [self _startScan:periodInMs resolve:resolve reject:reject];
}

- (void)stopScan:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject{
    [self _stopScan:resolve reject:reject];
}

- (NSNumber *)isScaning{
    return @([self _isScaning]);
}

- (NSNumber *)isEnable{
    return @([self _isEnable]);
}

- (void)initSensor:(NSString *)deviceMac
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject{
    [self _initSensor:deviceMac resolve:resolve reject:reject];
}

- (void)connect:(NSString *)deviceMac
        resolve:(RCTPromiseResolveBlock)resolve
         reject:(RCTPromiseRejectBlock)reject{
    [self _connect:deviceMac resolve:resolve reject:reject];
}

- (void)disconnect:(NSString *)deviceMac
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject{
    [self _disconnect:deviceMac resolve:resolve reject:reject];
}

- (void)startDataNotification:(NSString *)deviceMac
                      resolve:(RCTPromiseResolveBlock)resolve
                       reject:(RCTPromiseRejectBlock)reject{
    [self _startDataNotification:deviceMac resolve:resolve reject:reject];
}

- (void)stopDataNotification:(NSString *)deviceMac
                     resolve:(RCTPromiseResolveBlock)resolve
                      reject:(RCTPromiseRejectBlock)reject{
    [self _stopDataNotification:deviceMac resolve:resolve reject:reject];
}

- (void)initEEG:(NSString *)deviceMac
packageSampleCount:(double)packageSampleCount
        resolve:(RCTPromiseResolveBlock)resolve
         reject:(RCTPromiseRejectBlock)reject{
    [self _initEEG:deviceMac packageSampleCount:packageSampleCount resolve:resolve reject:reject];
}

- (void)initECG:(NSString *)deviceMac
packageSampleCount:(double)packageSampleCount
        resolve:(RCTPromiseResolveBlock)resolve
         reject:(RCTPromiseRejectBlock)reject{
    [self _initECG:deviceMac packageSampleCount:packageSampleCount resolve:resolve reject:reject];
}

- (void)initDataTransfer:(NSString *)deviceMac
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject{
    [self _initDataTransfer:deviceMac resolve:resolve reject:reject];
}

- (void)getBatteryLevel:(NSString *)deviceMac
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject{
    [self _getBatteryLevel:deviceMac resolve:resolve reject:reject];
}

- (void)getControllerFirmwareVersion:(NSString *)deviceMac
                             resolve:(RCTPromiseResolveBlock)resolve
                              reject:(RCTPromiseRejectBlock)reject{
    [self _getControllerFirmwareVersion:deviceMac resolve:resolve reject:reject];
}

- (NSString *)getDeviceState:(NSString*)deviceMac {
    BLEState value = [self _getDeviceState:deviceMac];
    if (value == BLEStateUnConnected) {
        return @"Disconnected";
    } else if (value == BLEStateConnecting) {
        return @"Connecting";
    } else if (value == BLEStateConnected) {
        return @"Connected";
    } else if (value == BLEStateReady) {
        return @"Ready";
    } else if (value >= BLEStateInvalid) {
        return @"Invalid";
    }
    return @"Invalid";
}
#else

#pragma mark - Old Module methods

RCT_EXPORT_METHOD(startScan:(NSNumber*_Nonnull)timeoutInMs resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    
    NSTimeInterval timeout = [timeoutInMs doubleValue] / 1000;
    
    [self _startScan:timeout resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(stopScan:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    [self _stopScan:resolve reject:reject];
}

RCT_REMAP_BLOCKING_SYNCHRONOUS_METHOD(isScaning, NSNumber*,
                                      isScaning) {
    return @([self _isScaning]);
}

RCT_REMAP_BLOCKING_SYNCHRONOUS_METHOD(isEnable, NSNumber*,
                                      isEnable) {
    return @([self _isEnable]);
}

RCT_EXPORT_METHOD(initSensor:(NSString*_Nonnull)deviceMac resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    [self _initSensor:deviceMac resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(connect:(NSString*_Nonnull)deviceMac resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    
    [self _connect:deviceMac resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(disconnect:(NSString*_Nonnull)deviceMac resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    
    [self _disconnect:deviceMac resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(startDataNotification:(NSString*_Nonnull)deviceMac resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    
    [self _startDataNotification:deviceMac resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(stopDataNotification:(NSString*_Nonnull)deviceMac resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    
    [self _stopDataNotification:deviceMac resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(initECG:(NSString*_Nonnull)deviceMac packageSampleCount:(NSNumber*_Nonnull)packageSampleCount resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject){
    
    [self _initECG:deviceMac  packageSampleCount:[packageSampleCount intValue] resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(initEEG:(NSString*_Nonnull)deviceMac packageSampleCount:(NSNumber*_Nonnull)packageSampleCount resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject){
    
    [self _initEEG:deviceMac  packageSampleCount:[packageSampleCount intValue] resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(initDataTransfer:(NSString*_Nonnull)deviceMac resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    
    [self _initDataTransfer:deviceMac  resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(getBatteryLevel:(NSString*_Nonnull)deviceMac resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject){
    
    [self _getBatteryLevel:deviceMac resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(getControllerFirmwareVersion:(NSString*_Nonnull)deviceMac resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    
    [self _getControllerFirmwareVersion:deviceMac resolve:resolve reject:reject];
}

RCT_REMAP_BLOCKING_SYNCHRONOUS_METHOD(getDeviceState, NSNumber *_Nonnull,
                                      getDeviceState:(NSString*_Nonnull)deviceMac) {
    return @([self _getDeviceState:deviceMac]);
}

#endif

#pragma mark - SensorControllerDelegate

- (void)onSensorScanResult:(NSArray<BLEPeripheral*>*) bleDevices {

    NSMutableArray* result = [NSMutableArray new];
    if(bleDevices != nil){
        for (BLEPeripheral* device in bleDevices){
            NSDictionary *sensor = @{ @"Name" : device.name,
                                      @"Address" : device.macAddress,
                                      @"RSSI": device.rssi};
            [result addObject:sensor];
        }
        [self sendEvent:@"GOT_DEVICE_LIST" params:result];
    }
}

@end


@implementation SensorDataCtx

- (void)onSensorErrorCallback:(NSError *)err {
    NSDictionary* result = [NSDictionary dictionaryWithObjectsAndKeys:self.profile.device.macAddress, @"deviceMac", [err description], @"errMsg", nil];
    
    SynchronySDKReactNative* instance = self.delegate;

    [instance sendEvent:@"GOT_ERROR" params:result];
}

- (void)onSensorNotifyData:(SensorData *)sensorData {
    NSDictionary* sampleResult = [sensorData reactSamples: self.profile];
    if (sampleResult != nil){
        SynchronySDKReactNative* instance = self.delegate;
        [instance sendEvent:@"GOT_DATA" params:sampleResult];
    }
}

- (void)onSensorStateChange:(BLEState)newState {
    NSDictionary* result = [NSDictionary dictionaryWithObjectsAndKeys:self.profile.device.macAddress, @"deviceMac", @(newState), @"newState", nil];
    
    SynchronySDKReactNative* instance = self.delegate;
    [instance sendEvent:@"STATE_CHANGED" params:result];
}

@end

@implementation SensorData(REACT)

-(NSDictionary*)reactSamples:(SensorProfile*) profile{
    NSMutableArray<NSMutableArray<Sample*>*>* channelSamples = [self.channelSamples copy];
    self.channelSamples = nil;
    
    if (channelSamples == nil){
        return nil;
    }
    
    NSMutableDictionary* result = [[NSMutableDictionary alloc] init];
    [result setValue:profile.device.macAddress forKey:@"deviceMac"];
    [result setValue:@(self.dataType) forKey:@"dataType"];
//    [result setValue:@(self.resolutionBits) forKey:@"resolutionBits"];
    [result setValue:@(self.sampleRate) forKey:@"sampleRate"];
    [result setValue:@(self.channelCount) forKey:@"channelCount"];
//    [result setValue:@(self.channelMask) forKey:@"channelMask"];
    [result setValue:@(self.packageSampleCount) forKey:@"packageSampleCount"];
//    [result setValue:@(self.K) forKey:@"K"];

    NSMutableArray* channelsResult = [[NSMutableArray alloc] init];

    for (int channelIndex = 0;channelIndex < self.channelCount;++channelIndex){
        NSMutableArray<Sample*>* samples = [channelSamples objectAtIndex:channelIndex];
        NSMutableArray* samplesResult = [[NSMutableArray alloc] init];
        
        for (int sampleIndex = 0;sampleIndex < samples.count;++sampleIndex){
            Sample* sample = [samples objectAtIndex:sampleIndex];
            NSMutableDictionary* sampleResult = [[NSMutableDictionary alloc] init];
//            [sampleResult setValue:@(sample.rawData) forKey:@"rawData"];
            [sampleResult setValue:@(sample.sampleIndex) forKey:@"sampleIndex"];
//            [sampleResult setValue:@(sample.channelIndex) forKey:@"channelIndex"];
//            [sampleResult setValue:@(sample.timeStampInMs) forKey:@"timeStampInMs"];
            [sampleResult setValue:@(sample.convertData) forKey:@"data"];
            [sampleResult setValue:@(sample.impedance) forKey:@"impedance"];
            [sampleResult setValue:@(sample.saturation) forKey:@"saturation"];
            [sampleResult setValue:@(sample.isLost) forKey:@"isLost"];
            
            [samplesResult addObject:sampleResult];
        }
        [channelsResult addObject:samplesResult];
    }
    
    [result setValue:channelsResult forKey:@"channelSamples"];

    return result;
}
@end
