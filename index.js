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
const windowTitle = "meGB"; // title
const configFile = "config.json";
const gFile = f => path.join(__dirname, f);
const gameboyIcon = electron.nativeImage.createFromPath(gFile("icons/icon_upscaled.png"));
const gameboyOnIcon = electron.nativeImage.createFromPath(gFile("icons/icon_upscaled_on.png"));
const window_ = new electron.BrowserWindow({
  width:     calcWidth(2),
  height:    calcHeight(2),
  minWidth:  calcWidth(1),
  minHeight: calcHeight(1),
  title: windowTitle,
  webPreferences: {
    preload: gFile("preload.js")
  },
});
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
    var configString = await fs.readFile(configFile);
    config = JSON.parse(configString);
  } catch (e) {
    console.error("failed reading config.json", e);
  }
}
var rpc;
var isRPC = false;
const setRPCDetailsText = (t) => {
  if (!isRPC) return;
  rpc.setDetailsText(t);
};
const setRPCStateText = (t) => {
  if (!isRPC) return;
  rpc.setStateText(t);
};
const setRPCIcon = (t) => {
  if (!isRPC) return;
  rpc.setIcon(t);
};
const setRPCStartTimestamp = (t) => {
  if (!isRPC) return;
  rpc.setStartTimestamp(t);
};
const updateRPC = () => {
  if (!isRPC) return;
  rpc.updateActivity();
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
const zzz = (p) => { menu[0].submenu[menu[0].submenu.map(e => e.label == "Pause" || e.label == "Resume").indexOf(true)].label = p ? "Resume" : "Pause"; zz(menu); };
const { openRom, closeRom, rebootRom, openState, saveState, togglePaused, frameAdvance, saveSave, setAutosave }
  = require("./gb.js")(electron, window_, zErr, zzz, windowTitle, { setRPCDetailsText, setRPCStateText, setRPCIcon, setRPCStartTimestamp, updateRPC }, setOnIcon, exists); // load gb.js with variables
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
  window_.webContents.send("buttons", { kb: config.buttonKeybinds });
});
// menu variable, not constant because pause/resume label can change
menu = [
  { label: config.labels.menu, submenu: [
    { label: config.labels.pause,        click: togglePaused,              accelerator: config.keybinds.pause },
    { label: config.labels.frameAdvance, click: frameAdvance,              accelerator: config.keybinds.frameAdvance },
    { type: "separator" },
    { label: config.labels.openRom,      click: openRom,                   accelerator: config.keybinds.openRom },
    { label: config.labels.rebootRom,    click: rebootRom,                 accelerator: config.keybinds.rebootRom },
    { label: config.labels.closeRom,     click: closeRom,                  accelerator: config.keybinds.closeRom },
    { type: "separator" },
    { label: config.labels.autosave,     click: m=>setAutosave(m.checked), accelerator: config.keybinds.autosave, checked: true, type: "checkbox" },
    { label: config.labels.manualSave,   click: ()=>saveSave(true),        accelerator: config.keybinds.manualSave },
    /*
    { type: "separator" },
    { label: config.labels.openState,    click: openState,                 accelerator: config.keybinds.openState },
    { label: config.labels.saveState,    click: saveState,                 accelerator: config.keybinds.saveState },
    */
    { type: "separator" },
    { label: config.labels.size, submenu: [
      ...config.setSizes.map((e, i) => ({
        label: config.labels.scale.replace(/\$S/g, e+"").replace(/\$I/g, i+"").replace(/\$O/g, i+1+""),
        click: () => {
          window_.setFullScreen(false);
          window_.unmaximize();
          window_.setSize(calcWidth(e), calcHeight(e));
        },
        accelerator: config.keybinds.scale.replace(/\$S/g, e+"").replace(/\$I/g, i+"").replace(/\$O/g, i+1+""),
      })),
    ] },
    { type: "separator" },
    { label: config.labels.info, click: infoDialog, accelerator: config.keybinds.info },
    { label: config.labels.exit, click: () => { electron.app.quit(); }, accelerator: config.keybinds.exit },
  ] },
];
zz(menu);
window_.loadFile(gFile("index.html"));
// open dev tools for debugging
// window_.webContents.openDevTools();
// quit on window close, mac is confusing
electron.app.on("window-all-closed", () => {
  if (process.platform != "darwin") electron.app.quit();
});
console.log("Ready");
if (typeof config.discord_rpc == "string") {
  rpc = require("./rpc.js");
  try {
    await rpc.startRPC(config.discord_rpc);
    isRPC = true;
  } catch (err) {
    // console.error("failed loading rpc", err);
    // really doesn't matter if rpc fails lol
  }
} else if (config.discord_rpc != null) {
  console.error("discord_rpc is not string, ignoring");
}
})().catch(err => { console.error(err); process.exit(); });
