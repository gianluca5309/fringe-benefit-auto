// js/plate.js — validazione del formato targa italiana e lookup (mock).

// Formato standard italiano in uso dal 1994: due lettere, tre cifre, due
// lettere (es. AB123CD). Non copre le targhe speciali (moto anteriori al
// 1994, prove, diplomatiche, ecc.): per queste il professionista salta lo
// step e inserisce i dati a mano, opzione sempre disponibile.
const FORMATO_TARGA = /^[A-Za-z]{2}\d{3}[A-Za-z]{2}$/;

export function validaFormatoTarga(targa) {
  if (typeof targa !== "string") return false;
  return FORMATO_TARGA.test(targa.trim().replace(/\s+/g, ""));
}

// Dataset mock: 5 veicoli di esempio per collaudare il flusso "targa" senza
// una vera integrazione. NON sono dati ACI e non hanno alcun legame con
// data/aci-2026.json: sono un mock esplicito del solo step 1.
const VEICOLI_MOCK = {
  FX123GH: {
    marca: "TESLA",
    modello: "MODEL Y RWD",
    alimentazione: "BEV",
    dataPrimaImmatricolazione: "2025-03-10",
    co2: 0,
  },
  GH456JK: {
    marca: "VOLKSWAGEN",
    modello: "GOLF 1.5 TSI 130CV",
    alimentazione: "ICE",
    dataPrimaImmatricolazione: "2020-05-15",
    co2: 128,
  },
  JK789LM: {
    marca: "ALFA ROMEO",
    modello: "TONALE 1.3 PHEV 180CV",
    alimentazione: "PHEV",
    dataPrimaImmatricolazione: "2024-01-20",
    co2: 32,
  },
  LM012NP: {
    marca: "BMW",
    modello: "320D TOURING 190CV",
    alimentazione: "ICE",
    dataPrimaImmatricolazione: "2019-07-01",
    co2: 118,
  },
  NP345QR: {
    marca: "HONDA",
    modello: "SH 125I",
    alimentazione: "ICE",
    dataPrimaImmatricolazione: "2021-09-05",
    co2: 58,
  },
};

// TODO: innestare qui una vera interrogazione (PRA / banca dati targhe)
// quando sarà disponibile un'integrazione reale. Nessun endpoint né
// chiave è stato inventato: questa funzione resta un mock esplicito
// finché non verrà sostituita. La firma resta pensata per non cambiare
// al momento della sostituzione:
//   Promise<{marca, modello, alimentazione, dataPrimaImmatricolazione, co2} | null>
export async function lookupPlate(targa) {
  const chiave = targa.trim().replace(/\s+/g, "").toUpperCase();
  await new Promise((resolve) => setTimeout(resolve, 200)); // simula la latenza di una chiamata reale
  return VEICOLI_MOCK[chiave] ?? null;
}
