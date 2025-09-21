/**
 * Bluetooth Low Energy (BLE) service for device configuration
 * Handles device ID setting and WiFi credentials
 */
import bleno from "@abandonware/bleno";
import { WifiService } from "./wifi.service";
import { exec } from "child_process";
import { promisify } from "util";

// UUIDs for BLE service and characteristics
const DEVICE_ID_UUID = "12345678-1234-5678-1234-56789abcdef0";
const WIFI_CREDS_UUID = "12345678-1234-5678-1234-56789abcdef1";
const SERVICE_UUID = "12345678-1234-5678-1234-56789abcdef9";

// Bluetooth LE characteristic result codes
const RESULT_SUCCESS = 0;
const RESULT_INVALID_OFFSET = 1;
const RESULT_INVALID_ATTRIBUTE_LENGTH = 2;
const RESULT_UNLIKELY_ERROR = 3;

// Store data globally to persist between connections
let deviceId = "";
let wifiCreds: { ssid: string; password: string } | null = null;

type BlenoState = "unknown" | "resetting" | "unsupported" | "unauthorized" | "poweredOff" | "poweredOn";

// Base class for BLE characteristics with result codes
abstract class CustomCharacteristic extends bleno.Characteristic {
    protected readonly RESULT_SUCCESS = RESULT_SUCCESS;
    protected readonly RESULT_INVALID_OFFSET = RESULT_INVALID_OFFSET;
    protected readonly RESULT_INVALID_ATTRIBUTE_LENGTH = RESULT_INVALID_ATTRIBUTE_LENGTH;
    protected readonly RESULT_UNLIKELY_ERROR = RESULT_UNLIKELY_ERROR;

    constructor(options: { uuid: string; properties: string[] }) {
        super(options);
    }
}

// Characteristic for handling device ID
class DeviceIdCharacteristic extends CustomCharacteristic {
    constructor() {
        super({
            uuid: DEVICE_ID_UUID,
            properties: ["read", "write", "writeWithoutResponse"],
        });
    }

    onReadRequest(_offset: number, callback: (result: number, data?: Buffer) => void): void {
        const data = Buffer.from(deviceId || "");
        callback(this.RESULT_SUCCESS, data);
    }

    onWriteRequest(data: Buffer, _offset: number, _withoutResponse: boolean, callback: (result: number) => void): void {
        try {
            deviceId = data.toString("utf8");
            console.log("📲 Received Device ID:", deviceId);
            callback(this.RESULT_SUCCESS);
        } catch (error) {
            console.error("Error writing device ID:", error);
            callback(this.RESULT_UNLIKELY_ERROR);
        }
    }
}

// Characteristic for handling WiFi credentials
class WifiCredsCharacteristic extends CustomCharacteristic {
    constructor() {
        super({
            uuid: WIFI_CREDS_UUID,
            properties: ["write", "writeWithoutResponse"],
        });
    }

    async onWriteRequest(data: Buffer, _offset: number, _withoutResponse: boolean, callback: (result: number) => void): Promise<void> {
        try {
            const credsString = data.toString("utf8");
            const parsedCreds = JSON.parse(credsString);
            wifiCreds = { ssid: parsedCreds.ssid, password: parsedCreds.password };
            console.log("📶 Received WiFi Credentials for SSID:", wifiCreds.ssid);

            // Connect to WiFi using the static connect method
            await WifiService.connect(wifiCreds.ssid, wifiCreds.password);
            console.log("✅ WiFi Connected!");

            callback(this.RESULT_SUCCESS);
        } catch (error) {
            console.error("❌ WiFi connection failed:", error);
            callback(this.RESULT_UNLIKELY_ERROR);
        }
    }
}

// Main Bluetooth service class
export class BluetoothService {
    private static _instance: BluetoothService | null = null;
    private isAdvertising = false;

    private constructor() {
        this.setupBlenoEventHandlers();
    }

    public static getInstance(): BluetoothService {
        if (!BluetoothService._instance) {
            BluetoothService._instance = new BluetoothService();
        }
        return BluetoothService._instance;
    }

    private async setupBlenoEventHandlers(): Promise<void> {
        // Initialize Bluetooth first
        await this.initializeBluetooth();

        bleno.on("stateChange", async (state: BlenoState) => {
            console.log(`Bluetooth state changed to: ${state}`);
            
            if (state === "poweredOn" && !this.isAdvertising) {
                await this.startAdvertising();
            } else {
                this.isAdvertising = false;
                bleno.stopAdvertising();
            }
        });

        bleno.on("advertisingStart", async (error?: Error) => {
            if (error) {
                console.error("Failed to start advertising:", error);
                return;
            }

            console.log("✅ Advertising started successfully");
            this.isAdvertising = true;
            
            try {
                await this.setupServices();
            } catch (err) {
                console.error("Failed to setup services:", err);
            }
        });

        bleno.on("accept", (clientAddress: string) => {
            console.log(`🔗 Central connected: ${clientAddress}`);
        });

        bleno.on("disconnect", (clientAddress: string) => {
            console.log(`❌ Central disconnected: ${clientAddress}`);
            // Restart advertising after client disconnects
            this.startAdvertising().catch(console.error);
        });

        bleno.on("error", (error: Error) => {
            console.error("❌ Bluetooth error:", error);
            this.restartAdvertising().catch(console.error);
        });
    }

    private async initializeBluetooth(): Promise<void> {
        const execAsync = promisify(exec);
        try {
            console.log("🔄 Initializing Bluetooth...");
            
            // Stop any existing processes
            await execAsync('sudo systemctl stop bluetooth');
            
            // Reset Bluetooth adapter
            await execAsync('sudo hciconfig hci0 down');
            await execAsync('sudo hciconfig hci0 up');
            
            // Start bluetooth service
            await execAsync('sudo systemctl start bluetooth');
            
            // Make device discoverable and disable security
            await execAsync('sudo hciconfig hci0 piscan');
            await execAsync('sudo hciconfig hci0 sspmode 0');
            
            // Set advertising parameters for better discovery
            process.env.BLENO_DEVICE_NAME = "ScarrowRaspi";
            process.env.BLENO_ADVERTISING_INTERVAL = "20";

            // Disable security pairing (skip SMP)
            (bleno as any).setSecurityLevel?.("low");

            console.log("✅ Bluetooth initialized successfully");
        } catch (err) {
            console.error("⚠️ Some Bluetooth initialization commands failed:", err);
        }
    }

    private async startAdvertising(): Promise<void> {
        if (this.isAdvertising) {
            console.log("Already advertising, stopping first...");
            bleno.stopAdvertising();
        }

        console.log("📢 Starting advertising...");
        const advertisementData = Buffer.from("0201061107" + SERVICE_UUID.replace(/-/g, ""), "hex");
        bleno.startAdvertisingWithEIRData(advertisementData);
    }

    private async setupServices(): Promise<void> {
        const deviceIdCharacteristic = new DeviceIdCharacteristic();
        const wifiCredsCharacteristic = new WifiCredsCharacteristic();

        const primaryService = new bleno.PrimaryService({
            uuid: SERVICE_UUID,
            characteristics: [
                deviceIdCharacteristic,
                wifiCredsCharacteristic
            ]
        });

        await new Promise<void>((resolve, reject) => {
            bleno.setServices([primaryService], (error?: Error) => {
                if (error) {
                    console.error("Error setting services:", error);
                    reject(error);
                } else {
                    console.log("✅ Services set successfully");
                    resolve();
                }
            });
        });
    }

    private async restartAdvertising(): Promise<void> {
        console.log("🔄 Restarting advertising...");
        
        if (this.isAdvertising) {
            bleno.stopAdvertising();
            this.isAdvertising = false;
        }

        await this.startAdvertising();
    }

    public async stop(): Promise<void> {
        if (this.isAdvertising) {
            bleno.stopAdvertising();
            this.isAdvertising = false;
        }
    }

    public getDeviceId(): string {
        return deviceId;
    }

    public getWifiCreds(): { ssid: string; password: string } | null {
        return wifiCreds;
    }
}

// Type declaration for bleno module
declare module '@abandonware/bleno' {
    export interface Characteristic {
        on(event: string, callback: Function): void;
        notify(state: boolean): void;
        RESULT_SUCCESS: number;
        RESULT_INVALID_OFFSET: number;
        RESULT_INVALID_ATTRIBUTE_LENGTH: number;
        RESULT_UNLIKELY_ERROR: number;
        onReadRequest?: (offset: number, callback: (result: number, data?: Buffer) => void) => void;
        onWriteRequest?: (data: Buffer, offset: number, withoutResponse: boolean, callback: (result: number) => void) => void;
    }

    export class Characteristic {
        constructor(options: {
            uuid: string;
            properties: string[];
        });
    }

    export class PrimaryService {
        constructor(options: {
            uuid: string;
            characteristics: Characteristic[];
        });
    }

    export function startAdvertising(name: string, serviceUuids: string[]): void;
    export function startAdvertisingWithEIRData(advertisementData: Buffer): void;
    export function stopAdvertising(callback?: () => void): void;
    export function setServices(services: PrimaryService[], callback?: (error?: Error) => void): void;
    export function on(event: string, callback: Function): void;
}