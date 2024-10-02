# react-native-synchronisdk
Synchroni sdk for react native

## Brief
Synchroni SDK is the software development kit for developers to access Synchroni products.


## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)

## Installation

```sh
yarn add  @synchroni/synchroni_sdk_react_native
```

## 1. Permission 

Application will obtain bluetooth permission by itself.
There are builtin code in SensorController for Android. 

## 2. Import SDK

```js
import {
  SensorController,
  SensorProfile,
  DeviceStateEx,
  DataType,
  type BLEDevice,
  type SensorData,
} from '@synchroni/synchroni_sdk_react_native';

```

# SensorController methods:
## 1. Initalize

```js
const SensorControllerInstance = SensorController.Instance;

//register scan listener
if (!SensorControllerInstance.hasDeviceCallback){
  SensorControllerInstance.onDeviceCallback = (devices: BLEDevice[]) =>{
    //return all devices doesn't connected 
  };
}

```

## 2. Start scan

Use `public async startScan(periodInMs: number): Promise<boolean>` to start scan
```js
const success = await SensorControllerInstance.startScan(6000)
```
returns true if start scan success, periodInMS means onDeviceCallback will be called every periodInMS, minium is 3000ms for iOS, 6000ms for Android

## 3. Stop scan

Use `public async stopScan(): Promise<void>` to stop scan
```js
await SensorControllerInstance.stopScan();
```
## 4. Check scaning

Use `public get isScaning(): boolean` to check scaning status
```js
const isScaning = SensorControllerInstance.isScaning;
```

## 5. Check if bluetooth is enabled

Use `public get isEnable(): boolean` to check if bluetooth is enabled
```js
const isEnable = SensorControllerInstance.isEnable;
```
## 6. Create SensorProfile

Use `public requireSensor(device: BLEDevice): SensorProfile | undefined` to create sensorProfile

If bleDevice is invalid, result is undefined
```js
const sensorProfile = SensorControllerInstance.requireSensor(bleDevice);
```

## 7. Get SensorProfile

Use `public getSensor(device: BLEDevice): SensorProfile | undefined` to get sensorProfile

If SensorProfile didn't created, result is undefined
```js
const sensorProfile = SensorControllerInstance.getSensor(bleDevice);
```

## 8. Get Connected SensorProfiles

Use `public getConnectedSensors(): SensorProfile[]` to get connected SensorProfiles
```js
const sensorProfiles = SensorControllerInstance.getConnectedSensors();
```

## 9. Get Connected BLE Devices

Use `public getConnectedDevices(): SensorProfile[]` to get connected BLE Devices
```js
const bleDevices = SensorControllerInstance.getConnectedDevices();
```

# SensorProfile methods:

## 1. Initalize
Please register callbacks for SensorProfile
```js
let sensorProfile = SensorControllerInstance.requireSensor(bledevice);
//register callbacks
sensorProfile.onStateChanged = (sensor: SensorProfile, newstate: DeviceStateEx) => {
    //please do logic when device disconnected unexpected
}

sensorProfile.onErrorCallback = (sensor: SensorProfile, reason: string) => {
    //called when error occurs
}

sensorProfile.onPowerChanged = (sensor: SensorProfile, power: number) => {
    //callback for get batter level of device, power from 0 - 100, -1 is invalid
}

sensorProfile.onDataCallback = (sensor: SensorProfile, data: SensorData) => {
    //called after start data transfer
}
```

## 2. Connect device
Use `public async connect(): Promise<boolean>` to connect
```js
const success = await sensorProfile.connect();
```

## 3. Disconnect
Use `public async disconnect(): Promise<boolean>` to disconnect
```js
const success = await sensorProfile.disconnect();
```


## 4. Get device status
Use `public get connectionState(): DeviceStateEx` to get device status

Please send command in 'Ready' state, should be after connect() return true

```js
const deviceStateEx = sensorProfile.connectionState;

# deviceStateEx has define:
export enum DeviceStateEx {
  Disconnected,
  Connecting,
  Connected,
  Ready,
  Disconnecting,
  Invalid,
}
```



## 5. Get BLE device of SensorProfile
Use `public get BLEDevice(): BLEDevice` to BLE device of SensorProfile
```js
const bleDevice = sensorProfile.BLEDevice;
```

## 6. Get device info of SensorProfile
Use `public async deviceInfo():  Promise<DeviceInfo | undefined>` to get device info of SensorProfile.

Please call after device in 'Ready' state, return undefined if it's not connected
```js
const deviceInfo = await sensorProfile.deviceInfo();

# deviceInfo has defines:
export type DeviceInfo = {
  DeviceName: string;
  ModelName: string;
  HardwareVersion: string;
  FirmwareVersion: string;
  EmgChannelCount: number;
  EegChannelCount: number;
  EcgChannelCount: number;
  AccChannelCount: number;
  GyroChannelCount: number;
  BrthChannelCount: number;
  MTUSize: number;
};
```


## 7. Init data transfer
Use `public async init(packageSampleCount: number, powerRefreshInterval: number): Promise<boolean>`.

Please call after device in 'Ready' state, return true if init succeed
```js
const success = await sensorProfile.init(5, 60*1000);
```
packageSampleCount:   set sample counts of SensorData.channelSamples in onDataCallback()
powerRefreshInterval: callback period for onPowerChanged()

## 8. Check if init data transfer succeed
Use `public get hasInited(): boolean` to check if init data transfer succeed
```js
const hasInited = sensorProfile.hasInited;
```

## 9. DataNotify
Use `public async startDataNotification(): Promise<boolean>` to start data notification.

Please call if hasInited() return true
### 9.1 Start data transfer

```js
const success = await sensorProfile.startDataNotification();
```

Data type list：

```js
export enum DataType {
  NTF_ACC = 0x1,    //unit is g
  NTF_GYRO = 0x2,   //unit is degree/s
  NTF_EEG = 0x10,   //unit is uV
  NTF_ECG = 0x11,   //unit is uV
  NTF_BRTH = 0x15,  //unit is uV
}
```

Process data in onDataCallback.

```js
    sensorProfile.onDataCallback = (sensor: SensorProfile, data: SensorData) => {
      if (data.dataType === DataType.NTF_EEG) {
        
      } else if (data.dataType === DataType.NTF_ECG) {
        
      }

      //process data as you wish
      data.channelSamples.forEach((oneChannelSamples) => {
        oneChannelSamples.forEach((sample) => {
          if (sample.isLost) {
            //do some logic
          } else {
            //draw with sample.data & sample.channelIndex
            // console.log(sample.channelIndex + ' | ' + sample.sampleIndex + ' | ' + sample.data + ' | ' + sample.impedance);
          }
        });
      });
    };
```

### 9.2 Stop data transfer
Use `public async stopDataNotification(): Promise<boolean>` to stop data transfer
```js
const success = await sensorProfile.stopDataNotification();
```

### 9.3 Check if it's data transfering
Use `public get isDataTransfering(): boolean` to check if it's data transfering
```js
const isDataTransfering = sensorProfile.isDataTransfering; 
```

## 10. Get battery level
Use `public async batteryPower(): Promise<number>` to get battery level. Please call after device in 'Ready' state

```js
const batteryPower = await sensorProfile.batteryPower();

# batteryPower is battery level returned, value ranges from 0 to 100, 0 means out of battery, while 100 means full.
```

Please check SimpleTest function in App