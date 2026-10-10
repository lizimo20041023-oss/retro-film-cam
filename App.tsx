/**
 * 应用入口。
 *
 * 故意保持极简：单屏相机，不需要导航库（Expo Go 里也不用装 react-navigation）。
 * 以后要加"相册/设置"页时再引 `@react-navigation/native` 即可，取景器代码不用动。
 */
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CameraScreen } from './src/components/CameraScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      {/* 相机界面是深色的，状态栏用白字 */}
      <StatusBar style="light" />
      <CameraScreen />
    </SafeAreaProvider>
  );
}
