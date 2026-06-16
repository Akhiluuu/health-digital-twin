const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withNotifeeForegroundService(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];
    
    // Ensure the tools namespace is in the manifest tag
    if (!androidManifest.manifest.$["xmlns:tools"]) {
      androidManifest.manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    }

    if (!mainApplication.service) {
      mainApplication.service = [];
    }

    const serviceName = "app.notifee.core.ForegroundService";
    let notifeeService = mainApplication.service.find(
      (s) => s.$["android:name"] === serviceName
    );

    if (!notifeeService) {
      notifeeService = {
        $: {
          "android:name": serviceName,
          "android:exported": "false",
        },
      };
      mainApplication.service.push(notifeeService);
    }

    // Declare foregroundServiceType as dataSync for Android 14+ compatibility
    notifeeService.$["android:foregroundServiceType"] = "dataSync";
    notifeeService.$["tools:replace"] = "android:foregroundServiceType";

    return config;
  });
};
