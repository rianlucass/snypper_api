/**
 * productService.js — Agrupamento Limpo usando Inteligência (LLM Integration)
 *
 * Já que usamos a OpenAI, todo trabalho duro e heurístico sobre
 * linguagem desestruturada foi abstraído da nossa base de código de agrupamento.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Converte o nome limpo extraído pela IA para um Label bonito 
 * "escova secadora" -> "Escova Secadora"
 */
function toLabel(name) {
    if (!name) return "Produto Desconhecido";
    return name
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

/**
 * Determina o nível de confiança puramente baseado no número de vezes
 * em que a IA cruzou e confirmou essa mesma entidade de produto no lote.
 */
function getConfidence(totalVideos) {
    if (totalVideos >= 3) return 'high';
    if (totalVideos >= 2) return 'medium';
    return 'low';
}

/**
 * Agrupa vídeos usando a Entidade Exata que a IA da OpenAI filtrou ("ai_product_name")
 */
function groupByProduct(videos, { minVideos = 1 } = {}) {
    const groups = {};
    let skippedByAI = 0; // Contabiliza quantos a IA determinou como nulo/lista/spam/sem produto.
    let skippedNoDescription = 0;

    // Carrega o dicionário de sinônimos (se existir) para traduzir o nome bruto da IA para a Categoria Master
    const dictPath = path.join(__dirname, "../data/product_synonyms.json");
    let synonyms = {};
    if (fs.existsSync(dictPath)) {
        synonyms = JSON.parse(fs.readFileSync(dictPath, "utf-8"));
    }

    for (const video of videos) {
        // Se ocorreu um erro no Puppeteer/scraping
        if (video.error) continue;

        if (!video.desc) {
            skippedNoDescription++;
            continue;
        }

        // Recupera o campo enriquecido pela OpenAI. Se nulo, a IA julgou inútil.
        const productName = video.ai_product_name;

        if (!productName) {
            skippedByAI++;
            continue;
        }

        // Aplica o Dicionário: Se houver um 'master_cluster' mapeado para esse productName, usa ele.
        // Se a IA recém extraiu e o dicionário ainda não rodou, usa o próprio productName.
        const clusterKey = synonyms[productName] || productName;

        if (!groups[clusterKey]) {
            groups[clusterKey] = {
                productName: clusterKey, // O nome da categoria principal consolidada na prateleira
                videos: []
            };
        }
        groups[clusterKey].videos.push(video);
    }

    // Agregar métricas de cada grupo
    const aggregated = Object.values(groups)
        .filter(g => g.videos.length >= minVideos)
        .map(g => {
            const valid = g.videos.filter(v => v.score !== null && v.score !== undefined);
            const scores = valid.map(v => v.score);
            
            const avgScore = scores.length
                ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
                : 0;
            const topScore  = scores.length ? Math.max(...scores) : 0;
            const totalViews = g.videos.reduce((s, v) => s + (v.views || 0), 0);

            // Filtra os criadores únicos desse produto
            const creators = [...new Set(g.videos.map(v =>
                v.creator
                    ? `@${v.creator}`
                    : `@${v.url?.split('/@')[1]?.split('/')[0] ?? 'desconhecido'}`
            ))];

            // Moda para saber o Label predominante do Snypper ("🔥 Produto em alta" etc)
            const labelCount = {};
            for (const v of valid) {
                if (v.label) labelCount[v.label] = (labelCount[v.label] || 0) + 1;
            }
            const topLabel = Object.entries(labelCount)
                .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

            const hasViral = g.videos.some(v => v.viral_bonus);

            return {
                productName:  g.productName,
                productLabel: toLabel(g.productName),
                confidence:   getConfidence(g.videos.length),
                totalVideos:  g.videos.length,
                creators,
                avgScore,
                topScore,
                topLabel,
                hasViral,
                totalViews,
                videos: g.videos
            };
        })
        // Ordenação Dinâmica Cérebro: 
        // Produtos com 'alta confiança' importam mais -> Seguido pelo volume de repetições -> Média do engajamento.
        .sort((a, b) => {
            const confSort = { 'high': 3, 'medium': 2, 'low': 1 };
            return (confSort[b.confidence] - confSort[a.confidence]) ||
                   (b.totalVideos - a.totalVideos) ||
                   (b.avgScore - a.avgScore) ||
                   (b.topScore - a.topScore);
        });

    return { groups: aggregated, skippedByAI, skippedNoDescription };
}

export default { groupByProduct };
