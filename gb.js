if (require.main === module) {
  console.error(`You are not meant to call ${require("path").basename(__filename)} directly`);
  return;
}
module.exports = (electron, window, zErr, heightExtra) => {
  const crypto = require("crypto");
  const fs = require("fs").promises;
  const fps = 60 * 2;
  var rom;
  var save;
  var romHash;
  const Gameboy = require("serverboy");
  var gameboy;
  const checkIfRom = (dontShowDialog) => {
    if (!rom || !gameboy) {
      if (!dontShowDialog)
        electron.dialog.showMessageBox(window, {
          type: "error",
          message: "Open a ROM first",
        });
      return true;
    }
    return false;
  };
  const getPrivate = () => {
    return gameboy[Object.keys(gameboy).filter(e => e.startsWith("_"))[0]];
  };
  const openRom = () => {
    electron.dialog.showOpenDialog(window, {
      properties: ["openFile", "showHiddenFiles"],
      buttonLabel: "Open",
      filters: [
        {name: "Gameboy ROMs (gb, gbc)", extensions: ["gb", "gbc"]},
        {name: "All", extensions: ["*"]},
      ],
      title: "Open ROM"
    }).then(res => {
      if (res.canceled) return;
      if (res.filePaths.length != 1) return;
      fs.readFile(res.filePaths[0]).then(fileData => {
        rom = null;
        save = null;
        if (gameboy) getPrivate().shutdownEmulation();
        try {
          gameboy = new Gameboy();
          gameboy.loadRom(fileData);
          if (getPrivate().gameboy.mbctype == "Unknown") {
            getPrivate().shutdownEmulation();
            gameboy = new Gameboy();
            zErr("Invalid ROM");
          } else {
            rom = fileData;
            romHash = Buffer.concat([
              Buffer.from("meGBhash"),
              crypto.createHash("sha256").update(rom).digest(),
              Buffer.from("_"),
            ]);
            save = null;
          }
        } catch (err) {
          zErr(err);
        }
      }).catch(err => zErr(err));
    });
  };
  const isExperimental = () => {
    if (true) {
      electron.dialog.showMessageBox(window, {
        type: "error",
        message: "This feature is experimental, you cannot use it yet"
      })
      return false;
    } else {
      return true;
    }
  };
  const closeRom = () => {
    if (checkIfRom(true)) return;
    var name = "";
    try {
      var p = getPrivate()?.gameboy;
      name = " "+(p?.name?`${p?.name}${p?.gameCode?`${p?.gameCode}`:""}`:"");
    } catch {}
    electron.dialog.showMessageBox(window, {
      message: `Confirm close ROM${name}${rom?" with save loaded":""}?`,
      buttons: [ "Cancel", "Close" ]
    }).then(res => {
      if (res?.response == 1) {
        if (gameboy) getPrivate().shutdownEmulation();
        gameboy = null;
        rom = null;
        save = null;
      }
    });
  };
  const rebootRom = () => {
    if (checkIfRom(true)) return;
    var name = "";
    try {
      var p = getPrivate()?.gameboy;
      name = " "+(p?.name?`${p?.name}${p?.gameCode?`${p?.gameCode}`:""}`:"");
    } catch {}
    electron.dialog.showMessageBox(window, {
      message: `Confirm reboot ROM${name}${rom?" with save loaded":""}?`,
      buttons: [ "Cancel", "Reboot" ]
    }).then(res => {
      if (res?.response == 1) {
        if (gameboy) getPrivate().shutdownEmulation();
        try {
          gameboy = new Gameboy();
          if (save) gameboy.loadRom(rom, save);
          else gameboy.loadRom(rom);
        } catch (err) {
          zErr(err);
        }
      }
    });
  };
  const isAllowedFile = (file) => {
    if (file.length < romHash.length) return false;
    for (var i = 0; i < romHash.length; ++i) {
      if (romHash[i] != file[i]) return false;
    }
    return file.slice(romHash.length);
  };
  const openSave = () => {
    if (checkIfRom()) return;
    electron.dialog.showOpenDialog(window, {
      properties: ["openFile", "showHiddenFiles"],
      buttonLabel: "Open",
      filters: [
        {name: "Save data file (sav, mgbs)", extensions: ["sav", "mgbs"]},
        {name: "All", extensions: ["*"]},
      ],
      title: "Open save data file"
    }).then(res => {
      if (res.canceled) return;
      if (res.filePaths.length != 1) return;
      fs.readFile(res.filePaths[0]).then(fileData => {
        var data = isAllowedFile(fileData);
        if (data) {
          save = data;
          if (gameboy) getPrivate().shutdownEmulation();
          try {
            gameboy = new Gameboy();
            gameboy.loadRom(rom, save);
          } catch (err) {
            zErr(err);
          }
        } else {
          electron.dialog.showMessageBox(window, {
            type: "error",
            message: "Invalid save file or wrong ROM file",
          });
        }
      }).catch(err => zErr(err));
    });
  };
  const openState = () => {
    if (!isExperimental()) return;
    if (checkIfRom()) return;
    console.log(getPrivate())
    electron.dialog.showOpenDialog(window, {
      properties: ["openFile", "showHiddenFiles"],
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
          //TODO: load state
        } else {
          electron.dialog.showMessageBox(window, {
            type: "error",
            message: "Invalid save state file or wrong ROM file",
          });
        }
      }).catch(err => zErr(err));
    });
  };
  const saveSave = () => {
    if (checkIfRom()) return;
    var save = gameboy.getSaveData();
    var saveFile = Buffer.concat([romHash, Buffer.from(save)]);
    if (!saveFile) return;
    electron.dialog.showSaveDialog(window, {
      properties: ["createDirectory", "showHiddenFiles"],
      buttonLabel: "Save",
      filters: [
        {name: "Save data file (sav, mgbs)", extensions: ["sav", "mgbs"]},
        {name: "All", extensions: ["*"]},
      ],
      title: "Save save data file"
    }).then(res => {
      if (res.canceled) return;
      if (!res.filePath) return;
      fs.writeFile(res.filePath, saveFile).then(() => { console.log("written save file to "+res.filePath); }).catch(err => zErr(err));
    });
  };
  const saveState = () => {
    if (!isExperimental()) return;
    if (checkIfRom()) return;
    var mem = gameboy.getMemory();
    var stateFile = Buffer.concat([romHash, Buffer.from(mem)]);
    console.log(stateFile);
    if (!stateFile) return;
    electron.dialog.showSaveDialog(window, {
      properties: ["createDirectory", "showHiddenFiles"],
      buttonLabel: "Save",
      filters: [
        {name: "Save state file (st, mgbst)", extensions: ["st", "mgbst"]},
        {name: "All", extensions: ["*"]},
      ],
      title: "Save save state file"
    }).then(res => {
      if (res.canceled) return;
      if (!res.filePath) return;
      fs.writeFile(res.filePath, stateFile).then(() => { console.log("written state file to "+res.filePath); }).catch(err => zErr(err));
    });
  };
  var buttonsDown = {
    A: false, B: false,
    START: false, SELECT: false,
    UP: false, DOWN: false, LEFT: false, RIGHT: false,
  };
  electron.ipcMain.handle("buttonpress", (event, o) => {
    if (!o.button) return;
    if (typeof o.button != "string") return;
    if (!buttonsDown.hasOwnProperty(o.button)) return;
    if (typeof o.press != "boolean") return;
    buttonsDown[o.button] = o.press;
  });
  const frame = () => {
    if (!rom) return;
    gameboy.pressKeys(Object.keys(buttonsDown).filter(e => buttonsDown[e]).map(e => Gameboy.KEYMAP[e]));
    gameboy.doFrame();
  };
  const sendFrame = () => {
    var screen;
    if (rom) screen = gameboy.getScreen();
    try {
      window.webContents.send("rendergb", screen);
    } catch {}
    var name = "";
    try {
      var p = getPrivate()?.gameboy;
      name = p?.name?`${p?.name}${p?.gameCode?`${p?.gameCode}`:""}`:"";
    } catch {}
    try {
      window.webContents.send("details", `${rom?(paused?`Paused`:`Playing`):`ROM not loaded`} ${name}`);
    } catch {}
  };
  var paused = false;
  setInterval(() => {
    if (paused) return;
    frame();
  }, Math.floor(1e3/fps));
  setInterval(() => {
    sendFrame();
  }, Math.floor(1e3/fps));
  const togglePaused = () => {
    if (checkIfRom(true)) return;
    paused = !paused;
  };
  const frameAdvance = () => {
    if (checkIfRom(true)) return;
    if (!paused) return;
    frame();
    sendFrame();
  };
  const scalingFunc = (e) => {

  };
  return {
    checkIfRom, getPrivate, openRom, isExperimental, closeRom, rebootRom, isAllowedFile,
    openSave, openState, saveSave, saveState, frame,
    sendFrame, togglePaused, frameAdvance, scalingFunc };
};
