import { PermissionsAndroid, Platform } from 'react-native';
import SensorProfile from './SensorProfile';
import { DeviceStateEx, type BLEDevice, type SensorData } from './NativeSynchronisdk';

export default class SensorController {
  private static _instance: SensorController;

  private synchronyProfile: SensorProfile;
  private _supportEEG: boolean;
  private _supportECG: boolean;
  private _hasInited: boolean;
  private _isSearching: boolean;
  private _isIniting: boolean;
  private _isFetchingPower: boolean;
  private _isFetchingFirmware: boolean;
  private _isDataTransfering: boolean;
  private _isSwitchDataTransfering: boolean;
  private _device: BLEDevice | null;
  private _powerCache: number;

  private _reset(): void {
    this._supportEEG =
      this._supportECG =
      this._hasInited =
      this._isDataTransfering =
      this._isIniting =
      this._isFetchingPower =
      this._isFetchingFirmware =
      this._isSwitchDataTransfering =
      this._isSearching =
        false;
    // this._device = null;
    this._powerCache = -1;
  }

  private constructor() {
    this._supportEEG =
      this._supportECG =
      this._hasInited =
      this._isDataTransfering =
      this._isIniting =
      this._isFetchingPower =
      this._isFetchingFirmware =
      this._isSwitchDataTransfering =
      this._isSearching =
        false;
    this._device = null;
    this._powerCache = -1;

    this.synchronyProfile = new SensorProfile((newstate: DeviceStateEx) => {
      if (newstate === DeviceStateEx.Disconnected) {
        this._reset();
      }
    });

    if (this.connectionState === DeviceStateEx.Ready) {
      this.synchronyProfile.disconnect();
    }
  }

  public static get Instance() {
    return this._instance || (this._instance = new this());
  }

  public get connectionState(): DeviceStateEx {
    return this.synchronyProfile.getDeviceState();
  }

  public get supportEEG(): boolean {
    return this._supportEEG;
  }

  public get supportECG(): boolean {
    return this._supportECG;
  }

  public get hasInited(): boolean {
    return this._hasInited;
  }

  public get isDataTransfering(): boolean {
    return this._isDataTransfering;
  }

  public get lastDevice(): BLEDevice | null {
    return this._device;
  }

  public set onStateChanged(callback: (newstate: DeviceStateEx) => void) {
    if (callback) {
      this.synchronyProfile.AddOnStateChanged(callback);
    } else {
      this.synchronyProfile.RemoveOnStateChanged();
    }
  }

  public set onErrorCallback(callback: (reason: string) => void) {
    if (callback) {
      this.synchronyProfile.AddOnErrorCallback(callback);
    } else {
      this.synchronyProfile.RemoveOnErrorCallback();
    }
  }

  public set onDataCallback(callback: (signalData: SensorData) => void) {
    if (callback) {
      this.synchronyProfile.AddOnDataCallback(callback);
    } else {
      this.synchronyProfile.RemoveOnDataCallback();
    }
  }

  private async requestPermissionAndroid(): Promise<boolean> {
    try {
      const p1 = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION!;
      const p2 = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT!;
      const p3 = PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN!;

      var result = await PermissionsAndroid.requestMultiple([p1]);
      console.log(result);
      if (result[p1] !== PermissionsAndroid.RESULTS.GRANTED) {
        return false;
      }

      if (Number(Platform.Version) >= 31) {
        result = await PermissionsAndroid.requestMultiple([p2]);
        console.log(result);
        if (result[p2] !== PermissionsAndroid.RESULTS.GRANTED) {
          return false;
        }

        result = await PermissionsAndroid.requestMultiple([p3]);
        console.log(result);
        if (result[p3] !== PermissionsAndroid.RESULTS.GRANTED) {
          return false;
        }
      }

      return true;
    } catch (err) {
      console.warn(err);
      return false;
    }
  }

  public async startSearch(timeoutInMs: number): Promise<Array<BLEDevice>> {
    return new Promise<Array<BLEDevice>>(async (resolve, reject) => {
      if (this.connectionState !== DeviceStateEx.Disconnected) {
        reject('please search when disconnected');
        return;
      }

      if (Platform.OS !== 'ios') {
        const result = await this.requestPermissionAndroid();
        if (!result) {
          console.log('request permisson fail');
          reject('request permisson fail');
          return;
        }
      }

      if (this._isSearching) {
        reject('please search after search return');
        return;
      }
      this._isSearching = true;

      this.synchronyProfile
        .startScan(timeoutInMs)
        .then((devices: BLEDevice[]) => {
          this._isSearching = false;
          resolve(devices);
        })
        .catch((reason: Error) => {
          this._isSearching = false;
          reject(reason.message);
        });
    });
  }

  public async stopSearch(): Promise<void> {
    if (this.connectionState !== DeviceStateEx.Ready) {
      return;
    }
    if (!this._isSearching) {
      return;
    }
    return this.synchronyProfile.stopScan();
  }

  public async connect(device: BLEDevice): Promise<boolean> {
    if (
      !(
        this.connectionState === DeviceStateEx.Disconnected ||
        this.connectionState === DeviceStateEx.Connected
      )
    ) {
      return false;
    }
    this._device = device;
    return this.synchronyProfile.connect(device);
  }

  public async disconnect(): Promise<boolean> {
    if (
      !(
        this.connectionState === DeviceStateEx.Ready ||
        this.connectionState === DeviceStateEx.Connected
      )
    ) {
      return false;
    }
    this.stopDataNotification();
    this._reset();
    return this.synchronyProfile.disconnect();
  }

  public async startDataNotification(): Promise<boolean> {
    if (this.connectionState !== DeviceStateEx.Ready) {
      return false;
    }
    if (this._isSwitchDataTransfering) {
      return false;
    }
    this._isSwitchDataTransfering = true;
    try {
      const result = await this.synchronyProfile.startDataNotification();
      if (result) {
        this._isDataTransfering = true;
      }
      this._isSwitchDataTransfering = false;
      return result;
    } catch (error) {
      this._isSwitchDataTransfering = false;
      this.synchronyProfile.emitError(error);
      return false;
    }
  }

  public async stopDataNotification(): Promise<boolean> {
    if (this.connectionState !== DeviceStateEx.Ready) {
      return false;
    }
    if (this._isSwitchDataTransfering) {
      return false;
    }
    this._isSwitchDataTransfering = true;
    try {
      const result = await this.synchronyProfile.stopDataNotification();
      if (result) {
        this._isDataTransfering = false;
      }
      this._isSwitchDataTransfering = false;
      return result;
    } catch (error) {
      this._isSwitchDataTransfering = false;
      this.synchronyProfile.emitError(error);
      return false;
    }
  }

  public async batteryPower(): Promise<number> {
    if (this.connectionState !== DeviceStateEx.Ready) {
      return -1;
    }
    if (this._isFetchingPower) {
      return this._powerCache;
    }
    this._isFetchingPower = true;
    try {
      const result = await this.synchronyProfile.getBatteryLevel();
      this._powerCache = result;
      this._isFetchingPower = false;
      return result;
    } catch (error) {
      this._isFetchingPower = false;
      this.synchronyProfile.emitError(error);
      return -1;
    }
  }

  public async firmwareVersion(): Promise<string> {
    if (this.connectionState !== DeviceStateEx.Ready) {
      return '';
    }
    if (this._isFetchingFirmware) {
      return '';
    }
    this._isFetchingFirmware = true;
    try {
      const result = await this.synchronyProfile.getControllerFirmwareVersion();
      this._isFetchingFirmware = false;
      return result;
    } catch (error) {
      this._isFetchingFirmware = false;
      this.synchronyProfile.emitError(error);
      return '';
    }
  }

  public async init(): Promise<boolean> {
    if (this.connectionState !== DeviceStateEx.Ready) {
      return false;
    }
    if (this._isIniting) {
      return this._hasInited;
    }
    if (this._hasInited) {
      return this._hasInited;
    }
    this._isIniting = true;
    try {
      await this.stopDataNotification();
    } catch (error) {}

    try {
      this._supportEEG = await this.synchronyProfile.initEEG(10);
    } catch (error) {
      this._supportEEG = false;
    }

    try {
      this._supportECG = await this.synchronyProfile.initECG(10);
    } catch (error) {
      this._supportECG = false;
    }

    try {
      if (this._supportEEG || this._supportECG) {
        this._hasInited = await this.synchronyProfile.initDataTransfer();
      } else {
        this._hasInited = false;
      }
      // console.log(this._supportEEG + "|" + this._supportECG + "|" + this._hasInited);
      this._isIniting = false;
      return this._hasInited;
    } catch (error) {
      this._isIniting = false;
      this._hasInited = false;
      this.synchronyProfile.emitError(error);
      return false;
    }
  }
}
