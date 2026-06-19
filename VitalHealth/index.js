// index.js — root of project (same level as package.json)

import { AppRegistry } from "react-native";
import App from "./App";
import { name as appName } from "./app.json";

// Initialize notification/background services
import "./services/notifeeService";

///////////////////////////////////////////////////////////
// APP REGISTRATION
///////////////////////////////////////////////////////////

AppRegistry.registerComponent(appName, () => App);

// Register Headless JS task for native WorkManager synchronization
AppRegistry.registerHeadlessTask("BackgroundSyncTask", () => {
  return async () => {
    try {
      const { runBackgroundSync } = require("./tasks/backgroundSyncTask");
      await runBackgroundSync();
    } catch (err) {
      console.error("❌ Headless BackgroundSyncTask error:", err);
    }
  };
});