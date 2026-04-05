# Plano de Score — Snypper

## Objetivo

Identificar quais vídeos de "achadinhos" representam **produtos com alto potencial de venda**, não apenas vídeos virais. Um vídeo de dança pode ter 10M de views e não vender nada — precisamos de um score que capture **intenção de compra**, não só popularidade.

---

## Os 4 sinais e o que cada um representa

| Métrica | O que significa no contexto de produto |
|---|---|
| **Views** | Alcance. É o denominador de tudo — normaliza os outros valores |
| **Saves** | 🥇 **Intenção de compra direta**. Pessoa salvou para comprar/lembrar depois |
| **Shares** | 🥈 **Boca a boca viral**. "Olha esse produto que achei!" |
| **Comments** | 🥉 **Curiosidade ativa**. "Onde compra?", "Quanto custa?", "Funciona mesmo?" |
| **Likes** | Aprovação passiva. O mais fácil de dar, o menos significativo |

---

## Taxas derivadas (os números que realmente importam)

```
save_rate    = saves    / views   → intenção de compra
share_rate   = shares   / views   → viralidade / boca a boca
comment_rate = comments / views   → curiosidade / desejo
like_rate    = likes    / views   → aprovação geral
```

### Aplicando nos seus 5 vídeos:

| Criador | save_rate | share_rate | comment_rate | like_rate |
|---|---|---|---|---|
| @achadinhosdagebr | 0.83% | **4.74%** | 0.18% | 1.53% |
| @achadosdaana12 | 0.42% | 0.87% | 0.24% | 2.57% |
| @fivanastoreoficial | 0.45% | 0.23% | 0.03% | 3.22% |
| @dicasdahellen_ | **1.37%** | 0.99% | 0.04% | 5.29% |
| @carla.lima064 | 0.21% | 0.33% | 0.04% | 1.69% |

> Repare: @achadinhosdagebr tem o maior **share_rate** do lote (4.74%!) mesmo tendo a menor view count. @dicasdahellen_ tem o maior **save_rate** (1.37%). São dois perfis diferentes de produto "quente".

---

## Fórmula do Score (0 a 100)

### Passo 1 — Score bruto ponderado

```
raw_score = (
  save_rate    * 0.40 +   // 40% do peso
  share_rate   * 0.30 +   // 30% do peso
  comment_rate * 0.20 +   // 20% do peso
  like_rate    * 0.10     // 10% do peso
)
```

**Por que esses pesos?**
- Saves pesam mais porque são a ação mais deliberada — exige intenção
- Shares vêm logo atrás — quem compartilha já está recomendando
- Comments indicam curiosidade real sobre o produto
- Likes são o gesto mais passivo, pesam menos

### Passo 2 — Bonus de viralidade

Se `share_rate > 2x comment_rate`, o produto está sendo espalhado organicamente → **+10% no score**

```
if (share_rate > comment_rate * 2) raw_score *= 1.10
```

### Passo 3 — Normalização para 0-100

Normalizar dentro do batch (min-max scaling):

```
score = (raw_score - min_do_batch) / (max_do_batch - min_do_batch) * 100
```

> Isso garante que sempre haja um vídeo com score 100 e um com 0 no batch — facilitando a comparação relativa entre os vídeos coletados.

---

## Classificação final

| Score | Label |
|---|---|
| 80 - 100 | 🔥 Produto em alta |
| 60 - 79  | ⬆️ Bom potencial |
| 40 - 59  | 📊 Monitorar |
| 0 - 39   | 💤 Baixo potencial |

---

## Simulação com os dados reais

| Criador | Raw Score | Bonus | Score Final | Label |
|---|---|---|---|---|
| @achadinhosdagebr | 0.0190 | +10% (share viral) | **100** | 🔥 Produto em alta |
| @dicasdahellen_ | 0.0131 | — | **71** | ⬆️ Bom potencial |
| @achadosdaana12 | 0.0066 | — | **35** | 💤 Baixo potencial |
| @fivanastoreoficial | 0.0053 | — | **27** | 💤 Baixo potencial |
| @carla.lima064 | 0.0041 | — | **18** | 💤 Baixo potencial |

> Resultado interessante: @achadinhosdagebr com "apenas" 723K views vence o batch. O produto dele está sendo ativamente espalhado pelas pessoas — sinal forte de produto quente.

---

## Onde implementar no código

1. **Criar `src/services/scoreService.js`** — função pura `calculateScore(videos[])` que recebe o array do batch e retorna os vídeos com `score` e `label` adicionados
2. **Chamar dentro do `processVideoBatch()`** — após coletar todos os vídeos, passa pelo score antes de salvar
3. **O `results.json` final** terá os campos `score` e `label` junto com os dados brutos

---

## Open questions antes de implementar

> [!IMPORTANT]
> Decida antes de codar:

1. **Normalização**: Relativa por batch (como proposto) ou absoluta com benchmarks fixos? Relativa é mais justo comparando vídeos entre si; absoluta permite comparar entre diferentes datas de execução.
2. **Pesos**: Você concorda com 40/30/20/10? Podemos ajustar após testar com mais dados.
3. **Bonus de viralidade**: Manter ou simplificar a fórmula por enquanto?
