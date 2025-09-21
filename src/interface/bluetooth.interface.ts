// Bluetooth LE characteristic result codes
export const RESULT_SUCCESS = 0;
export const RESULT_INVALID_OFFSET = 1;
export const RESULT_INVALID_ATTRIBUTE_LENGTH = 2;
export const RESULT_UNLIKELY_ERROR = 3;

// UUIDs for BLE service and characteristics
export const DEVICE_ID_UUID = "12345678-1234-5678-1234-56789abcdef0";
export const WIFI_CREDS_UUID = "12345678-1234-5678-1234-56789abcdef1";
export const SERVICE_UUID = "12345678-1234-5678-1234-56789abcdef9";

export type BlenoState = "unknown" | "resetting" | "unsupported" | "unauthorized" | "poweredOff" | "poweredOn";

export interface WifiCredentials {
    ssid: string;
    password: string;
}

export interface CharacteristicOptions {
    uuid: string;
    properties: string[];
}

// Type declaration for bleno module
declare module '@abandonware/bleno' {
    export interface Characteristic {
        on(event: string, callback: Function): void;
        notify(state: boolean): void;
        RESULT_SUCCESS: number;
        RESULT_INVALID_OFFSET: number;
        RESULT_INVALID_ATTRIBUTE_LENGTH: number;
        RESULT_UNLIKELY_ERROR: number;
        onReadRequest?: (offset: number, callback: (result: number, data?: Buffer) => void) => void;
        onWriteRequest?: (data: Buffer, offset: number, withoutResponse: boolean, callback: (result: number) => void) => void;
    }

    export class Characteristic {
        constructor(options: CharacteristicOptions);
    }

    export class PrimaryService {
        constructor(options: {
            uuid: string;
            characteristics: Characteristic[];
        });
    }

    export function startAdvertising(name: string, serviceUuids: string[]): void;
    export function startAdvertisingWithEIRData(advertisementData: Buffer): void;
    export function stopAdvertising(callback?: () => void): void;
    export function setServices(services: PrimaryService[], callback?: (error?: Error) => void): void;
    export function on(event: string, callback: Function): void;
}