© 2026 La Cerra Sabato. Tutti i diritti riservati.

Tutti i contenuti, testi, immagini, opere, progetti e materiali creativi firmati o pubblicati da La Cerra Sabato sono di proprietà dell’autore. È vietata la riproduzione, modifica, distribuzione o utilizzo, totale o parziale, senza autorizzazione scritta.


# Macchina del Tempo Testuale

React Artifact standalone per dialogare con figure storiche tramite OpenRouter, con fallback locale se il modello non risponde.  Per questo modello la richiesta limita il ragionamento a `reasoning.max_tokens: 128` e nasconde i token di ragionamento dalla risposta: senza un limite esplicito OpenRouter puo rispondere `200 OK` ma con `message.content` vuoto, facendo scattare il fallback locale.
## Modello

Il server usa OpenRouter con `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, che al momento risponde correttamente con la chiave disponibile. 

## Fallback locale

Se OpenRouter non e configurato o non risponde, l'app continua a funzionare con una modalita locale basata sui dossier, il tono e i limiti storici definiti per ogni personaggio.
