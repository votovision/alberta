/**
 * Veilles de la Colombie-Britannique (2020, 2024) pour estimer le choc
 * systémique avec celle de l'Alberta (2023) : une seule élection albertaine
 * donnerait un tau instable. Lit le dépôt voisin ../bc (data/bc_eve_national.json
 * et data/bc_riding_results.json, publiés). systemicTau ne compare que des
 * parts d'un même vecteur : les vecteurs de la C.-B. gardent leur propre
 * liste de partis.
 */
import { readFileSync } from "node:fs";

const P_BC = ["NDP", "CON", "GRN", "BCU", "ONEBC", "CENTRE", "AUTRES"];
const SCRUTINS = { T1: ["2020-10-24", "2015"], T2: ["2024-10-19", "2023"] };

export function veillesBc() {
  const load = (f) => JSON.parse(readFileSync(new URL(`../../bc/data/${f}`, import.meta.url), "utf-8"));
  const eve = load("bc_eve_national.json"), rows = load("bc_riding_results.json");
  return Object.entries(SCRUTINS).map(([id, [date, carte]]) => {
    const v = P_BC.map(() => 0);
    for (const r of rows) if (r.election_date === date && r.boundary_year === carte) v[P_BC.indexOf(r.party_code)] += r.votes;
    const t = v.reduce((a, b) => a + b, 0);
    return { id: `BC-${id}`, actual: v.map((x) => x / t), eve: eve[id].point };
  });
}
