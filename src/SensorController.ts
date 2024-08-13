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
  public static get Instance() {
    return this._instance || (this._instance = new this());
  }

  public get isScaning(): boolean {
    return Synchronisdk.isScaning();
  }

  public get isEnable(): boolean {
    return Synchronisdk.isEnable();
  }

  public get hasDeviceCallback(): boolean {
    return this.onDevice !== undefined;
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

  public startScan = async (periodInMs: number): Promise<boolean> => {
    return new Promise<boolean>(async (resolve) => {
      if (Platform.OS !== 'ios') {
        try {
          const result = await this.requestPermissionAndroid();
          if (!result) {
            console.log('request permisson fail');
            resolve(false);
            return;
          }
        } catch (error) {
          console.log('request permisson fail');
          resolve(false);
          return;
        }
      }

      this._startScan(periodInMs)
        .then((result: boolean) => {
          resolve(result);
        })
        .catch((reason: Error) => {
          console.log(reason.message);
          resolve(false);
        });
    });
  };

  public stopScan = async (): Promise<void> => {
    return this._stopScan();
  };

  public requireSensor = (device: BLEDevice): SensorProfile | undefined => {
    if (!device || !device.Address || device.Address === '') {
      return undefined;
    }
    const deviceMac = device.Address;
    if (this.sensorProfileMap.has(deviceMac)) {
      return this.sensorProfileMap.get(deviceMac)!;
    }
    const sensorProfile = new SensorProfile(device);
    this.sensorProfileMap.set(deviceMac, sensorProfile);
    this.sensorProfiles.push(sensorProfile);
    return sensorProfile;
  };

  public getSensor = (deviceMac: string): SensorProfile | undefined => {
    return this.sensorProfileMap.get(deviceMac);
  };

  public getConnectedSensors = (): SensorProfile[] => {
    let filterDevices = this.sensorProfiles.filter((item) => {
      return item.deviceState === DeviceStateEx.Ready;
    });
    return filterDevices;
  };

  public getConnectedDevices = (): BLEDevice[] => {
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
  private static _instance: SensorController;
  private sensorProfiles: Array<SensorProfile>;
  private sensorProfileMap: Map<string, SensorProfile>;

  protected nativeEventEmitter: NativeEventEmitter;
  private onDevice: EmitterSubscription | undefined;

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
