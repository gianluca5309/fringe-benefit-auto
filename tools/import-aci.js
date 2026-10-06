// tools/import-aci.js — importa le tabelle ACI 2026 (file .xlsx scaricati
// da aci.it, in data-input/) in /data/aci-2026.json.
//
// Strumento locale, eseguito una tantum, NON distribuito con l'app (che
// resta a zero dipendenze): per questo, e solo per questo file, il
// progetto usa la dipendenza di sviluppo "xlsx" (SheetJS). Vedi README,
// sezione "Import dei dati ACI".
//
// Esecuzione: node tools/import-aci.js

import xlsx from "xlsx";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_INPUT_DIR = path.join(__dirname, "..", "data-input");
const OUTPUT_PATH = path.join(__dirname, "..", "data", "aci-2026.json");

// ─────────────────────────────────────────────────────────────────────────
// Configurazione per file di origine.
//
// I file scaricati NON contengono una colonna CO2 g/km: ogni riga riporta
// il costo al km e il fringe benefit annuale già calcolato per ciascuna
// fascia di coefficiente disponibile per quella tipologia di alimentazione
// (es. 25/30/50/60% per i termici, 10/25/30% per gli elettrici). Il dato
// CO2 non è quindi ricavabile da queste tabelle: ogni riga importata avrà
// co2: null. Vedi il messaggio di stop per il dettaglio di questa scelta.
//
// alimentazioneDefault si applica quando il file non ha sezioni interne
// che la sovrascrivono (sectionOverrides). Le chiavi di sectionOverrides
// sono il testo esatto delle righe "di sezione" trovate nel foglio (righe
// con una sola cella valorizzata, che segnano l'inizio di un gruppo di
// modelli con la stessa alimentazione).
//
// assunzioneAlimentazione: true segnala che l'alimentazione NON è
// desumibile con certezza dal file (nessuna colonna né sezione dedicata):
// si applica ICE per default e si registra un warning di import, non un
// dato certo (istruzione esplicita del committente per Motoveicoli e
// Autocaravan).
const FILES = [
  {
    file: "Autoveicoli-BZ-IN-2026.xlsx",
    alimentazioneDefault: "ICE",
    categoria: "AUTOVETTURA",
    inProduzione: true,
  },
  {
    file: "Autoveicoli-BZ-OUT-2026.xlsx",
    alimentazioneDefault: "ICE",
    categoria: "AUTOVETTURA",
    inProduzione: false,
  },
  {
    file: "Autoveicoli-GA-IN-2026.xlsx",
    alimentazioneDefault: "ICE",
    categoria: "AUTOVETTURA",
    inProduzione: true,
  },
  {
    file: "Autoveicoli-GA-OUT-2026.xlsx",
    alimentazioneDefault: "ICE",
    categoria: "AUTOVETTURA",
    inProduzione: false,
  },
  {
    file: "Autoveicoli-IBR-BZ-IN-2026.xlsx",
    alimentazioneDefault: "HEV_MHEV",
    categoria: "AUTOVETTURA",
    inProduzione: true,
  },
  {
    file: "Autoveicoli-IBR-BZ-OUT-2026.xlsx",
    alimentazioneDefault: "HEV_MHEV",
    categoria: "AUTOVETTURA",
    inProduzione: false,
  },
  {
    file: "Autoveicoli-IBR-GA-IN-2026.xlsx",
    alimentazioneDefault: "HEV_MHEV",
    categoria: "AUTOVETTURA",
    inProduzione: true,
  },
  {
    file: "Autoveicoli-IBR-GA-OUT-2026.xlsx",
    alimentazioneDefault: "HEV_MHEV",
    categoria: "AUTOVETTURA",
    inProduzione: false,
  },
  {
    file: "Autoveicoli-Plug-in-IN-2026.xlsx",
    alimentazioneDefault: "PHEV",
    categoria: "AUTOVETTURA",
    inProduzione: true,
  },
  {
    file: "Autoveicoli-Plug-in-OUT-2026.xlsx",
    alimentazioneDefault: "PHEV",
    categoria: "AUTOVETTURA",
    inProduzione: false,
  },
  {
    file: "Autoveicoli-ELETTR-IN-2026.xlsx",
    alimentazioneDefault: "BEV",
    categoria: "AUTOVETTURA",
    inProduzione: true,
  },
  {
    file: "Autoveicoli-ELETTR-OUT-2026.xlsx",
    alimentazioneDefault: "BEV",
    categoria: "AUTOVETTURA",
    inProduzione: false,
  },
  {
    // GPL e metano, sia in miscela con benzina sia esclusivi: la mappatura
    // richiesta ("GPL, METANO -> ICE") vale per tutte le sezioni interne.
    file: "Autoveicoli-BZ-GPL-METANO-OUT-2026.xlsx",
    alimentazioneDefault: "ICE",
    categoria: "AUTOVETTURA",
    inProduzione: false,
  },
  {
    // Unico file che mescola due tipologie diverse: la sezione
    // "BENZINA-GPL" segue la regola GPL (ICE), la sezione
    // "IBRIDO BENZINA-GPL" segue la regola IBR-BZ (HEV_MHEV, "senza
    // Plug-in"). Da qui la necessità di sectionOverrides anche quando il
    // nome del file suggerirebbe una sola alimentazione.
    file: "Autoveicoli-BZ-GPL-e-IBR-BZ-GPL-IN-2026.xlsx",
    alimentazioneDefault: "ICE",
    categoria: "AUTOVETTURA",
    inProduzione: true,
    sectionOverrides: {
      "IBRIDO BENZINA-GPL": "HEV_MHEV",
    },
  },
  {
    file: "Autocaravan-2026.xlsx",
    alimentazioneDefault: "ICE",
    categoria: "AUTOCARAVAN",
    inProduzione: null, // nessun suffisso IN/OUT nel file: vedi messaggio di stop.
    assunzioneAlimentazione: true,
  },
  {
    file: "Motoveicoli-2026.xlsx",
    alimentazioneDefault: "ICE",
    categoria: "MOTOCICLO",
    inProduzione: null, // nessun suffisso IN/OUT nel file: vedi messaggio di stop.
    sectionOverrides: {
      "CICLOMOTORI ELETTRICI": "BEV",
      "MOTOCICLI ELETTRICI": "BEV",
      "MOTOCICLI IBRIDO-BENZINA": "HEV_MHEV",
      // CICLOMOTORI, MICROCAR, MOTOCICLI: nessuna indicazione esplicita di
      // alimentazione nel nome sezione -> assunzione ICE, con warning
      // gestito dal set qui sotto.
    },
    sezioniConAssunzioneIce: new Set(["CICLOMOTORI", "MICROCAR", "MOTOCICLI"]),
  },
];

// ─────────────────────────────────────────────────────────────────────────

function parseCostoKm(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim().replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function trimTrailingNulls(row) {
  let end = row.length;
  while (end > 0 && (row[end - 1] === null || row[end - 1] === undefined)) end--;
  return row.slice(0, end);
}

function isSectionRow(row) {
  // Una riga "di sezione" ha una sola cella valorizzata (il nome della
  // sezione) e nessun ID Modello numerico in colonna 0.
  return row.length >= 1 && typeof row[0] === "string" && row.length < 3;
}

function importFile(cfg, righe, esclusioni, warningsImport, counters, headersPerFile) {
  const filePath = path.join(DATA_INPUT_DIR, cfg.file);
  if (!fs.existsSync(filePath)) {
    warningsImport.push(`File non trovato, saltato: ${cfg.file}`);
    return;
  }
  const wb = xlsx.readFile(filePath);

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = xlsx.utils
      .sheet_to_json(sheet, { header: 1, defval: null, raw: true })
      .map(trimTrailingNulls);

    if (rows.length > 0) {
      const chiave = `${cfg.file} :: ${sheetName}`;
      headersPerFile[chiave] = rows[0];
    }

    let sezioneCorrente = null;

    for (let i = 1; i < rows.length; i++) {
      // i=0 è l'intestazione.
      const row = rows[i];
      if (row.length === 0) continue; // riga vuota

      if (isSectionRow(row)) {
        sezioneCorrente = row[0].trim();
        continue;
      }

      const [idModello, marca, modello, costoKmRaw] = row;
      counters.righeLette++;

      if (!marca || typeof marca !== "string" || marca.trim() === "") {
        esclusioni.push({ file: cfg.file, riga: i, motivo: "marca mancante" });
        continue;
      }
      if (!modello || typeof modello !== "string" || modello.trim() === "") {
        esclusioni.push({ file: cfg.file, riga: i, motivo: "modello mancante" });
        continue;
      }
      const costoKm = parseCostoKm(costoKmRaw);
      if (costoKm === null || costoKm <= 0) {
        esclusioni.push({
          file: cfg.file,
          riga: i,
          motivo: `costoKm mancante o non valido (valore letto: ${JSON.stringify(costoKmRaw)})`,
        });
        continue;
      }

      // Alimentazione: sezione interna se presente e mappata, altrimenti
      // il default del file.
      let alimentazione = cfg.alimentazioneDefault;
      let assunzione = cfg.assunzioneAlimentazione === true;
      if (cfg.sectionOverrides && sezioneCorrente && cfg.sectionOverrides[sezioneCorrente]) {
        alimentazione = cfg.sectionOverrides[sezioneCorrente];
        assunzione = false;
      } else if (cfg.sezioniConAssunzioneIce && sezioneCorrente && cfg.sezioniConAssunzioneIce.has(sezioneCorrente)) {
        alimentazione = "ICE";
        assunzione = true;
      }

      if (assunzione) {
        counters.assunzioniAlimentazione++;
      }

      righe.push({
        id: null, // assegnato dopo, in ordine stabile
        marca: marca.trim(),
        modello: modello.trim(),
        allestimento: "", // il file di origine non ha una colonna distinta: vedi messaggio di stop
        alimentazione,
        // true quando l'alimentazione viene da un nome file o da
        // un'intestazione di sezione esplicita; false per le righe con
        // fallback ICE assunto (CICLOMOTORI, MICROCAR, MOTOCICLI,
        // Autocaravan): la UI deve poterle distinguere.
        alimentazioneCerta: !assunzione,
        co2: null, // non presente in nessuna delle tabelle scaricate: vedi messaggio di stop
        costoKm,
        categoria: cfg.categoria,
        inProduzione: cfg.inProduzione,
        fileOrigine: cfg.file,
        esempio: false,
        _sezioneOrigine: sezioneCorrente, // solo per il report di import, rimossa prima di scrivere il JSON
      });
    }
  }
}

function main() {
  const righe = [];
  const esclusioni = [];
  const warningsImport = [];
  const counters = { righeLette: 0, assunzioniAlimentazione: 0 };
  const headersPerFile = {};

  for (const cfg of FILES) {
    importFile(cfg, righe, esclusioni, warningsImport, counters, headersPerFile);
  }

  // ID progressivo stabile: ordine di FILES, poi ordine di lettura nel file.
  righe.forEach((r, idx) => {
    r.id = `aci-2026-${String(idx + 1).padStart(5, "0")}`;
  });

  // ── Verifica di coerenza (PASSO A4) ──────────────────────────────────
  const perAlimentazione = {};
  for (const r of righe) {
    perAlimentazione[r.alimentazione] = (perAlimentazione[r.alimentazione] ?? 0) + 1;
  }
  const costoKmNonValido = righe.filter((r) => !(r.costoKm > 0)).length;
  const co2Mancante = righe.filter((r) => r.co2 === null).length;

  const chiaveDuplicato = (r) => `${r.marca}|||${r.modello}|||${r.allestimento}`;
  const gruppi = new Map();
  for (const r of righe) {
    const k = chiaveDuplicato(r);
    if (!gruppi.has(k)) gruppi.set(k, []);
    gruppi.get(k).push(r);
  }
  const duplicati = [...gruppi.values()].filter((g) => g.length > 1);

  const perCostoKmDesc = [...righe].sort((a, b) => b.costoKm - a.costoKm);
  const top3Alto = perCostoKmDesc.slice(0, 3);
  const top3Basso = perCostoKmDesc.slice(-3).reverse();

  // Rimuove i campi di solo debug prima di scrivere il JSON.
  const righeOutput = righe.map(({ _sezioneOrigine, ...r }) => r);
  const alimentazioneNonCerta = righe.filter((r) => r.alimentazioneCerta === false).length;

  const output = {
    annoTabella: 2026,
    fonte:
      "Tabelle ACI 2026, aci.it (Servizi online / Fringe benefit) — importate da file scaricati dall'utente",
    dataImportazione: new Date().toISOString().slice(0, 10),
    righe: righeOutput,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");

  // ── Report a console (per il messaggio di stop) ──────────────────────
  console.log("=== IMPORT COMPLETATO ===");
  console.log(`Righe totali importate: ${righe.length}`);
  console.log("Per alimentazione:", JSON.stringify(perAlimentazione, null, 2));
  console.log(`Righe con costoKm mancante o <= 0: ${costoKmNonValido}`);
  console.log(`Righe con co2 mancante (attese: tutte, ${righe.length}): ${co2Mancante}`);
  console.log(`Gruppi duplicati (stessa marca+modello+allestimento): ${duplicati.length}`);
  for (const g of duplicati.slice(0, 20)) {
    console.log(
      `  DUPLICATO: ${g[0].marca} / ${g[0].modello} — righe: ${g.map((r) => `${r.id} (${r.fileOrigine})`).join(", ")}`
    );
  }
  if (duplicati.length > 20) console.log(`  ... e altri ${duplicati.length - 20} gruppi.`);

  console.log("\nTop 3 costoKm più alto:");
  for (const r of top3Alto) console.log(`  ${r.costoKm} €/km — ${r.marca} ${r.modello} (${r.fileOrigine})`);
  console.log("Top 3 costoKm più basso:");
  for (const r of top3Basso) console.log(`  ${r.costoKm} €/km — ${r.marca} ${r.modello} (${r.fileOrigine})`);

  console.log(`\nRighe escluse: ${esclusioni.length}`);
  const motiviCount = {};
  for (const e of esclusioni) motiviCount[e.motivo] = (motiviCount[e.motivo] ?? 0) + 1;
  console.log("Motivi:", JSON.stringify(motiviCount, null, 2));
  for (const e of esclusioni.slice(0, 30)) {
    console.log(`  ESCLUSA: ${e.file} riga ${e.riga} — ${e.motivo}`);
  }
  if (esclusioni.length > 30) console.log(`  ... e altre ${esclusioni.length - 30}.`);

  console.log(`\nRighe con alimentazione ASSUNTA (ICE per assenza di dato certo): ${counters.assunzioniAlimentazione}`);
  console.log(`Righe con alimentazioneCerta === false (deve coincidere con la riga sopra): ${alimentazioneNonCerta}`);

  if (warningsImport.length > 0) {
    console.log("\nWarning di import:");
    for (const w of warningsImport) console.log(`  - ${w}`);
  }

  console.log("\nIntestazioni di colonna per file (per verifica manuale che il CO2 non compaia):");
  for (const [chiave, header] of Object.entries(headersPerFile)) {
    console.log(`  ${chiave}:`);
    console.log(`    ${JSON.stringify(header)}`);
  }

  console.log(`\nScritto: ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

main();
