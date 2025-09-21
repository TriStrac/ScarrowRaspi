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
            
            // Kill any existing bluetooth processes (ignore errors if processes don't exist)
            console.log("Cleaning up existing bluetooth processes...");
            try {
                await execAsync("sudo pkill -f bt-agent || true");
                await execAsync("sudo pkill -f bluetoothd || true");
                await execAsync("sleep 2");
            } catch (error) {
                console.log("Note: No existing processes found to clean up");
            }
            
            // Start fresh bluetooth service
            console.log("Starting bluetooth service...");
            await execAsync("sudo systemctl start bluetooth");
            await execAsync("sleep 3");
            
            // Remove existing pairings
            console.log("Removing existing pairings...");
            await execAsync("sudo rm -rf /var/lib/bluetooth/*");
            await execAsync("sudo systemctl restart bluetooth");
            await execAsync("sleep 3");
            
            // Setup automatic pairing agent first
            console.log("Starting automatic pairing agent...");
            await execAsync("sudo bt-agent -c NoInputNoOutput -p /usr/bin/bt-agent-helper");
            await execAsync("sleep 1");
            
            // Now configure bluetoothctl
            console.log("Configuring bluetooth settings...");
            const commands = [
                "power on",
                "agent NoInputNoOutput",
                "default-agent",
                `rename ${BT_CONFIG.deviceName}`,
                "discoverable on",
                "pairable on",
                "agent on",
                "trust *"
            ];
            
            // Execute each command individually and show output
            for (const cmd of commands) {
                console.log(`Running: ${cmd}`);
                const { stdout } = await execAsync(`echo "${cmd}" | sudo bluetoothctl`);
                console.log("Output:", stdout);
                await execAsync("sleep 1");
            }
            
            // Final setup - make sure auto pairing is enabled with detailed script
            console.log("Setting up automatic pairing...");
            const agentScript = `#!/bin/bash
# Auto-confirm pairing helper script
# This script will automatically confirm any pairing request
while true; do
    if [ "$1" = "request" ]; then
        echo "Automatically confirming pairing request"
        echo "true"
        exit 0
    fi
    if [ "$1" = "authorize" ]; then
        echo "Automatically authorizing device"
        echo "true"
        exit 0
    fi
    if [ "$1" = "confirm" ]; then
        echo "Automatically confirming passkey"
        echo "true"
        exit 0
    fi
    # Default response for any other request
    echo "true"
    exit 0
done`;
            
            await execAsync(`sudo bash -c 'echo "${agentScript}" > /usr/bin/bt-agent-helper'`);
            await execAsync("sudo chmod +x /usr/bin/bt-agent-helper");
            
            console.log("✅ Bluetooth setup complete - Ready for pairing");
            console.log("📱 Device name:", BT_CONFIG.deviceName);
            console.log("🔵 Auto-accepting all pairing requests");
            
            // Show current bluetooth status and controller info
            const { stdout: status } = await execAsync("sudo bluetoothctl show");
            console.log("Current Bluetooth Status:", status);
            
            // Additional verification
            const { stdout: controller } = await execAsync("sudo bluetoothctl list");
            console.log("Available Controllers:", controller);
            
            // Verify agent is running
            const { stdout: agent } = await execAsync("ps aux | grep bt-agent");
            console.log("Agent Status:", agent);
            
        } catch (error) {
            console.error("❌ Error in Bluetooth setup:", error);
            console.error("Error details:", error);
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
            // First attempt
            console.log("First attempt at Bluetooth setup...");
            await this.setupBluetooth();
        } catch (error: any) {
            // Only retry on specific errors that might be resolved by a retry
            const shouldRetry = error?.cmd?.includes('bluetoothctl') || 
                              error?.message?.includes('bluetooth');
            
            if (shouldRetry) {
                console.error("First attempt failed with recoverable error:", error);
                console.log("Waiting 5 seconds before retry...");
                
                try {
                    // Clean up processes (ignore errors)
                    await execAsync("sudo pkill -f bt-agent || true");
                    await execAsync("sudo pkill -f bluetoothd || true");
                    await execAsync("sleep 5");
                    
                    // Second attempt
                    console.log("Second attempt at Bluetooth setup...");
                    await this.setupBluetooth();
                } catch (retryError) {
                    console.error("Both setup attempts failed. Final error:", retryError);
                    throw retryError;
                }
            } else {
                // For non-bluetooth related errors, just throw immediately
                throw error;
            }
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