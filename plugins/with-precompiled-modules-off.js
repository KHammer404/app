const { withPodfileProperties } = require("@expo/config-plugins");

/** Precompiled ExpoModulesWorklets expects React.framework, which this app does not embed. */
module.exports = function withPrecompiledModulesOff(config) {
  return withPodfileProperties(config, (mod) => {
    mod.modResults.EXPO_USE_PRECOMPILED_MODULES = "false";
    return mod;
  });
};
