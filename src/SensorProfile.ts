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
    if (
      this.deviceState === DeviceStateEx.Ready ||
      this.deviceState === DeviceStateEx.Connected
    ) {
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
      console.warn('Please startDataNotification after inited');
      return false;
    }
    if (!this.hasInited) {
      console.warn('Please startDataNotification after inited');
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
      console.warn('Please stopDataNotification after inited');
      return false;
    }
    if (!this.hasInited) {
      console.warn('Please stopDataNotification after inited');
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
            promise(!this._isDataTransfering);
          });
        });
    });
  };

  public batteryPower = async (): Promise<number> => {
    if (this.deviceState !== DeviceStateEx.Ready) {
      console.warn('Please getBattery after connected');
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
      console.warn('Please get deviceInfo after connected');
      return undefined;
    }
    if (!this.hasInited) {
      console.warn('Please get deviceInfo after inited');
      return undefined;
    }
    if (this._deviceInfo) {
      return this._deviceInfo;
    }

    return new Promise<DeviceInfo | undefined>((resolve) => {
      this._deviceInfoQueue.push(resolve);
      if (this._isFetchingDeviceInfo) {
        return;
      }
      this._isFetchingDeviceInfo = true;

      this._getDeviceInfo(false)
        .then((value: DeviceInfo | undefined) => {
          this._deviceInfo = value;
          if (this._deviceInfo) {
            this._deviceInfo.EegChannelCount = this._EEGChannelCount;
            this._deviceInfo.EcgChannelCount = this._ECGChannelCount;
            this._deviceInfo.AccChannelCount = this._IMUChannelCount;
            this._deviceInfo.GyroChannelCount = this._IMUChannelCount;
            this._deviceInfo.BrthChannelCount = this._BRTHChannelCount;
            this._deviceInfo.EmgChannelCount = this._EMGChannelCount;
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

  public setParam = async (key: string, value: string): Promise<string> => {
    if (this.deviceState !== DeviceStateEx.Ready) {
      console.warn('Please setParam after connected');
      return '';
    }

    return new Promise<string>((resolve, reject) => {
      this._setParam(key, value)
        .then((result: string) => {
          resolve(result);
        })
        .catch((error) => {
          this.emitError(error);
          reject(error);
        })
        .finally(() => {});
    });
  };
  public init = async (
    packageSampleCount: number,
    powerRefreshInterval: number
  ): Promise<boolean> => {
    if (this.deviceState !== DeviceStateEx.Ready) {
      console.warn('Please init after connected');
      return false;
    }
    if (packageSampleCount <= 0 || packageSampleCount >= 100) {
      console.warn('Please keep 0 < packageSampleCount <= 100');
      return false;
    }
    if (powerRefreshInterval <= 0) {
      console.warn('Please keep 0 < powerRefreshInterval');
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

          if (!this._hasInited && this._featureMap === 0) {
            //maybe ble error, disconnect
            this.disconnect();
          }
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

  private _featureMap: number;
  private _notifyFlag: number;
  private _EMGChannelCount: number;
  private _EEGChannelCount: number;
  private _ECGChannelCount: number;
  private _IMUChannelCount: number;
  private _BRTHChannelCount: number;
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

    this._featureMap = 0;
    this._notifyFlag = 0;
    this._EEGChannelCount = 0;
    this._ECGChannelCount = 0;
    this._IMUChannelCount = 0;
    this._BRTHChannelCount = 0;
    this._EMGChannelCount = 0;
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
    this._notifyFlag = 0;
    this._EEGChannelCount = 0;
    this._ECGChannelCount = 0;
    this._IMUChannelCount = 0;
    this._BRTHChannelCount = 0;
    this._EMGChannelCount = 0;
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
    } else if (newstate === DeviceStateEx.Connected && !this._isConnecting) {
      //for connect timeout
      this._onConnect(false);
      return;
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
        // console.log("CONNECT TIMEOUT");
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
        // console.log("DISCONNECT TIMEOUT");
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

    var index: number;
    const RETRY_COUNT = 10;

    for (index = 0; index < RETRY_COUNT; ++index) {
      try {
        this._featureMap = await this._initDataTransfer(true);
        if (this._featureMap > 0) {
          break;
        }
      } catch (error) {
        console.error(error);
        this._featureMap = 0;
      }
    }

    if (this._featureMap === 0) {
      this._hasInited = false;
      return false;
    }

    // console.log(this._featureMap);

    for (index = 0; index < RETRY_COUNT; ++index) {
      try {
        this._deviceInfo = await this._getDeviceInfo(true);
        // console.log(JSON.stringify(this._deviceInfo));
        if (this._deviceInfo.MTUSize >= 80) {
          break;
        }
      } catch (error) {
        console.error(error);
        this._deviceInfo = undefined;
      }
    }

    if (!this._deviceInfo) {
      this._hasInited = false;
      return false;
    }

    for (index = 0; index < RETRY_COUNT; ++index) {
      try {
        this._deviceInfo = await this._getDeviceInfo(false);
        console.log(JSON.stringify(this._deviceInfo));
        if (this._deviceInfo.MTUSize >= 80) {
          break;
        }
      } catch (error) {
        console.error(error);
        this._deviceInfo = undefined;
      }
    }

    if (!this._deviceInfo) {
      this._hasInited = false;
      return false;
    }

    /*eslint no-bitwise: ["error", { "allow": ["&"] }] */
    if (this._featureMap & 0x000400000) {
      for (index = 0; index < RETRY_COUNT; ++index) {
        console.log('init eeg');
        try {
          this._EEGChannelCount = await this._initEEG(packageSampleCount);
          if (this._EEGChannelCount > 0) {
            break;
          }
        } catch (error) {
          this._EEGChannelCount = 0;
        }
      }
    }

    /*eslint no-bitwise: ["error", { "allow": ["&"] }] */
    if (this._featureMap & 0x000800000) {
      for (index = 0; index < RETRY_COUNT; ++index) {
        console.log('init ecg');
        try {
          this._ECGChannelCount = await this._initECG(packageSampleCount);
          if (this._ECGChannelCount > 0) {
            break;
          }
        } catch (error) {
          this._ECGChannelCount = 0;
        }
      }
    }

    /*eslint no-bitwise: ["error", { "allow": ["&"] }] */
    if (this._featureMap & 0x002000000) {
      for (index = 0; index < RETRY_COUNT; ++index) {
        console.log('init imu');
        try {
          this._IMUChannelCount = await this._initIMU(packageSampleCount);
          if (this._IMUChannelCount > 0) {
            break;
          }
        } catch (error) {
          this._IMUChannelCount = 0;
        }
      }
    }

    /*eslint no-bitwise: ["error", { "allow": ["&"] }] */
    if (this._featureMap & 0x008000000) {
      for (index = 0; index < RETRY_COUNT; ++index) {
        console.log('init brth');
        try {
          this._BRTHChannelCount = await this._initBRTH(packageSampleCount);
          if (this._BRTHChannelCount > 0) {
            break;
          }
        } catch (error) {
          this._BRTHChannelCount = 0;
        }
      }
    }

    this._deviceInfo.EegChannelCount = this._EEGChannelCount;
    this._deviceInfo.EcgChannelCount = this._ECGChannelCount;
    this._deviceInfo.AccChannelCount = this._IMUChannelCount;
    this._deviceInfo.GyroChannelCount = this._IMUChannelCount;
    this._deviceInfo.BrthChannelCount = this._BRTHChannelCount;
    this._deviceInfo.EmgChannelCount = this._EMGChannelCount;

    if (
      this._EEGChannelCount === 0 &&
      this._ECGChannelCount === 0 &&
      this._BRTHChannelCount === 0 &&
      this._EMGChannelCount === 0
    ) {
      this._notifyFlag = 0;
      this._hasInited = false;
      return false;
    }

    for (index = 0; index < RETRY_COUNT; ++index) {
      console.log('init data transfer');
      try {
        this._notifyFlag = await this._initDataTransfer(false);
        this._hasInited = this._notifyFlag > 0;
        if (this._hasInited) {
          break;
        }
      } catch (error) {
        this._notifyFlag = 0;
        this._hasInited = false;
      }
    }

    return this._hasInited;
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

  private async _initBRTH(packageSampleCount: number): Promise<number> {
    return Synchronisdk.initBRTH(this._device.Address, packageSampleCount);
  }

  private async _initDataTransfer(isGetFeature: boolean): Promise<number> {
    return Synchronisdk.initDataTransfer(this._device.Address, isGetFeature);
  }

  private async _getBatteryLevel(): Promise<number> {
    return Synchronisdk.getBatteryLevel(this._device.Address);
  }

  private async _getDeviceInfo(onlyMTU: boolean): Promise<DeviceInfo> {
    return Synchronisdk.getDeviceInfo(this._device.Address, onlyMTU);
  }

  // private async _getParam(key: string): Promise<string> {
  //   return Synchronisdk.getParam(this._device.Address, key);
  // }

  private async _setParam(key: string, value: string): Promise<string> {
    return Synchronisdk.setParam(this._device.Address, key, value);
  }
}
