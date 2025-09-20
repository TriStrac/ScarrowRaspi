import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class HotspotService {
  private static readonly SSID = "SCARROW-CENTRAL-DEVICE";
  private static readonly PASSWORD = "12345678"; // must be 8–63 chars
  private static readonly HOSTAPD_PATH = "/etc/hostapd";
  private static readonly HOSTAPD_CONF = "/etc/hostapd/hostapd.conf";
  private static readonly DHCPCD_CONF = "/etc/dhcpcd.conf";

  private static async ensureDependenciesInstalled(): Promise<void> {
    console.log("Installing required packages...");
    await execAsync("sudo apt-get update");
    await execAsync("sudo apt-get install -y hostapd dnsmasq");
    await execAsync("sudo systemctl unmask hostapd");
  }

  private static async setupHostapdDirectory(): Promise<void> {
    await execAsync(`sudo mkdir -p ${this.HOSTAPD_PATH}`);
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

    // Configure static IP for AP interface
    const staticIpConfig = `
interface wlan0
    static ip_address=192.168.4.1/24
    nohook wpa_supplicant`;

    await this.ensureDependenciesInstalled();
    await this.setupHostapdDirectory();

    await execAsync(`echo '${staticIpConfig}' | sudo tee -a ${this.DHCPCD_CONF}`);
    await execAsync(`echo '${hostapdConfig}' | sudo tee ${this.HOSTAPD_CONF}`);
    await execAsync(`sudo chmod 600 ${this.HOSTAPD_CONF}`);

    console.log("Hostapd configuration updated successfully");
  }

  static async configureDnsmasq(): Promise<void> {
    const dnsmasqConfig = `
interface=wlan0
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h
domain=wlan
address=/gw.wlan/192.168.4.1`;

    await execAsync(`echo '${dnsmasqConfig}' | sudo tee /etc/dnsmasq.conf`);
    console.log("Dnsmasq configuration updated successfully");
  }

  static async start(): Promise<void> {
    try {
      console.log("Starting hotspot mode...");

      // 🔴 Kill wpa_supplicant so wlan0 is free for AP mode
      console.log("Stopping wpa_supplicant...");
      await execAsync("sudo systemctl stop wpa_supplicant || true");

      // Make sure wlan0 is reset
      await execAsync("sudo ip link set wlan0 down || true");
      await execAsync("sudo ip link set wlan0 up || true");

      await this.configureHostapd();
      await this.configureDnsmasq();

      // Assign static IP to wlan0
      await execAsync("sudo ifconfig wlan0 192.168.4.1/24 up");

      // Start services
      await execAsync("sudo systemctl enable dnsmasq");
      await execAsync("sudo systemctl restart dnsmasq");
      await execAsync("sudo systemctl enable hostapd");
      await execAsync("sudo systemctl restart hostapd");

      console.log("✅ Hotspot started successfully");
      console.log(`SSID: ${this.SSID}`);
      console.log(`Password: ${this.PASSWORD}`);
      console.log("IP Address: 192.168.4.1");
    } catch (err: any) {
      console.error("❌ Failed to start hotspot:", err.message);
      throw err;
    }
  }

  static async stop(): Promise<void> {
    try {
      console.log("Stopping hotspot mode...");
      await execAsync("sudo systemctl stop hostapd || true");
      await execAsync("sudo systemctl stop dnsmasq || true");
      await execAsync("sudo systemctl disable hostapd || true");
      console.log("Hotspot stopped successfully");

      // Restart wpa_supplicant so normal Wi-Fi works again
      console.log("Restarting wpa_supplicant...");
      await execAsync("sudo systemctl start wpa_supplicant || true");
    } catch (err: any) {
      console.error("❌ Failed to stop hotspot:", err.message);
      throw err;
    }
  }
}
