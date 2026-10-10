/**
 * Metro / Expo 的真实入口。
 *
 * 为什么不直接用 App.tsx 当入口：`registerRootComponent` 会做几件必要的事
 * （把组件注册成 AppRegistry 的根组件、接上 Expo 的根容器、保证
 * `AppRegistry.runApplication` 的初始 props 正确），官方模板也是这么做的。
 * 对应的 `package.json` 字段是 `"main": "index.ts"`。
 */
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
