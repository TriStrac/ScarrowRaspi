import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class HotspotService {
  private static readonly SSID = "SCARROW-CENTRAL-DEVICE";
  private static readonly PASSWORD = "12345678"; // WPA2 needs at least 8 chars
  private static readonly HOSTAPD_CONF = "/etc/hostapd/hostapd.conf";
  private static readonly DHCPCD_CONF = "/etc/dhcpcd.conf";
  private static readonly DNSMASQ_CONF = "/etc/dnsmasq.conf";

  private static async ensureDependenciesInstalled(): Promise<void> {
    console.log("Installing required packages...");
    await execAsync("sudo apt-get update -y");
    await execAsync("sudo apt-get install -y hostapd dnsmasq");
    await execAsync("sudo systemctl unmask hostapd");
  }

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
rsn_pairwise=CCMP
`;

    const staticIpConfig = `
interface wlan0
    static ip_address=192.168.4.1/24
    nohook wpa_supplicant
`;

    console.log("Configuring hostapd and dhcpcd...");

    // Backup before overwriting
    await execAsync(`sudo cp ${this.DHCPCD_CONF} ${this.DHCPCD_CONF}.bak || true`);
    await execAsync(`sudo cp ${this.HOSTAPD_CONF} ${this.HOSTAPD_CONF}.bak || true`);

    // Write dhcpcd.conf
    await execAsync(`echo "${staticIpConfig}" | sudo tee -a ${this.DHCPCD_CONF}`);

    // Write hostapd.conf
    await execAsync(`echo "${hostapdConfig}" | sudo tee ${this.HOSTAPD_CONF}`);
    await execAsync(`sudo chmod 600 ${this.HOSTAPD_CONF}`);

    console.log("Hostapd configuration updated successfully");
  }

  static async configureDnsmasq(): Promise<void> {
    const dnsmasqConfig = `
interface=wlan0
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h
domain=wlan
address=/gw.wlan/192.168.4.1
`;

    console.log("Configuring dnsmasq...");

    // Backup before overwriting
    await execAsync(`sudo cp ${this.DNSMASQ_CONF} ${this.DNSMASQ_CONF}.bak || true`);

    // Write dnsmasq.conf
    await execAsync(`echo "${dnsmasqConfig}" | sudo tee ${this.DNSMASQ_CONF}`);

    console.log("Dnsmasq configuration updated successfully");
  }

  static async start(): Promise<void> {
    try {
      await this.ensureDependenciesInstalled();
      await this.configureHostapd();
      await this.configureDnsmasq();

      console.log("Starting hotspot services...");

      await execAsync("sudo systemctl restart dhcpcd");
      await execAsync("sudo ifconfig wlan0 192.168.4.1/24 up");

      await execAsync("sudo systemctl enable dnsmasq");
      await execAsync("sudo systemctl restart dnsmasq");

      await execAsync("sudo systemctl enable hostapd");
      await execAsync("sudo systemctl restart hostapd");

      console.log("✅ Hotspot started successfully");
      console.log(`SSID: ${this.SSID}`);
      console.log(`Password: ${this.PASSWORD}`);
      console.log("Gateway IP: 192.168.4.1");
    } catch (err: any) {
      console.error("❌ Failed to start hotspot:", err.message);
      throw err;
    }
  }

  static async stop(): Promise<void> {
    try {
      console.log("Stopping hotspot mode...");
      await execAsync("sudo systemctl stop hostapd");
      await execAsync("sudo systemctl stop dnsmasq");
      await execAsync("sudo systemctl disable hostapd");
      await execAsync("sudo systemctl disable dnsmasq");
      console.log("✅ Hotspot stopped successfully");
    } catch (err: any) {
      console.error("❌ Failed to stop hotspot:", err.message);
      throw err;
    }
  }
}
