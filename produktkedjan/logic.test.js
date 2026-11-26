"use strict";

var assert = require("assert");
var pk = require("./logic.js");

function baseMargin(overrides) {
  var margin = pk.defaultState().margin;
  Object.keys(overrides).forEach(function (key) {
    margin[key] = overrides[key];
  });
  return margin;
}

var filled = baseMargin({
  salesPriceExVat: "100",
  purchasePrice: "30",
  freightIn: "5",
  customs: "2",
  fbaFee: "20",
  storagePerUnit: "1",
  referralMode: "percent",
  referralValue: "15",
  adsPerUnit: "4",
  otherCosts: "3"
});

var percent = pk.calcMargin(filled);
assert.strictEqual(percent.ok, true);
assert.strictEqual(percent.complete, true);
assert.strictEqual(percent.landedCost, 37);
assert.strictEqual(percent.referralAmount, 15);
assert.strictEqual(percent.contribution, 20);
assert.strictEqual(percent.marginPct, 20);
assert.strictEqual(percent.totalDeductions, 80);

var amount = pk.calcMargin(baseMargin({
  salesPriceExVat: "100",
  purchasePrice: "30",
  freightIn: "5",
  customs: "2",
  fbaFee: "20",
  storagePerUnit: "1",
  referralMode: "amount",
  referralValue: "15",
  adsPerUnit: "4",
  otherCosts: "3"
}));
assert.strictEqual(amount.contribution, 20);
assert.strictEqual(amount.marginPct, 20);

var partial = pk.calcMargin(baseMargin({
  salesPriceExVat: "100",
  purchasePrice: "30",
  freightIn: "5",
  customs: "2"
}));
assert.strictEqual(partial.complete, false);
assert.strictEqual(partial.landedCost, 37);
assert.strictEqual(partial.contribution, null);
assert.ok(partial.missing.indexOf("fbaFee") >= 0);
assert.ok(partial.missing.indexOf("referralValue") >= 0);

var blank = pk.calcMargin(pk.defaultState().margin);
assert.strictEqual(blank.complete, false);
assert.strictEqual(blank.landedCost, null);
assert.notStrictEqual(blank.contribution, 0);

var defaults = pk.defaultState();
pk.MARGIN_FIELDS.forEach(function (field) {
  assert.strictEqual(defaults.margin[field.id], "", field.id + " ska vara tomt");
});
assert.strictEqual(defaults.profile.marketId, "amazon.se");
assert.strictEqual(defaults.margin.referralMode, "amount");

var comma = pk.calcMargin(baseMargin({
  salesPriceExVat: "199",
  purchasePrice: "10",
  freightIn: "0",
  customs: "0",
  fbaFee: "0",
  storagePerUnit: "0",
  referralMode: "percent",
  referralValue: "15",
  adsPerUnit: "0",
  otherCosts: "0"
}));
assert.strictEqual(comma.referralAmount, 29.85);
assert.strictEqual(comma.contribution, 159.15);

var bad = pk.calcMargin(baseMargin({ salesPriceExVat: "abc" }));
assert.strictEqual(bad.ok, false);

var zero = pk.calcMargin(baseMargin({
  salesPriceExVat: "0",
  purchasePrice: "1",
  freightIn: "0",
  customs: "0",
  fbaFee: "0",
  storagePerUnit: "0",
  referralMode: "amount",
  referralValue: "0",
  adsPerUnit: "0",
  otherCosts: "0"
}));
assert.strictEqual(zero.complete, true);
assert.strictEqual(zero.marginPct, null);
assert.strictEqual(zero.contribution, -1);

var criteria = pk.defaultState().criteria;
criteria.scores = {
  sizeWeight: "4",
  margin: "5",
  competition: "3",
  complexity: "2",
  startupCost: "4"
};
var scored = pk.calcCriteria(criteria);
assert.strictEqual(scored.complete, true);
assert.strictEqual(scored.weightSum, 100);
assert.ok(Math.abs(scored.score - 3.65) < 0.0001);
assert.strictEqual(scored.pass, true);

criteria.threshold = "3,65";
assert.strictEqual(pk.calcCriteria(criteria).pass, true);
criteria.threshold = "3.7";
assert.strictEqual(pk.calcCriteria(criteria).pass, false);

criteria.threshold = "3.5";
criteria.scores.margin = "";
var incomplete = pk.calcCriteria(criteria);
assert.strictEqual(incomplete.complete, false);
assert.strictEqual(incomplete.score, null);
assert.strictEqual(incomplete.weightSum, 100);

var state = pk.defaultState();
state.margin = filled;
assert.ok(pk.derivedLine(state, 3).indexOf("20,0") >= 0);
state.suppliers = [
  { id: "a", name: "Nord", favorite: true },
  { id: "b", name: "Syd", favorite: false }
];
assert.strictEqual(pk.derivedLine(state, 4), "2 offerter, varav 1 favorit.");

var roundtrip = pk.normalize(JSON.parse(JSON.stringify(pk.toDocument(state))));
assert.strictEqual(roundtrip.profile.marketId, "amazon.se");
assert.strictEqual(roundtrip.margin.fbaFee, "20");
assert.strictEqual(roundtrip.suppliers[0].favorite, true);
assert.strictEqual(roundtrip.checklists[6].length, pk.CHECKLISTS[6].length);
assert.strictEqual(roundtrip.steps[11].status, "not_started");

assert.throws(function () { pk.normalize({ version: 2 }); }, /version 2/);
assert.throws(function () { pk.normalize({}); }, /saknar version/);

var kept = pk.normalize({
  version: 1,
  checklists: { 5: [{ id: "5-order", done: true, date: "2026-11-01", notes: "två prov", link: "https://example.com/prov" }] }
});
assert.strictEqual(kept.checklists[5][0].done, true);
assert.strictEqual(kept.checklists[5][0].date, "2026-11-01");
assert.strictEqual(kept.checklists[5][0].label, pk.CHECKLISTS[5][0].label);
assert.strictEqual(kept.margin.referralValue, "");

assert.strictEqual(pk.safeUrl("javascript:alert(1)"), "");
assert.strictEqual(pk.safeUrl("https://sell.amazon.se/priser"), "https://sell.amazon.se/priser");
assert.strictEqual(pk.FEE_LINKS.calculator, "https://sellercentral.amazon.se/revcalpublic");
assert.strictEqual(pk.FEE_LINKS.prices, "https://sell.amazon.se/priser");
assert.strictEqual(pk.FEE_LINKS.fba, "https://sell.amazon.se/fulfilment-by-amazon");
assert.strictEqual(pk.FEE_LINKS.vat, "https://sell.amazon.se/lara-sig/moms-resurser");

var physical = pk.describePhysical({ lengthCm: "10", widthCm: "10", heightCm: "10", weightG: "250" });
assert.ok(physical.indexOf("liter") >= 0);
assert.ok(physical.indexOf("kg") >= 0);

assert.strictEqual(pk.marketById("amazon.de").currency, "EUR");
assert.strictEqual(pk.STEPS.length, 11);
assert.strictEqual(pk.STEPS[0].title, "Produktidé & kriterier");
assert.strictEqual(pk.STEPS[10].title, "Uppföljning");

console.log("logic.test.js: ok");
