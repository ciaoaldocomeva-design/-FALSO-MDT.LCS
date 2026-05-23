© 2026 La Cerra Sabato. Tutti i diritti riservati.

Tutti i contenuti, testi, immagini, opere, progetti e materiali creativi firmati o pubblicati da La Cerra Sabato sono di proprietà dell’autore. È vietata la riproduzione, modifica, distribuzione o utilizzo, totale o parziale, senza autorizzazione scritta.


# Macchina del Tempo Testuale

React Artifact standalone per dialogare con figure storiche tramite OpenRouter, con fallback locale se il modello non risponde.

## Avvio locale

```powershell
node server.mjs 4173
```

Poi apri:

```text
http://127.0.0.1:4173
```

## Modello

Il server usa OpenRouter con `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, che al momento risponde correttamente con la chiave disponibile. `deepseek/deepseek-v4-flash:free` resta configurato come modello successivo, utile quando la chiave DeepSeek avra credito disponibile.

Le chiavi non vengono inserite nell'HTML: il server le legge da `OPENROUTER_API_KEY` oppure dal file locale `../openrouter.local.json`, che resta fuori dalla cartella servita dal browser.

## Pubblicazione online

Per condividere l'app con altre persone senza fallback devi pubblicare tutta la cartella su un hosting che esegue Node.js, non solo `index.html`.

Impostazioni tipiche su Render, Railway, Fly.io o un VPS:

```text
Build command: npm install
Start command: npm start
```

Variabili d'ambiente da configurare nell'hosting:

```text
OPENROUTER_MODEL=nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
OPENROUTER_API_KEY=la-tua-chiave-openrouter
PUBLIC_ORIGIN=https://il-tuo-url-pubblico
```

Non caricare mai `openrouter.local.json` su GitHub o su una cartella pubblica: contiene chiavi reali. In produzione usa le variabili d'ambiente dell'hosting.

## Fallback locale

Se OpenRouter non e configurato o non risponde, l'app continua a funzionare con una modalita locale basata sui dossier, il tono e i limiti storici definiti per ogni personaggio.
