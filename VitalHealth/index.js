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