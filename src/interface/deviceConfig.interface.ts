export interface DeviceConfig {
    deviceId: string;
    farmer?: string;
    wifi?: {
        ssid: string;
        password: string;
    };
}