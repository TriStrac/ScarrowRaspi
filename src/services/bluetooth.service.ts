import bleno from "@aban    private a    private async setupBluetooth() {
        try {
            console.log("🔄 Setting up Bluetooth...");
            
            // Stop bluetooth service to get full control
            await execAsync("sudo systemctl stop bluetooth");
            
            // Reset and configure adapter
            await execAsync("sudo hciconfig hci0 down");
            await execAsync("sudo hciconfig hci0 up");
            await execAsync("sudo hciconfig hci0 reset");
            await execAsync(`sudo hciconfig hci0 name "${BT_CONFIG.deviceName}"`);
            
            // Configure using btmgmt (more reliable than hciconfig)
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
        }etooth() {
        try {
            // Reset adapter and configure BLE adapter
            await execAsync("sudo hciconfig hci0 down");
            await execAsync("sudo hciconfig hci0 up");
            await execAsync("sudo hciconfig hci0 name SCARROW-CENTRAL-DEVICE");
            await execAsync("sudo btmgmt le on"); // Enable BLE
            await execAsync("sudo btmgmt bredr off"); // Disable classic Bluetooth
            await execAsync("sudo btmgmt power on"); // Ensure powered on
            await execAsync("sudo btmgmt connectable on");
            await execAsync("sudo btmgmt discov on"); // Make discoverable
            // Set LE advertisement parameters for maximum visibility
            await execAsync("sudo hcitool -i hci0 cmd 0x08 0x0006 A0 00 A0 00 00 00 00 00 00 00 00 00 00 07 00"); // 100ms interval
            await execAsync("sudo hcitool -i hci0 cmd 0x08 0x0008 1F 02 01 06 1B FF 4C 00 02 15 FF 51 B3 0E D7 E2 4D 93 88 42 A7 C4 A5 7D FB 10 00 00 00 00 C5"); // Set advertisement data";
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
            // Reset and configure BLE adapter
            await execAsync("sudo hciconfig hci0 down");
            await execAsync("sudo hciconfig hci0 up");
            await execAsync("sudo hciconfig hci0 leadv"); // Enable BLE advertising
            await execAsync("sudo hciconfig hci0 noscan"); // Disable scanning
            await execAsync("sudo btmgmt le on"); // Enable BLE
            await execAsync("sudo btmgmt bredr off"); // Disable classic Bluetooth
            await execAsync("sudo btmgmt power on"); // Ensure powered on
            await execAsync("sudo btmgmt connectable on");
            await execAsync("sudo btmgmt discov on"); // Make discoverable
            await execAsync("sudo btmgmt advertising on"); // Enable advertising
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
            try {
                this.isAdvertising = false;
                bleno.stopAdvertising();
                console.log("📶 Stopped advertising");
            } catch (error) {
                console.error("❌ Error stopping advertising:", error);
            }
        }
    }

    private async checkBluetoothStatus() {
        try {
            const { stdout } = await execAsync("hciconfig hci0");
            console.log("🔍 Bluetooth adapter status:", stdout);
        } catch (error) {
            console.error("❌ Error checking Bluetooth status:", error);
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
        // Set shorter advertising interval for better visibility
        process.env.BLENO_ADVERTISING_INTERVAL = "100";
        process.env.NOBLE_REPORT_ALL_HCI_EVENTS = "1"; // Enable all HCI events for debugging

        console.log("🚀 Starting Bluetooth service...");
        await this.setupBluetooth();
        await this.checkBluetoothStatus();

        bleno.on("stateChange", async (state: BlenoState) => {
            console.log("🔄 Bluetooth state:", state);
            
            if (state === "poweredOn" && !this.isAdvertising) {
                console.log("🔵 Starting BLE advertising...");
                this.isAdvertising = true;
                const advertisementData = {
                    localName: BT_CONFIG.deviceName,
                    serviceUuids: [BT_CONFIG.serviceUuid],
                    manufacturerData: Buffer.from([0x01]), // Add some manufacturer data
                    txPowerLevel: 127 // Maximum power level for better visibility
                };
                
                bleno.startAdvertisingWithEIRData(
                    Buffer.from([
                        // Flags
                        0x02, // Length
                        0x01, // Type: Flags
                        0x06, // Data: LE General Discoverable Mode + BR/EDR Not Supported
                        
                        // Complete Local Name
                        BT_CONFIG.deviceName.length + 1, // Length
                        0x09, // Type: Complete Local Name
                        ...Buffer.from(BT_CONFIG.deviceName)
                    ]),
                    Buffer.from([
                        // Service UUID List
                        17, // Length (16 bytes UUID + 1 byte type)
                        0x07, // Type: Complete 128-bit Service UUIDs
                        ...Buffer.from(BT_CONFIG.serviceUuid.replace(/-/g, ''), 'hex')
                    ])
                );
                
                console.log("✨ Advertisement data set:", advertisementData);
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