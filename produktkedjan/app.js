/*
 * VISNINGSLÅS — INTE RIKTIG SÄKERHET
 * Hashen ligger i localStorage i samma webbläsare. Den som kan läsa
 * lagringen, öppna utvecklarverktyg eller ändra det här skriptet kommer
 * förbi låset. Det döljer bara vyn vid en hastig titt på en delad dator.
 * Planeringen krypteras inte. En exporterad fil är vanlig JSON.
 */
(function () {
  "use strict";

  var PK = window.Produktkedjan;
  var STORAGE_KEY = "produktkedjan.v1";
  var SESSION_KEY = "produktkedjan.unlock";
  var state = null;
  var corruptRaw = null;
  var saveTimer = 0;
  var toastTimer = 0;
  var booted = false;
  var chromeReady = false;

  function h(tag, props) {
    var node = document.createElement(tag);
    var children = Array.prototype.slice.call(arguments, 2);
    var pendingValue = null;
    var hasValue = false;
    props = props || {};
    Object.keys(props).forEach(function (key) {
      var val = props[key];
      if (val == null) return;
      if (key === "class") node.className = val;
      else if (key === "for") node.htmlFor = val;
      else if (key.slice(0, 2) === "on" && typeof val === "function") node.addEventListener(key.slice(2).toLowerCase(), val);
      else if (key === "value") {
        hasValue = true;
        pendingValue = val;
      } else if (key === "checked") node.checked = Boolean(val);
      else if (val === false) return;
      else if (val === true) node.setAttribute(key, "");
      else node.setAttribute(key, String(val));
    });
    appendChildren(node, children);
    if (hasValue && "value" in node) node.value = pendingValue == null ? "" : String(pendingValue);
    return node;
  }

  function appendChildren(node, children) {
    children.forEach(function (child) {
      if (Array.isArray(child)) appendChildren(node, child);
      else if (child == null || child === false) return;
      else node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function prevent(event) {
    event.preventDefault();
  }

  function currencyOf() {
    var market = PK.marketById(state.profile.marketId);
    return market ? market.currency : "SEK";
  }

  function formatMoney(amount, currency) {
    try {
      return new Intl.NumberFormat("sv-SE", { style: "currency", currency: currency }).format(amount);
    } catch (error) {
      return PK.formatSv(amount, 2) + " " + currency;
    }
  }

  function externalLink(href, text) {
    return h("a", { href: href, target: "_blank", rel: "noopener noreferrer" },
      text,
      h("span", { class: "pk-ext", "aria-hidden": "true" }, " ↗"),
      h("span", { class: "pk-sr" }, " (öppnas i ny flik)")
    );
  }

  function textField(opts) {
    var described = [opts.hintId, opts.describedBy].filter(Boolean).join(" ");
    var input = h("input", {
      id: opts.id,
      type: opts.type || "text",
      inputmode: opts.inputmode || null,
      value: opts.value || "",
      autocomplete: opts.autocomplete || "off",
      spellcheck: opts.spellcheck || "false",
      placeholder: opts.placeholder || null,
      minlength: opts.minlength || null,
      "aria-describedby": described || null
    });
    input.addEventListener("input", function () { opts.onInput(input.value); });
    return h("label", { class: "pk-field" + (opts.wide ? " pk-wide" : "") },
      h("span", { class: "pk-label" }, opts.label),
      input,
      opts.hint ? h("span", { class: "pk-hint", id: opts.hintId || null }, opts.hint) : null
    );
  }

  function areaField(opts) {
    var area = h("textarea", {
      id: opts.id || null,
      rows: String(opts.rows || 4),
      value: opts.value || "",
      spellcheck: "true"
    });
    area.addEventListener("input", function () { opts.onInput(area.value); });
    return h("label", { class: "pk-field" },
      h("span", { class: "pk-label" }, opts.label),
      area,
      opts.hint ? h("span", { class: "pk-hint" }, opts.hint) : null
    );
  }

  function alertMsg(message) {
    var el = document.getElementById("pk-alert");
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
  }

  function toast(message) {
    var el = document.getElementById("pk-status");
    el.hidden = false;
    el.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.hidden = true;
      el.textContent = "";
    }, 5000);
  }

  function persist() {
    var save = document.getElementById("pk-save");
    if (corruptRaw) {
      if (save) save.textContent = "Sparar inte ännu. Ta hand om den oläsbara datan först.";
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(PK.toDocument(state)));
      if (save) save.textContent = "Sparat i den här webbläsaren";
    } catch (error) {
      if (save) save.textContent = "Kunde inte spara i webbläsaren. Exportera en fil.";
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 200);
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return PK.defaultState();
      return PK.normalize(JSON.parse(raw));
    } catch (error) {
      try { corruptRaw = localStorage.getItem(STORAGE_KEY); } catch (readError) { corruptRaw = ""; }
      return PK.defaultState();
    }
  }

  function parseRoute() {
    var parts = (location.hash || "").replace(/^#/, "").split("/").filter(Boolean);
    if (parts[0] === "steg") {
      var id = Number(parts[1]);
      if (id >= 1 && id <= 11) return { name: "step", id: id };
    }
    if (parts[0] === "installningar") return { name: "settings" };
    return { name: "dashboard" };
  }

  function paintChrome() {
    var route = parseRoute();
    document.querySelectorAll("#pk-nav a").forEach(function (link) {
      var key = link.getAttribute("data-nav");
      var active = (route.name === "dashboard" && key === "dashboard") ||
        (route.name === "settings" && key === "settings") ||
        (route.name === "step" && key === String(route.id));
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
      var badge = link.querySelector("[data-nav-status]");
      if (!badge) return;
      if (key === "dashboard" || key === "settings") {
        badge.textContent = "";
        badge.removeAttribute("data-status");
      } else {
        var status = state.steps[Number(key)].status;
        badge.textContent = PK.STATUS_LABELS[status];
        badge.setAttribute("data-status", status);
      }
    });
    var select = document.getElementById("pk-jump");
    var href = route.name === "step" ? "#/steg/" + route.id : route.name === "settings" ? "#/installningar" : "#/";
    if (select) select.value = href;
    var market = PK.marketById(state.profile.marketId);
    var name = state.profile.workingName.trim();
    document.getElementById("pk-current-name").textContent = name
      ? name + " · " + (market ? market.label : state.profile.marketId)
      : "Inget arbetsnamn ännu";
    var title = route.name === "step"
      ? PK.STEPS[route.id - 1].title
      : route.name === "settings" ? "Inställningar" : "Översikt";
    document.title = title + " · Produktkedjan";
  }

  function buildChrome() {
    if (chromeReady) return;
    var nav = document.getElementById("pk-nav");
    var select = document.getElementById("pk-jump");
    var items = [{ href: "#/", label: "Översikt", key: "dashboard" }];
    PK.STEPS.forEach(function (step) {
      items.push({ href: "#/steg/" + step.id, label: step.id + ". " + step.title, key: String(step.id) });
    });
    items.push({ href: "#/installningar", label: "Inställningar", key: "settings" });
    nav.replaceChildren.apply(nav, items.map(function (item) {
      return h("a", { href: item.href, "data-nav": item.key },
        h("span", { class: "pk-nav-label" }, item.label),
        h("span", { class: "pk-nav-status", "data-nav-status": item.key })
      );
    }));
    select.replaceChildren.apply(select, items.map(function (item) {
      return h("option", { value: item.href }, item.label);
    }));
    select.addEventListener("change", function () {
      if (location.hash !== select.value) location.hash = select.value;
    });
    chromeReady = true;
  }

  function renderView(focusId) {
    alertMsg("");
    var view = document.getElementById("pk-view");
    var route = parseRoute();
    var node = route.name === "step"
      ? renderStep(route.id)
      : route.name === "settings" ? renderSettings() : renderDashboard();
    view.replaceChildren(node);
    paintChrome();
    if (route.name === "dashboard") paintProfileDerived();
    if (route.name === "step" && route.id === 1) paintCriteria();
    if (route.name === "step" && route.id === 3) paintMargin();
    if (route.name === "step" && route.id >= 5) paintCheckHint(route.id);
    if (!booted) return;
    if (focusId) {
      var target = document.getElementById(focusId);
      if (target) {
        target.focus();
        return;
      }
    }
    var heading = view.querySelector("h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }

  function renderDashboard() {
    var counts = { not_started: 0, in_progress: 0, done: 0, blocked: 0 };
    PK.STEPS.forEach(function (step) { counts[state.steps[step.id].status] += 1; });
    return h("div", {},
      h("h2", {}, "Översikt"),
      h("p", { class: "pk-progress" },
        counts.done + " av 11 är klara. " +
        counts.in_progress + " steg pågår. " +
        counts.blocked + (counts.blocked === 1 ? " steg är blockerat. " : " steg är blockerade. ") +
        counts.not_started + " steg har inte startat."
      ),
      renderProfile(),
      h("h2", { class: "pk-subhead" }, "De elva stegen"),
      h("ol", { class: "pk-steps" }, PK.STEPS.map(renderStepCard))
    );
  }

  function renderProfile() {
    var profile = state.profile;
    var marketOptions = PK.MARKETS.map(function (market) {
      return h("option", { value: market.id }, market.label + " · " + market.currency);
    });
    if (!PK.marketById(profile.marketId)) {
      marketOptions.push(h("option", { value: profile.marketId }, profile.marketId));
    }
    return h("form", { class: "card", autocomplete: "off", onSubmit: prevent },
      h("h2", {}, "Produktprofil"),
      textField({
        id: "working-name",
        label: "Arbetsnamn",
        value: profile.workingName,
        onInput: function (value) {
          profile.workingName = value;
          scheduleSave();
          paintChrome();
        }
      }),
      h("div", { class: "pk-grid-4" },
        textField({ id: "length-cm", label: "Längd (cm)", inputmode: "decimal", value: profile.lengthCm, onInput: function (value) { profile.lengthCm = value; scheduleSave(); paintProfileDerived(); } }),
        textField({ id: "width-cm", label: "Bredd (cm)", inputmode: "decimal", value: profile.widthCm, onInput: function (value) { profile.widthCm = value; scheduleSave(); paintProfileDerived(); } }),
        textField({ id: "height-cm", label: "Höjd (cm)", inputmode: "decimal", value: profile.heightCm, onInput: function (value) { profile.heightCm = value; scheduleSave(); paintProfileDerived(); } }),
        textField({ id: "weight-g", label: "Vikt (gram)", inputmode: "decimal", value: profile.weightG, onInput: function (value) { profile.weightG = value; scheduleSave(); paintProfileDerived(); } })
      ),
      h("p", { class: "pk-hint" }, "Yttersta mått i centimeter på den förpackning du tror att du skickar. Vikt i gram."),
      h("p", { id: "pk-dims", class: "pk-hint" }),
      h("div", { class: "pk-grid-3" },
        textField({
          id: "target-price",
          label: "Målpris",
          inputmode: "decimal",
          value: profile.targetPrice,
          hint: "En riktning. Marginalen räknas i steg 3, på pris exklusive moms.",
          hintId: "target-hint",
          onInput: function (value) { profile.targetPrice = value; scheduleSave(); }
        }),
        h("label", { class: "pk-field" },
          h("span", { class: "pk-label" }, "Målprisets moms"),
          h("select", {
            id: "target-vat",
            value: profile.targetPriceVat,
            onChange: function (event) {
              profile.targetPriceVat = event.target.value;
              scheduleSave();
            }
          },
            h("option", { value: "exkl" }, "Exkl. moms"),
            h("option", { value: "inkl" }, "Inkl. moms")
          )
        ),
        h("label", { class: "pk-field" },
          h("span", { class: "pk-label" }, "Marknad"),
          h("select", {
            id: "market",
            value: profile.marketId,
            onChange: function (event) {
              profile.marketId = event.target.value;
              scheduleSave();
              paintChrome();
              paintProfileDerived();
            }
          }, marketOptions),
          h("span", { id: "market-note", class: "pk-hint" })
        )
      )
    );
  }

  function paintProfileDerived() {
    var dims = document.getElementById("pk-dims");
    if (dims) dims.textContent = PK.describePhysical(state.profile);
    var note = document.getElementById("market-note");
    if (!note) return;
    var market = PK.marketById(state.profile.marketId);
    var label = market ? market.label : state.profile.marketId;
    var text = "Visning i " + currencyOf() + " för " + label + ". Belopp räknas inte om när du byter marknad.";
    if (state.profile.marketId !== "amazon.se") {
      text += " Avgiftssidorna i kalkylen gäller Amazon.se, så slå upp den här marknadens avgifter själv.";
    }
    note.textContent = text;
  }

  function renderStepCard(step) {
    var data = state.steps[step.id];
    var blocker = data.blockers.trim();
    if (!blocker && data.status === "blocked") blocker = "Statusen är Blockerad, men du har inte skrivit vad som stoppar.";
    if (!blocker) blocker = "Ingen blockering ifylld.";
    return h("li", { class: "card pk-step" + (data.status === "blocked" ? " is-blocked" : "") },
      h("div", { class: "pk-step-top" },
        h("h3", {},
          h("a", { href: "#/steg/" + step.id },
            h("span", { class: "pk-step-no", "aria-hidden": "true" }, String(step.id).padStart(2, "0") + " "),
            step.title
          )
        ),
        h("span", { class: "pk-status", "data-status": data.status }, PK.STATUS_LABELS[data.status])
      ),
      h("p", { class: "pk-summary" }, step.summary),
      h("p", {}, h("span", { class: "pk-kicker" }, "Nästa åtgärd. "), data.nextAction.trim() || "Ingen åtgärd ifylld ännu."),
      h("p", {}, h("span", { class: "pk-kicker" }, "Blockering. "), blocker),
      h("p", {}, h("span", { class: "pk-kicker" }, "Läge. "), PK.derivedLine(state, step.id))
    );
  }

  function renderMeta(step) {
    var data = state.steps[step.id];
    return h("fieldset", { class: "card" },
      h("legend", {}, "Läge för steget"),
      h("label", { class: "pk-field" },
        h("span", { class: "pk-label" }, "Status"),
        h("select", {
          id: "step-status",
          value: data.status,
          onChange: function (event) {
            data.status = event.target.value;
            scheduleSave();
            paintChrome();
          }
        }, PK.STATUS_ORDER.map(function (status) {
          return h("option", { value: status }, PK.STATUS_LABELS[status]);
        }))
      ),
      areaField({
        id: "next-action",
        label: "Nästa åtgärd",
        rows: 3,
        value: data.nextAction,
        hint: "Vad du gör härnäst i det här steget.",
        onInput: function (value) { data.nextAction = value; scheduleSave(); }
      }),
      areaField({
        id: "blockers",
        label: "Blockeringar",
        rows: 3,
        value: data.blockers,
        hint: "Lämna tomt om inget stoppar steget.",
        onInput: function (value) { data.blockers = value; scheduleSave(); }
      })
    );
  }

  function renderStep(id) {
    var step = PK.STEPS[id - 1];
    var parts = [
      h("p", { class: "pk-crumb" }, h("a", { href: "#/" }, "Översikt")),
      h("h2", {}, step.title),
      h("p", { class: "pk-intro" }, step.intro)
    ];
    if (id === 6) parts.push(renderVatNote());
    parts.push(renderMeta(step));
    if (id === 1) parts.push(renderCriteria());
    if (id === 2) parts.push(renderValidation());
    if (id === 3) parts.push(renderMargin());
    if (id === 4) parts.push(renderSuppliers());
    if (id >= 5) parts.push(renderChecklist(id));
    return h("div", {}, parts);
  }

  function renderCriteria() {
    return h("form", { class: "card", autocomplete: "off", onSubmit: prevent },
      h("h3", {}, "Kriteriepoäng"),
      h("p", {}, "Hög poäng betyder bättre läge för en liten start. Vikterna är ett förslag. Ändra dem så de passar varan."),
      PK.CRITERIA.map(function (criterion) {
        return h("div", { class: "pk-criterion" },
          h("label", { class: "pk-field" },
            h("span", { class: "pk-label" }, criterion.label),
            h("span", { class: "pk-hint" }, criterion.help),
            h("select", {
              id: "score-" + criterion.id,
              value: state.criteria.scores[criterion.id],
              onChange: function (event) {
                state.criteria.scores[criterion.id] = event.target.value;
                scheduleSave();
                paintCriteria();
              }
            },
              h("option", { value: "" }, "Inte bedömd"),
              h("option", { value: "1" }, "1 — svag"),
              h("option", { value: "2" }, "2"),
              h("option", { value: "3" }, "3 — mittemellan"),
              h("option", { value: "4" }, "4"),
              h("option", { value: "5" }, "5 — stark")
            )
          ),
          textField({
            id: "weight-" + criterion.id,
            label: "Vikt för " + criterion.label.toLowerCase(),
            inputmode: "decimal",
            value: state.criteria.weights[criterion.id],
            onInput: function (value) {
              state.criteria.weights[criterion.id] = value;
              scheduleSave();
              paintCriteria();
            }
          })
        );
      }),
      textField({
        id: "threshold",
        label: "Minsta tröskel",
        inputmode: "decimal",
        value: state.criteria.threshold,
        hint: "Ett tal från 1 till 5. Skriv 3,5 eller 3.5. Lika med tröskeln räknas som över.",
        hintId: "threshold-hint",
        onInput: function (value) {
          state.criteria.threshold = value;
          scheduleSave();
          paintCriteria();
        }
      }),
      h("div", { id: "criteria-result", class: "pk-result", "aria-live": "polite" }),
      h("button", {
        type: "button",
        class: "btn secondary pk-small",
        onClick: function () {
          PK.CRITERIA.forEach(function (criterion) {
            state.criteria.weights[criterion.id] = PK.DEFAULT_WEIGHTS[criterion.id];
            var input = document.getElementById("weight-" + criterion.id);
            if (input) input.value = PK.DEFAULT_WEIGHTS[criterion.id];
          });
          scheduleSave();
          paintCriteria();
        }
      }, "Återställ föreslagna vikter")
    );
  }

  function paintCriteria() {
    var box = document.getElementById("criteria-result");
    if (!box) return;
    var result = PK.calcCriteria(state.criteria);
    box.classList.remove("is-pass", "is-fail", "is-incomplete");
    var title = "Poängen är inte klar";
    var detail = "Bedöm alla fem och sätt en vikt för varje.";
    if (!result.ok) {
      box.classList.add("is-fail");
      detail = "Kontrollera vikter och tröskel. Poäng är 1 till 5, vikter är 0 eller högre och tröskeln ligger mellan 1 och 5.";
    } else if (result.complete) {
      title = PK.formatSv(result.score, 2) + " av 5";
      detail = (result.pass ? "Över tröskeln på " : "Under tröskeln på ") + PK.formatSv(result.threshold, 1) + ".";
      box.classList.add(result.pass ? "is-pass" : "is-fail");
    } else {
      box.classList.add("is-incomplete");
    }
    var sumDigits = Math.abs(result.weightSum % 1) < 0.001 ? 0 : 1;
    var sumText = "Summa vikter: " + PK.formatSv(result.weightSum, sumDigits) + ".";
    if (result.weightSum > 0 && Math.abs(result.weightSum - 100) > 0.001) {
      sumText += " Poängen vägs om så att förhållandet mellan vikterna behålls.";
    }
    var nodes = [
      h("h3", {}, "Resultat"),
      h("p", { class: "pk-score" }, title),
      h("p", {}, detail),
      h("p", { class: "pk-hint" }, sumText)
    ];
    if (result.complete) {
      var scorePct = Math.max(0, Math.min(100, result.score / 5 * 100));
      var thresholdPct = Math.max(0, Math.min(100, result.threshold / 5 * 100));
      nodes.push(h("div", { class: "pk-bar", "aria-hidden": "true" },
        h("span", { style: "width:" + scorePct + "%" }),
        h("i", { style: "left:" + thresholdPct + "%" })
      ));
    }
    box.replaceChildren.apply(box, nodes);
  }

  function renderValidation() {
    var data = state.validation;
    return h("form", { autocomplete: "off", onSubmit: prevent },
      h("div", { class: "card" },
        h("h3", {}, "Det du har observerat"),
        areaField({
          id: "keywords",
          label: "Sökord",
          rows: 5,
          value: data.keywords,
          hint: "Ett ord eller en fras per rad, så som du sökte.",
          onInput: function (value) { data.keywords = value; scheduleSave(); }
        }),
        textField({
          id: "observed-price",
          label: "Observerat pris",
          inputmode: "decimal",
          value: data.observedPrice,
          hint: "Priset du såg på sidan. Det här är inte en uppskattning av försäljning.",
          hintId: "observed-hint",
          onInput: function (value) { data.observedPrice = value; scheduleSave(); }
        }),
        textField({
          id: "similar-offers",
          label: "Antal liknande erbjudanden",
          inputmode: "numeric",
          value: data.similarOffers,
          hint: "Så många du själv räknade.",
          hintId: "similar-hint",
          onInput: function (value) { data.similarOffers = value; scheduleSave(); }
        }),
        h("label", { class: "pk-field" },
          h("span", { class: "pk-label" }, "Säsong"),
          h("select", {
            id: "season",
            value: data.seasonality,
            onChange: function (event) {
              data.seasonality = event.target.value;
              scheduleSave();
            }
          }, PK.SEASONS.map(function (season) {
            return h("option", { value: season.id }, season.label);
          }))
        ),
        areaField({
          id: "validation-notes",
          label: "Anteckningar",
          rows: 4,
          value: data.notes,
          hint: "Skriv vad du såg. Lämna försäljning tom om du inte har en källa, för verktyget gissar ingen volym.",
          onInput: function (value) { data.notes = value; scheduleSave(); }
        })
      ),
      h("div", { class: "card" },
        h("h3", {}, "Källor"),
        h("p", {}, "Länka till sidan där du såg priset eller antalet."),
        data.sources.length
          ? h("ul", { class: "pk-sources" }, data.sources.map(renderSource))
          : h("p", {}, "Inga källänkar ännu."),
        h("button", { type: "button", class: "btn secondary pk-small", id: "add-source", onClick: addSource }, "Lägg till källa")
      )
    );
  }

  function renderSource(source) {
    var safe = PK.safeUrl(source.url);
    return h("li", { class: "pk-source" },
      textField({
        id: "source-label-" + source.id,
        label: "Vad länken visar",
        value: source.label,
        onInput: function (value) { source.label = value; scheduleSave(); }
      }),
      textField({
        id: "source-url-" + source.id,
        label: "Adress",
        type: "url",
        inputmode: "url",
        placeholder: "https://",
        value: source.url,
        onInput: function (value) { source.url = value; scheduleSave(); }
      }),
      safe ? externalLink(safe, "Öppna källan") : null,
      h("button", {
        type: "button",
        class: "pk-text-btn",
        onClick: function () {
          state.validation.sources = state.validation.sources.filter(function (item) { return item.id !== source.id; });
          persist();
          renderView("add-source");
        }
      }, "Ta bort källa")
    );
  }

  function addSource() {
    var id = uid();
    state.validation.sources.push({ id: id, label: "", url: "" });
    persist();
    renderView("source-label-" + id);
  }

  function marginInput(id, label, hint) {
    return textField({
      id: "margin-" + id,
      label: label,
      inputmode: "decimal",
      value: state.margin[id],
      hint: hint,
      hintId: "hint-" + id,
      describedBy: id === "fbaFee" || id === "storagePerUnit" || id === "referralValue" ? "fee-links-hint" : null,
      onInput: function (value) {
        state.margin[id] = value;
        scheduleSave();
        paintMargin();
      }
    });
  }

  function renderMargin() {
    var mode = state.margin.referralMode === "percent" ? "percent" : "amount";
    return h("form", { class: "pk-split", autocomplete: "off", onSubmit: prevent },
      h("div", {},
        h("fieldset", { class: "card" },
          h("legend", {}, "Försäljning"),
          h("p", { class: "pk-hint" }, "Skriv beloppen i " + currencyOf() + ". Tusental kan skrivas med mellanslag, till exempel 1 000,50."),
          marginInput("salesPriceExVat", "Försäljningspris exkl. moms", "Det belopp du räknar marginal på, utan moms.")
        ),
        h("fieldset", { class: "card" },
          h("legend", {}, "Landad kostnad"),
          marginInput("purchasePrice", "Inköpspris", "Pris per enhet från leverantören, i samma valuta som försäljningspriset."),
          marginInput("freightIn", "Frakt in", "Din frakt fram till FBA, fördelad per enhet."),
          marginInput("customs", "Tull och import", "Tull, import och liknande, per enhet.")
        ),
        h("fieldset", { class: "card" },
          h("legend", {}, "Avgifter du slår upp själv"),
          h("p", { id: "fee-links-hint" }, "Inget belopp är ifyllt åt dig. Slå upp avgiften och skriv in den. Lämna fältet tomt tills du vet. Skriv 0 bara när kostnaden är noll."),
          h("nav", { "aria-label": "Sidor där du slår upp avgifter" },
            h("ul", { class: "pk-links", id: "fee-links" },
              h("li", {}, externalLink(PK.FEE_LINKS.calculator, "Intäktskalkyl")),
              h("li", {}, externalLink(PK.FEE_LINKS.prices, "Priser för försäljning")),
              h("li", {}, externalLink(PK.FEE_LINKS.fba, "Fulfilment by Amazon"))
            )
          ),
          marginInput("fbaFee", "FBA-fullgörandeavgift", "Belopp per enhet för plock, pack och frakt till kund."),
          marginInput("storagePerUnit", "Lagring per enhet", "Den lagringskostnad du själv räknar per enhet."),
          h("fieldset", { class: "pk-inline" },
            h("legend", {}, "Referralavgift"),
            h("div", { class: "pk-radios" },
              h("label", {},
                h("input", {
                  type: "radio",
                  name: "referralMode",
                  value: "amount",
                  checked: mode === "amount",
                  onChange: function () {
                    state.margin.referralMode = "amount";
                    scheduleSave();
                    paintMargin();
                  }
                }),
                " Belopp"
              ),
              h("label", {},
                h("input", {
                  type: "radio",
                  name: "referralMode",
                  value: "percent",
                  checked: mode === "percent",
                  onChange: function () {
                    state.margin.referralMode = "percent";
                    scheduleSave();
                    paintMargin();
                  }
                }),
                " Procent"
              )
            ),
            marginInput("referralValue", mode === "percent" ? "Procent" : "Belopp", "Procent räknas på försäljningspriset exklusive moms. Skriv 15 för 15 procent.")
          )
        ),
        h("fieldset", { class: "card" },
          h("legend", {}, "Övrigt"),
          marginInput("adsPerUnit", "Annons per enhet", "Det du vill räkna med per såld enhet."),
          marginInput("otherCosts", "Övriga kostnader", "Prep, etiketter, prov eller annat per enhet.")
        )
      ),
      h("div", { class: "pk-result", id: "margin-result" },
        h("h3", {}, "Resultat"),
        h("div", { id: "margin-live", "aria-live": "polite" }, h("dl", { id: "margin-dl" })),
        h("p", { id: "margin-note", class: "pk-hint" }, "Landad kostnad = inköpspris + frakt in + tull och import. Bidrag per enhet = försäljningspris exkl. moms − landad kostnad − fullgörande − lagring − referral − annons − övrigt. Marginal = bidrag delat med försäljningspris exkl. moms. Uträkningen avrundar till två decimaler.")
      )
    );
  }

  function paintMargin() {
    var dl = document.getElementById("margin-dl");
    if (!dl) return;
    var result = PK.calcMargin(state.margin);
    var box = document.getElementById("margin-result");
    var currency = currencyOf();
    box.classList.remove("is-pass", "is-fail", "is-incomplete");
    PK.MARGIN_FIELDS.forEach(function (field) {
      var input = document.getElementById("margin-" + field.id);
      if (input) input.setAttribute("aria-invalid", result.invalid.indexOf(field.id) >= 0 ? "true" : "false");
    });
    var rows = [];
    function add(term, desc) {
      rows.push(h("dt", {}, term), h("dd", {}, desc));
    }
    if (!result.ok) {
      box.classList.add("is-fail");
      add("Uträkning", "Ett fält är inte ett tal.");
      add("Kontrollera", result.invalid.map(PK.marginFieldLabel).join(", ") + ".");
    } else {
      add("Landad kostnad", result.landedCost == null ? "Ofullständig. Fyll i inköp, frakt in och tull." : formatMoney(result.landedCost, currency));
      if (result.mode === "percent" && result.referralAmount != null) {
        var pct = PK.parseAmount(state.margin.referralValue);
        add("Referralavgift", formatMoney(result.referralAmount, currency) + " (" + PK.formatSv(pct, 1) + " % av priset)");
      }
      if (result.complete && result.contribution != null) {
        add("Avdrag per enhet", formatMoney(result.totalDeductions, currency));
        add("Bidrag per enhet", formatMoney(result.contribution, currency));
        add("Marginal", result.marginPct == null ? "Går inte att räkna när priset är 0." : PK.formatSv(result.marginPct, 1) + " %");
        box.classList.add(result.marginPct != null && result.marginPct < 0 ? "is-fail" : "is-pass");
      } else {
        box.classList.add("is-incomplete");
        add("Bidrag per enhet", "Fyll i alla fält för att räkna bidrag och marginal.");
        add("Saknas", result.missing.map(PK.marginFieldLabel).join(", ") + ".");
      }
      if (result.warnings.length) add("Att se över", result.warnings.join(" "));
    }
    var referralSpan = document.getElementById("margin-referralValue");
    if (referralSpan && referralSpan.parentNode) {
      var span = referralSpan.parentNode.querySelector(".pk-label");
      if (span) span.textContent = state.margin.referralMode === "percent" ? "Procent" : "Belopp";
    }
    dl.replaceChildren.apply(dl, rows);
  }

  function supplierField(supplier, key, label, multiline) {
    var opts = {
      id: "supplier-" + key + "-" + supplier.id,
      value: supplier[key],
      "aria-label": label,
      onInput: function (event) {
        supplier[key] = event.target.value;
        scheduleSave();
      }
    };
    var control = multiline
      ? h("textarea", Object.assign({ rows: "2" }, opts))
      : h("input", Object.assign({ type: "text" }, opts));
    return h("td", { "data-label": label }, control);
  }

  function renderSuppliers() {
    var rows = state.suppliers;
    return h("div", { class: "card" },
      h("h3", {}, "Offertjämförelse"),
      rows.length
        ? h("div", { class: "pk-table-wrap", tabindex: "0", "aria-label": "Leverantörstabell, kan scrollas i sidled" },
          h("table", { class: "pk-suppliers" },
            h("caption", {}, "Jämförelse av leverantörer"),
            h("thead", {}, h("tr", {}, ["Leverantör", "Minsta order", "Styckpris", "Ledtid", "Betalvillkor", "Leveransvillkor", "Anteckning", "Favorit", "Åtgärd"].map(function (label) {
              return h("th", { scope: "col" }, label);
            }))),
            h("tbody", {}, rows.map(function (supplier) {
              return h("tr", { class: supplier.favorite ? "is-favorite" : "" },
                supplierField(supplier, "name", "Leverantör"),
                supplierField(supplier, "moq", "Minsta order"),
                supplierField(supplier, "unitPrice", "Styckpris"),
                supplierField(supplier, "leadTime", "Ledtid"),
                supplierField(supplier, "paymentTerms", "Betalvillkor"),
                supplierField(supplier, "shippingTerms", "Leveransvillkor"),
                supplierField(supplier, "notes", "Anteckning", true),
                h("td", { "data-label": "Favorit" },
                  h("button", {
                    type: "button",
                    class: "btn secondary pk-small",
                    "aria-pressed": supplier.favorite ? "true" : "false",
                    onClick: function (event) {
                      supplier.favorite = !supplier.favorite;
                      var button = event.currentTarget;
                      button.setAttribute("aria-pressed", supplier.favorite ? "true" : "false");
                      button.textContent = supplier.favorite ? "Favorit" : "Markera favorit";
                      button.closest("tr").classList.toggle("is-favorite", supplier.favorite);
                      scheduleSave();
                    }
                  }, supplier.favorite ? "Favorit" : "Markera favorit")
                ),
                h("td", { "data-label": "Åtgärd" },
                  h("button", {
                    type: "button",
                    class: "pk-text-btn",
                    onClick: function () {
                      state.suppliers = state.suppliers.filter(function (item) { return item.id !== supplier.id; });
                      persist();
                      renderView("add-supplier");
                    }
                  }, "Ta bort")
                )
              );
            }))
          )
        )
        : h("p", {}, "Inga leverantörer ännu. Lägg till den första offerten."),
      rows.length ? h("p", { class: "pk-hint" }, "På liten skärm sveper du tabellen i sidled.") : null,
      h("button", {
        type: "button",
        class: "btn pk-small",
        id: "add-supplier",
        onClick: function () {
          var id = uid();
          state.suppliers.push({
            id: id,
            name: "",
            moq: "",
            unitPrice: "",
            leadTime: "",
            paymentTerms: "",
            shippingTerms: "",
            notes: "",
            favorite: false
          });
          persist();
          renderView("supplier-name-" + id);
        }
      }, "Lägg till leverantör")
    );
  }

  function renderVatNote() {
    var market = PK.marketById(state.profile.marketId);
    var extra = state.profile.marketId === "amazon.se"
      ? "Länken går till Amazons svenska sida om moms."
      : "Du har valt " + (market ? market.label : state.profile.marketId) + ". Momsreglerna kan skilja sig från den svenska sidan. Det här är fortfarande inte skatterådgivning.";
    return h("aside", { class: "pk-callout" },
      h("p", {}, h("strong", {}, "Inte skatterådgivning. "), "Verktyget räknar ingen moms och ger inget besked om registrering."),
      h("p", {}, extra),
      h("p", {}, externalLink(PK.FEE_LINKS.vat, "Momsresurser hos Amazon.se"))
    );
  }

  function renderChecklist(stepId) {
    var rows = state.checklists[stepId];
    return h("div", {},
      h("ul", { class: "pk-checks" }, rows.map(function (row) {
        return h("li", { class: "card pk-check" },
          row.custom
            ? h("div", { class: "pk-check-label" },
              h("input", {
                type: "checkbox",
                id: "check-" + row.id,
                checked: row.done,
                "aria-label": "Egen punkt avbockad",
                onChange: function (event) {
                  row.done = event.target.checked;
                  scheduleSave();
                  paintCheckHint(stepId);
                }
              }),
              textField({
                id: "check-label-" + row.id,
                label: "Egen punkt",
                value: row.label,
                onInput: function (value) { row.label = value; scheduleSave(); }
              })
            )
            : h("label", { class: "pk-check-label", for: "check-" + row.id },
              h("input", {
                id: "check-" + row.id,
                type: "checkbox",
                checked: row.done,
                onChange: function (event) {
                  row.done = event.target.checked;
                  scheduleSave();
                  paintCheckHint(stepId);
                }
              }),
              h("span", {}, row.label)
            ),
          h("div", { class: "pk-grid" },
            h("label", { class: "pk-field" },
              h("span", { class: "pk-label" }, "Datum"),
              h("input", {
                type: "date",
                id: "check-date-" + row.id,
                value: row.date,
                onInput: function (event) { row.date = event.target.value; scheduleSave(); }
              })
            ),
            textField({
              id: "check-link-" + row.id,
              label: "Länk",
              type: "url",
              inputmode: "url",
              placeholder: "https://",
              value: row.link,
              onInput: function (value) {
                row.link = value;
                scheduleSave();
                var anchor = document.getElementById("check-open-" + row.id);
                var safe = PK.safeUrl(value);
                if (!anchor) return;
                if (safe) {
                  anchor.href = safe;
                  anchor.hidden = false;
                } else {
                  anchor.hidden = true;
                  anchor.removeAttribute("href");
                }
              }
            })
          ),
          (function () {
            var safe = PK.safeUrl(row.link);
            return h("p", {}, h("a", {
              id: "check-open-" + row.id,
              href: safe || null,
              hidden: !safe,
              target: "_blank",
              rel: "noopener noreferrer"
            }, "Öppna länken"));
          })(),
          areaField({
            id: "check-notes-" + row.id,
            label: "Anteckning",
            rows: 2,
            value: row.notes,
            onInput: function (value) { row.notes = value; scheduleSave(); }
          }),
          row.custom ? h("button", {
            type: "button",
            class: "pk-text-btn",
            onClick: function () {
              state.checklists[stepId] = state.checklists[stepId].filter(function (item) { return item.id !== row.id; });
              persist();
              renderView("add-check");
            }
          }, "Ta bort punkten") : null
        );
      })),
      h("p", { id: "check-hint", class: "pk-hint" }),
      h("button", {
        type: "button",
        class: "btn secondary pk-small",
        id: "add-check",
        onClick: function () {
          var id = uid();
          state.checklists[stepId].push({
            id: id,
            label: "",
            custom: true,
            done: false,
            date: "",
            notes: "",
            link: ""
          });
          persist();
          renderView("check-label-" + id);
        }
      }, "Lägg till egen punkt")
    );
  }

  function paintCheckHint(stepId) {
    var el = document.getElementById("check-hint");
    if (!el) return;
    var progress = PK.checklistProgress(state, stepId);
    el.textContent = progress.allDone
      ? "Alla punkter är avbockade. Sätt status till Klar om du är färdig med steget."
      : progress.done + " av " + progress.total + " punkter avbockade.";
  }

  function renderSettings() {
    return h("div", {},
      h("h2", {}, "Inställningar"),
      renderGateSettings(),
      h("div", { class: "card" },
        h("h3", {}, "Kopia av planeringen"),
        h("p", {}, "Filen är vanlig JSON och är inte krypterad. Om låset är på följer hashvärdet med, inte själva ordet."),
        h("div", { class: "pk-actions" },
          h("button", { type: "button", class: "btn pk-small", onClick: exportJson }, "Exportera JSON"),
          h("button", { type: "button", class: "btn secondary pk-small", onClick: function () { document.getElementById("pk-import").click(); } }, "Importera JSON")
        )
      ),
      h("div", { class: "card" },
        h("h3", {}, "Radera i den här webbläsaren"),
        h("p", {}, "Tar bort produktprofil, steg, kalkyl och lås från den här webbläsaren. En fil du redan har laddat ned ligger kvar."),
        h("button", { type: "button", class: "pk-text-btn", onClick: eraseAll }, "Radera sparad data")
      )
    );
  }

  function renderGateSettings() {
    var intro = h("div", {},
      h("h3", {}, "Visningslås"),
      h("p", {}, "Visningslåset är inte ett riktigt skydd. Ordet lagras bara som ett hashvärde i den här webbläsaren. Den som kan öppna utvecklarverktyg, läsa lagrad data eller redigera sidan kommer förbi låset. Det döljer planen vid en hastig titt, till exempel om någon annan lånar datorn.")
    );
    if (!state.gate.enabled) {
      return h("form", { class: "card", autocomplete: "off", onSubmit: onEnableGate },
        intro,
        h("p", {}, "Låset är av."),
        passwordField("new-password", "Nytt ord", "new-password"),
        passwordField("confirm-password", "Upprepa ordet", "new-password"),
        h("p", { id: "gate-form-error", role: "alert" }),
        h("button", { type: "submit", class: "btn pk-small" }, "Slå på lås")
      );
    }
    return h("div", { class: "card" },
      intro,
      h("p", {}, "Låset är på i den här webbläsaren."),
      h("form", { autocomplete: "off", onSubmit: onChangeGate },
        h("h3", {}, "Byt ord"),
        passwordField("current-password", "Nuvarande ord", "current-password"),
        passwordField("new-password", "Nytt ord", "new-password"),
        passwordField("confirm-password", "Upprepa nya ordet", "new-password"),
        h("p", { id: "gate-form-error", role: "alert" }),
        h("button", { type: "submit", class: "btn pk-small" }, "Byt ord")
      ),
      h("form", { autocomplete: "off", onSubmit: onDisableGate },
        h("h3", {}, "Stäng av lås"),
        passwordField("disable-password", "Nuvarande ord", "current-password"),
        h("p", { id: "gate-disable-error", role: "alert" }),
        h("div", { class: "pk-actions" },
          h("button", { type: "submit", class: "btn secondary pk-small" }, "Stäng av lås"),
          h("button", { type: "button", class: "btn secondary pk-small", onClick: lockNow }, "Lås nu")
        )
      )
    );
  }

  function passwordField(id, label, autocomplete) {
    return h("label", { class: "pk-field" },
      h("span", { class: "pk-label" }, label),
      h("input", { id: id, type: "password", autocomplete: autocomplete, minlength: "4" })
    );
  }

  async function digest(text) {
    if (window.isSecureContext && window.crypto && crypto.subtle) {
      var bytes = new TextEncoder().encode(text);
      var buf = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(buf)).map(function (byte) {
        return byte.toString(16).padStart(2, "0");
      }).join("");
    }
    /* Fallback när sidan inte körs över https. Fortfarande inte säkerhet. */
    var hash = 5381;
    for (var i = 0; i < text.length; i++) hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    return "weak:" + (hash >>> 0).toString(16);
  }

  function sessionMatches() {
    try {
      return state.gate.enabled && sessionStorage.getItem(SESSION_KEY) === state.gate.hash;
    } catch (error) {
      return false;
    }
  }

  async function onEnableGate(event) {
    event.preventDefault();
    var message = await setGate(document.getElementById("new-password").value, document.getElementById("confirm-password").value);
    var error = document.getElementById("gate-form-error");
    if (message) {
      error.textContent = message;
      return;
    }
    renderView();
    toast("Låset är på för den här webbläsaren.");
  }

  async function onChangeGate(event) {
    event.preventDefault();
    var error = document.getElementById("gate-form-error");
    if (await digest(document.getElementById("current-password").value) !== state.gate.hash) {
      error.textContent = "Nuvarande ord stämmer inte.";
      return;
    }
    var message = await setGate(document.getElementById("new-password").value, document.getElementById("confirm-password").value);
    if (message) {
      error.textContent = message;
      return;
    }
    renderView();
    toast("Ordet är bytt.");
  }

  async function onDisableGate(event) {
    event.preventDefault();
    var error = document.getElementById("gate-disable-error");
    if (await digest(document.getElementById("disable-password").value) !== state.gate.hash) {
      error.textContent = "Ordet stämmer inte.";
      return;
    }
    state.gate = { enabled: false, hash: "" };
    try { sessionStorage.removeItem(SESSION_KEY); } catch (removeError) { /* sessionen kan vara avstängd */ }
    persist();
    renderView();
    toast("Låset är av.");
  }

  async function setGate(password, confirm) {
    if (password.length < 4) return "Använd minst 4 tecken.";
    if (password !== confirm) return "Orden matchar inte.";
    state.gate.hash = await digest(password);
    state.gate.enabled = true;
    try { sessionStorage.setItem(SESSION_KEY, state.gate.hash); } catch (error) { /* låset gäller ändå efter omladdning */ }
    persist();
    return "";
  }

  function lockNow() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (error) { /* fortsätt till grinden */ }
    showGate();
  }

  function showGate() {
    document.getElementById("pk-tool").hidden = true;
    var gate = document.getElementById("pk-gate");
    gate.hidden = false;
    document.title = "Visningslås · Produktkedjan";
    var error = h("p", { id: "gate-error", role: "alert" });
    var input = h("input", { id: "gate-password", type: "password", autocomplete: "current-password" });
    gate.replaceChildren(h("form", { class: "card pk-gate", onSubmit: async function (event) {
      event.preventDefault();
      var hash = await digest(input.value);
      if (hash === state.gate.hash) {
        try { sessionStorage.setItem(SESSION_KEY, hash); } catch (sessionError) { /* nästa besök frågar igen */ }
        input.value = "";
        showTool(true);
      } else {
        error.textContent = "Ordet stämmer inte.";
        input.focus();
      }
    }},
      h("h2", {}, "Visningslås"),
      h("p", {}, "Det här är inte ett riktigt skydd. Det döljer planeringen tills ordet skrivs in på den här datorn."),
      h("p", {}, "Har du glömt ordet finns ingen återställning. Då kan du radera den sparade datan. En exporterad fil påverkas inte."),
      h("label", { class: "pk-field" }, h("span", { class: "pk-label" }, "Ord"), input),
      error,
      h("div", { class: "pk-actions" },
        h("button", { type: "submit", class: "btn" }, "Visa planeringen"),
        h("button", { type: "button", class: "pk-text-btn", onClick: eraseAll }, "Radera sparad data")
      )
    ));
    input.focus();
  }

  function showTool(moveFocus) {
    document.getElementById("pk-gate").hidden = true;
    document.getElementById("pk-gate").replaceChildren();
    document.getElementById("pk-tool").hidden = false;
    buildChrome();
    renderCorrupt();
    booted = false;
    renderView();
    booted = true;
    if (moveFocus) {
      var heading = document.querySelector("#pk-view h2");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
    }
  }

  function renderCorrupt() {
    var box = document.getElementById("pk-corrupt");
    if (!corruptRaw) {
      box.hidden = true;
      box.replaceChildren();
      return;
    }
    box.hidden = false;
    box.replaceChildren(
      h("p", {}, "Den sparade datan gick inte att läsa, så den visas inte och inget nytt skrivs över den."),
      h("div", { class: "pk-banner-actions" },
        h("button", { type: "button", class: "btn secondary pk-small", onClick: downloadCorrupt }, "Ladda ned den oläsbara texten"),
        h("button", { type: "button", class: "btn pk-small", onClick: discardCorrupt }, "Släpp den och spara det som står på sidan")
      )
    );
  }

  function downloadCorrupt() {
    var blob = new Blob([corruptRaw || ""], { type: "text/plain" });
    downloadBlob(blob, "produktkedjan-olasbar.txt");
  }

  function discardCorrupt() {
    corruptRaw = null;
    persist();
    renderCorrupt();
    toast("Den oläsbara datan är släppt. Det som står på sidan sparas nu.");
  }

  function confirmDialog(title, body, okLabel) {
    var dialog = document.getElementById("pk-dialog");
    document.getElementById("pk-dialog-title").textContent = title;
    document.getElementById("pk-dialog-body").textContent = body;
    document.getElementById("pk-dialog-ok").textContent = okLabel || "Fortsätt";
    return new Promise(function (resolve) {
      function done() {
        dialog.removeEventListener("close", done);
        resolve(dialog.returnValue === "ok");
      }
      dialog.addEventListener("close", done);
      dialog.showModal();
    });
  }

  async function eraseAll() {
    var ok = await confirmDialog(
      "Radera sparad data?",
      "Produktprofil, steg, kalkyl och lås tas bort från den här webbläsaren. En fil du redan exporterat ligger kvar på datorn.",
      "Radera"
    );
    if (!ok) return;
    corruptRaw = null;
    state = PK.defaultState();
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(SESSION_KEY);
    } catch (error) { /* minnet är redan tömt */ }
    showTool(true);
    toast("Den sparade datan är borttagen.");
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportJson() {
    persist();
    var payload = PK.toDocument(state);
    payload.exportedAt = new Date().toISOString();
    payload.app = "produktkedjan";
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var day = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, "produktkedjan-" + day + ".json");
    toast("Filen laddas ned. Den är inte krypterad.");
  }

  async function importFile(file) {
    if (file.size > 2000000) {
      alertMsg("Filen är större än 2 MB och läses inte.");
      return;
    }
    var text;
    try { text = await file.text(); } catch (error) {
      alertMsg("Filen gick inte att läsa.");
      return;
    }
    var parsed;
    try { parsed = JSON.parse(text); } catch (error) {
      alertMsg("Filen är inte giltig JSON.");
      return;
    }
    var next;
    try { next = PK.normalize(parsed); } catch (error) {
      alertMsg(error.message || "Filen gick inte att läsa.");
      return;
    }
    if (!parsed.gate) next.gate = { enabled: state.gate.enabled, hash: state.gate.hash };
    var ok = await confirmDialog(
      "Ersätt planeringen?",
      "Det som finns i den här webbläsaren byts ut mot filen.",
      "Importera"
    );
    if (!ok) return;
    state = next;
    corruptRaw = null;
    persist();
    try {
      if (state.gate.enabled) sessionStorage.setItem(SESSION_KEY, state.gate.hash);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (error) { /* sessionen påverkar bara den här fliken */ }
    if (location.hash && location.hash !== "#/" && location.hash !== "#") location.hash = "#/";
    showTool(true);
    toast("Importen är klar.");
  }

  function boot() {
    state = load();
    document.getElementById("pk-export").addEventListener("click", exportJson);
    document.getElementById("pk-import-btn").addEventListener("click", function () {
      document.getElementById("pk-import").click();
    });
    document.getElementById("pk-import").addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (file) importFile(file);
    });
    window.addEventListener("hashchange", function () {
      if (!document.getElementById("pk-tool").hidden) renderView();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") persist();
    });
    window.addEventListener("pagehide", persist);
    if (state.gate.enabled && !sessionMatches()) showGate();
    else showTool(false);
  }

  boot();
})();
