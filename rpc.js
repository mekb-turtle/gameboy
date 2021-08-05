if (require.main === module) {
  console.error(`You are not meant to call ${require("path").basename(__filename)} directly`); return;
}
const RPC = require("discord-rpc");
const client = new RPC.Client({ transport: "ipc" });
var startTimestamp;
var detailsText;
var stateText;
var isIconOn;
var startTimestamp;
var gameboyIcon;
var gameboyOnIcon;
module.exports = {
  async updateActivity() {
    return await client.setActivity({
      details: detailsText || undefined,
      state: stateText || undefined,
      startTimestamp: startTimestamp || undefined,
      largeImageKey: isIconOn ? gameboyOnIcon || undefined : gameboyIcon || undefined,
      largeImageText: "meGB",
      instance: false,
    });
  },
  async startRPC(clientId, gbIcon, gbOnIcon) {
    gameboyIcon = gbIcon;
    gameboyOnIcon = gbOnIcon;
    await client.login({ clientId });
    setInterval(module.exports.updateActivity, 100);
  },
  setDetailsText(t) {
    detailsText = t;
  },
  setStateText(t) {
    stateText = t;
  },
  setIcon(t) {
    isIconOn = !!t;
  },
  setStartTimestamp(t) {
    startTimestamp = t;
  },
};
