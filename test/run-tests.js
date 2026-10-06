// run-tests.js — runner Node senza dipendenze (solo moduli built-in).
// Tutti i casi e l'asserzione automatica (errors/warnings) vivono in
// cases.js: questo file si limita a eseguirli e a stampare l'esito.
//
// Esecuzione: node test/run-tests.js

import { casi, valutaCaso } from "./cases.js";

let passCount = 0;
for (const caso of casi) {
  const esito = valutaCaso(caso);
  if (esito.pass) passCount++;
  console.log(`[${esito.pass ? "PASS" : "FAIL"}] ${esito.id} — ${esito.descrizione}`);
  console.log(`      atteso:   ${esito.atteso}`);
  console.log(
    `      ottenuto: ${esito.ottenuto}${esito.problemi.length ? " | " + esito.problemi.join(" | ") : ""}`
  );
}

console.log("");
console.log(`Risultato: ${passCount}/${casi.length} test passati.`);

process.exit(passCount === casi.length ? 0 : 1);
