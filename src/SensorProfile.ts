import { Synchronisdk } from './ModuleResolver';

import {
  DeviceStateEx,
  type BLEDevice,
  type DeviceInfo,
  type SensorData,
} from './NativeSynchronisdk';

export default class SensorProfile {
  private _supportEEG: boolean;
  private _supportECG: boolean;
  private _hasInited: boolean;
  private _isIniting: boolean;
  private _isFetchingPower: boolean;
  private _isFetchingDeviceInfo: boolean;
  private _isDataTransfering: boolean;
  private _isSwitchDataTransfering: boolean;
  private _powerCache: number;
  private _deviceInfo: DeviceInfo | undefined;
  private _device: BLEDevice;
  private _powerTimer: NodeJS.Timeout | undefined;
  private _onError:
    | ((sensor: SensorProfile, reason: string) => void)
    | undefined;
  private _onData:
    | ((sensor: SensorProfile, signalData: SensorData) => void)
    | undefined;
  private _onStateChange:
    | ((sensor: SensorProfile, newstate: DeviceStateEx) => void)
    | undefined;
  private _onPowerChange:
    | ((sensor: SensorProfile, power: number) => void)
    | undefined;

  constructor(device: BLEDevice) {
    this._device = device;
    this._supportEEG =
      this._supportECG =
      this._hasInited =
      this._isDataTransfering =
      this._isIniting =
      this._isFetchingPower =
      this._isFetchingDeviceInfo =
      this._isSwitchDataTransfering =
        false;
    this._powerCache = -1;
    this._deviceInfo = undefined;
    if (!Synchronisdk.initSensor(device.Address)) {
      console.error(
        'Invalid sensor profile: ' + device.Address + ' => ' + device.Name
      );
    }
  }

  private _reset(): void {
    this._supportEEG =
      this._supportECG =
      this._hasInited =
      this._isDataTransfering =
      this._isIniting =
      this._isFetchingPower =
      this._isFetchingDeviceInfo =
      this._isSwitchDataTransfering =
        false;
    this._powerCache = -1;
    this._deviceInfo = undefined;

    if (this._powerTimer) {
      clearInterval(this._powerTimer);
      this._powerTimer = undefined;
    }
  }
  //-----Callbacks-----//

  public set onStateChanged(
    callback: (sensor: SensorProfile, newstate: DeviceStateEx) => void
  ) {
    this._onStateChange = callback;
  }

  public emitStateChanged(newstate: DeviceStateEx) {
    if (newstate === DeviceStateEx.Disconnected) {
      this._reset();
    }
    if (this._onStateChange) {
      this._onStateChange(this, newstate);
    }
  }

  public set onErrorCallback(
    callback: (sensor: SensorProfile, reason: string) => void
  ) {
    this._onError = callback;
  }

  public emitError(error: any) {
    if (this._onError) {
      this._onError(this, error);
    }
  }

  public set onDataCallback(
    callback: (sensor: SensorProfile, signalData: SensorData) => void
  ) {
    this._onData = callback;
  }

  public emitOnData(signalData: SensorData) {
    if (this._onData) {
      this._onData(this, signalData);
    }
  }

  public set onPowerChanged(
    callback: (sensor: SensorProfile, power: number) => void
  ) {
    this._onPowerChange = callback;
  }

  refreshPower = async () => {
    let power = await this.batteryPower();
    if (this._onPowerChange) {
      this._onPowerChange(this, power);
    }
  };

  public get deviceState(): DeviceStateEx {
    let value = Synchronisdk.getDeviceState(this._device.Address);
    if (value === 'Disconnected') {
      return DeviceStateEx.Disconnected;
    } else if (value === 'Disconnecting') {
      return DeviceStateEx.Disconnecting;
    } else if (value === 'Connected') {
      return DeviceStateEx.Connected;
    } else if (value === 'Connecting') {
      return DeviceStateEx.Connecting;
    } else if (value === 'Ready') {
      return DeviceStateEx.Ready;
    } else if (value === 'Invalid') {
      return DeviceStateEx.Invalid;
    }
    return value;
  }

  public get isIniting(): boolean {
    return this._isIniting;
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

  public get BLEDevice(): BLEDevice {
    return this._device;
  }

  connect = async (): Promise<boolean> => {
    if (
      !(
        this.deviceState === DeviceStateEx.Disconnected ||
        this.deviceState === DeviceStateEx.Connected
      )
    ) {
      return false;
    }
    return this._connect();
  };

  disconnect = async (): Promise<boolean> => {
    if (
      !(
        this.deviceState === DeviceStateEx.Ready ||
        this.deviceState === DeviceStateEx.Connected
      )
    ) {
      return false;
    }
    this.stopDataNotification();
    this._reset();
    return this._disconnect();
  };

  startDataNotification = async (): Promise<boolean> => {
    if (this.deviceState !== DeviceStateEx.Ready) {
      return false;
    }
    if (this._isSwitchDataTransfering) {
      return false;
    }
    this._isSwitchDataTransfering = true;
    try {
      this._isDataTransfering = await this._startDataNotification();
      this._isSwitchDataTransfering = false;
      return this._isDataTransfering;
    } catch (error) {
      this._isSwitchDataTransfering = false;
      this.emitError(error);
      return false;
    }
  };

  stopDataNotification = async (): Promise<boolean> => {
    if (this.deviceState !== DeviceStateEx.Ready) {
      return false;
    }
    if (this._isSwitchDataTransfering) {
      return false;
    }
    this._isSwitchDataTransfering = true;
    try {
      this._isDataTransfering = !(await this._stopDataNotification());
      this._isSwitchDataTransfering = false;
      return this._isDataTransfering;
    } catch (error) {
      this._isSwitchDataTransfering = false;
      this.emitError(error);
      return false;
    }
  };

  batteryPower = async (): Promise<number> => {
    if (this.deviceState !== DeviceStateEx.Ready) {
      return -1;
    }
    if (this._isFetchingPower) {
      return this._powerCache;
    }
    this._isFetchingPower = true;
    try {
      this._powerCache = await this._getBatteryLevel();
      this._isFetchingPower = false;
      return this._powerCache;
    } catch (error) {
      this._isFetchingPower = false;
      this.emitError(error);
      return -1;
    }
  };

  deviceInfo = async (): Promise<DeviceInfo | undefined> => {
    if (this.deviceState !== DeviceStateEx.Ready) {
      return undefined;
    }
    if (this._isFetchingDeviceInfo) {
      return this._deviceInfo;
    }
    this._isFetchingDeviceInfo = true;
    try {
      this._deviceInfo = await this._getDeviceInfo();
      this._isFetchingDeviceInfo = false;
      return this._deviceInfo;
    } catch (error) {
      this._isFetchingDeviceInfo = false;
      this.emitError(error);
      return undefined;
    }
  };

  init = async (
    packageSampleCount: number,
    powerRefreshInterval: number
  ): Promise<boolean> => {
    if (this.deviceState !== DeviceStateEx.Ready) {
      return false;
    }
    if (this._hasInited) {
      return this._hasInited;
    }
    this._isIniting = true;
    try {
      await this.stopDataNotification();
    } catch (error) {}

    try {
      if (!this._powerTimer) {
        this._powerTimer = setInterval(this.refreshPower, powerRefreshInterval);
      }
    } catch (error) {}

    try {
      this._supportEEG = await this._initEEG(packageSampleCount);
    } catch (error) {
      this._supportEEG = false;
    }

    try {
      this._supportECG = await this._initECG(packageSampleCount);
    } catch (error) {
      this._supportECG = false;
    }

    try {
      if (this._supportEEG || this._supportECG) {
        this._hasInited = await this._initDataTransfer();
      } else {
        this._hasInited = false;
      }
      // console.log(this._supportEEG + "|" + this._supportECG + "|" + this._hasInited);
      this._isIniting = false;
      return this._hasInited;
    } catch (error) {
      this._isIniting = false;
      this._hasInited = false;
      this.emitError(error);
      return false;
    }
  };
  ////////////////////////////////////////////////////////

  private async _connect(): Promise<boolean> {
    return Synchronisdk.connect(this._device.Address);
  }

  private async _disconnect(): Promise<boolean> {
    return Synchronisdk.disconnect(this._device.Address);
  }

  private async _startDataNotification(): Promise<boolean> {
    return Synchronisdk.startDataNotification(this._device.Address);
  }

  private async _stopDataNotification(): Promise<boolean> {
    return Synchronisdk.stopDataNotification(this._device.Address);
  }

  private async _initEEG(packageSampleCount: number): Promise<boolean> {
    return Synchronisdk.initEEG(this._device.Address, packageSampleCount);
  }

  private async _initECG(packageSampleCount: number): Promise<boolean> {
    return Synchronisdk.initECG(this._device.Address, packageSampleCount);
  }

  private async _initDataTransfer(): Promise<boolean> {
    return Synchronisdk.initDataTransfer(this._device.Address);
  }

  private async _getBatteryLevel(): Promise<number> {
    return Synchronisdk.getBatteryLevel(this._device.Address);
  }

  private async _getDeviceInfo(): Promise<DeviceInfo> {
    return Synchronisdk.getDeviceInfo(this._device.Address);
  }
}
