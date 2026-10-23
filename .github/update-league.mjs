// Puts every face from players.json into the downloadable league file, so it
// matches the site after suggestions are accepted. Runs in GitHub Actions.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

const FILE = "real-faces-2027-preseason.json.gz";
const league = JSON.parse(gunzipSync(readFileSync(FILE)));
const faces = new Map(JSON.parse(readFileSync("players.json", "utf8")).map((r) => [r[0], r[4]]));

// The same face whatever order its keys are in, team uniform aside
const sorted = (v) =>
	v && typeof v === "object" && !Array.isArray(v)
		? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])]))
		: v;
const strip = ({ jersey, teamColors, ...face }) => JSON.stringify(sorted(face));
let changed = 0;
for (const p of league.players) {
	const face = faces.get(p.srID);
	if (face && (!p.face || strip(p.face) !== strip(face))) {
		p.face = {
			...face,
			jersey: p.face?.jersey ?? { id: "jersey" },
			teamColors: p.face?.teamColors ?? ["#89bfd3", "#7a1319", "#07364f"],
		};
		changed += 1;
	}
}
if (changed > 0) {
	writeFileSync(FILE, gzipSync(JSON.stringify(league), { level: 9 }));
}
console.log(`Updated ${changed} faces in the league file`);
