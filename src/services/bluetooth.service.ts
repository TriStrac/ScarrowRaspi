import bleno from "@abandonware/bleno";
import { exec } from "child_process";
import { promisify } from "util";
import { WifiService } from "./wifi.service";
import { BT_CONFIG } from "../interface/bluetooth.types";
import { 
    BlenoCallback, 
    WriteCallback, 
    BlenoState, 
    OnWriteRequest,
    StateChangeCallback,
    AddressCallback,
    ErrorCallback
} from "../interface/bluetooth.types";

const execAsync = promisify(exec);

export class BluetoothService {
    private static isAdvertising = false;

    private static async setupBluetooth() {
        try {
            // Reset adapter and disable security
            await execAsync("sudo hciconfig hci0 down");
            await execAsync("sudo hciconfig hci0 up");
            await execAsync("sudo hciconfig hci0 leadv 3"); // Non-connectable advertising
            await execAsync("sudo hciconfig hci0 noscan"); // Disable scanning
            await execAsync("sudo btmgmt ssp off"); // Disable Secure Simple Pairing
            await execAsync("sudo btmgmt pairable off");
            await execAsync("sudo btmgmt connectable on");
        } catch (error) {
            console.log("Some Bluetooth setup commands failed, continuing anyway...");
        }
    }

    private static createDeviceIdCharacteristic() {
        return new bleno.Characteristic({
            uuid: BT_CONFIG.characteristics.deviceIdUuid,
            properties: ["writeWithoutResponse"],
            onWriteRequest(data: Buffer, _offset: number, _withoutResponse: boolean, callback: WriteCallback) {
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

    private static createWifiCredsCharacteristic() {
        return new bleno.Characteristic({
            uuid: BT_CONFIG.characteristics.wifiCredsUuid,
            properties: ["writeWithoutResponse"],
            onWriteRequest: function(data: Buffer, _offset: number, _withoutResponse: boolean, callback: WriteCallback) {
                try {
                    const creds = JSON.parse(data.toString("utf8"));
                    console.log("📶 WiFi credentials received:", creds);
                    
                    WifiService.connect(creds.ssid, creds.password)
                        .then(() => console.log("✅ WiFi Connected!"))
                        .catch(err => console.error("❌ WiFi connection failed:", err));
                    
                    callback(BT_CONFIG.RESULT_SUCCESS);
                } catch (error) {
                    console.error("❌ Error processing WiFi credentials:", error);
                    callback(BT_CONFIG.RESULT_UNLIKELY_ERROR);
                }
            }
        });
    }

    static async start() {
        // Disable verbose debug output
        process.env.BLENO_ADVERTISING_INTERVAL = "300";
        process.env.NOBLE_REPORT_ALL_HCI_EVENTS = "0";

        await this.setupBluetooth();

        bleno.on("stateChange", async (state: BlenoState) => {
            console.log("Bluetooth state:", state);
            
            if (state === "poweredOn" && !this.isAdvertising) {
                this.isAdvertising = true;
                bleno.startAdvertising(BT_CONFIG.deviceName, [BT_CONFIG.serviceUuid]);
            } else if (state !== "poweredOn") {
                this.isAdvertising = false;
                bleno.stopAdvertising();
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
        });

        bleno.on("disconnect", (address: string) => {
            console.log(`❌ Device disconnected: ${address}`);
        });

    // Disable security pairing (skip SMP) to avoid length errors
    (bleno as any).setSecurityLevel?.("low"); // optional if TS complains
  }
}
