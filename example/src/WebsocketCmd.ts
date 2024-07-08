type CmdItem = {
  id?: string;
  type?: string;
  target?: string;
  value?: string;
  timeout?: number;
};

export default class WebSocketCmd {
  public appGroupID: string;
  private ws: WebSocket | undefined;
  private url: string;
  private mac: string;
  private appType: string;
  private cmdID: number;
  private cmdQueue: Map<string, CmdItem>;

  constructor(url: string, mac: string, appType: string) {
    this.cmdID = 0;
    this.cmdQueue = new Map<string, CmdItem>();
    this.url = url;
    this.mac = mac;
    this.appType = appType;
    this.appGroupID = '';
  }

  public open() {
    if (this.ws) return;

    const ws = new WebSocket(this.url);
    ws.onopen = () => {
      this.sendRegister();
    };

    ws.onmessage = (e) => {
      // a message was received
      this.handleMessage(e.data);
    };

    ws.onerror = (e) => {
      // an error occurred
      console.log(e.message);
    };

    ws.onclose = (e) => {
      // connection closed
      this.onClose(e.reason);
    };
    this.ws = ws;
  }

  public close() {
    if (this.ws) {
      this.ws?.close();
      this.ws = undefined;
    }
  }

  public sendRegister() {
    if (!this.ws) {
      return;
    }
    let item: CmdItem = {};
    item.id = '0';
    item.type = 'cmd';
    item.value = 'register_app/' + this.appType + '/' + this.mac;
    this.ws.send(JSON.stringify(item));
  }

  public boardCastNativeDataSwitch(dataSwitch: Boolean) {
    if (!this.ws) {
      return;
    }
    let item: CmdItem = {};
    item.id = '0';
    item.type = 'native_data';
    if (dataSwitch) {
      item.value = 'OB/NATIVE_DATA_START';
    } else {
      item.value = 'OB/NATIVE_DATA_STOP';
    }
    this.ws.send(JSON.stringify(item));
  }

  public boardCastNativeData(data: string) {
    if (!this.ws) {
      return;
    }
    let item: CmdItem = {};
    item.id = '0';
    item.type = 'native_data';
    item.value = this.appType + '/NATIVE_DATA/' + data;
    this.ws.send(JSON.stringify(item));
  }

  public sendCmd(cmdType: string, cmdValue: string) {
    if (!this.ws) {
      return;
    }
    ++this.cmdID;
    const item: CmdItem = {};
    item.id = this.appType + '_' + this.mac + '_' + this.cmdID;
    item.type = cmdType;
    item.value = cmdValue;
    item.timeout = 5000;
    this.cmdQueue.set(item.id, item);
    this.ws.send(JSON.stringify(item));
  }

  private handleMessage(msg: string) {
    console.log(msg);
  }

  private onClose(msg?: string) {
    console.log(msg);
    this.appGroupID = '';
  }
}
