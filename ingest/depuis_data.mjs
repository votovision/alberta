/**
 * Entrées du modèle tirées du dépôt de données votovision/data (clone voisin
 * ../data, ou chemin donné en argument) :
 *  - data/ab_polls.json : sondages provinciaux et régionaux (sondages.csv et
 *    parts.csv, juridiction ab-provincial), une ligne par sondage, groupe et
 *    parti ;
 *  - data/ab_national_polls.json : sondages provinciaux seulement, au format
 *    du tableau de bord ;
 *  - data/ab_riding_results.json : résultats d'Elections Alberta par
 *    circonscription et par parti (2019 et 2023, carte de 2019), lus dans
 *    ../data/raw/elections_alberta/resultats_<année>.csv (formatés en local
 *    par sources/elections_alberta.ts --formater). Les conditions
 *    d'Elections Alberta interdisent de republier ces données modifiées : ce
 *    fichier est ignoré par git.
 *
 * Partis du modèle : ABP (Parti albertain) devient TORY, son nom depuis
 * décembre 2025 ; WLC, RPA, IPA, SMA et les autres vont dans AUTRES.
 *
 * Run: node ingest/depuis_data.mjs [chemin du dépôt data]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = fileURLToPath(new URL(".", import.meta.url));
const DATA = resolve(process.argv[2] ?? join(ICI, "..", "..", "data"));
const OUT = new URL("../data/", import.meta.url);
const JURIDICTION = "ab-provincial";
const PARTIS = { UCP: "UCP", NDP: "NDP", ABP: "TORY", TORY: "TORY", GRN: "GRN", LIB: "LIB", WIP: "WIP" };
const parti = (p) => PARTIS[p] ?? "AUTRES";

function lireCsv(chemin) {
  const texte = readFileSync(chemin, "utf-8").replace(/^﻿/, "");
  const lignes = []; let ligne = [], champ = "", q = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (q) { if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; } else if (c === '"') q = false; else champ += c; }
    else if (c === '"') q = true;
    else if (c === ",") { ligne.push(champ); champ = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && texte[i + 1] === "\n") i++; ligne.push(champ); lignes.push(ligne); ligne = []; champ = ""; }
    else champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  const [h, ...r] = lignes.filter((l) => l.length > 1);
  return r.map((l) => Object.fromEntries(h.map((k, j) => [k, l[j] ?? ""])));
}
const ecrire = (nom, v) => { writeFileSync(new URL(nom, OUT), JSON.stringify(v)); console.log(`${nom} : ${Array.isArray(v) ? v.length : Object.keys(v).length}`); };

/** Parts d'un sondage regroupées par parti du modèle (AUTRES additionnés). */
const regrouper = (ps) => { const m = new Map(); for (const p of ps) m.set(parti(p.parti), (m.get(parti(p.parti)) ?? 0) + Number(p.pct)); return [...m]; };

const sondages = lireCsv(join(DATA, "csv", "sondages.csv")).filter((s) => s.juridiction === JURIDICTION);
const parts = new Map();
for (const p of lireCsv(join(DATA, "csv", "parts.csv"))) { if (!parts.has(p.id)) parts.set(p.id, []); parts.get(p.id).push(p); }
ecrire("ab_polls.json", sondages.flatMap((s) => regrouper(parts.get(s.id) ?? []).map(([p, pct]) => ({
  poll_id: s.id, region_code: s.region, firm: s.firme, poll_date: s.date_fin, start_date: s.date_debut || null,
  sample_size: s.n ? Number(s.n) : null, party_code: p, pct_reported: pct, source: s.provenance,
}))));
ecrire("ab_national_polls.json", sondages.filter((s) => s.region === "National").flatMap((s) => regrouper(parts.get(s.id) ?? []).map(([p, pct]) => ({
  poll_id: s.id, region_code: "National", firm: s.firme, poll_date: s.date_fin, sample_size: s.n ? Number(s.n) : null,
  party_code: p, pct_reported: pct, n_decided: s.n_decides ? Number(s.n_decides) : null,
}))));

const resultats = [];
for (const annee of ["2019", "2023"]) {
  for (const r of lireCsv(join(DATA, "raw", "elections_alberta", `resultats_${annee}.csv`))) {
    resultats.push({ election_date: r.election, boundary_year: r.carte, riding_code: r.circonscription, riding_name: r.nom, party_code: parti(r.parti), votes: Number(r.votes) });
  }
}
ecrire("ab_riding_results.json", resultats);
