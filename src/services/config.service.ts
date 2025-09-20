import fs from "fs";
import path from "path";
import { DeviceConfig } from "../interface";

const CONFIG_PATH = path.join("/etc", "scarrow", "config.json");

export class ConfigService {
    static exists(): boolean {
        return fs.existsSync(CONFIG_PATH);
    }

    static read(): DeviceConfig | null {
        if (!this.exists()) return null;
        const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
        return JSON.parse(raw);
    }

    static write(config: DeviceConfig): void {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    }
}