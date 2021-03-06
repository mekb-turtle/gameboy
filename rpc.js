if (require.main === module) {
	console.error(`You are not meant to call rpc.js directly`);
	return;
}
const RPC = require("discord-rpc");
const client = new RPC.Client({ transport: "ipc" });
var data = {};
var ended = false;
module.exports = {
	async updateActivity() {
		var d = data.rom_name || data.details_text || undefined;
		if (typeof d == "string")
			while (d.length < 2) d += "\u200b"; // min length is two
			return await client.setActivity(ended ? {
				instance: false,
			} : {
				details: d,
				state: undefined,
				largeImageKey: (data.is_rom ? data.on_icon : data.off_icon) || undefined,
				largeImageText: data.icon_label || undefined,
				smallImageKey: (data.is_rom ? (data.paused ? data.small_paused_icon : data.small_playing_icon) : undefined) || undefined,
				smallImageText: (data.is_rom ? (data.paused ? data.small_paused_icon_label : data.small_playing_icon_label) : undefined) || undefined,
				startTimestamp: data.start_timestamp || undefined,
				instance: false,
			});
	},
	end() {
		ended = true;
	},
	async startRPC() {
		await client.login({ clientId: data.id });
		setInterval(module.exports.updateActivity, 100);
	},
	set(t) {
		data = {...data, ...t};
	},
};
