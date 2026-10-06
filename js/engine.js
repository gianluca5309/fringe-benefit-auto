// engine.js — motore di calcolo del fringe benefit auto ad uso promiscuo.
// Funzioni pure, zero DOM, zero I/O. Testabile identicamente da Node e da
// browser. Importa solo config.js.
//
// NON usare conoscenza pregressa sul fringe benefit auto diversa da
// quanto implementato qui: la normativa di riferimento (D.Lgs. 148/2026)
// è successiva al training del modello che ha scritto questo file.

import {
  PERCORRENZA_CONVENZIONALE,
  GIORNI_ANNO,
  GIORNI_MASSIMI_PERIODO,
  REGIME_A_STIPULA_LIMITE,
  REGIME_B_CONSEGNA_INIZIO,
  REGIME_B_CONSEGNA_FINE_STORICO,
  REGIME_B_SALVAGUARDIA_ORDINE_LIMITE,
  REGIME_B_SALVAGUARDIA_CONSEGNA_INIZIO,
  REGIME_B_SALVAGUARDIA_CONSEGNA_FINE,
  REGIME_C_CONFINE_STIPULA_LIMITE,
  REGIME_C_CONFINE_CONSEGNA_INIZIO,
  COEFFICIENTE_ANTE_2020,
  FASCE_CO2,
  COEFFICIENTI_ALIMENTAZIONE,
  ANNI_SOGLIA_ANZIANITA,
  MAGGIORAZIONE_ANZIANITA,
  APPLICA_ANZIANITA_A_REGIME_A,
  MAGGIORAZIONE_ACCESSORI,
  ANNO_DECORRENZA_MAGG_ACCESSORI,
  APPLICA_ACCESSORI_A_REGIME_A,
  APPLICA_FORFAIT_A_CASI_CONFINE,
  SOGLIE_ESENZIONE,
} from "./config.js";

// ─────────────────────────────────────────────────────────────────────────
// Flag interpretativi
// ─────────────────────────────────────────────────────────────────────────

// I default vengono da config.js; possono essere sovrascritti per singolo
// calcolo passando un oggetto opzioni a computeFringeBenefit/resolveRegime
// (serve al professionista che vuole valutare l'ipotesi alternativa senza
// toccare i parametri globali, e rende i flag verificabili nei test).
function risolviOpzioni(opzioni) {
  return {
    applicaAnzianitaARegimeA: APPLICA_ANZIANITA_A_REGIME_A,
    applicaAccessoriARegimeA: APPLICA_ACCESSORI_A_REGIME_A,
    applicaForfaitACasiConfine: APPLICA_FORFAIT_A_CASI_CONFINE,
    ...(opzioni ?? {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Utility su date in formato "YYYY-MM-DD"
// ─────────────────────────────────────────────────────────────────────────

// Le date sono sempre stringhe ISO "YYYY-MM-DD": il confronto lessicale di
// stringa coincide con il confronto cronologico, quindi si usano
// direttamente <=, >=, <, > senza passare da oggetti Date (che
// introdurrebbero problemi di fuso orario).

function annoDi(dataIso) {
  return Number(dataIso.slice(0, 4));
}

function giornoUTC(dataIso) {
  const [y, m, d] = dataIso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

// Giorni di calendario tra due date ISO, estremi inclusi.
function giorniInclusivi(dataInizio, dataFine) {
  return giornoUTC(dataFine) - giornoUTC(dataInizio) + 1;
}

// Mesi di calendario distinti intersecati dal periodo, estremi inclusi:
// è il numero di mensilità di paga interessate. 20/01–10/02 = 2 mesi,
// 01/07–31/12 = 6 mesi, anno intero = 12 mesi.
function mesiCalendarioIntersecati(dataInizio, dataFine) {
  const [annoInizio, meseInizio] = dataInizio.split("-").map(Number);
  const [annoFine, meseFine] = dataFine.split("-").map(Number);
  return annoFine * 12 + meseFine - (annoInizio * 12 + meseInizio) + 1;
}

function round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

// Percentuale in formato italiano (virgola decimale, zeri finali
// eliminati): 0.3 -> "30%", 0.105 -> "10,5%". Evita gli artefatti in
// virgola mobile di un semplice coefficiente * 100 (es. 0.29 * 100 =
// 28.999999999999996).
function formatPercent(x) {
  const percentuale = Math.round(x * 100 * 100) / 100; // max 2 decimali
  return `${String(percentuale).replace(".", ",")}%`;
}

// ─────────────────────────────────────────────────────────────────────────
// Validazione — "se manca un dato necessario, blocca con messaggio
// esplicito. Mai default silenziosi."
// ─────────────────────────────────────────────────────────────────────────

const ALIMENTAZIONI_VALIDE = ["BEV", "PHEV", "ICE", "HEV_MHEV"];
const ACCESSORI_VALIDI = [
  "ASSENTI",
  "ACQUISTATI_DAL_LAVORATORE",
  "ACQUISTATI_DALL_AZIENDA",
];
const TIPI_ATTO_VALIDI = ["PRIMA_ASSEGNAZIONE", "PROROGA", "RIASSEGNAZIONE"];
const QUALIFICHE_VALIDE = ["DIPENDENTE", "AMMINISTRATORE", "COLLABORATORE"];
const FONTI_VALORE_BASE = [
  "ACI",
  "COSTO_KM_MANUALE",
  "VALORE_CONVENZIONALE_MANUALE",
];

function valorizzato(x) {
  return x !== null && x !== undefined;
}

function numeroPositivo(x) {
  return typeof x === "number" && !Number.isNaN(x) && x > 0;
}

// Valida la fonte del valore base (riga ACI o inserimento manuale) e la
// coerenza reciproca di costoKm / valoreConvenzionaleAnnuo /
// notaFonteValore. Le modalità manuali servono ai veicoli non presenti
// nelle tabelle ACI (fuori produzione, versioni estere, allestimenti
// speciali), dove il valore si determina per riferimento al veicolo più
// simile: NON aggirano gli altri controlli (alimentazione sempre
// obbligatoria, CO2 obbligatoria in REGIME_B).
function validateFonteValoreBase(input, errors) {
  if (!FONTI_VALORE_BASE.includes(input.fonteValoreBase)) {
    errors.push(
      `fonteValoreBase mancante o non valida (valori ammessi: ${FONTI_VALORE_BASE.join(", ")}).`
    );
    return;
  }

  if (input.fonteValoreBase === "ACI") {
    if (!input.aciRowId) {
      errors.push("aciRowId mancante: seleziona una riga ACI.");
    }
    if (!numeroPositivo(input.costoKm)) {
      errors.push(
        "costoKm mancante o non valido (numero maggiore di zero) per fonteValoreBase = ACI."
      );
    }
    if (valorizzato(input.valoreConvenzionaleAnnuo)) {
      errors.push(
        "Input contraddittorio: valoreConvenzionaleAnnuo deve essere null quando fonteValoreBase = ACI."
      );
    }
  } else if (input.fonteValoreBase === "COSTO_KM_MANUALE") {
    if (!numeroPositivo(input.costoKm)) {
      errors.push(
        "costoKm mancante o non valido (numero maggiore di zero) per fonteValoreBase = COSTO_KM_MANUALE."
      );
    }
    if (valorizzato(input.valoreConvenzionaleAnnuo)) {
      errors.push(
        "Input contraddittorio: valoreConvenzionaleAnnuo deve essere null quando fonteValoreBase = COSTO_KM_MANUALE."
      );
    }
  } else {
    // VALORE_CONVENZIONALE_MANUALE
    if (!numeroPositivo(input.valoreConvenzionaleAnnuo)) {
      errors.push(
        "valoreConvenzionaleAnnuo mancante o non valido (numero maggiore di zero) per fonteValoreBase = VALORE_CONVENZIONALE_MANUALE."
      );
    }
    if (valorizzato(input.costoKm)) {
      errors.push(
        "Input contraddittorio: costoKm deve essere null quando fonteValoreBase = VALORE_CONVENZIONALE_MANUALE."
      );
    }
  }

  if (input.fonteValoreBase !== "ACI") {
    if (
      typeof input.notaFonteValore !== "string" ||
      input.notaFonteValore.trim() === ""
    ) {
      errors.push(
        "notaFonteValore obbligatoria nelle modalità di inserimento manuale del valore base: indicare il veicolo di riferimento e il criterio adottato."
      );
    }
  }
}

// Verifica la coerenza cronologica di una tripletta ordine/stipula/consegna
// rispetto alla data di prima immatricolazione. dImmatricolazione è sempre
// input.dataPrimaImmatricolazione, la stessa per l'intera vita del
// veicolo: si usa identica sia per il contratto in esame sia per quello
// originario. etichettaContesto distingue nei messaggi le due situazioni.
//
// Con tre campi data adiacenti in UI, l'inversione di due campi è
// l'errore d'uso più frequente: un veicolo non può essere consegnato
// prima di essere immatricolato o prima di essere ordinato (bloccante).
// Una consegna anteriore alla stipula è rara ma non impossibile — es.
// consegna anticipata con formalizzazione successiva dell'atto — quindi
// solo un warning.
function validaCronologiaTripletta(
  etichettaContesto,
  dImmatricolazione,
  dOrdine,
  dStipula,
  dConsegna,
  errors,
  warnings
) {
  if (dImmatricolazione && dConsegna && dConsegna < dImmatricolazione) {
    errors.push(
      `${etichettaContesto}dataConsegnaAlDipendente (${dConsegna}) è anteriore a dataPrimaImmatricolazione (${dImmatricolazione}): un veicolo non può essere consegnato prima di essere immatricolato.`
    );
  }
  if (dOrdine && dConsegna && dConsegna < dOrdine) {
    errors.push(
      `${etichettaContesto}dataConsegnaAlDipendente (${dConsegna}) è anteriore a dataOrdineDatore (${dOrdine}).`
    );
  }
  if (dStipula && dConsegna && dConsegna < dStipula) {
    warnings.push(
      "Consegna anteriore alla stipula del contratto di assegnazione: " +
        `verificare l'ordine dei campi.${etichettaContesto ? ` (${etichettaContesto.trim()})` : ""}`
    );
  }
}

function validateInput(input) {
  const errors = [];
  const warnings = [];

  if (input == null || typeof input !== "object") {
    return { errors: ["Input mancante o non valido."], warnings: [] };
  }

  validateFonteValoreBase(input, errors);

  if (!ALIMENTAZIONI_VALIDE.includes(input.alimentazione)) {
    errors.push(
      `alimentazione mancante o non valida (valori ammessi: ${ALIMENTAZIONI_VALIDE.join(", ")}).`
    );
  }
  if (!input.dataPrimaImmatricolazione) {
    errors.push("dataPrimaImmatricolazione mancante.");
  }
  if (!input.dataStipulaContratto) {
    errors.push("dataStipulaContratto mancante.");
  }
  if (!input.dataConsegnaAlDipendente) {
    errors.push("dataConsegnaAlDipendente mancante.");
  }
  if (!TIPI_ATTO_VALIDI.includes(input.tipoAtto)) {
    errors.push(
      `tipoAtto mancante o non valido (valori ammessi: ${TIPI_ATTO_VALIDI.join(", ")}).`
    );
  }
  if (typeof input.annoImposta !== "number") {
    errors.push("annoImposta mancante o non numerico.");
  }
  if (!input.dataInizioPeriodo) {
    errors.push("dataInizioPeriodo mancante.");
  }
  if (!input.dataFinePeriodo) {
    errors.push("dataFinePeriodo mancante.");
  }
  if (!ACCESSORI_VALIDI.includes(input.accessoriNonAci)) {
    errors.push(
      `accessoriNonAci mancante o non valido (valori ammessi: ${ACCESSORI_VALIDI.join(", ")}).`
    );
  }
  if (
    typeof input.sommeTrattenute !== "number" ||
    Number.isNaN(input.sommeTrattenute)
  ) {
    errors.push("sommeTrattenute mancante o non numerico.");
  }
  if (
    typeof input.altriFringeBenefitAnno !== "number" ||
    Number.isNaN(input.altriFringeBenefitAnno)
  ) {
    errors.push("altriFringeBenefitAnno mancante o non numerico.");
  }
  if (typeof input.figliFiscalmenteACarico !== "boolean") {
    errors.push("figliFiscalmenteACarico mancante o non booleano.");
  }
  if (!QUALIFICHE_VALIDE.includes(input.qualifica)) {
    errors.push(
      `qualifica mancante o non valida (valori ammessi: ${QUALIFICHE_VALIDE.join(", ")}).`
    );
  }
  if (typeof input.usoEsclusivamenteAziendale !== "boolean") {
    errors.push("usoEsclusivamenteAziendale mancante o non booleano.");
  }

  if (input.tipoAtto === "PROROGA" || input.tipoAtto === "RIASSEGNAZIONE") {
    if (!input.contrattoOriginario) {
      errors.push(
        `contrattoOriginario mancante: obbligatorio quando tipoAtto è ${input.tipoAtto}.`
      );
    } else {
      if (!input.contrattoOriginario.dataStipulaContratto) {
        errors.push("contrattoOriginario.dataStipulaContratto mancante.");
      }
      if (!input.contrattoOriginario.dataConsegnaAlDipendente) {
        errors.push("contrattoOriginario.dataConsegnaAlDipendente mancante.");
      }
    }
  }

  // Coerenza del periodo di competenza. I controlli si eseguono solo se i
  // campi coinvolti sono presenti, per non sovrapporre errori a errori.
  if (input.dataInizioPeriodo && input.dataFinePeriodo) {
    if (input.dataFinePeriodo < input.dataInizioPeriodo) {
      errors.push(
        `Periodo non valido: dataFinePeriodo (${input.dataFinePeriodo}) è anteriore a dataInizioPeriodo (${input.dataInizioPeriodo}).`
      );
    } else {
      const giorni = giorniInclusivi(
        input.dataInizioPeriodo,
        input.dataFinePeriodo
      );
      if (giorni > GIORNI_MASSIMI_PERIODO) {
        errors.push(
          `Periodo non valido: ${giorni} giorni, superiore al massimo di ${GIORNI_MASSIMI_PERIODO} per un singolo anno d'imposta.`
        );
      }
    }
  }

  if (typeof input.annoImposta === "number") {
    if (
      input.dataInizioPeriodo &&
      annoDi(input.dataInizioPeriodo) !== input.annoImposta
    ) {
      errors.push(
        `dataInizioPeriodo (${input.dataInizioPeriodo}) non ricade nell'anno d'imposta ${input.annoImposta}.`
      );
    }
    if (
      input.dataFinePeriodo &&
      annoDi(input.dataFinePeriodo) !== input.annoImposta
    ) {
      errors.push(
        `dataFinePeriodo (${input.dataFinePeriodo}) non ricade nell'anno d'imposta ${input.annoImposta}.`
      );
    }
  }

  if (
    input.dataConsegnaAlDipendente &&
    input.dataFinePeriodo &&
    input.dataConsegnaAlDipendente > input.dataFinePeriodo
  ) {
    errors.push(
      `dataConsegnaAlDipendente (${input.dataConsegnaAlDipendente}) è successiva alla fine del periodo (${input.dataFinePeriodo}): nessuna assegnazione nel periodo.`
    );
  }

  // Coerenza cronologica delle date del contratto in esame.
  validaCronologiaTripletta(
    "",
    input.dataPrimaImmatricolazione,
    input.dataOrdineDatore,
    input.dataStipulaContratto,
    input.dataConsegnaAlDipendente,
    errors,
    warnings
  );

  if (
    (input.tipoAtto === "PROROGA" || input.tipoAtto === "RIASSEGNAZIONE") &&
    input.contrattoOriginario
  ) {
    const orig = input.contrattoOriginario;

    // Stessa tripletta, sulle date del contratto originario: la data di
    // prima immatricolazione è unica per il veicolo, quindi identica.
    validaCronologiaTripletta(
      "Contratto originario: ",
      input.dataPrimaImmatricolazione,
      orig.dataOrdineDatore,
      orig.dataStipulaContratto,
      orig.dataConsegnaAlDipendente,
      errors,
      warnings
    );

    // Le date del contratto in esame (proroga o riassegnazione) devono
    // essere successive o uguali a quelle del contratto originario.
    const coppieContratti = [
      ["dataOrdineDatore", input.dataOrdineDatore, orig.dataOrdineDatore],
      ["dataStipulaContratto", input.dataStipulaContratto, orig.dataStipulaContratto],
      ["dataConsegnaAlDipendente", input.dataConsegnaAlDipendente, orig.dataConsegnaAlDipendente],
    ];
    for (const [campo, valoreAttuale, valoreOriginario] of coppieContratti) {
      if (valoreAttuale && valoreOriginario && valoreAttuale < valoreOriginario) {
        errors.push(
          `Le date del contratto in esame devono essere successive o uguali a quelle del contratto originario: ${campo} (${valoreAttuale}) è anteriore alla corrispondente data del contratto originario (${valoreOriginario}).`
        );
      }
    }
  }

  return { errors, warnings };
}

// ─────────────────────────────────────────────────────────────────────────
// PASSO 1 — selezione del regime
// ─────────────────────────────────────────────────────────────────────────

// Risolve dOrdine/dStipula/dConsegna in base a tipoAtto.
// - PROROGA: mera estensione temporale senza novazione, determina il
//   regime con le date di contrattoOriginario. (Circ. 10/E/2025)
// - RIASSEGNAZIONE: dal D.Lgs. 148/2026 il regime segue il VEICOLO, non
//   il dipendente. Usa le date di contrattoOriginario. Questa regola
//   ribalta la prassi precedente (circ. 10/E/2025 diceva l'opposto): qui
//   si implementa la regola nuova.
// - Altrimenti: usa le date del contratto in esame.
function resolveContractDates(input) {
  if (input.tipoAtto === "PROROGA" || input.tipoAtto === "RIASSEGNAZIONE") {
    return {
      dOrdine: input.contrattoOriginario.dataOrdineDatore ?? null,
      dStipula: input.contrattoOriginario.dataStipulaContratto,
      dConsegna: input.contrattoOriginario.dataConsegnaAlDipendente,
    };
  }
  return {
    dOrdine: input.dataOrdineDatore ?? null,
    dStipula: input.dataStipulaContratto,
    dConsegna: input.dataConsegnaAlDipendente,
  };
}

// Esponi la motivazione della scelta di regime, da mostrare in UI.
export function resolveRegime(input, opzioni) {
  const flags = risolviOpzioni(opzioni);
  const warnings = [];
  const errors = [];

  // PASSO 0 — uso esclusivamente aziendale.
  if (input.usoEsclusivamenteAziendale === true) {
    return {
      regime: "E",
      motivazioneRegime:
        "Uso dichiarato esclusivamente aziendale (non promiscuo): il " +
        "fringe benefit ex art. 51 c.4 lett. a) TUIR si applica solo in " +
        "caso di concessione in uso promiscuo. Nessun fringe benefit.",
      dOrdine: null,
      dStipula: null,
      dConsegna: null,
      warnings,
      errors,
    };
  }

  const { dOrdine, dStipula, dConsegna } = resolveContractDates(input);
  const origineDate =
    input.tipoAtto === "PROROGA"
      ? " (date del contratto originario, ai sensi della Circ. 10/E/2025: la proroga è mera estensione temporale senza novazione)"
      : input.tipoAtto === "RIASSEGNAZIONE"
        ? " (date del contratto originario: dal D.Lgs. 148/2026 il regime segue il veicolo, non il dipendente)"
        : "";

  // REGIME_A — "ante 2020".
  if (dStipula <= REGIME_A_STIPULA_LIMITE) {
    warnings.push(
      "Regime ante-luglio 2020. Il D.Lgs. 148/2026 non disciplina " +
        "espressamente questa fattispecie: la maggiorazione del 50% per " +
        "anzianità NON viene applicata per default. Verifica manuale."
    );
    return {
      regime: "A",
      motivazioneRegime:
        `Contratto stipulato il ${dStipula}${origineDate}, entro il ` +
        `30/06/2020: si applica il regime "ante 2020" (forfait 30%).`,
      dOrdine,
      dStipula,
      dConsegna,
      warnings,
      errors,
    };
  }

  // REGIME_B — finestra "storica" (consegna tra 01/07/2020 e 31/12/2024).
  if (
    dConsegna >= REGIME_B_CONSEGNA_INIZIO &&
    dConsegna <= REGIME_B_CONSEGNA_FINE_STORICO
  ) {
    return {
      regime: "B",
      motivazioneRegime:
        `Veicolo consegnato il ${dConsegna}${origineDate}, tra il ` +
        `01/07/2020 e il 31/12/2024: si applica il regime "CO2" (art. 51 ` +
        `c.4 lett. a) TUIR, testo vigente al 31/12/2024, L. 160/2019).`,
      dOrdine,
      dStipula,
      dConsegna,
      warnings,
      errors,
    };
  }

  // REGIME_B — salvaguardia (ordine <= 31/12/2024, consegna nel 2025,
  // termine esteso al 31/12/2025 dal D.Lgs. 148/2026).
  if (
    dOrdine !== null &&
    dOrdine <= REGIME_B_SALVAGUARDIA_ORDINE_LIMITE &&
    dConsegna >= REGIME_B_SALVAGUARDIA_CONSEGNA_INIZIO &&
    dConsegna <= REGIME_B_SALVAGUARDIA_CONSEGNA_FINE
  ) {
    return {
      regime: "B",
      motivazioneRegime:
        `Ordine al fornitore entro il 31/12/2024 (${dOrdine})${origineDate} ` +
        `e consegna entro il 31/12/2025 (${dConsegna}): salvaguardia del ` +
        `regime "CO2" (art. 1 c. 48-bis L. 207/2024, come sostituito ` +
        `dall'art. 2 c. 2 D.Lgs. 148/2026, che estende il termine di ` +
        `consegna dal 30/06/2025 al 31/12/2025).`,
      dOrdine,
      dStipula,
      dConsegna,
      warnings,
      errors,
    };
  }

  // REGIME_C — "alimentazione" (default).
  // Caso di confine: consegna dal 01/01/2026 con stipula entro il
  // 31/12/2025. La circ. 10/E/2025 richiedeva che immatricolazione,
  // stipula e consegna ricadessero tutte nel 2025: il disallineamento
  // rileva quindi anche per le stipule del 2025, non solo per quelle
  // fino al 31/12/2024.
  if (
    dConsegna >= REGIME_C_CONFINE_CONSEGNA_INIZIO &&
    dStipula <= REGIME_C_CONFINE_STIPULA_LIMITE
  ) {
    if (flags.applicaForfaitACasiConfine) {
      warnings.push(
        "Caso di confine. Prima del D.Lgs. 148/2026 questa fattispecie " +
          "ricadeva nel criterio del valore normale (risposta AdE " +
          "192/2025). La soppressione nel primo periodo del richiamo ai " +
          "veicoli di nuova immatricolazione e ai contratti stipulati dal " +
          "1° gennaio 2025 porta ad applicare il forfait, ma manca prassi " +
          "confermativa. Verifica manuale."
      );
    } else {
      errors.push(
        `Caso di confine (stipula ${dStipula}, consegna ${dConsegna}) con ` +
          "APPLICA_FORFAIT_A_CASI_CONFINE = false: il forfait non è " +
          "ritenuto applicabile e il valore va determinato secondo il " +
          "criterio del valore normale (risposta AdE 192/2025), fuori " +
          "dallo scopo di questo strumento. Calcolo bloccato."
      );
    }
  }
  return {
    regime: "C",
    motivazioneRegime:
      `Nessuna delle finestre transitorie del regime "CO2" ricorre ` +
      `(stipula ${dStipula}, ordine ${dOrdine ?? "assente"}, consegna ` +
      `${dConsegna})${origineDate}: si applica il regime "alimentazione" ` +
      `(art. 51 c.4 lett. a) TUIR come modificato da L. 207/2024 e ` +
      `confermato da D.Lgs. 148/2026).`,
    dOrdine,
    dStipula,
    dConsegna,
    warnings,
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Risultato "vuoto" per i casi bloccanti — stessa forma dell'output
// completo, con i campi di calcolo a null.
// ─────────────────────────────────────────────────────────────────────────

function emptyResult(overrides, warnings, errors) {
  return {
    regime: null,
    motivazioneRegime: null,
    coefficiente: null,
    motivazioneCoefficiente: null,
    breakdown: [],
    fonteValoreBase: null,
    notaFonteValore: null,
    giorni: null,
    mesiCompetenza: null,
    fringeBenefitAnnuoIntero: null,
    fringeBenefitPeriodo: null,
    fringeBenefitMensilePeriodo: null,
    maggiorazione50Applicata: false,
    maggiorazione5Applicata: false,
    annoDecorrenzaMaggiorazione50: null,
    eccedenzaNonDeducibile: null,
    soglia: null,
    totaleBenefit: null,
    superaSoglia: null,
    imponibileDopoSoglia: null,
    qualifica: null,
    warnings,
    errors,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Funzione principale
// ─────────────────────────────────────────────────────────────────────────

export function computeFringeBenefit(input, opzioni) {
  const flags = risolviOpzioni(opzioni);

  const validazioneInput = validateInput(input);
  if (validazioneInput.errors.length > 0) {
    return emptyResult({}, validazioneInput.warnings, validazioneInput.errors);
  }

  const regimeResult = resolveRegime(input, flags);
  const warnings = [...validazioneInput.warnings, ...regimeResult.warnings];
  const errors = [...regimeResult.errors];

  const fonteValoreBase = input.fonteValoreBase;
  const notaFonteValore = input.notaFonteValore ?? null;

  // Il valore base non verificato sulle tabelle ACI va segnalato sempre:
  // resta a carico del professionista la documentazione del veicolo di
  // riferimento.
  if (fonteValoreBase !== "ACI") {
    warnings.push(
      "Valore base inserito manualmente e non verificato sulle tabelle " +
        `ACI. Motivazione indicata: ${notaFonteValore}. Conservare la ` +
        "documentazione del veicolo di riferimento."
    );
  }

  // Errore bloccante emerso in fase di selezione del regime (es. caso di
  // confine con APPLICA_FORFAIT_A_CASI_CONFINE = false).
  if (errors.length > 0) {
    return emptyResult(
      {
        regime: regimeResult.regime,
        motivazioneRegime: regimeResult.motivazioneRegime,
        fonteValoreBase,
        notaFonteValore,
      },
      warnings,
      errors
    );
  }

  // PASSO 0 — REGIME_E: nessun fringe benefit auto.
  if (regimeResult.regime === "E") {
    // Il PASSO 8 (soglia di esenzione) viene eseguito anche qui, sui soli
    // altriFringeBenefitAnno: interpretazione confermata dal committente
    // — il limite si misura sul totale dei fringe benefit dell'anno, non
    // sul solo veicolo, quindi va verificato anche quando il fringe
    // benefit auto è zero.
    const soglieAnno = SOGLIE_ESENZIONE[input.annoImposta];
    if (!soglieAnno) {
      errors.push(
        `Soglie di esenzione non definite per l'anno d'imposta ${input.annoImposta}.`
      );
    }
    const soglia = soglieAnno
      ? input.figliFiscalmenteACarico
        ? soglieAnno.conFigli
        : soglieAnno.base
      : null;
    const totaleBenefit = 0 + input.altriFringeBenefitAnno;
    const superaSoglia = soglia !== null ? totaleBenefit > soglia : null;
    const imponibileDopoSoglia = superaSoglia ? totaleBenefit : 0;

    return emptyResult(
      {
        regime: "E",
        motivazioneRegime: regimeResult.motivazioneRegime,
        breakdown: [],
        fonteValoreBase,
        notaFonteValore,
        giorni: giorniInclusivi(input.dataInizioPeriodo, input.dataFinePeriodo),
        mesiCompetenza: mesiCalendarioIntersecati(
          input.dataInizioPeriodo,
          input.dataFinePeriodo
        ),
        fringeBenefitAnnuoIntero: 0,
        fringeBenefitPeriodo: 0,
        fringeBenefitMensilePeriodo: 0,
        maggiorazione50Applicata: false,
        maggiorazione5Applicata: false,
        annoDecorrenzaMaggiorazione50: null,
        eccedenzaNonDeducibile: 0,
        soglia,
        totaleBenefit: round2(totaleBenefit),
        superaSoglia,
        imponibileDopoSoglia: round2(imponibileDopoSoglia),
        qualifica: input.qualifica,
      },
      warnings,
      errors
    );
  }

  // PASSO 3 — coefficiente di regime. La selezione del regime e del
  // coefficiente resta sempre del motore: non è mai inseribile a mano,
  // nemmeno quando il valore base è manuale.
  let coefficiente;
  let motivazioneCoefficiente;

  if (regimeResult.regime === "A") {
    coefficiente = COEFFICIENTE_ANTE_2020;
    motivazioneCoefficiente =
      `Regime ante 2020: forfait unico ${formatPercent(COEFFICIENTE_ANTE_2020)}, ` +
      "indipendente da alimentazione e CO2.";
  } else if (regimeResult.regime === "B") {
    if (input.co2 === null || input.co2 === undefined) {
      errors.push(
        "CO2 mancante: obbligatoria per il regime CO2 (REGIME_B). " +
          "Calcolo bloccato."
      );
      return emptyResult(
        {
          regime: "B",
          motivazioneRegime: regimeResult.motivazioneRegime,
          fonteValoreBase,
          notaFonteValore,
        },
        warnings,
        errors
      );
    }
    const fascia = FASCE_CO2.find((f) => input.co2 <= f.max);
    coefficiente = fascia.coeff;
    motivazioneCoefficiente = `CO2 ${input.co2} g/km: coefficiente ${formatPercent(coefficiente)} (art. 51 c.4 lett. a) TUIR, testo vigente al 31/12/2024).`;
  } else {
    // REGIME_C
    coefficiente = COEFFICIENTI_ALIMENTAZIONE[input.alimentazione];
    motivazioneCoefficiente = `Alimentazione ${input.alimentazione}: coefficiente ${formatPercent(coefficiente)}.`;
  }

  const breakdown = [];

  // PASSO 2 — base convenzionale, due rami secondo la fonte del valore.
  let base;
  if (fonteValoreBase === "VALORE_CONVENZIONALE_MANUALE") {
    // Il valore indicato è GIÀ il valore convenzionale annuo: il passo si
    // salta e la percorrenza convenzionale non viene applicata.
    base = input.valoreConvenzionaleAnnuo;
    breakdown.push({
      passo: 2,
      descrizione:
        "Valore convenzionale annuo inserito manualmente — passo saltato: la percorrenza convenzionale NON viene applicata",
      operazione: `valore convenzionale annuo indicato dall'utente: ${input.valoreConvenzionaleAnnuo} € (nessuna moltiplicazione per la percorrenza convenzionale)`,
      fonte: fonteValoreBase,
      valoreDopo: round2(base),
    });
  } else {
    base = input.costoKm * PERCORRENZA_CONVENZIONALE;
    breakdown.push({
      passo: 2,
      descrizione: "Base convenzionale (percorrenza convenzionale)",
      operazione: `${input.costoKm} €/km × ${PERCORRENZA_CONVENZIONALE} km`,
      fonte: fonteValoreBase,
      valoreDopo: round2(base),
    });
  }

  // PASSO 3 — applicazione del coefficiente di regime.
  let valore = base * coefficiente;
  breakdown.push({
    passo: 3,
    descrizione: `Coefficiente di regime (${regimeResult.regime})`,
    operazione: `${round2(base)} × ${formatPercent(coefficiente)}`,
    valoreDopo: round2(valore),
  });

  // PASSO 4 — maggiorazione 50% per anzianità.
  const annoImmatricolazione = annoDi(input.dataPrimaImmatricolazione);
  const annoSoglia = annoImmatricolazione + ANNI_SOGLIA_ANZIANITA;
  const annoDecorrenzaMaggiorazione50 = `${annoSoglia + 1}-01-01`;
  let maggiorazione50Applicata = false;
  const applicaAnzianitaARegime =
    regimeResult.regime !== "A" || flags.applicaAnzianitaARegimeA;
  if (applicaAnzianitaARegime && input.annoImposta > annoSoglia) {
    valore = valore * MAGGIORAZIONE_ANZIANITA;
    maggiorazione50Applicata = true;
  }
  breakdown.push({
    passo: 4,
    descrizione: "Maggiorazione 50% per anzianità (>5° anno da prima immatricolazione)",
    operazione: maggiorazione50Applicata
      ? `valore × ${MAGGIORAZIONE_ANZIANITA} (anno imposta ${input.annoImposta} > soglia ${annoSoglia})`
      : `nessuna maggiorazione (anno imposta ${input.annoImposta} <= soglia ${annoSoglia})`,
    valoreDopo: round2(valore),
  });

  // PASSO 5 — maggiorazione 5% per accessori/allestimenti extra-ACI
  // acquistati dall'azienda. Si applica DOPO il +50%, mai prima.
  // Non si applica al REGIME_A (flag APPLICA_ACCESSORI_A_REGIME_A),
  // speculare alla maggiorazione per anzianità: il quarto periodo
  // dell'art. 51 c.4 lett. a) TUIR incrementa "il valore determinato a
  // norma dei periodi primo, secondo e terzo", che non disciplinano il
  // regime "ante 2020".
  let maggiorazione5Applicata = false;
  const applicaAccessoriARegime =
    regimeResult.regime !== "A" || flags.applicaAccessoriARegimeA;
  if (
    applicaAccessoriARegime &&
    input.accessoriNonAci === "ACQUISTATI_DALL_AZIENDA" &&
    input.annoImposta >= ANNO_DECORRENZA_MAGG_ACCESSORI
  ) {
    valore = valore * MAGGIORAZIONE_ACCESSORI;
    maggiorazione5Applicata = true;
  }
  breakdown.push({
    passo: 5,
    descrizione: "Maggiorazione 5% per accessori/allestimenti extra-ACI acquistati dall'azienda",
    operazione: maggiorazione5Applicata
      ? `valore × ${MAGGIORAZIONE_ACCESSORI}`
      : !applicaAccessoriARegime
        ? `nessuna maggiorazione (non applicabile al regime ${regimeResult.regime})`
        : `nessuna maggiorazione (accessoriNonAci = ${input.accessoriNonAci})`,
    valoreDopo: round2(valore),
  });

  // Valore convenzionale su base annua piena (365 giorni), prima del
  // ragguaglio ai giorni e prima delle trattenute: è il dato di
  // riferimento per confrontare veicoli e per stimare l'effetto delle
  // maggiorazioni.
  const fringeBenefitAnnuoIntero = valore;

  // PASSO 6 — ragguaglio ai giorni di effettiva assegnazione nell'anno.
  const giorni = giorniInclusivi(input.dataInizioPeriodo, input.dataFinePeriodo);
  valore = (valore * giorni) / GIORNI_ANNO;
  breakdown.push({
    passo: 6,
    descrizione: "Ragguaglio ai giorni di effettiva assegnazione",
    operazione: `valore × ${giorni} / ${GIORNI_ANNO}`,
    valoreDopo: round2(valore),
  });

  // PASSO 7 — somme trattenute al dipendente. La riduzione è ammessa
  // esclusivamente per le somme richieste quale corrispettivo per l'uso
  // personale, determinate sul valore convenzionale (risposta AdE
  // n. 14/2026): sommeTrattenute è già l'importo rilevante a tal fine
  // (incluse le somme relative ad accessori e allestimenti, D.Lgs.
  // 148/2026).
  const trattenutaDeducibile = Math.min(input.sommeTrattenute, valore);
  const eccedenzaNonDeducibile = Math.max(0, input.sommeTrattenute - valore);
  valore = valore - trattenutaDeducibile; // mai negativo
  breakdown.push({
    passo: 7,
    descrizione: "Somme trattenute al dipendente per l'uso personale",
    operazione: `valore - min(${input.sommeTrattenute}, valore)`,
    valoreDopo: round2(valore),
  });

  if (eccedenzaNonDeducibile > 0) {
    warnings.push(
      `Trattenute eccedenti il valore convenzionale per € ${round2(eccedenzaNonDeducibile)}. ` +
        "Non riducono il fringe benefit e vanno valutate separatamente " +
        "(risposta AdE 14/2026)."
    );
  }

  // Valore effettivo del periodo e sua ripartizione mensile. Il mensile è
  // calcolato sui mesi di calendario intersecati dal periodo, NON
  // dividendo per 12: dividere per 12 un periodo parziale produrrebbe un
  // importo privo di significato per la busta paga.
  const fringeBenefitPeriodo = valore;
  const mesiCompetenza = mesiCalendarioIntersecati(
    input.dataInizioPeriodo,
    input.dataFinePeriodo
  );
  const fringeBenefitMensilePeriodo = fringeBenefitPeriodo / mesiCompetenza;

  // PASSO 8 — verifica soglia di esenzione (limite, non franchigia).
  const soglieAnno = SOGLIE_ESENZIONE[input.annoImposta];
  if (!soglieAnno) {
    errors.push(
      `Soglie di esenzione non definite per l'anno d'imposta ${input.annoImposta}.`
    );
  }
  const soglia = soglieAnno
    ? input.figliFiscalmenteACarico
      ? soglieAnno.conFigli
      : soglieAnno.base
    : null;
  const totaleBenefit = fringeBenefitPeriodo + input.altriFringeBenefitAnno;
  const superaSoglia = soglia !== null ? totaleBenefit > soglia : null;
  const imponibileDopoSoglia = superaSoglia ? totaleBenefit : 0;

  return {
    regime: regimeResult.regime,
    motivazioneRegime: regimeResult.motivazioneRegime,
    coefficiente,
    motivazioneCoefficiente,
    breakdown,
    fonteValoreBase,
    notaFonteValore,
    giorni,
    mesiCompetenza,
    fringeBenefitAnnuoIntero: round2(fringeBenefitAnnuoIntero),
    fringeBenefitPeriodo: round2(fringeBenefitPeriodo),
    fringeBenefitMensilePeriodo: round2(fringeBenefitMensilePeriodo),
    maggiorazione50Applicata,
    maggiorazione5Applicata,
    annoDecorrenzaMaggiorazione50,
    eccedenzaNonDeducibile: round2(eccedenzaNonDeducibile),
    soglia,
    totaleBenefit: round2(totaleBenefit),
    superaSoglia,
    imponibileDopoSoglia: round2(imponibileDopoSoglia),
    qualifica: input.qualifica,
    warnings,
    errors,
  };
}
