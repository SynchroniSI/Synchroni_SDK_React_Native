package com.synchronisdk;

import static com.sensor.BLEDevice.State.Disconnected;
import static com.sensor.BLEDevice.State.Ready;

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
import com.sensor.BLEDevice;
import com.sensor.SensorController;
import com.sensor.SensorData;
import com.sensor.SensorProfile;

import java.util.HashMap;
import java.util.List;
import java.util.Timer;
import java.util.TimerTask;
import java.util.Vector;

public class SynchronisdkModule extends com.synchronisdk.SynchronisdkSpec {
  public static final String NAME = "Synchronisdk";
  public static final String TAG = "Synchronisdk";
  private static final int TIMEOUT = 50000;
  private SensorController sensorScaner;
  private int listenerCount = 0;

  private SensorProfile.SensorProfileDelegate dataCallback;
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

  private void sendSensorData(ReactContext reactContext, SensorData sensorData){
    Vector<Vector<SensorData.Sample>> channelSamples = sensorData.channelSamples;
    int realSampleCount = 0;
    if (channelSamples.size() > 0){
      realSampleCount = channelSamples.get(0).size();
    }
    if (realSampleCount < sensorData.minPackageSampleCount){
      return;
    }
    if (channelSamples == null){
      return;
    }
    int batchCount = realSampleCount / sensorData.minPackageSampleCount;
    int leftSampleSize = realSampleCount - sensorData.minPackageSampleCount * batchCount;
    if (leftSampleSize > 0){
      Vector<Vector<SensorData.Sample>> leftChannelSamples = new Vector<>();
      for (int channelIndex = 0; channelIndex < sensorData.channelCount; ++channelIndex){
        Vector<SensorData.Sample> samples = channelSamples.get(channelIndex);
        Vector<SensorData.Sample> leftSamples = new Vector<>(samples.subList(sensorData.minPackageSampleCount * batchCount, realSampleCount));
        leftChannelSamples.add(leftSamples);
      }
      sensorData.channelSamples = leftChannelSamples;
    }else{
      sensorData.channelSamples = null;
    }


    for (int batchIndex = 0; batchIndex < batchCount;++batchIndex){

      WritableMap result = Arguments.createMap();
      result.putString("deviceMac", sensorData.deviceMac);
      result.putInt("dataType", sensorData.dataType);
//    result.putInt("resolutionBits", sensorData.resolutionBits);
      result.putInt("sampleRate", sensorData.sampleRate);
      result.putInt("channelCount", sensorData.channelCount);
//    result.putInt("channelMask", (int) sensorData.channelMask);
      result.putInt("packageSampleCount", sensorData.minPackageSampleCount);
//    result.putDouble("K", sensorData.K);
      WritableArray channelsResult = Arguments.createArray();

      for (int channelIndex = 0; channelIndex < sensorData.channelCount; ++channelIndex){
        Vector<SensorData.Sample> samples = channelSamples.get(channelIndex);
        WritableArray samplesResult = Arguments.createArray();

        for (int sampleIndex = 0;sampleIndex < sensorData.minPackageSampleCount;++sampleIndex){
          SensorData.Sample sample = samples.remove(0);
          WritableMap sampleResult = Arguments.createMap();
//        sampleResult.putInt("rawData", sample.rawData);
          sampleResult.putInt("sampleIndex", sample.sampleIndex);
//        sampleResult.putInt("channelIndex", sample.channelIndex);
//        sampleResult.putInt("timeStampInMs", sample.timeStampInMs);
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

  }


  SynchronisdkModule(ReactApplicationContext context) {
    super(context);
    sensorScaner = SensorController.getInstance();
    sensorScaner.delegate = new SensorController.SensorControllerDelegate() {
      @Override
      public void onSensorScanResult(List<BLEDevice> bleDevices) {
        WritableArray result = new WritableNativeArray();
        for (BLEDevice deviceRet:
                bleDevices) {
          WritableMap device = new WritableNativeMap();
          device.putString("Name", deviceRet.name);
          device.putString("Address", deviceRet.mac);
          device.putInt("RSSI", deviceRet.rssi);
          result.pushMap(device);
        }
        sendEvent(getReactApplicationContext(), "GOT_DEVICE_LIST", result);
      }
    };

    dataCallback = new SensorProfile.SensorProfileDelegate() {
      @Override
      public void onErrorCallback(SensorProfile profile, String errorMsg) {
        Log.d(NAME, "got error:" + errorMsg);
        WritableMap result = Arguments.createMap();
        result.putString("deviceMac", profile.getDevice().mac);
        result.putString("errMsg", errorMsg);
        sendEvent(getReactApplicationContext(), "GOT_ERROR", result);
      }

      @Override
      public void onStateChange(SensorProfile profile, BLEDevice.State newState) {
        Log.d(NAME, "got new device state:" + newState);

        WritableMap result = Arguments.createMap();
        result.putString("deviceMac", profile.getDevice().mac);
        result.putInt("newState", newState.ordinal());
        sendEvent(getReactApplicationContext(), "STATE_CHANGED", result);
      }

      @Override
      public void onSensorNotifyData(SensorProfile profile, SensorData rawData) {
        sendSensorData(context, rawData);
      }
    };
  }

  @Override
  @NonNull
  public String getName() {
    return NAME;
  }
  @ReactMethod
  @DoNotStrip
  public void startScan(double _periodInMS, Promise promise){
    if (isScaning()){
      promise.reject("startScan", "please search after search return");
      return;
    }
    int periodInMS = (int) _periodInMS;
    Log.d(NAME, "timeout:" + periodInMS);

    if (periodInMS < 6000)
      periodInMS = 6000;
    else if (periodInMS > 30000)
      periodInMS = 30000;

    boolean ret = sensorScaner.startScan(periodInMS);
    if (!ret){
      stopScan(null);
    }
    promise.resolve(ret);
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void stopScan(Promise promise) {
    if (isScaning()){
      sensorScaner.stopScan();
    }
    if (promise != null){
      promise.resolve(null);
    }
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  @DoNotStrip
  public boolean isScaning(){
    return sensorScaner.isScaning();
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  @DoNotStrip
  public boolean isEnable(){
    return sensorScaner.isEnable();
  }
  @ReactMethod(isBlockingSynchronousMethod = true)
  @DoNotStrip
  public boolean initSensor(String deviceMac){
    if (deviceMac == null || deviceMac.isEmpty()){
      return false;
    }
    SensorProfile sensor = sensorScaner.getSensor(deviceMac);
    if (sensor == null){
      return false;
    }
    if (sensor.delegate == null){
      sensor.delegate = dataCallback;
    }

    return true;
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void connect(String deviceMac, Promise promise) {
    if (deviceMac == null || deviceMac.isEmpty()){
      promise.reject("connect","invalid device");
      return;
    }
    SensorProfile sensor = sensorScaner.getSensor(deviceMac);
    promise.resolve(sensor.connect());
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void disconnect(String deviceMac, Promise promise) {
    if (deviceMac == null || deviceMac.isEmpty()){
      promise.reject("disconnect","invalid device");
      return;
    }
    SensorProfile sensor = sensorScaner.getSensor(deviceMac);
    sensor.disconnect();
    promise.resolve(true);
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void startDataNotification(String deviceMac, Promise promise) {
    if (deviceMac == null || deviceMac.isEmpty()){
      promise.reject("startDataNotification","invalid device");
      return;
    }
    SensorProfile sensor = sensorScaner.getSensor(deviceMac);
    if (sensor.getDeviceState() != Ready){
      promise.resolve(false);
      return;
    }
    sensor.startDataNotification(new SensorProfile.Callback() {
      @Override
      public void gotResult(int result, String errorMsg) {
        promise.resolve(sensor.hasStartDataNotification());
      }
    });
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void stopDataNotification(String deviceMac, Promise promise) {
    if (deviceMac == null || deviceMac.isEmpty()){
      promise.reject("stopDataNotification","invalid device");
      return;
    }
    SensorProfile sensor = sensorScaner.getSensor(deviceMac);
    sensor.stopDataNotification(new SensorProfile.Callback() {
      @Override
      public void gotResult(int result, String errorMsg) {
        promise.resolve(!sensor.hasStartDataNotification());
      }
    });
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void initEEG(String deviceMac, double packageSampleCount, Promise promise) {
    final int inPackageSampleCount = (int) packageSampleCount;
    if (deviceMac == null || deviceMac.isEmpty()){
      promise.reject("initEEG","invalid device");
      return;
    }
    SensorProfile sensor = sensorScaner.getSensor(deviceMac);
    sensor.initEEG(inPackageSampleCount, TIMEOUT, new SensorProfile.Callback() {
      @Override
      public void gotResult(int result, String errorMsg) {
        if (result > 0){
          promise.resolve(result);
        }else{
          promise.reject("initEEG", errorMsg);
        }
      }
    });
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void initECG(String deviceMac, double packageSampleCount, Promise promise) {
    final int inPackageSampleCount = (int) packageSampleCount;
    if (deviceMac == null || deviceMac.isEmpty()){
      promise.reject("initECG","invalid device");
      return;
    }
    SensorProfile sensor = sensorScaner.getSensor(deviceMac);
    sensor.initECG(inPackageSampleCount, TIMEOUT, new SensorProfile.Callback() {
      @Override
      public void gotResult(int result, String errorMsg) {
        if (result > 0){
          promise.resolve(result);
        }else{
          promise.reject("initECG", errorMsg);
        }
      }
    });
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void initIMU(String deviceMac, double packageSampleCount, Promise promise) {
    final int inPackageSampleCount = (int) packageSampleCount;
    if (deviceMac == null || deviceMac.isEmpty()){
      promise.reject("initIMU","invalid device");
      return;
    }
    SensorProfile sensor = sensorScaner.getSensor(deviceMac);
    sensor.initIMU(inPackageSampleCount, TIMEOUT, new SensorProfile.Callback() {
      @Override
      public void gotResult(int result, String errorMsg) {
        if (result > 0){
          promise.resolve(result);
        }else{
          promise.reject("initIMU", errorMsg);
        }
      }
    });
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void initBRTH(String deviceMac, double packageSampleCount, Promise promise){
    final int inPackageSampleCount = (int) packageSampleCount;
    if (deviceMac == null || deviceMac.isEmpty()){
      promise.reject("initBrth","invalid device");
      return;
    }
    SensorProfile sensor = sensorScaner.getSensor(deviceMac);
    sensor.initBRTH(inPackageSampleCount, TIMEOUT, new SensorProfile.Callback() {
      @Override
      public void gotResult(int result, String errorMsg) {
        if (result > 0){
          promise.resolve(result);
        }else{
          promise.reject("initBrth", errorMsg);
        }
      }
    });
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void initDataTransfer(String deviceMac, boolean isGetFeature, Promise promise) {
    if (deviceMac == null || deviceMac.isEmpty()){
      promise.reject("initDataTransfer","invalid device");
      return;
    }
    SensorProfile sensor = sensorScaner.getSensor(deviceMac);
    if (sensor.getDeviceState() != Ready){
      promise.resolve(false);
      return;
    }
    sensor.initDataTransfer(isGetFeature, TIMEOUT, new SensorProfile.Callback() {
      @Override
      public void gotResult(int result, String errorMsg) {
        if (result > 0){
          promise.resolve(result);
        }else{
          promise.reject("initDataTransfer", errorMsg);
        }
      }
    });
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void getBatteryLevel(String deviceMac, Promise promise) {
    if (deviceMac == null || deviceMac.isEmpty()){
      promise.reject("getBatteryLevel","invalid device");
      return;
    }
    SensorProfile sensor = sensorScaner.getSensor(deviceMac);
    sensor.getBatteryLevel(TIMEOUT, new SensorProfile.Callback() {
      @Override
      public void gotResult(int result, String errorMsg) {
        if (result > 0){
          promise.resolve(result);
        }else{
          promise.reject("getBatteryLevel", errorMsg);
        }
      }
    });
  }
  @ReactMethod
  @DoNotStrip
  @Override
  public void getDeviceInfo(String deviceMac, boolean onlyMTU, Promise promise) {
    if (deviceMac == null || deviceMac.isEmpty()){
      promise.reject("getDeviceInfo","invalid device");
      return;
    }
    SensorProfile sensor = sensorScaner.getSensor(deviceMac);
    sensor.fetchDeviceInfo(onlyMTU, TIMEOUT, new SensorProfile.Callback() {
      @Override
      public void gotResult(int result2, String errorMsg) {
        if (result2 > 0){
          SensorProfile.DeviceInfo info = sensor.getDeviceInfo();
          WritableMap result = new WritableNativeMap();
          result.putInt("MTUSize", info.MTUSize);
          if (onlyMTU){
            promise.resolve(result);
            return;
          }
          result.putString("DeviceName", info.deviceName);
          result.putString("ModelName", info.modelName);
          result.putString("HardwareVersion", info.hardwareVersion);
          result.putString("FirmwareVersion", info.firmwareVersion);
          promise.resolve(result);
        }else{
          promise.reject("getBatteryLevel", errorMsg);
        }
      }
    });
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  @DoNotStrip
  public String getDeviceState(String deviceMac){
    if (deviceMac == null || deviceMac.isEmpty()){
      return "Invalid";
    }
    SensorProfile sensor = sensorScaner.getSensor(deviceMac);
    return sensor.getDeviceStateString();
  }

  @ReactMethod
  @DoNotStrip
  public void setParam(String deviceMac, String key, String value, Promise promise){
    if (deviceMac == null || deviceMac.isEmpty()){
      promise.reject("getDeviceInfo","invalid device");
      return;
    }
    SensorProfile sensor = sensorScaner.getSensor(deviceMac);
    promise.resolve("");
  }
}
