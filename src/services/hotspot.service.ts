import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class HotspotService {
  private static readonly SSID = "SCARROW-CENTRAL-DEVICE";
  private static readonly PASSWORD = "123456";

  static async configureHostapd(): Promise<void> {
    const hostapdConfig = `
        interface=wlan0
        driver=nl80211
        ssid=${this.SSID}
        hw_mode=g
        channel=7
        wmm_enabled=0
        macaddr_acl=0
        auth_algs=1
        ignore_broadcast_ssid=0
        wpa=2
        wpa_passphrase=${this.PASSWORD}
        wpa_key_mgmt=WPA-PSK
        wpa_pairwise=TKIP
        rsn_pairwise=CCMP
        `;

    try {
      // Write the hostapd configuration
      await execAsync(`echo '${hostapdConfig}' | sudo tee /etc/hostapd/hostapd.conf`);
      console.log("Hostapd configuration updated successfully");
    } catch (err: any) {
      console.error("Failed to update hostapd configuration:", err.message);
      throw err;
    }
  }

  static async start(): Promise<void> {
    try {
      console.log("Starting hotspot mode...");
      await this.configureHostapd();
      await execAsync("sudo systemctl start hostapd");
      console.log("Hotspot started successfully");
    } catch (err: any) {
      console.error("Failed to start hotspot:", err.message);
      throw err;
    }
  }

  static async stop(): Promise<void> {
    try {
      console.log("Stopping hotspot mode...");
      await execAsync("sudo systemctl stop hostapd");
      console.log("Hotspot stopped successfully");
    } catch (err: any) {
      console.error("Failed to stop hotspot:", err.message);
      throw err;
    }
  }
}