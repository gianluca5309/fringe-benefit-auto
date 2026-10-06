// js/aci.js — ricerca fuzzy sul dataset ACI reale (data/aci-2026.json).
// Zero dipendenze esterne: normalizzazione e scoring scritti a mano.
// Il dataset ha 5.130 righe: la ricerca è comunque O(n) per interrogazione,
// trascurabile a questa scala, ma va richiamata con debounce (vedi sotto)
// per non ricalcolarla ad ogni tasto premuto.

let cache = null;

export async function loadAciData() {
  if (cache) return cache;
  const res = await fetch("data/aci-2026.json");
  if (!res.ok) {
    throw new Error(`Impossibile caricare data/aci-2026.json (HTTP ${res.status}).`);
  }
  const json = await res.json();
  cache = json.righe;
  return cache;
}

// Normalizza per il matching: minuscolo, accenti rimossi, punteggiatura
// sostituita da spazio, spazi multipli collassati.
// U+0300-U+036F: segni diacritici combinanti in forma Unicode NFD
// (accenti). Espressi come escape esadecimali, non come caratteri
// letterali, per evitare ambiguità di codifica nel file sorgente.
const DIACRITICI = /[̀-ͯ]/g;

function normalizza(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICI, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizza(s) {
  const n = normalizza(s);
  return n.length ? n.split(" ") : [];
}

// Punteggio di una riga rispetto ai token della query: ogni token della
// query deve avere almeno un match (uguaglianza, prefisso o sottostringa)
// in marca+modello, altrimenti la riga è esclusa. Match esatto pesa più
// del prefisso, che pesa più della sottostringa: privilegia i risultati
// più precisi senza escludere quelli solo parzialmente coincidenti.
function punteggioRiga(tokenQuery, tokenRiga) {
  let punteggio = 0;
  for (const tq of tokenQuery) {
    let migliore = 0;
    for (const tr of tokenRiga) {
      if (tr === tq) migliore = Math.max(migliore, 3);
      else if (tr.startsWith(tq)) migliore = Math.max(migliore, 2);
      else if (tr.includes(tq)) migliore = Math.max(migliore, 1);
    }
    if (migliore === 0) return 0;
    punteggio += migliore;
  }
  return punteggio;
}

// Ricerca SOLO su marca + modello (l'allestimento è sempre stringa vuota
// nella fonte reale: includerlo nel matching non aggiungerebbe segnale).
export function cercaAci(query, righe, limite = 25) {
  const tokenQuery = tokenizza(query);
  if (tokenQuery.length === 0) return [];
  const risultati = [];
  for (const riga of righe) {
    const tokenRiga = tokenizza(`${riga.marca} ${riga.modello}`);
    const punteggio = punteggioRiga(tokenQuery, tokenRiga);
    if (punteggio > 0) risultati.push({ riga, punteggio });
  }
  risultati.sort(
    (a, b) => b.punteggio - a.punteggio || a.riga.marca.localeCompare(b.riga.marca)
  );
  return risultati.slice(0, limite).map((r) => r.riga);
}

export function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
