// Review page for change requests. Reads the requests from the Google Sheet
// the form writes to, and publishes accepted faces straight to players.json in
// the repo through the GitHub API. Both links live only in this browser.
import { display } from "./faces.js";
import { createEditor, diff, getPath, setPath } from "./editor.js";

const REPO = "achum5/bbgm-real-faces";
const BRANCH = "main";

const $ = (id) => document.getElementById(id);
const store = {
	get: (key) => {
		try {
			return localStorage.getItem(key) ?? "";
		} catch {
			return "";
		}
	},
	set: (key, value) => {
		try {
			localStorage.setItem(key, value);
		} catch {}
	},
};

// Every value a face can hold. Requests come from anyone, and an accepted
// face ends up in people's leagues, so nothing outside this goes through.
const [allowed, options] = await Promise.all(["allowed.json", "options.json"].map(async (f) => (await fetch(f)).json()));
const HEX = /^#[\da-f]{6}$/i;
const SHAVE = /^rgba\(\d{1,3},\d{1,3},\d{1,3},(0|1|0?\.\d{1,4})\)$/;
const num = (lo, hi) => (v) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const id = (feature) => (v) => allowed[feature].includes(v);
const LEAVES = {
	fatness: num(0, 1),
	"hairBg.id": id("hairBg"),
	"body.id": id("body"),
	"body.color": (v) => HEX.test(v),
	"body.size": num(0.5, 1.5),
	"ear.id": id("ear"),
	"ear.size": num(0.3, 2),
	"head.id": id("head"),
	"head.shave": (v) => SHAVE.test(v),
	"eyeLine.id": id("eyeLine"),
	"smileLine.id": id("smileLine"),
	"smileLine.size": num(0.3, 2),
	"miscLine.id": id("miscLine"),
	"facialHair.id": id("facialHair"),
	"eye.id": id("eye"),
	"eye.angle": num(-30, 30),
	"eyebrow.id": id("eyebrow"),
	"eyebrow.angle": num(-30, 30),
	"hair.id": id("hair"),
	"hair.color": (v) => v === "" || HEX.test(v),
	"hair.flip": (v) => typeof v === "boolean",
	"mouth.id": id("mouth"),
	"mouth.flip": (v) => typeof v === "boolean",
	"nose.id": id("nose"),
	"nose.flip": (v) => typeof v === "boolean",
	"nose.size": num(0.3, 2),
	"glasses.id": id("glasses"),
	"accessories.id": id("accessories"),
};
// Paths a face may leave out (some faces never had these set)
const OPTIONAL = new Set(["smileLine.size"]);

const valid = (path, value) => Object.hasOwn(LEAVES, path) && LEAVES[path](value);

// A clean copy holding only known, valid values, or undefined
const clean = (face) => {
	if (!face || typeof face !== "object") {
		return;
	}
	const out = {};
	for (const path of Object.keys(LEAVES)) {
		const value = getPath(face, path);
		if (value === undefined && OPTIONAL.has(path)) {
			continue;
		}
		if (!valid(path, value)) {
			return;
		}
		setPath(out, path, value);
	}
	return out;
};

// Google Sheets CSV: quoted fields can hold commas, newlines and "" quotes
const parseCsv = (text) => {
	const rows = [];
	let row = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') {
				quoted = false;
			} else {
				field += c;
			}
		} else if (c === '"') {
			quoted = true;
		} else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && text[i + 1] === "\n") {
				i++;
			}
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else {
			field += c;
		}
	}
	if (field !== "" || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows;
};

const api = async (path, { method = "GET", body, raw } = {}) => {
	const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
		method,
		cache: "no-store",
		headers: {
			Authorization: `Bearer ${store.get("review-token")}`,
			Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
			...(body ? { "Content-Type": "application/json" } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) {
		const error = new Error(`GitHub said ${res.status}`);
		error.status = res.status;
		throw error;
	}
	return raw ? res.text() : res.json();
};

const readFile = async (path, ref) => {
	try {
		return await api(`/contents/${path}?ref=${ref}`, { raw: true });
	} catch (error) {
		if (error.status === 404) {
			return;
		}
		throw error;
	}
};

// facesjs measures each feature with getBBox, so faces are drawn in the page
const studio = document.createElement("div");
studio.style.cssText = "position:absolute;left:-10000px;top:0;width:400px;height:600px";
document.body.append(studio);
const faceSvg = (row, face) => {
	studio.innerHTML = "";
	display(studio, { ...structuredClone(face), jersey: { id: row[6][0] }, teamColors: row[6][1] });
	return studio.innerHTML;
};

let rows = [];
let byId = new Map();
let reviewed = {};
let requests = [];
// Decisions not yet published: key -> { decision, srID, set: { path: value } }
let pending = {};
try {
	pending = JSON.parse(store.get("review-pending") || "{}");
} catch {}
const savePending = () => store.set("review-pending", JSON.stringify(pending));

// Apply a set of path values to a face, in a copy
const applySet = (face, set) => {
	const out = structuredClone(face);
	for (const [path, value] of Object.entries(set)) {
		setPath(out, path, value);
	}
	return out;
};

const loadPlayers = async () => {
	if (store.get("review-token")) {
		const ref = (await api(`/git/ref/heads/${BRANCH}`)).object.sha;
		rows = JSON.parse(await readFile("players.json", ref));
		reviewed = JSON.parse((await readFile("reviewed.json", ref)) ?? "{}");
	} else {
		rows = await (await fetch("players.json", { cache: "no-store" })).json();
	}
	byId = new Map(rows.map((r) => [r[0], r]));
};

const loadRequests = async () => {
	const res = await fetch(store.get("review-csv"), { cache: "no-store" });
	if (!res.ok) {
		throw new Error(`The sheet said ${res.status}`);
	}
	const table = parseCsv(await res.text());
	const head = table[0].map((h) => h.trim().toLowerCase());
	const col = (name) => head.indexOf(name);
	const [ti, pi, ci, fi, ni] = ["timestamp", "player", "change", "face", "note"].map(col);
	requests = [];
	for (const r of table.slice(1)) {
		const player = r[pi] ?? "";
		const srID = player.trim().split(/\s+/).at(-1);
		const row = byId.get(srID);
		if (!row) {
			continue;
		}
		let face;
		try {
			face = clean(JSON.parse(r[fi] || "null"));
		} catch {}
		// The paths the person changed, which are the only ones applied, so
		// other fixes made since they sent it stay
		const paths = [...new Set((r[ci] ?? "").split("\n").map((l) => l.split(":")[0].trim()).filter(Boolean))];
		const bad = !face || paths.some((p) => !Object.hasOwn(LEAVES, p));
		const set = {};
		if (!bad) {
			for (const p of paths) {
				set[p] = getPath(face, p);
			}
		}
		requests.push({ key: `${r[ti]}|${srID}`, when: r[ti] ?? "", srID, row, set, note: (r[ni] ?? "").trim(), bad });
	}
	requests.reverse();
};

const decisionOf = (req) => pending[req.key]?.decision ?? reviewed[req.key]?.d;

// The editor, moved into whichever card is being edited
let editing;
const editor = createEditor({
	tabs: $("parts"),
	panel: $("part"),
	options,
	draw: (face) => faceSvg(editing.row, face),
	onChange: () => {
		editing.redraw(editor.face);
		$("edit-accept").disabled = diff(editing.row[4], editor.face).length === 0;
	},
});

const stopEditing = () => {
	if (editing) {
		editor.stop();
		$("edit-box").hidden = true;
		document.body.append($("edit-box"));
		editing.redraw();
		editing = undefined;
	}
};

const decide = (req, decision, set = req.set) => {
	pending[req.key] = { decision, srID: req.srID, set };
	savePending();
	render();
};

const card = (req) => {
	const div = document.createElement("div");
	div.className = "review-card";
	const current = req.row[4];
	const proposed = applySet(current, req.set);
	const lines = diff(current, proposed);

	const head = document.createElement("div");
	const name = document.createElement("b");
	name.textContent = req.row[1];
	const when = document.createElement("span");
	when.className = "text-body-secondary";
	when.textContent = ` ${req.row[2]} · ${req.when}`;
	head.append(name, when);

	const viewer = document.createElement("div");
	viewer.className = "viewer";
	if (req.row[3]) {
		const img = document.createElement("img");
		img.alt = "";
		img.referrerPolicy = "no-referrer";
		img.src = req.row[3];
		img.onerror = () => img.remove();
		viewer.append(img);
	}
	const now = document.createElement("div");
	now.className = "face";
	now.innerHTML = faceSvg(req.row, current);
	const arrow = document.createElement("span");
	arrow.className = "arrow";
	arrow.textContent = "→";
	const next = document.createElement("div");
	next.className = "face";
	viewer.append(now, arrow, next);
	const redraw = (face = proposed) => {
		const same = diff(current, face).length === 0;
		arrow.hidden = same;
		next.hidden = same;
		next.innerHTML = same ? "" : faceSvg(req.row, face);
	};
	redraw();

	const list = document.createElement("ul");
	list.className = "changes";
	for (const line of lines) {
		const li = document.createElement("li");
		li.textContent = line;
		list.append(li);
	}
	if (req.bad) {
		const li = document.createElement("li");
		li.className = "text-danger";
		li.textContent = "This request has values no face can have, so it can't be accepted";
		list.append(li);
	} else if (Object.keys(req.set).length > 0 && lines.length === 0) {
		const li = document.createElement("li");
		li.textContent = "Already matches";
		list.append(li);
	}

	const note = document.createElement("div");
	note.className = "note";
	note.textContent = req.note;
	note.hidden = !req.note;

	const actions = document.createElement("div");
	actions.className = "d-flex align-items-center gap-2 mt-2";
	const button = (text, cls, onclick) => {
		const b = document.createElement("button");
		b.type = "button";
		b.className = `btn btn-sm ${cls}`;
		b.textContent = text;
		b.onclick = onclick;
		actions.append(b);
		return b;
	};
	const decision = decisionOf(req);
	if (decision) {
		const status = document.createElement("span");
		status.className = decision === "accepted" ? "text-success" : "text-body-secondary";
		status.textContent = `${decision === "accepted" ? "Accepted" : "Declined"}${pending[req.key] ? " (not published)" : ""}`;
		actions.append(status);
		if (pending[req.key]) {
			button("Undo", "btn-light border", () => {
				delete pending[req.key];
				savePending();
				render();
			});
		}
	} else {
		const accept = button("Accept", "btn-primary", () => decide(req, "accepted"));
		accept.disabled = req.bad || lines.length === 0;
		button("Edit", "btn-light border", () => {
			stopEditing();
			editing = { req, row: req.row, redraw };
			div.append($("edit-box"));
			$("edit-box").hidden = false;
			editor.start(current, req.bad ? current : proposed);
			$("edit-accept").disabled = diff(current, editor.face).length === 0;
		});
		button("Decline", "btn-light border", () => decide(req, "declined", {}));
	}

	div.append(head, viewer, list, note, actions);
	return div;
};

$("edit-accept").onclick = () => {
	const { req, row } = editing;
	const face = clean(editor.face);
	if (!face) {
		return;
	}
	// Only what differs from the face as it is now
	const set = {};
	for (const line of diff(row[4], face)) {
		const path = line.split(":")[0];
		set[path] = getPath(face, path);
	}
	stopEditing();
	decide(req, "accepted", set);
};
$("edit-cancel").onclick = stopEditing;

const render = () => {
	stopEditing();
	const showAll = $("show-reviewed").checked;
	const open = requests.filter((r) => !decisionOf(r));
	const shown = showAll ? requests : requests.filter((r) => !reviewed[r.key]);
	$("title").textContent = `Suggestions (${open.length})`;
	$("list").innerHTML = "";
	for (const req of shown) {
		$("list").append(card(req));
	}
	if (shown.length === 0) {
		$("status").textContent = "Nothing to review";
	} else {
		$("status").textContent = "";
	}
	const count = Object.keys(pending).length;
	$("publish-bar").hidden = count === 0;
	$("publish").textContent = `Publish ${count}`;
};
$("show-reviewed").onchange = render;

$("publish").onclick = async () => {
	$("publish").disabled = true;
	$("publish-status").textContent = "Publishing...";
	try {
		// Built on the newest players.json, so nothing published meanwhile is lost
		for (let attempt = 0; ; attempt++) {
			const head = (await api(`/git/ref/heads/${BRANCH}`)).object.sha;
			const tree = (await api(`/git/commits/${head}`)).tree.sha;
			const latest = JSON.parse(await readFile("players.json", head));
			const done = JSON.parse((await readFile("reviewed.json", head)) ?? "{}");
			const index = new Map(latest.map((r) => [r[0], r]));
			let accepted = 0;
			let declined = 0;
			for (const [key, p] of Object.entries(pending)) {
				if (p.decision === "accepted") {
					const row = index.get(p.srID);
					const face = row && clean(applySet(row[4], p.set));
					if (!face || !Object.entries(p.set).every(([path, v]) => valid(path, v))) {
						throw new Error(`Couldn't apply the change for ${p.srID}`);
					}
					row[4] = face;
					accepted++;
				} else {
					declined++;
				}
				done[key] = { d: p.decision, t: new Date().toISOString().slice(0, 10) };
			}
			const blob = async (content) => (await api("/git/blobs", { method: "POST", body: { content, encoding: "utf-8" } })).sha;
			const files = [["reviewed.json", `${JSON.stringify(done, null, "\t")}\n`]];
			if (accepted > 0) {
				files.push(["players.json", JSON.stringify(latest)]);
			}
			const entries = [];
			for (const [path, content] of files) {
				entries.push({ path, mode: "100644", type: "blob", sha: await blob(content) });
			}
			const newTree = (await api("/git/trees", { method: "POST", body: { base_tree: tree, tree: entries } })).sha;
			const parts = [accepted && `${accepted} accepted`, declined && `${declined} declined`].filter(Boolean).join(", ");
			const commit = (await api("/git/commits", { method: "POST", body: { message: `Suggestions: ${parts}`, tree: newTree, parents: [head] } })).sha;
			try {
				await api(`/git/refs/heads/${BRANCH}`, { method: "PATCH", body: { sha: commit } });
				break;
			} catch (error) {
				// Someone else published first: start over on top of theirs
				if (error.status !== 422 || attempt >= 2) {
					throw error;
				}
			}
		}
		pending = {};
		savePending();
		await loadPlayers();
		await loadRequests();
		render();
		$("publish-status").className = "text-success";
		$("publish-status").textContent = "Published. The site updates in about a minute.";
		$("publish-bar").hidden = false;
	} catch (error) {
		$("publish-status").className = "text-danger";
		$("publish-status").textContent = `Couldn't publish: ${error.message}`;
	}
	$("publish").disabled = false;
};

// Settings
const showSettings = (show) => {
	$("settings").hidden = !show;
	$("csv").value = store.get("review-csv");
	$("token").value = store.get("review-token");
};
$("settings-toggle").onclick = (event) => {
	event.preventDefault();
	showSettings($("settings").hidden);
};
$("settings").onsubmit = (event) => {
	event.preventDefault();
	store.set("review-csv", $("csv").value.trim());
	store.set("review-token", $("token").value.trim());
	location.reload();
};

const start = async () => {
	if (!store.get("review-csv") || !store.get("review-token")) {
		showSettings(true);
		$("status").textContent = "Add the two links to start";
		return;
	}
	$("status").textContent = "Loading...";
	try {
		await loadPlayers();
		await loadRequests();
		render();
	} catch (error) {
		$("status").className = "text-danger";
		$("status").textContent = `Couldn't load: ${error.message}`;
	}
};
start();
