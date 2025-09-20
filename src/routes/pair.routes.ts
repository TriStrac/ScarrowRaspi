import { Router } from "express";
import { PairController } from "../controllers";

const router = Router();
router.post("/", PairController.pair);

export default router;
