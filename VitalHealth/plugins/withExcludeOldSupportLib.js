const { withProjectBuildGradle } = require("@expo/config-plugins");

module.exports = function withExcludeOldSupportLib(config) {
  return withProjectBuildGradle(config, (config) => {
    if (
      !config.modResults.contents.includes("exclude group: 'com.android.support'")
    ) {
      config.modResults.contents = config.modResults.contents.replace(
        /allprojects\s*\{/,
        `allprojects {
    configurations.all {
        exclude group: 'com.android.support', module: 'support-compat'
        exclude group: 'com.android.support', module: 'versionedparcelable'
        exclude group: 'com.android.support', module: 'support-annotations'
        exclude group: 'com.android.support', module: 'support-core-utils'
        exclude group: 'com.android.support', module: 'support-core-ui'
        exclude group: 'com.android.support', module: 'support-fragment'
        exclude group: 'com.android.support', module: 'appcompat-v7'
    }`
      );
    }
    return config;
  });
};