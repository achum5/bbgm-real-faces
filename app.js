import { display } from "./faces.js";

const SITE = new URL(".", location.href).href;

// Change requests are posted to a Google Form
const FORM = {
	url: "https://docs.google.com/forms/d/e/1FAIpQLSd78TKi7-8WDPpdiCzwRtrMmOpcECZh5LCPHbZ9iRK2W3CWbw/formResponse",
	player: "entry.853634109",
	change: "entry.1002594022",
	face: "entry.823317504",
	note: "entry.1810661261",
};

const SKINS = ["#f2d0b8", "#ecc8b3", "#e3bda5", "#ddb7a0", "#d9a886", "#cc9a78", "#c49070", "#bb876f", "#b07a5f", "#a67358", "#9b6a50", "#8d5d45", "#80523e", "#7a4a36", "#6e4030", "#673a2a", "#5a3626", "#4a2c20"];
const HAIR_COLORS = ["#0f0902", "#1c1008", "#272421", "#3D2314", "#5A3825", "#7a5230", "#9a6a40", "#b8925a", "#c8a878", "#d8c8a0", "#b0602e", "#8c8c8c", "#d9d9d9"];

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

const [players, options] = await Promise.all([
	fetch("players.json")
		.then((res) => res.json())
		.then((rows) =>
			rows.map(([id, name, year, photo, face, score, uniform]) => ({
				id,
				name,
				year,
				photo,
				face,
				score,
				uniform,
				search: plain(name),
			})),
		),
	fetch("options.json").then((res) => res.json()),
]);
const withPhoto = players.filter((p) => p.photo);
// Names people know, for the ticker
const known = withPhoto.filter((p) => p.score >= 5);

// facesjs measures each feature with getBBox to place it, which only works
// on an element that's in the page, so every face is drawn here first
const studio = document.createElement("div");
studio.style.cssText = "position:absolute;left:-10000px;top:0;width:400px;height:600px";
document.body.append(studio);

// Each player wears his team's jersey from the 2027 league file
const faceSvg = (p, face = p.face) => {
	studio.innerHTML = "";
	display(studio, {
		...structuredClone(face),
		jersey: { id: p.uniform[0] },
		teamColors: p.uniform[1],
	});
	return studio.innerHTML;
};

const faceEl = (p) => {
	const div = document.createElement("div");
	div.className = "face";
	div.innerHTML = faceSvg(p);
	return div;
};

const pairEl = (p) => {
	const div = document.createElement("div");
	div.className = "pair";
	div.title = `${p.name} (${p.year})`;
	const img = document.createElement("img");
	img.alt = "";
	img.referrerPolicy = "no-referrer";
	img.src = p.photo;
	div.append(img, faceEl(p));
	div.onclick = () => show(p, true);
	return div;
};

// Favicon: a random face from the current players.json, cropped to the head.
// As a file of its own the SVG needs its namespace, which the page doesn't.
const icon = document.createElement("link");
icon.rel = "icon";
icon.href = `data:image/svg+xml,${encodeURIComponent(
	faceSvg(pick(players))
		.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"')
		.replace(/viewBox="[^"]*"/, 'viewBox="-15 50 430 430"'),
)}`;
document.head.append(icon);

// Ticker
const tickerPlayers = shuffle(known).slice(0, 40);
const track = $("ticker-track");
for (let copy = 0; copy < 2; copy++) {
	for (const p of tickerPlayers) {
		const div = pairEl(p);
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
let current;
let edited;
const nameInput = $("name");
const viewerFace = $("viewer-face");

// The name box is as wide as the name, and wider while searching
const measure = document.createElement("span");
measure.className = "name measure";
document.body.append(measure);
const fitName = () => {
	measure.textContent = nameInput.value || nameInput.placeholder;
	const width = measure.offsetWidth + 2;
	nameInput.style.width = `${document.activeElement === nameInput ? Math.max(width, 260) : width}px`;
};

// The face as it is, and once it's been edited, an arrow to the new one
const drawViewer = () => {
	const changed = edited !== undefined && changes().length > 0;
	viewerFace.innerHTML = faceSvg(current);
	$("viewer-arrow").hidden = !changed;
	$("viewer-new").hidden = !changed;
	$("viewer-new").innerHTML = changed ? faceSvg(current, edited) : "";
};

const show = (p, scroll) => {
	current = p;
	nameInput.value = p.name;
	fitName();
	const img = $("viewer-photo");
	img.hidden = !p.photo;
	img.onerror = () => {
		img.hidden = true;
	};
	img.src = p.photo ?? "";
	if (!$("request").hidden) {
		startEditing();
	}
	drawViewer();
	if (scroll) {
		nameInput.scrollIntoView({ behavior: "smooth", block: "center" });
	}
};
$("random").onclick = () => show(pick(players));
show(pick(players));

// Search: the player's name is the search box
const matchesBox = $("matches");
let matches = [];
let active = 0;

const closeMatches = () => {
	matchesBox.hidden = true;
	matches = [];
};

const renderMatches = () => {
	matchesBox.innerHTML = "";
	for (const [i, p] of matches.entries()) {
		const item = document.createElement("button");
		item.type = "button";
		item.className = `list-group-item list-group-item-action${i === active ? " active" : ""}`;
		item.textContent = p.name;
		const year = document.createElement("span");
		year.className = "year";
		year.textContent = p.year;
		item.append(year);
		// mousedown, so it lands before the input's blur closes the list
		item.onmousedown = (event) => {
			event.preventDefault();
			choose(p);
		};
		matchesBox.append(item);
	}
	matchesBox.hidden = matches.length === 0;
};

const choose = (p) => {
	closeMatches();
	nameInput.blur();
	show(p);
};

nameInput.onfocus = () => {
	nameInput.select();
	fitName();
};
nameInput.oninput = () => {
	const q = plain(nameInput.value.trim());
	active = 0;
	matches =
		q.length === 0
			? []
			: players
					.filter((p) => p.search.includes(q))
					.sort((a, b) => b.search.startsWith(q) - a.search.startsWith(q) || b.score - a.score)
					.slice(0, 12);
	renderMatches();
	fitName();
};
nameInput.onkeydown = (event) => {
	if (event.key === "ArrowDown" || event.key === "ArrowUp") {
		event.preventDefault();
		if (matches.length > 0) {
			active = (active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
			renderMatches();
		}
	} else if (event.key === "Enter") {
		if (matches[active]) {
			choose(matches[active]);
		}
	} else if (event.key === "Escape") {
		nameInput.blur();
	}
};
nameInput.onblur = () => {
	closeMatches();
	nameInput.value = current.name;
	fitName();
};

// Change requests: edit the face like the facesjs editor, add a note, send
const PARTS = [
	{ label: "Head", rows: [["head"]], sliders: [["fatness", "Width", 0, 1, 0.05]], colors: ["body.color", SKINS] },
	{ label: "Hair", rows: [["hair"], ["hairBg", "Back"]], colors: ["hair.color", HAIR_COLORS] },
	{ label: "Eyes", rows: [["eye"]], sliders: [["eye.angle", "Angle", -10, 15, 1]] },
	{ label: "Brows", rows: [["eyebrow"]], sliders: [["eyebrow.angle", "Angle", -15, 20, 1]] },
	{ label: "Nose", rows: [["nose"]], sliders: [["nose.size", "Size", 0.5, 1.25, 0.05]] },
	{ label: "Mouth", rows: [["mouth"]] },
	{ label: "Facial hair", rows: [["facialHair"]], sliders: [["stubble", "Stubble", 0, 0.6, 0.05]] },
	{ label: "Ears", rows: [["ear"]], sliders: [["ear.size", "Size", 0.5, 1.5, 0.05]] },
	{ label: "Lines", rows: [["eyeLine", "Eyes"], ["smileLine", "Smile"], ["miscLine", "Other"]] },
	{ label: "Extras", rows: [["glasses", "Glasses"], ["accessories", "Headwear"]] },
];

const getPath = (face, path) => {
	if (path === "stubble") {
		return Number(face.head.shave?.match(/([\d.]+)\)$/)?.[1] ?? 0);
	}
	return path.split(".").reduce((o, k) => o?.[k], face);
};
const setPath = (face, path, value) => {
	if (path === "stubble") {
		const shave = face.head.shave || "rgba(0,0,0,0)";
		face.head.shave = shave.replace(/[\d.]+\)$/, `${value})`);
		return;
	}
	const keys = path.split(".");
	let o = face;
	for (const k of keys.slice(0, -1)) {
		o = o[k] ??= {};
	}
	o[keys.at(-1)] = value;
};

let partIndex = 0;
let thumbJob = 0;

const startEditing = () => {
	edited = structuredClone(current.face);
	$("note").value = "";
	$("sent").textContent = "";
	renderPart();
	drawViewer();
};

const change = (path, value) => {
	setPath(edited, path, value);
	drawViewer();
	renderPart();
};

const renderParts = () => {
	const list = $("parts");
	list.innerHTML = "";
	for (const [i, part] of PARTS.entries()) {
		const li = document.createElement("li");
		li.className = "nav-item";
		const a = document.createElement("a");
		a.href = "#";
		a.className = `nav-link${i === partIndex ? " active" : ""}`;
		a.textContent = part.label;
		a.onclick = (event) => {
			event.preventDefault();
			partIndex = i;
			renderParts();
			renderPart();
		};
		li.append(a);
		list.append(li);
	}
};

// Thumbnails are drawn a few at a time so the page never locks up
const drawThumbs = (jobs) => {
	const job = ++thumbJob;
	let i = 0;
	const step = () => {
		if (job !== thumbJob) {
			return;
		}
		for (const end = Math.min(i + 8, jobs.length); i < end; i++) {
			const [el, face] = jobs[i];
			el.innerHTML = faceSvg(current, face);
		}
		if (i < jobs.length) {
			requestAnimationFrame(step);
		}
	};
	step();
};

const renderPart = () => {
	const part = PARTS[partIndex];
	const box = $("part");
	box.innerHTML = "";
	const jobs = [];
	for (const [feature, label] of part.rows) {
		if (label) {
			const h = document.createElement("div");
			h.className = "row-label";
			h.textContent = label;
			box.append(h);
		}
		const grid = document.createElement("div");
		grid.className = "options";
		const now = edited[feature]?.id;
		for (const id of options[feature]) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = `option${id === now ? " selected" : ""}`;
			button.title = id;
			button.onclick = () => change(`${feature}.id`, id);
			const face = structuredClone(edited);
			setPath(face, `${feature}.id`, id);
			jobs.push([button, face]);
			grid.append(button);
		}
		box.append(grid);
	}
	for (const [path, label, min, max, stepSize] of part.sliders ?? []) {
		const row = document.createElement("label");
		row.className = "slider";
		row.textContent = label;
		const input = document.createElement("input");
		input.type = "range";
		input.className = "form-range";
		Object.assign(input, { min, max, step: stepSize, value: getPath(edited, path) ?? min });
		input.oninput = () => {
			setPath(edited, path, Number(input.value));
			drawViewer();
		};
		input.onchange = () => renderPart();
		row.append(input);
		box.append(row);
	}
	if (part.colors) {
		const [path, swatches] = part.colors;
		const row = document.createElement("div");
		row.className = "swatches";
		const now = String(getPath(edited, path)).toLowerCase();
		for (const color of swatches) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = `swatch${color.toLowerCase() === now ? " selected" : ""}`;
			button.style.background = color;
			button.title = color;
			button.onclick = () => change(path, color);
			row.append(button);
		}
		const custom = document.createElement("input");
		custom.type = "color";
		custom.className = "form-control form-control-color";
		custom.value = /^#[\da-f]{6}$/i.test(now) ? now : "#000000";
		custom.title = "Other color";
		custom.oninput = () => {
			setPath(edited, path, custom.value);
			drawViewer();
		};
		custom.onchange = () => renderPart();
		row.append(custom);
		box.append(row);
	}
	drawThumbs(jobs);
};

const flatten = (o, prefix = "", out = {}) => {
	for (const [k, v] of Object.entries(o)) {
		if (v && typeof v === "object" && !Array.isArray(v)) {
			flatten(v, `${prefix}${k}.`, out);
		} else {
			out[prefix + k] = v;
		}
	}
	return out;
};
const changes = () => {
	const a = flatten(current.face);
	const b = flatten(edited);
	return Object.keys(b)
		.filter((k) => a[k] !== b[k])
		.map((k) => `${k}: ${a[k]} -> ${b[k]}`);
};

$("request-toggle").hidden = !FORM;
$("request-toggle").onclick = (event) => {
	event.preventDefault();
	const box = $("request");
	box.hidden = !box.hidden;
	if (box.hidden) {
		edited = undefined;
		thumbJob++;
		drawViewer();
	} else {
		renderParts();
		startEditing();
		drawViewer();
	}
};
$("reset").onclick = startEditing;
$("send").onclick = async () => {
	const list = changes();
	const note = $("note").value.trim();
	if (list.length === 0 && !note) {
		$("sent").textContent = "Change the face or add a note first";
		return;
	}
	const body = new URLSearchParams({
		[FORM.player]: `${current.name} (${current.year}) ${current.id}`,
		[FORM.change]: list.join("\n"),
		[FORM.face]: JSON.stringify(edited),
		[FORM.note]: note,
	});
	$("send").disabled = true;
	$("sent").textContent = "Sending...";
	try {
		// Google Forms doesn't allow reading the reply, so a sent request is taken as received
		await fetch(FORM.url, { method: "POST", mode: "no-cors", body });
		$("sent").textContent = "Sent, thanks";
	} catch {
		$("sent").textContent = "Couldn't send, try again";
	}
	$("send").disabled = false;
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
