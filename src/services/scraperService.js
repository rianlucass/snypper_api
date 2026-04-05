import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import scoreService from "./scoreService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNumber(value) {
    if (!value) return 0;
    const normalized = value.toUpperCase().replace(/\s/g, "");

    if (normalized.includes("K")) return Math.round(parseFloat(normalized.replace(/[^\d.]/g, "")) * 1000);
    if (normalized.includes("M")) return Math.round(parseFloat(normalized.replace(/[^\d.]/g, "")) * 1000000);
    if (normalized.includes("B")) return Math.round(parseFloat(normalized.replace(/[^\d.]/g, "")) * 1000000000);
    return parseInt(normalized.replace(/\D/g, "")) || 0;
}

// Tenta executar fn até `attempts` vezes antes de lançar o erro
async function retry(fn, attempts = 3, delayMs = 4000) {
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (e) {
            if (i === attempts - 1) throw e;
            console.log(`[Retry] Tentativa ${i + 1} falhou: ${e.message}. Aguardando ${delayMs / 1000}s...`);
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
}

// ---------------------------------------------------------------------------
// Scrape de links (busca TikTok)
// ---------------------------------------------------------------------------

async function scrapeTikTok({ terms = ["achadinhos"], minViews = 100000 } = {}) {
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(45000);

    const allVideos = [];

    for (const term of terms) {
        console.log(`[Scrape] Buscando: "${term}"`);

        await page.goto(`https://www.tiktok.com/search?q=${encodeURIComponent(term)}`, {
            waitUntil: "networkidle2"
        });

        await new Promise(resolve => setTimeout(resolve, 4000));

        // detecta login wall ou captcha antes de prosseguir
        const bloqueado = await page.evaluate(() => {
            const hasLoginModal = !!document.querySelector('[data-e2e="login-modal"]');
            const hasNoResults  = document.body?.innerText?.includes('No results') ||
                                  document.body?.innerText?.includes('Nenhum resultado');
            return hasLoginModal || hasNoResults;
        });

        if (bloqueado) {
            console.warn(`[Scrape] ⚠️ "${term}" — login wall ou sem resultados detectado, pulando`);
            allVideos.push(); // não adiciona nada
            continue;
        }

        // scroll para carregar mais resultados
        for (let i = 0; i < 6; i++) {
            await page.mouse.wheel(0, 1200);
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        // extrai cards — se retornar 0, aguarda e tenta mais uma vez
        let videos = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('[data-e2e="search_top-item"]'));
            return cards
                .map(card => ({ link: card.querySelector('a[href*="/video/"]')?.href }))
                .filter(v => v.link);
        });

        if (videos.length === 0) {
            console.warn(`[Scrape] ⚠️ 0 cards em "${term}" — aguardando 5s e tentando novamente...`);
            await new Promise(resolve => setTimeout(resolve, 5000));

            videos = await page.evaluate(() => {
                const cards = Array.from(document.querySelectorAll('[data-e2e="search_top-item"]'));
                return cards
                    .map(card => ({ link: card.querySelector('a[href*="/video/"]')?.href }))
                    .filter(v => v.link);
            });
        }

        console.log(`[Scrape] "${term}" → ${videos.length} vídeos encontrados`);
        allVideos.push(...videos);

        // pausa aleatória entre termos para não disparar rate limit
        if (term !== terms[terms.length - 1]) {
            const pause = Math.floor(Math.random() * 3000) + 4000; // 4-7s
            console.log(`[Scrape] Pausa de ${(pause / 1000).toFixed(1)}s antes do próximo termo...`);
            await new Promise(resolve => setTimeout(resolve, pause));
        }
    }

    await browser.close();

    const unique = Array.from(new Map(allVideos.map(v => [v.link, v])).values());
    const filePath = path.join(__dirname, "../data/videos.json");
    fs.writeFileSync(filePath, JSON.stringify(unique, null, 2));

    console.log(`[Scrape] Total salvo: ${unique.length} vídeos únicos`);
    return unique;
}

// ---------------------------------------------------------------------------
// Extração de dados de um vídeo (usada pelo batch e pelo endpoint individual)
// ---------------------------------------------------------------------------

async function getVideoDataFromPage(page, url) {
    page.setDefaultNavigationTimeout(45000);

    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });

    // bloqueia recursos pesados: acelera carga e reduz fingerprint
    await page.setRequestInterception(true);
    page.removeAllListeners('request'); // evita listeners duplicados ao reusar a mesma page
    page.on('request', (req) => {
        if (['image', 'media', 'font'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });

    await page.goto(url, { waitUntil: "networkidle2" });

    // aguarda até que os dados do vídeo estejam de fato populados no JSON (não apenas o elemento presente)
    await page.waitForFunction(() => {
        const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
        if (!el) return false;
        try {
            const json = JSON.parse(el.textContent);
            return !!json?.__DEFAULT_SCOPE__;
        } catch { return false; }
    }, { timeout: 30000 });

    const data = await page.evaluate(() => {
        const scriptEl = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
        if (scriptEl) {
            try {
                const json = JSON.parse(scriptEl.textContent);
                const scope = json?.__DEFAULT_SCOPE__;

                if (!scope?.['webapp.video-detail']) {
                    const keys = Object.keys(scope || {});
                    return { source: 'captcha', scopeKeys: keys };
                }

                const itemStruct = scope['webapp.video-detail']?.itemInfo?.itemStruct;
                const stats = itemStruct?.stats;
                if (stats) {
                    return {
                        source:  'json',
                        likes:    stats.diggCount    ?? null,
                        comments: stats.commentCount ?? null,
                        saves:    stats.collectCount ?? null,
                        shares:   stats.shareCount   ?? null,
                        views:    stats.playCount    ?? null,
                        desc:     itemStruct?.desc   ?? null,
                        creator:  itemStruct?.author?.uniqueId ?? null
                    };
                }
            } catch (e) { /* fallback abaixo */ }
        }

        // fallback DOM
        const getText = (selector) => {
            const el = document.querySelector(selector);
            return el ? el.innerText.trim() : null;
        };
        return {
            source:   'dom',
            likes:    getText('[data-e2e="like-count"]'),
            comments: getText('[data-e2e="comment-count"]'),
            saves:    getText('[data-e2e="collect-count"]'),
            shares:   getText('[data-e2e="share-count"]'),
            views:    getText('[data-e2e="video-views"]'),
            desc:     getText('[data-e2e="browse-video-desc"]'),
            creator:  document.querySelector('[data-e2e="browse-video-desc"] a[href*="/@"]')
                        ?.href?.split('/@')[1]?.split('?')[0] ?? null
        };
    });

    if (data.source === 'captcha') {
        throw new Error(`Captcha detectado (chaves: ${data.scopeKeys?.join(', ')})`);
    }

    const toNumber = (v) => typeof v === 'number' ? v : parseNumber(v);

    const result = {
        url,
        creator:  data.creator  || null,
        desc:     data.desc     || null,
        views:    toNumber(data.views),
        likes:    toNumber(data.likes),
        comments: toNumber(data.comments),
        saves:    toNumber(data.saves),
        shares:   toNumber(data.shares),
        source:   data.source,
        scrapedAt: new Date().toISOString()
    };

    if (result.source === 'dom' &&
        result.views === 0 && result.likes === 0 &&
        result.comments === 0 && result.saves === 0 && result.shares === 0) {
        throw new Error("Dados não encontrados (possível captcha ou vídeo indisponível)");
    }

    return result;
}

// ---------------------------------------------------------------------------
// Endpoint de vídeo individual (mantido para testes rápidos)
// ---------------------------------------------------------------------------

async function getVideoData(url) {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    try {
        return await retry(() => getVideoDataFromPage(page, url));
    } finally {
        await browser.close();
    }
}

// ---------------------------------------------------------------------------
// Batch principal
// ---------------------------------------------------------------------------

async function processVideoBatch({ limit = 5, minViews = 100000 } = {}) {
    const videosPath  = path.join(__dirname, "../data/videos.json");
    const resultsPath = path.join(__dirname, "../data/results.json");

    const allVideos = JSON.parse(fs.readFileSync(videosPath, "utf-8"));
    const videos    = allVideos.slice(0, limit);

    console.log(`[Batch] Processando ${videos.length} de ${allVideos.length} vídeos (filtro: ${minViews / 1000}K+ views)...`);

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });

    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const results = [];
    let skipped = 0;

    for (let i = 0; i < videos.length; i++) {
        const { link } = videos[i];
        console.log(`[Batch] (${i + 1}/${videos.length}) ${link}`);

        try {
            // retry automático: até 3 tentativas por vídeo
            const data = await retry(() => getVideoDataFromPage(page, link));

            if (data.views < minViews) {
                console.log(`[Batch] ⏭ ${data.views.toLocaleString()} views < ${minViews.toLocaleString()} mínimo, pulando`);
                skipped++;
                continue;
            }

            results.push(data);
            console.log(`[Batch] ✓ views=${data.views.toLocaleString()} likes=${data.likes} shares=${data.shares}`);
        } catch (err) {
            console.error(`[Batch] ✗ Erro em ${link}:`, err.message);
            results.push({ url: link, error: err.message, scrapedAt: new Date().toISOString() });
        }

        if (i < videos.length - 1) {
            const delay = Math.floor(Math.random() * 4000) + 5000;
            console.log(`[Batch] Aguardando ${(delay / 1000).toFixed(1)}s antes do próximo...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    await browser.close();

    const ranked = scoreService.calculateScore(results);
    fs.writeFileSync(resultsPath, JSON.stringify(ranked, null, 2));
    console.log(`[Batch] Concluído. Válidos: ${results.length} | Pulados (<${minViews / 1000}K views): ${skipped} | Erros: ${ranked.filter(r => r.error).length}`);

    return ranked;
}

// ---------------------------------------------------------------------------
// Rescore (re-pontua o results.json sem bater no TikTok)
// ---------------------------------------------------------------------------

async function rescoreResults() {
    const resultsPath = path.join(__dirname, "../data/results.json");
    const raw = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));
    const clean = raw.map(({ score, label, engagement, viral_bonus, score_detail, ...rest }) => rest);
    const ranked = scoreService.calculateScore(clean);
    fs.writeFileSync(resultsPath, JSON.stringify(ranked, null, 2));
    console.log(`[Rescore] ${ranked.filter(r => r.score !== null).length} vídeos repontuados`);
    return ranked;
}

export default {
    scrapeTikTok,
    getVideoData,
    processVideoBatch,
    rescoreResults
};