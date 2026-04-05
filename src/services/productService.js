/**
 * productService.js — Agrupamento por produto
 *
 * Lógica de espionagem de tendências:
 * 1. Extrai palavras-chave da descrição do vídeo
 * 2. Gera uma "chave de produto" com as 3 melhores palavras
 * 3. Agrupa todos os vídeos que compartilham a mesma chave
 * 4. Produtos com 2+ vídeos são sinais confiáveis de tendência
 */

// ---------------------------------------------------------------------------
// Stop words — tudo que NÃO identifica um produto
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
    // artigos, preposições, pronomes
    'de', 'da', 'do', 'das', 'dos', 'para', 'com', 'sem', 'em', 'no', 'na',
    'nos', 'nas', 'o', 'a', 'e', 'é', 'um', 'uma', 'uns', 'umas', 'ao',
    'à', 'pelo', 'pela', 'pelos', 'pelas', 'se', 'que', 'mais', 'por',
    'como', 'esse', 'essa', 'este', 'esta', 'eu', 'ele', 'ela', 'eles',
    'elas', 'meu', 'minha', 'nosso', 'nossa', 'isso', 'aqui', 'ali',
    'não', 'sim', 'já', 'só', 'foi', 'ser', 'ter', 'mas', 'pra', 'pro',

    // termos genéricos de produto/compra que não identificam o produto
    'novo', 'nova', 'novos', 'novas', 'muito', 'pouco', 'bom', 'boa',
    'top', 'super', 'mega', 'ultra', 'incrível', 'melhor', 'barato',
    'barata', 'caro', 'cara', 'vale', 'pena', 'ótimo', 'ótima',

    // ações/calls to action
    'comprei', 'compra', 'compras', 'comprinhas', 'testei', 'teste',
    'review', 'clica', 'clique', 'segue', 'salva', 'compartilha',
    'veja', 'olha', 'vem', 'gostei', 'amei', 'recomendo', 'indica',

    // termos de nicho que não identificam produto
    'achadinho', 'achadinhos', 'achado', 'achados', 'shopee', 'amazon',
    'mercado', 'livre', 'ali', 'aliexpress', 'shein', 'link', 'bio',
    'item', 'produto', 'produtos', 'tiktok', 'viral', 'tendência',
    'promoção', 'oferta', 'desconto', 'frete', 'grátis', 'entrega',

    // conectivos e outros
    'que', 'quando', 'onde', 'quem', 'por', 'qual', 'quais', 'esse',
    'dessa', 'desse', 'nesse', 'nessa', 'até', 'após', 'antes',
    'loja', 'store', 'shop', 'oficial', 'pagina', 'página'
]);

// ---------------------------------------------------------------------------
// Extração de keywords
// ---------------------------------------------------------------------------

/**
 * Recebe a descrição bruta de um vídeo e retorna um array de palavras-chave
 * que identificam o produto.
 *
 * @param {string|null} desc
 * @returns {string[]}
 */
function extractKeywords(desc) {
    if (!desc || typeof desc !== 'string') return [];

    return desc
        .toLowerCase()
        // remove emojis e caracteres especiais, mantém letras, números e espaços
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(word =>
            word.length >= 3 &&           // mínimo 3 chars para remover siglas curtas
            !STOP_WORDS.has(word) &&      // não é stop word
            !/^\d+$/.test(word)           // não é número puro (preços, etc.)
        )
        .slice(0, 6); // pega os primeiros 6 termos relevantes
}

/**
 * Gera uma chave de produto a partir das keywords.
 * Usa as 3 primeiras palavras ordenadas para normalizar a ordem.
 *
 * "escova secadora philips" e "philips secadora escova" → "escova_philips_secadora"
 *
 * @param {string[]} keywords
 * @returns {string}
 */
function generateProductKey(keywords) {
    if (keywords.length === 0) return null;
    return [...keywords]
        .slice(0, 3)
        .sort()
        .join('_');
}

// ---------------------------------------------------------------------------
// Agrupamento
// ---------------------------------------------------------------------------

/**
 * Recebe o array de vídeos do results.json e retorna grupos por produto.
 * Apenas grupos com 2+ vídeos são retornados — sinal mais confiável.
 *
 * @param {object[]} videos
 * @param {object} options
 * @param {number} options.minVideos - mínimo de vídeos para um grupo aparecer (padrão: 2)
 * @returns {object[]}
 */
function groupByProduct(videos, { minVideos = 2 } = {}) {
    const groups = {};

    for (const video of videos) {
        // vídeos sem desc ou com erro não contribuem para grupos
        if (!video.desc || video.error) continue;

        const keywords = extractKeywords(video.desc);
        const key      = generateProductKey(keywords);
        if (!key) continue;

        if (!groups[key]) {
            groups[key] = {
                productKey: key,
                keywords,
                videos: []
            };
        }
        groups[key].videos.push(video);
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

            // criadores únicos — extrai do URL se não tiver campo creator
            const creators = [...new Set(g.videos.map(v =>
                v.creator
                    ? `@${v.creator}`
                    : `@${v.url?.split('/@')[1]?.split('/')[0] ?? 'desconhecido'}`
            ))];

            // label dominante (moda)
            const labelCount = {};
            for (const v of valid) {
                if (v.label) labelCount[v.label] = (labelCount[v.label] || 0) + 1;
            }
            const topLabel = Object.entries(labelCount)
                .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

            // viralidade: algum vídeo tem viral_bonus?
            const hasViral = g.videos.some(v => v.viral_bonus);

            return {
                productKey:  g.productKey,
                keywords:    g.keywords,
                totalVideos: g.videos.length,
                creators,
                avgScore,
                topScore,
                topLabel,
                hasViral,
                totalViews,
                videos: g.videos
            };
        })
        // ordena por: número de vídeos (tendência) → avgScore → topScore
        .sort((a, b) =>
            b.totalVideos - a.totalVideos ||
            b.avgScore    - a.avgScore    ||
            b.topScore    - a.topScore
        );

    return aggregated;
}

export default { extractKeywords, generateProductKey, groupByProduct };
