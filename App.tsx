/**
 * 应用入口。
 *
 * 故意保持极简：单屏相机 + 一层设置覆盖层，不需要导航库。
 * 以后要加"相册"页时再引 `@react-navigation/native` 即可，取景器代码不用动。
 *
 * `SettingsProvider` 必须在最外层：语言和定位档位都是全局状态，
 * 相机屏幕、设置界面、乃至 `describeError` 这类树外工具都要读它。
 */
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CameraScreen } from './src/components/CameraScreen';
import { SettingsProvider } from './src/hooks/useSettings';
import { themeFor } from './src/constants/theme';

export default function App() {
  const theme = themeFor('dark');

  return (
    <SafeAreaProvider>
      <SettingsProvider>
        {/*
          根容器只负责铺满 + 铺上"机身底色"。
          为什么不把这行色值留给各个屏幕自己写：安全区、圆角屏边缘、以及任何一次
          页面切换的空隙露出来的都是这一层。当前相机、图库和设置都只实现了暗色主题，
          所以根层也固定暗色，避免系统浅色模式让安全区和状态栏变成另一套颜色。
        */}
        <View style={[styles.root, { backgroundColor: theme.body }]}>
          {/*
            整个 App 固定暗色，状态栏也固定浅色字，和 CameraScreen 的主题口径一致。
          */}
          <StatusBar style="light" />
          <CameraScreen />
        </View>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
