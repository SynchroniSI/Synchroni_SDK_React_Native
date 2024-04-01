package com.synchronisdk;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothDevice;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.proguard.annotations.DoNotStrip;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeArray;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.sensor.CommandResponseCallback;
import com.sensor.DataNotificationCallback;
import com.sensor.ScanCallback;
import com.sensor.SensorProfile;

import java.util.Deque;
import java.util.Timer;
import java.util.TimerTask;
import java.util.Vector;
import java.util.concurrent.ConcurrentLinkedDeque;
public class SynchronisdkModule extends com.synchronisdk.SynchronisdkSpec {
  public static final String NAME = "Synchronisdk";
  public static final String TAG = "Synchronisdk";
  static final int DATA_TYPE_EEG = 0;
  static final int DATA_TYPE_ECG = 1;
  static final int DATA_TYPE_ACC = 2;
  static final int DATA_TYPE_GYRO = 3;
  static final int DATA_TYPE_COUNT = 4;
  static final int TIMEOUT = 50000;

  private DataNotificationCallback dataCallback;

  static class SensorData {
    public int dataType;
    public int lastPackageCounter;
    public int lastPackageIndex;
    public int resolutionBits;
    public int sampleRate;
    public int channelCount;
    public long channelMask;
    public int packageSampleCount;
    public double K;
    static class Sample {
      public int timeStampInMs;
      public int channelIndex;
      public int sampleIndex;
      public int rawData;
      public float data;
      public float impedance;
      public float saturation;
      public boolean isLost;
    }
    public volatile Vector<Vector<Sample>> channelSamples;
    public SensorData(){

    }

    public void clear(){
      lastPackageCounter = 0;
      lastPackageIndex = 0;
    }
  }
  private volatile SensorData sensorData[] = new SensorData[DATA_TYPE_COUNT];

  private volatile Vector<Float> impedanceData = new Vector<Float>();
  private volatile Vector<Float> saturationData = new Vector<Float>();
  private int notifyDataFlag = SensorProfile.DataNotifFlags.DNF_IMPEDANCE | SensorProfile.DataNotifFlags.DNF_ACCELERATE;

  private SensorProfile sensorProfile;

  private int listenerCount = 0;

  @ReactMethod
  public void addListener(String eventName) {
    if (listenerCount == 0) {
      // Set up any upstream listeners or background tasks as necessary
    }

    listenerCount += 1;
//    Log.d(TAG, "add listener count: " + listenerCount);
  }

  @ReactMethod
  public void removeListeners(double count) {
    listenerCount -= count;
    if (listenerCount == 0) {
      // Remove upstream listeners, stop unnecessary background tasks
    }
//    Log.d(TAG, "remove listener count: " + listenerCount);
  }

  private void sendEvent(ReactContext reactContext, String eventName, @Nullable Object params)
  {
    if (listenerCount > 0)
      reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit(eventName, params);
  }
  private static float getFloat(byte[] b, int offset) {
    int accum = 0;
    accum = accum | (b[offset + 0] & 0xff) << 0;
    accum = accum | (b[offset + 1] & 0xff) << 8;
    accum = accum | (b[offset + 2] & 0xff) << 16;
    accum = accum | (b[offset + 3] & 0xff) << 24;
    return Float.intBitsToFloat(accum);
  }
  private boolean checkReadSamples(byte[] data, SensorData sensorData, int dataOffset){
    int offset = 1;
    try{
      int packageIndex = ((data[offset + 1] & 0xff) << 8 | (data[offset] & 0xff));
//                            Log.d(TAG, "package index: " + packageIndex);
      offset += 2;
      int newPackageIndex = packageIndex;
      int lastPackageIndex = sensorData.lastPackageIndex;

      if (packageIndex < lastPackageIndex){
        packageIndex += 65536;// package index is U16
      }else if (packageIndex == lastPackageIndex){
        //repeated package index
        return false;
      }
      int deltaPackageIndex = packageIndex - lastPackageIndex;
      if (deltaPackageIndex > 1){
        int lostSampleCount = sensorData.packageSampleCount * (deltaPackageIndex - 1);
        //add missing samples
        readSamples(data, sensorData, 0, lostSampleCount);
        if (newPackageIndex == 0){
          sensorData.lastPackageIndex = 65535;
        }else{
          sensorData.lastPackageIndex = newPackageIndex - 1;
        }
        sensorData.lastPackageCounter += (deltaPackageIndex - 1);
      }
      readSamples(data, sensorData, dataOffset, 0);
      sensorData.lastPackageIndex = newPackageIndex;
      sensorData.lastPackageCounter++;
    }catch (Exception e){
      Log.d(TAG, "error in process data" + e.getLocalizedMessage());
      return false;
    }
    return true;
  }
  private void readSamples(byte[] data, SensorData sensorData, int offset, int lostSampleCount){
    int sampleCount = sensorData.packageSampleCount;
    int sampleInterval = 1000 / sensorData.sampleRate; // sample rate should be less than 1000
    if (lostSampleCount > 0)
      sampleCount = lostSampleCount;

    double K = sensorData.K;
    int lastSampleIndex = sensorData.lastPackageCounter * sensorData.packageSampleCount;

    Vector<Float> _impedanceData = impedanceData;
    Vector<Float> _saturationData = saturationData;

    Vector<Vector<SensorData.Sample>> channelSamples ;
    if (sensorData.channelSamples == null){
      channelSamples = new Vector<>();
      for (int channelIndex = 0; channelIndex < sensorData.channelCount; ++ channelIndex){
        channelSamples.add(new Vector<>());
      }
    }else{
      channelSamples = (Vector<Vector<SensorData.Sample>>)sensorData.channelSamples.clone();
    }


    for (int sampleIndex = 0;sampleIndex < sampleCount; ++sampleIndex, ++lastSampleIndex){
      for (int channelIndex = 0, impedanceChannelIndex = 0; channelIndex < sensorData.channelCount; ++channelIndex){
        if ((sensorData.channelMask & (1 << channelIndex)) > 0){
          Vector<SensorData.Sample> samples = channelSamples.elementAt(channelIndex);
          float impedance = 0;
          float saturation = 0;
          if (sensorData.dataType == SensorProfile.NotifDataType.NTF_ECG){
            impedanceChannelIndex = this.sensorData[DATA_TYPE_EEG].channelCount;
          }
          if ((impedanceChannelIndex >= 0) && (impedanceChannelIndex < _impedanceData.size())){
            impedance = _impedanceData.get(impedanceChannelIndex);
            saturation = _saturationData.get(impedanceChannelIndex);
          }
          ++impedanceChannelIndex;

          SensorData.Sample dataItem = new SensorData.Sample();
          dataItem.channelIndex = channelIndex;
          dataItem.sampleIndex = lastSampleIndex;
          dataItem.timeStampInMs = lastSampleIndex * sampleInterval;
          if (lostSampleCount > 0){
            //add missing samples with 0
            dataItem.rawData = 0;
            dataItem.data = 0;
            dataItem.impedance = impedance;
            dataItem.saturation = saturation;
            dataItem.isLost = true;
          }else{
            int rawData = 0;
            if (sensorData.resolutionBits == 8){
              rawData = (0xff & data[offset]) - 128;
              offset += 1;
            }else if (sensorData.resolutionBits == 16){
              //it's native short LSB
              rawData = (short)((0xff & data[offset + 1]) << 8 | (0xff & data[offset]));
              offset += 2;
            }else if (sensorData.resolutionBits == 24) {
              //it's MSB
              rawData = ((0xff & data[offset]) << 16 | (0xff & data[offset + 1]) << 8 | (0xff & data[offset + 2])) - 8388608;
              offset += 3;
            }
            float converted = (float)(rawData * K);
            dataItem.rawData = rawData;
            dataItem.data = converted;
            dataItem.impedance = impedance;
            dataItem.saturation = saturation;
            dataItem.isLost = false;
          }
          samples.add(dataItem);
        }
      }
    }
    sensorData.channelSamples = channelSamples;
  }

  private void sendSensorData(ReactContext reactContext, SensorData sensorData){
    Vector<Vector<SensorData.Sample>> channelSamples = sensorData.channelSamples;
    sensorData.channelSamples = null;

    if (channelSamples == null){
      return;
    }

    WritableMap result = Arguments.createMap();
    result.putInt("dataType", sensorData.dataType);
    result.putInt("resolutionBits", sensorData.resolutionBits);
    result.putInt("sampleRate", sensorData.sampleRate);
    result.putInt("channelCount", sensorData.channelCount);
    result.putInt("channelMask", (int) sensorData.channelMask);
    result.putInt("packageSampleCount", sensorData.packageSampleCount);
    result.putDouble("K", sensorData.K);

    WritableArray channelsResult = Arguments.createArray();

    for (int channelIndex = 0; channelIndex < sensorData.channelCount; ++channelIndex){
      Vector<SensorData.Sample> samples = channelSamples.get(channelIndex);
      WritableArray samplesResult = Arguments.createArray();

      for (int sampleIndex = 0;sampleIndex < samples.size();++sampleIndex){
        SensorData.Sample sample = samples.get(sampleIndex);
        WritableMap sampleResult = Arguments.createMap();
        sampleResult.putInt("rawData", sample.rawData);
        sampleResult.putInt("sampleIndex", sample.sampleIndex);
        sampleResult.putInt("channelIndex", sample.channelIndex);
        sampleResult.putInt("timeStampInMs", sample.timeStampInMs);
        sampleResult.putDouble("data", sample.data);
        sampleResult.putDouble("impedance", sample.impedance);
        sampleResult.putDouble("saturation", sample.saturation);
        sampleResult.putBoolean("isLost", sample.isLost);
        samplesResult.pushMap(sampleResult);
      }
      channelsResult.pushArray(samplesResult);
    }

    result.putArray("channelSamples", channelsResult);
    sendEvent(reactContext, "GOT_DATA", result);
  }

  private void clearSamples(){
    impedanceData.clear();
    saturationData.clear();
    for (int index = 0;index < DATA_TYPE_COUNT;++index){
      if (sensorData[index] == null)
        continue;
      sensorData[index].clear();
    }
  }

  private void initACC_GYRO(){
    SensorData data = new SensorData();
    data.dataType = SensorProfile.NotifDataType.NTF_ACC_DATA;
    data.sampleRate = 50;
    data.resolutionBits = 16;
    data.channelMask = 255;
    data.channelCount = 3;
    data.packageSampleCount = 1;
    data.K = 1 / 8192.0;
    data.clear();
    sensorData[DATA_TYPE_ACC] = data;

    SensorData data2 = new SensorData();
    data2.dataType = SensorProfile.NotifDataType.NTF_GYO_DATA;
    data2.sampleRate = 50;
    data2.resolutionBits = 16;
    data2.channelMask = 255;
    data2.channelCount = 3;
    data2.packageSampleCount = 1;
    data2.K = 1 / 16.4;
    data2.clear();
    sensorData[DATA_TYPE_GYRO] = data2;
  }

  SynchronisdkModule(ReactApplicationContext context) {
    super(context);

    initACC_GYRO();

    dataCallback = data -> {
//      Log.i(TAG, "data type: " + data[0] + ", len: " + data.length);
      if (data[0] == SensorProfile.NotifDataType.NTF_IMPEDANCE){
        int offset = 1;
        int packageIndex = ((data[offset + 1] & 0xff) << 8 | (data[offset] & 0xff));
        offset += 2;
//        Log.d(TAG, "impedance package index: " + packageIndex);
        Vector<Float> _impedanceData = new Vector<>();
        Vector<Float> _saturationData = new Vector<>();

        int dataCount = (data.length - 3) / 4 / 2;
        for (int index = 0;index < dataCount;++index){
          float impedance = getFloat(data, offset);
          offset += 4;
          _impedanceData.add(impedance);
        }
        for (int index = 0;index < dataCount;++index){
          float impedance = getFloat(data, offset);
          offset += 4;
          _saturationData.add(impedance);
        }
        impedanceData = _impedanceData;
        saturationData = _saturationData;
      }else if (data[0] == SensorProfile.NotifDataType.NTF_EEG ||
        data[0] == SensorProfile.NotifDataType.NTF_ECG ){
        int dataType = data[0] - SensorProfile.NotifDataType.NTF_EEG;
        SensorData sensorData = this.sensorData[dataType];
        if (checkReadSamples(data, sensorData, 3))
          sendSensorData(context, sensorData);
      }else if (data[0] == SensorProfile.NotifDataType.NTF_ACC_DATA){
        SensorData sensorDataACC = sensorData[DATA_TYPE_ACC];
        if (checkReadSamples(data, sensorDataACC, 3))
          sendSensorData(context, sensorDataACC);

        SensorData sensorDataGYRO = sensorData[DATA_TYPE_GYRO];
        if (checkReadSamples(data, sensorDataGYRO, 9))
          sendSensorData(context, sensorDataGYRO);
      }
    };

    sensorProfile = new SensorProfile(new SensorProfile.Callbacks() {
      @Override
      public void onErrorCallback(String errorMsg) {
        Log.d(NAME, "got error:" + errorMsg);
        sendEvent(context, "GOT_ERROR", errorMsg);
      }

      @Override
      public void onStateChange(SensorProfile.BluetoothDeviceStateEx newState) {
        Log.d(NAME, "got new device state:" + newState);
        if (newState == SensorProfile.BluetoothDeviceStateEx.Disconnected){
          notifyDataFlag = SensorProfile.DataNotifFlags.DNF_IMPEDANCE | SensorProfile.DataNotifFlags.DNF_ACCELERATE;
          clearSamples();
        }
        sendEvent(context, "STATE_CHANGED", newState.ordinal());
      }

    });
  }

  @Override
  @NonNull
  public String getName() {
    return NAME;
  }
  @ReactMethod
  @DoNotStrip
  public void startScan(double _timeoutInMS, Promise promise){
    int timeoutInMS = (int) _timeoutInMS;
    Log.d(NAME, "timeout:" + timeoutInMS);
    WritableArray result = new WritableNativeArray();
    if (timeoutInMS < 0)
      timeoutInMS = 0;
    else if (timeoutInMS > 30000)
      timeoutInMS = 30000;

    Timer timer = new Timer();
    timer.schedule(new TimerTask() {
      @Override
      public void run() {
        promise.resolve(result);
      }
    }, timeoutInMS);
    sensorProfile.startScan(timeoutInMS, new ScanCallback() {
      @SuppressLint("MissingPermission")
      @Override
      public void onScanResult(BluetoothDevice bluetoothDevice, int rssi) {
        WritableMap device = new WritableNativeMap();
        device.putString("Name", bluetoothDevice.getName());
        device.putString("Address", bluetoothDevice.getAddress());
        device.putInt("RSSI", rssi);
        result.pushMap(device);
      }

      @Override
      public void onScanFailed(int i) {
        promise.reject(i+"");
      }
    });
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void stopScan(Promise promise) {
    sensorProfile.stopScan();
    promise.resolve(null);
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void connect(ReadableMap bleDevice, Promise promise) {
    if (bleDevice != null){
      String mac = bleDevice.getString("Address");
      if (mac == null || mac.isEmpty()){
        promise.reject("invalid device");
        return;
      }
      SensorProfile.GF_RET_CODE code = sensorProfile.connect(mac, true);
      if (code == SensorProfile.GF_RET_CODE.GF_SUCCESS){
        promise.resolve(true);
      }else{
        promise.resolve(false);
      }
    }
    promise.reject("invalid device");
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void disconnect(Promise promise) {
    promise.resolve(sensorProfile.disconnect());
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void startDataNotification(Promise promise) {
    if (sensorProfile.getState() != SensorProfile.BluetoothDeviceStateEx.Ready){
      promise.resolve(false);
      return;
    }
    clearSamples();
    boolean result = sensorProfile.startDataNotification(dataCallback);

    promise.resolve(result);
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void stopDataNotification(Promise promise) {
    boolean result = sensorProfile.stopDataNotification();
    promise.resolve(result);
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void initEEG(double packageSampleCount, Promise promise) {
    sensorProfile.getEegDataConfig(new CommandResponseCallback() {
      @Override
      public void onGetEegDataConfig(int resp, int sampleRate, long channelMask, int packageSampleCount, int resolutionBits, double microVoltConversionK) {
        if (resp == SensorProfile.ResponseResult.RSP_CODE_SUCCESS) {
          Log.d(TAG, "Device State: " + "get  EEG Config succeeded");
          SensorData data = new SensorData();
          data.dataType = SensorProfile.NotifDataType.NTF_EEG;
          data.sampleRate = sampleRate;
          data.resolutionBits = resolutionBits;
          data.channelMask = channelMask;
          data.packageSampleCount = packageSampleCount;
          data.K = microVoltConversionK;
          data.clear();
          sensorData[DATA_TYPE_EEG] = data;

          sensorProfile.getEegDataCap(new CommandResponseCallback() {
            @Override
            public void onGetEegDataCap(int resp, int[] supportedSampleRates, int maxChannelCount, int maxPackageSampleCount, int[] supportedResolutionBits) {
              if (resp == SensorProfile.ResponseResult.RSP_CODE_SUCCESS){
                Log.d(TAG, "Device State: " + "get  EEG Cap succeeded");
                sensorData[DATA_TYPE_EEG].channelCount = maxChannelCount;
                notifyDataFlag |= (SensorProfile.DataNotifFlags.DNF_EEG);
                promise.resolve(true);
              }else{
                Log.d(TAG, "Device State: " + "get  EEG Cap failed, resp code: " + resp);
                promise.resolve(false);
              }
            }
          }, TIMEOUT);
        } else {
          Log.d(TAG, "Device State: " + "get  EEG Config failed, resp code: " + resp);
          promise.resolve(false);
        }
      }
    }, TIMEOUT);
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void initECG(double packageSampleCount, Promise promise) {
    sensorProfile.getEcgDataConfig(new CommandResponseCallback() {
      @Override
      public void onGetEcgDataConfig(int resp, int sampleRate, int channelMask, int packageSampleCount, int resolutionBits, double microVoltConversionK) {
        if (resp == SensorProfile.ResponseResult.RSP_CODE_SUCCESS) {
          Log.d(TAG, "Device State: " + "get  ECG Config succeeded");
          SensorData data = new SensorData();
          data.dataType = SensorProfile.NotifDataType.NTF_ECG;
          data.sampleRate = sampleRate;
          data.resolutionBits = resolutionBits;
          data.channelMask = channelMask;
          data.packageSampleCount = packageSampleCount;
          data.K = microVoltConversionK;
          data.clear();
          sensorData[DATA_TYPE_ECG] = data;

          sensorProfile.getEcgDataCap(new CommandResponseCallback() {
            @Override
            public void onGetEcgDataCap(int resp, int[] supportedSampleRates, int maxChannelCount, int maxPackageSampleCount, int[] supportedResolutionBits) {
              if (resp == SensorProfile.ResponseResult.RSP_CODE_SUCCESS){
                Log.d(TAG, "Device State: " + "get  ECG Cap succeeded");
                sensorData[DATA_TYPE_ECG].channelCount = maxChannelCount;
                notifyDataFlag |= (SensorProfile.DataNotifFlags.DNF_ECG);
                promise.resolve(true);
              }else{
                Log.d(TAG, "Device State: " + "get  ECG Cap failed, resp code: " + resp);
                promise.resolve(false);
              }
            }
          }, TIMEOUT);
        } else {
          Log.d(TAG, "Device State: " + "get ECG Config failed, resp code: " + resp);
          promise.resolve(false);
        }
      }
    }, TIMEOUT);
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void initDataTransfer(Promise promise) {
    if (sensorProfile.getState() != SensorProfile.BluetoothDeviceStateEx.Ready){
      promise.resolve(false);
      return;
    }
    sensorProfile.setDataNotifSwitch(notifyDataFlag, new CommandResponseCallback() {
      @Override
      public void onSetCommandResponse(int resp) {
        if (resp == SensorProfile.ResponseResult.RSP_CODE_SUCCESS) {
          Log.d(TAG, "Device State: " + "Set Data Switch succeeded");
          promise.resolve(true);
        } else {
          Log.d(TAG,  "Device State: " + "Set Data Switch failed, resp code: " + resp);
          promise.resolve(false);
        }
      }
    }, TIMEOUT);
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void getBatteryLevel(Promise promise) {
    sensorProfile.getBatteryLevel(new CommandResponseCallback() {
      @Override
      public void onGetBatteryLevel(int resp, int batteryLevel) {
        if (resp == SensorProfile.ResponseResult.RSP_CODE_SUCCESS){
          promise.resolve(batteryLevel);
        }else{
          promise.reject("get BatteryLevel fail:" + resp);
        }
      }
    }, TIMEOUT);
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void getControllerFirmwareVersion(Promise promise) {
    sensorProfile.getControllerFirmwareVersion(new CommandResponseCallback() {
      @Override
      public void onGetControllerFirmwareVersion(int resp, String firmwareVersion) {
        if (resp == SensorProfile.ResponseResult.RSP_CODE_SUCCESS){
          promise.resolve(firmwareVersion);
        }else{
          promise.reject("get ControllerFirmwareVersion fail:" + resp);
        }
      }
    }, TIMEOUT);
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  @DoNotStrip
  public String getDeviceState(){
    String name = sensorProfile.getState().name();
//    Log.d(TAG, "status:" + name);
    return sensorProfile.getState().name();
  }
}
