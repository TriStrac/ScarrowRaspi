import { Router } from "express";
import { WifiController } from "../controllers";

const router = Router();
router.post("/", WifiController.setWifi);

export default router;
