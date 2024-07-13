import { Synchronisdk } from './ModuleResolver';

import {
  DeviceStateEx,
  type BLEDevice,
  type DeviceInfo,
  type SensorData,
} from './NativeSynchronisdk';

export default class SensorProfile {
  //-----Callbacks-----//
  public set onStateChanged(
    callback: (sensor: SensorProfile, newstate: DeviceStateEx) => void
  ) {
    this._onStateChange = callback;
  }

  public set onErrorCallback(
    callback: (sensor: SensorProfile, reason: string) => void
  ) {
    this._onError = callback;
  }

  public set onDataCallback(
    callback: (sensor: SensorProfile, signalData: SensorData) => void
  ) {
    this._onData = callback;
  }

  public set onNativeDataCallback(
    callback: (sensor: SensorProfile, base64Data: string) => void
  ) {
    this._onNativeData = callback;
  }

  public set onPowerChanged(
    callback: (sensor: SensorProfile, power: number) => void
  ) {
    this._onPowerChange = callback;
  }

  ////////////////////////////////////////////
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

  public get hasInited(): boolean {
    return this._hasInited;
  }

  public get isDataTransfering(): boolean {
    return this._isDataTransfering;
  }

  public get BLEDevice(): BLEDevice {
    return this._device;
  }

  ////////////////////////////////////////////
  public connect = async (): Promise<boolean> => {
    if (this.deviceState === DeviceStateEx.Ready) {
      return true;
    }

    if (this._isDisconnecting) {
      console.warn('Please connect after disconnect return');
      return false;
    }
    return new Promise<boolean>((resolve) => {
      this._connectQueue.push(resolve);
      if (this._isConnecting) {
        return;
      }
      this._isConnecting = true;

      this._connect()
        .then((value: boolean) => {
          if (value) {
            this._connectTick = new Date().getTime();
          } else {
            this._onConnect(false);
          }
        })
        .catch((error) => {
          this.emitError(error);
          this._onConnect(false);
        });
    });
  };

  public disconnect = async (): Promise<boolean> => {
    if (this.deviceState === DeviceStateEx.Disconnected) {
      return true;
    }
    if (this._isConnecting) {
      console.warn('Please disconnect after connect return');
      return false;
    }
    return new Promise<boolean>((resolve) => {
      this._disconnectQueue.push(resolve);
      if (this._isDisconnecting) {
        return;
      }
      this._isDisconnecting = true;

      this._disconnect()
        .then((value: boolean) => {
          if (value) {
            this._disConnectTick = new Date().getTime();
          } else {
            this._onDisconnect(false);
          }
        })
        .catch((error) => {
          this.emitError(error);
          this._onDisconnect(false);
        });
    });
  };

  public startDataNotification = async (): Promise<boolean> => {
    if (this.deviceState !== DeviceStateEx.Ready) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      this._startDataNotificationQueue.push(resolve);
      if (this._isSwitchDataTransfering) {
        return;
      }
      this._isSwitchDataTransfering = true;

      this._startDataNotification()
        .then((value: boolean) => {
          this._isDataTransfering = value;
        })
        .catch((error) => {
          this.emitError(error);
        })
        .finally(() => {
          this._isSwitchDataTransfering = false;
          const pendings = this._startDataNotificationQueue;
          this._startDataNotificationQueue = [];
          pendings.forEach((promise) => {
            promise(this._isDataTransfering);
          });
        });
    });
  };

  public stopDataNotification = async (): Promise<boolean> => {
    if (this.deviceState !== DeviceStateEx.Ready) {
      return false;
    }
    return new Promise<boolean>((resolve) => {
      this._stopDataNotificationQueue.push(resolve);
      if (this._isSwitchDataTransfering) {
        return;
      }
      this._isSwitchDataTransfering = true;

      this._stopDataNotification()
        .then((value: boolean) => {
          if (value) {
            this._isDataTransfering = false;
          }
        })
        .catch((error) => {
          this.emitError(error);
        })
        .finally(() => {
          this._isSwitchDataTransfering = false;
          const pendings = this._stopDataNotificationQueue;
          this._stopDataNotificationQueue = [];
          pendings.forEach((promise) => {
            promise(this._isDataTransfering);
          });
        });
    });
  };

  public batteryPower = async (): Promise<number> => {
    if (this.deviceState !== DeviceStateEx.Ready) {
      return -1;
    }

    return new Promise<number>((resolve) => {
      this._batteryPowerQueue.push(resolve);
      if (this._isFetchingPower) {
        return;
      }
      this._isFetchingPower = true;

      this._getBatteryLevel()
        .then((value: number) => {
          this._powerCache = value;
        })
        .catch((error) => {
          this.emitError(error);
        })
        .finally(() => {
          this._isFetchingPower = false;
          const pendings = this._batteryPowerQueue;
          this._batteryPowerQueue = [];

          pendings.forEach((promise) => {
            promise(this._powerCache);
          });
        });
    });
  };

  public deviceInfo = async (): Promise<DeviceInfo | undefined> => {
    if (this.deviceState !== DeviceStateEx.Ready) {
      return undefined;
    }

    if (this._deviceInfo) {
      this._deviceInfo.EegChannelCount = this._EEGChannelCount;
      this._deviceInfo.EcgChannelCount = this._ECGChannelCount;
      this._deviceInfo.AccChannelCount = this._IMUChannelCount;
      this._deviceInfo.GyroChannelCount = this._IMUChannelCount;
      return this._deviceInfo;
    }

    return new Promise<DeviceInfo | undefined>((resolve) => {
      this._deviceInfoQueue.push(resolve);
      if (this._isFetchingDeviceInfo) {
        return;
      }
      this._isFetchingDeviceInfo = true;

      this._getDeviceInfo()
        .then((value: DeviceInfo | undefined) => {
          this._deviceInfo = value;
          if (this._deviceInfo) {
            this._deviceInfo.EegChannelCount = this._EEGChannelCount;
            this._deviceInfo.EcgChannelCount = this._ECGChannelCount;
            this._deviceInfo.AccChannelCount = this._IMUChannelCount;
            this._deviceInfo.GyroChannelCount = this._IMUChannelCount;
          }
        })
        .catch((error) => {
          this.emitError(error);
        })
        .finally(() => {
          this._isFetchingDeviceInfo = false;
          const pendings = this._deviceInfoQueue;
          this._deviceInfoQueue = [];

          pendings.forEach((promise) => {
            promise(this._deviceInfo);
          });
        });
    });
  };

  public init = async (
    packageSampleCount: number,
    powerRefreshInterval: number
  ): Promise<boolean> => {
    if (this.deviceState !== DeviceStateEx.Ready) {
      return false;
    }
    if (this._hasInited) {
      return this._hasInited;
    }

    return new Promise<boolean>((resolve) => {
      this._initQueue.push(resolve);
      if (this._isIniting) {
        return;
      }
      this._isIniting = true;

      this._doInit(packageSampleCount, powerRefreshInterval)
        .then((value: boolean) => {
          this._hasInited = value;
        })
        .catch((error) => {
          this._hasInited = false;
          this.emitError(error);
        })
        .finally(() => {
          this._isIniting = false;

          const pendings = this._initQueue;
          this._initQueue = [];

          pendings.forEach((promise) => {
            promise(this._hasInited);
          });
        });
    });
  };

  ////////////////////////////////////////////////
  private _batteryPowerQueue: Array<any>;
  private _deviceInfoQueue: Array<any>;
  private _initQueue: Array<any>;
  private _startDataNotificationQueue: Array<any>;
  private _stopDataNotificationQueue: Array<any>;
  private _connectQueue: Array<any>;
  private _disconnectQueue: Array<any>;

  private _EEGChannelCount: number;
  private _ECGChannelCount: number;
  private _IMUChannelCount: number;
  private _isConnecting: boolean;
  private _isDisconnecting: boolean;
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
  private _connectionTimer: NodeJS.Timeout | undefined;
  private _connectTick: number;
  private _disConnectTick: number;
  private _onError:
    | ((sensor: SensorProfile, reason: string) => void)
    | undefined;
  private _onData:
    | ((sensor: SensorProfile, signalData: SensorData) => void)
    | undefined;
  private _onNativeData:
    | ((sensor: SensorProfile, base64Data: string) => void)
    | undefined;
  private _onStateChange:
    | ((sensor: SensorProfile, newstate: DeviceStateEx) => void)
    | undefined;
  private _onPowerChange:
    | ((sensor: SensorProfile, power: number) => void)
    | undefined;

  constructor(device: BLEDevice) {
    this._batteryPowerQueue = [];
    this._deviceInfoQueue = [];
    this._initQueue = [];
    this._startDataNotificationQueue = [];
    this._stopDataNotificationQueue = [];
    this._connectQueue = [];
    this._disconnectQueue = [];
    this._device = device;

    this._hasInited =
      this._isDataTransfering =
      this._isIniting =
      this._isConnecting =
      this._isDisconnecting =
      this._isFetchingPower =
      this._isFetchingDeviceInfo =
      this._isSwitchDataTransfering =
        false;
    this._powerCache = this._connectTick = this._disConnectTick = -1;

    this._EEGChannelCount = 0;
    this._ECGChannelCount = 0;
    this._IMUChannelCount = 0;
    this._deviceInfo = undefined;

    if (!Synchronisdk.initSensor(device.Address)) {
      console.error(
        'Invalid sensor profile: ' + device.Address + ' => ' + device.Name
      );
    }
    try {
      if (!this._connectionTimer) {
        this._connectionTimer = setInterval(this._refreshConnection, 1000);
      }
    } catch (error) {}
  }

  private _reset(): void {
    this._hasInited =
      this._isDataTransfering =
      this._isIniting =
      this._isFetchingPower =
      this._isFetchingDeviceInfo =
      this._isSwitchDataTransfering =
        false;
    this._powerCache = -1;
    this._EEGChannelCount = 0;
    this._ECGChannelCount = 0;
    this._IMUChannelCount = 0;
    this._deviceInfo = undefined;

    if (this._powerTimer) {
      clearInterval(this._powerTimer);
      this._powerTimer = undefined;
    }
  }

  emitStateChanged(newstate: DeviceStateEx) {
    if (newstate === DeviceStateEx.Disconnected) {
      this._onDisconnect(true);
    } else if (newstate === DeviceStateEx.Ready) {
      this._onConnect(true);
    }
    if (this._onStateChange) {
      this._onStateChange(this, newstate);
    }
  }

  emitError(error: any) {
    if (this._onError) {
      this._onError(this, error);
    }
  }

  emitOnData(signalData: SensorData) {
    if (this._onData) {
      this._onData(this, signalData);
    }
  }

  emitOnNativeData(base64Data: string) {
    if (this._onNativeData) {
      this._onNativeData(this, base64Data);
    }
  }

  private _refreshPower = async () => {
    let power = await this.batteryPower();
    if (this._onPowerChange) {
      this._onPowerChange(this, power);
    }
  };

  private _onConnect = (result: boolean): void => {
    this._isConnecting = false;
    this._connectTick = -1;

    const pendings = this._connectQueue;
    this._connectQueue = [];
    pendings.forEach((promise) => {
      promise(result);
    });

    if (result) {
    } else {
      this.disconnect();
    }
  };

  private _onDisconnect = (result: boolean): void => {
    this._isDisconnecting = false;
    this._disConnectTick = -1;

    const pendings = this._disconnectQueue;
    this._disconnectQueue = [];
    pendings.forEach((promise) => {
      promise(result);
    });

    if (result) {
      this._reset();
    } else {
      this.disconnect();
    }
  };

  private _refreshConnection = (): void => {
    const TIMEOUT = 10000;

    if (this._connectTick > -1) {
      const delta = new Date().getTime() - this._connectTick;
      if (delta >= TIMEOUT) {
        if (this.deviceState === DeviceStateEx.Ready) {
          this._onConnect(true);
        } else {
          this._onConnect(false);
        }
      }
    }

    if (this._disConnectTick > -1) {
      const delta = new Date().getTime() - this._disConnectTick;
      if (delta >= TIMEOUT) {
        if (this.deviceState === DeviceStateEx.Disconnected) {
          this._onDisconnect(true);
        } else {
          this._onDisconnect(false);
        }
      }
    }
  };

  private _doInit = async (
    packageSampleCount: number,
    powerRefreshInterval: number
  ): Promise<boolean> => {
    try {
      if (!this._powerTimer) {
        this._powerTimer = setInterval(
          this._refreshPower,
          powerRefreshInterval
        );
      }
    } catch (error) {}

    try {
      this._EEGChannelCount = await this._initEEG(packageSampleCount);
    } catch (error) {
      this._EEGChannelCount = 0;
    }

    try {
      this._ECGChannelCount = await this._initECG(packageSampleCount);
    } catch (error) {
      this._ECGChannelCount = 0;
    }

    try {
      this._IMUChannelCount = await this._initIMU(packageSampleCount);
    } catch (error) {
      this._IMUChannelCount = 0;
    }

    try {
      if (this._EEGChannelCount > 0 || this._ECGChannelCount > 0) {
        this._hasInited = await this._initDataTransfer();
      } else {
        this._hasInited = false;
      }
      // console.log(this._supportEEG + "|" + this._supportECG + "|" + this._hasInited);
      return this._hasInited;
    } catch (error) {
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

  private async _initEEG(packageSampleCount: number): Promise<number> {
    return Synchronisdk.initEEG(this._device.Address, packageSampleCount);
  }

  private async _initECG(packageSampleCount: number): Promise<number> {
    return Synchronisdk.initECG(this._device.Address, packageSampleCount);
  }

  private async _initIMU(packageSampleCount: number): Promise<number> {
    return Synchronisdk.initIMU(this._device.Address, packageSampleCount);
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
