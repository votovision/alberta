/**
 * Prévision de l'élection générale de l'Alberta du 18 octobre 2027 : départ
 * résultats de 2023 (carte de 2019, 87 circonscriptions) ; composition
 * provinciale = tendance GP des sondages provinciaux du cycle, prédite à la
 * date du scrutin pendant la campagne, à la date du jour avant le
 * déclenchement (moyenne et tirages) ; choc systémique CLR de variance
 * tau² / s (tau estimé sur la veille albertaine de 2023 et les veilles de la
 * C.-B. de 2020 et de 2024, lib/veilles_bc.mjs) ; swing par transfert dans la
 * moitié des tirages et additif dans l'autre ; écart local tiré parmi les
 * erreurs de la transition 2019-2023. Tous les partis sont supposés présents
 * partout tant que les candidatures de 2027 ne sont pas connues. Écrit
 * data/ab_dashboard.json au schéma du tableau de bord, sans les résultats
 * de 2023 par circonscription (données d'Elections Alberta, non republiées).
 *
 * Run: node tools/project_now.mjs [AAAA-MM-JJ]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { ridings, aggregate, presenceFromResults, coverageTarget, transferSwing, TRANSITIONS, P, MAIN, REGIONS, winnerOf } from "../lib/ab.mjs";
import { simulate, localResiduals, systemicTau, interval } from "../lib/simulate.mjs";
import { loadBreakdowns, pooled, regionalShift } from "../lib/regional.mjs";
import { veillesBc } from "../lib/veilles_bc.mjs";
import { cyclePolls, withoutWithdrawn } from "./eve_national.mjs";
import { seatDistributions, governmentScenarios } from "../src/simulate.js";
import { fitTrend, predictTrend, sampleTrendDraws, predictTrendSeries } from "../src/gpTrend.js";

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf-8"));
const calendar = load("ab_calendar.json");
const eve = load("ab_eve_national.json");
const asOf = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const ELECTION = "2027-10-18", LAST = ["2023-05-29", "2019"];
// Après le scrutin, la prévision de la veille reste telle quelle, pour la comparer aux résultats.
if (asOf > ELECTION && !process.argv.includes("--forcer")) {
  console.log(`Scrutin du ${ELECTION} passé : prévision figée (--forcer pour la recalculer)`);
  process.exit(0);
}
const KAPPA = 0, N = 2000;
const SPEC = { tau: 120, D: 16, campaigns: calendar.campaigns };

// Historique : choc systémique et bassin d'erreurs locales.
const hist = TRANSITIONS.map((T) => {
  const A = ridings(...T.base), B = ridings(...T.target);
  const list = [...A.values()].filter((x) => B.has(x.code));
  const real = Object.fromEntries(REGIONS.map((g) => [g, aggregate([...B.values()].filter((y) => y.region === g))]));
  return { T, B, list, real, presence: presenceFromResults(B), actual: aggregate([...B.values()]) };
});
// Choc systémique estimé sur la veille albertaine de 2023 et les veilles de la C.-B. de 2020 et de 2024.
const tau = systemicTau([...hist.map((h) => ({ actual: h.actual, eve: eve[h.T.id].point })), ...veillesBc()]);
const FORMS = ["transfert", "additif"];
const pool = Object.fromEntries(FORMS.map((f) => [f, hist.flatMap((h) => localResiduals(h.list, (x) => h.B.get(x.code).shares, h.real, h.presence, f))]));

// Départ ; candidatures de 2027 inconnues : tous les partis présents partout.
const list = [...ridings(...LAST).values()];
const presence = () => P.map(() => true);

// Tendance provinciale du cycle, prédite à la date du scrutin.
const { polls, partyCodes, withdrawn } = cyclePolls(LAST[0], asOf <= ELECTION ? new Date(Date.parse(asOf) + 864e5).toISOString().slice(0, 10) : ELECTION);
const model = fitTrend(polls, partyCodes, { calendar });
// Horizon : avant le déclenchement (campagne de ELECTION absente du calendrier ou pas commencée),
// la tendance est prédite à la date du jour (« si l'élection avait lieu aujourd'hui ») ;
// pendant la campagne, à la date du scrutin.
const campagne = calendar.campaigns.find(([, fin]) => fin === ELECTION);
const horizon = campagne && asOf >= campagne[0] ? "scrutin" : "aujourdhui";
const target = horizon === "scrutin" && asOf < ELECTION ? ELECTION : asOf;
const pred = predictTrend(model, target, { nSamples: 400, seed: 9 });
const trendPoint = withoutWithdrawn(P.map((p) => pred[p]?.mean ?? 0), withdrawn);
const draws = sampleTrendDraws(model, target, 400, 9).map((d) => withoutWithdrawn(P.map((p) => d[p] ?? 0), withdrawn));
const province = coverageTarget(list, trendPoint, presence);

const zoneVotes = {}; for (const x of list) zoneVotes[x.zone] = (zoneVotes[x.zone] ?? 0) + x.total;
const regPolls = loadBreakdowns(zoneVotes);
const regPool = pooled(regPolls, asOf, LAST[0], SPEC);
const shift = regionalShift(regPool, list, transferSwing(list, province, { present: presence }), KAPPA);
const sim = simulate(list, province, draws.map((d) => coverageTarget(list, d, presence)), { tau, shift, pool, presence, form: "mixte", N });

const fmt = (v) => P.map((p, j) => `${p} ${(100 * v[j]).toFixed(1)}`).join(" ");
console.log(`Prévision au ${asOf} pour le ${ELECTION} : ${polls.length} sondages provinciaux, ${regPolls.filter((q) => q.date > LAST[0]).length} ventilations régionales`);
console.log(`  tendance       ${fmt(trendPoint)}`);
console.log(`  couverture     ${fmt(province)}`);
console.log(`  tau ${tau.toFixed(3)} ; bassin ${pool.transfert.length} erreurs locales par forme ; kappa ${KAPPA}`);
console.log(`  sièges : ponctuel ${JSON.stringify(sim.pointSeats)} ; médoïde ${JSON.stringify(sim.medoid)}`);
console.log(`  intervalles à 90 % : ${MAIN.map((p) => { const iv = interval(sim.seats, p); return `${p} ${iv.med} [${iv.lo}-${iv.hi}]`; }).join(" | ")}`);
for (const g of REGIONS) if (regPool[g]) console.log(`  sondages ${g.padEnd(5)} ${fmt(regPool[g])}`);

// --- Export au schéma du tableau de bord ----------------------------------------
const seatDraws = sim.seats.map((d) => ({ ...d, AUTRES: 0 }));
// Partis affichés : ceux qui gagnent au moins un siège dans 1 % des tirages, et le PCU et le NPD.
const shown = P.filter((p) => p !== "AUTRES" && (["UCP", "NDP"].includes(p) || sim.seats.filter((s) => s[p] > 0).length >= N / 100));
// Tendance affichée : un GP par cycle (2017-2020, 2020-2024, depuis 2024), séries mises
// bout à bout ; un parti retiré disparaît après sa dernière mesure, les autres parts
// renormalisées.
const weekly = (from, to) => { const out = []; for (let d = new Date(from); d <= new Date(to); d.setDate(d.getDate() + 7)) out.push(d.toISOString().slice(0, 10)); if (out.at(-1) !== to) out.push(to); return out; };
const cycleSeries = (from, to, m, cycle) => predictTrendSeries(m, weekly(cycle.polls[0].pollDate, to), { nSamples: 300, seed: 1 }).map((row) => {
  const gone = cycle.withdrawn.filter((p) => row.date > cycle.lastMeasured[p] && row[p]);
  if (!gone.length) return row;
  const k = 1 / (1 - gone.reduce((a, p) => a + row[p].mean, 0));
  const out = { date: row.date };
  for (const [p, v] of Object.entries(row)) if (p !== "date" && !gone.includes(p)) out[p] = Object.fromEntries(Object.entries(v).map(([s, x]) => [s, x * k]));
  return out;
});
const trendSeries = [
  ...TRANSITIONS.flatMap((T) => {
    const c = cyclePolls(T.base[0], T.target[0]);
    return cycleSeries(T.base[0], T.target[0], fitTrend(c.polls, c.partyCodes, { calendar }), c);
  }),
  ...cycleSeries(LAST[0], asOf, model, { polls, withdrawn, lastMeasured: {} }),
];
const winnerSeats = (shares) => { const s = Object.fromEntries(P.map((p) => [p, 0])); for (const v of shares) s[winnerOf(v)]++; return s; };
const gallagher = (v, seats, n) => Math.sqrt(P.reduce((t, p, j) => t + (100 * v[j] - (100 * seats[p]) / n) ** 2, 0) / 2);
const gallagherPrevious = gallagher(aggregate(list), winnerSeats(list.map((x) => x.shares)), list.length);
const q = (arr, pc) => { const s2 = [...arr].sort((a, b) => a - b); return s2[Math.floor((pc / 100) * (s2.length - 1))]; };
const gal = [], gaps = Object.fromEntries(P.map((p) => [p, []])), vMean = Object.fromEntries(P.map((p) => [p, 0])), sMean = Object.fromEntries(P.map((p) => [p, 0]));
for (let i = 0; i < seatDraws.length; i++) {
  let sq = 0;
  for (const p of P) { const v = sim.votes[i][p] * 100, s2 = (seatDraws[i][p] / list.length) * 100; sq += (v - s2) ** 2; gaps[p].push(s2 - v); vMean[p] += v / N; sMean[p] += s2 / N; }
  gal.push(Math.sqrt(sq / 2));
}
const ZONE_NAMES = { CGY: "Calgary", EDM: "Edmonton", RESTE: "Reste de la province" };
const national = aggregate(list.map((x, i) => ({ ...x, s: sim.point[i] })), (x) => x.s);
const dash = {
  meta: { generatedAt: new Date().toISOString(), asOf, electionDate: ELECTION, horizon, targetDate: target, nDraws: N, gallagherPrevious, projectedVote: Object.fromEntries(P.map((p, j) => [p, national[j]])),
    nPolls: polls.length, nRegionalPolls: regPolls.filter((q2) => q2.date > LAST[0] && q2.date <= asOf).length, nRidings: list.length, baseElection: LAST[0], tau, kappa: KAPPA },
  partyCodes: shown, trendPartyCodes: P.filter((p) => trendSeries.some((r) => r[p])), totalSeats: list.length, trendSeries,
  ridingForecast: Object.fromEntries(list.map((x, i) => [x.code, { shares: Object.fromEntries(P.map((p, j) => [p, sim.point[i][j]])), winner: winnerOf(sim.point[i]) }])),
  ridingWinProbs: Object.fromEntries(list.map((x, i) => [x.code, { ...sim.winProb[i], AUTRES: 0 }])),
  ridingNames: Object.fromEntries(list.map((x) => [x.code, x.name])),
  ridingRegions: Object.fromEntries(list.map((x) => [x.code, ZONE_NAMES[x.zone]])),
  seatDistributions: seatDistributions(seatDraws, shown),
  pointCounts: { ...sim.pointSeats, AUTRES: 0 }, medoidCounts: { ...sim.medoid, AUTRES: 0 },
  scenarios: governmentScenarios(seatDraws, list.length, shown),
  disproportion: { voteShare: vMean, seatShare: sMean, gaps: Object.fromEntries(P.map((p) => [p, { p05: q(gaps[p], 5), p50: q(gaps[p], 50), p95: q(gaps[p], 95) }])), gallagher: { p05: q(gal, 5), p50: q(gal, 50), p95: q(gal, 95) } },
};
writeFileSync(new URL("../data/ab_dashboard.json", import.meta.url), JSON.stringify(dash));
console.log(`ab_dashboard.json : ${trendSeries.length} points de tendance, ${dash.scenarios.length} scénarios`);
