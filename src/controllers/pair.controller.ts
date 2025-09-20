import type { Request, Response } from "express";
import { ConfigService } from "../services";

export class PairController {
  static pair(req: Request, res: Response) {
    const { device_id, farmer } = req.body;

    if (!device_id) {
      return res.status(400).json({ error: "device_id is required" });
    }

    const config = { deviceId: device_id, farmer };
    ConfigService.write(config);

    return res.json({
      message: "Device paired successfully",
      config,
    });
  }
}
