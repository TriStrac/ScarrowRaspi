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
    deviceName: "SCARROW-CENTRAL-DEVICE",
    serviceUuid: "ff51b30e-d7e2-4d93-8842-a7c4a57dfb10",
    characteristics: {
        deviceIdUuid: "ff51b31e-d7e2-4d93-8842-a7c4a57dfb10",
        wifiCredsUuid: "ff51b32e-d7e2-4d93-8842-a7c4a57dfb10"
    },
    RESULT_SUCCESS: 0,
    RESULT_UNLIKELY_ERROR: 0x0E
};
