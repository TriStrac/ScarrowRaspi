import bleno from "@abandonware/bleno";
import { WifiService } from "./wifi.service";

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
  static start() {
    // Set security level before any other operations
    try {
      // Disable security - this must be done before any other bleno operations
      process.env.BLENO_DEVICE_NAME = "SCARROW-CENTRAL-DEVICE";
      (bleno as any).Characteristic.RESULT_SUCCESS = 0;
      (bleno as any).Characteristic.RESULT_UNLIKELY_ERROR = 1;
      (bleno as any).setSecurityLevel?.("low");
    } catch (err) {
      console.log("Note: Security level setting not supported");
    }

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
              properties: ["write", "notify"],
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
              properties: ["write", "notify"],
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
