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
            
            // Start bluetooth service
            await execAsync("sudo systemctl start bluetooth");
            await execAsync("sleep 2"); // Give bluetooth service time to start
            
            // First, remove any existing pairings
            await execAsync("sudo rm -rf /var/lib/bluetooth/*");
            await execAsync("sudo systemctl restart bluetooth");
            await execAsync("sleep 2");
            
            // Create a script with all the bluetoothctl commands
            const script = [
                "power on",
                "agent NoInputNoOutput", // This is key - no confirmation needed
                "default-agent",
                `rename ${BT_CONFIG.deviceName}`,
                "discoverable on",
                "pairable on",
                "trust *", // Auto-trust any device that tries to pair
                "yes" // Auto-confirm any pairing request
            ].join("\\n");
            
            // Execute all commands at once in bluetoothctl
            await execAsync(`echo -e "${script}" | sudo bluetoothctl`);
            
            // Start the automatic pairing agent in the background
            await execAsync("sudo bt-agent --capability=NoInputNoOutput --auto-confirm=true &");
            
            console.log("✅ Bluetooth setup complete - Ready for pairing");
            console.log("📱 Device name:", BT_CONFIG.deviceName);
            console.log("🔵 Auto-accepting all pairing requests");
        } catch (error) {
            console.error("❌ Error in Bluetooth setup:", error);
            throw error;
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
        console.log("🚀 Starting Bluetooth service...");
        
        try {
            await this.setupBluetooth();
        } catch (error) {
            console.error("Failed to setup Bluetooth. Retrying in 5 seconds...");
            // Wait 5 seconds and try again
            await execAsync("sleep 5");
            await this.setupBluetooth();
        }

        bleno.on("stateChange", async (state: BlenoState) => {
            console.log("🔄 Bluetooth state:", state);
            
            if (state === "poweredOn" && !this.isAdvertising) {
                console.log("🔵 Starting service advertisement...");
                this.isAdvertising = true;
                bleno.startAdvertising(BT_CONFIG.deviceName, [BT_CONFIG.serviceUuid]);
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