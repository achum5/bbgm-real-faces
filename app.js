import { display } from "./faces.js";

const SITE = new URL(".", location.href).href;

const $ = (id) => document.getElementById(id);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const shuffle = (list) => {
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
};
const plain = (s) =>
	s
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase();

const res = await fetch("players.json");
const players = (await res.json()).map(([id, name, year, photo, face, score, uniform]) => ({
	id,
	name,
	year,
	photo,
	face,
	score,
	uniform,
	search: plain(name),
}));
const withPhoto = players.filter((p) => p.photo);
// Names people know, for the ticker
const known = withPhoto.filter((p) => p.score >= 5);

// facesjs measures each feature with getBBox to place it, which only works
// on an element that's in the page, so every face is drawn here first
const studio = document.createElement("div");
studio.style.cssText = "position:absolute;left:-10000px;top:0;width:400px;height:600px";
document.body.append(studio);

// Each player wears his team's jersey from the 2027 league file
const faceSvg = (p) => {
	studio.innerHTML = "";
	display(studio, {
		...structuredClone(p.face),
		jersey: { id: p.uniform[0] },
		teamColors: p.uniform[1],
	});
	return studio.innerHTML;
};

const drawFace = (div, p) => {
	div.innerHTML = faceSvg(p);
};

const faceEl = (p) => {
	const div = document.createElement("div");
	div.className = "face";
	drawFace(div, p);
	return div;
};

const photoEl = (p, onFail, eager) => {
	const img = document.createElement("img");
	img.alt = "";
	img.referrerPolicy = "no-referrer";
	img.loading = eager ? "eager" : "lazy";
	img.src = p.photo;
	img.onerror = onFail;
	return img;
};

const pairEl = (p, eager) => {
	const div = document.createElement("div");
	div.className = "pair";
	div.title = `${p.name} (${p.year})`;
	if (p.photo) {
		div.append(photoEl(p, () => div.querySelector("img")?.remove(), eager));
	}
	div.append(faceEl(p));
	div.onclick = () => show(p, true);
	return div;
};

// Favicon: somebody's face
const icon = document.createElement("link");
icon.rel = "icon";
icon.href = `data:image/svg+xml,${encodeURIComponent(faceSvg(pick(withPhoto)))}`;
document.head.append(icon);

// Ticker
const tickerPlayers = shuffle(known).slice(0, 40);
const track = $("ticker-track");
for (let copy = 0; copy < 2; copy++) {
	for (const p of tickerPlayers) {
		const div = pairEl(p, true);
		// A photo that won't load takes its whole pair with it, in both copies
		div.querySelector("img").onerror = () => {
			for (const el of track.querySelectorAll(`[data-id="${p.id}"]`)) {
				el.remove();
			}
		};
		div.dataset.id = p.id;
		track.append(div);
	}
}
track.style.setProperty("--ticker-duration", `${tickerPlayers.length * 3}s`);

// Viewer
const show = (p, scroll) => {
	const name = $("viewer-name");
	name.innerHTML = "";
	const link = document.createElement("a");
	link.href = `https://www.basketball-reference.com/players/${p.id[0]}/${p.id}.html`;
	link.textContent = p.name;
	name.append(link);
	$("viewer-year").textContent = p.year;
	const img = $("viewer-photo");
	img.hidden = !p.photo;
	img.onerror = () => {
		img.hidden = true;
	};
	img.src = p.photo ?? "";
	drawFace($("viewer-face"), p);
	if (scroll) {
		$("viewer-name").scrollIntoView({ behavior: "smooth", block: "center" });
	}
};
$("random").onclick = () => show(pick(players));
show(pick(players));

// Search
const results = $("results");
$("search").oninput = (event) => {
	const q = plain(event.target.value.trim());
	results.innerHTML = "";
	if (q.length < 2) {
		return;
	}
	const found = players
		.filter((p) => p.search.includes(q))
		.sort((a, b) => b.score - a.score)
		.slice(0, 30);
	for (const p of found) {
		const div = document.createElement("div");
		div.className = "player";
		div.append(pairEl(p));
		const name = document.createElement("div");
		name.className = "name";
		name.textContent = `${p.name} ${p.year}`;
		div.append(name);
		results.append(div);
	}
};

// Worker console code
const applyCode = `const players = bbgm.idb.merged
	? await bbgm.idb.merged.players.getAll()
	: await bbgm.idb.getCopies.players({}, "noCopyCache");
let count = 0;
for (const p of players) {
	const face = faces.get(p.srID);
	if (face) {
		p.face = {
			...face,
			jersey: p.face?.jersey ?? { id: "jersey" },
			teamColors: p.face?.teamColors ?? ["#89bfd3", "#7a1319", "#07364f"],
		};
		p.imgURL = "";
		await bbgm.idb.cache.players.put(p);
		count += 1;
	}
}
await bbgm.toUI("realtimeUpdate", [["playerMovement"]]);
console.log(\`Updated \${count} players\`);`;

const code = `// BBGM Real Faces
const response = await fetch("${SITE}players.json");
const faces = new Map();
for (const [id, , , , face] of await response.json()) {
	faces.set(id, face);
}
${applyCode}`;

const copyText = async (text, button) => {
	try {
		await navigator.clipboard.writeText(text);
	} catch {
		const area = document.createElement("textarea");
		area.value = text;
		document.body.append(area);
		area.select();
		document.execCommand("copy");
		area.remove();
	}
	const label = button.textContent;
	button.textContent = "Copied";
	setTimeout(() => {
		button.textContent = label;
	}, 1500);
};

$("copy").onclick = () => copyText(code, $("copy"));
