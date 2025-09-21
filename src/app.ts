import express from "express";
import bodyParser from "body-parser";
import pairRoutes from "./routes/pair.routes";
import wifiRoutes from "./routes/wifi.routes";
import { ConfigService, BluetoothService } from "./services";

const app = express();
app.use(bodyParser.json());

app.use("/pair", pairRoutes);
app.use("/wifi", wifiRoutes);

app.get("/status", (req, res) => {
  const config = ConfigService.read();
  res.json({
    status: config ? "configured" : "unconfigured",
    config,
  });
});

// Check config on startup → start Bluetooth if missing
if (!ConfigService.exists()) {
  console.log("🔵 Starting Bluetooth service for initial setup...");
  BluetoothService.getInstance().start().catch(err => {
    console.error("❌ Failed to start Bluetooth service:", err);
  });
} else {
  console.log("✅ Config found. Skipping Bluetooth pairing mode.");
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 SCARROW provision server running on port ${PORT}`);
});
