import express from "express";
import scrapeController from "../controllers/scrapeController.js";

const router = express.Router();

router.post("/scrape", scrapeController.scrape);
router.post("/getVideoData", scrapeController.getVideoData);
router.post("/batch", scrapeController.processBatch);
router.post("/rescore", scrapeController.rescore);
router.post("/group",   scrapeController.group);

export default router;