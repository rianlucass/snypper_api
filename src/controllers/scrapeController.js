import scraperService  from "../services/scraperService.js";
import productService  from "../services/productService.js";
import fs              from "fs";
import path            from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

async function scrape(req, res) {
  try {
    const terms    = Array.isArray(req.body.terms) ? req.body.terms : ["achadinhos"];
    const minViews = parseInt(req.body.minViews) || 100000;

    const videos = await scraperService.scrapeTikTok({ terms, minViews });

    return res.status(200).json({
      message: `Scrape finalizado: ${videos.length} vídeos encontrados`,
      terms,
      minViews,
      total: videos.length,
      data: videos
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao realizar scraping", error: error.message });
  }
}

async function getVideoData(req, res) {
  try {
    const { url } = req.body;
    const video = await scraperService.getVideoData(url);

    return res.status(200).json({
      message: "Scraping finalizado com sucesso",
      data: video
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao realizar scraping", error: error.message });
  }
}

async function processBatch(req, res) {
  try {
    const limit    = parseInt(req.body.limit)    || 5;
    const minViews = parseInt(req.body.minViews) || 100000;

    if (limit < 1) {
      return res.status(400).json({ message: "O limite deve ser pelo menos 1" });
    }

    const results = await scraperService.processVideoBatch({ limit, minViews });

    return res.status(200).json({
      message: `Batch finalizado: ${results.length} vídeos processados`,
      total: results.length,
      data: results
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao processar batch", error: error.message });
  }
}

async function rescore(req, res) {
  try {
    const ranked = await scraperService.rescoreResults();

    return res.status(200).json({
      message: `Rescore concluído: ${ranked.filter(r => r.score !== null).length} vídeos pontuados`,
      total: ranked.length,
      distribution: {
        "🔥 Produto em alta":  ranked.filter(r => r.label === "🔥 Produto em alta").length,
        "⬆️ Bom potencial":   ranked.filter(r => r.label === "⬆️ Bom potencial").length,
        "📊 Monitorar":       ranked.filter(r => r.label === "📊 Monitorar").length,
        "💤 Baixo potencial": ranked.filter(r => r.label === "💤 Baixo potencial").length,
        "❌ Erro":            ranked.filter(r => r.score === null).length
      },
      data: ranked
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao reponderar", error: error.message });
  }
}

async function group(req, res) {
  try {
    const minVideos = parseInt(req.body.minVideos) || 2;
    const resultsPath = path.join(__dirname, "../data/results.json");

    if (!fs.existsSync(resultsPath)) {
      return res.status(404).json({ message: "results.json não encontrado. Rode um /batch primeiro." });
    }

    const videos = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));
    const groups = productService.groupByProduct(videos, { minVideos });

    const withDesc = videos.filter(v => v.desc);
    if (withDesc.length === 0) {
      return res.status(200).json({
        message: "Nenhum vídeo com descrição encontrado. Rode um novo /batch para capturar o campo desc.",
        groups: []
      });
    }

    return res.status(200).json({
      message: `${groups.length} produto(s) identificado(s) (mínimo ${minVideos} vídeos cada)`,
      totalVideosAnalisados: withDesc.length,
      totalVideosSemDesc: videos.length - withDesc.length,
      distribution: {
        "🔥 Produto em alta":  groups.filter(g => g.topLabel === "🔥 Produto em alta").length,
        "⬆️ Bom potencial":   groups.filter(g => g.topLabel === "⬆️ Bom potencial").length,
        "📊 Monitorar":       groups.filter(g => g.topLabel === "📊 Monitorar").length,
        "💤 Baixo potencial": groups.filter(g => g.topLabel === "💤 Baixo potencial").length
      },
      groups
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao agrupar por produto", error: error.message });
  }
}

export default {
  scrape,
  getVideoData,
  processBatch,
  rescore,
  group
};