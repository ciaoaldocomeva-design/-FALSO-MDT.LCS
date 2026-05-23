import { createReadStream, existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative, resolve } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || process.argv[2] || 4173);
const host = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const publicOrigin = process.env.PUBLIC_ORIGIN || `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`;
const openRouterConfigPath = resolve(root, "..", "openrouter.local.json");
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function getOpenRouterConfig() {
  const fileConfig = await readJsonFile(openRouterConfigPath);
  const fileModels = Array.isArray(fileConfig.models) ? fileConfig.models : [];
  const routes = fileModels.map((item) => ({
    model: item.model,
    apiKey: item.apiKey
  }));

  if (!routes.length) {
    routes.push({
      model: process.env.OPENROUTER_MODEL || fileConfig.model || DEFAULT_OPENROUTER_MODEL,
      apiKey: process.env.OPENROUTER_API_KEY || fileConfig.apiKey || ""
    });
  }

  return {
    routes: routes
      .map((route) => ({
        model: route.model || DEFAULT_OPENROUTER_MODEL,
        apiKey: route.apiKey || ""
      }))
      .filter((route) => route.apiKey),
    model: routes[0]?.model || DEFAULT_OPENROUTER_MODEL
  };
}

async function readRequestJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      throw new Error("Richiesta troppo grande.");
    }
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function normalizeChatMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => ["system", "user", "assistant"].includes(message?.role) && typeof message?.content === "string")
    .slice(-22)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 6000)
    }));
}

function cleanAssistantContent(content) {
  const text = Array.isArray(content)
    ? content.map((block) => block?.text || block?.content || "").join("\n")
    : content;

  if (typeof text !== "string") return "";
  const trimmed = text.trim();
  const wrapped =
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("“") && trimmed.endsWith("”"));
  return wrapped ? trimmed.slice(1, -1).trim() : trimmed;
}

async function handleChat(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Metodo non consentito." });
    return;
  }

  const { routes } = await getOpenRouterConfig();
  if (!routes.length) {
    sendJson(response, 503, {
      error: "OPENROUTER_API_KEY non configurata.",
      fallback: true
    });
    return;
  }

  const payload = await readRequestJson(request);
  const messages = normalizeChatMessages(payload.messages);
  if (!messages.length) {
    sendJson(response, 400, { error: "Conversazione mancante." });
    return;
  }

  let lastError = "Nessun provider disponibile.";
  for (const route of routes) {
    const upstream = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${route.apiKey}`,
        "content-type": "application/json",
        "http-referer": publicOrigin,
        "x-openrouter-title": "Macchina del Tempo Testuale"
      },
      body: JSON.stringify({
        model: route.model,
        messages,
        temperature: 0.86,
        top_p: 0.93,
        presence_penalty: 0.35,
        frequency_penalty: 0.18,
        reasoning: {
          effort: "none",
          exclude: true
        },
        include_reasoning: false,
        max_tokens: 900,
        stream: false
      })
    });

    const result = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      lastError = result?.error?.message || result?.message || `HTTP ${upstream.status}`;
      continue;
    }

    const content = cleanAssistantContent(result?.choices?.[0]?.message?.content);
    if (!content) {
      lastError = "Il modello non ha restituito testo.";
      continue;
    }

    sendJson(response, 200, {
      content,
      model: result.model || route.model,
      usage: result.usage || null
    });
    return;
  }

  sendJson(response, 502, { error: lastError });
}

async function handleStatus(response) {
  const { routes, model } = await getOpenRouterConfig();
  sendJson(response, 200, {
    configured: Boolean(routes.length),
    model: routes.length ? model : "modalita-locale"
  });
}

function resolveRequest(url) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const requestPath = pathname === "/" ? "index.html" : pathname.slice(1);
  if (requestPath.split(/[\\/]/).some((part) => part.startsWith("."))) return null;
  const candidate = resolve(root, normalize(requestPath));
  const fromRoot = relative(root, candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) return null;
  return candidate;
}

createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
    if (pathname === "/api/chat") {
      await handleChat(request, response);
      return;
    }

    if (pathname === "/api/status") {
      await handleStatus(response);
      return;
    }
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Errore interno." });
    return;
  }

  const file = resolveRequest(request.url || "/");
  if (!file || !existsSync(file)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const info = await stat(file);
  const target = info.isDirectory() ? join(file, "index.html") : file;
  response.writeHead(200, {
    "content-type": types[extname(target)] || "application/octet-stream",
    "cache-control": "no-store"
  });
  createReadStream(target).pipe(response);
}).listen(port, host);
