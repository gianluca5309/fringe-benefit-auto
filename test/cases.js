// cases.js — unica fonte dei casi di test per il motore di calcolo del
// fringe benefit auto. Importato sia da run-tests.js (Node) sia da
// engine.test.html (browser): nessun caso va definito altrove, per
// evitare che le due suite divergano silenziosamente (come già accaduto
// quando la versione browser non era mai stata eseguita davvero).
//
// Ogni caso espone run(): () => { pass, atteso, ottenuto, instances }.
// - pass: esito delle asserzioni specifiche del caso (regime, coefficiente,
//   valori, breakdown...).
// - instances: uno o più { result, attendeErrore, warningsAttesi } — un
//   caso può eseguire più chiamate a computeFringeBenefit (es. confini CO2,
//   confronto tra due valori di un flag).
//
// L'ASSERZIONE AUTOMATICA (valutaIstanza) è definita UNA SOLA VOLTA qui e
// applicata a ogni instance da entrambi i runner:
//   - se !attendeErrore: result.errors deve essere vuoto;
//   - se attendeErrore: result.errors deve essere non vuoto;
//   - in ogni caso: result.warnings deve coincidere esattamente (come
//     multi-insieme, via sottostringa) con warningsAttesi — nessun warning
//     mancante, nessuno spurio.
// Senza questo controllo un test può risultare verde pur avendo il motore
// emesso un errore bloccante o un warning inatteso: è esattamente il
// difetto già trovato su T8/T9/T11/T12 (errors) e il rischio equivalente,
// mai controllato finora, sui warnings.

import { computeFringeBenefit } from "../js/engine.js";

// ─────────────────────────────────────────────────────────────────────────
// Input di base con valori neutri, usato come punto di partenza per ogni
// test tramite override dei soli campi rilevanti.
//
// Valori neutri usati quando il caso di test non specifica un dato:
//   - targa/aciRowId: placeholder; aciRowId è però obbligatorio con
//     fonteValoreBase = "ACI".
//   - fonteValoreBase "ACI" con valoreConvenzionaleAnnuo e notaFonteValore
//     a null: modalità standard, da tabella ACI.
//   - alimentazione/costoKm di default: ICE / 0,50 (sovrascritti quando
//     il test indica un'alimentazione o un costoKm specifico).
//   - co2: null di default, valorizzata a 145 g/km (fascia 30%) nei casi
//     che ricadono nel REGIME_B: lì la CO2 è un dato obbligatorio, quindi
//     null non è un valore neutro ammissibile.
//   - dataPrimaImmatricolazione default "2025-01-01": deve restare
//     coerente con dataConsegnaAlDipendente (la consegna non può essere
//     anteriore all'immatricolazione, controllo bloccante) — nei test con
//     una consegna in un anno anteriore al 2025 il valore viene
//     esplicitamente anticipato.
//   - dataStipulaContratto default "2026-01-15" e dataConsegnaAlDipendente
//     default "2026-02-01": cadono nel regime C di default (non in nessuna
//     finestra transitoria), per non alterare il regime nei test che non
//     lo mettono alla prova.
//   - dataOrdineDatore: null di default (non sempre presente in pratica).
//   - tipoAtto: PRIMA_ASSEGNAZIONE di default.
//   - annoImposta 2026 con periodo coincidente con l'intero anno (365 gg).
//   - accessoriNonAci: ASSENTI, sommeTrattenute/altriFringeBenefitAnno: 0,
//     figliFiscalmenteACarico: false, qualifica: DIPENDENTE,
//     usoEsclusivamenteAziendale: false.
// ─────────────────────────────────────────────────────────────────────────
function baseInput(overrides = {}) {
  return {
    targa: "AA000AA",
    aciRowId: "esempio-1",
    fonteValoreBase: "ACI",
    costoKm: 0.5,
    valoreConvenzionaleAnnuo: null,
    notaFonteValore: null,
    alimentazione: "ICE",
    co2: null,
    dataPrimaImmatricolazione: "2025-01-01",
    dataOrdineDatore: null,
    dataStipulaContratto: "2026-01-15",
    dataConsegnaAlDipendente: "2026-02-01",
    tipoAtto: "PRIMA_ASSEGNAZIONE",
    contrattoOriginario: null,
    annoImposta: 2026,
    dataInizioPeriodo: "2026-01-01",
    dataFinePeriodo: "2026-12-31",
    accessoriNonAci: "ASSENTI",
    sommeTrattenute: 0,
    altriFringeBenefitAnno: 0,
    figliFiscalmenteACarico: false,
    qualifica: "DIPENDENTE",
    usoEsclusivamenteAziendale: false,
    ...overrides,
  };
}

// Costruisce una singola instance per la valutazione generica.
function istanza(result, opzioni = {}) {
  return {
    result,
    attendeErrore: opzioni.attendeErrore === true,
    warningsAttesi: opzioni.warningsAttesi ?? [],
  };
}

// Valuta una singola instance secondo il contratto descritto in testa al
// file. Restituisce un array di stringhe con i problemi trovati (vuoto se
// tutto ok).
function valutaIstanza({ result, attendeErrore, warningsAttesi }) {
  const problemi = [];
  const erroriAttuali = result?.errors ?? [];

  if (attendeErrore) {
    if (erroriAttuali.length === 0) {
      problemi.push(`atteso errors non vuoto, ottenuto errors=[]`);
    }
  } else if (erroriAttuali.length > 0) {
    problemi.push(
      `ASSERZIONE AUTOMATICA ERRORS FALLITA — atteso errors vuoto, ottenuto errors=${JSON.stringify(erroriAttuali)}`
    );
  }

  const warningsAttuali = result?.warnings ?? [];
  const rimanenti = [...warningsAttuali];
  const mancanti = [];
  for (const pattern of warningsAttesi) {
    const idx = rimanenti.findIndex((w) => w.includes(pattern));
    if (idx === -1) {
      mancanti.push(pattern);
    } else {
      rimanenti.splice(idx, 1);
    }
  }
  if (mancanti.length > 0 || rimanenti.length > 0) {
    problemi.push(
      `ASSERZIONE AUTOMATICA WARNINGS FALLITA — attesi=${JSON.stringify(warningsAttesi)}, ottenuti=${JSON.stringify(warningsAttuali)}` +
        (mancanti.length ? ` | mancanti=${JSON.stringify(mancanti)}` : "") +
        (rimanenti.length ? ` | spuri=${JSON.stringify(rimanenti)}` : "")
    );
  }

  return problemi;
}

// Esegue un caso e applica l'asserzione automatica a tutte le sue
// instance. Unico punto usato da entrambi i runner.
export function valutaCaso(caso) {
  const esito = caso.run();
  let problemi = [];
  for (const ist of esito.instances ?? []) {
    problemi = problemi.concat(valutaIstanza(ist));
  }
  return {
    id: caso.id,
    descrizione: caso.descrizione,
    pass: esito.pass && problemi.length === 0,
    atteso: esito.atteso,
    ottenuto: esito.ottenuto,
    problemi,
  };
}

export const casi = [];
function test(id, descrizione, run) {
  casi.push({ id, descrizione, run });
}

// ─────────────────────────────────────────────────────────────────────────
// T1
test("T1", "REGIME_C, BEV, coeff 10%, atteso 675,00", () => {
  const r = computeFringeBenefit(
    baseInput({
      costoKm: 0.45,
      alimentazione: "BEV",
      dataPrimaImmatricolazione: "2024-03-15",
      dataOrdineDatore: "2025-01-10",
      dataStipulaContratto: "2025-11-10",
      dataConsegnaAlDipendente: "2025-12-01",
    })
  );
  const pass = r.regime === "C" && r.coefficiente === 0.1 && r.fringeBenefitPeriodo === 675.0;
  return {
    pass,
    instances: [istanza(r)],
    atteso: "regime=C, coefficiente=0.10, fringeBenefitPeriodo=675.00",
    ottenuto: `regime=${r.regime}, coefficiente=${r.coefficiente}, fringeBenefitPeriodo=${r.fringeBenefitPeriodo}`,
  };
});

// T2
test("T2", "REGIME_B, ICE co2 145, coeff 30%, +50% attivo, atteso 4.050,00", () => {
  const r = computeFringeBenefit(
    baseInput({
      costoKm: 0.6,
      alimentazione: "ICE",
      co2: 145,
      dataPrimaImmatricolazione: "2020-09-20",
      dataOrdineDatore: "2024-11-15",
      dataStipulaContratto: "2025-01-20",
      dataConsegnaAlDipendente: "2025-02-05",
    })
  );
  const pass =
    r.regime === "B" &&
    r.coefficiente === 0.3 &&
    r.maggiorazione50Applicata === true &&
    r.fringeBenefitPeriodo === 4050.0;
  return {
    pass,
    instances: [istanza(r)],
    atteso: "regime=B, coefficiente=0.30, maggiorazione50Applicata=true, fringeBenefitPeriodo=4050.00",
    ottenuto: `regime=${r.regime}, coefficiente=${r.coefficiente}, maggiorazione50Applicata=${r.maggiorazione50Applicata}, fringeBenefitPeriodo=${r.fringeBenefitPeriodo}`,
  };
});

// T3
test("T3", "come T2 ma accessori ACQUISTATI_DALL_AZIENDA, atteso 4.252,50", () => {
  const r = computeFringeBenefit(
    baseInput({
      costoKm: 0.6,
      alimentazione: "ICE",
      co2: 145,
      dataPrimaImmatricolazione: "2020-09-20",
      dataOrdineDatore: "2024-11-15",
      dataStipulaContratto: "2025-01-20",
      dataConsegnaAlDipendente: "2025-02-05",
      accessoriNonAci: "ACQUISTATI_DALL_AZIENDA",
    })
  );
  const pass = r.fringeBenefitPeriodo === 4252.5 && r.maggiorazione5Applicata === true;
  return {
    pass,
    instances: [istanza(r)],
    atteso: "fringeBenefitPeriodo=4252.50, maggiorazione5Applicata=true",
    ottenuto: `fringeBenefitPeriodo=${r.fringeBenefitPeriodo}, maggiorazione5Applicata=${r.maggiorazione5Applicata}`,
  };
});

// T4
test("T4", "come T3 ma trattenute 1.000, atteso 3.252,50, eccedenza 0", () => {
  const r = computeFringeBenefit(
    baseInput({
      costoKm: 0.6,
      alimentazione: "ICE",
      co2: 145,
      dataPrimaImmatricolazione: "2020-09-20",
      dataOrdineDatore: "2024-11-15",
      dataStipulaContratto: "2025-01-20",
      dataConsegnaAlDipendente: "2025-02-05",
      accessoriNonAci: "ACQUISTATI_DALL_AZIENDA",
      sommeTrattenute: 1000,
    })
  );
  const pass = r.fringeBenefitPeriodo === 3252.5 && r.eccedenzaNonDeducibile === 0;
  return {
    pass,
    instances: [istanza(r)],
    atteso: "fringeBenefitPeriodo=3252.50, eccedenzaNonDeducibile=0",
    ottenuto: `fringeBenefitPeriodo=${r.fringeBenefitPeriodo}, eccedenzaNonDeducibile=${r.eccedenzaNonDeducibile}`,
  };
});

// T5
test("T5", "come T2 ma accessori ACQUISTATI_DAL_LAVORATORE, atteso 4.050,00, magg5=false", () => {
  const r = computeFringeBenefit(
    baseInput({
      costoKm: 0.6,
      alimentazione: "ICE",
      co2: 145,
      dataPrimaImmatricolazione: "2020-09-20",
      dataOrdineDatore: "2024-11-15",
      dataStipulaContratto: "2025-01-20",
      dataConsegnaAlDipendente: "2025-02-05",
      accessoriNonAci: "ACQUISTATI_DAL_LAVORATORE",
    })
  );
  const pass = r.fringeBenefitPeriodo === 4050.0 && r.maggiorazione5Applicata === false;
  return {
    pass,
    instances: [istanza(r)],
    atteso: "fringeBenefitPeriodo=4050.00, maggiorazione5Applicata=false",
    ottenuto: `fringeBenefitPeriodo=${r.fringeBenefitPeriodo}, maggiorazione5Applicata=${r.maggiorazione5Applicata}`,
  };
});

// T6
test("T6", "REGIME_C, PHEV, 184 gg, coeff 20%, atteso 756,16", () => {
  const r = computeFringeBenefit(
    baseInput({
      costoKm: 0.5,
      alimentazione: "PHEV",
      dataPrimaImmatricolazione: "2025-06-10",
      dataOrdineDatore: null,
      dataStipulaContratto: "2026-01-01",
      dataConsegnaAlDipendente: "2026-07-01",
      dataInizioPeriodo: "2026-07-01",
      dataFinePeriodo: "2026-12-31",
    })
  );
  const pass = r.regime === "C" && r.coefficiente === 0.2 && r.fringeBenefitPeriodo === 756.16;
  return {
    pass,
    instances: [istanza(r)],
    atteso: "regime=C, coefficiente=0.20, fringeBenefitPeriodo=756.16",
    ottenuto: `regime=${r.regime}, coefficiente=${r.coefficiente}, fringeBenefitPeriodo=${r.fringeBenefitPeriodo}`,
  };
});

// T7
test("T7", "ordine 10/02/2025, consegna 01/04/2025 -> regime C (non salvaguardia)", () => {
  const r = computeFringeBenefit(
    baseInput({
      dataOrdineDatore: "2025-02-10",
      dataConsegnaAlDipendente: "2025-04-01",
      dataStipulaContratto: "2025-01-15",
    })
  );
  const pass = r.regime === "C";
  return { pass, instances: [istanza(r)], atteso: "regime=C", ottenuto: `regime=${r.regime}` };
});

// T8 — co2 145 g/km: valore neutro necessario, il caso ricade in REGIME_B.
test("T8", "ordine 15/11/2024, consegna 20/09/2025 -> regime B (estensione al 31/12/2025)", () => {
  const r = computeFringeBenefit(
    baseInput({
      dataOrdineDatore: "2024-11-15",
      dataConsegnaAlDipendente: "2025-09-20",
      dataStipulaContratto: "2025-01-15",
      co2: 145,
    })
  );
  const pass = r.regime === "B";
  return { pass, instances: [istanza(r)], atteso: "regime=B", ottenuto: `regime=${r.regime}` };
});

// T9 — co2 145 g/km e dataPrimaImmatricolazione anticipata: valori neutri
// necessari, il caso ricade in REGIME_B con consegna nel 2023 (il default
// dataPrimaImmatricolazione "2025-01-01" sarebbe successivo alla consegna:
// stesso genere di bug di fixture già trovato su T8/T9/T11/T12 lo scorso
// giro, qui riemerso con il nuovo controllo di coerenza cronologica).
test("T9", "consegna 10/03/2023 -> regime B", () => {
  const r = computeFringeBenefit(
    baseInput({
      dataPrimaImmatricolazione: "2022-01-01",
      dataConsegnaAlDipendente: "2023-03-10",
      dataStipulaContratto: "2023-02-01",
      co2: 145,
    })
  );
  const pass = r.regime === "B";
  return { pass, instances: [istanza(r)], atteso: "regime=B", ottenuto: `regime=${r.regime}` };
});

// T10
test("T10", "stipula 15/05/2020, consegna 01/06/2020, immatr. 2019 -> regime A, coeff 30%, no +50%, warning", () => {
  const r = computeFringeBenefit(
    baseInput({
      dataStipulaContratto: "2020-05-15",
      dataConsegnaAlDipendente: "2020-06-01",
      dataPrimaImmatricolazione: "2019-05-01",
    })
  );
  const pass =
    r.regime === "A" &&
    r.coefficiente === 0.3 &&
    r.maggiorazione50Applicata === false &&
    r.warnings.length > 0;
  return {
    pass,
    instances: [istanza(r, { warningsAttesi: ["Regime ante-luglio 2020"] })],
    atteso: "regime=A, coefficiente=0.30, maggiorazione50Applicata=false, warnings.length>0",
    ottenuto: `regime=${r.regime}, coefficiente=${r.coefficiente}, maggiorazione50Applicata=${r.maggiorazione50Applicata}, warnings.length=${r.warnings.length}`,
  };
});

// T11 (PROROGA) — co2 145 g/km e dataPrimaImmatricolazione anticipata: la
// data di prima immatricolazione è unica per il veicolo e deve precedere
// anche la consegna del contratto ORIGINARIO (2023-03-10), non solo quella
// del contratto in esame.
test("T11", "PROROGA 2026 di contratto originario con consegna 10/03/2023 -> regime B", () => {
  const r = computeFringeBenefit(
    baseInput({
      tipoAtto: "PROROGA",
      co2: 145,
      dataPrimaImmatricolazione: "2022-01-01",
      contrattoOriginario: {
        dataOrdineDatore: null,
        dataStipulaContratto: "2022-06-01",
        dataConsegnaAlDipendente: "2023-03-10",
      },
    })
  );
  const pass = r.regime === "B";
  return { pass, instances: [istanza(r)], atteso: "regime=B", ottenuto: `regime=${r.regime}` };
});

// T12 (RIASSEGNAZIONE) — stessa ragione di T11 per dataPrimaImmatricolazione.
test("T12", "RIASSEGNAZIONE 2026, veicolo consegnato al primo dipendente 01/06/2023 -> regime B", () => {
  const r = computeFringeBenefit(
    baseInput({
      tipoAtto: "RIASSEGNAZIONE",
      co2: 145,
      dataPrimaImmatricolazione: "2022-01-01",
      contrattoOriginario: {
        dataOrdineDatore: null,
        dataStipulaContratto: "2023-05-01",
        dataConsegnaAlDipendente: "2023-06-01",
      },
    })
  );
  const pass = r.regime === "B";
  return { pass, instances: [istanza(r)], atteso: "regime=B", ottenuto: `regime=${r.regime}` };
});

// T13
test("T13", "trattenute 1.500 su valore ~1.000 -> risultato 0,00, eccedenza 500", () => {
  const r = computeFringeBenefit(
    baseInput({
      costoKm: 1000 / 7500, // base*coeff(50%) = 1000
      alimentazione: "ICE",
      sommeTrattenute: 1500,
    })
  );
  const pass = r.fringeBenefitPeriodo === 0 && Math.abs(r.eccedenzaNonDeducibile - 500) < 0.01;
  return {
    pass,
    instances: [istanza(r, { warningsAttesi: ["Trattenute eccedenti"] })],
    atteso: "fringeBenefitPeriodo=0.00, eccedenzaNonDeducibile≈500.00",
    ottenuto: `fringeBenefitPeriodo=${r.fringeBenefitPeriodo}, eccedenzaNonDeducibile=${r.eccedenzaNonDeducibile}`,
  };
});

// T14
test("T14", "soglia: FB auto 1.900 + altri 300, no figli -> supera, imponibile 2.200", () => {
  const r = computeFringeBenefit(
    baseInput({
      costoKm: 1900 / 7500, // base*coeff(50%) = 1900
      alimentazione: "ICE",
      altriFringeBenefitAnno: 300,
      figliFiscalmenteACarico: false,
    })
  );
  const pass = r.superaSoglia === true && r.imponibileDopoSoglia === 2200;
  return {
    pass,
    instances: [istanza(r)],
    atteso: "superaSoglia=true, imponibileDopoSoglia=2200.00",
    ottenuto: `superaSoglia=${r.superaSoglia}, imponibileDopoSoglia=${r.imponibileDopoSoglia}`,
  };
});

// T15
test("T15", "soglia: FB auto 780, altri 0, no figli -> non supera, imponibile 0", () => {
  const r = computeFringeBenefit(
    baseInput({
      costoKm: 0.104, // base*coeff(50%) = 780
      alimentazione: "ICE",
      altriFringeBenefitAnno: 0,
      figliFiscalmenteACarico: false,
    })
  );
  const pass = r.superaSoglia === false && r.imponibileDopoSoglia === 0;
  return {
    pass,
    instances: [istanza(r)],
    atteso: "superaSoglia=false, imponibileDopoSoglia=0.00",
    ottenuto: `superaSoglia=${r.superaSoglia}, imponibileDopoSoglia=${r.imponibileDopoSoglia}`,
  };
});

// T16
test("T16", "confini CO2: 60->25%, 61->30%, 160->30%, 161->50%, 190->50%, 191->60%", () => {
  const casiCo2 = [
    [60, 0.25],
    [61, 0.3],
    [160, 0.3],
    [161, 0.5],
    [190, 0.5],
    [191, 0.6],
  ];
  const dettagli = casiCo2.map(([co2, atteso]) => {
    const r = computeFringeBenefit(
      baseInput({
        costoKm: 0.5,
        alimentazione: "ICE",
        co2,
        dataPrimaImmatricolazione: "2022-01-01",
        dataStipulaContratto: "2023-01-01",
        dataConsegnaAlDipendente: "2023-06-01",
      })
    );
    return {
      co2,
      atteso,
      ottenuto: r.coefficiente,
      regime: r.regime,
      result: r,
      ok: r.regime === "B" && r.coefficiente === atteso,
    };
  });
  const pass = dettagli.every((d) => d.ok);
  return {
    pass,
    instances: dettagli.map((d) => istanza(d.result)),
    atteso: casiCo2.map(([co2, c]) => `co2=${co2}->${c}`).join(", "),
    ottenuto: dettagli.map((d) => `co2=${d.co2}->${d.ottenuto}(${d.regime})`).join(", "),
  };
});

// T17
test("T17", "confini anzianità: immatr. 2021, anno 2026 no +50%; anno 2027 +50%", () => {
  const r2026 = computeFringeBenefit(
    baseInput({
      dataPrimaImmatricolazione: "2021-06-01",
      annoImposta: 2026,
      dataInizioPeriodo: "2026-01-01",
      dataFinePeriodo: "2026-12-31",
    })
  );
  const r2027 = computeFringeBenefit(
    baseInput({
      dataPrimaImmatricolazione: "2021-06-01",
      annoImposta: 2027,
      dataInizioPeriodo: "2027-01-01",
      dataFinePeriodo: "2027-12-31",
    })
  );
  const pass = r2026.maggiorazione50Applicata === false && r2027.maggiorazione50Applicata === true;
  return {
    pass,
    instances: [istanza(r2026), istanza(r2027)],
    atteso: "anno2026: maggiorazione50Applicata=false; anno2027: maggiorazione50Applicata=true",
    ottenuto: `anno2026: ${r2026.maggiorazione50Applicata}; anno2027: ${r2027.maggiorazione50Applicata}`,
  };
});

// T18 — dataPrimaImmatricolazione anticipata: stesso motivo di T9 (senza
// questa correzione la consegna 2023-06-01 sarebbe anteriore al default
// 2025-01-01, mascherando con un errore cronologico l'errore di CO2
// mancante che il test vuole effettivamente verificare).
test(
  "T18",
  "REGIME_B senza co2 -> errore bloccante, nessun calcolo",
  () => {
    const r = computeFringeBenefit(
      baseInput({
        alimentazione: "ICE",
        co2: null,
        dataPrimaImmatricolazione: "2022-01-01",
        dataStipulaContratto: "2023-01-01",
        dataConsegnaAlDipendente: "2023-06-01",
      })
    );
    const pass = r.errors.length > 0 && r.fringeBenefitPeriodo === null;
    return {
      pass,
      instances: [istanza(r, { attendeErrore: true })],
      atteso: "errors.length>0, fringeBenefitPeriodo=null",
      ottenuto: `errors.length=${r.errors.length}, fringeBenefitPeriodo=${r.fringeBenefitPeriodo}`,
    };
  }
);

// T19
test("T19", "usoEsclusivamenteAziendale true -> risultato 0, regime E", () => {
  const r = computeFringeBenefit(baseInput({ usoEsclusivamenteAziendale: true }));
  const pass = r.regime === "E" && r.fringeBenefitPeriodo === 0;
  return {
    pass,
    instances: [istanza(r)],
    atteso: "regime=E, fringeBenefitPeriodo=0",
    ottenuto: `regime=${r.regime}, fringeBenefitPeriodo=${r.fringeBenefitPeriodo}`,
  };
});

// T20
test("T20", "stipula 27/12/2024, consegna 15/03/2026 -> regime C con warning caso di confine", () => {
  const r = computeFringeBenefit(
    baseInput({
      dataStipulaContratto: "2024-12-27",
      dataConsegnaAlDipendente: "2026-03-15",
      dataOrdineDatore: null,
    })
  );
  const confine = r.warnings.some((w) => w.toLowerCase().includes("confine"));
  const pass = r.regime === "C" && confine;
  return {
    pass,
    instances: [istanza(r, { warningsAttesi: ["Caso di confine"] })],
    atteso: "regime=C, warning caso di confine presente",
    ottenuto: `regime=${r.regime}, warning confine presente=${confine}`,
  };
});

// T21
test("T21", "REGIME_A con accessori ACQUISTATI_DALL_AZIENDA -> nessun +5%", () => {
  const r = computeFringeBenefit(
    baseInput({
      dataStipulaContratto: "2020-05-15",
      dataConsegnaAlDipendente: "2020-06-01",
      dataPrimaImmatricolazione: "2019-05-01",
      accessoriNonAci: "ACQUISTATI_DALL_AZIENDA",
    })
  );
  // costoKm 0,50 × 15.000 × 30% = 2.250,00, senza alcuna maggiorazione.
  const pass =
    r.regime === "A" && r.maggiorazione5Applicata === false && r.fringeBenefitPeriodo === 2250;
  return {
    pass,
    instances: [istanza(r, { warningsAttesi: ["Regime ante-luglio 2020"] })],
    atteso: "regime=A, maggiorazione5Applicata=false, fringeBenefitPeriodo=2250.00",
    ottenuto: `regime=${r.regime}, maggiorazione5Applicata=${r.maggiorazione5Applicata}, fringeBenefitPeriodo=${r.fringeBenefitPeriodo}`,
  };
});

// T22
test("T22", "caso T6 (01/07–31/12): 6 mesi di competenza, mensile ≈ 126,03 (non 63,01)", () => {
  const r = computeFringeBenefit(
    baseInput({
      costoKm: 0.5,
      alimentazione: "PHEV",
      dataPrimaImmatricolazione: "2025-06-10",
      dataOrdineDatore: null,
      dataStipulaContratto: "2026-01-01",
      dataConsegnaAlDipendente: "2026-07-01",
      dataInizioPeriodo: "2026-07-01",
      dataFinePeriodo: "2026-12-31",
    })
  );
  const pass =
    r.giorni === 184 &&
    r.mesiCompetenza === 6 &&
    r.fringeBenefitAnnuoIntero === 1500 &&
    r.fringeBenefitMensilePeriodo === 126.03;
  return {
    pass,
    instances: [istanza(r)],
    atteso:
      "giorni=184, mesiCompetenza=6, fringeBenefitAnnuoIntero=1500.00, fringeBenefitMensilePeriodo=126.03",
    ottenuto: `giorni=${r.giorni}, mesiCompetenza=${r.mesiCompetenza}, fringeBenefitAnnuoIntero=${r.fringeBenefitAnnuoIntero}, fringeBenefitMensilePeriodo=${r.fringeBenefitMensilePeriodo}`,
  };
});

// T23
test(
  "T23",
  "dataFinePeriodo anteriore a dataInizioPeriodo -> errore bloccante",
  () => {
    const r = computeFringeBenefit(
      baseInput({
        dataInizioPeriodo: "2026-06-01",
        dataFinePeriodo: "2026-03-01",
      })
    );
    const pass = r.errors.length > 0 && r.fringeBenefitPeriodo === null;
    return {
      pass,
      instances: [istanza(r, { attendeErrore: true })],
      atteso: "errors.length>0, fringeBenefitPeriodo=null",
      ottenuto: `errors.length=${r.errors.length}, fringeBenefitPeriodo=${r.fringeBenefitPeriodo}, errors=${JSON.stringify(r.errors)}`,
    };
  }
);

// T24
test(
  "T24",
  "periodo fuori dall'anno d'imposta (2025 con annoImposta 2026) -> errore bloccante",
  () => {
    const r = computeFringeBenefit(
      baseInput({
        annoImposta: 2026,
        dataStipulaContratto: "2025-01-15",
        dataConsegnaAlDipendente: "2025-02-01",
        dataInizioPeriodo: "2025-01-01",
        dataFinePeriodo: "2025-12-31",
      })
    );
    const pass = r.errors.length > 0 && r.fringeBenefitPeriodo === null;
    return {
      pass,
      instances: [istanza(r, { attendeErrore: true })],
      atteso: "errors.length>0, fringeBenefitPeriodo=null",
      ottenuto: `errors.length=${r.errors.length}, fringeBenefitPeriodo=${r.fringeBenefitPeriodo}, errors=${JSON.stringify(r.errors)}`,
    };
  }
);

// T25
test("T25", "stipula 01/06/2025, consegna 01/02/2026 -> regime C con warning caso di confine", () => {
  const r = computeFringeBenefit(
    baseInput({
      dataStipulaContratto: "2025-06-01",
      dataConsegnaAlDipendente: "2026-02-01",
      dataOrdineDatore: null,
    })
  );
  const confine = r.warnings.some((w) => w.toLowerCase().includes("confine"));
  const pass = r.regime === "C" && confine;
  return {
    pass,
    instances: [istanza(r, { warningsAttesi: ["Caso di confine"] })],
    atteso: "regime=C, warning caso di confine presente",
    ottenuto: `regime=${r.regime}, warning confine presente=${confine}`,
  };
});

// T26
test("T26", "mesi di competenza a cavallo di mese: 20/01–10/02 -> 22 giorni, 2 mesi", () => {
  const r = computeFringeBenefit(
    baseInput({
      dataInizioPeriodo: "2026-01-20",
      dataFinePeriodo: "2026-02-10",
    })
  );
  const pass = r.giorni === 22 && r.mesiCompetenza === 2;
  return {
    pass,
    instances: [istanza(r)],
    atteso: "giorni=22, mesiCompetenza=2",
    ottenuto: `giorni=${r.giorni}, mesiCompetenza=${r.mesiCompetenza}`,
  };
});

// T27
test("T27", "il +50% colpisce anche gli elettrici: BEV immatr. 2019 -> 1.350,00", () => {
  const r = computeFringeBenefit(
    baseInput({
      costoKm: 0.6,
      alimentazione: "BEV",
      dataPrimaImmatricolazione: "2019-04-01",
    })
  );
  const pass =
    r.regime === "C" &&
    r.coefficiente === 0.1 &&
    r.maggiorazione50Applicata === true &&
    r.fringeBenefitPeriodo === 1350.0;
  return {
    pass,
    instances: [istanza(r)],
    atteso: "regime=C, coefficiente=0.10, maggiorazione50Applicata=true, fringeBenefitPeriodo=1350.00",
    ottenuto: `regime=${r.regime}, coefficiente=${r.coefficiente}, maggiorazione50Applicata=${r.maggiorazione50Applicata}, fringeBenefitPeriodo=${r.fringeBenefitPeriodo}`,
  };
});

// T28
test("T28", "cumulo +50% e +5% in regime C: ICE immatr. 2019 con accessori azienda -> 7.087,50", () => {
  const r = computeFringeBenefit(
    baseInput({
      costoKm: 0.6,
      alimentazione: "ICE",
      dataPrimaImmatricolazione: "2019-04-01",
      accessoriNonAci: "ACQUISTATI_DALL_AZIENDA",
    })
  );
  const pass =
    r.maggiorazione50Applicata === true &&
    r.maggiorazione5Applicata === true &&
    r.fringeBenefitPeriodo === 7087.5;
  return {
    pass,
    instances: [istanza(r)],
    atteso: "maggiorazione50Applicata=true, maggiorazione5Applicata=true, fringeBenefitPeriodo=7087.50",
    ottenuto: `maggiorazione50Applicata=${r.maggiorazione50Applicata}, maggiorazione5Applicata=${r.maggiorazione5Applicata}, fringeBenefitPeriodo=${r.fringeBenefitPeriodo}`,
  };
});

// T29
test("T29", "COSTO_KM_MANUALE 0,60 €/km -> 4.500,00 con warning valore manuale", () => {
  const r = computeFringeBenefit(
    baseInput({
      fonteValoreBase: "COSTO_KM_MANUALE",
      aciRowId: null,
      costoKm: 0.6,
      valoreConvenzionaleAnnuo: null,
      notaFonteValore: "Veicolo fuori produzione: assunta la riga ACI del modello più simile.",
      alimentazione: "ICE",
      dataPrimaImmatricolazione: "2024-05-01",
    })
  );
  const warningManuale = r.warnings.some((w) => w.includes("inserito manualmente"));
  const pass =
    r.fringeBenefitPeriodo === 4500.0 &&
    warningManuale &&
    r.fonteValoreBase === "COSTO_KM_MANUALE";
  return {
    pass,
    instances: [istanza(r, { warningsAttesi: ["inserito manualmente"] })],
    atteso: "fringeBenefitPeriodo=4500.00, warning valore manuale presente, fonteValoreBase=COSTO_KM_MANUALE",
    ottenuto: `fringeBenefitPeriodo=${r.fringeBenefitPeriodo}, warning manuale=${warningManuale}, fonteValoreBase=${r.fonteValoreBase}`,
  };
});

// T30
test("T30", "VALORE_CONVENZIONALE_MANUALE 9.000 -> 4.500,00 e nessuna moltiplicazione per 15.000", () => {
  const r = computeFringeBenefit(
    baseInput({
      fonteValoreBase: "VALORE_CONVENZIONALE_MANUALE",
      aciRowId: null,
      costoKm: null,
      valoreConvenzionaleAnnuo: 9000,
      notaFonteValore: "Versione estera non presente in tabella: valore convenzionale del modello equivalente.",
      alimentazione: "ICE",
      dataPrimaImmatricolazione: "2024-05-01",
    })
  );
  const passo2 = r.breakdown.find((b) => b.passo === 2);
  const senzaMoltiplicazione = !r.breakdown.some((b) =>
    `${b.descrizione} ${b.operazione}`.includes("15000")
  );
  const pass =
    r.fringeBenefitPeriodo === 4500.0 &&
    senzaMoltiplicazione &&
    passo2.fonte === "VALORE_CONVENZIONALE_MANUALE" &&
    passo2.valoreDopo === 9000;
  return {
    pass,
    instances: [istanza(r, { warningsAttesi: ["inserito manualmente"] })],
    atteso:
      "fringeBenefitPeriodo=4500.00, breakdown senza moltiplicazione per 15000, passo2.fonte=VALORE_CONVENZIONALE_MANUALE, passo2.valoreDopo=9000",
    ottenuto: `fringeBenefitPeriodo=${r.fringeBenefitPeriodo}, senzaMoltiplicazione=${senzaMoltiplicazione}, passo2.fonte=${passo2.fonte}, passo2.valoreDopo=${passo2.valoreDopo}`,
  };
});

// T31
test(
  "T31",
  "modalità manuale senza notaFonteValore -> errore bloccante",
  () => {
    const r = computeFringeBenefit(
      baseInput({
        fonteValoreBase: "COSTO_KM_MANUALE",
        aciRowId: null,
        costoKm: 0.6,
        valoreConvenzionaleAnnuo: null,
        notaFonteValore: null,
      })
    );
    const pass = r.errors.length > 0 && r.fringeBenefitPeriodo === null;
    return {
      pass,
      instances: [istanza(r, { attendeErrore: true })],
      atteso: "errors.length>0, fringeBenefitPeriodo=null",
      ottenuto: `errors.length=${r.errors.length}, fringeBenefitPeriodo=${r.fringeBenefitPeriodo}, errors=${JSON.stringify(r.errors)}`,
    };
  }
);

// T32
test(
  "T32",
  'fonteValoreBase "ACI" con costoKm null -> errore bloccante',
  () => {
    const r = computeFringeBenefit(baseInput({ fonteValoreBase: "ACI", costoKm: null }));
    const pass = r.errors.length > 0 && r.fringeBenefitPeriodo === null;
    return {
      pass,
      instances: [istanza(r, { attendeErrore: true })],
      atteso: "errors.length>0, fringeBenefitPeriodo=null",
      ottenuto: `errors.length=${r.errors.length}, fringeBenefitPeriodo=${r.fringeBenefitPeriodo}, errors=${JSON.stringify(r.errors)}`,
    };
  }
);

// T33
test(
  "T33",
  "COSTO_KM_MANUALE con anche valoreConvenzionaleAnnuo valorizzato -> errore bloccante (input contraddittorio)",
  () => {
    const r = computeFringeBenefit(
      baseInput({
        fonteValoreBase: "COSTO_KM_MANUALE",
        aciRowId: null,
        costoKm: 0.6,
        valoreConvenzionaleAnnuo: 9000,
        notaFonteValore: "Nota presente: l'errore deve dipendere solo dalla contraddizione tra i due campi.",
      })
    );
    const contraddizione = r.errors.some((e) => e.includes("contraddittorio"));
    const pass = r.errors.length > 0 && contraddizione && r.fringeBenefitPeriodo === null;
    return {
      pass,
      instances: [istanza(r, { attendeErrore: true })],
      atteso: "errors.length>0 con errore di input contraddittorio, fringeBenefitPeriodo=null",
      ottenuto: `errors.length=${r.errors.length}, contraddizione=${contraddizione}, fringeBenefitPeriodo=${r.fringeBenefitPeriodo}, errors=${JSON.stringify(r.errors)}`,
    };
  }
);

// T34 — verifica del flag interpretativo APPLICA_FORFAIT_A_CASI_CONFINE,
// cablato in resolveRegime (in precedenza dichiarato in config.js ma mai
// importato né usato).
test("T34", "APPLICA_FORFAIT_A_CASI_CONFINE = false -> il caso di confine diventa errore bloccante", () => {
  const input = baseInput({
    dataStipulaContratto: "2024-12-27",
    dataConsegnaAlDipendente: "2026-03-15",
    dataOrdineDatore: null,
  });
  const conFlagTrue = computeFringeBenefit(input); // default da config.js
  const conFlagFalse = computeFringeBenefit(input, { applicaForfaitACasiConfine: false });
  const pass =
    conFlagTrue.errors.length === 0 &&
    conFlagTrue.fringeBenefitPeriodo !== null &&
    conFlagFalse.errors.length > 0 &&
    conFlagFalse.fringeBenefitPeriodo === null;
  return {
    pass,
    instances: [
      istanza(conFlagTrue, { warningsAttesi: ["Caso di confine"] }),
      istanza(conFlagFalse, { attendeErrore: true }),
    ],
    atteso: "flag true: errors vuoto e calcolo eseguito; flag false: errore bloccante e nessun calcolo",
    ottenuto: `flag true: errors.length=${conFlagTrue.errors.length}, fringeBenefitPeriodo=${conFlagTrue.fringeBenefitPeriodo}; flag false: errors.length=${conFlagFalse.errors.length}, fringeBenefitPeriodo=${conFlagFalse.fringeBenefitPeriodo}`,
  };
});

// T35 — coerenza cronologica: consegna anteriore alla prima immatricolazione.
test("T35", "consegna anteriore alla prima immatricolazione -> bloccante", () => {
  const r = computeFringeBenefit(
    baseInput({
      dataPrimaImmatricolazione: "2026-06-01", // dopo la consegna di default (2026-02-01)
    })
  );
  const pass = r.errors.length > 0 && r.fringeBenefitPeriodo === null;
  return {
    pass,
    instances: [istanza(r, { attendeErrore: true })],
    atteso: "errors.length>0, fringeBenefitPeriodo=null",
    ottenuto: `errors.length=${r.errors.length}, fringeBenefitPeriodo=${r.fringeBenefitPeriodo}, errors=${JSON.stringify(r.errors)}`,
  };
});

// T36 — coerenza cronologica: consegna anteriore all'ordine.
test("T36", "consegna anteriore all'ordine -> bloccante", () => {
  const r = computeFringeBenefit(
    baseInput({
      dataOrdineDatore: "2026-03-01", // dopo la consegna di default (2026-02-01)
    })
  );
  const pass = r.errors.length > 0 && r.fringeBenefitPeriodo === null;
  return {
    pass,
    instances: [istanza(r, { attendeErrore: true })],
    atteso: "errors.length>0, fringeBenefitPeriodo=null",
    ottenuto: `errors.length=${r.errors.length}, fringeBenefitPeriodo=${r.fringeBenefitPeriodo}, errors=${JSON.stringify(r.errors)}`,
  };
});

// T37 — coerenza cronologica: consegna anteriore alla stipula, non
// bloccante ma segnalata (esistono casi legittimi: consegna anticipata
// con formalizzazione successiva dell'atto).
test("T37", "consegna anteriore alla stipula -> calcolo eseguito, warning presente, errors vuoto", () => {
  const r = computeFringeBenefit(
    baseInput({
      dataStipulaContratto: "2026-03-01", // dopo la consegna di default (2026-02-01)
    })
  );
  const pass = r.errors.length === 0 && r.fringeBenefitPeriodo !== null;
  return {
    pass,
    instances: [istanza(r, { warningsAttesi: ["Consegna anteriore alla stipula"] })],
    atteso: "errors.length=0, fringeBenefitPeriodo!=null, warning presente",
    ottenuto: `errors.length=${r.errors.length}, fringeBenefitPeriodo=${r.fringeBenefitPeriodo}`,
  };
});

// T38 — coerenza cronologica tra contratto in esame e contratto
// originario: una RIASSEGNAZIONE non può avere date anteriori a quelle
// del contratto originario.
test("T38", "RIASSEGNAZIONE con date anteriori a quelle del contratto originario -> bloccante", () => {
  const r = computeFringeBenefit(
    baseInput({
      tipoAtto: "RIASSEGNAZIONE",
      dataPrimaImmatricolazione: "2022-01-01",
      dataOrdineDatore: null,
      dataStipulaContratto: "2023-01-01", // anteriore alla stipula originaria
      dataConsegnaAlDipendente: "2023-02-01", // anteriore alla consegna originaria
      contrattoOriginario: {
        dataOrdineDatore: null,
        dataStipulaContratto: "2024-01-01",
        dataConsegnaAlDipendente: "2024-02-01",
      },
    })
  );
  const pass = r.errors.length > 0 && r.fringeBenefitPeriodo === null;
  return {
    pass,
    instances: [istanza(r, { attendeErrore: true })],
    atteso: "errors.length>0, fringeBenefitPeriodo=null",
    ottenuto: `errors.length=${r.errors.length}, fringeBenefitPeriodo=${r.fringeBenefitPeriodo}, errors=${JSON.stringify(r.errors)}`,
  };
});
