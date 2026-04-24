const getPlatformModel = require("@core/db/getPlatformModel");
const PlatformConfigDef = require("../platform/models/PlatformConfig");
const PlatformConfig = getPlatformModel(PlatformConfigDef); // There should only be one config document. We find the first one, or create it.
exports.getSettings = async (req, res) => {
  try {
    let config = await PlatformConfig.findOne();
    if (!config) {
      config = await PlatformConfig.create({});
    }
    res.json(config);
  } catch (err) {
    console.error("Error fetching platform settings:", err);
    res.status(500).json({
      message: "Server error fetching platform settings"
    });
  }
};
exports.updateSettings = async (req, res) => {
  try {
    let config = await PlatformConfig.findOne();
    if (!config) {
      config = await PlatformConfig.create(req.body);
    } else {
      // Update existing config
      Object.assign(config, req.body);
      await config.save();
    }
    res.json(config);
  } catch (err) {
    console.error("Error updating platform settings:", err);
    res.status(500).json({
      message: "Server error updating platform settings"
    });
  }
};