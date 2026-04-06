import OpenAI from "openai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

/**
 * Função de enriquecimento usando OpenAI Structured Outputs
 * Recebe um array de vídeos e extrai a "Entidade Fiel do Produto".
 * Caso a descrição seja inútil (afiliado longo, copypasta, genérico), ele retorna null para esse ID.
 */
async function extractProducts(videos) {
    if (!videos || videos.length === 0) return videos;

    // Filtra IDs e descrições para enviar um bundle econômico (apenas vídeos que têm algo escrito)
    const inputs = videos
        .filter(v => v.desc && v.desc.trim().length > 0)
        .map(v => ({ id: v.url, desc: v.desc }));

    if (inputs.length === 0) {
        return videos; // Nada a fazer
    }

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // rápido e barato (frações de centavo)
            messages: [
                {
                    role: "system",
                    content: `Você é um Analista de Dados especializado em Mineração de Produtos Virais do TikTok e Shopee/Amazon. 
Sua função é ler um array de descrições e para cada uma extrair a IDENTIDADE FÍSICA do produto sendo vendido/testado.

REGRAS RÍGIDAS DE DESCARTE (Retorne null):
1. **Listas / Compilações:** Se o vídeo citar vários objetos (ex: "Top 5 achados", "Parte 2", "Vários produtos da china").
2. **Spam Genérico / Copy de Afiliado:** Se for muito longo, tiver excesso de códigos de produto (ex: ABC-123), infinitas hashtags, ou parecer um "guia de como viver bem" no lugar de um review.
3. **Falta de Clareza:** Se o texto só disser "olha isso" ou "amei", sem dar o nome concreto do item.

FORMATAÇÃO DA EXTRAÇÃO:
- Se for válido, extraia o NOME GENÉRICO DO PRODUTO em Português Minúsculo sem as marcas e sem características fúteis (ex: de "Escova Secadora Philips Bivolt" extraia "escova secadora". De "Luminária de led amarela noturna super brilhante" extraia "luminária de led").
- Preserve funções chave como "luminária de led", "bolsa antiroubo", "fatiador de legumes".`
                },
                {
                    role: "user",
                    content: JSON.stringify(inputs)
                }
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "ProductExtraction",
                    schema: {
                        type: "object",
                        properties: {
                            extractions: {
                                type: "array",
                                description: "Lista das extrações conectadas aos IDs. DEVE conter um item na resposta para cada item no input enviado. Mesmo sendo descartado (produto=null).",
                                items: {
                                    type: "object",
                                    properties: {
                                        id: { type: "string" },
                                        product: {
                                            type: ["string", "null"],
                                            description: "O nome limpo do único produto. Ou null caso recaia em regras de lixo/lista."
                                        }
                                    },
                                    required: ["id", "product"],
                                    additionalProperties: false
                                }
                            }
                        },
                        required: ["extractions"],
                        additionalProperties: false
                    },
                    strict: true
                }
            }
        });

        // Parse local usando Structured Outputs da OpenAI
        const resultString = response.choices[0].message.content;
        const resultData = JSON.parse(resultString).extractions;

        // Criar um Dicionário Fácil
        const mapping = {};
        resultData.forEach(item => {
            mapping[item.id] = item.product;
        });

        // Modifica os objetos originais injetando o aI_product_name
        return videos.map(video => {
            return {
                ...video,
                ai_product_name: mapping[video.url] || null
            };
        });

    } catch (error) {
        console.error("[LLM Error] Falha ao extrair produtos via OpenAI:", error.message);
        // Em caso de erro grave (ex: Falta de saldo 429), apenas devolve os videos originais. 
        // Eles continuarão com `ai_product_name` como undefined, logo poderão ser enriquecidos depois `/enrich`.
        return videos;
    }
}

/**
 * Função de Clustering Inteligente (Dicionário Master de Sinônimos)
 * Compara novos nomes de produtos descobertos com a base já catalogada.
 */
async function clusterProducts(uniqueNames) {
    if (!uniqueNames || uniqueNames.length === 0) return;

    const dictPath = path.join(__dirname, "../data/product_synonyms.json");
    let synonyms = {};
    if (fs.existsSync(dictPath)) {
        synonyms = JSON.parse(fs.readFileSync(dictPath, "utf-8"));
    }

    // Isolar apenas nomes que ainda não possuímos no dicionário
    const unmappedNames = uniqueNames.filter(name => name && !synonyms[name]);

    if (unmappedNames.length === 0) {
        return; // Todos já estão mapeados
    }

    // Pega as "Categorias Master" existentes pra IA ter contexto de onde jogar os itens
    const existingClusters = [...new Set(Object.values(synonyms))];

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `Você é um Analista de Ecommerce.
Sua felina tarefa é classificar novos produtos extraídos da internet listados em "Novos Nomes" e criar um MAPA DE SINÔNIMOS.
Objetivo: Fundir produtos iguais (com nomes diferentes) em um mesmo "master_cluster".

REGRAS RÍGIDAS:
1. Veja as "Categorias Base Existentes" para tentar enxergar se o "Novo Nome" cabe lá. Ex: Se a Categoria Base tem "smartwatch" e o novo nome é "relógio inteligente esporte", a resposta deve ser "smartwatch".
2. Se o Novo Nome FOR UM PRODUTO TOTALMENTE NOVO e não se encaixar bem em nemhuma das bases existentes, VOCÊ DEVE CRIAR um novo master_cluster limpo e minúsculo pra ele.
3. Se um mesmo Master Cluster englobar vários novos itens, utilize ESTRITAMENTE a mesma string para mapeá-los.`
                },
                {
                    role: "user",
                    content: JSON.stringify({
                        categorias_base_existentes: existingClusters,
                        novos_nomes_para_mapear: unmappedNames
                    })
                }
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "ClusterMapping",
                    schema: {
                        type: "object",
                        properties: {
                            mappings: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        original: { type: "string" },
                                        master_cluster: { type: "string" }
                                    },
                                    required: ["original", "master_cluster"],
                                    additionalProperties: false
                                }
                            }
                        },
                        required: ["mappings"],
                        additionalProperties: false
                    },
                    strict: true
                }
            }
        });

        const resultString = response.choices[0].message.content;
        const resultData = JSON.parse(resultString).mappings;

        // Atualiza o dicionário local
        resultData.forEach(item => {
            synonyms[item.original] = item.master_cluster.toLowerCase();
        });

        fs.writeFileSync(dictPath, JSON.stringify(synonyms, null, 2), "utf-8");
        console.log(`[LLM] Dicionário atualizado! ${resultData.length} novos termos mapeados em Master Clusters.`);

    } catch (error) {
        console.error("[LLM Error] Falha ao clusterizar produtos via OpenAI:", error.message);
    }
}

export default {
    extractProducts,
    clusterProducts
};
