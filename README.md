# react-native-synchronisdk
OYMotion synchroni sdk for react native

## Brief
Synchroni SDK is the software development kit for developers to access OYMotion products.


## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)

## Installation

```sh
yarn add react-native-synchronisdk
```

## 1. Permission 

Application will obtain bluetooth permission by itself if use SynchroniProfile.
There are builtin code in SynchroniController. 

## 2. Import SDK

```js
import {
  SynchroniController,
  DeviceStateEx,
  type BLEDevice,
  type SynchroniData,
  DataType,
} from 'react-native-synchronisdk';

```

## 3. Initalize

```js
const SyncControllerInstance = SynchroniController.Instance;

SyncControllerInstance.onStateChanged = (newstate: DeviceStateEx) => {
//please do logic when device disconnected unexpected
};

SyncControllerInstance.onErrorCallback = (reason: string) => {
//called when error occurs
};

SyncControllerInstance.onDataCallback = (data: SensorData) => {
//called after start data transfer
};
```

## 4. Start scan

```js
public async startSearch(timeoutInMs: number): Promise<Array<BLEDevice>>
```
returns array of BLEDevice

## 5. Stop scan

```js
public async stopSearch(): Promise<void>
```


## 6. Connect device


```js
public async connect(device: BLEDevice): Promise<boolean>
```

## 7. Disconnect

```js
public async disconnect(): Promise<boolean>
```


## 8. Get device status

```js
public get connectionState(): DeviceStateEx
```

Please send command in 'Ready' state

```js
export enum DeviceStateEx {
  Disconnected,
  Connecting,
  Connected,
  Ready,
  Disconnecting,
}
```

## 9. DataNotify

### 9.1 Init data transfer

```js
public async init(): Promise<boolean> 
```

### 9.2 Start data transfer

```js
public async startDataNotification(): Promise<boolean>
```

Data type list：

```js
export enum DataType {
  NTF_EEG = 0x10,
  NTF_ECG = 0x11,
}
```

For start data transfer, use `startDataNotification` to start. Process data in onDataCallback.

```js
    SyncControllerInstance.onDataCallback = (data: SensorData) => {
      if (data.dataType === DataType.NTF_EEG) {
        lastEEG.current = data;
      } else if (data.dataType === DataType.NTF_ECG) {
        lastECG.current = data;
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

### 9.3 Stop data transfer

```js
public async stopDataNotification(): Promise<boolean>
```
