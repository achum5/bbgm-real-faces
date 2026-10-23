import { display } from "./faces.js";

const SITE = new URL(".", location.href).href;
const MIN_YEAR = 1946;
const MAX_YEAR = 2030;
const BATCH_SIZE = 1000;

const COLORS = [
	["#89bfd3", "#7a1319", "#07364f"],
	["#1d428a", "#ffc72c", "#ffffff"],
	["#007a33", "#ffffff", "#ba9653"],
	["#552583", "#fdb927", "#000000"],
	["#ce1141", "#000000", "#ffffff"],
	["#0e2240", "#fec524", "#8b2131"],
	["#00788c", "#1d1160", "#a1a1a4"],
	["#98002e", "#f9a01b", "#000000"],
];

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
const players = (await res.json()).map(([id, name, year, photo, face, score]) => ({
	id,
	name,
	year,
	photo,
	face,
	score,
	search: plain(name),
}));
const withPhoto = players.filter((p) => p.photo);
// Names people know, for the ticker and the random button
const known = withPhoto.filter((p) => p.score >= 5);

// facesjs measures each feature with getBBox to place it, which only works
// on an element that's in the page, so every face is drawn here first
const studio = document.createElement("div");
studio.style.cssText = "position:absolute;left:-10000px;top:0;width:400px;height:600px";
document.body.append(studio);

const faceSvg = (p, colors = pick(COLORS)) => {
	studio.innerHTML = "";
	display(studio, {
		...structuredClone(p.face),
		jersey: { id: "jersey" },
		teamColors: colors,
	});
	return studio.innerHTML;
};

const drawFace = (div, p, colors) => {
	div.innerHTML = faceSvg(p, colors);
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
icon.href = `data:image/svg+xml,${encodeURIComponent(faceSvg(pick(withPhoto), COLORS[0]))}`;
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
$("random").onclick = () => show(pick(known));
show(pick(known));

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

// Decades
const decades = $("decades");
for (let start = 1940; start <= 2020; start += 10) {
	const best = players
		.filter((p) => p.year >= start && p.year < start + 10)
		.sort((a, b) => b.score - a.score)
		.slice(0, 12);
	const h = document.createElement("h3");
	h.className = "mt-3";
	h.textContent = `${start}s`;
	const row = document.createElement("div");
	row.className = "decade";
	for (const p of best) {
		const div = document.createElement("div");
		div.className = "player";
		div.title = p.name;
		div.append(faceEl(p));
		const name = document.createElement("div");
		name.className = "name";
		name.textContent = p.name.split(" ").slice(1).join(" ") || p.name;
		div.append(name);
		div.onclick = () => show(p, true);
		row.append(div);
	}
	decades.append(h, row);
}

// Worker console code
const applyCode = (keepPhotos) => `const players = bbgm.idb.merged
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
		${
			keepPhotos
				? `if (!p.imgURL || p.imgURL.includes("blank-face")) {
			p.imgURL = "";
		}`
				: `p.imgURL = "";`
		}
		await bbgm.idb.cache.players.put(p);
		count += 1;
	}
}
await bbgm.toUI("realtimeUpdate", [["playerMovement"]]);
console.log(\`Updated \${count} players\`);`;

const fetchCode = (from, to, keepPhotos) => `// BBGM Real Faces, draft classes ${from}-${to}
const response = await fetch("${SITE}players.json");
const faces = new Map();
for (const [id, , year, , face] of await response.json()) {
	if (year >= ${from} && year <= ${to}) {
		faces.set(id, face);
	}
}
${applyCode(keepPhotos)}`;

const batchCode = (data, label, keepPhotos) => `// BBGM Real Faces, ${label}
const data = "${data}";
const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
const faces = new Map(await new Response(stream).json());
${applyCode(keepPhotos)}`;

const gzipBase64 = async (text) => {
	const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
	const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
};

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

let code = "";
let batches = [];
let version = 0;

const range = () => {
	let from = Number($("from").value) || MIN_YEAR;
	let to = Number($("to").value) || MAX_YEAR;
	from = Math.min(Math.max(from, MIN_YEAR), MAX_YEAR);
	to = Math.min(Math.max(to, MIN_YEAR), MAX_YEAR);
	return from <= to ? [from, to] : [to, from];
};

const update = async () => {
	const mine = ++version;
	const [from, to] = range();
	const keepPhotos = $("keep-photos").checked;
	const chosen = players.filter((p) => p.year >= from && p.year <= to);
	$("count").textContent = `${chosen.length.toLocaleString()} players`;
	code = fetchCode(from, to, keepPhotos);
	$("code").textContent = code;
	$("copy").disabled = chosen.length === 0;

	// Built ahead of time so each copy happens right in the click, which
	// phones require
	const list = [];
	const n = Math.ceil(chosen.length / BATCH_SIZE);
	for (let i = 0; i < n; i++) {
		const part = chosen.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
		const years = `${part[0].year}-${part.at(-1).year}`;
		const data = await gzipBase64(JSON.stringify(part.map((p) => [p.id, p.face])));
		if (mine !== version) {
			return;
		}
		list.push({
			label: `batch ${i + 1} of ${n} (${years})`,
			years,
			count: part.length,
			code: batchCode(data, `batch ${i + 1} of ${n} (${years})`, keepPhotos),
		});
	}
	batches = list;
	renderBatches();
};

const renderBatches = () => {
	const box = $("batches");
	box.innerHTML = "";
	for (const [i, batch] of batches.entries()) {
		const row = document.createElement("div");
		row.className = "batch";
		const button = document.createElement("button");
		button.className = "btn btn-sm btn-light border";
		button.textContent = `Copy ${i + 1}`;
		button.onclick = () => {
			copyText(batch.code, button);
			row.classList.add("done");
		};
		const text = document.createElement("span");
		text.textContent = `${batch.years}, ${batch.count} players`;
		row.append(button, text);
		box.append(row);
	}
};

$("copy").onclick = () => copyText(code, $("copy"));
$("batch-toggle").onclick = (event) => {
	event.preventDefault();
	$("batches").hidden = !$("batches").hidden;
};
for (const id of ["from", "to", "keep-photos"]) {
	$(id).addEventListener("input", update);
}
update();
