# Fringe benefit auto uso promiscuo — calcolo 2026

Stato: **Fase 1 (motore di calcolo)** completata. **Fase 2A (import dati
ACI)** completata. **Fase 2B (interfaccia)** completata, in attesa di
collaudo manuale (vedi checklist in fondo a questo file).

Normativa di riferimento: art. 51 c.4 lett. a) TUIR come modificato da
L. 207/2024 e dal D.Lgs. 7 agosto 2026 n. 148 ("Decreto Omnibus", GU
n. 185 dell'11/08/2026, in vigore dal 12/08/2026).

## File presenti

- `js/config.js` — parametri normativi e flag interpretativi
- `js/engine.js` — motore di calcolo (funzioni pure, zero DOM)
- `test/cases.js` — unica fonte dei 38 casi di test e dell'asserzione automatica
- `test/run-tests.js` — runner Node senza dipendenze: `node test/run-tests.js`
- `test/engine.test.html` — stesso set di casi eseguibile nel browser
- `data-input/` — i 16 file .xlsx scaricati da aci.it (tabelle ACI 2026), input dell'import
- `tools/import-aci.js` — script di import una tantum: `data-input/*.xlsx` -> `data/aci-2026.json`
- `data/aci-2026.json` — dataset ACI reale (5.130 righe), usato dalla ricerca ACI in Fase 2B
- `js/aci.js` — ricerca fuzzy sul dataset ACI (marca+modello, con debounce)
- `js/plate.js` — validazione formato targa italiana e lookup mock (5 veicoli di collaudo)
- `js/ui.js` — orchestrazione del wizard a 4 passi, unico punto che chiama `computeFringeBenefit`
- `index.html` — struttura dei 4 passi (targa, valore base, dati contrattuali, risultato)
- `css/style.css` — stile dello strumento (zero framework, zero CDN)
- `package.json` — `"type": "module"`; `xlsx` come dev dependency solo per `tools/import-aci.js` (vedi sotto)

## Import dei dati ACI (Fase 2A)

`tools/import-aci.js` legge i 16 file .xlsx in `data-input/` (tabelle ACI
2026 scaricate da aci.it) e produce `data/aci-2026.json`, il dataset reale
usato dalla ricerca ACI in Fase 2B. Esecuzione: `node tools/import-aci.js`
(ristampa a video il report di verifica ad ogni esecuzione).

**Eccezione alla regola "zero dipendenze":** solo questo script usa il
pacchetto npm `xlsx` (SheetJS), installato come dev dependency
(`npm install --save-dev xlsx`). Serve esclusivamente a leggere i file
Excel in fase di import, gira una tantum sulla macchina dello sviluppatore
e non fa parte del codice distribuito: `index.html` e tutto ciò che gira
nel browser restano a zero dipendenze. `npm audit` segnala una
vulnerabilità nota di livello alto nel pacchetto `xlsx` di npm (prototype
pollution/ReDoS in versioni non aggiornate): accettabile per uno
strumento locale mai eseguito su input non fidato, ma da NON usare per
altri scopi né importare in codice distribuito.

### Cosa contengono davvero le tabelle scaricate (rilevante per la Fase 2B)

Le tabelle ACI 2026 di questo dataset **non riportano mai la CO2 in
g/km**. Ogni riga riporta il costo al km e il fringe benefit annuale
già ricalcolato per ciascuna fascia di coefficiente applicabile a quella
categoria di alimentazione (es. 25/30/50/60% per i veicoli termici,
10/25/30% per gli elettrici, 20/25/30% per i plug-in): non il dato CO2
del veicolo, ma il risultato del calcolo per ciascuna ipotesi di fascia.
Di conseguenza **ogni riga di `data/aci-2026.json` ha `co2: null`**: non
è un dato mancante per errore di import, è un dato assente nella fonte.
Per i veicoli che ricadono nel REGIME_B (coefficiente per fascia di CO2),
il motore richiede comunque il valore CO2 in g/km (vedi T18): la Fase 2B
dovrà quindi prevedere un campo CO2 inserito dal professionista
(es. da libretto di circolazione), non ricavabile dalla riga ACI
selezionata.

### Alimentazione: dedotta dal file di origine, non da una colonna dedicata

Nessun file ha una colonna "alimentazione" per riga. La mappatura usata
(vedi tabella per file in `tools/import-aci.js`, costante `FILES`):

| File (o sezione interna) | alimentazione |
| --- | --- |
| `*-ELETTR-*` | BEV |
| `*-Plug-in-*` | PHEV |
| `*-IBR-BZ-*`, `*-IBR-GA-*` | HEV_MHEV |
| `*-BZ-*` (senza IBR/Plug-in), `*-GA-*` (senza IBR), GPL/METANO | ICE |
| `Autoveicoli-BZ-GPL-e-IBR-BZ-GPL-IN-2026.xlsx` | per sezione interna: "BENZINA-GPL" -> ICE, "IBRIDO BENZINA-GPL" -> HEV_MHEV (unico file che mescola due regole diverse) |
| `Motoveicoli-2026.xlsx` | per sezione interna: CICLOMOTORI ELETTRICI / MOTOCICLI ELETTRICI -> BEV, MOTOCICLI IBRIDO-BENZINA -> HEV_MHEV, CICLOMOTORI / MICROCAR / MOTOCICLI -> **ICE assunto** (nessuna indicazione di alimentazione nel nome sezione) |
| `Autocaravan-2026.xlsx` | **ICE assunto** (nessuna sezione né colonna dedicata) |

Le righe con alimentazione assunta (non certa) sono 195 su 5.130 — tutte
in Motoveicoli (sezioni CICLOMOTORI/MICROCAR/MOTOCICLI) e in Autocaravan.
Non sono state escluse: sono importate con `alimentazione: "ICE"` come
assunzione dichiarata, così come richiesto, e il conteggio è riportato
dallo script ad ogni esecuzione ("Righe con alimentazione ASSUNTA").

Ogni riga di `data/aci-2026.json` porta anche **`alimentazioneCerta:
boolean`**: `true` quando l'alimentazione viene da un nome file o da
un'intestazione di sezione esplicita, `false` per le 195 righe sopra. La
Fase 2B usa questo campo per mostrare un avviso non richiudibile quando
l'utente seleziona una di queste righe.

### Altri scostamenti dallo schema originariamente ipotizzato

- **`allestimento` è sempre `""`**: i file sorgente hanno un'unica colonna
  descrittiva ("Modello", es. "GIULIA 2.0 TURBO Q4 VELOCE 280CV AWD"), non
  colonne separate da unire. Tutta la descrizione resta in `modello`.
- **`inProduzione` è `null` per `Autocaravan-2026.xlsx` e
  `Motoveicoli-2026.xlsx`**: questi due file non hanno alcun suffisso
  IN/OUT (a differenza degli altri 14), quindi lo stato di produzione non
  è deducibile dal nome file. Il campo resta tipato come booleano per gli
  altri file; la Fase 2B dovrà gestire esplicitamente il caso `null` (es.
  non mostrare il badge "in produzione/fuori produzione" per queste due
  categorie, invece di trattare `null` come falsy).
- Il dataset reale conta **16 file**, non 17: nessuna riga è stata esclusa
  per non-mappabilità (0 esclusioni su 5.130 righe lette).

## Interfaccia (Fase 2B)

Wizard a 4 passi, tutto in `index.html` (i 4 pannelli restano sempre nel
DOM, mostrati/nascosti con `[hidden]`: i dati inseriti non si perdono
muovendosi avanti e indietro tra i passi).

1. **Targa** (facoltativo) — `js/plate.js`: validazione del formato
   targa italiana, poi `lookupPlate()` (mock, 5 veicoli: BEV recente,
   ICE 2020, PHEV, diesel 2019, moto) precompila marca/modello,
   alimentazione, data prima immatricolazione, CO2. Sempre possibile
   saltare il passo. La funzione ha un `// TODO` per l'innesto di
   un'API reale, senza alcun endpoint o chiave inventati.
2. **Valore base** — ricerca ACI primaria (`js/aci.js`, fuzzy su
   marca+modello con debounce 180ms sui 5.130 righe reali), con
   conferma esplicita della riga trovata (mai selezione automatica);
   avviso non richiudibile quando `alimentazioneCerta === false`;
   nessun badge produzione quando `inProduzione === null`. Le due
   modalità manuali (costo al km / valore convenzionale annuo) sono
   dietro un toggle, visivamente secondarie, con nota di giustificazione
   obbligatoria. Campo CO2 sempre presente, mai obbligatorio a questo
   step.
3. **Dati contrattuali** — date, tipo di atto (con blocco "contratto
   originario" solo per PROROGA/RIASSEGNAZIONE), periodo di calcolo
   (l'anno d'imposta è ricavato dalla data di inizio periodo, non è un
   campo separato: evita la classe di errore da transposizione dei
   campi data adiacenti, lo stesso motivo dei controlli di coerenza
   cronologica del motore), accessori con testo esplicativo, somme
   trattenute, altri fringe benefit, qualifica, figli a carico, uso
   esclusivamente aziendale.
4. **Risultato** — tutti i campi restituiti dal motore, breakdown
   passo-passo completo (comprese le righe senza maggiorazioni), badge
   per le maggiorazioni attive, riquadro soglia di esenzione, tutti i
   warning. Alert dedicato sulla decorrenza della maggiorazione 50%
   (confrontata con la data odierna reale, non con l'anno d'imposta):
   rosso se già decorsa, arancione se entro 12 mesi, neutro altrimenti.
   Errori bloccanti: nessun risultato mostrato, elenco ben visibile con
   pulsanti per tornare ai passi 2 o 3 — eccetto l'errore "CO2 mancante"
   (REGIME_B), sostituito da un messaggio dedicato con pulsante diretto
   al passo 2, dati preservati.

La percentuale di regime non è mai inseribile a mano: la selezione del
regime e del coefficiente resta sempre del motore (`js/ui.js` chiama
`computeFringeBenefit` senza mai passare `opzioni` che la sovrascriva).

## Intestazioni di colonna nei 16 file sorgente

Elenco completo e deduplicato, per verifica manuale che il CO2 non
compaia in nessun file (prodotto da `tools/import-aci.js` ad ogni
esecuzione, sezione "Intestazioni di colonna per file"):

| File :: foglio | Intestazioni |
| --- | --- |
| Autoveicoli-BZ-IN-2026.xlsx :: Benzina IN | ID Modello, Marca, Modello, COSTO KM 15.000 KM, FRINGE BENEFIT ANNUALE (25% CK), (30% CK), (50% CK), (60% CK) |
| Autoveicoli-BZ-OUT-2026.xlsx :: Benzina OUT | idem |
| Autoveicoli-GA-IN-2026.xlsx :: Gasolio IN | idem |
| Autoveicoli-GA-OUT-2026.xlsx :: Gasolio OUT | idem |
| Autoveicoli-IBR-BZ-IN-2026.xlsx :: Ibr-benzina IN | idem |
| Autoveicoli-IBR-BZ-OUT-2026.xlsx :: Ibr-benzina OUT | idem |
| Autoveicoli-IBR-GA-IN-2026.xlsx :: Ibr-gasolio IN | idem |
| Autoveicoli-IBR-GA-OUT-2026.xlsx :: Ibr-gasolio OUT | idem |
| Autoveicoli-BZ-GPL-METANO-OUT-2026.xlsx :: Gpl Metano OUT | idem |
| Autoveicoli-BZ-GPL-e-IBR-BZ-GPL-IN-2026.xlsx :: bz-Gpl Ibr-bz-gpl IN | idem |
| Autocaravan-2026.xlsx :: Autocaravan | idem |
| Autoveicoli-Plug-in-IN-2026.xlsx :: Plug-in IN | ID Modello, Marca, Modello, COSTO KM 15.000 KM, FRINGE BENEFIT ANNUALE (20% CK), (25% CK), (30% CK) |
| Autoveicoli-Plug-in-OUT-2026.xlsx :: Plug-in OUT | idem |
| Autoveicoli-ELETTR-IN-2026.xlsx :: Elettrico IN | ID Modello, Marca, Modello, COSTO KM 15.000 KM, FRINGE BENEFIT ANNUALE (10% CK), (25% CK), (30% CK) |
| Autoveicoli-ELETTR-OUT-2026.xlsx :: Elettrico OUT | ID Modello, Marca, **MODELLO** (maiuscolo, unico file così), COSTO KM 15.000 KM, FRINGE BENEFIT ANNUALE (10% CK), (25% CK), (30% CK) |
| Motoveicoli-2026.xlsx :: Motoveicoli | ID Modello, Marca, Modello, COSTO KM 15.000 KM, FRINGE BENEFIT ANNUALE (10% CK), (25% CK), (30% CK), (50% CK) |

Nessuna intestazione, in nessun file, contiene "CO2" o "emissioni": la
scelta di co2: null in tutto il dataset non è un'assunzione, è la
lettura diretta delle 16 intestazioni.

## Collaudo manuale

Con il server statico avviato (es. `npx serve` dalla cartella del
progetto, o qualunque server statico: `data/aci-2026.json` viene
richiesto via `fetch`, quindi va servito via HTTP e non aperto come
file locale), verificare a mano:

- [ ] Salto del passo targa ("Salta, inserisco a mano") → si arriva al
      passo 2 con campi vuoti.
- [ ] Targa valida del mock (es. `FX123GH`, BEV) → precompila ricerca
      ACI, alimentazione, CO2, data immatricolazione.
- [ ] STEP 2, modalità ACI: ricerca (es. "golf"), risultati multipli,
      un solo clic NON seleziona — serve "Conferma questa riga".
- [ ] STEP 2, modalità costo al km manuale: "Avanti" resta disabilitato
      finché costo, nota e alimentazione non sono tutti compilati.
- [ ] STEP 2, modalità valore convenzionale annuo manuale: come sopra,
      e nel breakdown del risultato compare senza moltiplicazione per
      15.000.
- [ ] Una riga ACI con `alimentazioneCerta: false` (es. cercare
      "arca cia8" in Autocaravan, o un modello nelle sezioni
      CICLOMOTORI/MICROCAR/MOTOCICLI di Motoveicoli) → avviso ben
      visibile e non richiudibile.
- [ ] Una riga con `inProduzione: null` (Autocaravan o Motoveicoli) →
      nessun badge "in produzione"/"fuori produzione".
- [ ] tipoAtto = PROROGA o RIASSEGNAZIONE → compaiono i campi del
      contratto originario; con date del contratto in esame anteriori a
      quelle del contratto originario → errore bloccante.
- [ ] Caso REGIME_B (es. consegna 2023, dopo aver impostato una prima
      immatricolazione coerente) con CO2 lasciato vuoto al passo 2 →
      al passo 4 compare il messaggio dedicato ("Questo caso ricade nel
      regime emissioni…"), non il testo tecnico del motore, con
      pulsante che torna al passo 2 mantenendo i dati.
- [ ] Un caso per ciascun warning del motore: regime A (ante 2020),
      caso di confine, trattenute eccedenti, consegna anteriore alla
      stipula, valore base manuale.
- [ ] Un caso che supera la soglia di esenzione → riquadro soglia in
      evidenza (colore diverso da quello sotto soglia).
- [ ] Un caso con errore bloccante non-CO2 (es. periodo con fine
      anteriore all'inizio) → nessun risultato, elenco errori ben
      visibile, pulsanti per tornare ai passi 2 o 3.

## Fuori scopo (TODO)

- Import massivo flotte e cruscotto scadenze quinquennio
- Deducibilità 70% art. 164 TUIR e detrazione IVA
- Persistenza
- Regime del valore normale
