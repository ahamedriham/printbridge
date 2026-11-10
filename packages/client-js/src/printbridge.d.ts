export interface ConnectOptions {
  host?: string;
  wsPort?: number;
  wssPort?: number;
  /** Defaults to true on https pages, false otherwise. */
  secure?: boolean | null;
  retries?: number;
  delay?: number;
}

export interface PrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
  description: string;
  status?: number;
  driver: string;
  port: string;
}

export interface PrintConfig {
  printer?: string;
  host?: string;
  port?: number;
  file?: string;
  copies?: number;
  /** iconv-lite encoding for plain raw data, e.g. 'cp1256', 'cp720', 'cp437'. */
  encoding?: string;
  jobName?: string;
  size?: { width: number; height: number } | string;
  units?: 'mm' | 'cm' | 'in';
  orientation?: 'portrait' | 'landscape';
  margins?: 0 | 'none' | { top: number; bottom: number; left: number; right: number };
  color?: boolean;
  duplex?: 'simplex' | 'shortEdge' | 'longEdge';
  /** Render HTML to PDF first, then print the PDF. */
  via?: 'pdf';
  scale?: 'fit' | 'shrink' | 'noscale';
  paperSize?: string;
  pages?: string;
  timeout?: number;
  [key: string]: unknown;
}

export type RawFormat = 'plain' | 'command' | 'base64' | 'hex' | 'file' | 'url' | 'bytes';
export type PixelFormat = 'html' | 'pdf' | 'image';
export type Flavor = 'plain' | 'base64' | 'file' | 'url';

export type PrintData =
  | string
  | { type?: 'raw'; format?: RawFormat; data: string | number[] }
  | { type: 'pixel'; format: PixelFormat; flavor?: Flavor; data: string };

export interface SerialOptions {
  baudRate?: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 2;
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
  rtscts?: boolean;
  xon?: boolean;
  xoff?: boolean;
  encoding?: 'utf8' | 'hex' | 'base64' | 'bytes';
  start?: string;
  end?: string;
  width?: number;
}

export interface EscPosBuilder {
  init(): EscPosBuilder;
  text(s: string): EscPosBuilder;
  line(s?: string): EscPosBuilder;
  align(a: 'left' | 'center' | 'right'): EscPosBuilder;
  bold(on: boolean): EscPosBuilder;
  underline(on: boolean): EscPosBuilder;
  size(w?: number, h?: number): EscPosBuilder;
  feed(n?: number): EscPosBuilder;
  cut(partial?: boolean): EscPosBuilder;
  drawer(pin?: 0 | 1): EscPosBuilder;
  codepage(n: number): EscPosBuilder;
  qr(data: string, size?: number, ec?: 'L' | 'M' | 'Q' | 'H'): EscPosBuilder;
  row(left: string, right: string, width?: number): EscPosBuilder;
  raw(s: string): EscPosBuilder;
  toString(): string;
}

export interface PrintBridgeClient {
  connect(opts?: ConnectOptions): Promise<{ version: string }>;
  disconnect(): Promise<void>;
  isActive(): boolean;
  call<T = unknown>(call: string, params?: Record<string, unknown>): Promise<T>;
  on(event: string, fn: (data: any) => void): PrintBridgeClient;
  off(event: string, fn: (data: any) => void): PrintBridgeClient;
  version(): Promise<string>;
  info(): Promise<{ app: string; version: string; platform: string; hostname: string; arch: string }>;
  printers: {
    list(): Promise<PrinterInfo[]>;
    find(query?: string): Promise<string | string[]>;
    getDefault(): Promise<string | null>;
  };
  config(printer: string | { host: string; port?: number } | { file: string }, options?: PrintConfig): PrintConfig;
  print(config: PrintConfig, data: PrintData | PrintData[]): Promise<unknown>;
  renderPdf(html: string, config?: PrintConfig): Promise<{ base64: string; bytes: number }>;
  serial: {
    findPorts(): Promise<Array<{ path: string; manufacturer: string; serialNumber: string; vendorId: string; productId: string; friendlyName: string }>>;
    open(port: string, options?: SerialOptions): Promise<{ path: string }>;
    write(port: string, data: string | number[], format?: 'plain' | 'base64' | 'hex'): Promise<{ bytes: number }>;
    close(port: string): Promise<{ path: string; wasOpen: boolean }>;
    isOpen(port: string): Promise<boolean>;
    onData(fn: (m: { port: string; data: string | number[] }) => void): PrintBridgeClient;
  };
  usb: {
    list(): Promise<Array<{ vendorId: string; productId: string; busNumber: number; deviceAddress: number; class: number }>>;
    interfaces(vendorId: string, productId: string): Promise<unknown[]>;
    claim(vendorId: string, productId: string, iface?: number): Promise<{ claimed: boolean }>;
    send(vendorId: string, productId: string, endpoint: string, data: string | number[], format?: string): Promise<{ bytes: number }>;
    read(vendorId: string, productId: string, endpoint: string, length?: number): Promise<{ data: number[]; base64: string }>;
    release(vendorId: string, productId: string): Promise<{ released: boolean }>;
  };
  hid: {
    list(): Promise<unknown[]>;
    claim(vendorId: string, productId: string, serial?: string): Promise<{ claimed: boolean }>;
    send(vendorId: string, productId: string, data: number[] | string, serial?: string): Promise<{ bytes: number }>;
    read(vendorId: string, productId: string, serial?: string, timeout?: number): Promise<{ data: number[]; base64: string }>;
    release(vendorId: string, productId: string, serial?: string): Promise<{ released: boolean }>;
    onData(fn: (m: { vendorId: string; productId: string; data: number[]; base64: string }) => void): PrintBridgeClient;
  };
  escpos(): EscPosBuilder;
}

declare const PrintBridge: PrintBridgeClient;
export default PrintBridge;
export = PrintBridge;
