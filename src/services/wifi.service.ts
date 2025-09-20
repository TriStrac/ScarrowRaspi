import { exec } from "child_process";

export class WifiService {
  static async connect(ssid: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const cmd = `nmcli device wifi connect "${ssid}" password "${password}"`;
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve();
        }
      });
    });
  }
}
