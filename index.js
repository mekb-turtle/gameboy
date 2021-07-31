(async()=>{
if (require.main !== module) {
  console.error(`You are not meant to call require this script`);
  return;
}
const electron = require("electron");
if (typeof electron == "string") {
  console.error("not running on electron, starting electron...");
  var e = require("child_process").spawn(electron, ["."]);
  e.stdout.on("data", data => process.stdout.write(data));
  e.stderr.on("data", data => process.stderr.write(data));
  return;
}
console.log("Loading...");
const path = require("path");
await electron.app.whenReady();
const calcWidth  = scaling => 160*scaling;
const calcHeight = scaling => 144*scaling+25+16;
var theme = electron.nativeTheme.shouldUseDarkColors || electron.nativeTheme.shouldUseInvertedColorScheme || electron.nativeTheme.shouldUseHighContrastColors;
const window_ = new electron.BrowserWindow({
  width:     calcWidth(2),
  height:    calcHeight(2),
  minWidth:  calcWidth(1),
  minHeight: calcHeight(1),
  title: "meGB",
  webPreferences: {
    preload: path.join(__dirname, "preload.js")
  },
});
window_.setBackgroundColor("#121216");
const zErr = (err) => {
  console.error(err);
  electron.dialog.showErrorBox(typeof err == "string" ? err : err.name || "Error", typeof err == "string" ? "" : err.stack || err.toString());
}
const zz = (m) => electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate(m));
var menu = [];
const zzz = (p) => { menu[0].submenu[menu[0].submenu.map(e => e.label == "Pause" || e.label == "Resume").indexOf(true)].label = p ? "Resume" : "Pause"; zz(menu); };
var { openRom, closeRom, rebootRom, openState, saveState, togglePaused, frameAdvance, saveSave, setAutosave }
  = require("./gb.js")(electron, window_, zErr, zzz);
const infoDialog = () => {
  electron.dialog.showMessageBox(window_, {
    message: `meGB
Made by mekb the turtle
Uses serverboy package by Daniel Shumway`
  });
};
window_.webContents.send("theme", theme);
menu = [
  {
    label: "File",
    submenu: [
      { label: "Open ROM file",       click: openRom,                     accelerator: "CmdOrCtrl+Shift+O" },
      { type: "separator" },
      { label: "Reboot ROM",          click: rebootRom,                   accelerator: "CmdOrCtrl+R" },
      { label: "Close ROM",           click: closeRom,                    accelerator: "CmdOrCtrl+W" },
      { type: "separator" },
      { label: "Auto save",           click: m=>setAutosave(m.checked),   accelerator: "CmdOrCtrl+Shift+S", checked: true, type: "checkbox" },
      { label: "Manual save file",    click: ()=>saveSave(true),          accelerator: "CmdOrCtrl+S" },
      { type: "separator" },
      { label: "Pause",               click: togglePaused,               accelerator: "Space" },
      { label: "Frame advance",       click: frameAdvance,                accelerator: "\\" },
      { type: "separator" },
      { label: "Open state file",     click: openState,                   accelerator: "CmdOrCtrl+I" },
      { label: "Save state file",     click: saveState,                   accelerator: "CmdOrCtrl+D" },
    ]
  },
  {
    label: "Size",
    submenu: [
      ...[1, 2, 4, 6].map((e, i) => ({
        label: `${e}x`,
        click: () => {
          window_.setFullScreen(false);
          window_.unmaximize();
          window_.setSize(calcWidth(e), calcHeight(e));
        },
        accelerator: "Shift+" + (i + 1)
      }))
    ]
  },
  {
    label: "Info",
    submenu: [
      { label: "Info",                click: infoDialog,   accelerator: "F1" },
      { label: "Exit",                click: () => { electron.app.quit(); } },
    ]
  },
];
zz(menu);
window_.loadFile(path.join(__dirname, "index.html"));
//window_.webContents.openDevTools();
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
})
console.log("Ready");
})().catch(err => { console.error(err); process.exit(); });
