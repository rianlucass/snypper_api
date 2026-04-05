# Snypper — Diário de Análise

> Documento vivo. Atualizar a cada batch de testes.

---

## Batch #1 — 2026-04-03

### Configuração
- **Vídeos analisados:** 23
- **Erros:** 0 (anteriormente havia falhas, corrigidas)
- **Fonte de links:** Busca manual por "achadinhos" + lista curada

### Distribuição dos scores

| Label | Qtd | % |
|---|---|---|
| 🔥 Produto em alta (80-100) | 2 | 9% |
| ⬆️ Bom potencial (60-79) | 0 | 0% |
| 📊 Monitorar (40-59) | 1 | 4% |
| 💤 Baixo potencial (0-39) | 20 | 87% |

### Top 5 do batch

| Pos | Criador | Views | Share Rate | Save Rate | Score |
|---|---|---|---|---|---|
| 1 | @achadinhosdagebr | 723K | 4.74% | 0.83% | 100 |
| 2 | @achadinhosshopeedaanny_ | 271K | 4.21% | 0.84% | 90 |
| 3 | @universo.oferta | 1.3M | 1.78% | 0.48% | 42 |
| 4 | @achadosdaana12 | 3.5M | 0.87% | 0.42% | 35 |
| 5 | @fivanastoreoficial | 3.2M | 0.23% | 0.45% | 26 |

---

## Problemas Identificados no Score

### ❌ P1 — Viral bonus trivial (resolvido em breve)
**Situação:** 21 de 23 vídeos receberam `viral_bonus: true`.  
**Causa:** `comment_rate` é muito baixo (0.003% a 0.24%), então `share_rate > comment_rate * 2` é satisfeito por qualquer share positivo.  
**Fix planejado:** Trocar a condição para `share_rate > 1.0` (mais de 1% das views foi compartilhado).

### ❌ P2 — Min-max sensível a outliers (resolvido em breve)
**Situação:** Os dois primeiros vídeos têm share_rates 3x maiores que o terceiro, comprimindo o restante.  
**Efeito:** 87% dos vídeos caem em "Baixo potencial".  
**Fix planejado:** Substituir min-max por ranking percentil.

### ❓ Q1 — Impacto absoluto vs. impacto relativo (em aberto)
**Questão:** Qual vídeo é mais valioso para identificar um produto viral?

| Caso | Views | Shares | Share Rate |
|---|---|---|---|
| A (@achadinhosdagebr) | 723K | 34K | **4.74%** |
| B (@mariachadinhos2026) | 11.7M | 51K | 0.44% |

O caso A tem taxa maior. O caso B tem **50% mais shares em números absolutos** e chegou a muito mais pessoas.  
**Hipótese:** Para produtos *já em alta*, o absoluto importa mais. Para produtos *emergentes*, a taxa importa mais.  
**Ideia de solução:** Criar dois sub-scores e combiná-los — `score_taxa` (eficiência) + `score_volume` (alcance).

---

## Problemas Identificados na Coleta

### ❌ P3 — Input genérico demais
**Situação:** Os links vêm de uma busca simples por "achadinhos". Qualquer vídeo do nicho entra, não necessariamente os mais promissores.  
**Fix planejado:** Filtrar os links coletados pelo número de views antes de entrar no batch. Exemplo: apenas vídeos com mais de 100K views ou 500K views.

### ❌ P4 — Apenas uma hashtag/busca
**Situação:** Só buscamos "achadinhos". O nicho tem outros termos igualmente populares.  
**Fix planejado:** Diversificar as buscas para: `achados shopee`, `produto viral`, `comprinhas`, `produto barato`. Cada termo traz uma fatia diferente do nicho.

### ❓ Q2 — Trending vs. Relevante (em aberto)
**Questão:** Os vídeos que estão *crescendo agora* não aparecem no topo de "Relevante" — eles estão em "Em Alta" no TikTok.  
**Ideia:** Scraping da página de "Em Alta" por categoria de compras/produtos seria muito mais poderoso para identificar tendências.

---

## Próximos Passos

- [ ] Melhorar o `scrapeTikTok()` para filtrar links por views mínimas
- [ ] Adicionar suporte a múltiplas hashtags/buscas no scrape
- [ ] Corrigir o viral bonus (P1)
- [ ] Substituir min-max por percentil (P2)
- [ ] Discutir e decidir sobre Q1 (absoluto vs. relativo)
- [ ] Investigar scraping da página "Em Alta" (Q2)
