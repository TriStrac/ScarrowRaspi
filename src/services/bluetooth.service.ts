import bleno from "@abandonware/bleno";
import { WifiService } from "./wifi.service";
import { exec } from "child_process";
import { promisify } from "util";

const DEVICE_ID_UUID = "12345678-1234-5678-1234-56789abcdef0";
const WIFI_CREDS_UUID = "12345678-1234-5678-1234-56789abcdef1";
const SERVICE_UUID = "12345678-1234-5678-1234-56789abcdef9";

// Type definitions to help with TypeScript
type BlenoState = "unknown" | "resetting" | "unsupported" | "unauthorized" | "poweredOff" | "poweredOn";
type WriteCallback = (result: number) => void;
interface WriteRequest {
  offset: number;
  data: Buffer;
  withoutResponse: boolean;
}

let deviceId = "";
let wifiCreds: { ssid: string; password: string } | null = null;

export class BluetoothService {
  private static async initializeBluetooth(): Promise<void> {
    const execAsync = promisify(exec);
    try {
      // Reset Bluetooth adapter
      await execAsync('sudo hciconfig hci0 down');
      await execAsync('sudo hciconfig hci0 up');
      
      // Disable automatic pairing
      await execAsync('sudo btmgmt pairable off');
      await execAsync('sudo btmgmt bondable off');
      
      // Set security level to none/low
      process.env.BLENO_DEVICE_NAME = "SCARROW-CENTRAL-DEVICE";
      process.env.BLENO_ADVERTISING_INTERVAL = "100";
    } catch (err) {
      console.log("Note: Some Bluetooth initialization commands failed, continuing anyway...");
    }
  }

  static async start() {
    await this.initializeBluetooth();

    bleno.on("stateChange", (state: BlenoState) => {
      if (state === "poweredOn") {
        console.log("🚀 BLE powered on, starting advertising...");
        bleno.startAdvertising("SCARROW-CENTRAL-DEVICE", [SERVICE_UUID], (err: Error | null) => {
          if (err) {
            console.error("Failed to start advertising:", err);
            return;
          }
        });
      } else {
        console.log("⚠️ BLE not powered on:", state);
        bleno.stopAdvertising();
      }
    });

    bleno.on("advertisingStart", (err: Error | null) => {
      if (err) {
        console.error("❌ Advertising start error:", err);
        return;
      }
      console.log("✅ Advertising started.");

      // Set services
      bleno.setServices([
        new bleno.PrimaryService({
          uuid: SERVICE_UUID,
          characteristics: [
            new bleno.Characteristic({
              uuid: DEVICE_ID_UUID,
              properties: ["write", "writeWithoutResponse"],
              secure: [],
              onWriteRequest: (
                data: Buffer,
                offset: number,
                withoutResponse: boolean,
                callback: WriteCallback
              ) => {
                deviceId = data.toString("utf8");
                console.log("📲 Received Device ID:", deviceId);
                callback(bleno.Characteristic.RESULT_SUCCESS);
              },
            }),

            new bleno.Characteristic({
              uuid: WIFI_CREDS_UUID,
              properties: ["write", "writeWithoutResponse"],
              secure: [],
              onWriteRequest: async (
                data: Buffer,
                offset: number,
                withoutResponse: boolean,
                callback: WriteCallback
              ) => {
                try {
                  const creds = JSON.parse(data.toString("utf8"));
                  wifiCreds = { ssid: creds.ssid, password: creds.password };
                  console.log("📶 Received WiFi Credentials:", wifiCreds);

                  // Connect to WiFi
                  await WifiService.connect(wifiCreds.ssid, wifiCreds.password);
                  console.log("✅ WiFi Connected!");

                  callback(bleno.Characteristic.RESULT_SUCCESS);
                } catch (err) {
                  console.error("❌ WiFi connection failed:", err);
                  callback(bleno.Characteristic.RESULT_UNLIKELY_ERROR);
                }
              },
            }),
          ],
        }),
      ]);
    });

    // Log connections/disconnections
    bleno.on("accept", (clientAddress: string) => {
      console.log(`🔗 Central connected: ${clientAddress}`);
    });

    bleno.on("disconnect", (clientAddress: string) => {
      console.log(`❌ Central disconnected: ${clientAddress}`);
    });

    // Disable security pairing (skip SMP) to avoid length errors
    (bleno as any).setSecurityLevel?.("low"); // optional if TS complains
  }
}
