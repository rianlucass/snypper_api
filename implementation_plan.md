# Migração para Supabase: O Tracking Temporal 📊

## Objetivo
Deixar o método "chute estático" no passado. O Snypper passará a monitorar a Aceleração de uma tendência armazenando o histórico numérico dos vídeos no PostgreSQL. Com isso, poderemos cruzar os dados de hoje com os de ontem e detectar produtos que estão sofrendo o chamado "Scaling Vertical" (crescimento repentino de tráfego, sinalizando febre emergente).

## User Review Required

> [!CAUTION]
> Você será o encarregado de criar as tabelas no painel SQL do Supabase. Para manter o banco limpo e de baixo custo, precisamos Normalizar nossos dados (estruturar com chaves relacionais).
> Leia a proposta do Schema (Tabelas) abaixo e me confirme se a modelagem está aderente com sua visão de negócio!

## Proposed Changes (Arquitetura)

### O Banco de Dados (Schema Relacional)

Criaremos 3 tabelas no Supabase para separar os elementos:

1. **`products` (O Nicho Mãe)**
   - `id` (uuid genérico)
   - `name` (O nome limpo, ex: "Pote de vidro")
   - `created_at` (Quando descobrimos esse produto)

2. **`videos` (A Entidade do Arquivo)**
   - `url` (Primary Key / Chave Única)
   - `creator` (Ex: "achadinhosdagebr")
   - `posted_at` (Data de publicação original do Tiktok)
   - `product_id` (Ligação: Pertence ao "Pote de vidro")

3. **`video_metrics` (O Radar / Time-Series)**
   *Aqui reside a magia. A cada dia que você rodar o Bot, ele injeta uma linha nova aqui.*
   - `id` (chave primária serial)
   - `video_url` (Referência de qual vídeo é)
   - `scraped_at` (Data de hoje, ex: 10 de maio de 2026)
   - `views`, `likes`, `shares`, `saves` (Os números que lemos hoje!)
   - **Por que isso é poderoso?** O banco poderá subtrair as views da linha de "10 de Maio" pelas views da linha "08 de Maio". A diferença será a velocidade de vendas do afiliado! Vemos quem está escalando Ads na força bruta.

### Node.js Backend

#### [NEW] `src/services/dbService.js`
- Um novo cliente oficial para conectar com o Banco. Utilizaremos o SDK `@supabase/supabase-js`.
- Funções como `upsertVideo()`, `insertMetricsSnapshot()`, e futuramente `getScalingTrends()`.

#### [MODIFY] `.env`
- Precisaremos que você cole a `SUPABASE_URL` e a `SUPABASE_ANON_KEY` obtidas lá nas configurações de API do seu painel recém-criado.

#### [MODIFY] `package.json`
- Injeção da biblioteca via: `npm install @supabase/supabase-js`.

## Open Questions

> [!NOTE]
> Você já entende bem do Supabase e sabe executar queries SQL por lá, ou prefere que eu gere os scripts de "CREATE TABLE" exatos na próxima etapa para você só copiar e colar no painel "SQL Editor" deles?

## Verification Plan
1. Montamos as tabelas lá no Supabase.
2. Injetamos as Keys secretas no seu VSCode.
3. Rodaremos a nossa rota super-aprimorada no Postman.
4. Verificaremos no seu navegador, logado no Supabase, a tabela `video_metrics` preenchendo automaticamente com os prints daquele exato milissegundo de Coleta!
