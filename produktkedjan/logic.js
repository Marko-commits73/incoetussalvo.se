/*
 * Produktkedjan – ren data och uträkning, utan DOM.
 *
 * För att lägga till en marknad: lägg ett objekt i MARKETS.
 * Amazon.se är standard. Amazon.de ligger med som nästa marknad.
 * Avgiftssidorna i FEE_LINKS gäller Amazon.se. Belopp fylls aldrig i
 * automatiskt, oavsett marknad.
 */
var Produktkedjan = (function () {
  "use strict";

  var FEE_LINKS = Object.freeze({
    calculator: "https://sellercentral.amazon.se/revcalpublic",
    prices: "https://sell.amazon.se/priser",
    fba: "https://sell.amazon.se/fulfilment-by-amazon",
    vat: "https://sell.amazon.se/lara-sig/moms-resurser"
  });

  var MARKETS = Object.freeze([
    Object.freeze({ id: "amazon.se", label: "Amazon.se", currency: "SEK" }),
    Object.freeze({ id: "amazon.de", label: "Amazon.de", currency: "EUR" })
  ]);

  var STATUS_LABELS = Object.freeze({
    not_started: "Ej påbörjad",
    in_progress: "Pågår",
    done: "Klar",
    blocked: "Blockerad"
  });

  var STATUS_ORDER = Object.freeze(["not_started", "in_progress", "done", "blocked"]);

  var SEASONS = Object.freeze([
    Object.freeze({ id: "", label: "Inte angiven" }),
    Object.freeze({ id: "jamn", label: "Jämn över året" }),
    Object.freeze({ id: "hog", label: "Högsäsong just nu" }),
    Object.freeze({ id: "lag", label: "Lågsäsong just nu" }),
    Object.freeze({ id: "topp", label: "Tydlig topp och dal" }),
    Object.freeze({ id: "osaker", label: "Osäker" })
  ]);

  var CRITERIA = Object.freeze([
    Object.freeze({
      id: "sizeWeight",
      label: "Storlek och vikt",
      help: "Hög poäng: liten och lätt att lagra. Låg poäng: skrymmande eller tung."
    }),
    Object.freeze({
      id: "margin",
      label: "Uppskattad marginal",
      help: "Hög poäng: du tror att bidraget räcker efter inköp, frakt, tull och avgifter. Det här är en bedömning. Själva kalkylen görs i steg 3."
    }),
    Object.freeze({
      id: "competition",
      label: "Konkurrens",
      help: "Hög poäng: du ser ett glapp. Låg poäng: många liknande erbjudanden och svårt att synas."
    }),
    Object.freeze({
      id: "complexity",
      label: "Komplexitet och returrisk",
      help: "Hög poäng: enkel vara med låg risk att kunden skickar tillbaka den. Låg poäng: ömtålig, storleksberoende eller svår att förklara."
    }),
    Object.freeze({
      id: "startupCost",
      label: "Startkostnad",
      help: "Hög poäng: prov, första order och märkning ryms i en liten budget. Låg poäng: högt minsta orderantal eller dyra verktyg."
    })
  ]);

  var DEFAULT_WEIGHTS = Object.freeze({
    sizeWeight: "20",
    margin: "25",
    competition: "20",
    complexity: "20",
    startupCost: "15"
  });

  function step(id, title, summary, intro) {
    return Object.freeze({ id: id, title: title, summary: summary, intro: intro });
  }

  var STEPS = Object.freeze([
    step(1, "Produktidé & kriterier", "En liten vara som är lätt att lagra och som tål avgifter.",
      "Välj en vara som är liten, lätt att lagra och som fortfarande ger bidrag när avgifterna är med. Poängen är din bedömning. En hög siffra betyder ett bättre läge för en liten start."),
    step(2, "Efterfrågevalidering", "Anteckna det du själv ser. Inga påhittade försäljningssiffror.",
      "Skriv bara det du själv har sett på marknaden: sökord, pris på sidan, hur många liknande erbjudanden du räknar och om varan verkar följa säsong. Verktyget har ingen koppling till Amazon och fyller inte i försäljning, rank eller sökvolym."),
    step(3, "Marginal- & FBA-kalkyl", "Alla belopp skrivs in för hand.",
      "Alla belopp skriver du in själv. Hämta avgifterna hos Amazon och lägg in dem här. Ett tomt fält betyder att värdet saknas. Skriv 0 bara när kostnaden verkligen är noll."),
    step(4, "Leverantörer & offerter", "Jämför villkor, inte bara styckpris.",
      "Lägg in offerterna som de är skrivna. Lägsta styckpris är sällan hela svaret när minsta order, ledtid och villkor skiljer sig. Markera en favorit när du vet varför."),
    step(5, "Prover & kvalitet", "Mät provet. Jämför med offerten.",
      "Ett prov är billigare än en felaktig pall. Mät det som anländer och jämför med det offerten utlovade."),
    step(6, "Moms & marknadsplatser", "Påminnelse. Inte skatterådgivning.",
      "Det här steget är en påminnelse och är inte skatterådgivning. Reglerna beror på hur du säljer och var lagret står. Läs Amazons egen samling och prata med en rådgivare innan du låser ett upplägg."),
    step(7, "Frakt till FBA", "Du äger kedjan fram till Amazons lager.",
      "Du äger kedjan fram till Amazons lager. FBA lagrar varan och skickar den till kunden efter att inleveransen är mottagen."),
    step(8, "Prep & etikettering (FNSKU)", "Rätt kod ska gå att skanna.",
      "FNSKU är Amazons kod för just din vara. När enheten ska använda FNSKU täcker etiketten annan streckkod, så att lagret skannar rätt kod. Prep-kraven beror på kategori och förpackning, så kontrollera dem i Seller Central för den här varan."),
    step(9, "Listing", "Tydlig för köparen och sökbar på orden du validerade.",
      "Listningen ska gå att förstå snabbt och gå att hitta med orden du skrev upp i valideringen. Lova bara det som provet klarar."),
    step(10, "Lansering & ranking", "Bygg så att bidraget håller även när en tidig synlighet avtar.",
      "Placeringen påverkas av sådant som syns utifrån: att varan finns i lager, att listningen matchar sökningen och att den säljer. Ett nytt konto kan synas mer i början. Räkna med att den lyften kan avta, och bygg pris, lager och annons så att bidraget håller ändå. Verktyget lovar ingen placering."),
    step(11, "Uppföljning", "Jämför veckan med kalkylen.",
      "Jämför det som hände med kalkylen. En kort genomgång i veckan räcker i början.")
  ]);

  function item(id, label) {
    return Object.freeze({ id: id, label: label });
  }

  var CHECKLISTS = Object.freeze({
    5: Object.freeze([
      item("5-order", "Beställ prov från mer än en leverantör om du jämför offerter."),
      item("5-matt", "Mät längd, bredd, höjd och vikt på det förpackade provet."),
      item("5-material", "Kontrollera material, färg, lukt och sådant som syns på nära håll."),
      item("5-anvand", "Använd provet så som en kund skulle använda det."),
      item("5-andring", "Skriv vad som måste ändras innan en större beställning."),
      item("5-foto", "Spara foto och datum för det prov du godkänner.")
    ]),
    6: Object.freeze([
      item("6-las", "Läs Amazons momsresurser för den försäljning du planerar."),
      item("6-registrering", "Ta reda på om du behöver vara momsregistrerad. Fråga en rådgivare om du är osäker."),
      item("6-uppgifter", "Gå igenom vilka skatteuppgifter den valda marknaden ber om i Seller Central."),
      item("6-konto", "Skapa eller uppdatera säljarkontot för marknaden i produktprofilen."),
      item("6-beslut", "Skriv ned beslut och datum, så du kan hitta dem igen.")
    ]),
    7: Object.freeze([
      item("7-frakt", "Räkna frakt per enhet och skriv in den i marginalkalkylen."),
      item("7-plan", "Skapa en inleverans i Seller Central när konto och vara finns."),
      item("7-jamfor", "Jämför egen transport med det alternativ Amazon visar i inleveransen."),
      item("7-mark", "Märk kartongerna med de etiketter inleveransen kräver."),
      item("7-mottagen", "Följ sändningen tills lagret har tagit emot den."),
      item("7-id", "Notera sändnings-id och vilket lager du skickade till.")
    ]),
    8: Object.freeze([
      item("8-val", "Avgör om enheten ska märkas med FNSKU eller om tillverkarens streckkod ska användas."),
      item("8-etikett", "Skriv ut etiketter och fäst dem plant. Täck annan streckkod när FNSKU ska användas."),
      item("8-skydd", "Kontrollera om varan behöver påse, kvävningsvarning eller extra skydd."),
      item("8-mall", "Packa en kartong som mall innan du märker hela sändningen."),
      item("8-foto", "Fota en färdig enhet och skriv var bilden finns.")
    ]),
    9: Object.freeze([
      item("9-titel", "Skriv en titel med produkttyp och den detalj som skiljer varan, på ett språk köparen förstår."),
      item("9-punkter", "Skriv punkter där varje punkt börjar med en nytta och sedan fakta: mått, material och vad som ingår."),
      item("9-text", "Skriv en beskrivning som svarar på vanliga frågor, utan påståenden du inte kan belägga."),
      item("9-bild", "Gör en huvudbild på vit bakgrund och fler bilder för mått, användning och detalj."),
      item("9-sok", "Fyll i sökord utifrån valideringen, utan att upprepa titeln."),
      item("9-pris", "Sätt pris från kalkylen. Kontrollera om beloppet i listningen är med eller utan moms."),
      item("9-kategori", "Kontrollera kategori och varumärke mot varan du faktiskt skickar.")
    ]),
    10: Object.freeze([
      item("10-lager", "Starta annonser först när lagret är mottaget och varan går att köpa."),
      item("10-placering", "Följ de sökord du validerade och skriv upp placeringen varje vecka."),
      item("10-budget", "Sätt en annonsbudget du kan avvara och för in kostnaden per enhet i kalkylen."),
      item("10-fragor", "Läs frågor från köpare och rätta listningen om något är otydligt."),
      item("10-omdomen", "Följ Amazons regler för omdömen. Köp inte recensioner."),
      item("10-lyft", "Notera om den tidiga synligheten avtar, så du inte tar en tillfällig topp för normalnivå.")
    ]),
    11: Object.freeze([
      item("11-jamfor", "Jämför verklig intäkt och kostnad per enhet med marginalkalkylen."),
      item("11-lager", "Notera lagersaldo och om lagringsavgiften börjar sticka iväg."),
      item("11-retur", "Skriv upp returer: antal och orsak."),
      item("11-annons", "Räkna annonskostnad per order och uppdatera kalkylen."),
      item("11-nasta", "Lägg nästa beställning i tid om marginalen fortfarande håller, med ledtiden inräknad."),
      item("11-beslut", "Bestäm om du skalar, justerar eller avvecklar."),
      item("11-backup", "Exportera en backup när du ändrat något viktigt.")
    ])
  });

  var MARGIN_FIELDS = Object.freeze([
    Object.freeze({ id: "salesPriceExVat", label: "Försäljningspris exkl. moms", group: "sale" }),
    Object.freeze({ id: "purchasePrice", label: "Inköpspris", group: "landed" }),
    Object.freeze({ id: "freightIn", label: "Frakt in", group: "landed" }),
    Object.freeze({ id: "customs", label: "Tull och import", group: "landed" }),
    Object.freeze({ id: "fbaFee", label: "FBA-fullgörandeavgift", group: "fee" }),
    Object.freeze({ id: "storagePerUnit", label: "Lagring per enhet", group: "fee" }),
    Object.freeze({ id: "referralValue", label: "Referralavgift", group: "fee" }),
    Object.freeze({ id: "adsPerUnit", label: "Annons per enhet", group: "other" }),
    Object.freeze({ id: "otherCosts", label: "Övriga kostnader", group: "other" })
  ]);

  var MARGIN_LABEL = {};
  MARGIN_FIELDS.forEach(function (field) {
    MARGIN_LABEL[field.id] = field.label;
  });

  function clip(value, max) {
    var text = typeof value === "string" ? value : value == null ? "" : String(value);
    return text.length > max ? text.slice(0, max) : text;
  }

  function clipDate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  }

  function parseAmount(raw) {
    if (raw == null) return null;
    var text = String(raw).trim().replace(/\s/g, "").replace(",", ".");
    if (text === "") return null;
    if (!/^-?\d+(\.\d+)?$/.test(text)) return NaN;
    var number = Number(text);
    return Number.isFinite(number) ? number : NaN;
  }

  function ore(amount) {
    var sign = amount < 0 ? -1 : 1;
    return sign * Math.round(Math.abs(amount) * 100 + 1e-8);
  }

  function fromOre(minor) {
    return minor / 100;
  }

  function marketById(id) {
    for (var i = 0; i < MARKETS.length; i++) {
      if (MARKETS[i].id === id) return MARKETS[i];
    }
    return null;
  }

  function emptyScores() {
    var scores = {};
    CRITERIA.forEach(function (criterion) {
      scores[criterion.id] = "";
    });
    return scores;
  }

  function emptyMargin() {
    return {
      salesPriceExVat: "",
      purchasePrice: "",
      freightIn: "",
      customs: "",
      fbaFee: "",
      storagePerUnit: "",
      referralMode: "amount",
      referralValue: "",
      adsPerUnit: "",
      otherCosts: ""
    };
  }

  function checklistRow(template, prev) {
    return {
      id: template.id,
      label: template.label,
      custom: false,
      done: !!(prev && prev.done === true),
      date: clipDate(prev && prev.date),
      notes: clip(prev && prev.notes, 2000),
      link: clip(prev && prev.link, 2000)
    };
  }

  function normalizeChecklist(saved) {
    var out = {};
    Object.keys(CHECKLISTS).forEach(function (key) {
      var stepId = Number(key);
      var incoming = saved && Array.isArray(saved[stepId]) ? saved[stepId] : saved && Array.isArray(saved[key]) ? saved[key] : [];
      var byId = {};
      incoming.forEach(function (entry) {
        if (entry && typeof entry.id === "string") byId[entry.id] = entry;
      });
      var rows = CHECKLISTS[stepId].map(function (template) {
        return checklistRow(template, byId[template.id]);
      });
      incoming.forEach(function (entry) {
        if (!entry || entry.custom !== true || typeof entry.id !== "string") return;
        if (rows.some(function (row) { return row.id === entry.id; })) return;
        rows.push({
          id: clip(entry.id, 80),
          label: clip(entry.label, 300) || "Egen punkt",
          custom: true,
          done: entry.done === true,
          date: clipDate(entry.date),
          notes: clip(entry.notes, 2000),
          link: clip(entry.link, 2000)
        });
      });
      out[stepId] = rows.slice(0, 60);
    });
    return out;
  }

  function normalizeSteps(saved) {
    var out = {};
    STEPS.forEach(function (definition) {
      var prev = saved && (saved[definition.id] || saved[String(definition.id)]) || {};
      var status = STATUS_ORDER.indexOf(prev.status) >= 0 ? prev.status : "not_started";
      out[definition.id] = {
        status: status,
        nextAction: clip(prev.nextAction, 1000),
        blockers: clip(prev.blockers, 1000)
      };
    });
    return out;
  }

  function normalizeProfile(raw) {
    var prev = raw && typeof raw === "object" ? raw : {};
    var marketId = typeof prev.marketId === "string" && prev.marketId ? clip(prev.marketId, 40) : "amazon.se";
    var vat = prev.targetPriceVat === "inkl" ? "inkl" : "exkl";
    return {
      workingName: clip(prev.workingName, 160),
      lengthCm: clip(prev.lengthCm, 40),
      widthCm: clip(prev.widthCm, 40),
      heightCm: clip(prev.heightCm, 40),
      weightG: clip(prev.weightG, 40),
      targetPrice: clip(prev.targetPrice, 40),
      targetPriceVat: vat,
      marketId: marketId
    };
  }

  function normalizeCriteria(raw) {
    var prev = raw && typeof raw === "object" ? raw : {};
    var weights = {};
    var scores = {};
    var prevWeights = prev.weights && typeof prev.weights === "object" ? prev.weights : {};
    var prevScores = prev.scores && typeof prev.scores === "object" ? prev.scores : {};
    CRITERIA.forEach(function (criterion) {
      var weight = prevWeights[criterion.id];
      weights[criterion.id] = weight == null || weight === "" ? DEFAULT_WEIGHTS[criterion.id] : clip(weight, 20);
      scores[criterion.id] = clip(prevScores[criterion.id], 8);
    });
    return {
      threshold: prev.threshold == null || prev.threshold === "" ? "3.5" : clip(prev.threshold, 20),
      weights: weights,
      scores: scores
    };
  }

  function normalizeSources(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 40).map(function (entry, index) {
      var item = entry && typeof entry === "object" ? entry : {};
      return {
        id: clip(item.id, 80) || "source-" + (index + 1),
        label: clip(item.label, 200),
        url: clip(item.url, 2000)
      };
    }).filter(function (entry) {
      return entry.label || entry.url;
    });
  }

  function normalizeValidation(raw) {
    var prev = raw && typeof raw === "object" ? raw : {};
    var season = SEASONS.some(function (option) { return option.id === prev.seasonality; }) ? prev.seasonality : "";
    return {
      keywords: clip(prev.keywords, 4000),
      observedPrice: clip(prev.observedPrice, 40),
      similarOffers: clip(prev.similarOffers, 40),
      seasonality: season,
      notes: clip(prev.notes, 4000),
      sources: normalizeSources(prev.sources)
    };
  }

  function normalizeMargin(raw) {
    var prev = raw && typeof raw === "object" ? raw : {};
    var margin = emptyMargin();
    MARGIN_FIELDS.forEach(function (field) {
      margin[field.id] = clip(prev[field.id], 40);
    });
    margin.referralMode = prev.referralMode === "percent" ? "percent" : "amount";
    return margin;
  }

  function normalizeSuppliers(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 100).map(function (entry, index) {
      var item = entry && typeof entry === "object" ? entry : {};
      return {
        id: clip(item.id, 80) || "supplier-" + (index + 1),
        name: clip(item.name, 160),
        moq: clip(item.moq, 80),
        unitPrice: clip(item.unitPrice, 80),
        leadTime: clip(item.leadTime, 80),
        paymentTerms: clip(item.paymentTerms, 200),
        shippingTerms: clip(item.shippingTerms, 200),
        notes: clip(item.notes, 2000),
        favorite: item.favorite === true
      };
    });
  }

  function normalizeGate(raw) {
    var prev = raw && typeof raw === "object" ? raw : {};
    var hash = typeof prev.hash === "string" ? prev.hash : "";
    var enabled = prev.enabled === true && /^[a-z0-9:]{8,128}$/i.test(hash);
    return { enabled: enabled, hash: enabled ? hash : "" };
  }

  function defaultState() {
    return {
      version: 1,
      profile: normalizeProfile({}),
      steps: normalizeSteps({}),
      criteria: normalizeCriteria({}),
      validation: normalizeValidation({}),
      margin: normalizeMargin({}),
      suppliers: [],
      checklists: normalizeChecklist({}),
      gate: { enabled: false, hash: "" }
    };
  }

  function normalize(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Filen innehåller inte en objektstruktur.");
    }
    if (raw.version == null) throw new Error("Filen saknar version och kan inte läsas.");
    if (raw.version !== 1) {
      throw new Error("Filen är från version " + String(raw.version) + ". Det här verktyget läser version 1.");
    }
    return {
      version: 1,
      profile: normalizeProfile(raw.profile),
      steps: normalizeSteps(raw.steps),
      criteria: normalizeCriteria(raw.criteria),
      validation: normalizeValidation(raw.validation),
      margin: normalizeMargin(raw.margin),
      suppliers: normalizeSuppliers(raw.suppliers),
      checklists: normalizeChecklist(raw.checklists),
      gate: normalizeGate(raw.gate)
    };
  }

  function toDocument(state) {
    return {
      version: 1,
      profile: state.profile,
      steps: state.steps,
      criteria: state.criteria,
      validation: state.validation,
      margin: state.margin,
      suppliers: state.suppliers,
      checklists: state.checklists,
      gate: state.gate
    };
  }

  function formatSv(number, digits) {
    return new Intl.NumberFormat("sv-SE", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(number);
  }

  function calcMargin(margin) {
    var values = {};
    var invalid = [];
    var missing = [];
    MARGIN_FIELDS.forEach(function (field) {
      var parsed = parseAmount(margin[field.id]);
      values[field.id] = parsed;
      if (typeof parsed === "number" && Number.isNaN(parsed)) invalid.push(field.id);
      else if (parsed == null) missing.push(field.id);
    });
    var mode = margin.referralMode === "percent" ? "percent" : "amount";
    var result = {
      ok: invalid.length === 0,
      invalid: invalid,
      missing: missing,
      mode: mode,
      complete: false,
      landedCost: null,
      referralAmount: null,
      totalDeductions: null,
      contribution: null,
      marginPct: null,
      warnings: []
    };
    if (!result.ok) return result;

    var sales = values.salesPriceExVat;
    var landedReady = ["purchasePrice", "freightIn", "customs"].every(function (id) {
      return values[id] != null;
    });
    if (landedReady) {
      result.landedCost = fromOre(ore(values.purchasePrice) + ore(values.freightIn) + ore(values.customs));
    }
    if (values.referralValue != null && mode === "amount") {
      result.referralAmount = fromOre(ore(values.referralValue));
    } else if (values.referralValue != null && sales != null && mode === "percent") {
      result.referralAmount = fromOre(Math.round(ore(sales) * values.referralValue / 100));
    }

    var moneyIds = ["purchasePrice", "freightIn", "customs", "fbaFee", "storagePerUnit", "adsPerUnit", "otherCosts"];
    var moneyReady = moneyIds.every(function (id) { return values[id] != null; }) && result.referralAmount != null && sales != null;
    if (moneyReady) {
      var deductions = ore(values.purchasePrice) + ore(values.freightIn) + ore(values.customs) +
        ore(values.fbaFee) + ore(values.storagePerUnit) + ore(result.referralAmount) +
        ore(values.adsPerUnit) + ore(values.otherCosts);
      var salesOre = ore(sales);
      var contributionOre = salesOre - deductions;
      result.totalDeductions = fromOre(deductions);
      result.contribution = fromOre(contributionOre);
      result.marginPct = salesOre === 0 ? null : (contributionOre / salesOre) * 100;
      result.complete = true;
    }

    if (sales != null && sales < 0) result.warnings.push("Försäljningspriset är negativt.");
    if (sales === 0 && moneyReady) result.warnings.push("Marginalen går inte att räkna när försäljningspriset är 0.");
    ["purchasePrice", "freightIn", "customs", "fbaFee", "storagePerUnit", "adsPerUnit", "otherCosts"].forEach(function (id) {
      if (values[id] != null && values[id] < 0 && result.warnings.indexOf("En kostnad är negativ, och det ökar bidraget.") < 0) {
        result.warnings.push("En kostnad är negativ, och det ökar bidraget.");
      }
    });
    if (mode === "percent" && values.referralValue != null && values.referralValue > 100) {
      result.warnings.push("Referralavgiften är över 100 %.");
    }
    return result;
  }

  function parseScore(raw) {
    if (raw == null || String(raw).trim() === "") return null;
    if (!/^[1-5]$/.test(String(raw).trim())) return NaN;
    return Number(raw);
  }

  function calcCriteria(criteria) {
    var invalid = [];
    var missingScores = [];
    var missingWeights = [];
    var weightSum = 0;
    var weighted = 0;
    var threshold = parseAmount(criteria.threshold);
    if (typeof threshold === "number" && Number.isNaN(threshold)) invalid.push("threshold");
    if (threshold == null) invalid.push("threshold");
    if (typeof threshold === "number" && (threshold < 1 || threshold > 5)) invalid.push("threshold");

    CRITERIA.forEach(function (criterion) {
      var score = parseScore(criteria.scores[criterion.id]);
      var weight = parseAmount(criteria.weights[criterion.id]);
      if (typeof score === "number" && Number.isNaN(score)) invalid.push(criterion.id);
      else if (score == null) missingScores.push(criterion.id);
      if (typeof weight === "number" && Number.isNaN(weight)) invalid.push(criterion.id + "Weight");
      else if (weight == null) missingWeights.push(criterion.id);
      else if (weight < 0) invalid.push(criterion.id + "Weight");
      if (typeof score === "number" && !Number.isNaN(score) && typeof weight === "number" && !Number.isNaN(weight) && weight >= 0) {
        weightSum += weight;
        weighted += score * weight;
      }
    });

    var enteredWeightSum = 0;
    CRITERIA.forEach(function (criterion) {
      var weight = parseAmount(criteria.weights[criterion.id]);
      if (typeof weight === "number" && !Number.isNaN(weight) && weight >= 0) enteredWeightSum += weight;
    });
    var uniqueInvalid = invalid.filter(function (id, index) { return invalid.indexOf(id) === index; });
    var complete = uniqueInvalid.length === 0 && missingScores.length === 0 && missingWeights.length === 0 && weightSum > 0 && threshold != null && threshold >= 1 && threshold <= 5;
    var score = complete ? weighted / weightSum : null;
    return {
      ok: uniqueInvalid.length === 0,
      invalid: uniqueInvalid,
      missingScores: missingScores,
      missingWeights: missingWeights,
      weightSum: enteredWeightSum,
      complete: complete,
      score: score,
      threshold: typeof threshold === "number" && !Number.isNaN(threshold) ? threshold : null,
      pass: complete ? score >= threshold : null
    };
  }

  function describePhysical(profile) {
    var length = parseAmount(profile.lengthCm);
    var width = parseAmount(profile.widthCm);
    var height = parseAmount(profile.heightCm);
    var grams = parseAmount(profile.weightG);
    var parts = [];
    var dims = [length, width, height];
    var anyDim = [profile.lengthCm, profile.widthCm, profile.heightCm].some(function (value) {
      return String(value || "").trim() !== "";
    });
    var dimsOk = dims.every(function (value) { return typeof value === "number" && !Number.isNaN(value) && value > 0; });
    if (dimsOk) {
      var cubic = length * width * height;
      parts.push("Volym " + formatSv(cubic, 0) + " cm³ (" + formatSv(cubic / 1000, 2) + " liter)");
    } else if (anyDim) {
      parts.push("Volym kräver längd, bredd och höjd");
    }
    if (typeof grams === "number" && !Number.isNaN(grams) && grams >= 0) {
      parts.push(formatSv(grams / 1000, 3) + " kg");
    }
    return parts.join(" · ");
  }

  function keywordCount(text) {
    return String(text || "").split(/\n/).map(function (line) { return line.trim(); }).filter(Boolean).length;
  }

  function swedishCount(count, singular, plural) {
    return count + " " + (count === 1 ? singular : plural);
  }

  function derivedLine(state, stepId) {
    if (stepId === 1) {
      var criteria = calcCriteria(state.criteria);
      if (!criteria.complete) return "Kriteriepoäng saknas.";
      return "Kriteriepoäng " + formatSv(criteria.score, 2) + " av 5. " + (criteria.pass ? "Över tröskeln." : "Under tröskeln.");
    }
    if (stepId === 2) {
      var words = keywordCount(state.validation.keywords);
      var price = parseAmount(state.validation.observedPrice);
      var wordText = words === 0 ? "Inga sökord" : swedishCount(words, "sökord", "sökord");
      var priceText = typeof price === "number" && !Number.isNaN(price) ? "observerat pris ifyllt" : "observerat pris saknas";
      return wordText + " · " + priceText + ".";
    }
    if (stepId === 3) {
      var margin = calcMargin(state.margin);
      if (!margin.ok) return "Kalkylen har ett fält som inte är ett tal.";
      if (!margin.complete || margin.marginPct == null) return "Kalkylen är ofullständig.";
      return "Marginal " + formatSv(margin.marginPct, 1) + " %.";
    }
    if (stepId === 4) {
      var count = state.suppliers.length;
      var favorites = state.suppliers.filter(function (supplier) { return supplier.favorite; }).length;
      if (!count) return "Inga offerter.";
      var text = swedishCount(count, "offert", "offerter");
      if (favorites) text += ", varav " + swedishCount(favorites, "favorit", "favoriter");
      return text + ".";
    }
    var rows = state.checklists[stepId] || [];
    var done = rows.filter(function (row) { return row.done; }).length;
    return done + " av " + rows.length + " punkter avbockade.";
  }

  function safeUrl(value) {
    if (typeof value !== "string") return "";
    var text = value.trim();
    if (!text) return "";
    try {
      var url = new URL(text);
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    } catch (error) {
      return "";
    }
    return "";
  }

  function checklistProgress(state, stepId) {
    var rows = state.checklists[stepId] || [];
    var done = rows.filter(function (row) { return row.done; }).length;
    return { done: done, total: rows.length, allDone: rows.length > 0 && done === rows.length };
  }

  function marginFieldLabel(id) {
    return MARGIN_LABEL[id] || id;
  }

  return {
    FEE_LINKS: FEE_LINKS,
    MARKETS: MARKETS,
    STEPS: STEPS,
    CRITERIA: CRITERIA,
    CHECKLISTS: CHECKLISTS,
    STATUS_LABELS: STATUS_LABELS,
    STATUS_ORDER: STATUS_ORDER,
    SEASONS: SEASONS,
    MARGIN_FIELDS: MARGIN_FIELDS,
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
    defaultState: defaultState,
    normalize: normalize,
    toDocument: toDocument,
    parseAmount: parseAmount,
    calcMargin: calcMargin,
    calcCriteria: calcCriteria,
    describePhysical: describePhysical,
    derivedLine: derivedLine,
    safeUrl: safeUrl,
    checklistProgress: checklistProgress,
    marketById: marketById,
    marginFieldLabel: marginFieldLabel,
    formatSv: formatSv,
    keywordCount: keywordCount
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Produktkedjan;
}
