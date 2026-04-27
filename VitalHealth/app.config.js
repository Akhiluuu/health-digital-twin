export default {
  expo: {
    name: "VitalHealth",
    slug: "vitalhealth",
    version: "1.0.0",
    orientation: "portrait",

    // ✅ NEW APP ICON
    icon: "./assets/images/vitalhealth-icon.png",

    scheme: "vitalhealth",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,

    assetBundlePatterns: ["**/*"],
    owner: "monish2005",

    /////////////////////////////////////////////////////////
    // IOS CONFIGURATION
    /////////////////////////////////////////////////////////
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.monish2005.vitalhealth",
      infoPlist: {
        NSCameraUsageDescription:
          "Allow VitalHealth to access your camera for heart rate measurement.",
        NSMicrophoneUsageDescription:
          "Allow VitalHealth to use your microphone for voice input and health assistance.",
        NSSpeechRecognitionUsageDescription:
          "Allow VitalHealth to convert your speech into text.",
        NSMotionUsageDescription:
          "Allow VitalHealth to access motion sensors for step counting.",
        NSHealthShareUsageDescription:
          "Allow VitalHealth to access your health data.",
        NSHealthUpdateUsageDescription:
          "Allow VitalHealth to update your health data.",
        UIBackgroundModes: [
          "fetch",
          "processing",
          "remote-notification",
        ],
      },
    },

    /////////////////////////////////////////////////////////
    // ANDROID CONFIGURATION
    /////////////////////////////////////////////////////////
    android: {
      package: "com.monish2005.vitalhealth",
      versionCode: 11,

      // ✅ FIXED ICON (NO ZOOM / PERFECT FIT)
      adaptiveIcon: {
        foregroundImage: "./assets/images/vitalhealth-icon.png",
        backgroundColor: "#ffffff",
      },

      // ✅ Notification icon (must be simple white icon ideally)
      notification: {
        icon: "./assets/images/vitalhealth-icon.png",
        color: "#4CAF50",
      },

      permissions: [
        "CAMERA",
        "FLASHLIGHT",
        "ACTIVITY_RECOGNITION",
        "BODY_SENSORS",
        "WAKE_LOCK",
        "VIBRATE",
        "INTERNET",
        "RECORD_AUDIO",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_DATA_SYNC",
        "RECEIVE_BOOT_COMPLETED",
        "POST_NOTIFICATIONS",
        "USE_EXACT_ALARM",
        "SCHEDULE_EXACT_ALARM",
      ],

      usesCleartextTraffic: true,
    },

    /////////////////////////////////////////////////////////
    // SPLASH SCREEN (APP OPEN LOGO)
    /////////////////////////////////////////////////////////
    splash: {
      image: "./assets/images/vitalhealth-icon.png",
      resizeMode: "contain", // ✅ VERY IMPORTANT (no zoom)
      backgroundColor: "#ffffff",
    },

    /////////////////////////////////////////////////////////
    // PLUGINS
    /////////////////////////////////////////////////////////
    plugins: [
      "expo-router",
      "@react-native-voice/voice",
      "./plugins/withExcludeOldSupportLib",

      [
        "expo-splash-screen",
        {
          image: "./assets/images/vitalhealth-icon.png",
          resizeMode: "contain",
          backgroundColor: "#ffffff",
        },
      ],

      "expo-sqlite",
      "expo-task-manager",
      "expo-background-fetch",
      "expo-secure-store",
      "expo-web-browser",

      [
        "expo-sensors",
        {
          motionPermission:
            "Allow VitalHealth to access motion sensors for step counting.",
        },
      ],

      [
        "react-native-vision-camera",
        {
          cameraPermission:
            "Allow VitalHealth to access your camera for heart rate measurement.",
          microphonePermission:
            "Allow VitalHealth to access your microphone.",
          enableFrameProcessors: true,
        },
      ],

      /////////////////////////////////////////////////////
      // BUILD PROPERTIES
      /////////////////////////////////////////////////////
      [
        "expo-build-properties",
        {
          android: {
            compileSdkVersion: 35,
            targetSdkVersion: 35,
            minSdkVersion: 24,

            useAndroidX: true,
            enableJetifier: true,

            extraMavenRepos: [
              "$rootDir/../node_modules/@notifee/react-native/android/libs",
            ],

            enableProguardInReleaseBuilds: true,
            kotlinVersion: "2.1.20",

            packagingOptions: {
              pickFirst: ["**/*.so"],
            },
          },
          ios: {
            useFrameworks: "static",
          },
        },
      ],
    ],

    /////////////////////////////////////////////////////////
    // EXPERIMENTAL
    /////////////////////////////////////////////////////////
    experiments: {
      typedRoutes: true,
    },

    /////////////////////////////////////////////////////////
    // EXTRA
    /////////////////////////////////////////////////////////
    extra: {
      eas: {
        projectId: "fc2ee98e-01ac-4835-b1d2-c774309193c9",
      },
    },
  },
};