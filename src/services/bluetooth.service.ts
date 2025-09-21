import bleno from "@abandonware/bleno";
import { WifiService } from "./wifi.service";
import { BT_CONFIG } from "../interface/bluetooth.types";
import { WriteCallback, BlenoState } from "../interface/bluetooth.types";

export class BluetoothService {
    private static instance: BluetoothService | null = null;
    private isAdvertising = false;
    private isDeviceConnected = false;
    private connectedDeviceAddress: string | null = null;

    private constructor() {}

    public static getInstance(): BluetoothService {
        if (!BluetoothService.instance) {
            BluetoothService.instance = new BluetoothService();
        }
        return BluetoothService.instance;
    }

    private createDeviceIdCharacteristic() {
        return new bleno.Characteristic({
            uuid: BT_CONFIG.characteristics.deviceIdUuid,
            properties: ["writeWithoutResponse"],
            onWriteRequest: (data: Buffer, _offset: number, _withoutResponse: boolean, callback: WriteCallback) => {
                const deviceId = data.toString("utf8");
                console.log("📱 Device ID received:", deviceId);
                callback(BT_CONFIG.RESULT_SUCCESS);
            }
        });
    }

    private createWifiCredsCharacteristic() {
        return new bleno.Characteristic({
            uuid: BT_CONFIG.characteristics.wifiCredsUuid,
            properties: ["writeWithoutResponse"],
            onWriteRequest: (data: Buffer, _offset: number, _withoutResponse: boolean, callback: WriteCallback) => {
                try {
                    const creds = JSON.parse(data.toString("utf8"));
                    console.log("📶 WiFi credentials received:", creds);

                    WifiService.connect(creds.ssid, creds.password)
                        .then(() => console.log("✅ WiFi Connected!"))
                        .catch(err => console.error("❌ WiFi connection failed:", err));

                    callback(BT_CONFIG.RESULT_SUCCESS);
                } catch (err) {
                    console.error("❌ Invalid WiFi credentials:", err);
                    callback(BT_CONFIG.RESULT_UNLIKELY_ERROR);
                }
            }
        });
    }

    private stopAdvertising() {
        if (this.isAdvertising) {
            this.isAdvertising = false;
            bleno.stopAdvertising();
            console.log("📶 Stopped advertising");
        }
    }

    public async start() {
        console.log("🚀 Starting Bluetooth service...");

        bleno.on("stateChange", (state: BlenoState) => {
            console.log("🔄 Bluetooth state:", state);

            if (state === "poweredOn" && !this.isAdvertising) {
                this.isAdvertising = true;
                bleno.startAdvertising(BT_CONFIG.deviceName, [BT_CONFIG.serviceUuid]);
            } else if (state !== "poweredOn") {
                this.stopAdvertising();
            }
        });

        bleno.on("advertisingStart", (error: Error | null) => {
            if (error) {
                console.error("❌ Advertising failed:", error);
                return;
            }
            console.log("✅ Advertising started");

            const primaryService = new bleno.PrimaryService({
                uuid: BT_CONFIG.serviceUuid,
                characteristics: [
                    this.createDeviceIdCharacteristic(),
                    this.createWifiCredsCharacteristic()
                ]
            });

            bleno.setServices([primaryService], (err) => {
                if (err) console.error("❌ Failed to set services:", err);
                else console.log("✅ Services set successfully");
            });
        });

        bleno.on("accept", (address: string) => {
            console.log(`🔗 Device connected: ${address}`);
            this.isDeviceConnected = true;
            this.connectedDeviceAddress = address;
        });

        bleno.on("disconnect", (address: string) => {
            console.log(`❌ Device disconnected: ${address}`);
            this.isDeviceConnected = false;
            this.connectedDeviceAddress = null;

            // Restart advertising so a new device can connect
            if (!this.isAdvertising) {
                this.isAdvertising = true;
                bleno.startAdvertising(BT_CONFIG.deviceName, [BT_CONFIG.serviceUuid]);
            }
        });

        // Skip SMP / pairing to avoid errors
        (bleno as any).setSecurityLevel?.("low");
    }
}
