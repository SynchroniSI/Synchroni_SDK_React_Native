package com.synchronisdk;

import com.facebook.proguard.annotations.DoNotStrip;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;

abstract class SynchronisdkSpec extends ReactContextBaseJavaModule {
  SynchronisdkSpec(ReactApplicationContext context) {
    super(context);
  }
  @ReactMethod
  @DoNotStrip
  public abstract void addListener(String eventName);

  @ReactMethod
  @DoNotStrip
  public abstract void removeListeners(double count);
  @ReactMethod
  @DoNotStrip
  public abstract void startScan(double timeoutInMS, Promise promise);

  @ReactMethod
  @DoNotStrip
  public abstract void stopScan(Promise promise);

  @ReactMethod(isBlockingSynchronousMethod = true)
  @DoNotStrip
  public abstract boolean isScaning();

  @ReactMethod(isBlockingSynchronousMethod = true)
  @DoNotStrip
  public abstract boolean isEnable();
  @ReactMethod(isBlockingSynchronousMethod = true)
  @DoNotStrip
  public abstract boolean doInitSensor(String deviceMac);
  @ReactMethod
  @DoNotStrip
  public abstract void connect(String deviceMac, Promise promise);

  @ReactMethod
  @DoNotStrip
  public abstract void disconnect(String deviceMac, Promise promise);

  @ReactMethod
  @DoNotStrip
  public abstract void startDataNotification(String deviceMac, Promise promise);

  @ReactMethod
  @DoNotStrip
  public abstract void stopDataNotification(String deviceMac, Promise promise);

  @ReactMethod
  @DoNotStrip
  public abstract void initEEG(String deviceMac, double packageSampleCount, Promise promise);
  @ReactMethod
  @DoNotStrip
  public abstract void initECG(String deviceMac, double packageSampleCount, Promise promise);
  @ReactMethod
  @DoNotStrip
  public abstract void initIMU(String deviceMac, double packageSampleCount, Promise promise);
  @ReactMethod
  @DoNotStrip
  public abstract void initBRTH(String deviceMac, double packageSampleCount, Promise promise);
  @ReactMethod
  @DoNotStrip
  public abstract void initDataTransfer(String deviceMac, boolean isGetFeature, Promise promise);
  @ReactMethod
  @DoNotStrip
  public abstract void getBatteryLevel(String deviceMac, Promise promise);
  @ReactMethod
  @DoNotStrip
  public abstract void getDeviceInfo(String deviceMac, boolean onlyMTU, Promise promise);
  ////////////////////////////////////////////////////////////////////////////////////////////
  @ReactMethod(isBlockingSynchronousMethod = true)
  @DoNotStrip
  public abstract String getDeviceState(String deviceMac);
  @ReactMethod
  @DoNotStrip
  public abstract void setParam(String deviceMac, String key, String value, Promise promise);
}
