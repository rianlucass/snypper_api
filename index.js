import express from "express";
import dotenv from "dotenv";
import scrapeRoutes from "./src/routes/scrapeRoutes.js";

dotenv.config();

const app = express();

app.use(express.json());
app.use(scrapeRoutes);

app.listen(process.env.PORT, () => {
    console.log(`Server started on port ${process.env.PORT}`);
});