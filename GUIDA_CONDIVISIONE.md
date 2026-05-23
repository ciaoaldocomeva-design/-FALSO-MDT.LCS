# Guida per condividere l'app

Questa app deve essere pubblicata come servizio Node.js. Non basta caricare `index.html` su un hosting statico, perche la chat con OpenRouter passa da `server.mjs`.

## File da condividere

Condividi questi file:

```text
index.html
server.mjs
package.json
README.md
.env.example
.gitignore
render.yaml
GUIDA_CONDIVISIONE.md
```

Non condividere questi file:

```text
openrouter.local.json
.env
server.err.log
server.out.log
node_modules/
```

## Pubblicazione consigliata su Render

1. Crea un account su Render.
2. Carica questa cartella su GitHub, senza file con chiavi reali.
3. In Render scegli `New` > `Web Service`.
4. Collega il repository GitHub.
5. Usa queste impostazioni:

```text
Build command: npm install
Start command: npm start
```

6. Aggiungi queste variabili d'ambiente:

```text
OPENROUTER_MODEL=nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
OPENROUTER_API_KEY=la-tua-chiave-openrouter
PUBLIC_ORIGIN=https://url-pubblico-della-tua-app
```

7. Fai deploy.
8. Apri l'URL pubblico dato da Render.

## Controllo rapido

Dopo il deploy, apri:

```text
https://url-pubblico-della-tua-app/api/status
```

Se tutto e configurato bene, dovresti vedere:

```json
{
  "configured": true,
  "model": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
}
```

Se `configured` e `false`, manca la variabile `OPENROUTER_API_KEY`.

## Nota di sicurezza

Non mettere mai la chiave OpenRouter dentro `index.html`. La chiave deve stare solo nel server o nelle variabili d'ambiente dell'hosting.
