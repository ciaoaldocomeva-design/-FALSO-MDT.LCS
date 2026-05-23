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

Il server usa OpenRouter con `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, che al momento risponde correttamente con la chiave disponibile. 

## Fallback locale

Se OpenRouter non e configurato o non risponde, l'app continua a funzionare con una modalita locale basata sui dossier, il tono e i limiti storici definiti per ogni personaggio.
