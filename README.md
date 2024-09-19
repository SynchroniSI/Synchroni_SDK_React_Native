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

Application will obtain bluetooth permission by itself if use SynchroniProfile.
There are builtin code in SynchroniController. 

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

```js
const success = SensorControllerInstance.startScan(6000/*periodInMs*/)
```
returns true if start scan success, periodInMS means onDeviceCallback will be called every periodInMS, minium is 6000ms

## 3. Stop scan

```js
await SensorControllerInstance.stopScan();
```
## 4. Check scaning
```js
const isScaning = SensorControllerInstance.isScaning();
```

## 5. Check if bluetooth is enabled
```js
const isEnable = SensorControllerInstance.isEnable();
```
## 6. Create SensorProfile, can be undefined

```js
const sensorProfile = SensorControllerInstance.requireSensor(bleDevice);
```

## 7. Get SensorProfile, can be undefined

```js
const sensorProfile = SensorControllerInstance.getSensor(bleDevice);
```

## 8. Get Connected SensorProfiles

```js
public SensorControllerInstance.getConnectedSensors(): SensorProfile[]
const sensorProfiles/*SensorProfile[]*/ = SensorControllerInstance.getConnectedSensors();
```

## 9. Get Connected BLE Devices

```js
const bleDevices/*BLEDevice[]*/ = SensorControllerInstance.getConnectedDevices();
```

# SensorProfile methods:

## 1. Initalize
Please use SensorController.requireSensor(device: BLEDevice)
```js
let sensorProfile = SensorControllerInstance.requireSensor(bledevice);
//register listeners
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

please await until connect return result
```js
const success = await sensorProfile.connect(bleDevice);
```

## 3. Disconnect

please await until disconnect return result
```js
const success = await sensorProfile.disconnect();
```


## 4. Get device status

```js
const deviceStateEx = sensorProfile.connectionState();
```

Please send command in 'Ready' state, should be after connect() return true

```js
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
```js
const bleDevice = sensorProfile.BLEDevice();
```

## 6. Get device info of SensorProfile
Please call after device in 'Ready' state, return undefined if it's not connected
```js
const deviceInfo = await sensorProfile.deviceInfo();
```


## 7. Init data transfer

Please call after device in 'Ready' state, return true if init succeed
```js
const success = await sensorProfile.init(5/*packageSampleCount*/,60*1000/*powerRefreshInterval*/);
```
packageSampleCount:   set sample counts of SensorData.channelSamples in onDataCallback()
powerRefreshInterval: callback period for onPowerChanged()

## 8. Check if init data transfer succeed

```js
const hasInited = sensorProfile.hasInited();
```


## 9. DataNotify
Please call if hasInited() return true
### 9.1 Start data transfer

```js
const success = await sensorProfile.startDataNotification();
```

Data type list：

```js
export enum DataType {
  NTF_ACC = 0x1,
  NTF_GYRO = 0x2,
  NTF_EEG = 0x10,
  NTF_ECG = 0x11,
  NTF_BRTH = 0x15,
}
```

For start data transfer, use `startDataNotification` to start. Process data in onDataCallback.

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

```js
const success = await sensorProfile.stopDataNotification();
```

### 9.3 Check if it's data transfering

```js
const isDataTransfering = await sensorProfile.isDataTransfering();
```

## 10. Get batter level
Please call after device in 'Ready' state, power from 0 - 100, -1 is invalid
```js
const batteryPower = await sensorProfile.batteryPower();
```

Please check SimpleTest function in App