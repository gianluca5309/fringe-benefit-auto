// js/ui.js — orchestrazione del wizard a 4 passi. Nessun framework, nessuna
// dipendenza esterna. Importa il motore così com'è (nessuna modifica) e i
// due moduli di supporto di questa fase (aci.js, plate.js).
//
// I 4 pannelli restano sempre nel DOM (mostrati/nascosti con [hidden]):
// così i valori inseriti non si perdono muovendosi avanti e indietro tra
// i passi, senza bisogno di un oggetto di stato parallelo per ogni campo.

import { computeFringeBenefit } from "./engine.js";
import { loadAciData, cercaAci, debounce } from "./aci.js";
import { validaFormatoTarga, lookupPlate } from "./plate.js";

function $(id) {
  return document.getElementById(id);
}

// ── Stato del wizard ────────────────────────────────────────────────────

let modalitaValoreBase = "ACI"; // "ACI" | "COSTO_KM_MANUALE" | "VALORE_CONVENZIONALE_MANUALE"
let aciSelectedRow = null;
let aciDataPromise = null;

// ── Utility di formattazione ────────────────────────────────────────────

const formatterEuro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

function formatEuro(x) {
  return x === null || x === undefined ? "—" : formatterEuro.format(x);
}

function formatDataIt(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatPercentUi(coeff) {
  const p = Math.round(coeff * 100 * 100) / 100;
  return `${String(p).replace(".", ",")}%`;
}

function labelAlimentazione(code) {
  return (
    {
      BEV: "Elettrico (BEV)",
      PHEV: "Ibrido plug-in (PHEV)",
      ICE: "Termico (ICE)",
      HEV_MHEV: "Ibrido non plug-in (HEV/mild hybrid)",
    }[code] ?? code
  );
}

function formatFonte(f) {
  return (
    {
      ACI: "Tabelle ACI",
      COSTO_KM_MANUALE: "Costo al km manuale",
      VALORE_CONVENZIONALE_MANUALE: "Valore convenzionale manuale",
    }[f] ?? f
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseNumOrNull(el) {
  const v = el.value.trim();
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseNumOrZero(el) {
  const v = el.value.trim();
  if (v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function dataOrNull(el) {
  return el.value ? el.value : null;
}

// ── Navigazione tra i 4 passi ────────────────────────────────────────────

function mostraStep(n) {
  for (let i = 1; i <= 4; i++) {
    $(`step-${i}`).hidden = i !== n;
  }
  document.querySelectorAll("#step-indicator li").forEach((li) => {
    const s = Number(li.dataset.step);
    li.classList.toggle("attivo", s === n);
    li.classList.toggle("completato", s < n);
  });
  if (n === 2) assicuraAciCaricato();
  window.scrollTo({ top: 0, behavior: "instant" });
}

// ── STEP 1 — targa ───────────────────────────────────────────────────────

function initStep1() {
  $("btn-salta-targa").addEventListener("click", () => mostraStep(2));

  $("btn-cerca-targa").addEventListener("click", async () => {
    const targa = $("targa-input").value;
    const esito = $("targa-esito");

    if (!validaFormatoTarga(targa)) {
      esito.innerHTML =
        '<div class="riquadro errore">Formato targa non valido. Formato atteso: due lettere, tre cifre, due lettere (es. AB123CD). Puoi comunque saltare questo passo e inserire i dati a mano.</div>';
      return;
    }

    esito.innerHTML = '<div class="riquadro info">Ricerca in corso…</div>';
    const dati = await lookupPlate(targa);

    if (!dati) {
      esito.innerHTML =
        '<div class="riquadro warning">Nessun veicolo trovato per questa targa (dataset di collaudo). Puoi correggere la targa, saltare il passo o proseguire e inserire i dati a mano al passo successivo.</div>';
      return;
    }

    esito.innerHTML = `<div class="riquadro successo">Veicolo trovato: ${escapeHtml(dati.marca)} ${escapeHtml(dati.modello)}. Alcuni campi sono stati precompilati.</div>`;

    $("aci-search").value = `${dati.marca} ${dati.modello}`;
    $("alimentazione-select").value = dati.alimentazione;
    aggiornaAiutoAlimentazione();
    if (dati.co2 !== null && dati.co2 !== undefined) $("co2-input").value = dati.co2;
    if (dati.dataPrimaImmatricolazione) $("data-immatricolazione").value = dati.dataPrimaImmatricolazione;

    aggiornaStatoAvanti();
    setTimeout(() => mostraStep(2), 700);
  });
}

// ── STEP 2 — valore base ─────────────────────────────────────────────────

function assicuraAciCaricato() {
  if (!aciDataPromise) {
    aciDataPromise = loadAciData().catch((err) => {
      const container = $("aci-risultati");
      container.hidden = false;
      container.innerHTML = `<div class="riquadro errore" style="margin:0;">Errore nel caricamento delle tabelle ACI: ${escapeHtml(err.message)}</div>`;
      throw err;
    });
  }
  return aciDataPromise;
}

function renderRisultatiAci(rows) {
  const container = $("aci-risultati");
  if (rows.length === 0) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }
  container.hidden = false;
  container.innerHTML = rows
    .map(
      (r) => `
      <button type="button" class="risultato-aci-item" data-id="${escapeHtml(r.id)}">
        <span class="marca-modello">${escapeHtml(r.marca)} ${escapeHtml(r.modello)}</span><br/>
        <span class="dettagli">${labelAlimentazione(r.alimentazione)} · ${r.costoKm.toFixed(4)} €/km · ${escapeHtml(r.categoria)}${r.alimentazioneCerta === false ? " · alimentazione assunta" : ""}</span>
      </button>`
    )
    .join("");
  container.querySelectorAll(".risultato-aci-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = rows.find((r) => r.id === btn.dataset.id);
      mostraCardConfermaAci(row);
    });
  });
}

function badgeProduzioneHtml(inProduzione) {
  if (inProduzione === null) return "";
  return inProduzione
    ? '<span class="badge in-produzione">In produzione</span>'
    : '<span class="badge fuori-produzione">Fuori produzione</span>';
}

function avvisoAlimentazioneHtml(row) {
  if (row.alimentazioneCerta !== false) return "";
  return '<div class="riquadro warning non-richiudibile">Alimentazione assunta dalla fonte, non certificata: verificare sul libretto di circolazione.</div>';
}

// Prima del clic su "Conferma": la riga trovata va sempre mostrata per
// conferma esplicita, mai selezionata automaticamente.
function mostraCardConfermaAci(row) {
  const el = $("aci-selezione");
  el.innerHTML = `
    <div class="card-selezione">
      <div class="riga-titolo">
        <strong>${escapeHtml(row.marca)} ${escapeHtml(row.modello)}</strong>
        <span>${badgeProduzioneHtml(row.inProduzione)}</span>
      </div>
      <div class="aiuto">${labelAlimentazione(row.alimentazione)} · ${row.costoKm.toFixed(4)} €/km · ${escapeHtml(row.categoria)} · fonte: ${escapeHtml(row.fileOrigine)}</div>
      ${avvisoAlimentazioneHtml(row)}
      <div class="azioni" style="border-top:none;padding-top:0.6rem;">
        <button type="button" id="btn-annulla-selezione-aci">Annulla</button>
        <button type="button" class="primario" id="btn-conferma-selezione-aci">Conferma questa riga</button>
      </div>
    </div>`;
  $("btn-annulla-selezione-aci").addEventListener("click", () => {
    el.innerHTML = "";
  });
  $("btn-conferma-selezione-aci").addEventListener("click", () => confermaSelezioneAci(row));
}

function confermaSelezioneAci(row) {
  aciSelectedRow = row;
  modalitaValoreBase = "ACI";

  $("aci-risultati").hidden = true;
  $("aci-risultati").innerHTML = "";
  $("aci-search").value = `${row.marca} ${row.modello}`;

  $("alimentazione-select").value = row.alimentazione;
  $("alimentazione-select").disabled = true;
  aggiornaAiutoAlimentazione();

  resetAreaManuale();

  const el = $("aci-selezione");
  el.innerHTML = `
    <div class="card-selezione">
      <div class="riga-titolo"><strong>Selezionato: ${escapeHtml(row.marca)} ${escapeHtml(row.modello)}</strong> ${badgeProduzioneHtml(row.inProduzione)}</div>
      <div class="aiuto">${labelAlimentazione(row.alimentazione)} · ${row.costoKm.toFixed(4)} €/km</div>
      ${avvisoAlimentazioneHtml(row)}
      <button type="button" class="link" id="btn-cambia-selezione-aci">Cambia veicolo</button>
    </div>`;
  $("btn-cambia-selezione-aci").addEventListener("click", () => {
    aciSelectedRow = null;
    $("alimentazione-select").disabled = false;
    aggiornaAiutoAlimentazione();
    el.innerHTML = "";
    $("aci-search").focus();
    aggiornaStatoAvanti();
  });

  aggiornaStatoAvanti();
}

function resetAreaManuale() {
  $("area-manuale").hidden = true;
  $("fonte-costo-km").checked = false;
  $("fonte-valore-conv").checked = false;
  $("campo-costo-km-manuale").hidden = true;
  $("campo-valore-conv-manuale").hidden = true;
  $("costo-km-manuale-input").value = "";
  $("valore-conv-manuale-input").value = "";
  $("nota-fonte-valore").value = "";
}

function attivaModalitaManuale(modo) {
  modalitaValoreBase = modo;
  aciSelectedRow = null;
  $("aci-selezione").innerHTML = "";
  $("campo-costo-km-manuale").hidden = modo !== "COSTO_KM_MANUALE";
  $("campo-valore-conv-manuale").hidden = modo !== "VALORE_CONVENZIONALE_MANUALE";
  $("alimentazione-select").disabled = false;
  aggiornaAiutoAlimentazione();
  aggiornaStatoAvanti();
}

function aggiornaAiutoAlimentazione() {
  $("alimentazione-aiuto").textContent = $("alimentazione-select").disabled
    ? "Sincronizzata con il veicolo selezionato nelle tabelle ACI."
    : "Seleziona l'alimentazione del veicolo di riferimento.";
}

function aggiornaStatoAvanti() {
  const alimentazioneOk = !!$("alimentazione-select").value;
  let valoreOk = false;
  const notaOk = $("nota-fonte-valore").value.trim() !== "";

  if (modalitaValoreBase === "ACI") {
    valoreOk = !!aciSelectedRow;
  } else if (modalitaValoreBase === "COSTO_KM_MANUALE") {
    const v = parseFloat($("costo-km-manuale-input").value);
    valoreOk = Number.isFinite(v) && v > 0 && notaOk;
  } else if (modalitaValoreBase === "VALORE_CONVENZIONALE_MANUALE") {
    const v = parseFloat($("valore-conv-manuale-input").value);
    valoreOk = Number.isFinite(v) && v > 0 && notaOk;
  }

  $("btn-step2-avanti").disabled = !(alimentazioneOk && valoreOk);
}

function raccogliValoreBase() {
  if (modalitaValoreBase === "ACI") {
    return {
      fonteValoreBase: "ACI",
      aciRowId: aciSelectedRow ? aciSelectedRow.id : null,
      costoKm: aciSelectedRow ? aciSelectedRow.costoKm : null,
      valoreConvenzionaleAnnuo: null,
      notaFonteValore: null,
    };
  }
  if (modalitaValoreBase === "COSTO_KM_MANUALE") {
    return {
      fonteValoreBase: "COSTO_KM_MANUALE",
      aciRowId: null,
      costoKm: parseNumOrNull($("costo-km-manuale-input")),
      valoreConvenzionaleAnnuo: null,
      notaFonteValore: $("nota-fonte-valore").value.trim() || null,
    };
  }
  return {
    fonteValoreBase: "VALORE_CONVENZIONALE_MANUALE",
    aciRowId: null,
    costoKm: null,
    valoreConvenzionaleAnnuo: parseNumOrNull($("valore-conv-manuale-input")),
    notaFonteValore: $("nota-fonte-valore").value.trim() || null,
  };
}

function initStep2() {
  const ricercaConDebounce = debounce(async (query) => {
    if (query.trim().length < 2) {
      renderRisultatiAci([]);
      return;
    }
    try {
      const rows = await assicuraAciCaricato();
      renderRisultatiAci(cercaAci(query, rows, 25));
    } catch {
      // errore già mostrato da assicuraAciCaricato()
    }
  }, 180);

  $("aci-search").addEventListener("input", (e) => ricercaConDebounce(e.target.value));

  $("btn-toggle-manuale").addEventListener("click", () => {
    $("area-manuale").hidden = false;
  });

  $("btn-torna-aci").addEventListener("click", () => {
    resetAreaManuale();
    modalitaValoreBase = "ACI";
    if (!aciSelectedRow) {
      $("alimentazione-select").value = "";
      $("alimentazione-select").disabled = false;
      aggiornaAiutoAlimentazione();
    }
    aggiornaStatoAvanti();
  });

  $("fonte-costo-km").addEventListener("change", () => attivaModalitaManuale("COSTO_KM_MANUALE"));
  $("fonte-valore-conv").addEventListener("change", () => attivaModalitaManuale("VALORE_CONVENZIONALE_MANUALE"));

  $("costo-km-manuale-input").addEventListener("input", aggiornaStatoAvanti);
  $("valore-conv-manuale-input").addEventListener("input", aggiornaStatoAvanti);
  $("nota-fonte-valore").addEventListener("input", aggiornaStatoAvanti);
  $("alimentazione-select").addEventListener("change", aggiornaStatoAvanti);

  $("btn-step2-indietro").addEventListener("click", () => mostraStep(1));
  $("btn-step2-avanti").addEventListener("click", () => mostraStep(3));

  aggiornaAiutoAlimentazione();
}

// ── STEP 3 — dati contrattuali ───────────────────────────────────────────

function initStep3() {
  $("tipo-atto").addEventListener("change", (e) => {
    const mostra = e.target.value === "PROROGA" || e.target.value === "RIASSEGNAZIONE";
    $("blocco-contratto-originario").hidden = !mostra;
  });

  $("btn-step3-indietro").addEventListener("click", () => mostraStep(2));
  $("btn-step3-calcola").addEventListener("click", () => {
    const input = raccogliInput();
    const risultato = computeFringeBenefit(input);
    renderRisultato(risultato);
    mostraStep(4);
  });
}

function raccogliInput() {
  const base = raccogliValoreBase();
  const tipoAtto = $("tipo-atto").value;
  const contrattoOriginario =
    tipoAtto === "PROROGA" || tipoAtto === "RIASSEGNAZIONE"
      ? {
          dataOrdineDatore: dataOrNull($("orig-data-ordine")),
          dataStipulaContratto: dataOrNull($("orig-data-stipula")),
          dataConsegnaAlDipendente: dataOrNull($("orig-data-consegna")),
        }
      : null;

  const periodoInizio = dataOrNull($("periodo-inizio"));

  return {
    targa: $("targa-input").value.trim() || null,
    ...base,
    alimentazione: $("alimentazione-select").value || null,
    co2: parseNumOrNull($("co2-input")),
    dataPrimaImmatricolazione: dataOrNull($("data-immatricolazione")),
    dataOrdineDatore: dataOrNull($("data-ordine")),
    dataStipulaContratto: dataOrNull($("data-stipula")),
    dataConsegnaAlDipendente: dataOrNull($("data-consegna")),
    tipoAtto,
    contrattoOriginario,
    // L'anno d'imposta è ricavato dalla data di inizio periodo, non
    // richiesto come campo separato: evita la classe di errore "campo
    // libero disallineato dal periodo" (lo stesso tipo di errore da
    // transposizione già affrontato per le date del contratto).
    annoImposta: periodoInizio ? Number(periodoInizio.slice(0, 4)) : null,
    dataInizioPeriodo: periodoInizio,
    dataFinePeriodo: dataOrNull($("periodo-fine")),
    accessoriNonAci: document.querySelector('input[name="accessori"]:checked')?.value ?? null,
    sommeTrattenute: parseNumOrZero($("somme-trattenute")),
    altriFringeBenefitAnno: parseNumOrZero($("altri-fringe-benefit")),
    figliFiscalmenteACarico: $("figli-carico").checked,
    qualifica: $("qualifica-select").value,
    usoEsclusivamenteAziendale: $("uso-esclusivo-aziendale").checked,
  };
}

// ── STEP 4 — risultato ───────────────────────────────────────────────────

function renderAlertAnzianita(annoDecorrenzaIso) {
  const oggi = new Date();
  const decorrenza = new Date(`${annoDecorrenzaIso}T00:00:00`);
  const fraDodiciMesi = new Date(oggi);
  fraDodiciMesi.setMonth(fraDodiciMesi.getMonth() + 12);

  let classe;
  let titolo;
  let testo;
  if (decorrenza <= oggi) {
    classe = "errore";
    titolo = "Maggiorazione 50% per anzianità già decorsa";
    testo = `Decorsa dal ${formatDataIt(annoDecorrenzaIso)}: verificare la posizione del lavoratore entro le operazioni di conguaglio.`;
  } else if (decorrenza <= fraDodiciMesi) {
    classe = "warning";
    titolo = "Maggiorazione 50% per anzianità in arrivo";
    testo = `Decorre dal ${formatDataIt(annoDecorrenzaIso)} (entro 12 mesi da oggi).`;
  } else {
    classe = "info";
    titolo = "Decorrenza maggiorazione 50% per anzianità";
    testo = `Decorre dal ${formatDataIt(annoDecorrenzaIso)}.`;
  }
  return `<div class="riquadro ${classe}"><h4>${titolo}</h4><p>${testo}</p></div>`;
}

function renderRisultato(r) {
  const el = $("risultato-contenuto");

  if (r.errors.length > 0) {
    const co2Mancante = r.errors.some((e) => e.startsWith("CO2 mancante"));
    if (co2Mancante) {
      el.innerHTML = `
        <div class="riquadro errore non-richiudibile">
          <h4>CO2 necessaria per questo calcolo</h4>
          <p>Questo caso ricade nel regime emissioni (CO2), che le tabelle ACI non riportano per questo veicolo. Torna al passo 2 e inserisci il valore CO2: lo trovi sul libretto di circolazione, secondo quadrante, voce V.7 (g/km).</p>
          <button type="button" class="primario" id="btn-torna-step2-co2">← Torna al passo 2</button>
        </div>`;
      $("btn-torna-step2-co2").addEventListener("click", () => mostraStep(2));
    } else {
      el.innerHTML = `
        <div class="riquadro errore non-richiudibile">
          <h4>Impossibile completare il calcolo</h4>
          <ul>${r.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
        </div>
        <div class="azioni" style="border-top:none;padding-top:0;">
          <button type="button" id="btn-torna-step2-generico">← Rivedi il passo 2 (valore base)</button>
          <button type="button" id="btn-torna-step3-generico">← Rivedi il passo 3 (dati contrattuali)</button>
        </div>`;
      $("btn-torna-step2-generico").addEventListener("click", () => mostraStep(2));
      $("btn-torna-step3-generico").addEventListener("click", () => mostraStep(3));
    }
    return;
  }

  let html = "";

  html += `<div class="esito-principale">
    <div class="valore-grande">${formatEuro(r.fringeBenefitPeriodo)}</div>
    <div class="aiuto">Fringe benefit imponibile per il periodo selezionato</div>
    <div class="sotto-valori">
      <div>Mensile di competenza: <strong>${formatEuro(r.fringeBenefitMensilePeriodo)}</strong></div>
      <div>Annuo intero (pre-ragguaglio): <strong>${formatEuro(r.fringeBenefitAnnuoIntero)}</strong></div>
      <div>Giorni: <strong>${r.giorni ?? "—"}</strong></div>
      <div>Mesi di competenza: <strong>${r.mesiCompetenza ?? "—"}</strong></div>
    </div>
  </div>`;

  html += `<div class="griglia-dettaglio">
    <div class="dettaglio-item"><div class="etichetta">Regime</div><div class="valore">${escapeHtml(r.regime)}</div></div>
    <div class="dettaglio-item"><div class="etichetta">Coefficiente</div><div class="valore">${r.coefficiente != null ? formatPercentUi(r.coefficiente) : "—"}</div></div>
    <div class="dettaglio-item"><div class="etichetta">Fonte valore base</div><div class="valore">${formatFonte(r.fonteValoreBase)}</div></div>
    <div class="dettaglio-item"><div class="etichetta">Qualifica</div><div class="valore">${escapeHtml(r.qualifica)}</div></div>
  </div>`;

  if (r.motivazioneRegime) {
    html += `<div class="riquadro info"><h4>Motivazione regime</h4><p>${escapeHtml(r.motivazioneRegime)}</p></div>`;
  }
  if (r.motivazioneCoefficiente) {
    html += `<div class="riquadro info"><h4>Motivazione coefficiente</h4><p>${escapeHtml(r.motivazioneCoefficiente)}</p></div>`;
  }
  if (r.notaFonteValore) {
    html += `<div class="riquadro info"><h4>Nota sulla fonte del valore base</h4><p>${escapeHtml(r.notaFonteValore)}</p></div>`;
  }

  const badges = [];
  if (r.maggiorazione50Applicata) badges.push('<span class="badge attiva">+50% anzianità attiva</span>');
  if (r.maggiorazione5Applicata) badges.push('<span class="badge attiva">+5% accessori attiva</span>');
  if (badges.length) html += `<div>${badges.join(" ")}</div>`;

  if (r.annoDecorrenzaMaggiorazione50) {
    html += renderAlertAnzianita(r.annoDecorrenzaMaggiorazione50);
  }

  if (r.breakdown && r.breakdown.length > 0) {
    html += `<h3>Dettaglio del calcolo</h3>
    <table class="breakdown">
      <thead><tr><th>Passo</th><th>Descrizione</th><th>Operazione</th><th>Valore dopo</th></tr></thead>
      <tbody>
      ${r.breakdown
        .map(
          (b) =>
            `<tr><td>${b.passo}</td><td>${escapeHtml(b.descrizione)}</td><td>${escapeHtml(b.operazione)}</td><td class="valore">${formatEuro(b.valoreDopo)}</td></tr>`
        )
        .join("")}
      </tbody>
    </table>`;
  }

  if (r.eccedenzaNonDeducibile > 0) {
    html += `<div class="riquadro warning"><h4>Eccedenza non deducibile</h4><p>${formatEuro(r.eccedenzaNonDeducibile)} di trattenute non riducono il fringe benefit e vanno valutate separatamente.</p></div>`;
  }

  if (r.soglia !== null) {
    html += `<div class="soglia-box ${r.superaSoglia ? "superata" : "entro"}">
      <strong>Soglia di esenzione: ${formatEuro(r.soglia)}</strong><br/>
      Totale fringe benefit dell'anno (veicolo + altri): ${formatEuro(r.totaleBenefit)}<br/>
      ${
        r.superaSoglia
          ? `Soglia superata: l'intero importo (${formatEuro(r.imponibileDopoSoglia)}) diventa imponibile, non solo l'eccedenza.`
          : "Soglia non superata: nessun importo imponibile per questo limite."
      }
    </div>`;
  }

  if (r.warnings && r.warnings.length > 0) {
    html += `<div class="riquadro warning"><h4>Avvisi da verificare manualmente</h4><ul>${r.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul></div>`;
  }

  el.innerHTML = html;
}

function initStep4() {
  $("btn-step4-indietro").addEventListener("click", () => mostraStep(3));
  $("btn-nuovo-calcolo").addEventListener("click", () => window.location.reload());
}

// ── Avvio ────────────────────────────────────────────────────────────────

function init() {
  initStep1();
  initStep2();
  initStep3();
  initStep4();
  mostraStep(1);
}

init();
