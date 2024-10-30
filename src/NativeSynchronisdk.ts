import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export enum DeviceStateEx {
  Disconnected,
  Connecting,
  Connected,
  Ready,
  Disconnecting,
  Invalid,
}

export enum DataType {
  NTF_ACC = 0x1,
  NTF_GYRO = 0x2,
  NTF_EEG = 0x10,
  NTF_ECG = 0x11,
  NTF_BRTH = 0x15,
}

export type BLEDevice = {
  Name: string;
  Address: string;
  RSSI: number;
};

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

export type EventResult = {
  deviceMac: string;
  errMsg: string;
  newState: DeviceStateEx;
};

export type Sample = {
  // rawData: number;
  data: number;
  impedance: number;
  saturation: number;
  // timeStampInMs: number;
  sampleIndex: number;
  // channelIndex: number;
  isLost: boolean;
};

export type SensorData = {
  deviceMac: string;
  dataType: DataType;
  // resolutionBits: number;
  sampleRate: number;
  channelCount: number;
  // channelMask: number;
  packageSampleCount: number;
  // K: number;
  channelSamples: Array<Array<Sample>>; //First array is channel, second array is samples
};

export interface Spec extends TurboModule {
  addListener(eventType: string): void;
  removeListeners(count: number): void;
  startScan(periodInMs: number): Promise<boolean>;
  stopScan(): Promise<void>;
  isScaning(): boolean;
  isEnable(): boolean;
  doInitSensor(deviceMac: string): boolean;
  connect(deviceMac: string): Promise<boolean>;
  disconnect(deviceMac: string): Promise<boolean>;
  startDataNotification(deviceMac: string): Promise<boolean>;
  stopDataNotification(deviceMac: string): Promise<boolean>;
  initEEG(deviceMac: string, packageSampleCount: number): Promise<number>;
  initECG(deviceMac: string, packageSampleCount: number): Promise<number>;
  initIMU(deviceMac: string, packageSampleCount: number): Promise<number>;
  initBRTH(deviceMac: string, packageSampleCount: number): Promise<number>;
  initDataTransfer(deviceMac: string, isGetFeature: boolean): Promise<number>;
  getBatteryLevel(deviceMac: string): Promise<number>;
  getDeviceInfo(deviceMac: string, onlyMTU: boolean): Promise<DeviceInfo>;
  getDeviceState(deviceMac: string): DeviceStateEx;
  // getParam(deviceMac: string, key: string): Promise<string>;
  setParam(deviceMac: string, key: string, value: string): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Synchronisdk');
