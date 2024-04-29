import * as React from 'react';
// import VConsole from '@kafudev/react-native-vconsole';
import { StyleSheet, View, Text, Button } from 'react-native';
import {
  SensorController,
  DeviceStateEx,
  type BLEDevice,
  type SensorData,
  DataType,
} from '@synchroni/synchroni_sdk_react_native';

const SensorControllerInstance = SensorController.Instance;
const PackageSampleCount = 8;

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
  const foundDevices = React.useRef<Array<BLEDevice>>();
  const lastEEG = React.useRef<SensorData>();
  const lastECG = React.useRef<SensorData>();
  const lastACC = React.useRef<SensorData>();
  const lastGYRO = React.useRef<SensorData>();
  let loopTimer = React.useRef<NodeJS.Timeout>();

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

  React.useEffect(() => {
    //init
    setState(SensorControllerInstance.connectionState);
    if (SensorControllerInstance.lastDevice) {
      setDevice('==>' + SensorControllerInstance.lastDevice?.Name);
    }

    if (!loopTimer.current) {
      loopTimer.current = setInterval(() => {
        const eeg = lastEEG.current;
        const ecg = lastECG.current;
        const acc = lastACC.current;
        const gyro = lastGYRO.current;
        if (eeg) processSampleData(eeg);
        if (ecg) processSampleData(ecg);
        if (acc) processSampleData(acc);
        if (gyro) processSampleData(gyro);
      }, 1000);
    }
    //callbacks
    SensorControllerInstance.onStateChanged = (newstate: DeviceStateEx) => {
      setState(newstate);
      if (newstate === DeviceStateEx.Disconnected) {
        lastEEG.current = undefined;
        lastECG.current = undefined;
        lastACC.current = undefined;
        lastGYRO.current = undefined;
      } else if (newstate === DeviceStateEx.Ready) {
        setDevice('==>' + SensorControllerInstance.lastDevice?.Name);
      }
    };

    SensorControllerInstance.onErrorCallback = (reason: string) => {
      setMessage('got error: ' + reason);
    };

    SensorControllerInstance.onDeviceCallback = (devices: BLEDevice[]) => {
      let filterDevices = devices.filter((item) => {
        //filter OB serials
        return item.Name.startsWith('OB');
      });

      let deviceList = '';
      filterDevices.forEach((bleDevice) => {
        deviceList += '\n' + bleDevice.RSSI + ' | ' + bleDevice.Name;
      });
      if (
        SensorControllerInstance.lastDevice &&
        SensorControllerInstance.connectionState === DeviceStateEx.Ready
      ) {
        deviceList += '\n ==>' + SensorControllerInstance.lastDevice?.Name;
      }

      setDevice(deviceList);
      foundDevices.current = filterDevices;
    };

    SensorControllerInstance.onDataCallback = (data: SensorData) => {
      // setMessage('got data');

      if (data.dataType === DataType.NTF_EEG) {
        lastEEG.current = data;
      } else if (data.dataType === DataType.NTF_ECG) {
        lastECG.current = data;
      } else if (data.dataType === DataType.NTF_ACC) {
        lastACC.current = data;
      } else if (data.dataType === DataType.NTF_GYRO) {
        lastGYRO.current = data;
      }

      // process data as you wish
      data.channelSamples.forEach((oneChannelSamples) => {
        oneChannelSamples.forEach((sample) => {
          if (sample.isLost) {
            //do some logic
          } else {
            //draw with sample.data & sample.channelIndex
            // console.log(sample.channelIndex + ' | ' + sample.sampleIndex + ' | ' + sample.data + ' | ' + sample.impedance);
          }
        });
      });
    };
  }, []);

  return (
    <View style={styles.container}>
      <Button
        onPress={() => {
          //scan logic
          if (
            SensorControllerInstance.connectionState >= DeviceStateEx.Invalid
          ) {
            setMessage('please open bluetooth');
            return;
          }

          if (!SensorControllerInstance.isScaning) {
            setMessage('scanning');
            SensorControllerInstance.startScan(6000).catch((error: Error) => {
              setDevice('');
              setMessage(error.message);
            });
          } else {
            setMessage('stop scan');
            SensorControllerInstance.stopScan();
          }
        }}
        title="scan/stop"
      />
      <Text />

      <Button
        onPress={() => {
          //connect/disconnect logic
          // console.log(SyncControllerInstance.connectionState);

          if (
            SensorControllerInstance.connectionState === DeviceStateEx.Ready
          ) {
            setMessage('disconnect');
            SensorControllerInstance.disconnect();
          } else if (
            (SensorControllerInstance.connectionState ===
              DeviceStateEx.Connected ||
              SensorControllerInstance.connectionState ===
                DeviceStateEx.Disconnected) &&
            foundDevices.current
          ) {
            //select biggest RSSI device
            let selected: BLEDevice | undefined;
            foundDevices.current.forEach((bleDevice) => {
              if (!selected) {
                selected = bleDevice;
              } else if (bleDevice.RSSI > selected.RSSI) {
                selected = bleDevice;
              }
            });
            if (selected) {
              setMessage('connect: ' + selected.Name);
              SensorControllerInstance.connect(selected);
            }
          }
        }}
        title="connect/disconnect"
      />
      <Text />
      <Button
        onPress={async () => {
          //init data transfer logic

          if (
            SensorControllerInstance.connectionState !== DeviceStateEx.Ready
          ) {
            setMessage('please connect before init');
            return;
          }

          if (
            SensorControllerInstance.connectionState === DeviceStateEx.Ready &&
            !SensorControllerInstance.hasInited &&
            !SensorControllerInstance.isIniting
          ) {
            setMessage('initing');
            const firmwareVersion =
              await SensorControllerInstance.firmwareVersion();
            const batteryPower = await SensorControllerInstance.batteryPower();
            const inited =
              await SensorControllerInstance.init(PackageSampleCount);
            console.log(
              'Version: ' +
                firmwareVersion +
                ' \n power: ' +
                batteryPower +
                ' \n inited: ' +
                inited
            );

            setMessage(
              '\nVersion: ' +
                firmwareVersion +
                ' \n power: ' +
                batteryPower +
                ' \n inited: ' +
                inited
            );
            setEEGInfo('');
            setEEGSample('');
            setECGInfo('');
            setECGSample('');
            setAccInfo('');
            setGyroInfo('');
          }
        }}
        title="init"
      />
      <Text />
      <Button
        onPress={() => {
          //start / stop data transfer

          if (!SensorControllerInstance.hasInited) {
            setMessage('please init first');
            return;
          }
          if (
            SensorControllerInstance.connectionState === DeviceStateEx.Ready
          ) {
            if (SensorControllerInstance.isDataTransfering) {
              setMessage('stop DataNotification');
              SensorControllerInstance.stopDataNotification();
            } else {
              setMessage('start DataNotification');
              SensorControllerInstance.startDataNotification();
            }
          }
        }}
        title="start/stop"
      />
      <Text />
      <Text style={styles.text}>Device: {device}</Text>
      <Text />
      <Text style={styles.text}>State: {DeviceStateEx[Number(state)]}</Text>
      <Text />
      <Text style={styles.text}>Message: {message} </Text>
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
