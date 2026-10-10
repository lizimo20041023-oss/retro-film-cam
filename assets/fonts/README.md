# assets/fonts —— 日期水印字体（默认空目录）

**默认状态：这个目录是空的，App 用系统等宽字体**
（iOS `Menlo` / Android `monospace`）。这已经能出"液晶屏"的近似观感，零依赖、零风险。

## 想要真·数码管（推荐 DSEG 系列，SIL OFL 免费可商用）

1. 下载 `DSEG7Classic-Bold.ttf`（或 `DSEG14Classic-Bold.ttf`）放进本目录。
   主页：<https://www.keshikan.net/fonts-e.html>（DSEG7 = 7 段数码管，DSEG14 = 14 段）。
2. 打开 `src/hooks/useFilmFonts.ts`，把这一行：

   ```ts
   const CUSTOM_FONT: number | null = null;
   ```

   改成（示例在文件里也是现成的，取消注释即可）：

   ```ts
   const CUSTOM_FONT: number | null = require('../../assets/fonts/DSEG7Classic-Bold.ttf');
   ```

   > ⚠️ **千万不要**留一个指向不存在文件的 `require`：Metro 打包时会直接报
   > `Unable to resolve module ../../assets/fonts/xxx.ttf`，App 起不来。所以仓库里默认是 `null`。

3. 存盘热重载。取景器底部那行参数里 `字体` 会从 `系统等宽` 变成 `自定义`，这就是"加载成功"的确认信号
   （`useFilmFonts()` 会把结果暴露成 `FilmFontsState.source`）。

## 关于 Expo Go 的限制（已核实）

`expo-font` 的 **config plugin 方式（把字体在构建期嵌进原生包）在 Expo Go 里无效** ——
那需要 prebuild / 自定义原生工程。Expo Go 里只能用运行时 `useFonts()` 加载 ttf/otf，
本项目就是这么做的（`src/hooks/useFilmFonts.ts`）。

## 字体加载失败会怎样

- `useFonts` 返回 `error` → 自动降级到系统等宽字体，**不会卡住 App**，也不会白屏；
- `FilmFontsState` 里 `ready` 表示"加载流程结束"（成功或失败都算结束），
  `customLoaded` 才是"真的加载成功了"。

## 换成非等宽字体时要注意

`timestamp.letterSpacingRatio`（默认 0.14）是按数码管调的；换成普通字体会显得太散，
把它调到 `0.02 ~ 0.05` 更好看。另外数码管字体请不要用于正文 —— 数字之外的字形通常不可读。

## 授权提醒

字体是有版权的资源：自己用随便，**要上架 / 分发就用 OFL / Apache / MIT 协议的字体**
（DSEG 是 OFL）。不要把系统字体（San Francisco、SF Mono 等）的 ttf 拷进来分发。
