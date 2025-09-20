import type { Request, Response } from "express";
import { ConfigService, WifiService } from "../services";

export class WifiController {
  static async setWifi(req: Request, res: Response) {
    const { ssid, password } = req.body;
    if (!ssid || !password) {
      return res.status(400).json({ error: "ssid and password are required" });
    }

    try {
      const config = ConfigService.read();
      if (!config) {
        return res.status(400).json({ error: "Device not paired yet" });
      }

      config.wifi = { ssid, password };
      ConfigService.write(config);

      await WifiService.connect(ssid, password);

      return res.json({
        message: "Wi-Fi configured. Device is connecting...",
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
}
