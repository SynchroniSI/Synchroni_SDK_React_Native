import * as React from 'react';
// import VConsole from '@kafudev/react-native-vconsole';
import { StyleSheet, View, Text, Button } from 'react-native';
import {
  SensorController,
  DeviceStateEx,
  type BLEDevice,
  type SensorData,
  DataType,
} from 'react-native-synchronisdk';

const SensorControllerInstance = SensorController.Instance;

export default function App() {
  const [device, setDevice] = React.useState<string>();
  const [state, setState] = React.useState<DeviceStateEx>();
  const [message, setMessage] = React.useState<string>();
  const [eegInfo, setEEGInfo] = React.useState<string>();
  const [eegSample, setEEGSample] = React.useState<string>();
  const [ecgInfo, setECGInfo] = React.useState<string>();
  const [ecgSample, setECGSample] = React.useState<string>();
  const foundDevices = React.useRef<Array<BLEDevice>>();
  const lastEEG = React.useRef<SensorData>();
  const lastECG = React.useRef<SensorData>();
  let loopTimer = React.useRef<NodeJS.Timeout>();

  function processSampleData(data: SensorData) {
    let samplesMsg = '';
    if (data.channelSamples.length > 0) {
      if (data.channelSamples[0]!.length > 0) {
        samplesMsg =
          'time: ' +
          data.channelSamples[0]![0]!.timeStampInMs +
          'ms' +
          ' index: ' +
          data.channelSamples[0]![0]!.sampleIndex;
      }

      data.channelSamples.forEach((oneChannelSamples) => {
        let sample = oneChannelSamples[0];
        if (sample) {
          const sampleMsg =
            ' \n' +
            (sample.channelIndex + 1) +
            ' | data: ' +
            sample.data.toFixed(0) +
            'uV | ' +
            ' impedance: ' +
            (sample.impedance / 1000).toFixed(0) +
            'K';
          samplesMsg = samplesMsg + sampleMsg;
        }
      });
    }

    if (data.dataType === DataType.NTF_EEG) {
      const msg =
        'channel count:' +
        data.channelCount +
        ' sample rate: ' +
        data.sampleRate;
      setEEGInfo(msg);
      setEEGSample(samplesMsg);
    } else if (data.dataType === DataType.NTF_ECG) {
      const msg =
        'channel count:' +
        data.channelCount +
        ' sample rate: ' +
        data.sampleRate;
      setECGInfo(msg);
      setECGSample(samplesMsg);
    }
  }

  React.useEffect(() => {
    //init
    setState(SensorControllerInstance.connectionState);
    setDevice(SensorControllerInstance.lastDevice?.Name);

    if (!loopTimer.current) {
      loopTimer.current = setInterval(() => {
        const eeg = lastEEG.current;
        const ecg = lastECG.current;
        if (eeg) processSampleData(eeg);
        if (ecg) processSampleData(ecg);
      }, 1000);
    }
    //callbacks
    SensorControllerInstance.onStateChanged = (newstate: DeviceStateEx) => {
      setState(newstate);
      if (newstate === DeviceStateEx.Disconnected) {
        lastEEG.current = undefined;
        lastECG.current = undefined;
      } else if (newstate === DeviceStateEx.Ready) {
        setDevice(SensorControllerInstance.lastDevice?.Name);
      }
    };

    SensorControllerInstance.onErrorCallback = (reason: string) => {
      setMessage('got error: ' + reason);
    };

    SensorControllerInstance.onDataCallback = (data: SensorData) => {
      // setMessage('got data');
      if (data.dataType === DataType.NTF_EEG) {
        lastEEG.current = data;
      } else if (data.dataType === DataType.NTF_ECG) {
        lastECG.current = data;
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
            SensorControllerInstance.connectionState !==
            DeviceStateEx.Disconnected
          ) {
            setMessage('please scan if disconnected');
            return;
          }

          setMessage('scanning');
          SensorControllerInstance.startSearch(3000)
            .then((devices) => {
              setMessage('');
              let filterDevices = devices.filter((item) => {
                //filter OB serials
                return item.Name.startsWith('OB');
              });

              let deviceList = '';
              filterDevices.forEach((bleDevice) => {
                deviceList += '\n' + bleDevice.RSSI + ' | ' + bleDevice.Name;
              });
              setDevice(deviceList);
              foundDevices.current = filterDevices;
            })
            .catch((error: Error) => {
              setDevice('');
              setMessage(error.message);
            });
        }}
        title="search"
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
              setMessage('connect');
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
            !SensorControllerInstance.hasInited
          ) {
            setMessage('initing');
            const firmwareVersion =
              await SensorControllerInstance.firmwareVersion();
            const batteryPower = await SensorControllerInstance.batteryPower();
            const inited = await SensorControllerInstance.init();
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
