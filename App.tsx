/**
 * 应用入口。
 *
 * 故意保持极简：单屏相机 + 一层设置覆盖层，不需要导航库。
 * 以后要加"相册"页时再引 `@react-navigation/native` 即可，取景器代码不用动。
 *
 * `SettingsProvider` 必须在最外层：语言和定位档位都是全局状态，
 * 相机屏幕、设置界面、乃至 `describeError` 这类树外工具都要读它。
 */
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CameraScreen } from './src/components/CameraScreen';
import { SettingsProvider } from './src/hooks/useSettings';

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        {/* 相机界面是深色的，状态栏用白字 */}
        <StatusBar style="light" />
        <CameraScreen />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
