import { display } from "./faces.js";
import { createEditor, diff } from "./editor.js";

const SITE = new URL(".", location.href).href;

// Change requests are posted to a Google Form
const FORM = {
	url: "https://docs.google.com/forms/d/e/1FAIpQLSd78TKi7-8WDPpdiCzwRtrMmOpcECZh5LCPHbZ9iRK2W3CWbw/formResponse",
	player: "entry.853634109",
	change: "entry.1002594022",
	face: "entry.823317504",
	note: "entry.1810661261",
};

const $ = (id) => document.getElementById(id);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
// Counted in GoatCounter alongside page views, when it has loaded
const countEvent = (path, title) => {
	window.goatcounter?.count?.({ path, title, event: true });
};
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

// Ticker: scrolls by itself, and can be grabbed and flicked either way like
// any scrolling strip. It holds three copies of the players and stays in the
// middle one, so there's always more in both directions.
const COPIES = 3;
const SPEED = 70; // px per second
const tickerPlayers = shuffle(known).slice(0, 40);
const ticker = $("ticker");
const track = $("ticker-track");
for (let copy = 0; copy < COPIES; copy++) {
	for (const p of tickerPlayers) {
		const div = pairEl(p);
		const img = div.querySelector("img");
		img.draggable = false;
		// A photo that won't load takes its whole pair with it, in every copy
		img.onerror = () => {
			for (const el of track.querySelectorAll(`[data-id="${p.id}"]`)) {
				el.remove();
			}
		};
		div.dataset.id = p.id;
		track.append(div);
	}
}

let copyWidth = 0;
let pos = 0;
let lastTouched = -Infinity;
let hovering = false;
let drag;
let dragJustEnded = false;
let glide = 0;

const measureTicker = () => {
	const share = copyWidth > 0 ? pos / copyWidth : 1;
	copyWidth = track.scrollWidth / COPIES;
	pos = share * copyWidth;
	ticker.scrollLeft = pos;
};
new ResizeObserver(measureTicker).observe(track);

// Back into the middle copy, which looks the same, so the jump can't be seen
const recenter = () => {
	if (copyWidth > 0) {
		while (pos < copyWidth * 0.5) {
			pos += copyWidth;
		}
		while (pos > copyWidth * 1.5) {
			pos -= copyWidth;
		}
		ticker.scrollLeft = pos;
	}
};

// Any scroll that isn't the ticker's own is the user's
ticker.addEventListener(
	"scroll",
	() => {
		if (Math.abs(ticker.scrollLeft - pos) > 2) {
			pos = ticker.scrollLeft;
			lastTouched = performance.now();
		}
	},
	{ passive: true },
);
ticker.addEventListener("touchstart", () => {
	lastTouched = Infinity;
}, { passive: true });
ticker.addEventListener("touchend", () => {
	lastTouched = performance.now();
}, { passive: true });
// Only a real mouse pauses it by hovering; phones fake hovers on every tap
ticker.addEventListener("pointerenter", (event) => {
	hovering = event.pointerType === "mouse";
});
ticker.addEventListener("pointerleave", () => {
	hovering = false;
});

// With a mouse, drag it and let go to send it gliding
ticker.addEventListener("pointerdown", (event) => {
	if (event.pointerType !== "mouse" || event.button !== 0) {
		return;
	}
	drag = { x: event.clientX, start: pos, moved: false, v: 0, t: event.timeStamp, lastX: event.clientX };
	glide = 0;
});
window.addEventListener("pointermove", (event) => {
	if (!drag) {
		return;
	}
	const dx = event.clientX - drag.x;
	if (Math.abs(dx) > 5 && !drag.moved) {
		drag.moved = true;
		ticker.classList.add("dragging");
	}
	if (drag.moved) {
		const dt = Math.max(event.timeStamp - drag.t, 1);
		drag.v = (event.clientX - drag.lastX) / dt;
		drag.t = event.timeStamp;
		drag.lastX = event.clientX;
		pos = drag.start - dx;
		ticker.scrollLeft = pos;
		lastTouched = performance.now();
	}
});
ticker.addEventListener(
	"click",
	(event) => {
		if (dragJustEnded) {
			event.stopPropagation();
		}
	},
	{ capture: true },
);
window.addEventListener("pointerup", () => {
	if (!drag) {
		return;
	}
	if (drag.moved) {
		glide = -drag.v;
		// The click that ends a drag, if the browser sends one, shouldn't open a player
		dragJustEnded = true;
		setTimeout(() => {
			dragJustEnded = false;
		}, 0);
	}
	ticker.classList.remove("dragging");
	drag = undefined;
});

let lastFrame = performance.now();
const tick = (now) => {
	const ms = Math.min(now - lastFrame, 100);
	lastFrame = now;
	if (glide !== 0) {
		pos += glide * ms;
		ticker.scrollLeft = pos;
		glide *= 0.95 ** (ms / 16);
		lastTouched = now;
		if (Math.abs(glide) < 0.02) {
			glide = 0;
		}
	} else if (!drag && !hovering && now - lastTouched > 1500 && copyWidth > 0) {
		pos += (SPEED * ms) / 1000;
		recenter();
	}
	requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

// Viewer
let current;
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
	const changed = editor.face !== undefined && changes().length > 0;
	viewerFace.innerHTML = faceSvg(current);
	$("viewer-arrow").hidden = !changed;
	$("viewer-new").hidden = !changed;
	$("viewer-new").innerHTML = changed ? faceSvg(current, editor.face) : "";
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

// Change requests: edit the face, add a note, send
const editor = createEditor({
	tabs: $("parts"),
	panel: $("part"),
	options,
	draw: (face) => faceSvg(current, face),
	onChange: () => {
		$("sent").textContent = "";
		drawViewer();
		updateSend();
	},
});

const changes = () => diff(current.face, editor.face);

// Send only once there's something to send
const updateSend = () => {
	$("send").disabled = changes().length === 0 && $("note").value.trim() === "";
};

const startEditing = () => {
	editor.start(current.face);
	$("note").value = "";
	$("sent").textContent = "";
	drawViewer();
	updateSend();
};

const openEditor = (open) => {
	$("request").hidden = !open;
	$("request-toggle").setAttribute("aria-expanded", String(open));
	if (open) {
		startEditing();
		$("request").scrollIntoView({ behavior: "smooth", block: "nearest" });
	} else {
		editor.stop();
		drawViewer();
	}
};

show(pick(players));

$("request-row").hidden = !FORM;
$("request-toggle").onclick = () => openEditor($("request").hidden);
$("request-close").onclick = () => openEditor(false);
$("reset").onclick = startEditing;
$("note").oninput = updateSend;
$("send").onclick = async () => {
	const list = changes();
	const note = $("note").value.trim();
	if (list.length === 0 && !note) {
		return;
	}
	const body = new URLSearchParams({
		[FORM.player]: `${current.name} (${current.year}) ${current.id}`,
		[FORM.change]: list.join("\n"),
		[FORM.face]: JSON.stringify(editor.face),
		[FORM.note]: note,
	});
	$("send").disabled = true;
	$("sent").className = "text-body-secondary";
	$("sent").textContent = "Sending...";
	try {
		// Google Forms doesn't allow reading the reply, so a sent request is taken as received
		await fetch(FORM.url, { method: "POST", mode: "no-cors", body });
		startEditing();
		$("sent").className = "text-success";
		$("sent").textContent = "Sent. Thanks!";
		countEvent("change-request", "Change request sent");
	} catch {
		$("sent").className = "text-danger";
		$("sent").textContent = "Couldn't send. Try again?";
		updateSend();
	}
};

// The note beside the request button
$("info-text").textContent = `${players.length.toLocaleString()} faces is a ton to get perfectly right, so please send suggested edits here, no matter how nitpicky. I'd love to get as many of these faces as accurate as possible. Thanks!`;
const showInfo = (show) => {
	$("info-pop").hidden = !show;
	$("info").setAttribute("aria-expanded", String(show));
};
$("info").onclick = (event) => {
	event.stopPropagation();
	showInfo($("info-pop").hidden);
};
document.addEventListener("click", (event) => {
	if (!$("info-pop").hidden && !$("info-pop").contains(event.target)) {
		showInfo(false);
	}
});
document.addEventListener("keydown", (event) => {
	if (event.key === "Escape") {
		showInfo(false);
	}
});

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

// Real team names, logos and colors, from u/alexnoob's team file, plus each
// team's real jersey style from this site's jerseys.json. The team file is the
// same JSON that goes in BBGM's Global Settings > Team Info, but this only
// applies it to the open league: its teams, every past season, and the
// relocations still to come. Global Settings are left alone.
const TEAM_FILE = "https://raw.githubusercontent.com/alexnoob/BasketBall-GM-Rosters/master/team%20data.json";
const teamCode = `
// Real team names and logos, from u/alexnoob: https://github.com/alexnoob/BasketBall-GM-Rosters
const teamInfo = await (await fetch("${TEAM_FILE}")).json();
// With each team's real jersey style, by era, from BBGM Real Cartoon Faces
for (const [srID, { jersey, seasons }] of Object.entries(await (await fetch("${SITE}jerseys.json")).json())) {
	const info = teamInfo[srID];
	if (info) {
		info.jersey = jersey;
		for (const [season, style] of Object.entries(seasons ?? {})) {
			info.seasons = { ...info.seasons, [season]: { ...info.seasons?.[season], jersey: style } };
		}
	}
}
const KEYS = ["abbrev", "region", "name", "pop", "colors", "jersey", "imgURL", "imgURLSmall"];
const applyInfo = (t, season, srID) => {
	const root = teamInfo[srID];
	if (!root) {
		return false;
	}
	const info = { ...root };
	const seasons = Object.keys(root.seasons ?? {}).map(Number).filter((s) => s <= season).sort((a, b) => a - b);
	for (const s of seasons) {
		Object.assign(info, root.seasons[s]);
	}
	let changed = false;
	for (const key of KEYS) {
		if (info[key] && JSON.stringify(info[key]) !== JSON.stringify(t[key])) {
			t[key] = info[key];
			changed = true;
			if (key === "imgURL" && info.imgURLSmall === undefined) {
				delete t.imgURLSmall;
			}
		}
	}
	return changed;
};
const teams = await bbgm.idb.cache.teams.getAll();
const srIDs = new Map(teams.map((t) => [t.tid, t.srID]));
let teamCount = 0;
for (const t of teams) {
	if (applyInfo(t, bbgm.g.get("season"), t.srID)) {
		await bbgm.idb.cache.teams.put(t);
		teamCount += 1;
	}
}
const recent = await bbgm.idb.cache.teamSeasons.getAll();
for (const ts of recent) {
	if (applyInfo(ts, ts.season, ts.srID ?? srIDs.get(ts.tid))) {
		await bbgm.idb.cache.teamSeasons.put(ts);
	}
}
const inCache = new Set(recent.map((ts) => ts.rid));
const older = (await bbgm.idb.league.getAll("teamSeasons")).filter((ts) => !inCache.has(ts.rid));
const tx = bbgm.idb.league.transaction("teamSeasons", "readwrite");
for (const ts of older) {
	if (applyInfo(ts, ts.season, ts.srID ?? srIDs.get(ts.tid))) {
		tx.store.put(ts);
	}
}
await tx.done;
await bbgm.league.setGameAttributes({
	teamInfoCache: teams.map((t) => ({
		abbrev: t.abbrev,
		disabled: t.disabled,
		imgURL: t.imgURL,
		imgURLSmall: t.imgURLSmall,
		name: t.name,
		region: t.region,
	})),
});
await bbgm.league.updateMeta();
// BBGM schedules a made-up expansion for real leagues (teams with srIDs like
// "_SET"), and a realignment to fit it in. Real teams means none of that, so
// every team event from that season on goes.
const soon = await bbgm.idb.cache.scheduledEvents.getAll();
const soonIds = new Set(soon.map((e) => e.id));
const later = (await bbgm.idb.league.getAll("scheduledEvents")).filter((e) => !soonIds.has(e.id));
const madeUp = [...soon, ...later]
	.filter((e) => e.type === "expansionDraft" && e.info.teams.some((t) => t.srID?.startsWith("_")))
	.map((e) => e.season);
const TEAM_EVENTS = ["expansionDraft", "confsDivs", "teamInfo", "contraction"];
const isMadeUp = (e) => madeUp.length > 0 && e.season >= Math.min(...madeUp) && TEAM_EVENTS.includes(e.type);
let removed = 0;
for (const e of soon.filter(isMadeUp)) {
	await bbgm.idb.cache.scheduledEvents.delete(e.id);
	removed += 1;
}
// Relocations and expansion teams still to come in this league get the real info too
const fixEvent = (e) => {
	if (e.type === "teamInfo") {
		return applyInfo(e.info, e.season, e.info.srID);
	}
	if (e.type === "expansionDraft") {
		return e.info.teams.map((t) => applyInfo(t, e.season, t.srID)).some(Boolean);
	}
	return false;
};
for (const e of soon.filter((e) => !isMadeUp(e))) {
	if (fixEvent(e)) {
		await bbgm.idb.cache.scheduledEvents.put(e);
	}
}
const tx2 = bbgm.idb.league.transaction("scheduledEvents", "readwrite");
for (const e of later) {
	if (isMadeUp(e)) {
		tx2.store.delete(e.id);
		removed += 1;
	} else if (fixEvent(e)) {
		tx2.store.put(e);
	}
}
await tx2.done;
await bbgm.toUI("realtimeUpdate", [["team"]]);
console.log(\`Updated \${teamCount} teams\${removed ? \`, removed \${removed} made-up expansion events\` : ""}\`);`;

// Turning God Mode off leaves the league marked as having used it, which is
// what keeps achievements off; clearing that mark too lets them count again
const godCode = (achievements) => `
await bbgm.league.setGameAttributes({ godMode: false${achievements ? ", godModeInPast: false" : ""} });
console.log("God Mode is off${achievements ? " and achievements are allowed" : ""}");`;

const buildCode = () => `// BBGM Real Cartoon Faces
const response = await fetch("${SITE}players.json");
const faces = new Map();
for (const [id, , , , face] of await response.json()) {
	faces.set(id, face);
}
${applyCode}${$("teams").checked ? teamCode : ""}${$("god-off").checked ? godCode($("achievements").checked) : ""}`;

// The options start on, and each device remembers what its user turned off
const OPTIONS = ["teams", "god-off", "achievements"];
const remember = () => {
	try {
		for (const id of OPTIONS) {
			localStorage.setItem(`option-${id}`, $(id).checked ? "1" : "0");
		}
	} catch {}
};
for (const id of OPTIONS) {
	try {
		if (localStorage.getItem(`option-${id}`) === "0") {
			$(id).checked = false;
		}
	} catch {}
}
// Allowing achievements means God Mode has to go off too
if ($("achievements").checked) {
	$("god-off").checked = true;
}
$("teams").onchange = remember;
$("achievements").onchange = () => {
	if ($("achievements").checked) {
		$("god-off").checked = true;
	}
	remember();
};
$("god-off").onchange = () => {
	if (!$("god-off").checked) {
		$("achievements").checked = false;
	}
	remember();
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

$("copy").onclick = () => {
	copyText(buildCode(), $("copy"));
	countEvent("copy-faces", "Copy faces");
};
