Costruisci una web app per il calcolo del fringe benefit auto ad uso promiscuo
secondo la normativa fiscale italiana vigente nel 2026.

═══════════════════════════════════════════════════════════════
AVVERTENZA PRELIMINARE — LEGGI PRIMA DI SCRIVERE CODICE
═══════════════════════════════════════════════════════════════
La normativa descritta qui sotto è in parte successiva al tuo knowledge
cutoff (D.Lgs. 7 agosto 2026 n. 148, "Decreto Omnibus", pubblicato in GU
n. 185 dell'11 agosto 2026, in vigore dal 12 agosto 2026).

NON usare la tua conoscenza pregressa sul fringe benefit auto.
NON "correggere" le regole che leggi qui.
NON semplificare l'albero decisionale perché ti sembra ridondante.
NON inventare dati ACI, coefficienti, endpoint API o chiavi.
Se una regola ti sembra sbagliata, implementala comunque e scrivi un
commento // DUBBIO: ... senza modificare il comportamento.

═══════════════════════════════════════════════════════════════
⛔ REGOLA DI PROCESSO — VINCOLANTE, LEGGI DUE VOLTE
═══════════════════════════════════════════════════════════════
Questo lavoro si svolge in DUE FASI separate da uno STOP obbligatorio.

FASE 1 — MOTORE DI CALCOLO
  Crei SOLO: /js/config.js, /js/engine.js, /test/engine.test.html
  e /test/run-tests.js (runner Node per l'esecuzione da terminale).
  NON creare index.html, ui.js, aci.js, plate.js, css o altro.

  Poi ESEGUI EFFETTIVAMENTE i test da terminale:
      node test/run-tests.js
  Non limitarti a scrivere i test: devi lanciarli e leggere l'output reale.
  Se un test fallisce, correggi il codice e rilancia. Ripeti finché non
  hai un risultato stabile.

  ⛔ POI FERMATI. Fine del tuo turno. Non proseguire con la Fase 2.

  Nel messaggio di stop scrivimi:
   1. L'output testuale integrale del test runner (tutti e 20 i casi,
      con atteso vs ottenuto per ciascuno).
   2. Il conteggio finale: X/20 passati.
   3. Per OGNI test fallito: la tua diagnosi, cioè se ritieni che sia un
      bug del codice oppure che il valore atteso indicato nel prompt sia
      sbagliato. Motiva. NON modificare i valori attesi dei test per
      farli passare: se pensi che un valore atteso sia errato, dimmelo
      e lascia il test rosso.
   4. Il contenuto integrale di engine.js.
   5. La riga: "In attesa di conferma per procedere alla Fase 2."

  Aspetta la mia risposta esplicita. Non interpretare il silenzio come
  autorizzazione. Non partire con la UI "tanto per portarsi avanti".
  Se sei incerto se fermarti o no: FERMATI.

FASE 2 — INTERFACCIA
  Parte solo dopo mia conferma scritta. Crea aci.js, plate.js, ui.js,
  index.html, style.css, poi tools/import-aci.js e README.

═══════════════════════════════════════════════════════════════
STACK E ARCHITETTURA
═══════════════════════════════════════════════════════════════
- HTML + JavaScript vanilla (ES modules) + CSS. Nessun framework, nessun
  build step, nessun CDN, nessuna dipendenza esterna, nessun npm install.
- Deve funzionare servendo la cartella con un semplice server statico.
- Il test runner Node non deve avere dipendenze: solo moduli built-in.
- Label e testi in italiano; nomi di variabili e funzioni in inglese.

Struttura finale prevista:
  /index.html
  /css/style.css
  /data/aci-2026.json          ← dataset ACI (fornirò io il file reale)
  /js/config.js                ← parametri normativi e flag interpretativi
  /js/engine.js                ← motore di calcolo: FUNZIONI PURE, zero DOM
  /js/aci.js                   ← ricerca e matching sul dataset ACI
  /js/plate.js                 ← lookup targa dietro interfaccia astratta
  /js/ui.js                    ← form e rendering
  /test/engine.test.html       ← test runner nel browser
  /test/run-tests.js           ← test runner Node, stessi casi
  /tools/import-aci.js         ← convertitore CSV/XLSX ACI → JSON

engine.js non deve importare nulla se non config.js. Deve essere
testabile in isolamento sia da Node sia dal browser.

═══════════════════════════════════════════════════════════════
MODELLO DATI — input del calcolo
═══════════════════════════════════════════════════════════════
{
  targa: string,
  aciRowId: string,
  costoKm: number,               // €/km dalla riga ACI selezionata
  alimentazione: "BEV" | "PHEV" | "ICE" | "HEV_MHEV",
  co2: number | null,            // g/km

  // date — TUTTE E QUATTRO SERVONO
  dataPrimaImmatricolazione: "YYYY-MM-DD",
  dataOrdineDatore:          "YYYY-MM-DD" | null,
  dataStipulaContratto:      "YYYY-MM-DD",
  dataConsegnaAlDipendente:  "YYYY-MM-DD",

  tipoAtto: "PRIMA_ASSEGNAZIONE" | "PROROGA" | "RIASSEGNAZIONE",
  contrattoOriginario: {
    dataOrdineDatore: "YYYY-MM-DD" | null,
    dataStipulaContratto: "YYYY-MM-DD",
    dataConsegnaAlDipendente: "YYYY-MM-DD"
  } | null,

  annoImposta: number,
  dataInizioPeriodo: "YYYY-MM-DD",
  dataFinePeriodo:   "YYYY-MM-DD",

  // accessori — NON È UN BOOLEANO, sono tre casi distinti
  accessoriNonAci: "ASSENTI"
                 | "ACQUISTATI_DAL_LAVORATORE"
                 | "ACQUISTATI_DALL_AZIENDA",

  sommeTrattenute: number,        // € nel periodo, IVA inclusa
  altriFringeBenefitAnno: number,
  figliFiscalmenteACarico: boolean,
  qualifica: "DIPENDENTE" | "AMMINISTRATORE" | "COLLABORATORE",
  usoEsclusivamenteAziendale: boolean
}

═══════════════════════════════════════════════════════════════
PASSO 1 — SELEZIONE DEL REGIME (cinque regimi coesistenti)
═══════════════════════════════════════════════════════════════
REGOLE PRELIMINARI SULLA STORIA DEL CONTRATTO:
- tipoAtto === "PROROGA": mera estensione temporale senza novazione.
  Determina il regime con le date di contrattoOriginario. (Circ. 10/E/2025)
- tipoAtto === "RIASSEGNAZIONE": dal D.Lgs. 148/2026 il regime segue il
  VEICOLO, non il dipendente. Usa le date di contrattoOriginario.
  ATTENZIONE: questa regola ribalta la prassi precedente (circ. 10/E/2025
  diceva l'opposto). Implementa la regola nuova.
- Altrimenti usa le date del contratto in esame.

Chiamiamo dOrdine, dStipula, dConsegna le date così risolte.

ALBERO (valuta in quest'ordine, primo match vince):

  0. usoEsclusivamenteAziendale === true
     → REGIME_E: nessun fringe benefit. Risultato 0. Stop.

  1. dStipula <= 2020-06-30
     → REGIME_A ("ante 2020"): forfait 30%.
       Warning: "Regime ante-luglio 2020. Il D.Lgs. 148/2026 non
       disciplina espressamente questa fattispecie: la maggiorazione del
       50% per anzianità NON viene applicata per default. Verifica
       manuale."

  2. dConsegna compresa tra 2020-07-01 e 2024-12-31
     → REGIME_B ("CO2")

  3. dOrdine !== null && dOrdine <= 2024-12-31
     && dConsegna compresa tra 2025-01-01 e 2025-12-31
     → REGIME_B ("CO2")
       [art. 1 c. 48-bis L. 207/2024, come sostituito dall'art. 2 c. 2
        D.Lgs. 148/2026: il termine, prima fissato al 30 giugno 2025,
        è stato esteso al 31 dicembre 2025]

  4. Tutti gli altri casi
     → REGIME_C ("alimentazione")
       Se dStipula <= 2024-12-31 && dConsegna >= 2026-01-01, warning:
       "Caso di confine. Prima del D.Lgs. 148/2026 questa fattispecie
       ricadeva nel criterio del valore normale (risposta AdE 192/2025).
       La soppressione nel primo periodo del richiamo ai veicoli di nuova
       immatricolazione e ai contratti stipulati dal 1° gennaio 2025
       porta ad applicare il forfait, ma manca prassi confermativa.
       Verifica manuale."

NOTA su "concesso in uso promiscuo": rileva la DATA DI CONSEGNA al
dipendente, non la data di firma. La concessione non è atto unilaterale
del datore: richiede l'accettazione del lavoratore, che si concretizza
sia con la sottoscrizione dell'atto di assegnazione sia con la consegna
materiale del bene. (Ris. 46/E/2020, Circ. 10/E/2025, risposta 192/2025)

Esponi una funzione che restituisce la MOTIVAZIONE della scelta (quale
ramo ha fatto match e con quali date), da mostrare in UI.

═══════════════════════════════════════════════════════════════
PASSO 2 — BASE CONVENZIONALE
═══════════════════════════════════════════════════════════════
base = costoKm * 15000

15.000 km è una percorrenza CONVENZIONALE: non dipende dai chilometri
effettivamente percorsi, né dal prezzo di acquisto o dal canone di
leasing/noleggio sostenuto dall'azienda.

═══════════════════════════════════════════════════════════════
PASSO 3 — COEFFICIENTE DI REGIME
═══════════════════════════════════════════════════════════════
REGIME_A:  30%   (unico, indipendente da alimentazione e CO2)

REGIME_B (co2 g/km — art. 51 c.4 lett. a) TUIR testo vigente al
          31.12.2024, da L. 160/2019):
   co2 <= 60            -> 25%
   co2 >  60 e <= 160   -> 30%
   co2 > 160 e <= 190   -> 50%
   co2 > 190            -> 60%
   Se co2 è null in REGIME_B → errore bloccante, non calcolare.

REGIME_C (alimentazione — art. 51 c.4 lett. a) TUIR come modificato da
          L. 207/2024 e confermato da D.Lgs. 148/2026):
   BEV       -> 10%    (batteria a trazione esclusivamente elettrica)
   PHEV      -> 20%    (ibrido plug-in)
   ICE       -> 50%    (benzina, diesel, GPL, metano)
   HEV_MHEV  -> 50%    (mild hybrid e full hybrid NON plug-in)

valore = base * coefficiente

═══════════════════════════════════════════════════════════════
PASSO 4 — MAGGIORAZIONE 50% PER ANZIANITÀ
═══════════════════════════════════════════════════════════════
[art. 51 c.4 lett. a) TUIR, terzo periodo, D.Lgs. 148/2026;
 per il REGIME_B: art. 2 c. 3 D.Lgs. 148/2026]

annoSoglia = anno(dataPrimaImmatricolazione) + 5
se annoImposta > annoSoglia:  valore = valore * 1.50

La norma dice "dopo il 31 dicembre del quinto anno successivo a quello di
prima immatricolazione". Quindi:
   immatricolazione 2020 → annoSoglia 2025 → +50% dal periodo d'imposta 2026
   immatricolazione 2021 → annoSoglia 2026 → +50% dal periodo d'imposta 2027

Si applica a REGIME_B e REGIME_C, a TUTTE le alimentazioni (BEV e PHEV
inclusi). NON si applica a REGIME_A.

Rileva ESCLUSIVAMENTE la data di prima immatricolazione. Non rilevano la
data di acquisto da parte dell'azienda, la stipula del leasing o del
noleggio, né la data di assegnazione al dipendente.

═══════════════════════════════════════════════════════════════
PASSO 5 — MAGGIORAZIONE 5% PER ACCESSORI E ALLESTIMENTI
═══════════════════════════════════════════════════════════════
[art. 51 c.4 lett. a) TUIR, quarto periodo; per il REGIME_B: art. 2 c. 4
 D.Lgs. 148/2026, applicabile dal 1° gennaio 2026]

se accessoriNonAci === "ACQUISTATI_DALL_AZIENDA" && annoImposta >= 2026:
    valore = valore * 1.05

TABELLA DA IMPLEMENTARE ESATTAMENTE COSÌ:
  ASSENTI                     → nessuna maggiorazione
  ACQUISTATI_DAL_LAVORATORE   → nessuna maggiorazione
  ACQUISTATI_DALL_AZIENDA     → +5%, ANCHE se l'azienda riaddebita poi
                                l'importo al dipendente

È il punto in cui è più facile sbagliare: la maggiorazione viene meno SOLO
se l'accessorio è stato acquistato direttamente dal lavoratore. Se lo
compra l'azienda e poi lo trattiene in busta paga, il +5% resta dovuto e
in più la trattenuta riduce il valore al passo 7.

Le tabelle ACI includono soltanto le dotazioni di serie previste dal
costruttore per il modello e l'allestimento di riferimento; ogni optional
ulteriore è "non valorizzato nelle tabelle ACI".

Il +5% si applica DOPO il +50%, mai prima: la norma incrementa "il valore
determinato a norma dei periodi primo, secondo e terzo".

═══════════════════════════════════════════════════════════════
PASSO 6 — RAGGUAGLIO AI GIORNI
═══════════════════════════════════════════════════════════════
giorni = giorni di effettiva assegnazione ricadenti nell'anno d'imposta,
         estremi inclusi
valore = valore * giorni / 365
Usa 365 anche negli anni bisestili (config: GIORNI_ANNO = 365).

═══════════════════════════════════════════════════════════════
PASSO 7 — SOMME TRATTENUTE AL DIPENDENTE
═══════════════════════════════════════════════════════════════
trattenutaDeducibile   = min(sommeTrattenute, valore)
eccedenzaNonDeducibile = max(0, sommeTrattenute - valore)
valore = valore - trattenutaDeducibile     // mai negativo

[Risposta AdE n. 14/2026] La previsione "al netto delle somme
eventualmente trattenute al dipendente" va interpretata in senso
restrittivo: la riduzione è ammessa esclusivamente per le somme richieste
al lavoratore quale corrispettivo per l'uso personale del veicolo,
determinate sulla base del valore convenzionale. Le ulteriori somme con
cui il dipendente concorre a coprire il costo effettivo sostenuto
dall'azienda non riducono il benefit.

Se eccedenzaNonDeducibile > 0, warning:
"Trattenute eccedenti il valore convenzionale per € X. Non riducono il
fringe benefit e vanno valutate separatamente (risposta AdE 14/2026)."

Il D.Lgs. 148/2026 ha aggiunto al primo periodo che sono deducibili anche
le somme trattenute "relative agli accessori e allestimenti": includile in
sommeTrattenute.

═══════════════════════════════════════════════════════════════
PASSO 8 — VERIFICA SOGLIA DI ESENZIONE
═══════════════════════════════════════════════════════════════
soglia = figliFiscalmenteACarico ? 2000 : 1000     // valori 2026
totaleBenefit = fringeBenefitAuto + altriFringeBenefitAnno

se totaleBenefit > soglia:  imponibile = totaleBenefit   // TUTTO
altrimenti:                 imponibile = 0

Sono LIMITI DI ESENZIONE, non franchigie: al superamento diventa
imponibile l'intero ammontare, non solo l'eccedenza.

═══════════════════════════════════════════════════════════════
OUTPUT DEL MOTORE
═══════════════════════════════════════════════════════════════
  regime, motivazioneRegime, coefficiente, motivazioneCoefficiente,
  breakdown: [ {passo, descrizione, operazione, valoreDopo}, ... ],
  fringeBenefitAnnuo, fringeBenefitMensile,
  maggiorazione50Applicata, maggiorazione5Applicata,
  annoDecorrenzaMaggiorazione50,      // 1° gennaio di annoSoglia + 1
  eccedenzaNonDeducibile,
  soglia, totaleBenefit, superaSoglia, imponibileDopoSoglia,
  warnings: [], errors: []

═══════════════════════════════════════════════════════════════
TEST OBBLIGATORI — 20 casi, da eseguire davvero
═══════════════════════════════════════════════════════════════
/test/run-tests.js: runner Node senza dipendenze. Stampa per ogni caso
id, esito, valore atteso, valore ottenuto, e in coda il conteggio X/20.
/test/engine.test.html: stesso set, eseguibile nel browser.

T1  REGIME_C, BEV, costoKm 0,45; immatr. 15/03/2024; ordine 10/01/2025;
    stipula 10/11/2025; consegna 01/12/2025; anno 2026; 365 gg;
    accessori ASSENTI; trattenute 0
    → regime C, coeff 10%, atteso 675,00

T2  REGIME_B, ICE, co2 145, costoKm 0,60; immatr. 20/09/2020;
    ordine 15/11/2024; stipula 20/01/2025; consegna 05/02/2025;
    anno 2026; 365 gg
    → regime B, coeff 30%, +50% attivo, atteso 4.050,00

T3  come T2 ma accessori ACQUISTATI_DALL_AZIENDA → atteso 4.252,50

T4  come T3 ma trattenute 1.000
    → atteso 3.252,50, eccedenzaNonDeducibile 0

T5  come T2 ma accessori ACQUISTATI_DAL_LAVORATORE
    → atteso 4.050,00, maggiorazione5Applicata = false

T6  REGIME_C, PHEV, costoKm 0,50; immatr. 10/06/2025;
    consegna 01/07/2026; anno 2026; periodo 01/07–31/12 (184 gg)
    → coeff 20%, atteso 756,16

T7  ordine 10/02/2025, consegna 01/04/2025 → regime C (non salvaguardia)

T8  ordine 15/11/2024, consegna 20/09/2025 → regime B
    (verifica l'estensione al 31/12/2025 introdotta dall'Omnibus: con le
     regole ante-Omnibus questo caso sarebbe uscito dalla salvaguardia)

T9  consegna 10/03/2023 → regime B

T10 stipula 15/05/2020, consegna 01/06/2020, immatr. 2019
    → regime A, coeff 30%, NESSUN +50%, warning presente

T11 PROROGA nel 2026 di contratto originario con consegna 10/03/2023
    → regime B (usa le date del contratto originario)

T12 RIASSEGNAZIONE nel 2026 di veicolo consegnato al primo dipendente il
    01/06/2023 → regime B (il regime segue il veicolo)

T13 trattenute 1.500 su valore 1.000
    → risultato 0,00 (mai negativo), eccedenzaNonDeducibile 500

T14 soglia: FB auto 1.900 + altri 300, senza figli a carico
    → superaSoglia true, imponibileDopoSoglia 2.200 (non 1.200)

T15 soglia: FB auto 780, altri 0, senza figli
    → superaSoglia false, imponibileDopoSoglia 0

T16 confini CO2: 60→25%, 61→30%, 160→30%, 161→50%, 190→50%, 191→60%

T17 confini anzianità: immatr. 2021 con anno 2026 → nessun +50%;
    stesso veicolo con anno 2027 → +50%

T18 REGIME_B senza co2 → errore bloccante, nessun calcolo

T19 usoEsclusivamenteAziendale true → risultato 0, regime E

T20 stipula 27/12/2024, consegna 15/03/2026
    → regime C con warning sul caso di confine

Per i test in cui un dato non è specificato, usa valori neutri e
documentali in un commento nel file di test.

═══════════════════════════════════════════════════════════════
config.js — PARAMETRI E FLAG INTERPRETATIVI
═══════════════════════════════════════════════════════════════
Ogni costante con commento del riferimento normativo:
  PERCORRENZA_CONVENZIONALE = 15000
  GIORNI_ANNO = 365
  ANNI_SOGLIA_ANZIANITA = 5      // lettura prevalente; nessuna prassi AdE
                                 // ancora sul D.Lgs. 148/2026
  MAGGIORAZIONE_ANZIANITA = 1.50
  MAGGIORAZIONE_ACCESSORI = 1.05
  ANNO_DECORRENZA_MAGG_ACCESSORI = 2026
  SOGLIE_ESENZIONE = { 2026: { base: 1000, conFigli: 2000 } }
  COEFFICIENTI_ALIMENTAZIONE, FASCE_CO2, COEFFICIENTE_ANTE_2020
  APPLICA_ANZIANITA_A_REGIME_A = false   // punto interpretativo aperto
  APPLICA_FORFAIT_A_CASI_CONFINE = true  // punto interpretativo aperto

═══════════════════════════════════════════════════════════════
VINCOLI GENERALI
═══════════════════════════════════════════════════════════════
- Ogni regola fiscale ha un commento con il riferimento normativo o di
  prassi (es. // art. 51 c.4 lett. a) TUIR, quarto periodo — D.Lgs.
  148/2026).
- Arrotondamento a 2 decimali SOLO in output. Mai nei calcoli intermedi.
- Se manca un dato necessario, blocca con messaggio esplicito. Mai
  default silenziosi.
- La disciplina si applica anche ad amministratori e collaboratori: la
  qualifica non cambia il calcolo ma va riportata nell'output.
- Sono in ambito anche motocicli e ciclomotori.
- Disclaimer in footer (Fase 2): strumento di supporto al professionista,
  non sostituisce la verifica del caso concreto; valori non ufficiali.

═══════════════════════════════════════════════════════════════
SPECIFICHE FASE 2 — non implementare ora, servono dopo la conferma
═══════════════════════════════════════════════════════════════
UI a 4 step:
  1. Targa → lookupPlate() precompila marca, modello, alimentazione, data
     prima immatricolazione, CO2. Deve essere possibile saltare la targa
     e inserire tutto a mano. plate.js espone
     `async function lookupPlate(plate)` con implementazione MOCK (5
     veicoli di esempio: BEV recente, ICE 2020, PHEV, diesel 2019, moto)
     e un // TODO commentato per l'API reale. Non inventare endpoint o
     chiavi. Valida il formato targa italiana prima di chiamare.
  2. Riga ACI: autocomplete su marca+modello+allestimento, matching fuzzy
     (normalizza maiuscole, accenti, spazi, punteggiatura; scoring su
     token). La riga selezionata va SEMPRE confermata esplicitamente
     dall'utente: mai selezione automatica silenziosa.
  3. Dati contrattuali: le quattro date, tipoAtto (i campi del contratto
     originario compaiono solo se PROROGA o RIASSEGNAZIONE), periodo,
     accessori (radio a tre opzioni con testo esplicativo), trattenute,
     altri fringe benefit, figli a carico, qualifica.
  4. Risultato: valore annuo e mensile in evidenza; regime con
     motivazione discorsiva; breakdown degli 8 passi; badge "+50%
     anzianità" e "+5% accessori"; riquadro soglia; tutti i warning.
     ★ ALERT PRINCIPALE: data in cui scatterà il +50% (1° gennaio di
     annoSoglia + 1) e di quanto salirà il benefit. Arancione se mancano
     meno di 12 mesi; rosso se già scattata, con nota "verificare la
     posizione del lavoratore entro le operazioni di conguaglio".

/data/aci-2026.json:
  { "annoTabella": 2026,
    "fonte": "Comunicato Agenzia delle Entrate, GU n. 297 del 23/12/2025,
              S.O. n. 40",
    "righe": [ { "id", "marca", "modello", "allestimento",
                 "alimentazione", "co2", "costoKm", "esempio": true } ] }
  Crea 10 righe di ESEMPIO con "esempio": true e valori palesemente
  fittizi. Non scaricare né inventare dati ACI reali.
  Se annoTabella ≠ annoImposta → warning bloccante.
  COMMENTA NEL CODICE: le tabelle ACI 2026 contengono colonne con importi
  di fringe benefit già precalcolati. NON usarle: sono anteriori al
  D.Lgs. 148/2026 e non incorporano le maggiorazioni del 50% e del 5%.
  Usa solo il costo chilometrico e ricalcola.

/tools/import-aci.js: script Node senza dipendenze, legge un CSV
esportato dalle tabelle ACI e produce il JSON nello schema sopra.
Gestisci la virgola decimale italiana. Documenta nel README le colonne
da mappare.

FUORI SCOPO (solo TODO nel README): import massivo flotte e cruscotto
scadenze quinquennio; deducibilità 70% art. 164 TUIR e detrazione IVA;
persistenza; regime del valore normale.

═══════════════════════════════════════════════════════════════
RIEPILOGO: COSA DEVI FARE ADESSO
═══════════════════════════════════════════════════════════════
Solo Fase 1: config.js, engine.js, run-tests.js, engine.test.html.
Esegui `node test/run-tests.js`. Correggi. Rilancia.
Riportami output integrale, conteggio X/20, diagnosi dei falliti,
engine.js completo, e fermati in attesa di conferma.