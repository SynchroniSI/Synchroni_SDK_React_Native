// import VConsole from '@kafudev/react-native-vconsole';
import React from 'react';
import RNFS from 'react-native-fs';
import { StyleSheet, View, Text, Button } from 'react-native';
import {
  SensorController,
  SensorProfile,
  DeviceStateEx,
  DataType,
  type BLEDevice,
  type SensorData,
} from '@synchroni/synchroni_sdk_react_native';

const SensorControllerInstance = SensorController.Instance;
const PackageSampleCount = 16;
const PowerRefreshInterval = 30 * 1000;

type DataCtx = {
  sensor: SensorProfile;
  power?: number;
  lastEEG?: SensorData;
  lastECG?: SensorData;
  lastACC?: SensorData;
  lastGYRO?: SensorData;
};

export default function App() {
  async function SimpleTest() {
    if (!SensorControllerInstance.isEnable) {
      console.error('please open bluetooth');
      return;
    }

    if (!SensorControllerInstance.isScaning) {
      console.log('start scan');
      if (!(await SensorControllerInstance.startScan(2000))) {
        console.error('please try scan later');
      }
    }

    if (!SensorControllerInstance.hasDeviceCallback) {
      SensorControllerInstance.onDeviceCallback = async (
        devices: BLEDevice[]
      ) => {
        console.log('stop scan');
        await SensorControllerInstance.stopScan();

        let filterDevices = devices.filter((item) => {
          return (
            item.Name.startsWith('OB') ||
            item.Name.startsWith('SYNC') ||
            item.Name.startsWith('Sync')
          );
        });
        if (!filterDevices || filterDevices.length <= 0) {
          console.log('no device found');
          return;
        }

        filterDevices.forEach(async (device) => {
          const sensor = SensorControllerInstance.requireSensor(device);
          if (!sensor) {
            return;
          }
          //check state & connect
          if (sensor.deviceState !== DeviceStateEx.Ready) {
            console.log('connecting: ' + sensor.BLEDevice.Address);
            if (!(await sensor.connect())) {
              console.error(
                'connect device: ' + sensor.BLEDevice.Name + ' failed'
              );
              return;
            }
          }
          //init & start data transfer
          if (!sensor.hasInited) {
            const debugLogPath =
              RNFS.TemporaryDirectoryPath +
              '/ble_data_log_' +
              sensor.BLEDevice.Name +
              '_' +
              Date.now() +
              '.csv';
            try {
              const filterResult = await sensor.setParam('FILTER_50HZ', 'OFF');
              console.log('FILTER_50HZ: ' + filterResult);
              const notifyResult = await sensor.setParam('NTF_IMPEDANCE', 'OFF');
              console.log('notifyResult: ' + notifyResult);
              const debugResult = await sensor.setParam(
                'DEBUG_BLE_DATA_PATH',
                debugLogPath
              );
              console.log(
                'DEBUG_BLE_DATA_PATH: ' + debugLogPath + ' : ' + debugResult
              );
            } catch (error) {
              console.error(error);
            }

            if (!(await sensor.init(5, 5000))) {
              console.error(
                'init device: ' + sensor.BLEDevice.Name + ' failed'
              );
              return;
            }
            console.log(
              'deviceInfo: ' + JSON.stringify(await sensor.deviceInfo())
            );
            console.log('start data transfer');
            if (!(await sensor.startDataNotification())) {
              console.error(
                'start data transfer with device: ' +
                  sensor.BLEDevice.Name +
                  ' failed'
              );
              return;
            }

            sensor.onDataCallback = async (
              _sensor: SensorProfile,
              data: SensorData
            ) => {
              if (
                data.dataType === DataType.NTF_EEG ||
                data.dataType === DataType.NTF_ECG ||
                data.dataType === DataType.NTF_BRTH ||
                data.dataType === DataType.NTF_ACC ||
                data.dataType === DataType.NTF_GYRO
              ) {
                console.log(
                  'got data from sensor: ' +
                    _sensor.BLEDevice.Name +
                    ' data type: ' +
                    data.dataType
                );
              }

              if (_sensor.isDataTransfering) {
                await _sensor.stopDataNotification();
              }
            };

            sensor.onPowerChanged = async (
              _sensor: SensorProfile,
              power: number
            ) => {
              console.log(
                'connected sensor: ' +
                  _sensor.BLEDevice.Name +
                  ' power: ' +
                  power
              );
              await _sensor.disconnect();
            };

            sensor.onStateChanged = (
              _sensor: SensorProfile,
              newstate: DeviceStateEx
            ) => {
              if (newstate === DeviceStateEx.Disconnected) {
                console.log(
                  'device: ' + _sensor.BLEDevice.Name + ' disconnected'
                );
              }
            };
          }
        });
      };
    }
    //show connected sensors and disconnect
    const connectedSensors = SensorControllerInstance.getConnectedSensors();
    connectedSensors.forEach(async (connectedSensor) => {
      if (connectedSensor.hasInited) {
        console.log(
          'connected sensor: ' +
            connectedSensor.BLEDevice.Name +
            ' power: ' +
            (await connectedSensor.batteryPower())
        );
        await connectedSensor.disconnect();
      }
    });
  }

  const [device, setDevice] = React.useState<string>();
  const [state, setState] = React.useState<DeviceStateEx>();
  const [message, setMessage] = React.useState<string>();
  const [eegInfo, setEEGInfo] = React.useState<string>();
  const [eegSample, setEEGSample] = React.useState<string>();
  const [ecgInfo, setECGInfo] = React.useState<string>();
  const [ecgSample, setECGSample] = React.useState<string>();
  const [accInfo, setAccInfo] = React.useState<string>();
  const [gyroInfo, setGyroInfo] = React.useState<string>();

  const selectedDeviceIdx = React.useRef<number>(); //only show selected device
  const allDevices = React.useRef<Array<BLEDevice>>();
  const dataCtxMap = React.useRef<Map<string, DataCtx>>(); // MAC => data context
  let loopTimer = React.useRef<NodeJS.Timeout>();

  async function onScanButton() {
    //do global init
    if (!dataCtxMap.current) {
      dataCtxMap.current = new Map<string, DataCtx>();
      selectedDeviceIdx.current = 0;
      SensorControllerInstance.onDeviceCallback = updateDeviceList;
    }
    if (!loopTimer.current) {
      loopTimer.current = setInterval(() => {
        refreshDeviceInfo();
      }, 1000);
    }

    //scan logic
    if (!SensorControllerInstance.isEnable) {
      setMessage('please open bluetooth');
      return;
    }

    if (!SensorControllerInstance.isScaning) {
      setMessage('scanning');
      await SensorControllerInstance.startScan(2000);
    } else {
      setMessage('stop scan');
      SensorControllerInstance.stopScan();
    }
  }

  //connect/disconnect logic
  async function onConnectDisonnectButton() {
    const bledevice = getSelectedDevice();
    if (!bledevice) return;
    const sensor = SensorControllerInstance.getSensor(bledevice.Address);
    if (!sensor) return;

    //check if device is connected
    if (sensor.deviceState === DeviceStateEx.Ready) {
      //disconnect
      if (await sensor.disconnect()) {
        setMessage('disconnect: ' + bledevice.Name + ' success');
      } else {
        setMessage('disconnect: ' + bledevice.Name + ' fail');
      }
    } else {
      //"connect" -> "register listeners" -> "init" -> "startDataNotify" -> "query device info"
      setMessage('connecting');
      if (!(await sensor.connect())) {
        setMessage('connect: ' + bledevice.Name + ' fail');
      } else {
        setMessage('initing');
        requireSensorData(bledevice); //register all listener

        const inited = await sensor.init(
          PackageSampleCount,
          PowerRefreshInterval
        );
        if (!inited) {
          setMessage('init fail');
          return;
        }

        await sensor.startDataNotification();
        const deviceInfo = await sensor.deviceInfo();

        //show device info 5s
        setMessage(
          'Device: ' + JSON.stringify(deviceInfo) + ' \n inited: ' + inited
        );
        setEEGInfo('');
        setEEGSample('');
        setECGInfo('');
        setECGSample('');
        setAccInfo('');
        setGyroInfo('');

        setTimeout(() => {
          setMessage('');
        }, 5000);
      }
    }
  }

  //register all listeners
  function requireSensorData(bledevice: BLEDevice): DataCtx | undefined {
    if (dataCtxMap.current!.has(bledevice.Address)) {
      return dataCtxMap.current!.get(bledevice.Address)!;
    }
    //do init context and set callback
    let sensorProfile = SensorControllerInstance.requireSensor(bledevice);
    if (!sensorProfile) {
      return undefined;
    }
    const newDataCtx: DataCtx = { sensor: sensorProfile };
    dataCtxMap.current!.set(bledevice.Address, newDataCtx);

    sensorProfile.onStateChanged = (
      sensor: SensorProfile,
      newstate: DeviceStateEx
    ) => {
      // handle device disconnect, purge data cache
      const dataCtx = dataCtxMap.current!.get(sensor.BLEDevice.Address)!;
      if (newstate === DeviceStateEx.Disconnected) {
        dataCtx.lastEEG = undefined;
        dataCtx.lastECG = undefined;
        dataCtx.lastACC = undefined;
        dataCtx.lastGYRO = undefined;
      }
    };

    sensorProfile.onErrorCallback = (sensor: SensorProfile, reason: string) => {
      setMessage('got error: ' + sensor.BLEDevice.Name + ' : ' + reason);
    };

    sensorProfile.onPowerChanged = (sensor: SensorProfile, power: number) => {
      setMessage('got power: ' + sensor.BLEDevice.Name + ' : ' + power);
      const dataCtx = dataCtxMap.current!.get(sensor.BLEDevice.Address)!;
      dataCtx.power = power;
    };

    sensorProfile.onDataCallback = (
      sensor: SensorProfile,
      data: SensorData
    ) => {
      const dataCtx = dataCtxMap.current!.get(sensor.BLEDevice.Address)!;
      if (data.dataType === DataType.NTF_EEG) {
        dataCtx.lastEEG = data;
      } else if (
        data.dataType === DataType.NTF_ECG ||
        data.dataType === DataType.NTF_BRTH
      ) {
        dataCtx.lastECG = data;
      } else if (data.dataType === DataType.NTF_ACC) {
        dataCtx.lastACC = data;
      } else if (data.dataType === DataType.NTF_GYRO) {
        dataCtx.lastGYRO = data;
      }

      // process data as you wish
      data.channelSamples.forEach((oneChannelSamples) => {
        oneChannelSamples.forEach((sample) => {
          if (sample.isLost) {
            //do some extra logic if this data is lost
          } else {
            //draw with sample.data & sample.channelIndex
            // console.log(sample.channelIndex + ' | ' + sample.sampleIndex + ' | ' + sample.data + ' | ' + sample.impedance);
          }
        });
      });
    };

    return newDataCtx;
  }

  //start / stop data transfer
  async function onDataSwitchButton() {
    const bledevice = getSelectedDevice();
    if (!bledevice) return;
    const sensor = SensorControllerInstance.getSensor(bledevice.Address);
    if (!sensor) return;

    if (!sensor.hasInited) {
      setMessage('please init first');
      return;
    }
    if (sensor.deviceState === DeviceStateEx.Ready) {
      if (sensor.isDataTransfering) {
        setMessage('stop DataNotification');
        await sensor.stopDataNotification();
      } else {
        setMessage('start DataNotification');
        await sensor.startDataNotification();
      }
    }
  }

  function processSampleData(data: SensorData) {
    let samplesMsg = '';
    if (data.channelSamples.length > 0) {
      if (data.channelSamples[0]!.length > 0) {
        samplesMsg =
          'time: ' +
          ' index: ' +
          data.channelSamples[0]![0]!.sampleIndex +
          ' count: ' +
          data.channelSamples[0]?.length;
      }

      if (data.dataType === DataType.NTF_ACC) {
        let x = data.channelSamples[0]![0]!;
        let y = data.channelSamples[1]![0]!;
        let z = data.channelSamples[2]![0]!;
        const sampleMsg =
          ' \n' +
          ('x: ' + x?.data.toFixed(2) + ' g') +
          (' | y: ' + y?.data.toFixed(2) + ' g') +
          (' | z: ' + z?.data.toFixed(2) + ' g');
        samplesMsg = samplesMsg + sampleMsg;
      } else if (data.dataType === DataType.NTF_GYRO) {
        let x = data.channelSamples[0]![0]!;
        let y = data.channelSamples[1]![0]!;
        let z = data.channelSamples[2]![0]!;
        const sampleMsg =
          ' \n' +
          ('x: ' + x?.data.toFixed(0) + ' dps') +
          (' | y: ' + y?.data.toFixed(0) + ' dps') +
          (' | z: ' + z?.data.toFixed(0) + ' dps');
        samplesMsg = samplesMsg + sampleMsg;
      } else {
        data.channelSamples.forEach((oneChannelSamples) => {
          let sample = oneChannelSamples[0];
          if (sample) {
            const sampleMsg =
              ' \n' +
              ' data: ' +
              sample.data.toFixed(0) +
              'uV | ' +
              ' impedance: ' +
              (sample.impedance / 1000).toFixed(0) +
              'K';
            samplesMsg = samplesMsg + sampleMsg;
          }
        });
      }
    }

    if (data.dataType === DataType.NTF_EEG) {
      const msg =
        'channel count:' +
        data.channelCount +
        ' sample count: ' +
        data.channelSamples[0]!.length;
      setEEGInfo(msg);
      setEEGSample(samplesMsg);
    } else if (
      data.dataType === DataType.NTF_ECG ||
      data.dataType === DataType.NTF_BRTH
    ) {
      const msg =
        'channel count:' +
        data.channelCount +
        ' sample count: ' +
        data.packageSampleCount;
      setECGInfo(msg);
      setECGSample(samplesMsg);
    } else if (data.dataType === DataType.NTF_ACC) {
      setAccInfo(samplesMsg);
    } else if (data.dataType === DataType.NTF_GYRO) {
      setGyroInfo(samplesMsg);
    }
  }

  function updateDeviceList(devices: BLEDevice[]) {
    let filterDevices = devices.filter((item) => {
      //filter OB serials
      return item.Name.startsWith('OB') || item.Name.startsWith('SYNC');
    });

    let connectedDevices = SensorControllerInstance.getConnectedDevices();
    filterDevices.forEach((foundDevice) => {
      //merge connected devices with found devices
      if (
        !connectedDevices.find(
          (connectedDevice) => connectedDevice.Address === foundDevice.Address
        )
      ) {
        connectedDevices.push(foundDevice);
      }
    });

    connectedDevices.sort((item1, item2) => {
      //sort with RSSI
      return item1.RSSI < item2.RSSI ? 1 : -1;
    });

    //reset selected device if over bound
    if (selectedDeviceIdx.current! >= connectedDevices.length) {
      selectedDeviceIdx.current = 0;
    }

    allDevices.current = connectedDevices;
    refreshDeviceList();
  }

  function refreshDeviceList() {
    let deviceList = '';
    allDevices.current!.forEach((bleDevice, index) => {
      if (index === selectedDeviceIdx.current) {
        deviceList += '\n ==>|' + bleDevice.Name;
      } else {
        deviceList += '\n' + bleDevice.RSSI + ' | ' + bleDevice.Name;
      }
    });

    setDevice(deviceList);
  }

  function refreshDeviceInfo() {
    const bledevice = getSelectedDevice();
    if (!bledevice) return;
    const dataCtx = requireSensorData(bledevice);
    if (!dataCtx) return;
    const sensor = dataCtx.sensor;
    setState(sensor.deviceState);

    if (dataCtx.sensor.deviceState === DeviceStateEx.Ready) {
      const eeg = dataCtx.lastEEG;
      const ecg = dataCtx.lastECG;
      const acc = dataCtx.lastACC;
      const gyro = dataCtx.lastGYRO;

      if (eeg) processSampleData(eeg);
      if (ecg) processSampleData(ecg);
      if (acc) processSampleData(acc);
      if (gyro) processSampleData(gyro);
    } else {
      setEEGInfo('');
      setEEGSample('');
      setECGInfo('');
      setECGSample('');
      setAccInfo('');
      setGyroInfo('');
    }
  }

  function getSelectedDevice(): BLEDevice | undefined {
    if (!allDevices.current) return;
    let deviceIdx = selectedDeviceIdx.current!;
    if (deviceIdx < 0 || deviceIdx >= allDevices.current!.length) return;
    return allDevices.current![deviceIdx];
  }

  function onNextDeviceButton() {
    if (allDevices.current && allDevices.current?.length > 0) {
      if (!selectedDeviceIdx.current) {
        selectedDeviceIdx.current = 0;
      }
      selectedDeviceIdx.current = selectedDeviceIdx.current + 1;
      if (selectedDeviceIdx.current >= allDevices.current?.length) {
        selectedDeviceIdx.current = 0;
      }
      refreshDeviceList();
    }

    refreshDeviceInfo();
  }

  return (
    <View style={styles.container}>
      <Button
        onPress={() => {
          SimpleTest();
        }}
        title="Simple Test"
      />

      <Button
        onPress={() => {
          onScanButton();
        }}
        title="scan/stop"
      />

      <Button
        onPress={() => {
          onNextDeviceButton();
        }}
        title="next device"
      />

      <Button
        onPress={() => {
          onConnectDisonnectButton();
        }}
        title="connect/disconnect"
      />

      <Button
        onPress={() => {
          onDataSwitchButton();
        }}
        title="start/stop"
      />
      <Text />
      <Text style={styles.text}>Device: {device}</Text>
      <Text />
      <Text style={styles.text}>Message: {message} </Text>
      <Text />
      <Text style={styles.text}>State: {DeviceStateEx[Number(state)]}</Text>
      <Text />
      <Text style={styles.text}>EEG info: {eegInfo} </Text>
      <Text />
      <Text style={styles.text}>EEG sample: {eegSample} </Text>
      <Text />
      <Text style={styles.text}>ECG info: {ecgInfo} </Text>
      <Text />
      <Text style={styles.text}>ECG sample: {ecgSample} </Text>
      <Text />
      <Text style={styles.text}>ACC sample: {accInfo} </Text>
      <Text />
      <Text style={styles.text}>GYRO sample: {gyroInfo} </Text>
      <Text />

      {/* <VConsole
        appInfo={{
        }}
        console={__DEV__ ? !console.time : true}
      /> */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    width: 60,
    height: 60,
    marginVertical: 20,
  },
  text: {
    fontSize: 14,
    color: 'red',
  },
  button: {
    fontSize: 20,
    color: 'blue',
    borderColor: 'red',
  },
});
