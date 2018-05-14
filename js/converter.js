"use strict";

const JSON_URL = "data/bestiary/index.json";

window.onload = loadSources;

function moveon (cur) {
	return (!cur.toUpperCase().indexOf("ACTIONS") || !cur.toUpperCase().indexOf("LEGENDARY ACTIONS") || !cur.toUpperCase().indexOf("REACTIONS"))
}

function tryConvertNumber (strNumber) {
	try {
		return Number(strNumber)
	} catch (e) {
		return strNumber;
	}
}

function tryParseType (strType) {
	try {
		const m = /^(.*?) (\(.*?\))\s*$/.exec(strType);
		if (m) {
			return {type: m[1].toLowerCase(), tags: m[2].split(",").map(s => s.replace(/\(/g, "").replace(/\)/g, "").trim().toLowerCase())}
		}
		return strType.toLowerCase();
	} catch (e) {
		return strType;
	}
}

function tryGetStat (strLine) {
	try {
		return tryConvertNumber(/(\d+) \(.*?\)/.exec(strLine)[1]);
	} catch (e) {
		return 0;
	}
}

// Tries to parse immunities, resistances, and vulnerabilities
function tryParseSpecialDamage (strDamage, damageType) {
	const splSemi = strDamage.toLowerCase().split(";");
	const newDamage = [];
	try {
		splSemi.forEach(section => {
			const tempDamage = {};
			let pushArray = newDamage;
			if (section.includes("from")) {
				tempDamage[damageType] = [];
				pushArray = tempDamage[damageType];
				tempDamage["note"] = /from .*/.exec(section)[0];
				section = /(.*) from /.exec(section)[1];
			}
			section = section.replace(/and/g, '');
			section.split(",").forEach(s => {
				pushArray.push(s.trim());
			});
			if ("note" in tempDamage) {
				newDamage.push(tempDamage)
			}
		});
		return newDamage;
	} catch (ignored) {
		return strDamage;
	}
}

function tryParseSpellcasting (trait) {
	let spellcasting = [];

	function parseSpellcasting (trait) {
		const splitter = new RegExp(/,\s?(?![^(]*\))/, "g"); // split on commas not within parentheses

		let name = trait.name;
		let spellcastingEntry = {"name": name, "headerEntries": [parseToHit(trait.entries[0])]};
		let doneHeader = false;
		for (let i = 1; i < trait.entries.length; i++) {
			let thisLine = trait.entries[i];
			if (thisLine.includes("/rest")) {
				doneHeader = true;
				let property = thisLine.substr(0, 1) + (thisLine.includes(" each:") ? "e" : "");
				let value = thisLine.substring(thisLine.indexOf(": ") + 2).split(splitter).map(i => parseSpell(i));
				if (!spellcastingEntry.rest) spellcastingEntry.rest = {};
				spellcastingEntry.rest[property] = value;
			} else if (thisLine.includes("/day")) {
				doneHeader = true;
				let property = thisLine.substr(0, 1) + (thisLine.includes(" each:") ? "e" : "");
				let value = thisLine.substring(thisLine.indexOf(": ") + 2).split(splitter).map(i => parseSpell(i));
				if (!spellcastingEntry.daily) spellcastingEntry.daily = {};
				spellcastingEntry.daily[property] = value;
			} else if (thisLine.includes("/week")) {
				doneHeader = true;
				let property = thisLine.substr(0, 1) + (thisLine.includes(" each:") ? "e" : "");
				let value = thisLine.substring(thisLine.indexOf(": ") + 2).split(splitter).map(i => parseSpell(i));
				if (!spellcastingEntry.weekly) spellcastingEntry.weekly = {};
				spellcastingEntry.weekly[property] = value;
			} else if (thisLine.startsWith("Constant: ")) {
				doneHeader = true;
				spellcastingEntry.constant = thisLine.substring(9).split(splitter).map(i => parseSpell(i));
			} else if (thisLine.startsWith("At will: ")) {
				doneHeader = true;
				spellcastingEntry.will = thisLine.substring(9).split(splitter).map(i => parseSpell(i));
			} else if (thisLine.includes("Cantrip")) {
				doneHeader = true;
				let value = thisLine.substring(thisLine.indexOf(": ") + 2).split(splitter).map(i => parseSpell(i));
				if (!spellcastingEntry.spells) spellcastingEntry.spells = {"0": {"spells": []}};
				spellcastingEntry.spells["0"].spells = value;
			} else if (thisLine.includes(" level") && thisLine.includes(": ")) {
				doneHeader = true;
				let property = thisLine.substr(0, 1);
				let value = thisLine.substring(thisLine.indexOf(": ") + 2).split(splitter).map(i => parseSpell(i));
				if (!spellcastingEntry.spells) spellcastingEntry.spells = {};
				let slots = thisLine.includes(" slot") ? parseInt(thisLine.substr(11, 1)) : 0;
				spellcastingEntry.spells[property] = {"slots": slots, "spells": value};
			} else {
				if (doneHeader) {
					if (!spellcastingEntry.footerEntries) spellcastingEntry.footerEntries = [];
					spellcastingEntry.footerEntries.push(parseToHit(thisLine));
				} else {
					spellcastingEntry.headerEntries.push(parseToHit(thisLine));
				}
			}
		}
		spellcasting.push(spellcastingEntry);
	}

	function parseSpell (name) {
		name = name.trim();
		let asterix = name.indexOf("*");
		let brackets = name.indexOf(" (");
		if (asterix !== -1) {
			return `{@spell ${name.substr(0, asterix)}}*`;
		} else if (brackets !== -1) {
			return `{@spell ${name.substr(0, brackets)}}${name.substring(brackets)}`;
		}
		return `{@spell ${name}}`;
	}

	function parseToHit (line) {
		return line.replace(/( \+)(\d+)( to hit with spell)/g, (m0, m1, m2, m3) => {
			return ` {@hit ${m2}}${m3}`;
		});
	}

	try {
		parseSpellcasting(trait);
		return {out: spellcasting, success: true};
	} catch (e) {
		return {out: trait, success: false};
	}
}

const SKILL_SPACE_MAP = {
	"sleightofhand": "sleight of hand",
	"animalhandling": "animal handling"
};

const ALIGNMENT_MAP = {
	"any non-good alignment": ["L", "NX", "C", "NY", "E"],
	"any non-lawful alignment": ["NX", "C", "G", "NY", "E"],
	"any chaotic alignment": ["C", "G", "NY", "E"],
	"any evil alignment": ["L", "NX", "C", "E"],
	"any alignment": ["A"],
	"unaligned": ["U"],
	"neutral": ["N"],
	"chaotic evil": ["C", "E"],
	"chaotic neutral": ["C", "N"],
	"chaotic good": ["C", "G"],
	"neutral good": ["N", "G"],
	"neutral evil": ["N", "E"],
	"lawful evil": ["L", "E"],
	"lawful neutral": ["L", "N"],
	"lawful good": ["L", "G"]
};

function loadSources () {
	DataUtil.loadJSON(JSON_URL, loadparser)
}

function sortOptions ($select) {
	$select.append($select.find("option").remove().sort((a, b) => {
		const at = $(a).text();
		const bt = $(b).text();
		return (at > bt) ? 1 : ((at < bt) ? -1 : 0);
	}));
}

function appendSource ($select, src) {
	$select.append(`<option value="${src}">${src}</option>`);
}

const COOKIE_NAME = "converterSources";
function loadparser (data) {
	let hasAppended = false;

	// custom sources
	const $srcSel = $(`#source`);
	Object.keys(data).forEach(src => appendSource($srcSel, src));
	const rawCookie = Cookies.get(COOKIE_NAME);
	const cookie = rawCookie ? JSON.parse(rawCookie) : {sources: [], selected: SRC_MM};
	cookie.sources.forEach(src => appendSource($srcSel, src));
	sortOptions($srcSel);
	$srcSel.val(cookie.selected);

	$srcSel.on("change", () => cookie.selected = $srcSel.val());

	window.addEventListener("unload", function () {
		Cookies.set(COOKIE_NAME, cookie, {expires: 365, path: window.location.pathname})
	});

	const $inptCustomSource = $(`#customsourcein`);
	$(`#addsource`).on("click", () => {
		const toAdd = $inptCustomSource.val().trim();
		if (!cookie.sources.find(src => toAdd.toLowerCase() === src.toLowerCase())) {
			cookie.selected = toAdd;
			cookie.sources.push(toAdd);
			appendSource($srcSel, toAdd);
			sortOptions($srcSel);
			$srcSel.val(toAdd);
			$inptCustomSource.val("");
		}
	});

	// init editor
	const editor = ace.edit("statblock");
	editor.setOptions({
		wrap: true
	});

	$(`button#parsestatblockadd`).on("click", () => {
		doParseText(true);
	});

	$("button#parsestatblock").on("click", () => {
		if (!hasAppended || confirm("You're about to overwrite multiple entries. Are you sure?")) doParseText(false);
	});

	/**
	 * Parses statblocks from raw text pastes
	 * @param append
	 */
	function doParseText (append) {
		const statblock = editor.getValue().split("\n");
		const stats = {};
		stats.source = $srcSel.val();
		// for the user to fill out
		stats.page = 0;

		let prevLine = null;
		let curLine = null;
		for (let i = 0; i < statblock.length; i++) {
			prevLine = curLine;
			curLine = statblock[i].trim();

			if (curLine === "") continue;

			// name of monster
			if (i === 0) {
				stats.name = curLine.toLowerCase().replace(/\b\w/g, function (l) {
					return l.toUpperCase()
				});
				continue;
			}

			// size type alignment
			if (i === 1) {
				stats.size = curLine[0];
				stats.type = curLine.split(",")[0].split(" ").splice(1).join(" "); // + ", " + $("input#source").val();
				stats.type = tryParseType(stats.type);

				stats.alignment = curLine.split(", ")[1].toLowerCase();
				stats.alignment = ALIGNMENT_MAP[stats.alignment] || stats.alignment;
				continue;
			}

			// armor class
			if (i === 2) {
				stats.ac = curLine.split("Armor Class ")[1];
				continue;
			}

			// hit points
			if (i === 3) {
				const rawHp = curLine.split("Hit Points ")[1];
				// split HP into average and formula
				const m = /^(\d+) \((.*?)\)$/.exec(rawHp);
				if (!m) stats.hp = {special: rawHp}; // for e.g. Avatar of Death
				stats.hp = {
					average: Number(m[1]),
					formula: m[2]
				};
				continue;
			}

			// speed
			if (i === 4) {
				stats.speed = curLine.toLowerCase();
				const split = stats.speed.split(",");
				const newSpeeds = {};
				try {
					split.forEach(s => {
						const splSpace = s.trim().split(" ");
						let name = splSpace.shift().trim();
						const val = tryConvertNumber(splSpace.shift().trim());
						if (name === "speed") {
							name = "walk";
						}
						newSpeeds[name] = val;
					});
					stats.speed = newSpeeds;
				} catch (ignored) {
					// because the linter doesn't like empty blocks...
					continue;
				}
				continue;
			}

			if (i === 5) continue;
			// ability scores
			if (i === 6) {
				const abilities = curLine.split(/ \(([+-–‒])?[0-9]*\) ?/g);
				stats.str = tryConvertNumber(abilities[0]);
				stats.dex = tryConvertNumber(abilities[2]);
				stats.con = tryConvertNumber(abilities[4]);
				stats.int = tryConvertNumber(abilities[6]);
				stats.wis = tryConvertNumber(abilities[8]);
				stats.cha = tryConvertNumber(abilities[10]);
				continue;
			}

			// alternate ability scores
			switch (prevLine.toLowerCase()) {
				case "str":
					stats.str = tryGetStat(curLine);
					break;
				case "dex":
					stats.dex = tryGetStat(curLine);
					break;
				case "con":
					stats.con = tryGetStat(curLine);
					break;
				case "int":
					stats.int = tryGetStat(curLine);
					break;
				case "wis":
					stats.wis = tryGetStat(curLine);
					break;
				case "cha":
					stats.cha = tryGetStat(curLine);
					break;
			}

			// saves (optional)
			if (!curLine.indexOf("Saving Throws ")) {
				stats.save = curLine.split("Saving Throws ")[1];
				// TODO parse to new format
				// convert to object format
				if (stats.save && stats.save.trim()) {
					const spl = stats.save.split(",").map(it => it.trim().toLowerCase()).filter(it => it);
					const nu = {};
					spl.forEach(it => {
						const sv = it.split(" ");
						nu[sv[0]] = sv[1];
					});
					stats.save = nu;
				}
				continue;
			}

			// skills (optional)
			if (!curLine.indexOf("Skills ")) {
				stats.skill = [curLine.split("Skills ")[1].toLowerCase()];
				if (stats.skill.length === 1) stats.skill = stats.skill[0];
				const split = stats.skill.split(",");
				const newSkills = {};
				try {
					split.forEach(s => {
						const splSpace = s.split(" ");
						const val = splSpace.pop().trim();
						let name = splSpace.join(" ").toLowerCase().trim().replace(/ /g, "");
						name = SKILL_SPACE_MAP[name] || name;
						newSkills[name] = val;
					});
					stats.skill = newSkills;
					if (stats.skill[""]) delete stats.skill[""]; // remove empty properties
				} catch (ignored) {
					// because the linter doesn't like empty blocks...
					continue;
				}
				continue;
			}

			// damage vulnerabilities (optional)
			if (!curLine.indexOf("Damage Vulnerabilities ")) {
				stats.vulnerable = curLine.split("Vulnerabilities ")[1];
				stats.vulnerable = tryParseSpecialDamage(stats.vulnerable, "vulnerable");
				continue;
			}

			// damage resistances (optional)
			if (!curLine.indexOf("Damage Resistances ")) {
				stats.resist = curLine.split("Resistances ")[1];
				stats.resist = tryParseSpecialDamage(stats.resist, "resist");
				continue;
			}

			// damage immunities (optional)
			if (!curLine.indexOf("Damage Immunities ")) {
				stats.immune = curLine.split("Immunities ")[1];
				stats.immune = tryParseSpecialDamage(stats.immune, "immune");
				continue;
			}

			// condition immunities (optional)
			if (!curLine.indexOf("Condition Immunities ")) {
				stats.conditionImmune = curLine.split("Immunities ")[1];
				stats.conditionImmune = tryParseSpecialDamage(
					stats.conditionImmune, "conditionImmune");
				continue;
			}

			// senses
			if (!curLine.indexOf("Senses ")) {
				stats.senses = curLine.split("Senses ")[1].split(" passive Perception ")[0];
				if (!stats.senses.indexOf("passive Perception")) stats.senses = "";
				if (stats.senses[stats.senses.length - 1] === ",") stats.senses = stats.senses.substring(0, stats.senses.length - 1);
				stats.passive = tryConvertNumber(curLine.split(" passive Perception ")[1]);
				continue;
			}

			// languages
			if (!curLine.indexOf("Languages ")) {
				stats.languages = curLine.split("Languages ")[1];
				continue;
			}

			// challenges and traits
			// goes into actions
			if (!curLine.indexOf("Challenge ")) {
				stats.cr = curLine.split("Challenge ")[1].split(" (")[0];

				// traits
				i++;
				curLine = statblock[i];
				stats.trait = [];
				stats.action = [];
				stats.reaction = [];
				stats.legendary = [];

				let curtrait = {};

				let ontraits = true;
				let onactions = false;
				let onreactions = false;
				let onlegendaries = false;
				let onlegendarydescription = false;

				// keep going through traits til we hit actions
				while (i < statblock.length) {
					if (moveon(curLine)) {
						ontraits = false;
						onactions = !curLine.toUpperCase().indexOf("ACTIONS");
						onreactions = !curLine.toUpperCase().indexOf("REACTIONS");
						onlegendaries = !curLine.toUpperCase().indexOf("LEGENDARY ACTIONS");
						onlegendarydescription = onlegendaries;
						i++;
						curLine = statblock[i];
					}

					// get the name
					curtrait.name = "";
					curtrait.entries = [];

					const parseAction = line => {
						curtrait.name = line.split(/([.!])/g)[0];
						curtrait.entries.push(line.split(".").splice(1).join(".").trim());
					};

					if (onlegendarydescription) {
						// usually the first paragraph is a description of how many legendary actions the creature can make
						// but in the case that it's missing the substring "legendary" and "action" it's probably an action
						const compressed = curLine.replace(/\s*/g, "").toLowerCase();
						if (!compressed.includes("legendary") && !compressed.includes("action")) onlegendarydescription = false;
					}

					if (onlegendarydescription) {
						curtrait.entries.push(curLine.trim());
						onlegendarydescription = false;
					} else {
						parseAction(curLine);
					}

					i++;
					curLine = statblock[i];

					// get paragraphs
					// connecting words can start with: o ("of", "or"); t ("the"); a ("and", "at"). Accept numbers, e.g. (Costs 2 Actions)
					// allow numbers
					// allow "a" and "I" as single-character words
					while (curLine && curLine.match(/^(([A-Z0-9ota][a-z0-9'’`]+|[aI])( \(.*\)| )?)+([.!])+/g) === null && !moveon(curLine)) {
						curtrait.entries.push(curLine.trim());
						i++;
						curLine = statblock[i];
					}

					if (curtrait.name || curtrait.entries) {
						// convert dice tags
						if (curtrait.entries) {
							curtrait.entries = curtrait.entries.filter(it => it.trim()).map(e => {
								if (typeof e !== "string") return e;

								// replace e.g. "+X to hit"
								e = e.replace(/([-+])?\d+(?= to hit)/g, function (match) {
									return `{@hit ${match}}`
								});

								// replace e.g. "2d4+2"
								e = e.replace(/\d+d\d+(\s?([-+])\s?\d+\s?)?/g, function (match) {
									return `{@dice ${match}}`;
								});

								return e;
							});
						}

						// convert spellcasting
						if (ontraits) {
							if (curtrait.name.toLowerCase().includes("spellcasting")) {
								curtrait = tryParseSpellcasting(curtrait);
								if (curtrait.success) {
									// merge in e.g. innate spellcasting
									if (stats.spellcasting) stats.spellcasting = stats.spellcasting.concat(curtrait.out);
									else stats.spellcasting = curtrait.out;
								} else stats.trait.push(curtrait.out);
							} else {
								if (hasEntryContent(curtrait)) stats.trait.push(curtrait);
							}
						}
						if (onactions && hasEntryContent(curtrait)) stats.action.push(curtrait);
						if (onreactions && hasEntryContent(curtrait)) stats.reaction.push(curtrait);
						if (onlegendaries && hasEntryContent(curtrait)) stats.legendary.push(curtrait);
					}
					curtrait = {};
				}

				// Remove keys if they are empty
				if (stats.trait.length === 0) {
					delete stats.trait;
				}
				if (stats.reaction.length === 0) {
					delete stats.reaction;
				}
				if (stats.legendary.length === 0) {
					delete stats.legendary;
				}
			}
		}

		function hasEntryContent (it) {
			return it.name || (it.entries.length === 1 && it.entries[0]) || it.entries.length > 1;
		}

		let out = JSON.stringify(stats, null, "\t");
		out = out.replace(/([1-9]\d*)?d([1-9]\d*)(\s?)([+-])(\s?)(\d+)?/g, "$1d$2$4$6");
		out = out
			.replace(/\u2014/g, "\\u2014")
			.replace(/\u2013/g, "\\u2013")
			.replace(/’/g, "'")
			.replace(/[“”]/g, "\\\"");

		const $outArea = $("textarea#jsonoutput");
		if (append) {
			const oldVal = $outArea.text();
			$outArea.text(`${out},\n${oldVal}`);
			hasAppended = true;
		} else {
			$outArea.text(out);
			hasAppended = false;
		}
	}
}
