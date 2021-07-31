const { ipcRenderer } = require("electron");
window.addEventListener("DOMContentLoaded", () => {
  var c = document.getElementById("canvas");
  var d = document.getElementById("details");
  var g = c.getContext("2d");
  var s;
  ipcRenderer.on("details", (e, text) => {
    d.innerText = text;
  });
  ipcRenderer.on("rendergb", (e, scr) => {
    s = scr;
  });
  ipcRenderer.on("theme", (e, theme) => {
    if (!theme) {
      var z = document.getElementById("s");
      z.innerText = z.innerText.replace(/121216/g,"EEEEEEREPLACE").replace(/ffffff/g,"121216").replace(/EEEEEEREPLACE/g,"ffffff");
    }
  });
  window.onbeforeunload = e => {
    ipcRenderer.invoke("quitgame");
    return false;
  };
  var keybinds = {
    "ArrowLeft": "LEFT",
    "ArrowRight": "RIGHT",
    "ArrowUp": "UP",
    "ArrowDown": "DOWN",
    "KeyA": "LEFT",
    "KeyD": "RIGHT",
    "KeyW": "UP",
    "KeyS": "DOWN",
    "KeyJ": "LEFT",
    "KeyL": "RIGHT",
    "KeyI": "UP",
    "KeyK": "DOWN",
    "Numpad5": "A",
    "Numpad6": "B",
    "KeyZ": "A",
    "KeyX": "B",
    "ShiftLeft": "SELECT",
    "Quote": "SELECT",
    "KeyP": "START",
    "Enter": "START",
    "Comma": "A",
    "Period": "B",
  }
  var keysDown = {};
  ["keydown", "keyup"].forEach(ev => document.body.addEventListener(ev, e => {
    //if (e.shiftKey) return;
    if (e.metaKey) return;
    if (e.ctrlKey) return;
    if (e.altKey) return;
    if (!keybinds.hasOwnProperty(e.code)) return;
    e.preventDefault();
    keysDown[e.code] = e.type == "keydown";
    var o = {
      press: Object.keys(keysDown).filter(z => keysDown[z] && keybinds[z] == keybinds[e.code]).length > 0,
      button: keybinds[e.code]
    };
    ipcRenderer.invoke("buttonpress", o);
  }));
  const render = () => {
    g.clearRect(0, 0, c.width, c.height);
    if (s) {
      var im = g.createImageData(160, 144);
      for (var i = 0; i < s.length; i++) {
        im.data[i] = s[i];
      }
      g.putImageData(im, 0, 0);
    }
    window.requestAnimationFrame(render);
  };
  window.requestAnimationFrame(render);
});
