// import VConsole from '@kafudev/react-native-vconsole';
import React from 'react';
import { StyleSheet, View, Text, Button } from 'react-native';
import {
  SensorController,
  SensorProfile,
  DeviceStateEx,
  DataType,
  type BLEDevice,
  type SensorData,
} from '@synchroni/synchroni_sdk_react_native';

import WebSocketCmd from './WebsocketCmd';

const SensorControllerInstance = SensorController.Instance;
const PackageSampleCount = 8;
const PowerRefreshInterval = 30 * 1000;

const TestURL = 'ws://192.168.100.77:13145';

type DataCtx = {
  sensor: SensorProfile;
  socketClient: WebSocketCmd;
  power?: number;
  lastEEG?: SensorData;
  lastECG?: SensorData;
  lastACC?: SensorData;
  lastGYRO?: SensorData;
};

export default function App() {
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
      await SensorControllerInstance.startScan(6000);
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
    var ctx = requireSensorData(bledevice);

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

        const opened = await ctx.socketClient.open();
        console.log('websocket connected: ' + opened);

        const registed = await ctx.socketClient.register();
        console.log('websocket inited: ' + registed);

        const inited = await sensor.init(
          PackageSampleCount,
          PowerRefreshInterval
        );
        if (!inited) {
          setMessage('init fail');
          return;
        }
        const deviceInfo = await sensor.deviceInfo();

        await sensor.startDataNotification();
        ctx.socketClient.boardCastNativeDataSwitch(true);

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
  function requireSensorData(bledevice: BLEDevice): DataCtx {
    if (dataCtxMap.current!.has(bledevice.Address)) {
      return dataCtxMap.current!.get(bledevice.Address)!;
    }
    //do init context and set callback
    let sensorProfile = SensorControllerInstance.requireSensor(bledevice);

    const websocketCmd: WebSocketCmd = new WebSocketCmd(
      TestURL,
      bledevice.Name,
      bledevice.Address,
      'OB'
    );
    const newDataCtx: DataCtx = {
      sensor: sensorProfile,
      socketClient: websocketCmd,
    };
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

        dataCtx.socketClient.close();
      } else if (newstate === DeviceStateEx.Ready) {
        dataCtx.socketClient.open();
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

    sensorProfile.onNativeDataCallback = (
      sensor: SensorProfile,
      data: string
    ) => {
      // console.log("got native data: " + sensor.BLEDevice.Address + " => " + data.length);
      const dataCtx = dataCtxMap.current!.get(sensor.BLEDevice.Address)!;
      console.log('got native data: ' + data);
      if (data.startsWith('native_data_info/')) {
        dataCtx.socketClient.sendCmd(data, '');
      } else {
        dataCtx.socketClient.boardCastNativeData(data);
      }
    };

    sensorProfile.onDataCallback = (
      sensor: SensorProfile,
      data: SensorData
    ) => {
      const dataCtx = dataCtxMap.current!.get(sensor.BLEDevice.Address)!;
      if (data.dataType === DataType.NTF_EEG) {
        dataCtx.lastEEG = data;
      } else if (data.dataType === DataType.NTF_ECG) {
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

    const ctx = requireSensorData(bledevice);

    if (sensor.deviceState === DeviceStateEx.Ready) {
      if (sensor.isDataTransfering) {
        setMessage('stop DataNotification');
        await sensor.stopDataNotification();
        ctx.socketClient.boardCastNativeDataSwitch(false);
      } else {
        setMessage('start DataNotification');
        await sensor.startDataNotification();
        ctx.socketClient.boardCastNativeDataSwitch(true);
      }
    }
  }

  function processSampleData(data: SensorData) {
    let samplesMsg = '';
    if (data.channelSamples.length > 0) {
      if (data.channelSamples[0]!.length > 0) {
        samplesMsg =
          'time: ' + ' index: ' + data.channelSamples[0]![0]!.sampleIndex;
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
    } else if (data.dataType === DataType.NTF_ECG) {
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
      return item.Name.startsWith('OB5000');
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
