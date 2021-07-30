(async()=>{
if (require.main !== module) {
  console.error(`You are not meant to call require this script`);
  return;
}
const electron = require("electron");
if (typeof electron == "string") {
  console.log("not running on electron, starting electron...");
  var e = require("child_process").spawn(electron, ["."]);
  e.stdout.on('data', data => {
    process.stdout.write(data);
  });
  e.stderr.on('data', data => {
    process.stderr.write(data);
  });
  return;
}
console.log("Loading...");
const path = require("path");
await electron.app.whenReady();
const heightExtra = 25+16;
const window = new electron.BrowserWindow({
  width: 160*2,
  height: 144*2+heightExtra,
  minWidth: 160,
  minHeight: 144+heightExtra,
  webPreferences: {
    preload: path.join(__dirname, "preload.js")
  },
});
window.setBackgroundColor("#121216");
const zErr = (err) => {
  console.error(err);
  electron.dialog.showErrorBox(typeof err == "string" ? err : err.name || "Error", typeof err == "string" ? "" : err.stack || err.toString());
}
const {
  checkIfRom, getPrivate, openRom, isExperimental, closeRom, rebootRom, isAllowedFile,
  openSave, openState, saveSave, saveState, frame,
  sendFrame, togglePaused, frameAdvance, scalingFunc }
  = require("./gb.js")(electron, window, zErr, heightExtra);
const infoDialog = () => {
  electron.dialog.showMessageBox(window, {
    message: `meGB
Made by mekb the turtle
Uses serverboy package by Daniel Shumway`
  });
};
const menu = electron.Menu.buildFromTemplate([
  {
    label: "File",
    submenu: [
      { label: "Open ROM file",       click: openRom,      accelerator: "CmdOrCtrl+Shift+O" },
      { label: "Reboot ROM",          click: rebootRom,    accelerator: "CmdOrCtrl+R" },
      { label: "Close ROM",           click: closeRom,     accelerator: "CmdOrCtrl+Shift+R" },
      { type: "separator" },
      { label: "Open save data file", click: openSave,     accelerator: "CmdOrCtrl+O" },
      { label: "Save save data file", click: saveSave,     accelerator: "CmdOrCtrl+S" },
      { type: "separator" },
      { label: "Open state file",     click: openState,    accelerator: "CmdOrCtrl+I" },
      { label: "Save state file",     click: saveState,    accelerator: "CmdOrCtrl+D" },
    ]
  },
  {
    label: "Emulation",
    submenu: [
      { label: "Pause/Resume",        click: togglePaused, accelerator: "Space" },
      { label: "Frame advance",       click: frameAdvance, accelerator: "\\" },
    ]
  },
  {
    label: "Scaling",
    submenu: [1, 2, 4, 6].map((e, i) => ({
      label: e + "x",
      click: scalingFunc(e),
      accelerator: "Shift+" + (i + 1)
    })),
  },
  {
    label: "Info",
    submenu: [
      { label: "Info",                click: infoDialog,   accelerator: "F1" },
      { label: "Exit",                click: () => { electron.app.quit(); } },
    ]
  },
]);
electron.Menu.setApplicationMenu(menu);
window.loadFile(path.join(__dirname, "index.html"));
window.webContents.openDevTools();
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
})
console.log("Ready");
})().catch(err => { console.error(err); process.exit(); });
