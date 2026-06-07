module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-worklets-core powers the vision-camera frame processor
    // (Stage-1 card detection). Its Babel plugin must be listed LAST.
    plugins: ['react-native-worklets-core/plugin'],
  };
};
