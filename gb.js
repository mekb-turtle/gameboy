if (require.main === module) {
	console.error(`You are not meant to call gb.js directly`);
	return;
}
module.exports = (electron, window_, alertError, { updateToolbarPaused, updateToolbarMuted }, { setRPC, updateRPC, endRPC }, setOnIcon, exists,
	{ text_bar, audio, title, fps, terminalOutput }, callQuit, { lastRomFilename }) => {
	const replacePlaceholders = (string, replacers) => {
		return string.replace(/\$\{([a-zA-Z0-9_\$]+)(\:(\!?)\`([^`]*)\`)?\}/g, (t, t1, t2, t4, t3) => {
			if (!replacers.hasOwnProperty(t1)) return t;
			if (t2) return !(t4 ? replacers[t1] : !replacers[t1]) ? t3 : "";
			return replacers[t1];
		});
	};
	const { performance } = require("perf_hooks");
	const crypto = require("crypto");
	const cloneBuffer = require("clone-buffer");
	const fs = require("fs").promises;
	// Date object when user loaded rom
	var startTimestamp;
	var rom;
	var save;
	var romHash;
	var saveFileName;
	var saving = false;
	var canSave = false;
	var savingBeforeUnload = false;
	const Gameboy = require("serverboy");
	var gameboy;
	const checkIfRom = (dontShowDialog) => {
		if (!rom || !gameboy) {
			if (!dontShowDialog)
				electron.dialog.showMessageBox(window_, {
					type: "error",
					message: "Open a ROM first",
				});
			return true;
		}
		return false;
	};
	const saveBeforeUnload = async () => {
		if (savingBeforeUnload) return false;
		savingBeforeUnload = true;
		if (saving)
			while (saving) {
				await new Promise(r => setTimeout(r, 50)); // will wait 50 ms
			}
		else
			await saveSave();
		savingBeforeUnload = false;
		return true;
	};
	const getPrivate = () => {
		// gets private serverboy data like rom name
		if (!gameboy) return null;
		return gameboy[Object.keys(gameboy).filter(e => e.startsWith("_"))[0]];
	};
	const getRomName = () => {
		if (checkIfRom(true)) return "";
		var p = getPrivate()?.gameboy;
		if (!p) return "";
		return p?.name?`${p?.name}${p?.gameCode?`${p?.gameCode}`:""}`:"";
	};
	const isAllowedFile = (file) => {
		// sees if a file starts with the correct rom hash header thing
		// to make sure they loaded a save / state for the correct rom
		if (file.length < romHash.length) return false;
		for (var i = 0; i < romHash.length; ++i) {
			if (romHash[i] != file[i]) return false;
		}
		return file.slice(romHash.length);
	};
	const lastRomFilePrefix = "lastromlocation_";
	const lastRomFileSuffix = "_";
	// valid cartridge types for checking if
	// file is actually a valid gameboy rom file
	const validCartridgeTypes = [0x00,0x01,0x02,0x03,0x05,0x06,0x08,0x09,0x0B,
		0x0C,0x0D,0x0F,0x10,0x11,0x12,0x13,0x19,0x1A,0x1B,0x1C,0x1D,
		0x1E,0x1F,0x22,0xFD,0xFE,0xFF];
	// update the title of the window
	const updateTitle = () => {
		window_.setTitle(replacePlaceholders(title, { name: getRomName() }));
	};
	updateTitle();
	// handler for opening files
	const openFileHandler = async (fname) => {
		try {
			var fileData = await fs.readFile(fname);
			if (!await saveBeforeUnload()) return;
			const cHash = () => {
				romHash = Buffer.concat([
					Buffer.from("romhash_"),
					crypto.createHash("sha256").update(rom).digest(),
					Buffer.from("_"),
				]);
			};
			save = null;
			canSave = false;
			rom = fileData;
			cHash();
			rom = null;
			startTimestamp = null;
			updateTitle();
			if (gameboy) getPrivate()?.shutdownEmulation();
			// loads rom and save file from s argument, see below this function
			var z = async (s) => {
				try {
					canSave = false;
					gameboy = new Gameboy();
					var p;
					try {
						if (s) gameboy.loadRom(fileData, s);
						else gameboy.loadRom(fileData);
						p = getPrivate();
					} catch {}
					rom = null;
					save = null;
					if (p && validCartridgeTypes.includes(p?.gameboy?.cartridgeType)) {
						if (s) save = s;
						rom = fileData;
						cHash();
						updateTitle();
						startTimestamp = new Date();
						initAudio();
						try {
							fs.writeFile(lastRomFilename, Buffer.from(`${lastRomFilePrefix}${fname}${lastRomFileSuffix}`));
						} catch (err) {
							alertError(err);
						}
					} else {
						// kills gameboy if invalid rom or error loading the rom
						if (p) p.shutdownEmulation();
						romHash = null;
						gameboy = null;
						rom = null;
						startTimestamp = null;
						save = null;
						updateTitle();
						initAudio();
						alertError("Invalid ROM");
					}
				} catch (err) {
					// kills gameboy
					romHash = null;
					gameboy = null;
					rom = null;
					save = null;
					updateTitle();
					initAudio();
					alertError(err);
				}
			};
			saveFileName = `${fname}.sav`;
			try {
				if (await exists(saveFileName)) {
					var saveFileData = await fs.readFile(saveFileName);
					var d = isAllowedFile(saveFileData);
					if (d) {
						await z(d);
					} else {
						await z();
						electron.dialog.showMessageBox(window_, {
							type: "error",
							message: "Invalid save file or wrong ROM loaded"
						});
					}
				} else {
					z();
				}
			} catch (err) {
				alertError(err);
			}
		} catch (err) {
			alertError(err);
		}
	};
	const openLastRom = async () => {
		try {
			try {
				var data = await fs.readFile(lastRomFilename);
			} catch (err) {
				if (err.code !== "ENOENT") throw err;
				return;
			}
			if (data.includes(0)) return;
			var data = data.toString();
			if (!data.startsWith(lastRomFilePrefix)) return
			if (!data.endsWith(lastRomFileSuffix)) return
			var path = data.substring(lastRomFilePrefix.length, data.length - lastRomFileSuffix.length);
			if (await exists(path)) {
				await openFileHandler(path);
			}
		} catch (err) {
			alertError(err);
		}
	};
	const openRom = async () => {
		if (!await saveBeforeUnload()) return;
		var res = await electron.dialog.showOpenDialog(window_, {
			properties: ["openFile"],
			buttonLabel: "Open",
			filters: [
				{name: "Gameboy ROMs (gb, gbc)", extensions: ["gb", "gbc"]},
				{name: "All", extensions: ["*"]},
			],
			title: "Open ROM"
		});
		if (res.canceled) return;
		if (res.filePaths.length != 1) return;
		await openFileHandler(res.filePaths[0]);
	};
	const isExperimental = () => {
		// alerts that feature is experimental
		electron.dialog.showMessageBox(window_, {
			type: "error",
			message: "This feature is experimental"
		});
		return false;
	};
	const closeRom = async () => {
		if (checkIfRom(true)) return;
		if (!await saveBeforeUnload()) return;
		// kills gameboy
		getPrivate().shutdownEmulation();
		canSave = false;
		gameboy = null;
		rom = null;
		save = null;
		startTimestamp = null;
		updateTitle();
		initAudio();
	};
	const rebootRom = async () => {
		if (checkIfRom(true)) return;
		if (!await saveBeforeUnload()) return;
		// restarts gameboy, shouldn't error unless save or rom variable
		// was somehow changed without openRom
		getPrivate().shutdownEmulation();
		canSave = false;
		try {
			gameboy = new Gameboy();
			startTimestamp = new Date();
			if (save) gameboy.loadRom(rom, save);
			else gameboy.loadRom(rom);
			initAudio();
			updateTitle();
		} catch (err) {
			alertError(err);
		}
	};
	// autosave stuff
	var autosave = true;
	const setAutosave = e => autosave = e;
	var lastSave;
	const saveSave = async (isManual) => {
		try {
			// annoying code aaaaaaa
			if (!(autosave || isManual)) return;
			if (saving) return;
			if (!canSave) return;
			if (checkIfRom(true)) return;
			var saveS = gameboy.getSaveData();
			var saveFile = Buffer.concat([romHash, Buffer.from(saveS)]);
			if (lastSave != null && !isManual) // don't save if nothing changed unless manual save
				if (Buffer.compare(saveFile, lastSave) === 0) return;
			saving = true;
			canSave = false;
			if (await exists(saveFileName))
				await fs.copyFile(saveFileName, saveFileName + ".bak").catch(e => alertError(e));
			await fs.writeFile(saveFileName, saveFile).catch(e=>{ alertError(e); saving=false; });
			// important to set save variable otherwise rebootRom will load save
			// from what was read in openRom not actual current save file
			save = saveS;
			// have to import a whole package just to check if nothing changed
			// i can't figure out how to clone a buffer normally
			// i don't think this is causing most lag as i don't see a difference without autosave
			// or more lag when saving, but i guess i'll make this an option in the future to check if
			// the save has actually changed to save disk writes
			lastSave = cloneBuffer(saveFile);
			if (hasSavedTimeout) { clearTimeout(hasSavedTimeout); hasSavedTimeout = null; }
			hasSavedTimeout = setTimeout(() => {
				hasSavedText = false;
				hasSavedTimeout = null;
			}, 1000);
			hasSavedText = true;
			saving = false;
		} catch (err) {
			alertError(err);
		}
	};
	const openState = async () => {
		// not done yet, serverboy's setMemory function is experimental
		if (!isExperimental()) return;
		if (checkIfRom()) return;
		if (!await saveBeforeUnload()) return;
		electron.dialog.showOpenDialog(window_, {
			properties: ["openFile"],
			buttonLabel: "Open",
			filters: [
				{name: "Save state file (st, mgbst)", extensions: ["st", "mgbst"]},
				{name: "All", extensions: ["*"]},
			],
			title: "Open save state file"
		}).then(res => {
			if (res.canceled) return;
			if (res.filePaths.length != 1) return;
			fs.readFile(res.filePaths[0]).then(fileData => {
				var data = isAllowedFile(fileData);
				if (data) {
					canSave = false;
					//TODO: load state
				} else {
					electron.dialog.showMessageBox(window_, {
						type: "error",
						message: "Invalid save state file or wrong ROM file",
					});
				}
			}).catch(err => alertError(err));
		});
	};
	const saveState = async () => {
		// serverboy's getMemory works i think but setMemory doesn't
		if (!isExperimental()) return;
		if (checkIfRom()) return;
		if (!await saveBeforeUnload()) return;
		canSave = false;
		var mem = gameboy.getMemory();
		var stateFile = Buffer.concat([romHash, Buffer.from(mem)]);
		if (!stateFile) return;
		electron.dialog.showSaveDialog(window_, {
			properties: ["createDirectory"],
			buttonLabel: "Save",
			filters: [
				{name: "Save state file (st, mgbst)", extensions: ["st", "mgbst"]},
				{name: "All", extensions: ["*"]},
			],
			title: "Save save state file"
		}).then(res => {
			if (res.canceled) return;
			if (!res.filePath) return;
			fs.writeFile(res.filePath, stateFile).then(() => {}).catch(err => alertError(err));
		});
	};
	// store input buttons
	var buttonsDown = {
		A: false, B: false,
		START: false, SELECT: false,
		UP: false, DOWN: false, LEFT: false, RIGHT: false,
	};
	const quitHandler = () => {
		// quit game is sent when unload in preload.js
		// this is ran when the user closes the window
		// make sure to save the game
		saveBeforeUnload(true).then(p => {
			if (!p) return;
			// update some stuff
			if (!checkIfRom(true)) {
				// kills gameboy
				getPrivate().shutdownEmulation();
				canSave = false;
				gameboy = null;
				rom = null;
				save = null;
				startTimestamp = null;
			}
			initAudio();
			endRPC();
			updateRPC();
			updateTitle();
			// finally quit
			callQuit();
		});
	};
	electron.ipcMain.handle("quitgame", quitHandler);
	electron.ipcMain.handle("buttonpress", (event, o) => {
		if (!o.button) return;
		// make sure o variable is valid
		if (typeof o.button != "string") return;
		if (!buttonsDown.hasOwnProperty(o.button)) return;
		if (typeof o.press != "boolean") return;
		// handle button press
		buttonsDown[o.button] = o.press;
	});
	// framerate stuff
	var frameAdvancedAudio = false;
	var framerate = 0;
	var framerateFrames = 0;
	var framerateLastTime = performance.now();
	var doingFrame = false;
	// screen data
	var scr = null;
	const frame = () => {
		// don't double up frame and fuck up fps calculation
		if (doingFrame) return;
		doingFrame = true;
		if (rom) {
			// press input from buttonsDown
			gameboy.pressKeys(Object.keys(buttonsDown).filter(e => buttonsDown[e]).map(e => Gameboy.KEYMAP[e]));
			// do the frame
			scr = gameboy.doFrame();
			// stop same wave when paused
			frameAdvancedAudio = false;
			// enable autosave again
			// shouldn't keep autosaving while paused as gameboy can't change
			// save data while paused
			canSave = true;
		} else {
			scr = null;
		}
		// fps calculation
		++framerateFrames;
		var now = performance.now();
		if (now - framerateLastTime >= 1e3) {
			framerate = framerateFrames;
			framerateLastTime = now;
			framerateFrames = 0;
		}
		doingFrame = false;
	};
	// shows Saved text because saving is too quick for the user to see
	var hasSavedText = false;
	var hasSavedTimeout = null;
	// terminal stuff
	var termImg;
	var jimp;
	var canDraw;
	if (terminalOutput.enabled) {
		termImg = require("show-image-terminal");
		Jimp = require("jimp");
		canDraw = 0;
	}
	// send the screen data to preload.js
	const sendFrame = () => {
		if (!rom) scr = null;
		if (terminalOutput.enabled) {
			var perfNow = performance.now();
			if (perfNow > canDraw && scr) {
				canDraw = perfNow + terminalOutput.delay;
				var s = new Jimp(160, 144);
				scr.map((e, i) => s.bitmap.data[i] = e);
				termImg(s).then(d => {
					if (terminalOutput.clear) process.stdout.write("\x1b[H\x1b[2J\x1b[3J");
					process.stdout.write(d+"\n");
				});
			}
		}
		try {
			window_.webContents.send("rendergb", scr);
		} catch {}
	};
	// initialize the audio library
	const initAudio = () => {
		try {
			if (!audio?.enabled || !gameboy || !rom) {
				window_.webContents.send("audioinit", null);
			} else {
				var p = getPrivate().gameboy;
				// send audio info like codec and sample rate
				window_.webContents.send("audioinit", {
					inputCodec: audio.is_float ? "Float32" : "Int32",
					channels: 2,
					sampleRate: p.clocksPerSecond / p.audioResamplerFirstPassFactor,
					flushTime: audio.flush_time,
				});
			}
		} catch (err) {
			alertError(err);
		}
	};
	// send details to preload.js
	const sendInfo = () => {
		var name = getRomName();
		try {
			setRPC({
				start_timestamp: startTimestamp,
				rom_name: rom ? name + "" : "",
				is_rom: !!rom,
				paused: paused,
			});
			updateRPC();
		} catch {}
		try {
			setOnIcon(rom);
		} catch {}
		try {
			window_.webContents.send("details", rom ? replacePlaceholders(text_bar.rom_loaded, {
				paused, name, frames: getPrivate().frames,
				saving, saved: !saving&&hasSavedText, notsave: !hasSavedText&&!saving,
				fps: framerate
			}) : replacePlaceholders(text_bar.rom_not_loaded, {
				paused, fps: framerate
			}));
		} catch {}
	};
	var paused = false;
	var canFrameAdvance = true;
	const sendAudio = () => {
		try {
			if (rom) {
				if (audio.send_once_while_paused && frameAdvancedAudio && paused) return;
				frameAdvancedAudio = true;
				var a = gameboy.getAudio();
				if (a.filter((item, index, array) => index == array.indexOf(item)).length > 1) {
					window_.webContents.send("audio", a);
				}
			}
		} catch {}
	};
	// intervals
	setInterval(() => {
		// interval for frame advancing while not paused
		// can't frame advance faster than normal playing speed
		canFrameAdvance = true;
		if (paused) return;
		frame();
		sendAudio();
	}, Math.floor(1e3 / fps.target));
	setInterval(() => {
		sendFrame();
	}, Math.floor(1e3 / fps.display_target));
	setInterval(() => {
		sendInfo();
	}, Math.floor(1e3 / fps.info_target));
	setInterval(async () => {
		// interval for autosaving
		await saveSave();
	}, Math.floor(10e3));
	const togglePaused = () => {
		// self explanatory
		paused = !paused;
		updateToolbarPaused(paused);
	};
	var vol = +!audio.muted;
	const toggleMute = () => {
		vol = vol > 0 ? 0 : 1;
		window_.webContents.send("volume", vol);
		initAudio();
		updateToolbarMuted(!vol);
		return vol;
	};
	const frameAdvance = () => {
		if (!paused) {
			// pause if not paused
			paused = true;
			return;
		}
		if (!canFrameAdvance) return;
		// update pause/resume button's label
		updateToolbarPaused(paused);
		if (checkIfRom(true)) return;
		frame();
		sendAudio();
		sendFrame();
		canFrameAdvance = false;
	};
	const callReady = () => {
		vol = audio.muted ? 0 : 1;
		window_.webContents.send("volume", vol);
		updateToolbarPaused(paused);
		updateToolbarMuted(!vol);
	}
	return { openRom, openLastRom, closeRom, rebootRom, openState, saveState, togglePaused, frameAdvance, saveSave, setAutosave, toggleMute, callReady };
};
