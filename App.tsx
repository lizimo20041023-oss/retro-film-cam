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
import { useTheme } from './src/constants/theme';

export default function App() {
  const theme = useTheme();

  return (
    <SafeAreaProvider>
      <SettingsProvider>
        {/*
          根容器只负责铺满 + 铺上"机身底色"。
          为什么不把这行色值留给各个屏幕自己写：安全区、圆角屏边缘、以及任何一次
          页面切换的空隙露出来的都是这一层。它跟着系统深浅色走，露出来的边角
          才和屏幕里的内容同色；写死深色的话浅色机身下会看到一圈黑边。
        */}
        <View style={[styles.root, { backgroundColor: theme.body }]}>
          {/*
            状态栏字色跟机身走：深机身配浅字（`light`），浅机身配深字（`dark`）。
            以前写死 `light`，在浅色机身下会是"浅底白字"，等于看不见。
          */}
          <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
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
