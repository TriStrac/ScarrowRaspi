import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class HotspotService {
  private static readonly SSID = "SCARROW-CENTRAL-DEVICE";
  private static readonly PASSWORD = "123456";
  private static readonly HOSTAPD_PATH = "/etc/hostapd";
  private static readonly HOSTAPD_CONF = "/etc/hostapd/hostapd.conf";
  private static readonly DHCPCD_CONF = "/etc/dhcpcd.conf";

  private static async ensureHostapdInstalled(): Promise<void> {
    try {
      await execAsync("which hostapd");
    } catch {
      console.log("Installing hostapd...");
      await execAsync("sudo apt-get update && sudo apt-get install -y hostapd dnsmasq");
      await execAsync("sudo systemctl unmask hostapd");
    }
  }

  private static async setupHostapdDirectory(): Promise<void> {
    try {
      await execAsync(`sudo mkdir -p ${this.HOSTAPD_PATH}`);
    } catch (err: any) {
      console.error("Failed to create hostapd directory:", err.message);
      throw err;
    }
  }

  static async configureHostapd(): Promise<void> {
    const hostapdConfig = `interface=wlan0
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
rsn_pairwise=CCMP`;

    try {
      await this.ensureHostapdInstalled();
      await this.setupHostapdDirectory();

      // Configure static IP for AP interface
      const staticIpConfig = `
interface wlan0
    static ip_address=192.168.4.1/24
    nohook wpa_supplicant`;

      // Update dhcpcd configuration
      await execAsync(`echo '${staticIpConfig}' | sudo tee -a ${this.DHCPCD_CONF}`);

      // Write the hostapd configuration
      await execAsync(`echo '${hostapdConfig}' | sudo tee ${this.HOSTAPD_CONF}`);
      await execAsync(`sudo chmod 600 ${this.HOSTAPD_CONF}`);

      console.log("Hostapd configuration updated successfully");
    } catch (err: any) {
      console.error("Failed to update hostapd configuration:", err.message);
      throw err;
    }
  }

  static async configureDnsmasq(): Promise<void> {
    const dnsmasqConfig = `
interface=wlan0
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h
domain=wlan
address=/gw.wlan/192.168.4.1`;

    try {
      await execAsync("echo '${dnsmasqConfig}' | sudo tee /etc/dnsmasq.conf");
      console.log("Dnsmasq configuration updated successfully");
    } catch (err: any) {
      console.error("Failed to update dnsmasq configuration:", err.message);
      throw err;
    }
  }

  static async start(): Promise<void> {
    try {
      console.log("Starting hotspot mode...");
      await this.configureHostapd();
      await this.configureDnsmasq();
      
      // Restart networking services
      await execAsync("sudo systemctl restart dhcpcd");
      await execAsync("sudo systemctl restart dnsmasq");
      
      // Enable and start hostapd
      await execAsync("sudo systemctl enable hostapd");
      await execAsync("sudo systemctl start hostapd");
      
      console.log("Hotspot started successfully");
      console.log(`SSID: ${this.SSID}`);
      console.log(`Password: ${this.PASSWORD}`);
      console.log("IP Address: 192.168.4.1");
    } catch (err: any) {
      console.error("Failed to start hotspot:", err.message);
      throw err;
    }
  }

  static async stop(): Promise<void> {
    try {
      console.log("Stopping hotspot mode...");
      await execAsync("sudo systemctl stop hostapd");
      await execAsync("sudo systemctl stop dnsmasq");
      await execAsync("sudo systemctl disable hostapd");
      console.log("Hotspot stopped successfully");
    } catch (err: any) {
      console.error("Failed to stop hotspot:", err.message);
      throw err;
    }
  }
}