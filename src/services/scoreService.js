/**
 * calculateScore — Score híbrido: Taxa (50%) + Volume absoluto (50%)
 *
 * Taxa: quão eficiente é o engajamento relativo às views
 * Volume: qual o impacto real em números absolutos (log-scaled)
 *
 * Isso evita penalizar vídeos grandes por ter muitas views e evita
 * que um único outlier de taxa comprima o restante do batch.
 */
function calculateScore(videos) {
    // --- Separar válidos dos inválidos ---
    const valid = videos.filter(v =>
        !v.error &&
        (v.views > 0 || v.likes > 0 || v.shares > 0 || v.saves > 0)
    );
    const invalid = videos.filter(v =>
        v.error ||
        (v.views === 0 && v.likes === 0 && v.shares === 0 && v.saves === 0)
    ).map(v => ({
        ...v,
        engagement: { save_rate: null, share_rate: null, comment_rate: null, like_rate: null },
        viral_bonus: false,
        score: null,
        label: v.error ? `❌ Erro: ${v.error}` : "❌ Sem dados"
    }));

    if (valid.length === 0) return invalid;

    // --- Calcular componentes para cada vídeo ---
    const withComponents = valid.map(video => {
        const views = video.views || 1;

        // Taxas (%)
        const save_rate    = video.saves    / views * 100;
        const share_rate   = video.shares   / views * 100;
        const comment_rate = video.comments / views * 100;
        const like_rate    = video.likes    / views * 100;

        // Componente 1 — Taxa ponderada
        const rate_raw = (
            save_rate    * 0.40 +
            share_rate   * 0.30 +
            comment_rate * 0.20 +
            like_rate    * 0.10
        );

        // Componente 2 — Volume absoluto (log scale)
        // log10 suaviza a diferença entre 23K e 100K, mas mantém a diferença entre 100 e 23K
        const volume_raw = (
            Math.log10(video.shares   + 1) * 0.40 +
            Math.log10(video.saves    + 1) * 0.40 +
            Math.log10(video.comments + 1) * 0.20
        );

        // Viral bonus: compartilhamento acima de 2% das views (genuinamente excepcional)
        const hasViralBonus = share_rate > 2.0;

        return {
            ...video,
            _rates: { save_rate, share_rate, comment_rate, like_rate },
            _rate_raw: hasViralBonus ? rate_raw * 1.10 : rate_raw,
            _volume_raw: volume_raw,
            _viral_bonus: hasViralBonus
        };
    });

    // --- Normalizar cada componente 0-100 via percentil ---
    // Percentil é mais robusto a outliers do que min-max
    const rateScores   = normalizePercentile(withComponents.map(v => v._rate_raw));
    const volumeScores = normalizeMinMax(withComponents.map(v => v._volume_raw));

    const withScore = withComponents.map((video, i) => {
        // Score final: 50% taxa + 50% volume
        const score = Math.round(rateScores[i] * 0.50 + volumeScores[i] * 0.50);
        const label = getLabel(score);

        const { _rates, _rate_raw, _volume_raw, _viral_bonus, ...rest } = video;

        return {
            ...rest,
            engagement: {
                save_rate:    toPercent(_rates.save_rate),
                share_rate:   toPercent(_rates.share_rate),
                comment_rate: toPercent(_rates.comment_rate),
                like_rate:    toPercent(_rates.like_rate)
            },
            viral_bonus: _viral_bonus,
            score_detail: {
                rate:   Math.round(rateScores[i]),
                volume: Math.round(volumeScores[i])
            },
            score,
            label
        };
    });

    return [
        ...withScore.sort((a, b) => b.score - a.score),
        ...invalid
    ];
}

// Normalização por percentil — cada item recebe o percentual de itens abaixo dele
function normalizePercentile(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return values.map(v => {
        const rank = sorted.filter(x => x < v).length;
        return (rank / (values.length - 1 || 1)) * 100;
    });
}

// Min-max padrão — bom para volume onde os valores já são suavizados por log
function normalizeMinMax(values) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values.map(v => ((v - min) / range) * 100);
}

function getLabel(score) {
    if (score >= 75) return "🔥 Produto em alta";
    if (score >= 55) return "⬆️ Bom potencial";
    if (score >= 35) return "📊 Monitorar";
    return "💤 Baixo potencial";
}

function toPercent(rate) {
    return parseFloat(rate.toFixed(3));
}

export default { calculateScore };
