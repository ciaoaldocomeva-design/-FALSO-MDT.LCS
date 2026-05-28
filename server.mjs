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
const OPENROUTER_TITLE = "Macchina del Tempo Testuale";

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

function cleanConfigValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function stripSurroundingQuotes(value) {
  return value.replace(/^["']|["']$/g, "").trim();
}

function cleanApiKey(value) {
  let apiKey = stripSurroundingQuotes(cleanConfigValue(value));
  apiKey = apiKey.replace(/^OPENROUTER_API_KEY\s*=\s*/i, "");
  apiKey = apiKey.replace(/^Authorization\s*:\s*/i, "");
  apiKey = apiKey.replace(/^Bearer\s+/i, "");
  return stripSurroundingQuotes(apiKey);
}

function hasUsableApiKey(value) {
  const apiKey = cleanApiKey(value);
  const examples = new Set(["la-tua-chiave-openrouter", "sk-or-v1-la-tua-chiave-reale"]);
  return Boolean(apiKey && !apiKey.includes("...") && !examples.has(apiKey));
}

async function getOpenRouterConfig() {
  const fileConfig = await readJsonFile(openRouterConfigPath);
  const fileModels = Array.isArray(fileConfig.models) ? fileConfig.models : [];
  const routes = fileModels.map((item) => ({
    model: cleanConfigValue(item.model),
    apiKey: cleanApiKey(item.apiKey)
  }));

  if (!routes.length) {
    routes.push({
      model: cleanConfigValue(process.env.OPENROUTER_MODEL) || cleanConfigValue(fileConfig.model) || DEFAULT_OPENROUTER_MODEL,
      apiKey: cleanApiKey(process.env.OPENROUTER_API_KEY) || cleanApiKey(fileConfig.apiKey)
    });
  }

  return {
    routes: routes
      .map((route) => ({
        model: route.model || DEFAULT_OPENROUTER_MODEL,
        apiKey: cleanApiKey(route.apiKey)
      }))
      .filter((route) => hasUsableApiKey(route.apiKey)),
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

function openRouterHeaders(route) {
  return {
    "Authorization": `Bearer ${route.apiKey}`,
    "content-type": "application/json",
    "HTTP-Referer": publicOrigin,
    "X-Title": OPENROUTER_TITLE
  };
}

function openRouterBody(route, messages, overrides = {}) {
  return {
    model: route.model,
    messages,
    temperature: 0.86,
    top_p: 0.93,
    presence_penalty: 0.35,
    frequency_penalty: 0.18,
    reasoning: {
      max_tokens: 128,
      exclude: true
    },
    max_tokens: 1100,
    stream: false,
    ...overrides
  };
}

function openRouterError(result, status) {
  return result?.error?.message || result?.message || `OpenRouter HTTP ${status}`;
}

async function fetchOpenRouterChat(route, messages, overrides) {
  const upstream = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: openRouterHeaders(route),
    body: JSON.stringify(openRouterBody(route, messages, overrides))
  });
  const raw = await upstream.text();
  let result = null;
  try {
    result = raw ? JSON.parse(raw) : null;
  } catch {
    result = { message: raw.slice(0, 240) || "Risposta OpenRouter non JSON." };
  }
  return {
    upstream,
    result,
    content: cleanAssistantContent(result?.choices?.[0]?.message?.content)
  };
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
    let upstream;
    let result;
    let content;
    try {
      ({ upstream, result, content } = await fetchOpenRouterChat(route, messages));
    } catch (error) {
      lastError = error.message || "OpenRouter non raggiungibile.";
      console.error("OpenRouter network error:", lastError);
      continue;
    }

    if (!upstream.ok) {
      lastError = openRouterError(result, upstream.status);
      console.error("OpenRouter API error:", lastError);
      continue;
    }

    if (!content) {
      lastError = `OpenRouter ha risposto senza testo (${result?.choices?.[0]?.finish_reason || "finish_reason sconosciuto"}).`;
      console.error("OpenRouter empty response:", {
        model: result?.model || route.model,
        finishReason: result?.choices?.[0]?.finish_reason || null,
        messageKeys: Object.keys(result?.choices?.[0]?.message || {})
      });
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

async function handleDiagnostics(response) {
  const { routes, model } = await getOpenRouterConfig();
  if (!routes.length) {
    sendJson(response, 200, {
      configured: false,
      model: "modalita-locale",
      ok: false,
      error: "OPENROUTER_API_KEY non configurata."
    });
    return;
  }

  const route = routes[0];
  try {
    const { upstream, result, content } = await fetchOpenRouterChat(
      route,
      [{ role: "user", content: "Rispondi solo con la parola OK." }],
      {
        temperature: 0.1,
        reasoning: {
          max_tokens: 64,
          exclude: true
        },
        max_tokens: 300
      }
    );

    sendJson(response, 200, {
      configured: true,
      model,
      ok: upstream.ok && Boolean(content),
      status: upstream.status,
      upstreamModel: result?.model || null,
      finishReason: result?.choices?.[0]?.finish_reason || null,
      hasContent: Boolean(content),
      error: upstream.ok ? (content ? null : "OpenRouter ha risposto senza testo.") : openRouterError(result, upstream.status)
    });
  } catch (error) {
    sendJson(response, 200, {
      configured: true,
      model,
      ok: false,
      error: error.message || "OpenRouter non raggiungibile."
    });
  }
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

    if (pathname === "/api/diagnostics") {
      await handleDiagnostics(response);
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
