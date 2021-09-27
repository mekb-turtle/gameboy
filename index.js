(async()=>{
if (require.main !== module) {
	console.error(`You are not meant to call require this script`);
	return;
}
const electron = require("electron");
if (typeof electron != "object") {
	console.error("not running on electron");
	return;
}
console.log("Loading...");
const path = require("path");
const fs = require("fs").promises;
await electron.app.whenReady();
const calcWidth  = scaling => 160*scaling;
const calcHeight = scaling => 144*scaling+25+16;
const configFile = "config.json";
const gFile = f => path.join(...[__dirname, ...f.split("/")]);
const gameboyIcon = electron.nativeImage.createFromPath(gFile("icons/icon_upscaled.png"));
const gameboyOnIcon = electron.nativeImage.createFromPath(gFile("icons/icon_upscaled_on.png"));
const window_ = new electron.BrowserWindow({
	width:     calcWidth(2),
	height:    calcHeight(2),
	minWidth:  calcWidth(1),
	minHeight: calcHeight(1),
	title: " ",
	devTools: true,
	webPreferences: {
		preload: gFile("preload.js")
	},
});
// don't show window until ready
window_.hide();
const callQuit = () => {
	window_.destroy();
	electron.app.quit();
	process.exit();
};
const exists = async path => {
	// only ever used once
	try {
		await fs.stat(path);
		return true;
	} catch {
		return false;
	}
};
window_.setIcon(gameboyIcon);
var config = {};
if (await exists(configFile)) {
	try {
		var configBuf = await fs.readFile(configFile);
		var configT = configBuf.toString().replace(/(\/\/[^\n\r]+)|(\/\*[^\/]+\*\/)/gs,e=>"");
		try {
			config = JSON.parse(configT);
		} catch (e) {
			console.error("failed parsing config.json", e);
		}
		delete configT;
		delete configBuf;
	} catch (e) {
		console.error("failed reading config.json", e);
	}
}
var rpc;
var isRPC = false;
const setRPC = (t) => {
	if (!isRPC) return;
	rpc.set(t)
};
const updateRPC = () => {
	if (!isRPC) return;
	rpc.updateActivity();
};
const endRPC = () => {
	if (!isRPC) return;
	isRPC = false;
	rpc.end();
};
const setOnIcon = (t) => {
	window_.setIcon(t ? gameboyOnIcon : gameboyIcon);
}
const zErr = (err) => {
	console.error(err); // logs error and alerts it too
	electron.dialog.showErrorBox(typeof err == "string" ? err : (err.name || "Error"), typeof err == "string" ? "" : err.stack || err.toString());
}
// update menu
const zz = m => electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate(m));
var menu = [];
// set pause/resume button's label
const zzz = (p) => { menu[0].submenu[menu[0].submenu.map(e => e.id == "pause").indexOf(true)].label = p ? config.labels.resume : config.labels.pause; zz(menu); };
// set muted text
const zzy = (p) => { if (config.audio.enabled) menu[0].submenu[menu[0].submenu.map(e => e.id == "mute") .indexOf(true)].label = p ? config.labels.unmute : config.labels.mute;  zz(menu); };
// require gb
const { openRom, openLastRom, closeRom, rebootRom, openState, saveState, togglePaused, frameAdvance, saveSave, setAutosave, toggleMute, callReady }
	= require("./gb.js")( electron, window_, zErr, { zzz, zzy }, { setRPC, updateRPC, endRPC }, setOnIcon, exists,
		config, callQuit, { lastRomFilename: gFile(".lastrompath") } ); // load gb.js with variables
const infoDialog = () => {
	// info dialog
	electron.dialog.showMessageBox(window_, {
		message: `meGB
A Gameboy emulator written in Node.js by mekb the turtle - https://github.com/mekb-turtle - Discord: mekb the turtle#4288
Uses serverboy package by piglet-plays - https://gitlab.com/piglet-plays/serverboy.js`
	});
};
var isLight = false;
if (config.theme != null) {
	if (config.theme === "light")
		isLight = true;
	else if (config.theme !== "dark")
		console.error("theme is not dark or light, defaulting to dark");
}
window_.setBackgroundColor(isLight ? "#ffffff" : "#121216");
electron.ipcMain.handle("sendstuff", (event) => {
	window_.webContents.send("theme", !isLight);
	window_.webContents.send("buttons", config.button_keybinds);
});
// menu variable, not constant because pause/resume label can change
menu = [
	{ label: config.labels.menu, submenu: [
		{ label: config.labels.pause,         click: togglePaused,                  accelerator: config.keybinds.toggle_pause, id: "pause" },
		{ label: config.labels.frame_advance, click: frameAdvance,                  accelerator: config.keybinds.frame_advance },
		{ type: "separator" },
		{ label: config.labels.open_rom,      click: openRom,                       accelerator: config.keybinds.open_rom },
		{ label: config.labels.open_last_rom, click: openLastRom,                   accelerator: config.keybinds.open_last_rom },
		{ label: config.labels.reboot_rom,    click: rebootRom,                     accelerator: config.keybinds.reboot_rom },
		{ label: config.labels.close_rom,     click: closeRom,                      accelerator: config.keybinds.close_rom },
		{ type: "separator" },
		{ label: config.labels.auto_save,     click: m=>setAutosave(m.checked),     accelerator: config.keybinds.auto_save, checked: true, type: "checkbox" },
		{ label: config.labels.manual_save,   click: ()=>saveSave(true),            accelerator: config.keybinds.manual_save },
		/*
		{ type: "separator" },
		{ label: config.labels.open_state,    click: openState,                     accelerator: config.keybinds.open_state },
		{ label: config.labels.save_state,    click: saveState,                     accelerator: config.keybinds.save_state },v
		*/
		{ type: "separator" },
		{ label: config.labels.scale_sub, submenu: [
			...config.set_sizes.map((e, i) => ({
				label: config.labels.scale.replace(/\$S/g, e+"").replace(/\$I/g, i+"").replace(/\$O/g, i+1+""),
				click: () => {
					window_.setFullScreen(false);
					window_.unmaximize();
					window_.setSize(calcWidth(e), calcHeight(e));
				},
				accelerator: config.keybinds.scale.replace(/\$S/g, e+"").replace(/\$I/g, i+"").replace(/\$O/g, i+1+""),
			})),
		] },
		...config.audio.enabled?[
			{ type: "separator" },
			{ label: config.labels.mute,       click: toggleMute,                     accelerator: config.keybinds.toggle_mute, id: "mute" },
		]:[],
		{ type: "separator" },
		{ label: config.labels.info,         click: infoDialog,                     accelerator: config.keybinds.info },
		{ label: config.labels.exit,         click: () => { electron.app.quit(); }, accelerator: config.keybinds.exit },
	] },
];
zz(menu);
callReady();
window_.loadFile(gFile("index.html"));
// open dev tools for debugging
// window_.webContents.openDevTools();
// quit on window close, mac is confusing
electron.app.on("window-all-closed", () => {
	electron.app.quit();
	process.exit();
});
console.log("Ready");
// security stuff
electron.app.on("web-contents-created", (e, contents) => {
	contents.on("will-navigate", (e, url) => {
		e.preventDefault();
	});
	contents.setWindowOpenHandler(({ url }) => {
		return { action: "deny" };
	});
});
window_.show();
if (typeof config.discord_rpc == "object" && !Array.isArray(config.discord_rpc)) {
	if (config.discord_rpc.enabled === true) {
		if (typeof config.discord_rpc.id == "string") {
			rpc = require("./rpc.js");
			var i = config.discord_rpc.id;
			rpc.set(config.discord_rpc);
			if (i) {
				try {
					await rpc.startRPC(i);
					isRPC = true;
				} catch (err) {}
			}
		}
	}
}
})().catch(err => { console.error(err); process.exit(); });
