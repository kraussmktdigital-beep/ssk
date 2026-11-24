
import express from "express";
import helmet from "helmet";
import session from "express-session";
import SQLiteStoreFactory from "connect-sqlite3";
import rateLimit from "express-rate-limit";
import multer from "multer";
import OpenAI from "openai";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);

// Render gratuito: armazenamento temporário em /tmp
const DATA_DIR = process.env.DATA_DIR ||
  (process.env.NODE_ENV === "production"
    ? "/tmp/painel-dados"
    : path.join(__dirname, "data"));

fs.mkdirSync(DATA_DIR, { recursive: true });
const SQLiteStore = SQLiteStoreFactory(session);

for (const key of ["OPENAI_API_KEY", "ADMIN_PASSWORD", "SESSION_SECRET"]) {
  if (!process.env[key]) {
    console.error(`Variável obrigatória ausente: ${key}. Configure o ambiente.`);
    process.exit(1);
  }
}

if (process.env.SESSION_SECRET.length < 32) {
  console.error("SESSION_SECRET precisa ter pelo menos 32 caracteres.");
  process.exit(1);
}

if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: "1mb" }));

app.use(session({
  name: "painel.sid",
  store: new SQLiteStore({
    db: "sessions.sqlite",
    dir: DATA_DIR
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60 * 1000
  }
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false
});

const analyzeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 15,
    fileSize: 20 * 1024 * 1024,
    fieldSize: 1 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "text/plain",
      "text/markdown",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel"
    ]);

    cb(
      allowed.has(file.mimetype)
        ? null
        : new Error("Tipo de arquivo não permitido. Use PDF, DOC/DOCX, TXT ou XLS/XLSX."),
      allowed.has(file.mimetype)
    );
  }
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = process.env.OPENAI_MODEL || "gpt-6.2-astra";

function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  return res.status(401).json({
    error: "Sessão encerrada. Entre novamente."
  });
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function cleanName(name) {
  return path.basename(name)
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .slice(0, 120);
}

function parseJsonOutput(text) {
  const cleaned = String(text || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }

    throw new Error("A IA não retornou um JSON válido.");
  }
}

app.post("/api/login", loginLimiter, (req, res) => {
  const password = req.body?.password || "";

  if (!safeEqual(password, process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({
      error: "Senha incorreta."
    });
  }

  req.session.regenerate(err => {
    if (err) {
      return res.status(500).json({
        error: "Não foi possível iniciar a sessão."
      });
    }

    req.session.authenticated = true;
    res.json({ ok: true });
  });
});

app.post("/api/logout", requireAuth, (req, res) => {
  req.session.destroy(() =>
    res.clearCookie("painel.sid").json({ ok: true })
  );
});

app.get("/api/session", (req, res) =>
  res.json({ authenticated: !!req.session?.authenticated })
);

app.get("/health", (_req, res) =>
  res.status(200).json({ ok: true })
);

const singlePrompt = `Você é um assistente de apoio à análise jurídica documental no Brasil. Analise SOMENTE o documento anexado. Não invente fatos, datas, nomes, artigos de lei, páginas ou conclusões. Diferencie rigorosamente: (a) observação direta do profissional/órgão; (b) relato de terceiro reproduzido; (c) documento contemporâneo; (d) conclusão/opinião técnica; (e) alegação unilateral. Não trate boletim de ocorrência como prova automática da veracidade do relato. Não trate diagnóstico ou atendimento de saúde, isoladamente, como prova de incapacidade ou risco. Registre página/folha apenas se identificável; se não, escreva "não identificada". Sinalize ilegibilidade e lacunas.
Responda SOMENTE JSON válido com este formato:
{
 "identificacao":{"nome_arquivo":"","tipo_documento":"","data_documento":"","autor_ou_origem":"","pessoas_mencionadas":[]},
 "resumo_objetivo":"",
 "classificacao":"registro técnico | prova documental | relato/declaração | comunicação/registro administrativo | outro",
 "natureza_informacao":"observação direta | relato de terceiro | alegação unilateral | conclusão técnica | conteúdo misto | não identificável",
 "fatos_relevantes":[{"fato":"","localizacao_no_documento":"","origem_da_informacao":"", "grau_de_suporte":"direto | indireto | alegado | não identificável"}],
 "o_que_pode_demonstrar":[],
 "o_que_nao_demonstra_por_si_so":[],
 "pontos_favoraveis":[],
 "pontos_desfavoraveis_ou_riscos":[],
 "contradicoes_ou_lacunas":[],
 "diligencias_recomendadas":[],
 "confiabilidade_e_limites":"",
 "alertas_de_conferencia_humana":[]
}`;

app.post(
  "/api/analyze",
  requireAuth,
  analyzeLimiter,
  upload.array("documents", 15),
  async (req, res) => {
    const docs = req.files || [];

    if (!docs.length) {
      return res.status(400).json({
        error: "Selecione ao menos um documento."
      });
    }

    const total = docs.reduce((n, f) => n + f.size, 0);

    if (total > 50 * 1024 * 1024) {
      return res.status(413).json({
        error: "O conjunto de arquivos ultrapassa 50 MB."
      });
    }

    const uploadedIds = [];

    try {
      const analyses = [];

      for (const doc of docs) {
        const uploaded = await openai.files.create({
          file: new File(
            [doc.buffer],
            cleanName(doc.originalname),
            { type: doc.mimetype }
          ),
          purpose: "user_data"
        });

        uploadedIds.push(uploaded.id);

        const response = await openai.responses.create({
          model: MODEL,
          store: false,
          input: [{
            role: "user",
            content: [
              {
                type: "input_text",
                text: `${singlePrompt}\nNome do arquivo recebido: ${cleanName(doc.originalname)}.`
              },
              {
                type: "input_file",
                file_id: uploaded.id
              }
            ]
          }]
        });

        analyses.push(parseJsonOutput(response.output_text));
      }

      const synthesisPrompt = `Você é um assistente de apoio jurídico documental no Brasil. Receberá análises individuais de documentos. Faça cruzamento cuidadoso, sem criar fatos nem presumir que alegações sejam verdadeiras. Preserve o nome do arquivo e a localização no documento quando disponíveis. Distinga contradição real de diferença de perspectiva, data ou fonte. Não conclua culpa, abuso, incapacidade parental ou risco sem base documental suficiente. Indique pontos que exigem advogado e conferência nos autos. Não invente jurisprudência nem artigos legais. Responda SOMENTE JSON válido neste formato:
{
 "visao_geral":"",
 "cronologia":[{"data":"","evento":"","documentos_relacionados":[],"observacao_sobre_a_fonte":""}],
 "quadro_probatorio":[{"documento":"","data":"","origem":"","classificacao":"","natureza_da_informacao":"","conteudo_relevante":"","o_que_pode_demonstrar":"","o_que_nao_demonstra":"","favoravel_ou_desfavoravel":"favorável | desfavorável | misto | neutro","limites_e_riscos":"","localizacao":"","diligencias":[]}],
 "convergencias_entre_documentos":[],
 "divergencias_e_contradicoes":[{"tema":"","documentos_em_conflito":[],"descricao":"","possivel_explicacao_sem_presuncao":"","como_esclarecer":[]}],
 "lacunas_do_conjunto":[],
 "pontos_favoraveis_a_defesa":[],
 "pontos_de_atencao_e_riscos":[],
 "diligencias_prioritarias":[],
 "perguntas_para_o_cliente":[{"pergunta":"","motivo":"","documento_ou_testemunha_que_pode_confirmar":""}],
 "teses_ou_linhas_argumentativas_a_examinar":[],
 "estrutura_sugerida_da_defesa":[],
 "minuta_base":"Texto-base com campos entre colchetes para conferência e complementação. Não inventar dados nem afirmar como provado o que é apenas alegado.",
 "ressalvas":""
}
As análises individuais estão abaixo:\n${JSON.stringify(analyses)}`;

      const finalResponse = await openai.responses.create({
        model: MODEL,
        store: false,
        input: synthesisPrompt
      });

      const synthesis = parseJsonOutput(finalResponse.output_text);

      res.json({
        ok: true,
        model: MODEL,
        files: docs.map(d => cleanName(d.originalname)),
        individual: analyses,
        synthesis
      });

    } catch (err) {
      console.error("Falha na análise:", err?.message || err);

      res.status(502).json({
        error: "Não foi possível concluir a análise. Verifique a chave, o modelo configurado e os arquivos; tente novamente."
      });

    } finally {
      await Promise.all(
        uploadedIds.map(id =>
          openai.files.delete(id).catch(() => null)
        )
      );
    }
  }
);

app.use(
  express.static(
    path.join(__dirname, "public"),
    { index: "index.html", etag: true, maxAge: "1h" }
  )
);

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: err.code === "LIMIT_FILE_SIZE"
        ? "Cada arquivo pode ter no máximo 20 MB."
        : "Limite de upload excedido."
    });
  }

  if (err) {
    return res.status(400).json({
      error: err.message || "Erro na solicitação."
    });
  }

  res.status(500).json({
    error: "Erro interno."
  });
});

app.listen(PORT, "0.0.0.0", () =>
  console.log(`Painel disponível na porta ${PORT}`)
);
