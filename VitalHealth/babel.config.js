module.exports = function (api) {
  api.cache(true);

  const isProduction = process.env.NODE_ENV === "production";

  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Strip all console.log/warn/error in production APK builds
      ...(isProduction ? ["transform-remove-console"] : []),
      "react-native-reanimated/plugin",
    ],
  };
};