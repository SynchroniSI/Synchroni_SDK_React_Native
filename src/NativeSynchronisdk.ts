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
}

export type BLEDevice = {
  Name: string;
  Address: string;
  RSSI: number;
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
  connect(device: BLEDevice): Promise<boolean>;
  disconnect(): Promise<boolean>;
  startDataNotification(): Promise<boolean>;
  stopDataNotification(): Promise<boolean>;
  initEEG(packageSampleCount: number): Promise<boolean>;
  initECG(packageSampleCount: number): Promise<boolean>;
  initDataTransfer(): Promise<boolean>;
  getBatteryLevel(): Promise<number>;
  getControllerFirmwareVersion(): Promise<string>;
  getDeviceState(): DeviceStateEx;
  isScaning(): boolean;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Synchronisdk');
