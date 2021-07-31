if (require.main === module) {
  console.error(`You are not meant to call ${require("path").basename(__filename)} directly`);
  return;
}
module.exports = (electron, window_, zErr) => {
  const crypto = require("crypto");
  const cloneBuffer = require("clone-buffer");
  const fs = require("fs").promises;
  const fps = 60 * 2;
  var rom;
  var save;
  var romHash;
  var saveFileName;
  var saving = false;
  var canSave = false;
  const wait = () => new Promise(r => setTimeout(r, 100));
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
    var s = false;
    while (saving) {
      s = true;
      await wait();
    }
    if (!s) {
      await saveSave();
    }
  };
  const getPrivate = () => {
    return gameboy[Object.keys(gameboy).filter(e => e.startsWith("_"))[0]];
  };
  const isAllowedFile = (file) => {
    if (file.length < romHash.length) return false;
    for (var i = 0; i < romHash.length; ++i) {
      if (romHash[i] != file[i]) return false;
    }
    return file.slice(romHash.length);
  };
  const openRom = async () => {
    saveBeforeUnload();
    electron.dialog.showOpenDialog(window_, {
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
        var cHash = () => {
          romHash = Buffer.concat([
            Buffer.from("meGBhash"),
            crypto.createHash("sha256").update(rom).digest(),
            Buffer.from("_"),
          ]);
        }
        save = null;
        canSave = false;
        rom = fileData;
        cHash();
        rom = null;
        if (gameboy) getPrivate().shutdownEmulation();
        var z = (s) => {
          try {
            canSave = false;
            gameboy = new Gameboy();
            if (s) gameboy.loadRom(fileData, s);
            else gameboy.loadRom(fileData, s);
            rom = null;
            save = null;
            var p = getPrivate();
            if (!p || !p?.gameboy || !p?.gameboy?.mbctype || p?.gameboy?.mbctype == "Unknown") {
              romHash = null;
              p.shutdownEmulation();
              gameboy = new Gameboy();
              zErr("Invalid ROM");
            } else {
              if (s) save = s;
              rom = fileData;
              cHash();
            }
          } catch (err) {
            zErr(err);
          }
        };
        saveFileName = res.filePaths[0]+".sav";
        fs.stat(saveFileName).then((stat)=>{
          fs.readFile(saveFileName).then(saveFileData => {
            var d = isAllowedFile(saveFileData);
            if (!d) {
              electron.dialog.showMessageBox(window_, {
                type: "error",
                message: "Invalid save file or wrong ROM loaded"
              });
              z();
            } else {
              z(d);
            }
          }).catch(err => zErr(err));
        }).catch(err => z());
      }).catch(err => zErr(err));
    });
  };
  const isExperimental = () => {
    electron.dialog.showMessageBox(window_, {
      type: "error",
      message: "This feature is experimental, you cannot use it yet"
    });
    return false;
  };
  const closeRom = async () => {
    if (checkIfRom(true)) return;
    saveBeforeUnload();
    getPrivate().shutdownEmulation();
    canSave = false;
    gameboy = null;
    rom = null;
    save = null;
  };
  const rebootRom = async () => {
    if (checkIfRom(true)) return;
    saveBeforeUnload();
    getPrivate().shutdownEmulation();
    canSave = false;
    try {
      gameboy = new Gameboy();
      if (save) gameboy.loadRom(rom, save);
      else gameboy.loadRom(rom);
    } catch (err) {
      zErr(err);
    }
  };
  const exists = async path => {
    try {
      await fs.stat(path);
      return true;
    } catch {
      return false;
    }
  };
  var autosave = true;
  const setAutosave = e => autosave = e;
  var lastSave;
  const saveSave = async (isManual) => {
    if (!(autosave || isManual)) return;
    if (saving) return;
    if (!canSave) return;
    if (checkIfRom(true)) return;
    var saveS = gameboy.getSaveData();
    var saveFile = Buffer.concat([romHash, Buffer.from(saveS)]);
    if (lastSave != null && !isManual)
      if (Buffer.compare(saveFile, lastSave) === 0) return;
    saving = true;
    canSave = false;
    if (await exists(saveFileName))
      await fs.copyFile(saveFileName, saveFileName + ".bak").catch(e=>zErr(e));
    await fs.writeFile(saveFileName, saveFile).catch(e=>{ zErr(e); saving=false; });
    save = saveS;
    lastSave = cloneBuffer(saveFile);
    saving = false;
    saveDisplayTime = fps;
  };
  const openState = async () => {
    if (!isExperimental()) return;
    if (checkIfRom()) return;
    saveBeforeUnload();
    electron.dialog.showOpenDialog(window_, {
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
          canSave = false;
          //TODO: load state
        } else {
          electron.dialog.showMessageBox(window_, {
            type: "error",
            message: "Invalid save state file or wrong ROM file",
          });
        }
      }).catch(err => zErr(err));
    });
  };
  const saveState = async () => {
    if (!isExperimental()) return;
    if (checkIfRom()) return;
    saveBeforeUnload();
    canSave = false;
    var mem = gameboy.getMemory();
    var stateFile = Buffer.concat([romHash, Buffer.from(mem)]);
    if (!stateFile) return;
    electron.dialog.showSaveDialog(window_, {
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
      fs.writeFile(res.filePath, stateFile).then(() => {}).catch(err => zErr(err));
    });
  };
  var buttonsDown = {
    A: false, B: false,
    START: false, SELECT: false,
    UP: false, DOWN: false, LEFT: false, RIGHT: false,
  };
  electron.ipcMain.handle("quitgame", async (event) => {
    saveBeforeUnload();
    electron.app.quit();
    process.exit();
  });
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
    canSave = true;
  };
  var saveDisplayTime = 0;
  const sendFrame = () => {
    var scr;
    if (rom) scr = gameboy.getScreen();
    try {
      window_.webContents.send("rendergb", scr);
    } catch {}
    var name = "";
    try {
      var p = getPrivate()?.gameboy;
      name = p?.name?`${p?.name}${p?.gameCode?`${p?.gameCode}`:""}`:"";
    } catch {}
    if (saveDisplayTime > 0) --saveDisplayTime;
    try {
      window_.webContents.send("details", `${rom?(paused?`Paused`:`Playing`):``} ${name}${saving?" - Saving":(saveDisplayTime>0?" - Saved":"")}`);
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
  setInterval(async () => {
    await saveSave();
  }, Math.floor(10e3));
  const togglePaused = () => {
    if (checkIfRom(true)) return;
    paused = !paused;
  };
  const frameAdvance = () => {
    if (checkIfRom(true)) return;
    if (!paused) {
      paused = true;
      return;
    }
    frame();
    sendFrame();
  };
  return { openRom, closeRom, rebootRom, openState, saveState, togglePaused, frameAdvance, saveSave, setAutosave };
};
