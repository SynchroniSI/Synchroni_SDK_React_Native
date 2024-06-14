import { Alert, PermissionsAndroid, Platform } from 'react-native';
import type { EmitterSubscription } from 'react-native';
import { NativeEventEmitter } from 'react-native';
import SensorProfile from './SensorProfile';
import { Synchronisdk } from './ModuleResolver';
import {
  DeviceStateEx,
  type BLEDevice,
  type EventResult,
  type SensorData,
} from './NativeSynchronisdk';

export default class SensorController {
  private static _instance: SensorController;
  private sensorProfiles: Array<SensorProfile>;
  private sensorProfileMap: Map<string, SensorProfile>;

  protected nativeEventEmitter: NativeEventEmitter;
  private onDevice: EmitterSubscription | undefined;

  public static get Instance() {
    return this._instance || (this._instance = new this());
  }

  private constructor() {
    this.sensorProfileMap = new Map<string, SensorProfile>();
    this.sensorProfiles = new Array<SensorProfile>(0);
    this.nativeEventEmitter = new NativeEventEmitter(Synchronisdk);
    this.nativeEventEmitter.addListener(
      'STATE_CHANGED',
      (state: EventResult) => {
        this.dispatchEvent('STATE_CHANGED', state);
      }
    );

    this.nativeEventEmitter.addListener('GOT_DATA', (data: SensorData) => {
      this.dispatchData('GOT_DATA', data);
    });

    this.nativeEventEmitter.addListener('GOT_ERROR', (error: EventResult) => {
      this.dispatchEvent('GOT_ERROR', error);
    });
  }

  public set onDeviceCallback(
    callback: (deviceList: Array<BLEDevice>) => void
  ) {
    if (callback) {
      this.AddOnDeviceCallback(callback);
    } else {
      this.RemoveOnDeviceCallback();
    }
  }

  private AddOnDeviceCallback(
    callback: (deviceList: Array<BLEDevice>) => void
  ) {
    this.RemoveOnDeviceCallback();
    this.onDevice = this.nativeEventEmitter.addListener(
      'GOT_DEVICE_LIST',
      (deviceList: Array<BLEDevice>) => {
        callback(deviceList);
      }
    );
  }

  private RemoveOnDeviceCallback() {
    if (this.onDevice !== undefined) this.onDevice.remove();
    this.onDevice = undefined;
  }

  /////////////////////////////////////////////////////////

  startScan = async (periodInMs: number): Promise<boolean> => {
    return new Promise<boolean>(async (resolve, reject) => {
      if (Platform.OS !== 'ios') {
        try {
          const result = await this.requestPermissionAndroid();
          if (!result) {
            console.log('request permisson fail');
            reject('request permisson fail');
            return;
          }
        } catch (error) {
          console.log('request permisson fail');
          reject('request permisson fail');
          return;
        }
      }

      if (this.isScaning) {
        reject('please search after search return');
        return;
      }

      this._startScan(periodInMs)
        .then((result: boolean) => {
          resolve(result);
        })
        .catch((reason: Error) => {
          reject(reason.message);
        });
    });
  };

  stopScan = async (): Promise<void> => {
    if (!this.isScaning) {
      return;
    }
    return this._stopScan();
  };

  public get isScaning(): boolean {
    return Synchronisdk.isScaning();
  }

  public get isEnable(): boolean {
    return Synchronisdk.isEnable();
  }

  requireSensor = (device: BLEDevice): SensorProfile => {
    const deviceMac = device.Address;
    if (this.sensorProfileMap.has(deviceMac)) {
      return this.sensorProfileMap.get(deviceMac)!;
    }
    const sensorProfile = new SensorProfile(device);
    this.sensorProfileMap.set(deviceMac, sensorProfile);
    this.sensorProfiles.push(sensorProfile);
    return sensorProfile;
  };

  getSensor = (deviceMac: string): SensorProfile | undefined => {
    return this.sensorProfileMap.get(deviceMac);
  };

  getConnectedSensors = (): SensorProfile[] => {
    let filterDevices = this.sensorProfiles.filter((item) => {
      return item.deviceState === DeviceStateEx.Ready;
    });
    return filterDevices;
  };

  getConnectedDevices = (): BLEDevice[] => {
    let devices = new Array<BLEDevice>(0);
    this.sensorProfiles.filter((item) => {
      if (item.deviceState === DeviceStateEx.Ready) {
        devices.push(item.BLEDevice);
      }
      return false;
    });
    return devices;
  };
  ////////////////////////////////////////////

  private async requestPermissionAndroid(): Promise<boolean> {
    const granted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION!
    );

    if (!granted) {
      const AsyncAlert = async () =>
        new Promise((resolve) => {
          Alert.alert(
            'note',
            'We need access to location to use bluetooth, including in the background to keep your device connected',
            [
              {
                text: 'ok',
                onPress: () => {
                  resolve('YES');
                },
              },
            ],
            { cancelable: false }
          );
        });

      await AsyncAlert();
      const granted1 = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION!
      );

      if (granted1 !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert(
          'We need access to location to connect to your bluetooth device'
        );

        throw 'Location perm denied';
      }
    }

    if (Number(Platform.Version) >= 31) {
      const granted2 = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN!
      );

      if (granted2 !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert(
          'We need access to bluetooth scan to connect to your bluetooth device'
        );

        throw 'Scan perm denied';
      }

      const granted3 = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT!
      );

      if (granted3 !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert(
          "We need access to 'bluetooth connect' to connect to your bluetooth device"
        );

        throw 'Connect perm denied';
      }
    }

    return true;
  }

  private _startScan(periodInMs: number): Promise<boolean> {
    return Synchronisdk.startScan(periodInMs);
  }

  private _stopScan(): Promise<void> {
    return Synchronisdk.stopScan();
  }

  private dispatchEvent(event: String, eventResult: EventResult) {
    var device = this.getSensor(eventResult.deviceMac);
    if (device) {
      if (event === 'STATE_CHANGED') {
        device.emitStateChanged(eventResult.newState);
      } else if (event === 'GOT_ERROR') {
        device.emitError(eventResult.errMsg);
      }
    }
  }

  private dispatchData(_: String, sensorData: SensorData) {
    var device = this.getSensor(sensorData.deviceMac);
    if (device) {
      device.emitOnData(sensorData);
    }
  }
}
