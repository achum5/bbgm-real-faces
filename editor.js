// The face editor, shared by the main page (change requests) and the review
// page: tabs of features, a grid of options zoomed in on each feature, sliders
// and color swatches.

export const SKINS = ["#f2d0b8", "#ecc8b3", "#e3bda5", "#ddb7a0", "#d9a886", "#cc9a78", "#c49070", "#bb876f", "#b07a5f", "#a67358", "#9b6a50", "#8d5d45", "#80523e", "#7a4a36", "#6e4030", "#673a2a", "#5a3626", "#4a2c20"];
export const HAIR_COLORS = ["#0f0902", "#1c1008", "#272421", "#3D2314", "#5A3825", "#7a5230", "#9a6a40", "#b8925a", "#c8a878", "#d8c8a0", "#b0602e", "#8c8c8c", "#d9d9d9"];

// Each option tile is zoomed in on its feature, as a box in the face's own
// 400x600 drawing: [x, y, width, height].
const HEAD = [-10, 90, 420, 420];
const CROPS = {
	head: HEAD,
	hair: [10, 0, 380, 380],
	hairBg: [-50, 40, 500, 560],
	eye: [90, 250, 220, 110],
	eyebrow: [90, 225, 220, 110],
	nose: [135, 325, 130, 100],
	mouth: [130, 395, 140, 90],
	facialHair: [60, 280, 280, 280],
	ear: [30, 230, 340, 170],
	eyeLine: [90, 225, 220, 140],
	smileLine: [110, 330, 180, 135],
	miscLine: HEAD,
	body: [-60, 360, 520, 240],
	glasses: [40, 200, 320, 260],
	accessories: [10, 30, 380, 260],
};

const PARTS = [
	{ label: "Head", rows: [["head", "Shape"]], sliders: [["fatness", "Width", 0, 1, 0.05]], colors: ["body.color", SKINS, "Skin"] },
	{ label: "Body", rows: [["body", "Build"]], sliders: [["body.size", "Size", 0.8, 1.2, 0.01]] },
	{ label: "Hair", rows: [["hair", "Style"], ["hairBg", "Behind the head"]], toggles: [["hair.flip", "Mirror"]], colors: ["hair.color", HAIR_COLORS, "Color"] },
	{ label: "Eyes", rows: [["eye"]], sliders: [["eye.angle", "Tilt", -10, 15, 1]] },
	{ label: "Brows", rows: [["eyebrow"]], sliders: [["eyebrow.angle", "Tilt", -15, 20, 1]] },
	{ label: "Nose", rows: [["nose"]], sliders: [["nose.size", "Size", 0.5, 1.5, 0.05]], toggles: [["nose.flip", "Mirror"]] },
	{ label: "Mouth", rows: [["mouth"]], toggles: [["mouth.flip", "Mirror"]] },
	{ label: "Facial hair", rows: [["facialHair"]], sliders: [["stubble", "Stubble", 0, 0.6, 0.05]] },
	{ label: "Ears", rows: [["ear"]], sliders: [["ear.size", "Size", 0.5, 1.5, 0.05]] },
	{ label: "Lines", rows: [["eyeLine", "Around the eyes"], ["smileLine", "Smile lines"], ["miscLine", "Other"]], sliders: [["smileLine.size", "Smile lines", 0.3, 2, 0.05]] },
	{ label: "Extras", rows: [["glasses", "Glasses and face mask"], ["accessories", "Headwear"]] },
];

export const getPath = (face, path) => {
	if (path === "stubble") {
		return Number(face.head.shave?.match(/([\d.]+)\)$/)?.[1] ?? 0);
	}
	return path.split(".").reduce((o, k) => o?.[k], face);
};
export const setPath = (face, path, value) => {
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

export const flatten = (o, prefix = "", out = {}) => {
	for (const [k, v] of Object.entries(o)) {
		if (v && typeof v === "object" && !Array.isArray(v)) {
			flatten(v, `${prefix}${k}.`, out);
		} else {
			out[prefix + k] = v;
		}
	}
	return out;
};

// "path: old -> new" for every value that differs
export const diff = (a, b) => {
	const x = flatten(a);
	const y = flatten(b);
	return Object.keys(y)
		.filter((k) => x[k] !== y[k])
		.map((k) => `${k}: ${x[k]} -> ${y[k]}`);
};

// tabs and panel are empty elements to fill. draw(face) returns the face's
// SVG. onChange runs after every edit.
export const createEditor = ({ tabs, panel, options, draw, onChange }) => {
	let base;
	let face;
	let partIndex = 0;
	let thumbJob = 0;

	const edit = (path, value) => {
		setPath(face, path, value);
		renderPart();
		onChange();
	};

	const renderTabs = () => {
		tabs.innerHTML = "";
		for (const [i, part] of PARTS.entries()) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = i === partIndex ? "active" : "";
			button.textContent = part.label;
			button.onclick = () => {
				partIndex = i;
				renderTabs();
				renderPart();
			};
			tabs.append(button);
		}
	};

	const cropped = (f, [x, y, w, h]) =>
		draw(f)
			.replace(/viewBox="[^"]*"/, `viewBox="${x} ${y} ${w} ${h}"`)
			.replace(/preserveAspectRatio="[^"]*"/, 'preserveAspectRatio="xMidYMid meet"');

	// Thumbnails are drawn a few at a time so the page never locks up
	const drawThumbs = (jobs) => {
		const job = ++thumbJob;
		let i = 0;
		const step = () => {
			if (job !== thumbJob) {
				return;
			}
			for (const end = Math.min(i + 8, jobs.length); i < end; i++) {
				const [el, f, crop] = jobs[i];
				el.innerHTML = cropped(f, crop);
			}
			if (i < jobs.length) {
				requestAnimationFrame(step);
			}
		};
		step();
	};

	const label = (text) => {
		const h = document.createElement("div");
		h.className = "row-label";
		h.textContent = text;
		return h;
	};

	const renderPart = () => {
		const part = PARTS[partIndex];
		panel.innerHTML = "";
		const jobs = [];
		for (const [feature, text] of part.rows) {
			if (text) {
				panel.append(label(text));
			}
			const grid = document.createElement("div");
			grid.className = "options";
			const now = face[feature]?.id;
			const was = base[feature]?.id;
			const crop = CROPS[feature];
			for (const id of options[feature]) {
				const button = document.createElement("button");
				button.type = "button";
				// The player's own option keeps a dot, so it's easy to go back to
				button.className = `option${id === now ? " selected" : ""}${id === was ? " original" : ""}`;
				button.style.aspectRatio = `${crop[2]} / ${crop[3]}`;
				button.title = id === was ? `${id} (current)` : id;
				button.onclick = () => edit(`${feature}.id`, id);
				const f = structuredClone(face);
				setPath(f, `${feature}.id`, id);
				jobs.push([button, f, crop]);
				grid.append(button);
			}
			panel.append(grid);
		}
		for (const [path, text, min, max, stepSize] of part.sliders ?? []) {
			const row = document.createElement("label");
			row.className = "slider";
			const name = document.createElement("span");
			name.textContent = text;
			const input = document.createElement("input");
			input.type = "range";
			input.className = "form-range";
			Object.assign(input, { min, max, step: stepSize, value: getPath(face, path) ?? min });
			input.oninput = () => {
				setPath(face, path, Number(input.value));
				onChange();
			};
			input.onchange = () => renderPart();
			row.append(name, input);
			panel.append(row);
		}
		for (const [path, text] of part.toggles ?? []) {
			const row = document.createElement("label");
			row.className = "form-check toggle";
			const input = document.createElement("input");
			input.type = "checkbox";
			input.className = "form-check-input";
			input.checked = Boolean(getPath(face, path));
			input.onchange = () => edit(path, input.checked);
			const name = document.createElement("span");
			name.className = "form-check-label";
			name.textContent = text;
			row.append(input, name);
			panel.append(row);
		}
		if (part.colors) {
			const [path, swatches, text] = part.colors;
			panel.append(label(text));
			const row = document.createElement("div");
			row.className = "swatches";
			const now = String(getPath(face, path)).toLowerCase();
			for (const color of swatches) {
				const button = document.createElement("button");
				button.type = "button";
				button.className = `swatch${color.toLowerCase() === now ? " selected" : ""}`;
				button.style.background = color;
				button.title = color;
				button.onclick = () => edit(path, color);
				row.append(button);
			}
			const custom = document.createElement("input");
			custom.type = "color";
			custom.className = "form-control form-control-color";
			custom.value = /^#[\da-f]{6}$/i.test(now) ? now : "#000000";
			custom.title = "Pick any color";
			custom.oninput = () => {
				setPath(face, path, custom.value);
				onChange();
			};
			custom.onchange = () => renderPart();
			row.append(custom);
			panel.append(row);
		}
		drawThumbs(jobs);
	};

	return {
		// Edit a copy of start (by default the original), marking original's options
		start(original, start = original) {
			base = original;
			face = structuredClone(start);
			renderTabs();
			renderPart();
		},
		stop() {
			thumbJob++;
			face = undefined;
		},
		get face() {
			return face;
		},
	};
};
