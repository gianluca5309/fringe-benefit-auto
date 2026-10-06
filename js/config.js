// config.js — parametri normativi e flag interpretativi per il calcolo del
// fringe benefit auto ad uso promiscuo (normativa italiana vigente 2026,
// come modificata dal D.Lgs. 7 agosto 2026 n. 148 "Decreto Omnibus", GU
// n. 185 dell'11/08/2026, in vigore dal 12/08/2026).
//
// Nessuna logica qui dentro: solo costanti e tabelle. La logica sta in
// engine.js. Ogni costante riporta il riferimento normativo o di prassi
// da cui deriva.

// ─────────────────────────────────────────────────────────────────────────
// PASSO 2 — base convenzionale
// ─────────────────────────────────────────────────────────────────────────

// Percorrenza convenzionale annua (km), indipendente dai km effettivi.
// art. 51 c.4 lett. a) TUIR.
export const PERCORRENZA_CONVENZIONALE = 15000;

// ─────────────────────────────────────────────────────────────────────────
// PASSO 6 — ragguaglio ai giorni
// ─────────────────────────────────────────────────────────────────────────

// Giorni convenzionali per il ragguaglio, anche negli anni bisestili.
export const GIORNI_ANNO = 365;

// Giorni massimi ammessi per un periodo di competenza ricadente in un
// singolo anno d'imposta (366 per gli anni bisestili). Oltre questo
// valore il periodo non può ricadere in un solo periodo d'imposta:
// controllo bloccante in validateInput.
export const GIORNI_MASSIMI_PERIODO = 366;

// NOTA: i mesi di competenza NON si ricavano dividendo i giorni per una
// durata media o massima del mese (un periodo 20/01–10/02 è di 22 giorni
// ma interessa 2 mensilità di paga). Si contano i mesi di calendario
// distinti intersecati dal periodo: vedi mesiCalendarioIntersecati() in
// engine.js. Non è un parametro normativo, quindi non c'è una costante.

// ─────────────────────────────────────────────────────────────────────────
// PASSO 1 — soglie temporali per la selezione del regime
// ─────────────────────────────────────────────────────────────────────────

// REGIME_A ("ante 2020"): contratti stipulati fino a questa data compresa.
export const REGIME_A_STIPULA_LIMITE = "2020-06-30";

// REGIME_B ("CO2") — finestra "storica": veicoli consegnati in questo
// intervallo (estremi inclusi). art. 51 c.4 lett. a) TUIR, testo vigente
// al 31/12/2024 (L. 160/2019).
export const REGIME_B_CONSEGNA_INIZIO = "2020-07-01";
export const REGIME_B_CONSEGNA_FINE_STORICO = "2024-12-31";

// REGIME_B — finestra di "salvaguardia" per ordini anteriori alla riforma
// ma consegnati dopo. art. 1 c. 48-bis L. 207/2024, come sostituito
// dall'art. 2 c. 2 D.Lgs. 148/2026: il termine di consegna, prima fissato
// al 30 giugno 2025, è stato esteso al 31 dicembre 2025.
export const REGIME_B_SALVAGUARDIA_ORDINE_LIMITE = "2024-12-31";
export const REGIME_B_SALVAGUARDIA_CONSEGNA_INIZIO = "2025-01-01";
export const REGIME_B_SALVAGUARDIA_CONSEGNA_FINE = "2025-12-31";

// REGIME_C — soglie del "caso di confine" (warning interpretativo, non
// incide sul calcolo). Costanti dedicate: NON riusare quelle della
// salvaguardia, che rispondono a una regola diversa.
// La circ. 10/E/2025 richiedeva che immatricolazione, stipula e consegna
// ricadessero tutte nel 2025: il caso di confine ricorre quindi ogni
// volta che la consegna slitta al 2026 con stipula anteriore al 2026.
export const REGIME_C_CONFINE_STIPULA_LIMITE = "2025-12-31";
export const REGIME_C_CONFINE_CONSEGNA_INIZIO = "2026-01-01";

// ─────────────────────────────────────────────────────────────────────────
// PASSO 3 — coefficienti di regime
// ─────────────────────────────────────────────────────────────────────────

// REGIME_A: forfait unico, indipendente da alimentazione e CO2.
export const COEFFICIENTE_ANTE_2020 = 0.30;

// REGIME_B ("CO2"): art. 51 c.4 lett. a) TUIR, testo vigente al 31/12/2024
// (L. 160/2019). Fasce in ordine crescente, "max" incluso nella fascia.
// L'ultima fascia ha max: Infinity: è la fascia residuale per le CO2
// fuori scala, senza la quale la ricerca della fascia restituirebbe
// undefined.
export const FASCE_CO2 = [
  { max: 60, coeff: 0.25 },
  { max: 160, coeff: 0.30 },
  { max: 190, coeff: 0.50 },
  { max: Infinity, coeff: 0.60 },
];

// REGIME_C ("alimentazione"): art. 51 c.4 lett. a) TUIR come modificato da
// L. 207/2024 e confermato da D.Lgs. 148/2026.
export const COEFFICIENTI_ALIMENTAZIONE = {
  BEV: 0.10,
  PHEV: 0.20,
  ICE: 0.50,
  HEV_MHEV: 0.50,
};

// ─────────────────────────────────────────────────────────────────────────
// PASSO 4 — maggiorazione 50% per anzianità
// ─────────────────────────────────────────────────────────────────────────

// Anni dopo la prima immatricolazione oltre i quali scatta la
// maggiorazione. art. 51 c.4 lett. a) TUIR, terzo periodo, D.Lgs.
// 148/2026 (per REGIME_B: art. 2 c. 3 D.Lgs. 148/2026).
// Lettura prevalente della norma ("dopo il 31 dicembre del quinto anno
// successivo a quello di prima immatricolazione"); nessuna prassi AdE
// ancora pubblicata sul D.Lgs. 148/2026.
export const ANNI_SOGLIA_ANZIANITA = 5;

export const MAGGIORAZIONE_ANZIANITA = 1.50;

// Punto interpretativo aperto: la maggiorazione per anzianità si applica
// solo a REGIME_B e REGIME_C (art. 51 c.4 lett. a) TUIR, terzo periodo).
// Il REGIME_A ("ante 2020") non è espressamente richiamato dalla norma:
// per default NON si applica. Vedi warning specifico nel REGIME_A.
export const APPLICA_ANZIANITA_A_REGIME_A = false;

// ─────────────────────────────────────────────────────────────────────────
// PASSO 5 — maggiorazione 5% per accessori e allestimenti extra-ACI
// ─────────────────────────────────────────────────────────────────────────

// art. 51 c.4 lett. a) TUIR, quarto periodo; per il REGIME_B: art. 2 c. 4
// D.Lgs. 148/2026, applicabile dal 1° gennaio 2026.
export const MAGGIORAZIONE_ACCESSORI = 1.05;
export const ANNO_DECORRENZA_MAGG_ACCESSORI = 2026;

// Punto interpretativo aperto, speculare a APPLICA_ANZIANITA_A_REGIME_A:
// anche la maggiorazione del 5% incrementa "il valore determinato a norma
// dei periodi primo, secondo e terzo" del nuovo testo dell'art. 51 c.4
// lett. a) TUIR, che non disciplina il regime "ante 2020". Per default
// NON si applica al REGIME_A.
export const APPLICA_ACCESSORI_A_REGIME_A = false;

// ─────────────────────────────────────────────────────────────────────────
// PASSO 8 — soglie di esenzione (limiti, non franchigie)
// ─────────────────────────────────────────────────────────────────────────

// Al superamento diventa imponibile l'intero ammontare, non solo
// l'eccedenza.
//
// La L. 207/2024 fissa queste soglie per i periodi d'imposta 2025, 2026 e
// 2027. Oltre il 2027 la disciplina va verificata: in mancanza di una
// voce per l'anno d'imposta il motore emette un ERRORE BLOCCANTE, ed è il
// comportamento voluto — meglio bloccare che applicare in silenzio soglie
// non più vigenti.
export const SOGLIE_ESENZIONE = {
  2025: { base: 1000, conFigli: 2000 },
  2026: { base: 1000, conFigli: 2000 },
  2027: { base: 1000, conFigli: 2000 },
};

// ─────────────────────────────────────────────────────────────────────────
// PASSO 1 — casi di confine (soppressione riferimento a veicoli di nuova
// immatricolazione / contratti dal 1° gennaio 2025 nel primo periodo)
// ─────────────────────────────────────────────────────────────────────────

// Punto interpretativo aperto: prima del D.Lgs. 148/2026 il caso di
// confine (stipula entro il 31/12/2025, consegna dal 01/01/2026)
// ricadeva nel criterio del valore normale (risposta AdE 192/2025). La
// soppressione, nel primo periodo della norma, del richiamo ai veicoli di
// nuova immatricolazione e ai contratti stipulati dal 1° gennaio 2025
// porta ad applicare il forfait per default, ma manca prassi
// confermativa.
//
// Il flag è CABLATO in engine.js (resolveRegime):
//   true  -> il caso di confine produce un warning e il calcolo prosegue
//            con il forfait;
//   false -> il caso di confine produce un ERRORE BLOCCANTE, perché il
//            forfait non sarebbe applicabile e il valore andrebbe
//            determinato secondo il criterio del valore normale, che è
//            fuori dallo scopo di questo strumento.
// È sovrascrivibile per singolo calcolo con
// computeFringeBenefit(input, { applicaForfaitACasiConfine: false }).
export const APPLICA_FORFAIT_A_CASI_CONFINE = true;
