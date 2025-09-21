import bleno from "@abandonware/bleno";
import { exec } from "child_process";
import { promisify } from "util";
import { WifiService } from "./wifi.service";
import { BT_CONFIG } from "../interface/bluetooth.types";
import { WriteCallback, BlenoState } from "../interface/bluetooth.types";

const execAsync = promisify(exec);

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

    private async setupBluetooth() {
        try {
            await execAsync("sudo hciconfig hci0 down");
            await execAsync("sudo hciconfig hci0 up");
            await execAsync("sudo btmgmt ssp off"); // Disable Secure Simple Pairing
            await execAsync("sudo btmgmt pairable off");
            await execAsync("sudo btmgmt connectable on");
            await execAsync("sudo bt-device -l | cut -d ' ' -f 3 | xargs -I {} sudo bt-device -r {}"); // Remove all paired devices
        } catch (error) {
            console.log("Some Bluetooth setup commands failed, continuing anyway...");
        }
    }

    private createDeviceIdCharacteristic() {
        return new bleno.Characteristic({
            uuid: BT_CONFIG.characteristics.deviceIdUuid,
            properties: ["writeWithoutResponse"],
            onWriteRequest: (data: Buffer, _offset: number, _withoutResponse: boolean, callback: WriteCallback) => {
                try {
                    const deviceId = data.toString("utf8");
                    console.log("📱 Device ID received:", deviceId);
                    callback(BT_CONFIG.RESULT_SUCCESS);
                } catch (error) {
                    console.error("❌ Error processing device ID:", error);
                    callback(BT_CONFIG.RESULT_UNLIKELY_ERROR);
                }
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
                        .then(() => {
                            console.log("✅ WiFi Connected!");
                            this.stopAdvertising();
                        })
                        .catch(err => console.error("❌ WiFi connection failed:", err));
                    
                    callback(BT_CONFIG.RESULT_SUCCESS);
                } catch (error) {
                    console.error("❌ Error processing WiFi credentials:", error);
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

    private async unpairDevice() {
        if (this.connectedDeviceAddress) {
            try {
                await execAsync(`sudo bt-device -r ${this.connectedDeviceAddress}`);
                console.log(`🔓 Unpaired device: ${this.connectedDeviceAddress}`);
            } catch (error) {
                console.error("❌ Error unpairing device:", error);
            }
            this.connectedDeviceAddress = null;
        }
    }

    public async start() {
        process.env.BLENO_ADVERTISING_INTERVAL = "300";
        process.env.NOBLE_REPORT_ALL_HCI_EVENTS = "0";

        await this.setupBluetooth();

        bleno.on("stateChange", async (state: BlenoState) => {
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
                console.error("❌ Advertising failed to start:", error);
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

            bleno.setServices([primaryService], (error: Error | null) => {
                if (error) {
                    console.error("❌ Failed to set services:", error);
                } else {
                    console.log("✅ Services set successfully");
                }
            });
        });

        bleno.on("accept", (address: string) => {
            console.log(`🔗 Device connected: ${address}`);
            this.isDeviceConnected = true;
            this.connectedDeviceAddress = address;
        });

        bleno.on("disconnect", async (address: string) => {
            console.log(`❌ Device disconnected: ${address}`);
            this.isDeviceConnected = false;
            
            await this.unpairDevice();
            
            if (this.isAdvertising) {
                bleno.startAdvertising(BT_CONFIG.deviceName, [BT_CONFIG.serviceUuid]);
            }
        });

        // Disable security pairing to avoid length errors
        (bleno as any).setSecurityLevel?.("low");
    }
}