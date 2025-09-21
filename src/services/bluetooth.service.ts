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
            console.log("🔄 Setting up Bluetooth...");
            
            // Stop bluetooth service to get full control
            await execAsync("sudo systemctl stop bluetooth");
            
            // Reset and configure adapter
            await execAsync("sudo hciconfig hci0 down");
            await execAsync("sudo hciconfig hci0 up");
            await execAsync("sudo hciconfig hci0 reset");
            await execAsync(`sudo hciconfig hci0 name "${BT_CONFIG.deviceName}"`);
            
            // Configure using btmgmt
            await execAsync("sudo btmgmt power off");
            await execAsync("sudo btmgmt le on");
            await execAsync("sudo btmgmt connectable on");
            await execAsync("sudo btmgmt discov on");
            await execAsync("sudo btmgmt power on");
            
            // Set advertising parameters using hcitool
            try {
                // Set advertising parameters (100ms interval)
                await execAsync("sudo hcitool -i hci0 cmd 0x08 0x0006 20 00 20 00 00 00 00 00 00 00 00 00 00 07 00");
                // Enable advertising
                await execAsync("sudo hcitool -i hci0 cmd 0x08 0x000a 01");
            } catch (error) {
                console.log("Note: Some advertising parameters not supported - this is normal");
            }
            
            console.log("✅ Bluetooth setup complete");
        } catch (error) {
            console.error("❌ Error in Bluetooth setup:", error);
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
            try {
                this.isAdvertising = false;
                bleno.stopAdvertising();
                console.log("📶 Stopped advertising");
            } catch (error) {
                console.error("❌ Error stopping advertising:", error);
            }
        }
    }

    public async start() {
        // Set shorter advertising interval for better visibility
        process.env.BLENO_ADVERTISING_INTERVAL = "100";
        process.env.NOBLE_REPORT_ALL_HCI_EVENTS = "1"; // Enable all HCI events for debugging

        console.log("🚀 Starting Bluetooth service...");
        await this.setupBluetooth();

        bleno.on("stateChange", async (state: BlenoState) => {
            console.log("🔄 Bluetooth state:", state);
            
            if (state === "poweredOn" && !this.isAdvertising) {
                console.log("🔵 Starting BLE advertising...");
                this.isAdvertising = true;
                
                // Start advertising with proper configuration
                const advertisementData = Buffer.from([
                    0x02, 0x01, 0x06, // Flags: LE General Discoverable + BR/EDR Not Supported
                    BT_CONFIG.deviceName.length + 1, 0x09, ...Buffer.from(BT_CONFIG.deviceName), // Complete Local Name
                    17, 0x07, ...Buffer.from(BT_CONFIG.serviceUuid.replace(/-/g, ''), 'hex') // Complete 128-bit Service UUIDs
                ]);

                bleno.startAdvertisingWithEIRData(advertisementData);
            } else if (state !== "poweredOn") {
                console.log("❌ Bluetooth not powered on, stopping advertising");
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

        bleno.on("disconnect", (address: string) => {
            console.log(`❌ Device disconnected: ${address}`);
            this.isDeviceConnected = false;
            this.connectedDeviceAddress = null;
            
            // If we haven't received WiFi credentials yet, restart advertising
            if (this.isAdvertising) {
                bleno.startAdvertising(BT_CONFIG.deviceName, [BT_CONFIG.serviceUuid]);
            }
        });

        // Disable security features to avoid pairing
        (bleno as any).setSecurityLevel?.("low");
    }
}