#import "Synchronisdk.h"

@interface Synchronisdk() <SensorDelegate>
{
    bool hasListeners;
    RCTPromiseResolveBlock  scanResolve;
    RCTPromiseRejectBlock   scanReject;
    NSArray*                scanDevices;
    dispatch_queue_t        _methodQueue;
    dispatch_queue_t        _senderQueue;
}
@end

@implementation Synchronisdk

RCT_EXPORT_MODULE()

- (instancetype)init{
    self = [super init];
    if (self) {
        self.profile = [[SensorProfile alloc] init];
        self.profile.delegate = self;
        hasListeners = NO;
        scanResolve = nil;
        scanReject = nil;
        _methodQueue = dispatch_queue_create("SensorSDK", DISPATCH_QUEUE_SERIAL);
        _senderQueue = dispatch_queue_create("SensorSDK_data", DISPATCH_QUEUE_SERIAL);
        self.dataFlag = (DataNotifyFlags)(DNF_ACCELERATE  |DNF_IMPEDANCE);
        [self _initACC_GYRO];
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

-(void)clearSamples{
    [self.eegData clear];
    [self.ecgData clear];
    [self.accData clear];
    [self.gyroData clear];
    self.impedanceData = [[NSMutableArray alloc] init];
    self.saturationData = [[NSMutableArray alloc] init];
}

-(void)_initACC_GYRO{
    self.accData = [[SensorData alloc] init];
    SensorData* data = self.accData;
    data.dataType = NTF_ACC_DATA;
    data.sampleRate = 50;
    data.channelMask = 255;
    data.channelCount = 3;
    data.resolutionBits = 16;
    data.packageSampleCount = 1;
    data.K = 1 / 8192.0;
    [data clear];
    
    self.gyroData = [[SensorData alloc] init];
    data = self.gyroData;
    data.dataType = NTF_GYO_DATA;
    data.sampleRate = 50;
    data.channelMask = 255;
    data.channelCount = 3;
    data.resolutionBits = 16;
    data.packageSampleCount = 1;
    data.K = 1 / 16.4;
    [data clear];
}

-(void)_initECG:(int)inPackageSampleCount resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    if (self.profile.state != BLEStateRunning){
        reject(@"initECG", @"device not connected", nil);
        return;
    }
    [self.profile getEcgDataConfig:^(GF_RET_CODE resp, int sampleRate, unsigned long long channelMask, int packageSampleCount, int resolutionBits, double conversionK) {
        if (resp == GF_SUCCESS){
            self.ecgData = [[SensorData alloc] init];
            SensorData* data = self.ecgData;
            data.dataType = NTF_ECG;
            data.sampleRate = sampleRate;
            data.channelMask = channelMask;
            data.resolutionBits = resolutionBits;
            data.packageSampleCount = packageSampleCount;
            data.K = conversionK;
            [data clear];
            
            [self.profile getEcgDataCap:^(GF_RET_CODE resp, NSArray *supportedSampleRates, int maxChannelCount, int maxPackageSampleCount, NSArray *supportedResolutionBits) {
                
                if (resp == GF_SUCCESS){
                    SensorData* data = self.ecgData;
                    data.channelCount = maxChannelCount;
                    self.dataFlag = (DataNotifyFlags)(self.dataFlag | DNF_ECG);
                    //            NSLog(@"got ecgData info: %d %d %llu %d", data.sampleRate, data.channelCount, data.channelMask, data.packageSampleCount);
                    if (inPackageSampleCount <= 0){
                        resolve(@(TRUE));
                        return;
                    }
                    [self.profile setEcgDataConfig:data.sampleRate channelMask:data.channelMask sampleCount:inPackageSampleCount resolutionBits:data.resolutionBits cb:^(GF_RET_CODE resp) {
                        if (resp == GF_SUCCESS){
                            data.packageSampleCount = inPackageSampleCount;
                            resolve(@(TRUE));
                        }else{
                            NSString* err = [NSString stringWithFormat:@"device return error: %ld", (long)resp];
                            reject(@"initECG",err, nil);
                            return;
                        }
                    } timeout:TIMEOUT];
                }else{
                    NSString* err = [NSString stringWithFormat:@"device return error: %ld", (long)resp];
                    reject(@"initECG",err, nil);
                    return;
                }
            } timeout:TIMEOUT];
        }else{
            NSString* err = [NSString stringWithFormat:@"device return error: %ld", (long)resp];
            reject(@"initECG",err, nil);
            return;
        }
    } timeout:TIMEOUT];
}

- (void)_initEEG:(int)inPackageSampleCount resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    if (self.profile.state != BLEStateRunning){
        reject(@"initEEG", @"device not connected", nil);
        return;
    }
    [self.profile getEegDataConfig:^(GF_RET_CODE resp, int sampleRate, unsigned long long channelMask, int packageSampleCount, int resolutionBits, double conversionK) {
        if (resp == GF_SUCCESS){
            self.eegData = [[SensorData alloc] init];
            SensorData* data = self.eegData;
            data.dataType = NTF_EEG;
            data.sampleRate = sampleRate;
            data.channelMask = channelMask;
            data.resolutionBits = resolutionBits;
            data.packageSampleCount = packageSampleCount;
            data.K = conversionK;
            [data clear];
            
            [self.profile getEegDataCap:^(GF_RET_CODE resp, NSArray *supportedSampleRates, int maxChannelCount, int maxPackageSampleCount, NSArray *supportedResolutionBits) {
                
                if (resp == GF_SUCCESS){
                    SensorData* data = self.eegData;
                    data.channelCount = maxChannelCount;
                    self.dataFlag = (DataNotifyFlags)(self.dataFlag | DNF_EEG);
                    //            NSLog(@"got eegData info: %d %d %llu %d", data.sampleRate, data.channelCount, data.channelMask, data.packageSampleCount);
                    if (inPackageSampleCount <= 0){
                        resolve(@(TRUE));
                        return;
                    }
                    [self.profile setEegDataConfig:data.sampleRate channelMask:data.channelMask sampleCount:inPackageSampleCount resolutionBits:data.resolutionBits cb:^(GF_RET_CODE resp) {
                        if (resp == GF_SUCCESS){
                            data.packageSampleCount = inPackageSampleCount;
                            resolve(@(TRUE));
                        }else{
                            NSString* err = [NSString stringWithFormat:@"device return error: %ld", (long)resp];
                            reject(@"initEEG",err, nil);
                            return;
                        }
                    } timeout:TIMEOUT];
                }else{
                    NSString* err = [NSString stringWithFormat:@"device return error: %ld", (long)resp];
                    reject(@"initEEG",err, nil);
                    return;
                }
            } timeout:TIMEOUT];
        }else{
            NSString* err = [NSString stringWithFormat:@"device return error: %ld", (long)resp];
            reject(@"initEEG",err, nil);
            return;
        }
    } timeout:TIMEOUT];
}

#pragma mark - Module methods

RCT_EXPORT_METHOD(disconnect:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    if (self.profile.state == BLEStateRunning){
        [self.profile disconnect];
        resolve(@(TRUE));
    }else{
        resolve(@(FALSE));
    }
}

RCT_EXPORT_METHOD(getBatteryLevel:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject){
    if (self.profile.state == BLEStateRunning){
        [self.profile getBatteryLevel:^(GF_RET_CODE resp, int batteryLevel) {
            if (resp == GF_SUCCESS){
                resolve(@(batteryLevel));
            }else{
                NSString* err = [NSString stringWithFormat:@"device return error: %ld", (long)resp];
                reject(@"getBatteryLevel",err, nil);
            }
        } timeout:TIMEOUT];
    }else{
        reject(@"getBatteryLevel", @"device not connected", nil);
    }
}

RCT_EXPORT_METHOD(getControllerFirmwareVersion:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    if (self.profile.state == BLEStateRunning){
        [self.profile getControllerFirmwareVersion:^(GF_RET_CODE resp, NSString *firmwareVersion) {
            if (resp == GF_SUCCESS){
                resolve(firmwareVersion);
            }else{
                NSString* err = [NSString stringWithFormat:@"device return error: %ld", (long)resp];
                reject(@"getControllerFirmwareVersion",err, nil);
            }
        } timeout:TIMEOUT];
    }else{
        reject(@"getControllerFirmwareVersion", @"device not connected", nil);
    }
}

RCT_EXPORT_METHOD(initDataTransfer:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    if (self.profile.state != BLEStateRunning){
        reject(@"initDataTransfer", @"device not connected", nil);
        return;
    }
    [self.profile setDataNotifSwitch: self.dataFlag cb:^(GF_RET_CODE resp) {
        if (resp == GF_SUCCESS){
            resolve(@(TRUE));
        }else{
            NSString* err = [NSString stringWithFormat:@"device return error: %ld", (long)resp];
            reject(@"initDataTransfer",err, nil);
        }
    } timeout:TIMEOUT];
}




RCT_EXPORT_METHOD(startDataNotification:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    if (self.profile.state != BLEStateRunning){
        reject(@"stopDataNotification", @"device not connected", nil);
        return;
    }
    [self clearSamples];
    
    BOOL result = [self.profile startDataNotification];
    resolve(@(result));
}


RCT_EXPORT_METHOD(stopDataNotification:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    if (self.profile.state != BLEStateRunning){
        reject(@"stopDataNotification", @"device not connected", nil);
        return;
    }
    BOOL result = [self.profile stopDataNotification];
    resolve(@(result));
}

RCT_EXPORT_METHOD(stopScan:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    [self.profile stopScan];
    resolve(nil);
}

// Don't compile this code when we build for the old architecture.
#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeSynchronisdkSpecJSI>(params);
}

- (NSString *)getDeviceState {
    BLEState value = self.profile.state;
    if (value == BLEStateUnConnected) {
        return @"Disconnected";
    } else if (value == BLEStateConnecting) {
        return @"Connecting";
    } else if (value == BLEStateConnected) {
        return @"Connected";
    } else if (value == BLEStateRunning) {
        return @"Ready";
    } else if (value >= BLEStateInvalid) {
        return @"Invalid";
    }
    return @"Invalid";
}

- (void)connect:(JS::NativeSynchronisdk::BLEDevice &)device
        resolve:(RCTPromiseResolveBlock)resolve
         reject:(RCTPromiseRejectBlock)reject{
    for (BLEPeripheral* peripheral in scanDevices){
        NSString* address = device.Address();
        if ([peripheral.macAddress isEqualToString:address]){
            BOOL result = [self.profile connect:peripheral];
            resolve(@(result));
            return;
        }
    }
    resolve(@(FALSE));
}


-(void)startScan:(double)timeoutInMs resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    
    timeoutInMs /= 1000;
    
    if (scanResolve != nil){
        reject(@"startScan", @"Please don't call start scan before it returns", nil);
        return;
    }
    
    BOOL result = [self.profile startScan:timeoutInMs];
    if (!result){
        reject(@"startScan", @"Please check bluetooth setting", nil);
        return;
    }
    scanResolve = resolve;
    scanReject = reject;
}

- (void)initECG:(double)packageSampleCount resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self _initECG:packageSampleCount resolve:resolve reject:reject];
}

- (void)initEEG:(double)packageSampleCount resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self _initEEG:packageSampleCount resolve:resolve reject:reject];
}

#else

RCT_EXPORT_METHOD(connect:(NSDictionary*_Nonnull)device resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    for (BLEPeripheral* peripheral in scanDevices){
        NSString* mac = [device valueForKey:@"Address"];
        if ([peripheral.macAddress isEqualToString:mac]){
            BOOL result = [self.profile connect:peripheral];
            resolve(@(result));
            return;
        }
    }
    resolve(@(FALSE));
}

RCT_EXPORT_METHOD(startScan:(NSNumber*_Nonnull)timeoutInMs resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {

    NSTimeInterval timeout = [timeoutInMs doubleValue] / 1000;
    
    if (scanResolve != nil){
        reject(@"startScan", @"Please don't call start scan before it returns", nil);
        return;
    }
    
    BOOL result = [self.profile startScan:timeout];
    if (!result){
        reject(@"startScan", @"Please check bluetooth setting", nil);
        return;
    }
    scanResolve = resolve;
    scanReject = reject;
}

RCT_REMAP_BLOCKING_SYNCHRONOUS_METHOD(getDeviceState, NSNumber *_Nonnull,
                                      getDeviceState) {
    return @(self.profile.state);
}

RCT_EXPORT_METHOD(initECG:(NSNumber*_Nonnull)packageSampleCount resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject){
    [self _initECG:[packageSampleCount intValue] resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(initEEG:(NSNumber*_Nonnull)packageSampleCount resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject){
    [self _initEEG:[packageSampleCount intValue] resolve:resolve reject:reject];
}

#endif

#pragma mark - SensorDelegate

- (void)onSensorErrorCallback:(NSError *)err {
    [self sendEvent:@"GOT_ERROR" params:[err description]];
}

- (void)onSensorScanResult:(NSArray *)bleDevices {
    RCTPromiseResolveBlock  resolve = scanResolve;
    RCTPromiseRejectBlock   reject = scanReject;
    scanResolve = nil;
    scanReject = nil;
    scanDevices = bleDevices;
    
    if (resolve != nil){
        @try {
            NSMutableArray* result = [NSMutableArray new];
            if(bleDevices != nil){
                for (BLEPeripheral* device in bleDevices){
                    NSDictionary *sensor = @{ @"Name" : device.peripheralName,
                                              @"Address" : device.macAddress,
                                              @"RSSI": device.rssi};
                    [result addObject:sensor];
                }
                resolve(result);
            }
        } @catch (NSException *e) {
            reject(@"startScan", e.description, nil);
        }
    }
}

- (void)onSensorStateChange:(BLEState)newState {
    if (newState == BLEStateUnConnected){
        self.dataFlag = (DataNotifyFlags)(DNF_ACCELERATE  |DNF_IMPEDANCE);
        [self clearSamples];
    }
    [self sendEvent:@"STATE_CHANGED" params:@(newState)];
}


- (void)onSensorNotifyData:(NSData *)rawData {
    dispatch_async([self senderQueue], ^{
        
        if (rawData.length > 1){
            unsigned char* result = (unsigned char*)rawData.bytes;

            if (result[0] == NTF_EEG){
                SensorData* sensorData = self.eegData;
                if ([self checkReadSamples:result sensorData:sensorData dataOffset:3])
                    [self sendSamples:sensorData];
            }
            else if (result[0] == NTF_ECG){
                SensorData* sensorData = self.ecgData;
                if ([self checkReadSamples:result sensorData:sensorData dataOffset:3])
                    [self sendSamples:sensorData];
            }else if (result[0] == NTF_ACC_DATA){
                SensorData* sensorData = self.accData;
                if ([self checkReadSamples:result sensorData:sensorData dataOffset:3])
                    [self sendSamples:sensorData];
                
                sensorData = self.gyroData;
                if ([self checkReadSamples:result sensorData:sensorData dataOffset:9])
                    [self sendSamples:sensorData];
            }
            else if (result[0] == NTF_IMPEDANCE){
                NSMutableArray* impedanceData = [[NSMutableArray alloc] init];
                NSMutableArray* railData = [[NSMutableArray alloc] init];

                int dataCount = (rawData.length - 3) / 4 / 2;
                int counter = (result[2] << 8) | result[1];
    //                NSLog(@"got impedance data : %d %d", dataCount, counter);
                int offset = 3;
                for (int index = 0;index < dataCount;++index, offset += 4){
                    unsigned char bytes[4];
                    bytes[0] = result[offset];
                    bytes[1] = result[offset + 1];
                    bytes[2] = result[offset + 2];
                    bytes[3] = result[offset + 3];
        
                    float data = *((float*)(bytes));
                    [impedanceData addObject:[NSNumber numberWithFloat:data]];
                }
                
                for (int index = 0;index < dataCount;++index, offset += 4){
                    unsigned char bytes[4];
                    bytes[0] = result[offset];
                    bytes[1] = result[offset + 1];
                    bytes[2] = result[offset + 2];
                    bytes[3] = result[offset + 3];
        
                    float data = (*((float*)(bytes))) / 10; //firmware value range 0-1000
                    [railData addObject:[NSNumber numberWithFloat:data]];
                }
                
                self.impedanceData = impedanceData;
                self.saturationData = railData;
            }
        }

    });
}

- (BOOL)checkReadSamples:(unsigned char *)result sensorData:(SensorData*) sensorData dataOffset:(int)dataOffset{
    int readOffset = 1;

    @try {
        int packageIndex = *((unsigned short*)(result + readOffset));
        readOffset += 2;
        int newPackageIndex = packageIndex;
//                NSLog(@"packageindex: %d", packageIndex);
        int lastPackageIndex = sensorData.lastPackageIndex;
        
        if (packageIndex < lastPackageIndex){
            packageIndex += 65536;
        }else if (packageIndex == lastPackageIndex){
            //same index is not right
//                    NSLog(@"Repeat index: %d", packageIndex);
            return FALSE;
        }
        int deltaPackageIndex = packageIndex - lastPackageIndex;
        if (deltaPackageIndex > 1){
            int lostSampleCount = sensorData.packageSampleCount * (deltaPackageIndex - 1);
//                    NSLog(@"lost samples: %d", lostSampleCount);
            [self readSamples:result sensorData:sensorData offset:0 lostSampleCount:lostSampleCount];
            if (newPackageIndex == 0){
                sensorData.lastPackageIndex = 65535;
            }else{
                sensorData.lastPackageIndex = newPackageIndex - 1;
            }
            sensorData.lastPackageCounter += (deltaPackageIndex - 1);
        }
        [self readSamples:result sensorData:sensorData offset:dataOffset lostSampleCount:0];
        sensorData.lastPackageIndex = newPackageIndex;
        sensorData.lastPackageCounter++;
    } @catch (NSException *exception) {
        NSLog(@"Error: %@", [exception description]);
        return FALSE;
    } @finally {
        
    }
    return TRUE;
}

- (void)readSamples:(unsigned char *)data sensorData:(SensorData*) sensorData offset:(int)offset lostSampleCount:(int)lostSampleCount{
    
    int sampleCount = sensorData.packageSampleCount;
    int sampleInterval = 1000 / sensorData.sampleRate; // sample rate should be less than 1000
    if (lostSampleCount > 0)
        sampleCount = lostSampleCount;
    
    double K = sensorData.K;
    int lastSampleIndex = sensorData.lastPackageCounter * sensorData.packageSampleCount;
    
    NSMutableArray* impedanceData = self.impedanceData;
    NSMutableArray* saturationData = self.saturationData;
    NSMutableArray<NSMutableArray<Sample*>*>* channelSamples = [sensorData.channelSamples copy];
    if (channelSamples == nil){
        channelSamples = [NSMutableArray new];
        for (int channelIndex = 0; channelIndex < sensorData.channelCount; ++ channelIndex){
            [channelSamples addObject:[NSMutableArray new]];
        }
    }

    for (int sampleIndex = 0;sampleIndex < sampleCount; ++sampleIndex, ++lastSampleIndex){
        for (int channelIndex = 0, impedanceChannelIndex = 0; channelIndex < sensorData.channelCount; ++channelIndex){
            if ((sensorData.channelMask & (1 << channelIndex)) > 0){
                NSMutableArray<Sample*>* samples = [channelSamples objectAtIndex:channelIndex];
                float impedance = 0;
                float saturation = 0;
                if (sensorData.dataType == NTF_ECG){
                    impedanceChannelIndex = self.eegData.channelCount;
                }
                if ((impedanceChannelIndex >= 0) && (impedanceChannelIndex < [impedanceData count])){
                    impedance = [[impedanceData objectAtIndex:impedanceChannelIndex] floatValue];
                    saturation = [[saturationData objectAtIndex:impedanceChannelIndex] floatValue];
                }
                ++impedanceChannelIndex;
                
                Sample* sample = [[Sample alloc] init];
                sample.channelIndex = channelIndex;
                sample.sampleIndex = lastSampleIndex;
                sample.timeStampInMs = lastSampleIndex * sampleInterval;
                if (lostSampleCount > 0){
                    //add missing samples with 0
                    sample.rawData = 0;
                    sample.convertData = 0;
                    sample.impedance = impedance;
                    sample.saturation = saturation;
                    sample.isLost = TRUE;
                }else{
                    if (sensorData.resolutionBits == 8){
                        int rawData = data[offset];
                        rawData -= 128;
                        offset += 1;
                        sample.rawData = rawData;
                    }else if (sensorData.resolutionBits == 16){
                        int rawData = *((short*)(data + offset));
                        offset += 2;
                        sample.rawData = rawData;
                    }else if (sensorData.resolutionBits == 24){
                        int rawData = (data[offset] << 16) | (data[offset + 1] << 8) | (data[offset + 2]);
                        rawData -= 8388608;
                        offset += 3;
                        sample.rawData = rawData;
                    }
                    sample.convertData = sample.rawData * K;
                    sample.impedance = impedance;
                    sample.saturation = saturation;
                    sample.isLost = FALSE;
                }
                [samples addObject:sample];
            }
        }
    }
    
    sensorData.channelSamples = channelSamples;
}

- (void)sendSamples:(SensorData*) sensorData{
    

    NSDictionary* sampleResult = [sensorData flushSamples];
    if (sampleResult != nil){
        [self sendEvent:@"GOT_DATA" params:sampleResult];
    }

}
@end


@implementation Sample
@end

@implementation SensorData
-(id)init{
    if (self = [super init]) {

    }
    return self;
}

-(void)clear{
    self.lastPackageIndex = 0;
    self.lastPackageCounter = 0;
}


-(NSDictionary*)flushSamples{
    NSMutableArray<NSMutableArray<Sample*>*>* channelSamples = [self.channelSamples copy];
    self.channelSamples = nil;
    
    if (channelSamples == nil){
        return nil;
    }
    
    NSMutableDictionary* result = [[NSMutableDictionary alloc] init];
    [result setValue:@(self.dataType) forKey:@"dataType"];
    [result setValue:@(self.resolutionBits) forKey:@"resolutionBits"];
    [result setValue:@(self.sampleRate) forKey:@"sampleRate"];
    [result setValue:@(self.channelCount) forKey:@"channelCount"];
    [result setValue:@(self.channelMask) forKey:@"channelMask"];
    [result setValue:@(self.packageSampleCount) forKey:@"packageSampleCount"];
    [result setValue:@(self.K) forKey:@"K"];

    NSMutableArray* channelsResult = [[NSMutableArray alloc] init];

    for (int channelIndex = 0;channelIndex < self.channelCount;++channelIndex){
        NSMutableArray<Sample*>* samples = [channelSamples objectAtIndex:channelIndex];
        NSMutableArray* samplesResult = [[NSMutableArray alloc] init];
        
        for (int sampleIndex = 0;sampleIndex < samples.count;++sampleIndex){
            Sample* sample = [samples objectAtIndex:sampleIndex];
            NSMutableDictionary* sampleResult = [[NSMutableDictionary alloc] init];
            [sampleResult setValue:@(sample.rawData) forKey:@"rawData"];
            [sampleResult setValue:@(sample.sampleIndex) forKey:@"sampleIndex"];
            [sampleResult setValue:@(sample.channelIndex) forKey:@"channelIndex"];
            [sampleResult setValue:@(sample.timeStampInMs) forKey:@"timeStampInMs"];
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
