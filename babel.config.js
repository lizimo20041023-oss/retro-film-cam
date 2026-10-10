/**
 * Metro / Babel 配置。
 *
 * 只需要 `babel-preset-expo`：
 * - 它内置了 TypeScript、JSX、以及 React Native 的 Fast Refresh 支持；
 * - 本项目**没有**用 react-native-reanimated，所以不需要 `react-native-worklets/plugin`；
 *   如果你以后要上 reanimated（例如做更复杂的手势），才需要在这里加插件。
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
