// metro.config.js

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Add GLB and WASM support
config.resolver.assetExts.push("glb");
config.resolver.assetExts.push("wasm");

// Add COEP and COOP headers to support SharedArrayBuffer for expo-sqlite web worker
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    return middleware(req, res, next);
  };
};

module.exports = config;
