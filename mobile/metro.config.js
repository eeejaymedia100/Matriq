// Metro config for Matriq (Expo SDK 57).
//
// Expo SDK 50+ no longer injects Node builtin polyfills. whisper.rn pulls in
// `safe-buffer`, which requires Node's `buffer` module — resolve it to the
// `buffer` npm package (a pure-JS polyfill) so the release bundle can build.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  buffer: require.resolve("buffer/"),
};

module.exports = config;
