export interface BluetoothConfig {
    deviceName: string;
    serviceUuid: string;
    characteristics: {
        deviceIdUuid: string;
        wifiCredsUuid: string;
    };
    RESULT_SUCCESS: number;
    RESULT_UNLIKELY_ERROR: number;
}

export const BT_CONFIG: BluetoothConfig = {
    deviceName: "ScarrowRaspi",
    serviceUuid: "ff51b30e-d7e2-4d93-8842-a7c4a57dfb10",
    characteristics: {
        deviceIdUuid: "ff51b31e-d7e2-4d93-8842-a7c4a57dfb10",
        wifiCredsUuid: "ff51b32e-d7e2-4d93-8842-a7c4a57dfb10"
    },
    RESULT_SUCCESS: 0,
    RESULT_UNLIKELY_ERROR: 0x0E
};

export type BlenoCallback = (error?: string | null) => void;
export type WriteCallback = (result: number) => void;
export type BlenoState = "unknown" | "resetting" | "unsupported" | "unauthorized" | "poweredOff" | "poweredOn";
export type OnWriteRequest = (data: Buffer, offset: number, withoutResponse: boolean, callback: WriteCallback) => void;
export type StateChangeCallback = (state: BlenoState) => void;
export type AddressCallback = (clientAddress: string) => void;
export type ErrorCallback = (error?: Error | null) => void;