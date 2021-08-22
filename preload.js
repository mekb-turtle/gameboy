const { ipcRenderer } = require("electron");
// set volume
var vol = 1;
var alreadyLoaded = false;
window.addEventListener("DOMContentLoaded", () => {
  // prevent running this code twice
  if (alreadyLoaded) return;
  alreadyLoaded = true;
  const pcmPlayer = require("pcm-player");
  var player;
  var lastD;
  // receive audio info
  ipcRenderer.once("audioinit", (e, t)=>{
    // don't reset if it's same
    if (lastD === JSON.stringify(t)) return;
    lastD = JSON.stringify(t);
    // destroy the pcm player
    if (player) player.destroy();
    player = null;
    if (t) {
      // new pcm player
      player = new pcmPlayer({
        inputCodec: t.inputCodec,
        channels: t.channels,
        sampleRate: t.sampleRate,
        flushTime: t.flushTime,
      });
      player.volume(vol);
    }
  });
  // stuff
  var c = document.getElementById("canvas");
  var d = document.getElementById("details");
  var g = c.getContext("2d");
  var s;
  ipcRenderer.on("volume", (e, v) => {
    // change volume
    vol = v;
    if (player)
      player.volume(v);
  });
  ipcRenderer.on("audio", (e, v) => {
    // receive audio data
    if (!player) return;
    if (vol > 0)
      player.feed(v);
  });
  ipcRenderer.on("details", (e, text) => {
    // set bottom bar text
    d.innerText = text;
  });
  ipcRenderer.on("rendergb", (e, scr) => {
    // set screen data
    s = scr;
  });
  // receive what theme etc
  ipcRenderer.invoke("sendstuff", true);
  ipcRenderer.once("theme", (e, theme) => {
    // set theme (one time only)
    if (!theme) {
      var z = document.getElementById("s");
      z.innerText = z.innerText.replace(/121216/g,"themereplacer").replace(/ffffff/g,"121216").replace(/themereplacer/g,"ffffff");
    }
  });
  window.onbeforeunload = e => {
    // save game before closing, check gb.js
    try {
      if (player) player.destroy();
      ipcRenderer.invoke("quitgame");
    } catch (err) {
      return true;
    }
    return false;
  };
  var keybinds = {}; // all keybinds
  ipcRenderer.once("buttons", (e, kb) => keybinds = kb); // receive keybinss
  var keysDown = {};
  ["keydown", "keyup"].forEach(ev => document.body.addEventListener(ev, e => {
    // preveny meta, ctrl, and alt
    // if (e.shiftKey) return;
    if (e.metaKey) return;
    if (e.ctrlKey) return;
    if (e.altKey) return;
    if (!keybinds.hasOwnProperty(e.code)) return;
    e.preventDefault();
    // set if the key is down
    keysDown[e.code] = e.type == "keydown";
    var o = {
      // is key down, e.code is stored in keysDown not the actual gameboy button
      // so if you press down two keys that have the same gameboy button and release one
      // it'll stay down because the other is pressed
      press: Object.keys(keysDown).filter(z => keysDown[z] && keybinds[z] == keybinds[e.code]).length > 0,
      button: keybinds[e.code]
    };
    // invoke to gb.js
    ipcRenderer.invoke("buttonpress", o);
  }));
  const render = () => {
    // render the canvas
    g.clearRect(0, 0, c.width, c.height);
    if (s) {
      var im = g.createImageData(160, 144); // gameboy screen resolution is 160x144
      for (var i = 0; i < s.length; i++) {
        im.data[i] = s[i];
      }
      g.putImageData(im, 0, 0);
    }
    // render next monitor refresh thing
    window.requestAnimationFrame(render);
  };
  window.requestAnimationFrame(render);
});
