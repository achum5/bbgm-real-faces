// The two files BBGM's Global Settings can load from a URL: Player Photos
// (every face, keyed by player id) and Team Info (u/alexnoob's real teams,
// with each team's real jersey style). Runs in GitHub Actions, and writes a
// file only when it changed.
import { readFileSync, writeFileSync } from "node:fs";

const TEAM_FILE = "https://raw.githubusercontent.com/alexnoob/BasketBall-GM-Rosters/master/team%20data.json";

const write = (file, data) => {
	const text = JSON.stringify(data);
	let old;
	try {
		old = readFileSync(file, "utf8");
	} catch {}
	if (old !== text) {
		writeFileSync(file, text);
		console.log(`Wrote ${file}`);
	}
};

// Player Photos. BBGM checks every face has a jersey and team colors; the
// game replaces both with the player's team when it draws him.
const rows = JSON.parse(readFileSync("players.json", "utf8"));
write(
	"player-photos.json",
	Object.fromEntries(
		rows.map(([id, , , , face, , uniform]) => [
			id,
			{
				...face,
				jersey: { id: uniform?.[0] ?? "jersey" },
				teamColors: uniform?.[1] ?? ["#89bfd3", "#7a1319", "#07364f"],
			},
		]),
	),
);

// Team Info, the same teams the site's console code applies
const teamInfo = await (await fetch(TEAM_FILE)).json();
const jerseys = JSON.parse(readFileSync("jerseys.json", "utf8"));
for (const [srID, { jersey, seasons }] of Object.entries(jerseys)) {
	const info = teamInfo[srID];
	if (info) {
		info.jersey = jersey;
		for (const [season, style] of Object.entries(seasons ?? {})) {
			info.seasons = { ...info.seasons, [season]: { ...info.seasons?.[season], jersey: style } };
		}
	}
}

// BBGM schedules a made-up 2028 expansion in Seattle (srID "_SET"), which
// Global Settings can't take out the way the console code does - so Seattle
// comes back as the SuperSonics, in their last look.
const sonics = teamInfo.SEA;
if (sonics) {
	const last = Object.assign({}, ...Object.keys(sonics.seasons ?? {}).sort().map((s) => sonics.seasons[s]));
	teamInfo._SET = {
		abbrev: "SEA",
		region: sonics.region,
		name: sonics.name,
		colors: last.colors ?? sonics.colors,
		imgURL: last.imgURL ?? sonics.imgURL,
		imgURLSmall: last.imgURLSmall ?? sonics.imgURLSmall,
		jersey: sonics.jersey ?? "jersey",
	};
}
write("team-info.json", teamInfo);
