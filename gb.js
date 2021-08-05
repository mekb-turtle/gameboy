if (require.main === module) {
  console.error(`You are not meant to call ${require("path").basename(__filename)} directly`); return;
}
module.exports = (electron, window_, zErr, zzz, windowTitle, { setRPCDetailsText, setRPCStateText, setRPCIcon, setRPCStartTimestamp, updateRPC }, setOnIcon, exists) => {
  const crypto = require("crypto");
  const cloneBuffer = require("clone-buffer");
  const fs = require("fs").promises;
  const fps = 60 * 2;
  // Date object when user loaded rom
  var startTimestamp;
  var rom;
  var save;
  var romHash;
  var saveFileName;
  var saving = false;
  var canSave = false;
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
      await new Promise(r => setTimeout(r, 50)); // will wait 50 ms
    }
    if (!s) {
      await saveSave();
    }
  };
  const getPrivate = () => {
    // gets private serverboy data like rom name
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
  // valid cartridge types for checking if
  // file is actually a valid gameboy rom file
  const validCartridgeTypes = [0x00,0x01,0x02,0x03,0x05,0x06,0x08,0x09,0x0B,
    0x0C,0x0D,0x0F,0x10,0x11,0x12,0x13,0x19,0x1A,0x1B,0x1C,0x1D,
    0x1E,0x1F,0x22,0xFD,0xFE,0xFF];
  const updateTitle = () => {
    var e = getRomName();
    var t = `${windowTitle}${e?` - ${e}`:``}`;
    window_.setTitle(t);
  };
  updateTitle();
  const openRom = async () => {
    await saveBeforeUnload();
    electron.dialog.showOpenDialog(window_, {
      properties: ["openFile"],
      buttonLabel: "Open",
      filters: [
        {name: "Gameboy ROMs (gb, gbc)", extensions: ["gb", "gbc"]},
        {name: "All", extensions: ["*"]},
      ],
      title: "Open ROM"
    }).then(async res => {
      if (res.canceled) return;
      if (res.filePaths.length != 1) return;
      fs.readFile(res.filePaths[0]).then(async fileData => {
        var cHash = () => {
          romHash = Buffer.concat([
            Buffer.from("romhash_"),
            crypto.createHash("sha256").update(rom).digest(),
            Buffer.from("_"),
          ]);
        }
        save = null;
        canSave = false;
        rom = fileData;
        cHash();
        rom = null;
        startTimestamp = null;
        updateTitle();
        if (gameboy) getPrivate()?.shutdownEmulation();
        // loads rom and save file from s argument, see below this function
        var z = (s) => {
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
            } else {
              // kills gameboy if invalid rom or error loading the rom
              if (p) p.shutdownEmulation();
              romHash = null;
              gameboy = null;
              rom = null;
              startTimestamp = null;
              save = null;
              updateTitle();
              zErr("Invalid ROM");
            }
          } catch (err) {
            // kills gameboy
            romHash = null;
            gameboy = null;
            rom = null;
            save = null;
            updateTitle();
            zErr(err);
          }
        };
        saveFileName = res.filePaths[0]+".sav";
        if (await exists(saveFileName)) {
          fs.readFile(saveFileName).then(saveFileData => {
            var d = isAllowedFile(saveFileData);
            if (d) {
              z(d);
            } else {
              electron.dialog.showMessageBox(window_, {
                type: "error",
                message: "Invalid save file or wrong ROM loaded"
              });
              z();
            }
          }).catch(err => zErr(err));
        } else {
          z();
        }
      }).catch(err => zErr(err));
    });
  };
  const isExperimental = () => {
    // alerts that feature is experimental
    electron.dialog.showMessageBox(window_, {
      type: "error",
      message: "This feature is experimental, you cannot use it yet"
    });
    return false;
  };
  const closeRom = async () => {
    if (checkIfRom(true)) return;
    await saveBeforeUnload();
    // kills gameboy
    getPrivate().shutdownEmulation();
    canSave = false;
    gameboy = null;
    rom = null;
    save = null;
    startTimestamp = null;
    updateTitle();
  };
  const rebootRom = async () => {
    if (checkIfRom(true)) return;
    await saveBeforeUnload();
    // restarts gameboy, shouldn't error unless save or rom variable
    // was somehow changed without openRom
    getPrivate().shutdownEmulation();
    canSave = false;
    try {
      gameboy = new Gameboy();
      startTimestamp = new Date();
      if (save) gameboy.loadRom(rom, save);
      else gameboy.loadRom(rom);
    } catch (err) {
      zErr(err);
    }
    updateTitle();
  };
  var autosave = true;
  const setAutosave = e => autosave = e;
  var lastSave;
  const saveSave = async (isManual) => {
    // annoying code
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
      await fs.copyFile(saveFileName, saveFileName + ".bak").catch(e=>zErr(e));
    await fs.writeFile(saveFileName, saveFile).catch(e=>{ zErr(e); saving=false; });
    // important to set save variable otherwise rebootRom will load save
    // from what was read in openRom not actual current save file
    save = saveS;
    // have to import a whole package just to check if nothing changed
    // i can't figure out how to clone a buffer normally
    lastSave = cloneBuffer(saveFile);
    saving = false;
    saveDisplayTime = fps;
  };
  const openState = async () => {
    // not done yet, serverboy's setMemory function is experimental
    if (!isExperimental()) return;
    if (checkIfRom()) return;
    await saveBeforeUnload();
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
      }).catch(err => zErr(err));
    });
  };
  const saveState = async () => {
    // serverboy's getMemory works i think but setMemory doesn't
    if (!isExperimental()) return;
    if (checkIfRom()) return;
    await saveBeforeUnload();
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
      fs.writeFile(res.filePath, stateFile).then(() => {}).catch(err => zErr(err));
    });
  };
  // store input buttons
  var buttonsDown = {
    A: false, B: false,
    START: false, SELECT: false,
    UP: false, DOWN: false, LEFT: false, RIGHT: false,
  };
  electron.ipcMain.handle("quitgame", async (event) => {
    // quit game is sent when unload in preload.js
    // this is ran when the user closes the window
    // make sure to save the game
    await saveBeforeUnload();
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
    updateRPC();
    updateTitle();
    // idk if app.quit is necessary
    electron.app.quit();
    // forcefully exit without calling unload otherwise infinite recursion
    // and user won't be able to exit
    process.exit();
  });
  electron.ipcMain.handle("buttonpress", (event, o) => {
    if (!o.button) return;
    // make sure o variable is valid
    if (typeof o.button != "string") return;
    if (!buttonsDown.hasOwnProperty(o.button)) return;
    if (typeof o.press != "boolean") return;
    // handle button press
    buttonsDown[o.button] = o.press;
  });
  const frame = () => {
    if (!rom) return;
    // probably one of the most important functions
    // to actually frame advance
    // press input from buttonsDown
    gameboy.pressKeys(Object.keys(buttonsDown).filter(e => buttonsDown[e]).map(e => Gameboy.KEYMAP[e]));
    gameboy.doFrame();
    // enable autosave again
    // shouldn't keep autosaving while paused as gameboy can't change
    // save data while paused
    canSave = true;
  };
  // shows Saved text because saving is too quick for the user to see
  var saveDisplayTime = 0;
  // show how many frames has gameboy been running for
  const showFrameCount = false;
  // send the screen data and details to the preload.js
  const sendFrame = () => {
    var scr;
    if (rom) scr = gameboy.getScreen();
    try {
      window_.webContents.send("rendergb", scr);
    } catch {}
  };
  const sendInfo = () => {
    var name = getRomName();
    if (saveDisplayTime > 0) --saveDisplayTime;
    try {
      setRPCDetailsText(rom ? (paused ? "Paused" : "Playing") : "");
      setRPCStateText(rom ? name + "" : "");
      setRPCIcon(rom);
      setRPCStartTimestamp(startTimestamp);
    } catch {}
    try {
      setOnIcon(rom);
    } catch {}
    try {
      window_.webContents.send("details", rom ? (
        `${paused?`Paused`:`Playing`} ${name}${showFrameCount ? (" - "+getPrivate().frames.toString().padStart(6,0)) : ""
          }${saving?" - Saving":(saveDisplayTime>0?" - Saved":"")}`
      ) : "");
    } catch {}
  };
  var paused = false;
  var canFrameAdvance = true;
  // intervals
  setInterval(() => {
    // interval for frame advancing while not paused
    // can't frame advance faster than normal playing speed
    canFrameAdvance = true;
    if (paused) return;
    frame();
  }, Math.floor(1e3/fps));
  setInterval(() => {
    // interval for sendFrame
    sendFrame();
  }, Math.floor(1e3/fps));
  setInterval(() => {
    sendInfo();
  }, Math.floor(100));
  setInterval(async () => {
    // interval for autosaving
    await saveSave();
  }, Math.floor(10e3));
  const togglePaused = () => {
    // self explanatory
    paused = !paused;
    zzz(paused);
  };
  const frameAdvance = () => {
    if (!paused) {
      // pause if not paused
      paused = true;
      // doesn't really make a difference if you did another frame advance
      // right before pausing
      return;
    }
    if (!canFrameAdvance) return;
    // update pause/resume button's label
    zzz(paused);
    if (checkIfRom(true)) return;
    frame();
    sendFrame();
    canFrameAdvance = false;
  };
  return { openRom, closeRom, rebootRom, openState, saveState, togglePaused, frameAdvance, saveSave, setAutosave };
};
