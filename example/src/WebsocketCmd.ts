type CmdItem = {
  id?: string;
  type?: string;
  target?: string;
  value?: string;
  timeout?: number;
};

type CmdResult = {
  id?: string;
  type?: string;
  value?: string;
};

type CmdResolveReject = {
  _resolve: any;
  _reject: any;
};

export default class WebSocketCmd {
  private appGroupID: string;
  private ws: WebSocket | undefined;
  private url: string;
  private deviceName: string;
  private mac: string;
  private appType: string;
  private lastCmdID: number;
  private currentCmd: CmdItem | undefined;
  private boradCastWaitingQueue: CmdItem[];
  private cmdWaitingQueue: CmdItem[];
  private cmdResolveQueue: Map<string, CmdResolveReject>;
  private cmdTimeoutTimer: NodeJS.Timeout | undefined;
  private connectTimeoutTimer: NodeJS.Timeout | undefined;
  private connectQueue: CmdResolveReject[];

  constructor(url: string, deviceName: string, mac: string, appType: string) {
    this.lastCmdID = 0;
    this.cmdResolveQueue = new Map<string, any>();
    this.cmdWaitingQueue = [];
    this.boradCastWaitingQueue = [];
    this.url = url;
    this.deviceName = deviceName;
    this.mac = mac;
    this.appType = appType;
    this.appGroupID = '';
    this.connectQueue = [];
  }

  public get isConnected(): boolean {
    return this.ws !== undefined && this.ws.readyState === WebSocket.OPEN;
  }

  public get hasInited(): boolean {
    return this.isConnected && this.appGroupID !== '';
  }

  public get isIniting(): boolean {
    return (
      this.ws !== undefined &&
      (this.ws.readyState === WebSocket.CONNECTING ||
        (this.ws.readyState === WebSocket.OPEN && this.appGroupID === ''))
    );
  }

  public get AppGroupID(): string {
    return this.appGroupID;
  }

  private async doRegister() {
    if (!this.isConnected) {
      return;
    }
    try {
      const result = await this.register();
      if (!result) {
        console.error('register fail, retry after 10s');
        setTimeout(() => {
          this.doRegister();
        }, 10000);
      } else {
        console.log('register success');
      }
    } catch (error) {
      console.error('register fail, retry after 10s');
      setTimeout(() => {
        this.doRegister();
      }, 10000);
    }
  }

  public async open(timeout: number = 5000): Promise<boolean> {
    if (!this.ws) {
      const ws = new WebSocket(this.url);
      ws.onopen = () => {
        if (this.connectTimeoutTimer) {
          clearTimeout(this.connectTimeoutTimer);
          this.connectTimeoutTimer = undefined;
          this.connectQueue.forEach((element) => {
            element._resolve(true);
          });
        }
        this.doRegister();
      };

      ws.onmessage = (e) => {
        this.handleMessage(e.data);
      };

      ws.onerror = (e) => {
        console.error(e.message);
      };

      ws.onclose = (e) => {
        this.onClose(e.reason);
      };
      this.ws = ws;
    }
    if (this.isConnected) {
      return true;
    }
    return new Promise<boolean>((resolve, reject) => {
      const resolves: CmdResolveReject = {
        _resolve: resolve,
        _reject: reject,
      };
      this.connectQueue.push(resolves);
      if (!this.connectTimeoutTimer) {
        this.connectTimeoutTimer = setTimeout(() => {
          this.connectTimeoutTimer = undefined;
          this.connectQueue.forEach((element) => {
            if (this.isConnected) {
              element._resolve(true);
            } else {
              element._resolve(false);
            }
          });
        }, timeout);
      }
    });
  }

  public close() {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
  }
  ////////////////////////////////////////////////////////////////////////////
  public async setNativeDataInfo(
    ntfDataType: number,
    packageSampleCount: number,
    channelCount: number,
    sampleRate: number,
    resolutionBits: number,
    K: number
  ): Promise<string> {
    const dataInfos = [
      'native_data_info',
      this.appType,
      ntfDataType,
      packageSampleCount,
      channelCount,
      sampleRate,
      resolutionBits,
      K,
    ];
    const dataInfo = dataInfos.join('/');
    return this.sendCmd(dataInfo, '');
  }

  public boardCastNativeDataSwitch(dataSwitch: Boolean) {
    if (!this.ws || !this.isConnected) {
      return;
    }
    let item: CmdItem = {};
    if (dataSwitch) {
      item.type = 'native_data_start/' + this.appType;
    } else {
      item.type = 'native_data_stop/' + this.appType;
    }
    if (this.hasInited) {
      this.ws.send(JSON.stringify(item));
    } else if (this.isIniting) {
      this.boradCastWaitingQueue.push(item);
    }
  }

  public boardCastNativeData(data: string) {
    if (!this.ws || !this.isConnected) {
      return;
    }
    // console.log(data);
    let item: CmdItem = {};
    item.type = 'native_data/' + this.appType;
    item.value = data;
    if (this.hasInited) {
      this.ws.send(JSON.stringify(item));
    } else if (this.isIniting) {
      this.boradCastWaitingQueue.push(item);
    }
  }

  public register = async (): Promise<boolean> => {
    if (!this.isConnected) {
      return false;
    }
    if (this.hasInited) {
      return true;
    }
    let item: CmdItem = {};
    item.id = '0';
    item.type = 'cmd';
    item.value =
      'register_app/' + this.appType + '/' + this.deviceName + '/' + this.mac;
    item.timeout = 5000;
    if (!this.isConnected) {
      return false;
    } else {
      return new Promise<boolean>((resolve, reject) => {
        if (!this.ws) {
          resolve(false);
          return;
        }
        const resolves: CmdResolveReject = {
          _resolve: resolve,
          _reject: reject,
        };
        this.cmdResolveQueue.set('0', resolves);
        this.ws.send(JSON.stringify(item));
        this.currentCmd = item;
        this.cmdTimeoutTimer = setTimeout(() => {
          this.onTimeOut();
        }, item.timeout);
      });
    }
  };

  public join = async (appGroupID: string): Promise<boolean> => {
    if (!this.ws) {
      return false;
    }
    let item: CmdItem = {};
    item.id = '0';
    item.type = 'cmd';
    item.value =
      'join_app/' +
      appGroupID +
      '/' +
      this.appType +
      '/' +
      this.deviceName +
      '/' +
      this.mac;
    item.timeout = 5000;
    if (!this.isConnected) {
      return false;
    } else {
      return new Promise<boolean>((resolve, reject) => {
        if (!this.ws) {
          resolve(false);
          return;
        }
        const resolves: CmdResolveReject = {
          _resolve: resolve,
          _reject: reject,
        };
        this.cmdResolveQueue.set('0', resolves);
        this.currentCmd = item;
        this.ws.send(JSON.stringify(item));

        this.cmdTimeoutTimer = setTimeout(() => {
          this.onTimeOut();
        }, item.timeout);
      });
    }
  };

  public async sendCmd(
    cmdValue: string,
    target: string,
    timeout: number = 5000
  ): Promise<string> {
    ++this.lastCmdID;
    const cmdId = this.appType + '_' + this.mac + '_' + this.lastCmdID;

    return new Promise<string>((resolve, reject) => {
      if (!this.ws || !this.isConnected) {
        reject('websocket not connected');
        return;
      }

      const resolves: CmdResolveReject = {
        _resolve: resolve,
        _reject: reject,
      };
      this.cmdResolveQueue.set(cmdId, resolves);

      const item: CmdItem = {};
      item.id = cmdId;
      item.type = 'cmd';
      item.target = target;
      item.value = cmdValue;
      item.timeout = timeout;

      if (this.isIniting || this.cmdWaitingQueue.length > 0) {
        this.cmdWaitingQueue.push(item);
      } else {
        this.ws.send(JSON.stringify(item));
        this.currentCmd = item;
        this.cmdTimeoutTimer = setTimeout(() => {
          this.onTimeOut();
        }, item.timeout);
      }
    });
  }

  //////////////////////////////////////////////////////////////////////////////////

  private onTimeOut() {
    this.cancelCurrentCmd();
    if (this.hasInited) {
      this.sendWaitingCmd();
    }
  }

  private handleMessage(msg: string) {
    console.log(msg);
    const result: CmdResult = JSON.parse(msg);
    if (!result.type || !result.id) {
      console.log('Invalid command result: ' + msg);
      return;
    }
    const resolve = this.cmdResolveQueue.get(result.id);
    this.cmdResolveQueue.delete(result.id);

    if (this.cmdTimeoutTimer) {
      clearTimeout(this.cmdTimeoutTimer);
      this.cmdTimeoutTimer = undefined;
    }

    if (result.id === '0') {
      //register or join
      if (result.type === 'result_ok' && result.value) {
        this.appGroupID = result.value;
        console.log('register or join app group success: ' + this.appGroupID);
        resolve?._resolve(true);
      } else {
        resolve?._resolve(false);
      }
    } else if (resolve) {
      if (result.type === 'result_ok') {
        resolve._resolve(result.value);
      } else {
        //result.type == "result_fail"
        resolve._reject(result.value);
      }
    }
    //send waiting commands
    if (this.hasInited) {
      this.sendWaitingBoardCast(false);
      this.sendWaitingCmd();
    }
  }

  private onClose(msg?: string) {
    console.log('onClose: ' + msg);
    this.appGroupID = '';
    this.lastCmdID = 0;
    if (this.cmdTimeoutTimer) {
      clearTimeout(this.cmdTimeoutTimer);
      this.cmdTimeoutTimer = undefined;
    }
    this.purgeCmds();
    this.sendWaitingBoardCast(true);
  }

  private sendWaitingBoardCast(isPurge: boolean) {
    if (!isPurge) {
      this.boradCastWaitingQueue.forEach((cmdItem) => {
        if (this.ws && this.hasInited) {
          this.ws.send(JSON.stringify(cmdItem));
        }
      });
    }

    this.boradCastWaitingQueue = [];
  }

  private sendWaitingCmd() {
    const cmdItem = this.cmdWaitingQueue.shift();
    if (cmdItem) {
      if (this.ws && this.hasInited) {
        this.ws.send(JSON.stringify(cmdItem));
        this.currentCmd = cmdItem;
        this.cmdTimeoutTimer = setTimeout(() => {
          this.onTimeOut();
        }, cmdItem.timeout);
      } else {
        if (cmdItem.id) {
          const resolve = this.cmdResolveQueue.get(cmdItem.id);
          this.cmdResolveQueue.delete(cmdItem.id);
          resolve?._reject('websocket not connected');
        }
      }
    }
  }

  private cancelCurrentCmd() {
    if (this.currentCmd && this.currentCmd.id) {
      const resolve = this.cmdResolveQueue.get(this.currentCmd.id);
      this.cmdResolveQueue.delete(this.currentCmd.id);
      resolve?._reject('cmd timeout');
      this.currentCmd = undefined;
    }
  }

  private purgeCmds() {
    this.cancelCurrentCmd();
    const waitingQueue = this.cmdWaitingQueue;
    this.cmdWaitingQueue = [];
    waitingQueue.forEach((cmdItem) => {
      if (cmdItem.id) {
        const resolve = this.cmdResolveQueue.get(cmdItem.id);
        this.cmdResolveQueue.delete(cmdItem.id);
        resolve?._reject('websocket not connected');
      }
    });
    this.cmdResolveQueue.clear();
  }
}
