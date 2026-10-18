# FretroCam 📷

一个 **纯 managed Expo** 的 iOS 复古胶片相机 App（类 Dazz 风格），自用练手向。
Windows 电脑开发 → iPhone 真机运行，**不需要 Xcode、不需要 Mac、不需要花钱买苹果开发者账号**。

**核心流程**：全屏实时取景 → 左右滑动换相框（带震感）→ 按快门 → 后台"显影"（调色 → 颗粒/暗角/漏光 → 右下角橙色液晶日期 → 套相框）→ 存进相册。

> 🐣 **第一次用、看不懂下面这些技术内容？** 直接看 [新手操作指南.md](新手操作指南.md) —— 照着点就行，不需要懂任何技术。

### 两条跑法，按需要选

| 路线 | 怎么跑 | 适合什么时候 | 看哪份文档 |
| --- | --- | --- | --- |
| **A. Expo Go**（开发调试用） | 电脑 `npm start`，手机扫码 | 改代码、加相框、调参数时边改边看 | [新手操作指南.md](新手操作指南.md) |
| **B. 独立 App**（日常拍照用） | GitHub 免费 Mac 机器打 `.ipa`，电脑用 iloader 装 SideStore，再由 SideStore 签进手机 | 想要桌面图标、出门不用带电脑 | [如何装到手机上.md](如何装到手机上.md) |

路线 B 是**免费自签**：0 元，但签名每 7 天要续签一次（苹果的限制，不是本项目的限制）。选 SideStore 而不是 Sideloadly/AltStore 的原因很实际：**SideStore 的续签在手机上完成**（Wi-Fi + LocalDevVPN），电脑只在第一次安装时用一次，之后可以一直关着。两条路线可以并存，改代码时用 A，改好了再走 B 出一版装到手机上。

---

## 目录

- [1. 前提](#1-前提)
- [2. 从零跑通（PowerShell，逐条照抄）](#2-从零跑通powershell逐条照抄)
- [3. 真机 Expo Go 运行 & 连不上怎么办](#3-真机-expo-go-运行--连不上怎么办)
- [4. 目录结构](#4-目录结构)
- [5. 拍摄管线（按下快门之后发生了什么）](#5-拍摄管线按下快门之后发生了什么)
- [6. 调色参数 → 图层映射表](#6-调色参数--图层映射表)
- [7. 新增相框 / 新增预设（不改核心逻辑）](#7-新增相框--新增预设不改核心逻辑)
- [8. 权限](#8-权限)
- [9. 兼容性核实结论与来源](#9-兼容性核实结论与来源)
- [10. 可测试性](#10-可测试性)
- [11. 已知限制](#11-已知限制)
- [12. 故障排查](#12-故障排查)
  - [12.1 推不上去怎么办（github.com 443 连不上）](#121-推不上去怎么办githubcom-443-连不上)
  - [12.2 把构建好的 IPA 抓到本机](#122-把构建好的-ipa-抓到本机scriptsfetch_ipaps1)
- [13. 可选升级路径（默认代码不含）](#13-可选升级路径默认代码不含)
- [14. 路线 B：打独立 App 的技术说明](#14-路线-b打独立-app-的技术说明)
- [15. 界面设计：为什么"质感"是图片而不是样式](#15-界面设计为什么质感是图片而不是样式)
- [16. 成片质感：颗粒 / CCD / 分辨率天花板](#16-成片质感颗粒--ccd--分辨率天花板)
- [17. 变焦：数码变焦怎么接、为什么读数写百分比](#17-变焦数码变焦怎么接为什么读数写百分比)
- [18. 变焦条挪到快门上方 + 双指捏合 + 13/26/35 三档](#18-变焦条挪到快门上方--双指捏合--132635-三档)
- [19. 点画面对焦：给 expo-camera 打了一个原生补丁](#19-点画面对焦给-expo-camera-打了一个原生补丁)
- [20. App 内相册：沙盒里的第二份拷贝](#20-app-内相册沙盒里的第二份拷贝)
- [21. 补光改成闪光灯：一次改名、零行改图](#21-补光改成闪光灯一次改名零行改图)
- [22. 许可证与隐私](#22-许可证与隐私)
- [23. v1.2.0：这一版改了什么（八件事）](#23-v120这一版改了什么八件事)
- [24. v1.3.0：按十一节规格重构](#24-v130按十一节规格重构)
- [25. v1.4.0：Dazz 级极简重构 + 六节增量 + 商标清理](#25-v140dazz-级极简重构--六节增量--商标清理)
- [26. v1.4.1：日期"乱码"与半格双联](#26-v141日期乱码与半格双联)
- [27. v1.5.0：液态玻璃取景器 + 真光学变焦 + 导入反查地名](#27-v150液态玻璃取景器--真光学变焦--导入反查地名)
- [28. v1.5.1：真机实测反馈的七条](#28-v151真机实测反馈的七条)
- [29. 打包机换镜像这件事（v1.5.1 发布时踩出来的）](#29-打包机换镜像这件事v151-发布时踩出来的)
- [30. v1.6.0：四模块重构（胶囊刻度尺 / 相纸正向 / 长卷不再叠合 / 地名与日期）](#30-v160四模块重构胶囊刻度尺--相纸正向--长卷不再叠合--地名与日期)
- [31. v1.6.1：六模块体检落地 + 闪光灯三档](#31-v161六模块体检落地--闪光灯三档)
- [32. v1.7.0：画幅强锁 + 相框三变体 + 实时预览 + 水印像素锁定](#32-v170画幅强锁--相框三变体--实时预览--水印像素锁定)
- [33. v1.8.0：去白雾的色彩引擎 + 暗房纸材 + 参数胶囊 + 日期引擎 + 像素级锁定](#33-v180去白雾的色彩引擎--暗房纸材--参数胶囊--日期引擎--像素级锁定)
- [34. v1.8.1：日期背景 100% 透明 + 颗粒不透明度硬上限 + `00 NO FRAME` 无相框模式](#34-v181日期背景-100-透明--颗粒不透明度硬上限--00-no-frame-无相框模式)
- [35. v1.8.2：颗粒不再糊成脏云雾（贴图重烤 + 1:1 手工平铺）](#35-v182颗粒不再糊成脏云雾贴图重烤--11-手工平铺)
- [36. v1.8.3：四模块军规改造（手风琴设置页 / 原生等宽三层发光日期 / 原图零柔焦 / 实色卡纸与暗色相机壳）](#36-v183四模块军规改造手风琴设置页--原生等宽三层发光日期--原图零柔焦--实色卡纸与暗色相机壳)
- [37. v1.8.4：真机焦段归位（取景盒重几何 / 四档焦段 / 最高分辨率 / 取景器去雾）](#37-v184真机焦段归位取景盒重几何--四档焦段--最高分辨率--取景器去雾)
- [38. v1.8.5：Dazz #Inst C 立体相纸（内窗黑边根治 / 9 款传奇胶卷 / 135 NEG 齿孔与地名 / 纯净化地名多语言）](#38-v185dazz-inst-c-立体相纸内窗黑边根治--9-款传奇胶卷--135-neg-齿孔与地名--纯净化地名多语言)
- [39. v1.8.6：真机发热五条投诉的逐条核查（按需合成 / 硬件光栅化 / 零 SVG / 六节点隔离 / 画质档与 GPS 去重）](#39-v186真机发热五条投诉的逐条核查按需合成--硬件光栅化--零-svg--六节点隔离--画质档与-gps-去重)
- [40. v1.8.7：字形档四档真正分家（STAMP FONT 实时穿透 / 自混合 S-Curve / 9 卷重调 / 胶片卡渐变与无框日期暗影）](#40-v187字形档四档真正分家stamp-font-实时穿透--自混合-s-curve--9-卷重调--胶片卡渐变与无框日期暗影)
- [41. v1.8.8：成片糊的根因（错位自叠层）与真机发热三刀](#41-v188成片糊的根因错位自叠层与真机发热三刀)
- [42. v1.8.9：闪光灯拍摄被停机打断（v1.8.8 发热改动的回归）与修法](#42-v189闪光灯拍摄被停机打断v188-发热改动的回归与修法)
- [43. v1.8.10：底片库整套重做（九支新代号 + 仿色 + 旧照片兼容）](#43-v1810底片库整套重做九支新代号--仿色--旧照片兼容)
- [44. v1.8.11：场景自适应冲印（按光线测光补偿）与水印位置两轴可设](#44-v1811场景自适应冲印按光线测光补偿与水印位置两轴可设)
- [45. v1.9.0：五道手术（非阻塞快门 + 极速测光 / 12 层同源显影 / 反 HDR 四场景 / 九支新卷 / 4×4 水印矩阵保留）](#45-v190五道手术非阻塞快门--极速测光--12-层同源显影--反-hdr-四场景--九支新卷--4x4-水印矩阵保留)
- [46. v1.9.1：去糊、去雾、去灰（零模糊 S 曲线 / 零模糊曝光提亮 / 四场景去雾 / 九卷零模糊基准 / 70% 暗角）](#46-v191去糊去雾去灰零模糊-s-曲线--零模糊曝光提亮--四场景去雾--九卷零模糊基准--70-暗角)
- [47. v1.9.2：亮白通透（层序倒置 + 无 crush + 高明度染色 + 80% 内圈暗角 + RGBA 颗粒 + 地名后缀）](#47-v192亮白通透层序倒置--无-crush--高明度染色--80-内圈暗角--rgba-颗粒--地名后缀)

---

## 1. 前提

| 需要 | 说明 |
| --- | --- |
| Windows 10/11 | 开发机，本文所有命令都在 **PowerShell** 里跑 |
| Node.js LTS | 建议 20 或 22（`node -v` 能看到版本即可） |
| iPhone + **Expo Go** | 从 App Store 装最新版 Expo Go |
| 同一个 Wi-Fi | 电脑和手机连同一个局域网（连不上时用 `--tunnel` 兜底） |

> 手机端**不需要**装 Xcode、不需要数据线、不需要 Apple 开发者账号。

## 2. 从零跑通（PowerShell，逐条照抄）

### 方案 A（推荐）：直接把本目录当成项目

本目录已经是**一个完整的 Expo 项目**（`package.json` / `app.json` / `index.ts` / `src/` / `assets/` 都在），
只差 `node_modules`。所以只要装依赖、解析版本，就能直接跑。

```powershell
# ① 进项目目录
cd C:\Users\lizim\Documents\deepseek-harness\default-workspace\retro-film-cam

# ② 装依赖：**一条命令装完**。
#    expo / react-native / 相机 / 相册 / 图片处理 / 截图 / 安全区 / babel 预设
#    全部依赖都已经写进 package.json 了，不需要再 expo install 任何东西。
#    国内务必带镜像参数，否则会卡死（原因见下面"装依赖踩过的坑"）。
npm install --registry=https://registry.npmmirror.com --no-audit --no-fund

# ③ 类型检查，应该 0 error（已实测通过）
npm run typecheck

# ④ 起开发服务器
npm start
```

> `package.json` 里那条 `npm run deps` 脚本保留着，但它走的是 `npx expo install`，
> 在本机会撞上你全局 `.npmrc` 的脚本门禁（`EALLOWSCRIPTS`）。**本项目所有包版本都已经写死，
> 平时用不到它**；以后要加新包时看下面"装依赖踩过的坑"第 2 条。

### 方案 B：从官方模板新建项目，再把文件拷进去

```powershell
# ① 在你想放项目的地方创建（本仓库之外，例如 D:\code）
cd D:\code
npx create-expo-app@latest retro-film-cam --template blank-typescript
cd .\retro-film-cam

# ② 把本仓库里除 package.json 之外的所有源码/资源拷过来，覆盖同名文件
#    （package.json 建议保留模板生成的，避免版本冲突；只把 "main" 改成 "index.ts" 即可）
$src = "C:\Users\lizim\Documents\deepseek-harness\default-workspace\retro-film-cam"
Copy-Item "$src\App.tsx","$src\index.ts" -Destination . -Force
Copy-Item "$src\app.json" -Destination . -Force
Copy-Item "$src\tsconfig.json" -Destination . -Force
Copy-Item "$src\babel.config.js" -Destination . -Force
Copy-Item "$src\src" -Destination . -Recurse -Force
Copy-Item "$src\assets" -Destination . -Recurse -Force
Copy-Item "$src\scripts" -Destination . -Recurse -Force
# 检查 package.json 里有 "main": "index.ts"，没有就手动加上

# ③ 装依赖（和方案 A 的第 ③ 步相同）
npx expo install expo-camera expo-media-library expo-image-manipulator expo-haptics expo-font react-native-view-shot react-native-safe-area-context

# ④ 起服务
npx expo start
```

**要拷的文件清单**（方案 B 用得着）：

```
App.tsx
index.ts
app.json           ← 含相机/相册权限文案，别漏
tsconfig.json
babel.config.js
src/types/index.ts
src/constants/frames.ts
src/constants/presets.ts
src/constants/textures.ts
src/utils/processFilmPhoto.ts
src/utils/geometry.ts
src/utils/gradeLayers.ts
src/utils/normalizePhoto.ts
src/utils/saveToLibrary.ts
src/utils/formatTimestamp.ts
src/utils/describeError.ts
src/hooks/useFilmStage.ts
src/hooks/useFilmFonts.ts
src/components/CameraScreen.tsx
src/components/FilmCompositor.tsx
src/components/FrameOverlay.tsx
src/components/FrameSwitcher.tsx
src/components/ShutterButton.tsx
src/components/DevelopOverlay.tsx
src/components/PermissionNotice.tsx
assets/frames/*.png  + assets/frames/README.md
assets/textures/*.png + assets/textures/README.md
assets/fonts/README.md     （目录默认是空的，见第 7 节）
```

**版本策略**：`package.json` 里已经写死了全部依赖版本 —— 4 个来自官方空白模板的
（`expo ~57.0.27` / `expo-status-bar ~57.0.1` / `react 19.2.3` / `react-native 0.86.3`），
7 个原生包（`expo-camera ~57.0.6` / `expo-media-library ~57.0.5` / `expo-image-manipulator ~57.0.21` /
`expo-haptics ~57.0.3` / `expo-font ~57.0.4` / `react-native-view-shot 5.1.0` / `react-native-safe-area-context ~5.7.0`），
devDeps 四个（`@types/react ~19.2.2` / `typescript ~6.0.3` / `@babel/core` / `babel-preset-expo ~57.0.14`）。
这是**实测跑通的组合**（`npm install` → `tsc` → `expo export` 全绿），所以不做 `expo install` 的版本解析。

### 装依赖踩过的三个坑（本机实测 2026-10-10，出问题先看这里）

**1. 默认 registry 在国内会卡死。** `npm install` 打 `registry.npmjs.org` 跑了 **20 分钟**都没建出
`node_modules`：只有 1.4KB 级的元数据文件在慢慢写，tarball 一个没下。加镜像参数后 **15 秒**装完 490 个包：

```powershell
npm install --registry=https://registry.npmmirror.com --no-audit --no-fund
```

想一劳永逸，把它写进用户级 `.npmrc`（`notepad $env:USERPROFILE\.npmrc`，加一行）：

```
registry=https://registry.npmmirror.com
```

**2. `npm run deps`（即 `npx expo install ...`）在本机会直接失败**，报：

```
npm error code EALLOWSCRIPTS
npm error --allow-scripts is not allowed in project-scoped installs.
npm error Add the entries to the "allowScripts" field in package.json, or to .npmrc, instead.
```

原因是你的用户级 `.npmrc` 里有 `allow-scripts=true`，和这个 npm 版本的脚本门禁冲突 ——
**不是项目的问题**。因为所有版本都已经写死在 `package.json` 里，`npm install` 就是等价操作，
所以这条脚本平时用不到。真要加新包时，两个办法选一个：

```powershell
# 办法一（推荐）：直接按版本装，不用 expo install
npm install 新包名@版本 --registry=https://registry.npmmirror.com

# 办法二：临时注掉 .npmrc 里那行 allow-scripts=true，跑完 expo install 再改回来
```

**3. `babel-preset-expo` 必须能在项目根被 require 到。** 它本来是 `expo` 的依赖，但 npm 会把它
**嵌套装进 `node_modules/expo/node_modules/`**，而 Babel 只从项目根解析预设，于是打包直接报：

```
Failed to construct transformer: Error: Cannot find module 'babel-preset-expo'
```

所以 `devDependencies` 里**显式写了** `babel-preset-expo` 和 `@babel/core`（官方模板也这么干），
**别删**。删了就会出现"依赖明明装好了却打不了包"。

## 3. 真机 Expo Go 运行 & 连不上怎么办

```powershell
cd C:\Users\lizim\Documents\deepseek-harness\default-workspace\retro-film-cam
npm start
```

终端里会出现一个二维码（和 `exp://192.168.x.x:8081` 这样的地址）：

1. iPhone 打开**相机** App，对着终端二维码扫 → 点弹出的横幅，会用 Expo Go 打开；
   （或者在 Expo Go 里点 "Scan QR code"）
2. 首次加载要等 Metro 打包，几十秒正常；
3. 手机上首次会弹**相机权限** → 允许；拍完第一张会弹**相册"添加照片"权限** → 允许。

### 连不上 / 一直 "Connecting…" 的排查顺序

1. **确认同一个 Wi-Fi**（手机别连 5G 热点、别连访客网络；有 AP 隔离的路由器会挡）。
2. **Windows 防火墙放行 Node.js**：第一次 `npm start` 时弹的"允许访问"对话框要勾**专用网络**并允许。
   已经点过"取消"的话，去 `Windows 安全中心 → 防火墙和网络保护 → 允许应用通过防火墙`，
   把 **Node.js: Server-side JavaScript** 的**专用**和**公用**都勾上。
3. **换成 tunnel 模式**（走公网中转，绕过一切局域网问题，会慢一点）：

   ```powershell
   npm run tunnel
   # 等价于 npx expo start --tunnel
   ```
   首次会提示需要装 `@expo/ngrok`，回 `y` 即可。
4. **清缓存重启**（改过 `app.json` / 装过新包后推荐）：

   ```powershell
   npx expo start --clear
   ```
5. 确认 PC 和手机时间差不太大；代理/VPN 全局模式有时会干扰局域网连接，可临时关掉。

> **改代码后**：存盘 → 手机自动热重载。改了 `app.json` 或装了新原生包 → 需要重启 dev server（Expo Go 里下拉刷新不够）。

## 4. 目录结构

```
retro-film-cam/
├── App.tsx                       # 应用根：SafeAreaProvider + SettingsProvider + 状态栏
├── index.ts                      # registerRootComponent(App)（package.json 的 "main"）
├── app.json                      # Expo 配置：图标、bundleId、权限文案、深色 UI、插件
├── package.json                  # 依赖 + 脚本（start / tunnel / typecheck / deps）
├── tsconfig.json                 # extends expo/tsconfig.base + strict
├── babel.config.js               # 只用 babel-preset-expo（不需要 reanimated 插件）
├── .gitignore                    # 忽略 node_modules / .expo / ios / android / 签名文件
├── 新手操作指南.md                # ★ 零基础：用 Expo Go 跑起来（路线 A）
├── 如何装到手机上.md              # ★ 零基础：打成独立 App 装到 iPhone（路线 B）
├── 给朋友：怎么装 FretroCam.md    # ★ 发给别人的独立安装说明（SideStore 一键链接）
│
├── .github/
│   └── workflows/
│       └── build-ios-ipa.yml     # ★ GitHub 免费 Mac 机器上打未签名 .ipa 的流水线
│
├── patches/
│   └── expo-camera+57.0.6.patch  # ★ 给 iOS 原生加 focusPoint（点画面对焦）—— 必须提交进 git
│
├── assets/
│   ├── icon.png                  # App 图标 1024×1024（由 scripts/generate_app_icon.py 生成）
│   ├── frames/                   # 相框 PNG（透明镂空）+ 规范文档 —— 共 4 款
│   │   ├── polaroid-600.png      #   一次性成像 1408×1712（方形画面 + 厚下巴）
│   │   ├── instax-mini.png       #   迷你画幅 1080×1720（3:4 竖画面）
│   │   ├── neg-135.png           #   135 负片 1350×1950（片基 + 透明齿孔 + 片边代号）
│   │   ├── slide-mount.png       #   幻灯装裱 1350×1350（方形卡纸 + 3:2 开孔）
│   │   └── README.md             #   ★ 自己加相框看这里
│   ├── textures/                 # 颗粒 / 灰尘 / 暗角 / 漏光贴图
│   │   ├── grain.png             #   512×512 无缝平铺颗粒（★ 8 位灰度 L 模式，σ≈57，多尺度团簇）
│   │   ├── dust.png              #   512×512 灰尘与划痕（screen 混合）
│   │   ├── vignette.png          #   512×512 径向暗角
│   │   ├── light-leak.png        #   768×768 右上角暖色漏光
│   │   └── README.md             #   ★ 换纹理看这里
│   ├── ui/                       # ★ 界面质感素材（皮革底纹 / 拨轮 / 快门 / 细线图标）
│   │   ├── leather-tile.png      #   320×320 无缝底纹（resizeMode="repeat"）
│   │   ├── dial.png              #   176×176 滚花拨轮（未点亮）
│   │   ├── dial-on.png           #   176×176 滚花拨轮（琥珀发光）
│   │   ├── shutter-disc.png      #   240×240 快门内盘（径向渐变 + 内阴影）
│   │   ├── icon-flash[-on].png   #   168×168 闪光灯图标（灰 / 琥珀；原 icon-torch，只改名没重画）
│   │   ├── icon-flip.png         #   168×168 镜头反转图标
│   │   ├── icon-film.png         #   168×168 预设（胶片条）图标
│   │   ├── icon-settings.png     #   168×168 设置（三条滑轨 + 旋钮）图标
│   │   ├── icon-album.png        #   168×168 App 内相册图标（装了山和太阳的照片）
│   │   └── README.md             #   ★ 改质感 / 加按钮看这里
│   └── fonts/                    # 默认空目录（数码管字体可选，见 README）
│       └── README.md             #   ★ 想用 DSEG7 数码管字体看这里
│
├── scripts/
│   ├── generate_frames.py               # ★ 重生成 8 张相框（可只画一张）
│   ├── generate_placeholder_assets.py   # 重生成 assets/textures/ 那 5 张贴图（**不含相框**）
│   ├── generate_app_icon.py             # 重生成 App 图标（Python + Pillow）
│   ├── generate_ui_assets.py            # 重生成界面质感素材（Python + Pillow + numpy）
│   ├── fetch_ipa.ps1                    # ★ 从 GitHub Actions 抓最新一次的 IPA（见 §12.2）
│   ├── fetch_ipa.cmd                    #   双击就跑的包装（绕过执行策略）
│   ├── preview_frames.py                # ★ 把 8 张相框贴到同一张照片上做对照图
│   ├── preview_ui_mock.py               # 把样式表"翻译"成一张排版示意图（本地看比例用）
│   └── preview_grade.py                 # 模拟调色管线、打印每个预设的颗粒 σ（本地看质感用）
│
└── src/
    ├── types/index.ts            # 全部类型（唯一类型来源，导出完整）
    ├── i18n/
    │   ├── index.ts              # 系统语言匹配 / 插值 / useI18n() / 树外的 t()
    │   ├── types.ts              # MessageKey = keyof typeof zhHans（漏一个键就编译不过）
    │   └── locales/
    │       ├── zh-Hans.ts        # ★ 母本：所有键名的唯一来源
    │       ├── zh-Hant.ts        #   繁體中文
    │       ├── ja.ts             #   日本語
    │       ├── en.ts             #   English（兜底语言）
    │       ├── fr.ts             #   Français
    │       └── index.ts          #   LOCALES 注册表 + FALLBACK_LOCALE
    ├── constants/
    │   ├── frames.ts             # ★ 相框纯数据（8 条：名称 / PNG / 比例 / 窗口 / 日期锚点）
    │   ├── presets.ts            # ★ 预设纯数据（对比度/饱和度/色温/时间戳…）
    │   ├── grain.ts              # ★ 颗粒强度 5 档（关 / 轻 / 标准 / 重 / 极重）
    │   ├── zoom.ts               # 变焦量程 / 步长 / 量化 / 百分比换算（纯函数）
    │   ├── lenses.ts             # ★ 13/26/35 三个焦段档位 + 镜头名分类（毫米 → zoom 的换算都在这）
    │   ├── theme.ts              # 全局墨水色 + 等宽字体（设置界面与取景器共用一套）
    │   ├── textures.ts           # 纹理注册表
    │   └── uiAssets.ts           # ★ 界面质感素材注册表（require 全部 assets/ui/*）
    ├── utils/
    │   ├── processFilmPhoto.ts   # ★ 后处理主管线（纯逻辑 + 依赖注入，可单测）
    │   ├── geometry.ts           # 取景比例 / 相框窗口 / 日期与定位水印定位的几何计算
    │   ├── gradeLayers.ts        # 预设数值 → 图层数组（声明式调色，13 层）
    │   ├── captureOptions.ts     # 成片分辨率规划（成片长边 → captureRef 参数 + 像素数）
    │   ├── normalizePhoto.ts     # 原图降采样（内存优化；默认已关，直接用原图）
    │   ├── saveToLibrary.ts      # 存相册（新 API 优先 + 旧 API 兜底）
    │   ├── formatTimestamp.ts    # 日期格式化（YY MM DD / YY-MM-DD…）
    │   ├── locationStamp.ts      # 定位取点 + 坐标格式化 + 地名反查（各自带超时）
    │   ├── settingsStore.ts      # 设置持久化（AsyncStorage；失败只 warn，绝不抛）
    │   ├── galleryStore.ts       # ★ App 内相册的存储层（串行队列 + 索引 + 缩略图，纯逻辑）
    │   └── describeError.ts      # unknown → 用户可读文案
    ├── hooks/
    │   ├── useFilmStage.ts       # 合成视图的"挂载 → 就绪 → 截图"状态机
    │   ├── useFilmFonts.ts       # 数码管字体加载 + 系统等宽兜底
    │   ├── useSettings.tsx       # SettingsProvider + useSettings()（语言 / 定位）
    │   ├── useLocationStamp.ts   # 定位状态 + 每次快门的 2.5s 死线
    │   ├── usePinchZoom.ts       # ★ 取景器上的双指捏合变焦（capture 阶段抢响应）
    │   └── useGallery.ts         # ★ App 内相册的 React 层（乐观更新 + 静默对账）
    └── components/
        ├── CameraScreen.tsx      # 主屏（顶栏 / 取景 / 主控 / LCD 四段式布局）
        ├── SettingsScreen.tsx    # 设置面板（5 语言 + 定位三档），全屏覆盖层
        ├── GalleryScreen.tsx     # ★ App 内相册（三列网格 + 大图 + 删除），同样是全屏覆盖层
        ├── ZoomBar.tsx           # ★ 快门上方那条横向变焦轨道 + 13/26/35 三个档位
        ├── DialButton.tsx        # 滚花拨轮按钮（44pt，质感来自 PNG，无高亮填充色）
        ├── FilmCompositor.tsx    # 成片合成视图（被 ViewShot 截图的那块）
        ├── FrameOverlay.tsx      # 取景器上的相框预览
        ├── FocusReticle.tsx      # ★ 点画面对焦时闪一下的对焦框（纯展示，不接手势）
        ├── FrameSwitcher.tsx     # 左右滑动切相框（Animated + PanResponder + 震动）
        ├── ShutterButton.tsx     # 快门（三层同心圆 + 物理按压感）
        ├── DevelopOverlay.tsx    # "显影中/完成/失败"面板 + 成片预览
        └── PermissionNotice.tsx  # 权限被拒的引导卡片
```

> 设计原则：**相框和滤镜是纯数据**（`src/constants/*`），**渲染是通用代码**（`FilmCompositor` 只认类型）。
> 加相框/加预设不需要碰任何渲染逻辑。

## 5. 拍摄管线（按下快门之后发生了什么）

```
[取景] CameraView 实时原始画面
   + 半透明九宫格引导
   + 相框 PNG 遮罩（FrameOverlay，按窗口比例对齐）
   ❌ 没有实时滤镜 / 没有 GLSL / 没有逐帧像素处理
        │
        │  按快门
        ▼
CameraView.takePictureAsync({ quality: 1, exif: false })   → 原图 { uri, width, height }
        │
        ▼  processAndSaveFilmPhoto()
① normalizing  ImageManipulator.manipulate(uri).resize(...) → renderAsync() → saveAsync(JPEG 0.95)
                **默认已跳过**（normalizeMaxLongEdge = 0，保留相机原图全部像素）；
                老机器上若偶发闪退，把它改回 2048 可把内存峰值从约 96 MB 压到约 24 MB
② 组装图层      buildGradeLayers(preset) → GradeLayer[]（纯函数，声明的顺序 = 叠加顺序，共 13 层）
③ capturing     planCapture() 按预设的 captureLongEdge 算出 captureRef 要的 width/height（单位：逻辑点）
                合成视图挂载到屏幕外层的"显影面板"里（必须真的上屏，iOS renderInContext 截不到未上屏视图）
                → onLayout + 所有 Image onLoad 双就绪（1.5s 超时兜底）→ captureRef（默认成片长边 2048 px）
④ saving        Asset.create(uri) 存进相册（新 API；旧 SDK 自动走 legacy 分支）
        │
        ▼
DevelopOverlay 展示成片缩略图 + "已存入相册 / 保存失败"，点一下关闭
```

**为什么用"可见的显影面板"而不是隐藏的离屏视图？**
`react-native-view-shot` 在 iOS 上走 `renderInContext`，截不到没上屏的视图；截到黑屏或空图是经典坑。
所以合成视图是**真的挂在屏幕上**的，只是被一块暖黑色遮罩盖住（`DevelopOverlay`），截图时它就在画面里
—— 遮罩本身在 `ViewShot` **外面**，不会被截进去。

**为什么不用 Skia？** 用户硬约束：默认代码不依赖 `@shopify/react-native-skia`。
（核实结果：它其实**在 Expo Go 内置清单里**，所以第 13 节的升级路径是可行的，只是没必要。）

## 6. 调色参数 → 图层映射表

iOS 上 RN 的 `filter` **只支持 `brightness` 和 `opacity`**
（官方原文："Due to issues with performance and spec compliance, these are the only two filter functions available on iOS"），
所以**不能**写 `filter: 'contrast(1.2) saturate(0.8)'`。本项目改用
**`mixBlendMode` + 半透明叠层 + PNG 贴图**：这些在新架构（Expo Go 唯一支持的架构）上 100% 可用。

`presets.ts` 里的每个数值都由 `src/utils/gradeLayers.ts` 的 `buildGradeLayers()` 翻译成图层：

| 预设字段 | 取值范围 | 实现（图层） | 说明 |
| --- | --- | --- | --- |
| `temperature` | -1 ~ 1 | 暖/冷色纯色层，`mixBlendMode: 'soft-light'`，`opacity = |值| × 0.9`（暖 `#FF9640` / 冷 `#4C8DFF`） | 正值偏暖，负值偏冷 |
| `tint` | -1 ~ 1 | 绿/品红纯色层，`soft-light`，`opacity = |值| × 0.55`（绿 `#38A85C` / 品红 `#C05BD8`） | 正值偏绿，负值偏品红 |
| `splitTone` | 0 ~ 1 | **分离色调**，两层：暗部 `#182E3E` + `'lighten'`（只把比它更暗的像素抬成青蓝）；高光 `#FFF2D9` + `'darken'`（只把更亮的像素压成暖白）。第二层 `opacity = 值 × 0.9` | 中间调几乎不动，得到"冷暗部 + 暖高光"的胶片基调 |
| `bloom` | 0 ~ 1 | 深暖色 `#1A0A00` + `mixBlendMode: 'color-dodge'`，`opacity = 值` | 光晕/泛光。`color-dodge` 的偏移量正比于底色，所以暗部不动、高光被推暖推亮 —— 近似 halation（RN 的 `<Image>` 没有 `blurRadius`，做不了真·模糊泛光） |
| `saturation` | 0 ~ 2 | `<1`：中灰 `#808080` 层 `'saturation'`，`opacity = 1 - 值`；`>1`：高饱和红 `#FF3B30` 层 `'saturation'`，`opacity = (值 - 1) × 0.85` | `1` = 不动；`0` = 完全去色（黑白预设就这么实现的） |
| `contrast` | 0 ~ 2 | `>1`：**同一张照片再叠一层，`mixBlendMode: 'overlay'`**，`opacity = 值 - 1`；`<1`：中灰层 `'normal'`，`opacity = (1 - 值) × 0.9` | RN 没有真正的对比度调整，这是视觉等价近似 |
| `fade` | 0 ~ 1 | 深灰 `#1C1C1C` 层，`mixBlendMode: 'lighten'`，`opacity = 值` | 只抬黑场、不动高光 = 褪色/过期胶片感 |
| `exposure` | -1 ~ 1 | 正值：白色层 `'screen'`，`opacity = 值 × 0.35`；负值：黑色层 `'multiply'`，`opacity = |值| × 0.45` | 整体提亮/压暗 |
| `grain` | 0 ~ 1 | `grain.png` 平铺（`resizeMode: 'repeat'`），`mixBlendMode: 'overlay'`，`opacity = 值` | **单色亮度颗粒**强度；粗细由贴图决定，见 [`assets/textures/README.md`](assets/textures/README.md) |
| `dust` | 0 ~ 1 | `dust.png` 平铺，`mixBlendMode: 'screen'`，`opacity = 值` | 底片灰尘与划痕，只在暗部显形 |
| `vignette` | 0 ~ 1 | `vignette.png` 拉伸，`mixBlendMode: 'multiply'`，`opacity = 值` | 四角压暗 |
| `lightLeak` | 0 ~ 1 | `light-leak.png` 拉伸，`mixBlendMode: 'screen'`，`opacity = 值` | `lightLeakFlip: true` 时水平镜像换边 |
| `timestamp` | 见下 | 右下角 `<Text>`（不是图层） | 见下方"时间戳" |
| `showGuide` | bool | 取景器九宫格 | 只影响取景，不进成片 |

**图层顺序 = 数组顺序**（色温 → 色调 → **分离色调** → 饱和度 → 对比度 → 褪色 → 曝光 → **光晕** → 颗粒 → **灰尘** → 暗角 → 漏光，共 12 层），
想调整顺序就改 `buildGradeLayers` 里的 `push` 次序；想加一种新效果，就在 `GradeLayer` 联合类型里加一个成员。
顺序是有讲究的：分离色调放在饱和度**之前**，才能让后面的调色在同一个基调上做。

> **⚠️ 这里曾经还有第 13 层：`chroma-noise`（预烘焙的品红↔绿块状色噪贴图）**
> 它只被 `CCD-CYBER` / `DIGI-02` 两款的 `grainChroma` 打开，是"满屏紫绿噪波"的**唯一物理来源**，已于 2026-10-12 连同贴图一起彻底删除。
> 现在全项目只剩一种颗粒：`grain.png` 的**单色亮度颗粒**（8 位灰度 `L` 模式，三个通道在物理上就是同一个数）。
> **不要再把任何逐通道取随机数的"彩噪"加回来** —— 数码彩噪不是胶片特征，是传感器缺陷，而且它看起来非常假。

> **两个实现细节（改 `FilmCompositor` 前务必看）**
>
> 1. **混合层是"`<View>` 包 `<Image>`"，不是把 `mixBlendMode` 直接写在 `<Image>` 上。**
>    RN 0.86 把 `mixBlendMode` 只声明在 `ViewStyle` 里，`ImageStyle` 没有这个属性（类型会直接报错）。
>    外层 `<View>` 承载 `mixBlendMode` + `opacity` + `transform`，内层 `<Image>` 用
>    `StyleSheet.absoluteFill` 填满它 —— 混合的语义是"这一层跟底下已有的东西怎么合"，
>    套一个同尺寸容器、里面放一张不透明图，结果完全一致。
> 2. **只有底图和纹理图挂 `onImageLoad`，同图自叠的对比度层不挂。**
>    它和底图是同一张图，重复计数会让"全部图片 onLoad"这个就绪条件永远凑不齐。
>    `gradeLayers.ts` 的 `countStageImages()` 就是按这个约定算出期望图片数的。

### 时间戳（右下角橙色液晶日期）

- **颜色**：`preset.timestamp.color`，默认 `#FF8A00`（经典橙色液晶）；黑白预设 `tri-x-400` 用浅灰 `#E6E6E6`。
- **格式**：`preset.timestamp.format`，token 支持 `YYYY` `YY` `MM` `M` `DD` `D`。
  默认 `'YY MM DD'` → `26 10 10`；`expired-64` 预设用 `'YY-MM-DD'` → `26-10-10`。
- **字号 / 字距**：`fontSizeRatio`（默认 0.055，相对相框宽度）、`letterSpacingRatio`（默认 0.14）—— 都是比例值，
  所以换相框比例也不会跑版。
- **位置**：`anchor: 'window'`（烧在画面里）或 `'frame'`（烧在相框留白里），
  由 `geometry.ts` 的 `computeTimestampLayout()` 结合相框的 `bottomStripHeight` / `rightMargin` 算出 right/bottom。
  没写就用相框自己的 `watermark.anchor`。
- **字体**：默认 **iOS `Menlo` / Android `monospace`**（系统等宽，零依赖）；
  想要真·数码管就放一个 DSEG7 ttf 进 `assets/fonts/` 并改 `useFilmFonts.ts` 一行 —— 见
  [`assets/fonts/README.md`](assets/fonts/README.md)。加载失败会自动降级，不会白屏。
  取景器底部那行参数会显示当前用的是 `自定义` 还是 `系统等宽`。
- **开关**：`preset.timestamp.enabled = false` 就完全不烧日期。
- **辉光**：`glow: true` 用同色 `textShadow` 做液晶屏的发光溢出感。

## 7. 新增相框 / 新增预设（不改核心逻辑）

### 加一个相框

1. 把 PNG 丢进 `assets/frames/`（**必须带透明通道**，镂空窗口 alpha = 0）；
2. 在 `src/constants/frames.ts` 的 `FRAMES` 数组里加一条（照抄现有条目的形状，字段含义写在注释里）；
3. 存盘热重载 —— 取景器和成片同时生效。

规范、量窗口的 Python 片段、常见坑：**[`assets/frames/README.md`](assets/frames/README.md)**。

### 加一个预设

在 `src/constants/presets.ts` 的 `PRESETS` 数组里加一条，只写你想改的字段即可
（`resolvePreset()` 会用 `PRESET_DEFAULTS` 逐字段补全）：

```ts
{
  id: 'my-look',
  name: '我的调子',
  color: { contrast: 1.15, saturation: 0.85, temperature: 0.3, fade: 0.2 },
  grain: 0.12,
  vignette: 0.25,
  lightLeak: 0.3,
  timestamp: { format: 'YY-MM-DD', color: '#FFB03A' },
},
```

取景器底部胶囊左右轻触即可循环切换（`wrapPresetIndex`），无需注册表。

## 8. 权限

| 权限 | 何时请求 | 被拒时 |
| --- | --- | --- |
| 相机（`NSCameraUsageDescription`） | App 启动后自动请求一次；未授权时取景区显示引导卡片 | 卡片上有"去设置"按钮 → `Linking.openSettings()`；回到 App 时用 `getCameraPermission()` 重新检测 |
| 相册"添加照片"（`NSPhotoLibraryAddUsageDescription`） | 第一次保存成片时（`writeOnly` + `granularPermissions: ['photo']`，只要写入权限，不要读取） | 成片仍然生成并显示，但提示"未存相册" + 顶部"去设置"横幅 |

权限文案写在 `app.json` 的 `ios.infoPlist` 与 `plugins` 里（Expo Go 里也会生效）。

## 9. 兼容性核实结论与来源

核实时间：**2026-10-10**，全部来自官方文档（版本以 `npx expo install` 解析为准）。

| 结论 | 依据 / 来源 |
| --- | --- |
| 当前稳定的 Expo SDK 是 **57**（`expo ~57.0.27`，RN 0.86.3，React 19.2.3） | <https://docs.expo.dev/versions/latest/> · <https://unpkg.com/expo-template-blank-typescript/package.json>（官方空白 TS 模板，入口是 `index.ts`） |
| **Expo Go 只支持新架构**；SDK 55 起完全跑在新架构上 | <https://docs.expo.dev/guides/new-architecture/>（原文："SDK 55 and later run entirely on the New Architecture." / "Expo Go only supports the New Architecture."） |
| **`react-native-view-shot` 内置在 Expo Go 里**（`inExpoGo: true`）→ 后处理方案成立 | <https://docs.expo.dev/versions/latest/sdk/captureRef.md> |
| 截图输出尺寸 = 视图**逻辑尺寸 × PixelRatio**；不传 `width`/`height` 就是原始像素尺寸 | 同上（官方原文提醒要自己乘 `PixelRatio`）· <https://unpkg.com/react-native-view-shot/lib/index.d.ts> |
| `mixBlendMode` 需要新架构（Android 10+ 才支持 Android 侧）→ iOS 在 Expo Go 上可用 | <https://reactnative.dev/docs/view-style-props> |
| RN 的 `filter` 在 **iOS 上只有 `brightness` / `opacity`** → 对比度/饱和度必须用叠层实现 | 同上（原文："Due to issues with performance and spec compliance, these are the only two filter functions available on iOS"） |
| `expo-camera` 用 `CameraView` / `useCameraPermissions` / `takePictureAsync()` | <https://docs.expo.dev/versions/latest/sdk/camera/> |
| `expo-media-library` **新 API 是类式**的：`Asset.create(uri)`；旧的 `saveToLibraryAsync` / `createAssetAsync` 会在运行时抛错（要 `expo-media-library/legacy`） | <https://docs.expo.dev/versions/latest/sdk/media-library/> · <https://docs.expo.dev/guides/sdk-libraries-migration/media-library/> |
| `expo-image-manipulator` 新 API：`ImageManipulator.manipulate(uri)` → `renderAsync()` → `saveAsync()` | <https://docs.expo.dev/versions/latest/sdk/imagemanipulator/> |
| Expo Go 里 `expo-font` **只能用运行时 `useFonts()`**（config plugin 要 prebuild，Expo Go 无效） | <https://docs.expo.dev/versions/latest/sdk/font/> |
| Expo Go 内置的第三方原生库清单（含 `react-native-view-shot`、`react-native-reanimated`、`@shopify/react-native-skia`、`react-native-svg` 等） | <https://docs.expo.dev/versions/latest/sdk/third-party-overview/> |
| Expo 自带 Metro `require` 的类型声明（`expo/types` 引用 `./metro-require`）→ `require('../../assets/x.png')` 在 TS 下可用 | <https://unpkg.com/expo/types/index.d.ts> · <https://unpkg.com/expo/tsconfig.base.json> |

**本机实测复核（2026-10-10，实际跑出来的，不是转述文档）**

| 结论 | 怎么验的 |
| --- | --- |
| `npx tsc --noEmit` **0 error** | 全量装上依赖后真跑，退出码 0 |
| Metro **能完整打出 iOS bundle**（660 个模块 → 996KB）+ 6 个素材（3 相框 + 3 纹理）都被正确收集 | `npx expo export --platform ios --no-bytecode`，退出码 0 |
| `react-native-view-shot@5.1.0` **确实导出 `ViewShotRef` 类型** | 读 `node_modules/react-native-view-shot/src/index.tsx:292`：`export type ViewShotRef = View & { capture: () => Promise<string> }` |
| `ViewShot` **内部已经写死 `collapsable={false}`**，而且不透传任何未声明的 props | 同文件 `src/index.tsx:419-428`。所以调用处再传 `collapsable` 是**既无效又报错**，已删 |
| `StyleSheet.absoluteFillObject` **在 RN 0.86 已被移除**，只剩 `StyleSheet.absoluteFill`（一个被 `Object.freeze` 的对象，可直接 `...` 展开） | `node_modules/react-native/Libraries/StyleSheet/StyleSheetExports.js:21-29` + `Libraries/StyleSheet/StyleSheet.d.ts:116-129` |
| `mixBlendMode` **只声明在 `ViewStyle` 上**，`ImageStyle` 里没有 → 混合层改用 `<View>` 承载，`<Image>` 填满它 | `node_modules/react-native/Libraries/StyleSheet/StyleSheetTypes.d.ts:519` |

> 后面这四条都是"文档上看不出来、只有真跑才炸"的坑，代码里已经改好了。

## 10. 可测试性

`processFilmPhoto()` **不直接依赖任何原生模块**：合成/截图由外部注入的 `FilmStageHost` 完成
（`{ mount, unmount, whenReady, capture }`），所以在 Node 环境里塞一个假 host 就能测编排逻辑：

```ts
import { processFilmPhoto } from './src/utils/processFilmPhoto';
import { FRAMES } from './src/constants/frames';
import { PRESETS } from './src/constants/presets';

const fakeHost = {
  mount: () => {},
  unmount: () => {},
  whenReady: async () => {},
  capture: async () => 'file:///tmp/fake.jpg',
};

const photo = await processFilmPhoto({
  photo: { uri: 'file:///tmp/raw.jpg', width: 4032, height: 3024 },
  frame: FRAMES[0],
  preset: PRESETS[0],
  stage: { width: 358, height: 470 },
  host: fakeHost,
});

console.log(photo.layers);   // ['色温 0', '饱和度 …', '颗粒 …', …] 实际生效的图层
console.log(photo.warnings); // 没有原图时的降级提示也会出现在这里
```

没有原生环境时 `normalizePhoto` 会失败**但不抛错**，而是退回原图并把原因塞进 `warnings` ——
这也是线上排查"为什么这张照片没被压缩"的线索。纯函数（`geometry` / `gradeLayers` / `formatTimestamp`）
可以直接单测。

## 11. 已知限制

1. **取景器和成片的构图会有轻微差异**。取景器显示的是相机预览的中心裁切，而成片是"整张照片按相框窗口
   比例中心裁切"。两者比例接近时看不出来，窗口比例很怪（比如 3:4 的 35mm 相框对着 4:3 传感器）时，
   取景器里看到的多一点或少一点是正常的。要完全一致需要把预览也按输出比例裁切，属于下一步优化。
2. **无实时滤镜**：这是刻意的（硬约束 #2）。所见即"原始画面 + 相框"，调色只在按下快门后发生。
   好处是取景帧率永远是原生的，代价是按下快门后要等 ~1 秒才看到成片。
3. **分辨率有天花板**：成片的像素数由 `captureLongEdge` 决定（默认长边 2048 px ≈ 2.9 MP）。
   传放大后的 `width`/`height` 给 `captureRef` **不是简单插值** —— iOS 会把整棵图层树重绘到更大的矩形上，
   照片从原图重采样，所以能拿到真像素；但**上限受"舞台只有屏幕那么大"约束**：
   再往上顶，颗粒也会被一起放大成 6~9 像素的斑块，就不像胶片了。
   真要 12 MP + 真实胶片模拟，得换 Skia / `expo-gl` 离屏渲染（第 13 节和第 16.4 节）。
4. **调色是图层模拟，不是真 LUT**：`contrast` 用同图 `overlay` 叠加近似，`contrast` 拉到 2.0 这类极值时
   高光/阴影会有轻微色偏；数码胶片味的"真"实现要靠 LUT。
5. **`filter` 在 iOS 上不可用**，所以同一套参数在 Android 上也不会去用它 —— 两个平台走同一条渲染路径，
   行为一致（代价是 Android 上本来能用的 `saturate()` 也没用上，但保证了一致性）。
6. **Expo Go 的固有约束**：不能用 config plugin 嵌字体（用运行时 `useFonts`）；`expo-camera` 的
   `ratio` 属性仅 Android 有效、`active` 仅 iOS 有效；不能加任何需要自定义原生代码的库。
7. **占位素材是程序化生成的**，能用但不够好看。真机感来自相框美术（`assets/frames/README.md` 教你换）。
8. **未做**：闪光灯自动策略（现在只有手动开/关，没有 auto）、连拍、多张选片、EXIF 保留、
   iPad 布局适配。（i18n、设置页、App 内相册原先列在这一条里，后来都做了 —— 见下面 §18–§21。）
9. `asset/fonts/` 默认空目录 —— 不装自定义字体时日期用系统等宽字体（`Menlo` / `monospace`）。

## 12. 故障排查

| 现象 | 原因 / 解决 |
| --- | --- |
| 手机一直 "Connecting…" | 见第 3 节：同 Wi-Fi → 放行防火墙 → `npm run tunnel` |
| `Unable to resolve module ../../assets/fonts/DSEG7Classic-Bold.ttf` | `useFilmFonts.ts` 里解开了 `CUSTOM_FONT` 的 require，但 ttf 没放进 `assets/fonts/`。要么放文件，要么改回 `= null` |
| 打开就白屏 / 红屏 | 多半是 `app.json` 被改坏了（比如加了不存在的 `icon` 文件路径）。本仓库故意不写 `icon`/`splash` 字段 |
| 成片是纯黑 / 没有画面 | 合成视图没就绪就截了图。本项目已经用"onLayout + 所有 Image onLoad 双就绪 + 1.5s 超时"防这个；如果你改过 `FilmCompositor` 结构，注意别破坏这个约定 |
| 相框把照片整块盖住 | PNG 的窗口不是透明的（用了 JPG，或导出时丢了 alpha）。见 `assets/frames/README.md` |
| 相机一片黑 | 权限被拒（卡片会提示）→ 去设置；或者 Expo Go 退到后台再回来，需要重挂 `CameraView`（代码里已做 `cameraKey` 重挂） |
| 快门点了没反应 | 相机还没 `onCameraReady`，或上一张还在显影（`busy` 时快门是禁用的，中间会转菊花） |
| 提示"保存失败：权限被拒绝" | 设置 → Expo Go → 照片 → 允许"添加照片"。iOS 的新权限弹窗只弹一次，之后只能去设置 |
| 日期看不见 | 日期颜色和相框太接近，或 `anchor: 'frame'` 但相框没有下留白 → 改成 `'window'` 或换颜色 |
| 改了 `app.json` 不生效 | Expo Go 里下拉刷新不够，重启 dev server：`npx expo start --clear` |
| 提示 SDK 版本不匹配 | App Store 的 Expo Go 升到了更新的 SDK → `npx expo install expo@latest` 再 `npx expo install --fix` |
| `npm install` 卡住不动、`node_modules` 迟迟不出现 | 官方 registry 在国内太慢（本机实测卡 20 分钟）→ 加 `--registry=https://registry.npmmirror.com`，见第 2 节"踩过的坑" |
| `npm error code EALLOWSCRIPTS` / `--allow-scripts is not allowed` | 全局 `.npmrc` 里的 `allow-scripts=true` 撞上 npm 脚本门禁 → 改用 `npm install 包名@版本` 直接装 |
| 打包报 `Cannot find module 'babel-preset-expo'` | 它被嵌套装进了 `node_modules/expo/node_modules/` → 确认 `devDependencies` 里的 `babel-preset-expo` 没被删，重跑 `npm install` |
| 类型报 `Property 'absoluteFillObject' does not exist` 或 `'mixBlendMode' does not exist in type 'ImageStyle'` | RN 0.86 收紧了类型。本项目代码已改好；你自己加样式时用 `StyleSheet.absoluteFill`，需要混合的层用 `<View>` 承载 |
| `git push` 报 `Failed to connect to github.com port 443 after 21063 ms: Could not connect to server` | 见下面「12.1 push 不上去怎么办」 |

### 12.1 推不上去怎么办（github.com 443 连不上）

本机实测过的一种情况：**只有 `github.com` 这一个域名连不上，GitHub 其它域名全都正常。**
诊断三步（在项目目录里跑）：

```powershell
# 1. 端口到底通不通（不通就是被网络环境挡了，不是凭据问题）
Test-NetConnection github.com -Port 443 -InformationLevel Quiet
# 2. 这几个域名通不通 —— 都通就说明只是 github.com 被挡
curl.exe -s -o NUL -w "api=%{http_code}`n"  https://api.github.com/
curl.exe -s -o NUL -w "raw=%{http_code}`n"  https://raw.githubusercontent.com/
# 3. 换个 GitHub 边缘 IP 试试（DNS 给的那个 IP 可能正好不通）
curl.exe -s -o NUL -w "%{http_code}`n" --resolve github.com:443:140.82.112.3 https://github.com/
```

`Test-NetConnection` 返回 `False`、而第 3 步返回 `200` → **是 DNS 解析到的那个 IP 不通**，
换一个能通的 IP 就能推。Git 2.44+ 支持 `http.curloptResolve`，不用改 hosts（改 hosts 要管理员权限）：

```powershell
git -c http.curloptResolve=github.com:443:140.82.112.3 push origin master
git -c http.curloptResolve=github.com:443:140.82.112.3 ls-remote --heads https://github.com/lizimo20041023-oss/retro-film-cam.git
```

`140.82.112.3` / `140.82.113.3` / `140.82.114.3` / `140.82.116.3` / `140.82.121.3` 实测都可用。
**不要 `git config --global` 把它固化** —— IP 会变，今天能通的下个月可能就不通了，用一次性的 `-c` 参数最稳。

另外：**`api.github.com` 是通的，而且不带 token 也能用**，看 CI 状态比爬网页靠谱得多：

```powershell
# 最近几次构建
curl.exe -s -H "Accept: application/vnd.github+json" `
  "https://api.github.com/repos/lizimo20041023-oss/retro-film-cam/actions/runs?per_page=3"
# 某一次的详情 / 产物 / 步骤
curl.exe -s -H "Accept: application/vnd.github+json" "https://api.github.com/repos/lizimo20041023-oss/retro-film-cam/actions/runs/<run_id>"
curl.exe -s -H "Accept: application/vnd.github+json" "https://api.github.com/repos/lizimo20041023-oss/retro-film-cam/actions/runs/<run_id>/artifacts"
curl.exe -s -H "Accept: application/vnd.github+json" "https://api.github.com/repos/lizimo20041023-oss/retro-film-cam/actions/runs/<run_id>/jobs"
```

### 12.2 把构建好的 IPA 抓到本机（`scripts/fetch_ipa.ps1`）

**artifacts 的下载端点必须带身份，匿名访问是 `401`**，所以上面那几条 `curl` 只能看状态、拿不到包。
网页版 Actions 页面能下，但要点好几下，而且拿到的还是嵌套 zip（里面才是 `.ipa`）。
一条命令搞定：

```powershell
cd retro-film-cam
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\fetch_ipa.ps1
# 或直接双击 scripts\fetch_ipa.cmd
```

它做四件事：查**最新一次成功**的 run → 下载 artifact → 解出 `.ipa` → 打印路径、大小、sha256。
`-Out` 换落地位置，`-Run <id>` 指定某一次构建。

身份从哪来：和 `git push` 用的是同一份 —— `git credential fill` 里的 GitHub token
（本机是 GitHub CLI 的 `gho_` 开头那个）。脚本只把它放进 `Authorization` 头，**不打印**。

两个 Windows 特有的坑（都踩过，脚本头部注释里也写了）：

| 症状 | 原因 | 处理 |
|---|---|---|
| `... is not digitally signed` | 本机 `CurrentUser` 执行策略是 `RemoteSigned`，没签名的 `.ps1` 直接被拒 | 加 `-ExecutionPolicy Bypass`（`.cmd` 里已经带了） |
| `Missing expression after ','` / `The ampersand (&) character is not allowed` 一堆语法错 | **`.ps1` 的 UTF-8 BOM 被编辑器吃掉了**，PowerShell 5.1 按系统 ANSI（GBK）解码中文注释 | 确认文件前三个字节是 `EF BB BF`，没有就补回去 |

> 为什么 `.ps1` 必须带 BOM：Windows PowerShell 5.1（本机就是）判断编码靠 BOM，
> 没有 BOM 时用 `[System.Text.Encoding]::Default`，在中文 Windows 上就是 GBK。
> 这个项目的脚本、文档全是中文，所以这条对每个 `.ps1` 都成立。

## 13. 可选升级路径（默认代码不含）

1. **真 LUT / 实时滤镜**：`@shopify/react-native-skia` **在 Expo Go 内置清单里**（已核实），
   可以用 `Skia.Image` + `ColorMatrix` / Runtime Shader 做真调色，甚至给取景器加实时预览。
   代价是取景帧率和电量，以及 Skia 版本随 SDK 变动的适配成本。
2. **更高分辨率成片**：Skia 离屏 `Surface` 渲染 + `makeImageSnapshot()` 可以按任意像素尺寸出图，
   绕开"截图 = 屏幕分辨率"的限制（也不用真的把视图挂到屏幕上）。
3. **真数码管字体**：放 DSEG7 ttf + 改 `useFilmFonts.ts` 一行（见 `assets/fonts/README.md`），
   颜色/格式/字距都已经是 preset 字段，不用改渲染代码。
4. **相框素材**：`assets/frames/README.md` 里的规范接得住任意 PNG —— 磨砂纸边、漏光边、
   手写日期标签、品牌 logo 都能做，改的只是美术资源。
5. **多屏 / 相册页 / 设置页**：现在是单屏（`App.tsx` 直接渲染 `CameraScreen`），相册和设置
   都是**绝对定位的覆盖层**而不是路由页（`GalleryScreen.tsx` / `SettingsScreen.tsx`）——
   两条路各自只有一个入口，引一套导航框架不划算。真要加第三个、第四个真正的屏，
   再装 `@react-navigation/native` + `native-stack`（都在 Expo Go 支持范围内）。
6. **Android 专属滤镜**：Android 上 RN 的 `filter` 支持 `saturate` / `sepia` / `contrast` 等，
   想在 Android 上更进一步可以按 `Platform.OS` 分支（当前为了一致性故意没做）。
7. **设备能力**：`expo-haptics` 已经用上了（切相框的轻震），还可以加"显影完成"的成功震感
   （`Haptics.notificationAsync`）、快门声（`takePictureAsync({ shutterSound: false })` 反向控制）。

---

## 14. 路线 B：打独立 App 的技术说明

> 操作步骤在 [如何装到手机上.md](如何装到手机上.md)，这一节只讲**为什么这么做**，方便以后改流水线。

### 为什么必须绕这么大一圈

| 事实 | 后果 |
| --- | --- |
| iOS 的 `.ipa` **只能在 macOS 上编译** | Windows 开发机自己打不了包 |
| `expo prebuild --platform ios` **在 Windows 上被硬拦**（报 `Skipping generating the iOS native project files`） | 连生成原生工程都做不了，更不能本地验证 |
| EAS Build 打真机包需要**苹果开发者账号出证书**（$99/年） | 免费路线用不了 EAS 的签名构建 |
| 免费 Apple ID 能签名，但**签名只有 7 天**，且必须先有 `.ipa` | 所以：**先弄出未签名的 ipa，再在 Windows 上现场签名** |

结论：**借 GitHub Actions 的免费 macOS 机器编译，产出未签名 ipa；电脑上装 iTunes + [iloader](https://iloader.app) 把 [SideStore](https://sidestore.io/) 塞进手机，之后所有签名/安装/续签都在手机上的 SideStore 里完成。**
（GitHub Actions 编译未签名包是 [Altux](https://github.com/samay15jan/Altux) 等项目的通行做法；iloader + SideStore 是 SideStore 官方推荐的一键安装路径。）

选 SideStore 而不是 Sideloadly / AltStore 的唯一理由是**续签**：

| 方案 | 首次安装 | 每 7 天续签 | 需要官网版 iTunes |
| --- | --- | --- | --- |
| **SideStore**（本文推荐） | 电脑 + 数据线，一步到位 | **手机上点一下，电脑可关机** | 否，用微软商店版 |
| Sideloadly | 电脑 + 数据线，最简单 | 电脑开机 + 插线点 Start | **是** |
| AltStore | 电脑 + 数据线，步骤最多 | 电脑开着 + 同一 Wi-Fi 自动签 | **是** |

SideStore 的无线续签靠 [LocalDevVPN](https://apps.apple.com/app/localdevvpn/id6755608044)：它在本机建一条回环 VPN 通道，让 SideStore 能直接跟设备内部的 `minimuxer` / AFC 服务通信，从而不需要外部电脑。这也是为什么 **装/更新/续签前必须先连上它**。

### 流水线的 10 步在干什么

见 `.github/workflows/build-ios-ipa.yml`。几个**不显然但关键**的点：

1. **必须打 Release，不能打 Debug。**
   Release 配置会在 Xcode 的 "Bundle React Native code and images" 阶段自动跑 `expo export:embed`，
   把 JS bundle **内嵌进 .app**。装到手机后**完全离线可用**。
   Debug 包仍然要去连 Metro 服务器，等于没脱离电脑，达不到目的。

2. **`CODE_SIGNING_ALLOWED=NO`** 是能编出包的关键。
   没有开发者证书时，加上它 Xcode 才肯完成编译，产出的是「未签名 .app」。
   SideStore / iloader / Sideloadly 都会**重新签整个 bundle**，所以未签名包正是它们要的输入。

3. **`package-lock.json` 里的 500 条下载地址写的是 `registry.npmmirror.com`**（本机在国内装的）。
   流水线第 4 步用 `sed` 换成 `registry.npmjs.org`（GitHub 机器在国外，官方源更快），
   如果校验失败就 `git checkout` 还原 lockfile 走镜像兜底。
   两个源的 tarball 路径规则相同、内容一致，所以单纯换域名是安全的。

4. **Xcode 的 scheme 名不是猜的。**
   `expo prebuild` 会把模板里的 `HelloWorld` 全部替换成
   `IOSConfig.XcodeUtils.sanitizedName(expo.name)`（源码见
   `@expo/config-plugins/build/ios/utils/Xcodeproj.js` 的 `sanitizedName`，
   规则是 `name.replace(/[\W_]+/g, '')`，改名清单见
   `@expo/cli/build/src/prebuild/renameTemplateAppName.js`，
   其中显式包含 `ios/**/*.xcodeproj/xcshareddata/xcschemes/*.xcscheme`）。
   本项目 `expo.name = "FretroCam"` → `FretroCam`。
   **但流水线仍然在第 7 步用 `xcodebuild -list` 自动探测一次**，探测不到才回落到 `FretroCam`，
   这样以后改 `app.json` 的 `name` 也不会把流水线弄坏。
   （顺带一提：`sanitizedName` 会删掉空格，所以 `"Fretro Cam"` 和 `"FretroCam"` 得到的 scheme 都是 `FretroCam`。）

5. **`app.json` 里 `ios.bundleIdentifier` 必须写死。**
   不写的话 `expo prebuild` 会**交互式**追问（非交互式环境直接失败）。
   现在的值是 `com.canyerylee.fretrocam`。

### 本机能验证到哪一步，验证不了什么

| 能本地验证 | 命令 | 结果 |
| --- | --- | --- |
| 配置插件能否正常求值 | `npx expo config --type prebuild` | ✅ exit 0，无警告，icon / bundleId / scheme 均已生效 |
| TypeScript | `npm run typecheck` | ✅ exit 0 |
| JS 打包 + 素材收集 | `npx expo export --platform ios --no-bytecode` | ✅ exit 0，660 模块，6 个素材全部收集 |
| **不能**验证：真实 Xcode 编译 | —— | 只能在 macOS 上跑，**这是唯一剩下的风险点** |

> 已知非项目问题：不加 `--no-bytecode` 时，Hermes 字节码那一步会因为写系统临时目录被拒而失败
> （`hermesc.exe ... exited with non-zero code: 6`）。JS 打包本身已经成功，这是本机环境限制。

### 改了代码之后

推到 `main` 就自动重新构建（`on: push`）。想手动触发就 Actions → Run workflow（`workflow_dispatch`）。
如果哪天免费额度用完了，把仓库改成 public 即可——**公开仓库的 Actions 完全不限量**。

### 以后想升级的选项

- **换 macOS 镜像**：`runs-on` 现在是 `macos-latest`，报 Xcode 版本问题就改成 `macos-15` / `macos-26`。
- **想要 1 年签名**：买 $99/年的 Apple Developer Program，然后把流水线从 `CODE_SIGNING_ALLOWED=NO`
  换成用 `.p12` 证书 + provisioning profile 直接出签名包（证书存 GitHub Secrets）。

### 走不通的那些「更省事」的路（已核实，别再花时间）

| 方案 | 声称的好处 | 为什么用不了 |
| --- | --- | --- |
| **TrollStore（巨魔）** | 永久签名，彻底不用续签 | 只支持 **iOS 14.0 ~ 17.0**。本机对应的手机是 **iOS 27**，范围外 |
| **AltStore PAL** | 苹果官方第三方商店，不用续签 | 要求设备**实际位于欧盟 / 日本 / 巴西**并登录对应地区 Apple 账号 |
| **EAS Build 直接出真机包** | 不用自己配 Xcode | 打真机包需要**付费开发者账号**出证书；免费账号路线走不通 |
| **淘宝/闲鱼「企业签名 / 永久证书」** | 花钱省事 | 证书随时被吊销；装的是别人重签过的包，**有夹带私货风险** |

补充：SideStore 的免费账号额度是**同时最多 3 个自签 App**（SideStore 自己占 1 个），所以本项目实际可再装 2 个。
如果以后想装更多 IPA，可以再套一层 [LiveContainer](https://github.com/LiveContainer/LiveContainer)
（用一个宿主签名槽位跑多个 guest App）——但它是容器，**相机 / 相册这类系统能力不一定完整**，
本项目要拍照，所以**适合用 SideStore 直接装成真 App**，不建议塞进 LiveContainer。

---

## 15. 界面设计：为什么"质感"是图片而不是样式

### 四段式布局

```
┌───────────────────────────────────────┐
│ ① topPanel   真实布局行（不是浮层）      │  ← 左：画幅徽标 ▌代号 · n/N ｜ 右：胶片计数 [00A] + 四枚拨轮
├───────────────────────────────────────┤
│                                       │
│ ② preview    flex:1, overflow:hidden  │  ← CameraView 实时原始画面（双指捏合变焦）
│              └ FrameSwitcher          │     相框 PNG + 三分线 + 点按对焦层 + ★ 对焦框（FocusReticle）
│                                       │
├───────────────────────────────────────┤
│ ③ zoomBar    [ 0.5× ][ 1× ][ 2× ] 三档  │  ← 等宽格，选中态画在格**内部**，点哪档轨道都不挪位
├───────────────────────────────────────┤
│ ④ dashboard  拨轮+预设卡片 ｜ 快门 ｜ ‹ › │
├───────────────────────────────────────┤
│ ⑥ lcdWrap    琥珀等宽状态条             │  ← 日期锚点 / 颗粒 / 暗角 / 漏光
└───────────────────────────────────────┘
```

> **⑤ 是空的，这是故意的。** 主屏原来有一条 ⑤ `grainBar`（颗粒强度五档），
> 已按用户要求在 v1.2.0 收进设置页（`settings.grain.title`），主屏不再常驻。
> 编号**不重排**，因为 `CameraScreen.tsx` 的渲染注释里一直用 ①②③④⑥ 指代这几段，
> 重排一次会让所有"见 ④ 底部主控"的注释指向错地方。新增段落请接在 ⑥ 后面用 ⑦。

**顶栏是真实布局行，不是绝对定位的浮层** —— 这是相对上一版最重要的改动。
浮层会盖住取景器顶部，而"取景器保持完整实时画面"是本项目的硬约束。

### 为什么用 PNG 而不是 StyleSheet

RN 在 iOS 上没有径向渐变、没有内阴影、没有滚花纹理，而 `filter` 只有 brightness/opacity。
要做出"实体相机"的观感只有两条路：引 `react-native-linear-gradient` / `react-native-svg`
（**会引入原生依赖，Expo Go 直接跑不了**），或者用 Pillow 预渲染成 PNG。

选了后者：`scripts/generate_ui_assets.py` 生成 `assets/ui/` 下的 10 张图，
`src/constants/uiAssets.ts` 统一 `require`，`DialButton` 负责摆放。
**改质感只要改 Python 再跑一次，JS 一行都不用动。**

| 元素 | 实现 |
| --- | --- |
| 机身底纹 | `leather-tile.png` 320×320 无缝平铺 + `opacity: 0.95`。振幅 ±2.5/255，远看是 #171716 纯色 |
| 拨轮按钮 | `dial.png` / `dial-on.png` 作底 + 细线图标叠在上面（`size * 0.48`）。**没有任何高亮填充色**，点亮只靠图里的琥珀内发光 |
| 顶栏刻字 | 四枚拨轮底下各有一行 8pt 的"闪光灯" / "翻转" / "设置" / "相册"（`INK.paperFaint`，几乎看不见但凑近能读） |
| 快门 | 三层同心圆：外圈 hairline `rgba(236,232,224,0.38)`、中圈 2pt `rgba(244,240,232,0.88)`、内盘 `shutter-disc.png` |
| 预设卡片 | 暗橙边框（`rgba(194,122,48,0.55)`）+ 7.5% 琥珀底色，像一张纸质标签 |
| LCD 状态条 | `rgba(210,139,42,0.20)` 细框，两行 `#D28B2A` 等宽字（`UI_MONO`），字距 1.1 |

**为什么 LCD 用 `UI_MONO` 而不是 `useFilmFonts`**：`useFilmFonts` 可能加载 DSEG7 数码管字体，
而 DSEG7 **没有中文字形**，LCD 那一行是中英混排的，会变成一堆方框。
系统等宽字体（iOS `Menlo` / Android `monospace`）能自动回退到中文，才是这里要的。

### 顶栏那几枚拨轮：为什么图标底下还有字

图标在盘面上只占 **21pt**（`44 × 0.48`），这个尺寸下再精致的图形也认不出功能 ——
最初"镜头反转"用的是"中心镜头圆 + 两段循环箭头"，缩到 21pt 后读起来像**刷新按钮**，
根本没人发现那儿能切前置。改了两件事：

1. **图标减负**：去掉内圈镜头圆，弧线从 9px 加粗到 12px、箭头放大到 26px，
   只留"两段带箭头的循环弧"这一个轮廓（见 `scripts/generate_ui_assets.py` 的 `make_icon_flip`）。
2. **加蚀刻小字**：拨轮底下补一行 8pt 的"闪光灯"/"翻转"（后来"设置""相册"也照这个规矩加）。真机身上这类按钮也都有刻字，
   放进这个界面并不违和 —— 颜色用 `INK.paperFaint`（alpha 0.20），远看几乎不存在，需要时又找得到。

不想保留刻字的话，删掉 `CameraScreen.tsx` 里那两处 `<Text style={styles.topActionLabel}>`
和对应的两条样式即可，`topActionItem` 那层 `View` 也可以一并去掉。

### 本地看排版：`scripts/preview_ui_mock.py`

这台开发机是 Windows，**没有 iOS 模拟器**，所以写了这个脚本把样式表的数值"翻译"成一张
786×1704 的静态示意图（`assets/ui/_mock-camera-screen.png`，已被 `.gitignore` 忽略）。

```powershell
python scripts/preview_ui_mock.py
```

它**不是真机渲染**，用来在没有 iPhone 时先看比例、对比度和配色。
字体的真实度量、`resizeMode="repeat"` 的接缝、透明度叠加都和真机略有出入 —— 以 Expo Go 为准。
改完 `CameraScreen.tsx` 的样式后跑一遍，能提前发现"预设名顶到快门""顶部标签太长"这类问题。

### 这次重构踩到的两个坑

1. **`pointerEvents` 不能写在 `<Image>` 上**。RN 0.86 的类型里它只属于 `ViewStyle`
   （`StyleSheetTypes.d.ts:513`），写在 `Image` 上 tsc 会报
   `Property 'pointerEvents' does not exist on type ... ImageProps`。
   做法是外面包一层 `<View style={StyleSheet.absoluteFill} pointerEvents="none">`。
2. **底纹 tile 不能太小**。最初用 160×160，在 393pt 宽的屏幕上会横向重复 2.5 次，
   接缝看得出周期。改成 320×320（只重复 1.2 次）配合更低振幅才彻底隐形。

---

## 16. 成片质感：颗粒 / CCD / 分辨率天花板

### 16.1 为什么以前"拍出来像自带的相机加了个框"

不是参数不够多，是**颗粒的调制量只有几个灰阶**。

`scripts/preview_grade.py` 会算出每个预设成片里"平滑天空的高频标准差"（单位：8 位灰阶）。
改造前实测：

| 预设 | 改造前 σ | 改造后 σ |
| --- | --- | --- |
| retro-400 | 2.49 级 | **6.71 级** |
| gold-200 | 2.00 级 | **5.63 级** |
| superia-x | 2.05 级 | **5.57 级** |
| tri-x-400 | 4.03 级 | **6.98 级** |
| expired-64 | 4.18 级 | **8.24 级** |

2~4 级是什么概念：JPEG 压缩和屏幕抖动的幅度就在这个量级，等于白加。
原因是**贴图被放大后对比度掉了 0.35 倍**（贴图 1 px = 1 逻辑点 = 捕获后 3×3 像素，
iOS 平滑插值把纯白噪声的 σ 从 42 抹到约 15），再乘 0.16 的 opacity 就只剩 ±2.5 级。

### 16.2 这一轮改了什么

> **这一段是 v1.1 那一轮的历史记录**，保留是为了说明"图层是怎么长出来的"。其中两条**已经被后来的版本推翻**，照着改会改错：
> - ⚠️ **`chroma-noise.png` / `grainChroma` 已于 v1.3.0 彻底删除**（它是满屏紫绿噪波的唯一来源，见 §24.2）。**不要按下面那行把它加回来。**
> - ⚠️ **颗粒数值已整体 ×0.4**（v1.3.0，见 §24.2），`grain.png` 也从"白噪声掺 22% 团簇"换成了**严格的多尺度团簇**（σ≈57）。

| 改动 | 内容 |
| --- | --- |
| **颗粒贴图** | `grain.png` 从 192×192 / σ=26 换成 **512×512 / σ=62**（8 位灰度），掺入 22% 的低频团簇做"结块感" |
| **新增 CCD 色噪** ⚠️ **已废弃** | `chroma-noise.png` 512×512，品红 ↔ 绿交替的 **2×2 块状**色斑 —— v1.3.0 已删除，见上文与 §24.2 |
| **新增灰尘划痕** | `dust.png` 512×512，配 `screen` 混合，只在暗部显形 |
| **新增 3 个图层** | 分离色调（`splitTone`，冷暗部 + 暖高光）、光晕（`bloom`，`color-dodge` 近似 halation）、色噪（**已删**）/ 灰尘 |
| **预设 5 个 → 10 个** | 见下 |
| **不再压缩原图** | `normalizeMaxLongEdge` 2048 → **0**（直接用相机原图，不再先缩到 2048 再合成） |
| **成片分辨率旋钮** | 新增 `captureLongEdge`（见 16.3） |

预设顺序：`retro-400` → `portra-400`（柔和低对比暖肤色）→ `gold-200` → `superia-x` →
`velvia-50`（高饱和风光正片）→ **`ccd-cyber`**（CCD 味主力）→ `cinestill-800t`（钨丝灯光晕）→
**`digicam-2002`**（早期数码相机）→ `tri-x-400` → `expired-64`。

想自己加第 11 个预设，看第 7 节；想调颗粒强弱，改 `presets.ts` 里的 `grain`，
然后用 `python scripts/preview_grade.py` 看 σ 有没有落在 5~9 级之间。

### 16.3 分辨率：`captureLongEdge` 能做什么

`presets.ts` 里的 `captureLongEdge`（默认 **2048**）是成片**长边的目标像素数**：

- `captureLongEdge: 0` → 不传 `width`/`height`，成片 = 舞台逻辑尺寸 × 设备像素比 ≈ **1119 × 1488**（约 1.7 MP）；
- `captureLongEdge: 2048` → 截图时把 `captureRef` 的 `width`/`height`（**单位是逻辑点**）按 `2048 / 原生长边` 放大，
  由 iOS 把整棵图层树**重绘**到更大的矩形上 —— 照片是从原图重采样的，日期文字是矢量的，
  所以放大拿到的是**真像素**，不是把 1.7 MP 拉皮。

代价是内存：RGBA 上下文长边 2048 ≈ 12 MB、3024 ≈ 27 MB、4032 ≈ 48 MB（还要再加一张解码后的原图）。

> ⚠️ **相框 PNG 只有 1350~1425 px 宽**。`captureLongEdge` 超过约 1800 之后，
> 奶白边框和印刷字会开始变软（照片本身不受影响）。要往上顶的话，
> 得先把 `scripts/generate_placeholder_assets.py` 里三个相框生成器整体加倍。

### 16.4 为什么拿不到 iPhone 原图的 12 MP

因为整条调色管线**依赖 `mixBlendMode`**，而 RN 在 iOS 上把 `mixBlendMode` 实现成
`layer.compositingFilter`（见 `node_modules/react-native/.../RCTViewComponentView.mm`）。
这带来一个硬约束：

- 截图必须走 `drawViewHierarchyInRect`（截"屏幕上的样子"），它**不渲染 `compositingFilter`** 的替代路线
  `renderInContext` 反而**会丢掉全部调色**（源码注释自己写着 "this comes with some trade-offs such as
  inability to capture gradients"）；
- 于是成片像素 = 舞台在屏幕上的逻辑尺寸 × 你要求的放大倍率，**舞台本身是屏幕尺寸**。
  把 `captureLongEdge` 一路顶到 4032 也能出图，但那是把一块 393pt 宽的布局重绘到 4032 px ——
  照片有真细节，**颗粒的"每颗粒子"也一起被放大成 6~9 像素的斑块**，看起来就不再是胶片颗粒。

三条路，按代价排序：

| 方案 | 成片 | 代价 |
| --- | --- | --- |
| **保持现状**（`captureLongEdge: 2048`） | 约 2.9 MP | 无。日常发朋友圈、冲印 6 寸都够 |
| **顶到 3024 / 4032** | 约 9 / 12 MP | 相框要先做 2×；颗粒变粗；内存 27 / 48 MB，老机器有被杀的风险 |
| **换成 GPU 渲染**（`expo-gl` / Skia 片元着色器） | 真 12 MP + 真实胶片模拟 | 需要**自定义原生模块** → Expo Go 跑不了，只能走第 14 节的 `.ipa`（GitHub Actions 打的就是 dev build，不受 Expo Go 限制）。等于把整个调色管线重写一遍 |

**当前选择：保持现状。** 如果你要冲印或者就是想要 12 MP，告诉我，走第三条路。

### 16.5 改完记得跑这两个脚本

```powershell
python scripts/generate_placeholder_assets.py   # 只重新生成 assets/textures/ 里那 5 张贴图
python scripts/generate_frames.py                # 重新生成 assets/frames/ 里那 4 张相框
python scripts/generate_frames.py neg-135        # 只重画其中一张
python scripts/preview_frames.py                 # 把 4 张相框拼成一张对照图（assets/frames/_preview.png）
python scripts/preview_grade.py                  # 模拟调色结果，打印每个预设的颗粒 σ
```

> ⚠️ `generate_placeholder_assets.py` **只管贴图，不会再碰 `assets/frames/`**。
> 它早期版本里也有相框生成函数，那些已经被 `generate_frames.py` 取代并**删掉了** ——
> 留着的话，谁跑一次就会把 4 张新相框悄悄覆盖回旧设计。

`preview_grade.py` 会用与 CoreImage 同源的混合公式，把 `presets.ts` 里的数值**解析出来重放一遍**
（不抄第二份参数表，避免两边漂移），输出两张九宫格临时图 —— 这是在没有 iPhone 的情况下
唯一能"看到"成片效果的办法。

---

## 17. 变焦：数码变焦怎么接、为什么读数写百分比

需求原话：「再补充一点 要变焦 哪怕是数码变焦。」

### 17.1 为什么没自己写手势放大

`<CameraView>` **没有内置双指缩放**。翻遍 `node_modules/expo-camera`：
`isPinchToZoomEnabled` 只出现在条码扫描的 `ScanningOptions`
（`node_modules/expo-camera/build/Camera.types.d.ts:519`）和
`node_modules/expo-camera/ios/Current/CameraViewModule.swift:399`，
`node_modules/expo-camera/ios/Current/CameraView.swift` 里**没有任何 pinch 手势**。
唯一的变焦通道就是 `zoom` 这个 prop。

那就用 `zoom` —— 它做的是**真变焦，不是「拍完再裁」**：

```
node_modules/expo-camera/ios/Current/CameraSessionManager.swift:221
    device.videoZoomFactor = minZoom * pow(device.activeFormat.videoMaxZoomFactor / minZoom, delegate.zoom)
    // 其中 let minZoom = 1.0  →  指数插值
```

`videoZoomFactor` 是**设备级**属性，预览流和 `takePicture()` 的静态输出**一起吃**。所以：

- **取景器里看到多大，成片就是多大** —— 不需要"拍完再按预览的裁切比例裁一遍"。
- 成片是相机**按传感器裁出来的全分辨率结果**，比"拍全图、把长边缩到 2048 之后再裁中心"好得多
  （后者只剩 2048 像素里的一小块，裁完直接糊）。这就是**没有自己写裁剪**的原因。
- 指数插值意味着前半段动得慢、后半段动得快，手感像真实变焦环，而不是线性滑块。

### 17.2 为什么界面上写百分比，不写「×3 倍」

`device.activeFormat.videoMaxZoomFactor` **只有原生侧读得到，JS 拿不到**。
也就是说 `zoom` 那个 0~1 的数，前端根本无法换算成"这是几倍"。
与其猜一个错的倍数写在屏幕上，不如**把量程本身当刻度**：`0%` ~ `100%` 就是拉杆位置。
（错的数字比没有数字更糟。）

`ZOOM_MAX = 0.75` 而不是 1.0：`zoom = 1` 表示"这台设备允许的最大数码变焦"，
16 倍机型上就是 16 倍 —— 而本 App 拍完还要把长边缩到 2048px（见 16.3），
拉满的成片全是糊的。**宁可少给，也不给一个"看起来能拉、拉完不能用"的档位。**

### 17.3 为什么当初把轨道做成竖的、贴在取景器右缘

> ⚠️ **本节讲的是已废弃的做法。** 竖条后来被挪到了快门上方（横向），原因见 **第 18 节**。
> 下面这段保留下来，是因为其中"两个手势怎么不打架"的机制仍然成立，也是 18.3 的前提。

取景器上已经有一个**横向** PanResponder：`FrameSwitcher`（左右滑动换相框）。
竖直方向是空的 —— 用竖条是刻意的（真实变焦环就是转，不是推）。

- 手指落在轨道上时 `ZoomRail` 先取到响应权（`onStartShouldSetPanResponder` 返回 true），
  所以**轨道上的横滑不会误触发换相框**；而 `FrameSwitcher` 自己的
  `onStartShouldSetPanResponder` 恒为 `false`（它只认移动），两边不会抢。
- 轨道**所有子节点**都设了 `pointerEvents="none"` —— 这样手势的 target 永远是轨道本身，
  `nativeEvent.locationY` 才是相对轨道的坐标（否则会相对被点到的那个子节点）。
- 外层是 `pointerEvents="box-none"` 的绝对定位容器，轨道以外的区域触摸照常穿透给取景器。

当初决定放在取景器上而不是底部控制区，是因为变焦是**边看边调**的动作：
手指离画面只有几毫米，视线不用在"画面"和"滑块"之间来回跳。
后来放弃这个理由，是因为取景器上又多了双指捏合 —— 三个手势挤一块玻璃的代价更大。

### 17.4 两个小决定

- **换前后摄时归零**（`CameraScreen.handleFlipCamera` 里 `setZoom(DEFAULT_ZOOM)`）：
  前后摄模组的 `videoMaxZoomFactor` 差很多，沿用旧值会突然跳到另一档放大。
- **写原生属性前先量化到 1%**（`toCameraZoom`）：不量化的话拖动时每一帧都写一次 `zoom` prop，
  而 `node_modules/expo-camera/ios/Current/CameraView.swift:142` 的
  `var zoom: CGFloat = 0 { didSet { sessionQueue.async { self.sessionManager.updateZoom() } } }`
  每次都去 lock/unlock 一次 device 配置。

### 17.5 相关文件

| 文件 | 作用 |
| --- | --- |
| `src/constants/zoom.ts` | 量程、步长、量化、百分比换算 —— 全是纯函数 |
| `src/components/ZoomBar.tsx` | **现在**是快门上方那条横向轨道 + PanResponder + 无障碍 `adjustable`（见第 18 节） |
| `src/components/CameraScreen.tsx` | `zoom` state、`<CameraView zoom={zoom}>`、翻转时归零 |

无障碍：读数那一条是 `accessibilityRole="adjustable"`，
带 `accessibilityValue={{ min: 0, max: 100, now: percent }}` 和
`accessibilityActions` 的 increment / decrement（标签用 RN 默认，不额外造词）。

---

## 18. 变焦条挪到快门上方 + 双指捏合 + 13/26/35 三档

需求原话：「把变焦滑块放到快门上方。」

### 18.1 为什么竖条要挪走：取景器上挤不下第三个手势

竖条原本贴在取景器右缘（见 17.3），理由是"变焦是边看边调的动作"。问题是取景器那一块玻璃
同时还要接**左右滑动换相框**和**双指捏合变焦** —— 三个手势挤在一起，误触率比手感收益大。

挪到快门正上方之后，各回各家：

- **对着画面做的动作留在取景器上**：滑动换相框、双指捏合变焦；
- **看着读数做的动作留在轨道上**：精确微调；
- 轨道已经完全不在 `FrameSwitcher` 的覆盖范围内，三者不再抢手势。

**为什么跟着改成横的**：轨道现在是页面流里的一行，横向与它所在那一行同向；而且 13 / 26 / 35
按数字从小到大从左往右排，滑块从左往右递增，读数和刻度方向一致。竖条那句"越往上越大"在页面流里
反而会让人下意识去往上推整页。

### 18.2 三种调法，一个真值来源

现在有三种方式改变焦，**它们都走同一个 `handleZoomChange`**：

| 调法 | 在哪 | 适合什么 |
| --- | --- | --- |
| 双指捏合 | 取景器上（`usePinchZoom`） | 一边看画面一边粗调 |
| 拖轨道 | 快门上方那根横向轨道 | 看着百分比精确微调 |
| 点档位 | 轨道左边的 `13` `26` `35` | "我就是要 35mm"这种明确意图 |

`handleZoomChange` 里除了写 `zoom`，还会**把档位灯灭掉**（`setActiveStopId(null)`）：
手动调出来的读数已经不在任何一档上了，灯还亮着就会出现「亮着 35mm、读数却是 12%」这种
自相矛盾的显示。

### 18.3 双指捏合：为什么是"起始值 + log2 增量"

`usePinchZoom` 里核心就是一行：

```
const next = start.zoom + Math.log2(distance / start.distance) * PINCH_PER_OCTAVE;
```

`PINCH_PER_OCTAVE = 0.5`（两指间距翻倍时，`zoom` 加 0.5；量程 0~0.75 大概是 1.5 个八度）。

**绝对不能写成乘法**（`start.zoom * k`）：`zoom` 的起始值是 **0**，0 乘任何数还是 0，
永远捏不动。而加法之所以对，是因为 `zoom` 本身已经是指数刻度
（原生 `videoZoomFactor = M ^ zoom`），手指间距翻倍 = `zoom` 加一个固定的量。

**手势怎么抢到的**：`onStartShouldSetPanResponderCapture` / `onMoveShouldSetPanResponderCapture`
里判 `touches.length === 2`，走**捕获阶段**（父 → 子）。能这么干的前提是 `FrameSwitcher` 的
`onStartShouldSetPanResponder` **恒为 `false`**（它只在移动时接管）—— 所以第二根手指落下时，
祖先还来得及先抢。唯一的漏网场景是"先横向滑了一段、再放第二根手指"：那时 `FrameSwitcher`
已经拿到响应权，而且它的 `onPanResponderTerminationRequest` 恒为 `false`，抢不回来。
这是可接受的边界 —— **想捏合就两根手指一起放下去**。

视觉反馈由 `ZoomBar` 负责（读数 + 滑块位置），捏合本身只改数字，不画任何东西。

### 18.4 13 / 26 / 35：三档是怎么落到原生上的

档位定义在 `src/constants/lenses.ts` 的 `FOCAL_STOPS`：

| 档位 | 做法 | `factor` | `zoom` |
| --- | --- | --- | --- |
| `13mm 超广角` | 切到超广角镜头 | 1 | 0 |
| `26mm 标准` | 切到主摄 | 1 | 0 |
| `35mm 人文` | 主摄 × 1.346 | 1.3461538461538463 | 0.10721 |

**26mm 那一档是切镜头，不是数码放大。** 想从超广角"放大 2 倍"凑到 26mm 走不通：
超广角格式的 `videoMaxZoomFactor` 通常只有 2 上下，正好卡在边界；而且数码放大比直接切到主摄
糊得多。切镜头让主摄用满整个传感器，是这里唯一正确的做法。

**原生只认"数码倍率"**：`CameraView` 的 `zoom` prop 实际换算成
`videoZoomFactor = 主摄最大倍率 ^ zoom`（见 17.1 那段源码），所以反过来
`zoom = ln(目标倍率) / ln(最大倍率)`。问题在于**那个"最大倍率"JS 读不到**
（`activeFormat.videoMaxZoomFactor` 只有原生侧有），代码里只能按 **16** 假定：
`ASSUMED_MAX_ZOOM_FACTOR = 16`。

**这个假定猜错了影响很小** —— 因为它被对数压扁了。同样一条 35mm 档，真正最大倍率不同时：

| 真实最大倍率 | 35mm 档该用的 `zoom` |
| --- | --- |
| 8 倍 | 0.14295 |
| **16 倍（代码里的假定）** | **0.10721** |
| 24 倍 | 0.09353 |
| 32 倍 | 0.08577 |

8 倍到 32 倍差 4 倍，落在 `zoom` 上只差 0.057 —— 而且 **13mm / 26mm 两档完全不依赖这个数**
（factor = 1 → `ln(1) = 0` → zoom 恒为 0，假定错到天上去也不影响）。

35mm 档准度的真正命门是另一个假定：**主摄原生就是 26mm**。
iPhone 主摄在各代之间 24 / 26 / 28mm 都出现过，JS 没有接口能读，只能假定。
假定 26 而真机是 24 的话，这一档实际拍出来是 `24 × 1.3462 ≈ 32.3mm`，差约 8% 视角。
（`ASSUMED_LENS_NATIVE_MM` 那个表就是本模块最大的一处"谎"，改它的后果写在文件头注释里。）

### 18.5 镜头名字是一锅粥，只能按名字分类

`getAvailableLenses()` 返回的是**本地化名字列表**，而且原生侧还按名字排过序
（`CameraSessionManager.swift`：`.sorted { $0 < $1 }`）。三个必须记住的后果：

1. 名字跟着系统语言走 —— 中文「后置超广角镜头」、英文「Back Ultra Wide Camera」、
   法语「Caméra arrière ultra grand-angle」都出现过，只能靠关键词匹配；
2. **`lenses[0]` 没有任何物理含义**，不能"拿第一个当主摄"；
3. **列表里混着物理镜头和虚拟多摄设备**（TripleCamera / DualCamera），
   **长度不等于镜头数**。

所以 `classifyLens()` 的匹配顺序是 `multi → ultraWide → telephoto → wide`，
两个非直觉的地方：`multi` 必须排第一（虚拟设备的 localizedName 里同样带焦距词，
比如「后置双广角相机」含「广角」，不先拦下来就会被 wide 抢走）；`ultraWide` 必须排在
wide 前面（「超广角」这三个字里**就包含「广角」**，让 wide 先跑则超广角永远被判成广角）。
拿不准一律返回 `unknown`，`findLensByRole` 找不到就返回 `null` —— **不猜**。

> ⚠️ 这张关键词表**没有实机验证过**，只做了保守的双向匹配。已知两种可能误判：
> 繁体中文下 Apple 在部分机型把主摄叫「後置相機」（不带焦距词）→ 落到 `unknown`；
> 法语「grand-angle」是宽角度通用说法，理论上有被误匹配的可能（靠 `multi` 优先级兜住大部分）。

### 18.6 档位按钮什么时候变灰

只有两种情况会变灰：

- **镜头列表还没回来**（`lenses.length === 0`）：这时**刻意不画灰** —— 不然刚进相机那三个档
  全是灰的，看着像坏了。此时点下去会退化成"只设 zoom、不切镜头"，行为仍然是对的。
- **这台设备 / 这个朝向确实没有那支镜头**：前摄没有超广角，所以**前摄下 13mm 档是灰的** ——
  这是对的，不是 bug。

### 18.7 相关文件

| 文件 | 作用 |
| --- | --- |
| `src/components/ZoomBar.tsx` | 横向轨道 + 三个档位按钮 + 百分比读数 + PanResponder |
| `src/hooks/usePinchZoom.ts` | 双指捏合（capture 阶段抢响应 + log2 增量） |
| `src/constants/lenses.ts` | 三档定义、镜头分类、毫米 → `zoom` 的换算与那两处假定 |
| `src/constants/zoom.ts` | 量程 `ZOOM_MAX = 0.75`、步长、量化、百分比换算（纯函数，没变） |
| `src/components/CameraScreen.tsx` | `handleZoomChange` / `handleStopPress` / `zoomStops`，以及三者的接线 |

无障碍：读数那一条是 `accessibilityRole="adjustable"`，带
`accessibilityValue={{ min: 0, max: 100, now: percent }}` 和 increment / decrement 两个动作；
三个档位按钮是 `accessibilityRole="button"` + `accessibilityState={{ selected, disabled }}`。

> **§17.3 已经被本节取代**（那根竖条没了）。17.1 / 17.2 / 17.4 讲的底层机制仍然成立。

---

## 19. 点画面对焦：给 expo-camera 打了一个原生补丁

需求原话：「点画面对焦。」

### 19.1 先说清楚：这是相机库的能力缺口，不是本项目的 bug

`expo-camera` 57.0.6 **完全没有"点画面对焦"这个 API**。翻它的 iOS 源码：
只有一个 `autoFocus` prop（映射到 `AVCaptureDevice.FocusMode`），而
`focusPointOfInterest` 在整个库的源码里**零命中**。也就是说，光靠 JS 侧无论怎么调都做不出来。

### 19.2 补丁做了什么

`patches/expo-camera+57.0.6.patch` —— **纯新增，`+175 / -0`**，只改 3 个 Swift 文件：

| 文件 | 加了什么 |
| --- | --- |
| `ios/CameraViewModule.swift` | 注册一个 `focusPoint` prop，转发给下面的 `CameraView` |
| `ios/Current/CameraView.swift` | `var focusPoint: CGPoint? { didSet { ... } }` —— 和库原有的 `var zoom` 是同一个写法 |
| `ios/Current/CameraSessionManager.swift` | `setFocusPoint()`：设 `focusPointOfInterest` + `.autoFocus`（**曝光也一起设**），并排一个 4 秒后的复位 |

**JS 侧一行都没改库**：`node_modules/expo-camera/build/utils/props.js` 里的
`convertNativeProps()` 是 `Object.entries(props)` **全量透传**，只对 `type` / `flash` 两张表
做转换，不做白名单过滤。所以运行期直接传就行，**只有 TS 类型上缺一块** ——
代码里用一次交叉类型（`type FocusPointProp = { focusPoint?: { x: number; y: number } }`）
补上，全项目仅此一处。

### 19.3 坐标系不在 JS 里算（这条最重要）

`focusPointOfInterest` 是**设备坐标系**：竖屏要旋转、前摄要镜像，还要补偿预览
`resizeAspectFill` 的裁切。手写 x/y 交换迟早会在某一个朝向上指错地方 ——
而对焦点错了是**无声的**：照片照样能拍，只是焦点落在别处，用户根本不会知道是坐标算错了。

所以做法是把 **0~1 的视图坐标直接交给原生**：

```
AVCaptureVideoPreviewLayer.captureDevicePointConverted(fromLayerPoint:)
```

`CameraView` 自己的 `layerClass` 就是 `AVCaptureVideoPreviewLayer`，这个转换函数替我们把
旋转、镜像、裁切一起处理掉了。JS 这侧只做一件事：`locationX / 取景器宽`、`locationY / 取景器高`
（那一层透明接收层和 `CameraView` 完全重合，所以这个除法就是它要的归一化坐标）。

### 19.4 补丁是命令式的：代价是必须传 memo 化的对象

原生那个 prop **刻意不做"值没变就不转发"的短路** —— 这样同一个点连点两次也能重新对焦。
代价落在 JS 侧：

```tsx
const cameraFocusProps = useMemo<CameraViewProps & FocusPointProp>(
  () => (focusTarget === null ? {} : { focusPoint: { x: focusTarget.x, y: focusTarget.y } }),
  [focusTarget],
);
```

**写成内联字面量的话，每一次 re-render 都会变成一次对焦** —— 比如手指在变焦条上拖一下。
另外没有手动对焦点时返回的是**空对象**，不是 `{ focusPoint: undefined }`：`convertNativeProps`
用的是 `Object.entries`，值为 `undefined` 的键也会被算进去。

### 19.5 两个"别骗用户"的决定

- **点下去 4 秒后镜头自动交回连续自动对焦**（`manualFocusResetDelay`）。一直锁在点上，
  后面拍的所有东西都会是虚的，而用户不会意识到是自己 4 秒前点了一下。
- **对焦框闪一下就淡出**（张开 130ms → 停 820ms → 淡出 340ms），不留着。
  一个永远亮着的框会让人以为"还锁着"，反而误导。

### 19.6 怎么触发的

**点取景器上任意一点**。那一层是透明的、铺满整个取景器（`focusCatcher`），
而且特意放在"换相框"那层**里面**：单击不会被抢走（`FrameSwitcher` 只在移动时接管），
横向滑动照样能换相框。

### 19.7 ⚠️ 踩过的大坑：expo-camera 默认用预编译产物，`ios/` 里的源码根本不参与编译

补丁写完、CI 全绿、IPA 也打出来了，但**补丁等于没打**。差分比对可以确认：
v1.0.0 与新 IPA 里的 `ExpoCamera.framework/ExpoCamera` 都是 859,952 字节、
**逐字节相同**，连 `setFocusPointOfInterest:` 这个 selector 都搜不到。

原因：expo-camera 57 包里带 `prebuilds/output/release/xcframeworks/*.tar.gz`，
`pod install` 期间 `expo-modules-autolinking` 的 `PrecompiledModules` 会把
podspec 换成 vendored framework —— `ios/**/*.swift` 一行都不编译。
（CI 日志里那句 `[Expo-precompiled] Precompiled modules:` 后面跟着 8 个 `📦`
就是这件事；七个 Expo 模块全在里面。）

**修法**：`package.json` 里点名让这一个 pod 回退到源码编译。

```json
"expo": {
  "autolinking": {
    "ios": { "buildFromSource": ["ExpoCamera"] }
  }
}
```

链路（都是读过源码的，不是推测）：`expo-modules-autolinking` 的
`autolinkingOptions.js` 里 `parsePackageJsonOptions` 从
`package.json → expo.autolinking.<platform>` 读出 `buildFromSource`
→ `scripts/ios/autolinking_manager.rb` 把它交给 `PrecompiledModules.configure`
→ `scripts/ios/precompiled_modules.rb` 里命中 pattern 的 pod 直接返回
`{ available: false, reason: :build_from_source }` → 该 pod 走源码。
其余 6 个 Expo 模块照旧吃预编译产物，编译时间基本不变。

本机可以自证，不需要 Xcode：

```
npx expo-modules-autolinking resolve --platform apple
# → configuration: { buildFromSource: [ 'ExpoCamera' ] }
```

⚠️ **判断补丁有没有生效，只能比二进制字节，不能搜字符串。** Swift 里的
ObjC 属性名不会以裸名留在二进制里 —— `videoZoomFactor` 在新旧两个 IPA 里
都搜不到（只有 `setVideoZoomFactor:`、`setFocusMode:` 这类 selector 在）。
只看字符串会得出完全相反的结论。

顺带一条：JS 多传的未知 prop 是**完全无害**的。
`expo-modules-core` 的 `ExpoFabricView.updateProps` 是遍历原生自己的
`viewManagerPropDict`、再用 `props[key]` 取值，JS 多传的键根本读不到。
所以在补丁还没生效的那一版里，`focusPoint` 只是静默无效，
**不会让相机报错**。

落地方式是 `patch-package`：`package.json` 里有 `"postinstall": "patch-package"`，
CI 的 `npm ci` 会自动套用。**注意 `patches/` 目录必须提交进 git** —— 漏了它，
CI 装出来的就是原版 expo-camera，点了没反应。

**改完 expo-camera 怎么重新生成补丁**：把 `node_modules/expo-camera` 里那三个文件恢复到原版
（原版可以从 `package-lock.json` 里那条 `resolved` 指向的 tarball 解出来），改好，
跑 `npx patch-package expo-camera` 生成新补丁；然后用**不带参数的** `npx patch-package`
从原版白盒复验一次能不能干净套上 —— 实测输出必须是 `expo-camera@57.0.6 ✔` 且 exit 0，
三个文件的 sha256 要和改完的一致。套用这一步不调用 npm，所以不受下面这个坑影响。

⚠️ 本机还有一个**只影响"生成"、不影响"套用"**的坑（2026-10 实测）：全局
`C:\Users\lizim\.npmrc` 里的 `allow-scripts=true` 会被 `npx` 以环境变量
`npm_config_allow_scripts=true` 传给它内部 spawn 的 `npm i --force`，而 npm 11 直接拒绝：
`npm error code EALLOWSCRIPTS / --allow-scripts is not allowed in project-scoped installs`。
**根因是 npx 的环境变量注入，不是 `.npmrc` 本身**（单独跑 `npm i --force` 是好的）。
绕法是直接用 `node` 调它的入口、绕开 npx：

```
node %LOCALAPPDATA%\npm-cache\_npx\<hash>\node_modules\patch-package\index.js expo-camera
```

### 19.8 相关文件

| 文件 | 作用 |
| --- | --- |
| `patches/expo-camera+57.0.6.patch` | 唯一的原生改动（纯新增 204 行 / 0 删除，3 个 Swift 文件） |
| `package.json` | `expo.autolinking.ios.buildFromSource: ["ExpoCamera"]` —— 让这个 pod 走源码编译，否则补丁不生效（见 19.7） |
| `src/components/CameraScreen.tsx` | `focusTarget` state、`cameraFocusProps`、`handleTapFocus`、那层透明 `Pressable` |
| `src/components/FocusReticle.tsx` | 对焦框（纯展示，`pointerEvents="none"`，不参与任何手势） |

---

## 20. App 内相册：沙盒里的第二份拷贝

需求原话：「创造一个 APP 内相册，不用每次都去系统相册查看。」

### 20.1 它是第二份拷贝，不是系统相册的镜像

照片**仍然照常存系统相册**，另外**再存一份到 App 自己的目录**。两个理由：

- **给别人看照片时**，不用在系统相册几千张里翻；
- **别人拿到你手机翻相册时**，不会在系统相册里就看到你 App 拍的全部片子。

删 App 内相册里的照片**不会**删掉系统相册里的原片 —— 它是拷贝，不是链接。

入口是顶部操作栏的**第 4 枚拨轮**（补光 / 翻转 / 设置 / 相册）。拍完自动进相册：
`handleShutter` 里存完系统相册之后调一次 `addShot()`，而且**故意不 `await`** ——
成片此刻已经落盘了，这一步只是拷一份到沙盒，慢几百毫秒不该让"冲洗完成"多等。

### 20.2 存哪儿、存多大

| 项目 | 值 | 为什么 |
| --- | --- | --- |
| 目录 | `Paths.document` 下的 `gallery/` | **刻意不用 cache** —— 系统清缓存不能把用户的照片清掉。代价是会进 iCloud 备份 |
| 索引 | AsyncStorage，键 `fretrocam.gallery.v1` | 改这个键 = 老用户的相册凭空消失，非必要不动 |
| 成片 | 长边 **2048** / JPEG 质量 **0.92** | 和预设里 `captureLongEdge` 的默认值一致，看不出二次压缩 |
| 缩略图 | 长边 **400** / 质量 **0.72** | 网格一屏二三十格，铺成片每张约 12 MB 位图，会把内存吃穿 |

网格里挂的**只是缩略图**；成片只在"点开看大图"那一步用，而且永远只有一张同时存在。

### 20.3 每次打开都重新读一次索引

**为什么不是"空了才刷"**：拍照那一侧是直接调 `galleryStore.addShot()` 写盘的，
**不走 `useGallery()` 这个 hook**（`CameraScreen` 用 `useGallery()` 会平白多一个跟取景毫无关系的
re-render 源）。所以 hook 的 state 并不知道刚拍了一张 —— 只要列表非空，
"空了才刷"就会让**最新那张永远差一次刷新才出现**，而那恰恰是用户要避免的事。

删除有二次确认（`Alert`），确认后**先落索引、再删文件**：反过来会留下一条指向不存在文件的
幽灵记录（网格里一块裂图）；现在最坏只是一个孤儿文件，清空相册时会被顺手扫掉。

### 20.4 ⚠️ 踩坑记录：`expo-file-system` 57 的旧 API 是"运行时抛错"，不是"过时警告"

`expo-file-system@57.0.7` 的 `package.json` 里 `exports` 只有两个入口
（`"."` 新 API / `"./legacy"` 旧 API），而主入口为了"看起来兼容"**又导出了一组同名旧函数** ——
`build/legacyWarnings.d.ts` 里 `copyAsync` / `documentDirectory` / `getInfoAsync` 每一行都写着
`This method will throw in runtime.`。所以在 57 上从主入口调 `copyAsync` **不是警告，是直接抛错**。
必须全程走新 API：`Paths.document` / `new File()` / `new Directory()`。

第二个陷阱：`exists` / `size` / `delete()` / `copy()` / `list()` 这些**实例方法不在 `File.d.ts` 里**，
它们写在原生基类的类型定义上 —— 只看 `File.d.ts` 会以为这些方法根本不存在。

`expo-image-manipulator` 57 同理：`manipulateAsync` 已废弃，要走
`manipulate(uri)` → `context.resize({...})` → `renderAsync()` → `saveAsync({...})` 这条新链。
**`resize` 只能给一个维度** —— 给两个维度会**拉伸变形**。

### 20.5 相关文件

| 文件 | 作用 |
| --- | --- |
| `src/utils/galleryStore.ts` | 存储层：串行队列、索引校验、成片 + 缩略图落盘、删除 / 清空 / 占用统计 |
| `src/hooks/useGallery.ts` | React 层：乐观更新 + 静默对账，把"失败"翻译成 `error` 诊断文案 |
| `src/components/GalleryScreen.tsx` | 三列缩略图网格 + 点开看大图 + 删除二次确认（绝对定位覆盖层，不引 react-navigation） |
| `src/components/CameraScreen.tsx` | 顶栏第 4 枚拨轮、`galleryVisible`、拍完那次 `addShot()` |

---

## 21. 补光改成闪光灯：一次改名、零行改图

需求原话：「补光模式改为闪光灯闪烁，不要一直亮着手电筒。」

以前是 `enableTorch`（**长亮的手电筒**），现在是拍照瞬间闪一下的闪光灯：

```tsx
flash={flashOn && facing === 'back' ? 'on' : 'off'}
```

### 21.1 前置摄像头下这个按钮是禁用的

iOS 的 `AVCapturePhotoOutput` 在**前置上没有闪光灯档位**（Retina Flash 是系统相机自己做的，
第三方拿不到）。原生侧有 guard 不会崩，但**按钮亮着却什么都不发生**比直接禁用更糟 ——
所以 `disabled={facing === 'front'}`，而且翻转摄像头时会顺手强制关掉
（`handleFlipCamera` 里的 `setFlashOn(false)`）。

### 21.2 一个诚实的细节：图标一直是闪电

那个图标**从它叫 `icon-torch` 的时候起，画的一直就是闪电**。所以这次只是把文件
从 `icon-torch.png` 改名成 `icon-flash.png`（`assets/ui/icon-flash.png` / `icon-flash-on.png`），
**重画前后字节完全一致** —— 没有一行图形代码变过。

| 元素 | 实现 |
| --- | --- |
| 图标 | `assets/ui/icon-flash.png`（灰）/ `icon-flash-on.png`（琥珀），注册在 `src/constants/uiAssets.ts` 的 `iconFlash` / `iconFlashOn` |
| 状态 | `flashOn` + `flash` prop（见上）；**不再有** `enableTorch` |
| 刻字 | 拨轮底下那行小字从「补光」改成「闪光灯」 |
| 无障碍 | 标签写的是**动作**：「打开闪光灯」/「关闭闪光灯」 |

---

## 22. 许可证与隐私

### 22.1 这不是开源软件

仓库根目录的 [LICENSE](LICENSE) 是一份**专有许可**，不是开源许可证：
「版权所有 © 2026 canyerylee。保留所有权利。」可以克隆、阅读、学习，
也可以通过官方渠道安装 App 供个人非商业使用；但**不得复制、发布、修改、商用**。

写这份文件的原因很直白：在它出现之前，仓库里没有任何许可证文件，
法律状态是「默认保留所有权利」—— 也就是说事实上已经等同闭源，只是没写明。现在写明了。

### 22.2 第三方组件

App 里打包了 Expo、React Native、React、Hermes、SDWebImage 等开源组件，
它们仍然是 MIT 许可；本仓库的专有许可**不会**、也不能收窄你在那些许可证下的权利。
完整清单（含版本与版权行）见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

其中一处需要单独说明：`patches/expo-camera+57.0.6.patch` 是对 MIT 许可的
`expo-camera@57.0.6` 的修改（见 [§19](#19-点画面对焦给-expo-camera-打了一个原生补丁)），
**该修改本身以 MIT 许可提供**。

### 22.3 这个 App 不联网、不上传

| 行为 | 实际情况 |
| --- | --- |
| 照片 | 只写进本机（系统相册 + App 沙盒内的 `Paths.document/gallery`），**不上传任何地方** |
| 网络请求 | 本仓库自己的代码里没有任何向自建或第三方服务器发请求的逻辑；没有接入任何分析 / 崩溃上报 SDK |
| 定位水印 | 默认**关闭**；开启后坐标是纯离线算出来的。选「地名」档时调的是系统反查服务（iOS 走苹果、Android 走谷歌），**那一步会联网** —— 但结果只写进那张照片，App 自己不上传 |
| 权限 | 相机 / 相册 / 定位都只在真正用到时才申请，拒绝也不影响其他功能 |

### 22.4 仓库是私有的

2026-10-10 起本仓库已转为 **私有**，有三个直接后果：

- **Release 里的 IPA 直链失效了** —— 私有仓库的资产不登录下载不了。
  给朋友装 App 现在只能**直接把 `.ipa` 文件发过去**，
  见 [给朋友：怎么装 FretroCam.md](给朋友：怎么装%20FretroCam.md) 第 8 节。
- **GitHub Actions 开始计费**：Free 账号私有仓库每月 **2000 分钟**，macOS 机器按
  [**约 10 倍**](https://docs.github.com/en/billing/reference/actions-runner-pricing)扣
  （Linux 2 核 $0.006/分钟，macOS 3~4 核 $0.062/分钟），
  折成**真实的 macOS 时间大约是每月 200 分钟**。本项目一次构建实测 4~5 分钟
  （release 版 `pod install` + `xcodebuild`）—— 也就是**一个月大约能跑 40 次**。
  作为参照：从 v1.0 到 v1.3.0 整个开发过程一共跑了 **21 次**，合计约 **70 分钟**真实
  macOS 时间、折算约 **700 分钟**额度，大概是**一个月份额的 1/3**。
  所以 `.github/workflows/build-ios-ipa.yml` 的 push 触发器加了 `paths-ignore`，
  纯文档提交（`**.md` 等）不再构建。
  另一条容易撞的墙是**工件存储上限 500 MB**（分钟数是按月清零的，存储是按小时累计的）：
  每个 ipa 约 9 MB，本仓库当前存了 11 个工件、共 88 MB（约 17.6%）。
  留着一堆旧工件不会额外扣分钟数，但会占满这 500 MB。
  真不够用了有四条路：① 把仓库改成 **public** —— 公开仓库的标准 runner **完全不限量**；
  ② 在 Actions 页面把本 workflow 整个 **Disable** 掉，需要时再手动 `Run workflow`；
  ③ 删掉旧工件腾存储；④ 直接买额度，macOS 是 **$0.062/分钟**，
  一次 5 分钟的构建约 **$0.31**。
- 已经 fork 出去的副本不受影响（转私有收不回来）。本仓库转私有当刻的 fork 数是 **0**。

---

## 23. v1.2.0：这一版改了什么（八件事）

这一版没有加新功能，是把"看起来像复古相机"换成"用起来像一台相机"。
八件事按用户提的顺序列，每条都说清**为什么这么做**以及**哪些还没在真机验证过**。

### 23.1 硬件侧键：Camera Control 与音量键可以按快门

新增本地 Expo 模块 [`modules/physical-shutter/`](modules/physical-shutter/)，
暴露一个事件 `onPhysicalShutterPress`，JS 侧封装成
[`src/hooks/usePhysicalShutter.ts`](src/hooks/usePhysicalShutter.ts)：

```tsx
const shutter = usePhysicalShutter({
  enabled: isFocused && !isCapturing,
  onPress: handleShutter,   // 快门忙时由这里忽略
});                          // 返回 { supported, active }
```

几条不能改的事实：

| 事实 | 出处 / 理由 |
| --- | --- |
| 框架是 **AVKit**，不是 AVFoundation | `AVCaptureEventInteraction` 的声明框架 |
| 可用性是 **iOS 17.2+**，不是 18 | Apple 文档；本项目 deployment target 仍是 **16.4**，所以每处引用都包在 `if #available(iOS 17.2, *)` 里 —— **不要提高 deployment target** |
| podspec 的 `s.platforms` 必须写 `{:ios => '16.4'}` | `expo-modules-autolinking` 会把 deployment target 不兼容的 pod **静默跳过**，只打一行 `UI.warn`；写 17.2 等于模块凭空消失 |
| `AVCaptureEvent` **没有**按键身份字段 | 只有 `phase` / `shouldPlaySound` / `play(_:)`，所以事件里也没有 `source` —— **区分不了 Camera Control 和音量键**，三者都接同一个快门 |
| 拍照取 `.ended`（松手） | Apple 官方示例即如此；`.began` 用来预热 |
| 必须自己强引用 interaction | Apple 示例里 `view.addInteraction(...)` 之后还有 `eventInteraction = interaction` |
| 挂在 key window 的 `rootViewController.view`，**不加覆盖层** | alpha=1 的透明 UIView 默认会被 hit-test 命中，会把点按对焦 / 捏合 / 快门一起吃掉 |
| `OnStartObserving` 挂、`OnStopObserving` 摘 | 相机页不活跃时把实体键还给系统，否则按键变死键 |

**iOS 17.2 以下没有公开 API 能拿音量键** —— 17.2 之前那套
（`MPVolumeView` KVO、KVC `AVSystemController`、`_UIApplicationVolumeUpButtonDownNotification`）
全是私有 API，本项目一条都不用。那些设备上 `supported === false`，功能就是空操作。

> ⚠️ **未验证**：这台开发机是 Windows，没有 Xcode，**Swift 代码从未编译过**。
> 能不能编过、`pod install` 能不能解析、真机上按键会不会触发，全部要靠 GitHub Actions
> 和真机。风险集中在 `@MainActor` 隔离与尾随闭包对应的具体 Swift 名。

### 23.2 顶栏重做：画幅徽标 + 胶片计数

原来顶栏是一整行等宽文字 `白边印刷 · 2/3 · RETRO 400`，信息密度低、还占一行，
而且那串字描述的"白边印刷"在新相框上根本不成立。现在：

- **左上** `FrameBadge`：用两层嵌套 `View` 按真实比例画出外纸边与画面窗口，
  右边是画幅名（走 i18n 的 `frame.polaroid600` 等键）+ 整数画幅比
  （`1:1` / `3:4`，由浮点比 ×1000 求 GCD 化简，化不出来才退两位小数）与 `{当前}/{总数}`。
  **点一下切下一个画幅**（原来是左右滑动，见 23.6 的说明）。
- **右上** 胶片计数徽章 `` `[${String(n).padStart(2,'0')}${A|B}]` ``，
  A = 后摄、B = 前摄，翻转相机归零，每存一张 +1。从 `[00A]` 起。
- 四枚拨轮（闪光灯 / 翻转 / 设置 / 相册）保留，**去掉了下方的小字说明** ——
  图标本身已经说明问题，小字在 38pt 的按钮下面只是噪点。

### 23.3 十个预设改工业代号

原来直接写着柯达、富士、CineStill 的注册商标（`PORTRA 400`、`VELVIA 50`、
`CINESTILL 800T` …）。这是这一版唯一的**法律动机**改动：仓库已经闭源，
但商标风险与开源无关，谁都能投诉。

| 旧显示名 | 新显示名 | `id`（**一个都没动**） |
| --- | --- | --- |
| RETRO 400 | `RT-400` | `retro-400` |
| PORTRA 400 | `PR-400` | `portra-400` |
| GOLD 200 | `AU-200` | `gold-200` |
| SUPERIA X | `SP-400` | `superia-x` |
| VELVIA 50 | `VV-50` | `velvia-50` |
| CCD CYBER | `CCD-CYBER` | `ccd-cyber` |
| CINESTILL 800T | `800-T` | `cinestill-800t` |
| DIGICAM 2002 | `DIGI-02` | `digicam-2002` |
| TRI-X 400 | `TX-400` | `tri-x-400` |
| EXPIRED 64 | `EXP-64` | `expired-64` |

> `id` 是**持久化标识** —— 它写进相册索引和每张成片的元数据，改了老用户的照片就对不上号。
> 所以只改 `name`，`id` 里残留的品牌词是有意留下的。

胶片行也从"左右滑动换预设"改成**整行一个按钮**：轻点切下一个（`selectionAsync` 震一下，
按住时整行左移 7pt 当作按压反馈），**长按 400ms** 弹出胶卷抽屉（十张卡两列网格，
面板完全不透明）。序号用 `padStart(2,'0')` 定宽槽 —— 一位数和两位数宽度不同，
不定宽的话每切一张整行都在抖。

### 23.4 变焦改成三档：0.5× / 1× / 2×

原来的百分比变焦条读数是"数码变焦倍率的百分比"，用户看不懂，而且它压在取景器底部、
和快门抢视线。现在换成三个**等宽**档位按钮，位置挪到快门上方：

| 档 | 对应 | `factor` |
| --- | --- | --- |
| `0.5×` | 超广角镜头 | 1 |
| `1×` | 主摄 | 1 |
| `2×` | 主摄数码裁切（角落标一个 `D`） | 2 |

为什么用 0.5/1/2 而不是 13/26/35mm：这三个数就是 iPhone 自己的相机语言，
用户不用换算。**判据是 `factor > 1` 才算数码裁切** —— 拿 `multiplier` 去比会把
0.5× 判反（0.5 < 1）。

> 一个反复踩到的回归点：档位容器的宽度**只由窗口宽度决定**
> （`Math.min(232, round(window.width * 0.62))`，写死在轨道上），三格 `flex: 1` 均分，
> 选中态是画在格子**内部**的绝对定位"抬起柱"。早期版本用 flex 分配轨道宽度，
> 结果点最左边那档时整排会往左挪 —— 这个回归在 `ZoomStops.tsx` 的文件头里写成了禁止项。

双指捏合保留（`usePinchZoom`，每八度 0.5 的指数刻度）；捏合之后档位高亮清空，
因为此时倍率不再等于任何一个档。主屏原来那条**颗粒强度分段条删掉了**，
搬进设置页 —— 见 23.7。

### 23.5 水印：四种版式 + 两档地名详细度 + 五语言地名

设置页新增两项，加上原有的定位三档，水印这一块现在有四个自由度：

| 设置 | 取值 |
| --- | --- |
| 定位水印 `locationMode` | `off`（默认）/ `place`（地名）/ `coords`（经纬度） |
| 地名详细度 `placeDetail` | `archive`（城市 + 国家）/ `full`（省/区 + 城市 + 国家） |
| 水印版式 `watermarkLayout` | `split` / `stacked` / `centered` / `dateOnly` |
| 颗粒 `grainLevel` | `off` / `light` / `std`（默认）/ `heavy` / `max` |

**四种版式只决定"地名和日期怎么摆"，摆在哪个矩形里由相框的 `watermark.anchor` 决定** ——
所以加版式不用改相框，加相框也不用改版式。四种版式在
[`src/utils/geometry.ts`](src/utils/geometry.ts) 的 `computeWatermarkPlan()` 里
归约成同一个 `WatermarkLine[]`，合成层只负责画，没有任何 `switch`。

**墨色是按"压在照片上还是印在相纸留白上"分的，不是按预设颜色直接取**：

| 锚点 | 日期 | 地名 | 辉光 |
| --- | --- | --- | --- |
| `window`（压在照片上） | 预设的 `timestamp.color`（默认 `#FF8A00`） | `rgba(236,232,224,0.88)` | 有（琥珀辉光或黑投影） |
| `frame`（印在相纸留白上） | 石墨相框 `#5F6368`、琥珀相框 `#B45309` | 同左 | **无** |

这一条是修 bug 修出来的：原来墨色只看 `tone` 不看锚点，而 `polaroid-600` 与
`slide-mount` 恰好是"白相纸 + 石墨调"，于是白纸上印了一行接近纸白的字。
反方向同理 —— 白留白上用液晶琥珀 `#FF8A00` 太亮，必须暗一档。
辉光也是：白纸上围一圈阴影看着像蹭脏了，所以 `frame` 锚点一律 `glowRadius = 0`。

**港澳台在**所有五种语言**里都带本语言的「中国」前缀**，且**永远不会输出裸的
「台湾 / 香港 / 澳门」**（`src/utils/placeNames.ts` 的 `CHINA_PREFIX`，
类型是 `Record<LocaleId, string>` —— 将来加语言时 `tsc` 会在那里报错提醒）。

> ⚠️ **已知局限，写在代码注释里也写在这里**：英文档的罗马字化不完整。
> iOS 中文系统下 `reverseGeocodeAsync` 基本只回本地名，
> 于是英文界面下可能看到 `台北 · China台湾` 这种中英混排。
> 没有音译表就不做依赖，**宁可混排也不猜**。

### 23.6 相框按真实物理规格重做，从 8 款砍到 4 款

旧 8 款里"暗房放大""打样张""档案卡"都是**为了像旧照片而画上去的**东西
（污渍、划痕、四色色标、打孔）。真实的相纸不长那样。新版四款各自对应一件真实实物，
**留白不说话、纸要像纸**：

| `id` | PNG | 画面窗口（px） | 宽高比 | 实物依据 |
| --- | --- | --- | --- | --- |
| `polaroid-600` | 1408×1712 | `72,72,1264,1264` | 0.822430 | 600 系即时成像（88:107），方形画面 + 厚下巴 |
| `instax-mini` | 1080×1720 | `81,90,918,1224` | 0.627907 | instax mini 画幅（54:86） |
| `neg-135` | 1350×1950 | `212,280,926,1389` | 0.692308 | 35mm 胶片 24×36mm 与 2.8×1.98mm 齿孔，按 38.6 px/mm 放大 |
| `slide-mount` | 1350×1350 | `189,351,972,648` | 1.0 | 50×50mm 幻灯卡与 36×24mm 开孔 |

默认相框从 `classic-white` 改成 **`polaroid-600`** —— 0.822 的画幅比最接近手机屏幕，
取景器里浪费的黑边最少。相框素材只占 36.4 KB（旧 8 张约 350 KB），
因为新版是**调色板 PNG + 透明索引**，而不是带抗锯齿渐变的 24 位图。

`neg-135` 的齿孔是**真透明**：片基画到画布边缘，透明处露出
[`FilmCompositor.tsx`](src/components/FilmCompositor.tsx) 里 `styles.stage` 的
`backgroundColor: '#000000'` —— 所以在 App 里孔是黑的。
（预览脚本 [`scripts/preview_frames.py`](scripts/preview_frames.py) 会把照片铺满整格，
所以那张对照图里孔透出的是照片。**两张图不一样是对的**，不是 bug。）

相框从 8 款砍到 4 款还有一个交互上的后果：`FrameSwitcher` 的左右滑动
不再是唯一的切换方式，左上角画幅徽标点一下也能切 —— 4 款的话滑动反而不如点。
`FrameSwitcher.tsx` 一行没改，它只做手势与 `Animated.View` 包装，不渲染相框名字。

### 23.7 相册灯箱、`RETRO CAM` 相簿、设置页扩充

- **灯箱**（[`src/components/Lightbox.tsx`](src/components/Lightbox.tsx)）：全屏看图，
  可捏合缩放（1~4 倍）、下拖关闭（96pt 或 `vy > 1.2`）、双击复位。
  它**没有用** `usePinchZoom` —— 那个 hook 的量纲是"相机变焦"的 0~1 指数刻度 + 增量回调，
  既没有平移也没有下拖；灯箱里自建了一个本地 PanResponder，量纲是视觉缩放倍数。
  "捏合时那次单击不算关闭"落在两处：`onStartShouldSetPanResponderCapture` 只在
  双指时抢手势；松手时要求"没捏过 && 位移 ≤ 12pt && 手指已离开"才认点击。
- **存进专用相簿** `RETRO CAM`：`Album.get()` → 没有就 `Album.create()` →
  `album.add(asset)`。**三级降级，全部不抛错**：拿不到相簿就直接写相机胶卷；
  相簿拿到了但后续失败也**返回成功并标 `destination: 'camera-roll'`** ——
  理由是 `Asset.create` 很可能已经把照片写进库了，异常里判断不出"到底写没写"，
  再调一次就是在赌会不会多出一张**重复照片**。"宁可少一个相簿归类，不能多一张重复照片"。
- **模态遮罩改成完全不透明** `#0E0F11`。这是用户报的真实 bug：原来遮罩是半透明的，
  取景器的实时预览会透到设置页和相册页上，看着像花屏。
  （`#0E0F11` 在 `SettingsScreen.tsx` 与 `GalleryScreen.tsx` 里各写了一份，
  **改一处必须同时改另一处** —— 常量目录里没有它的位置。）
- **全局触觉收敛成两档**：`selectionAsync()` 与 `impactAsync(Light)`，
  原来的 `Medium` 全部降档。同一个 App 里出现重、中、轻三种强度，手感反而是乱的。
- **地名详细度在定位为 `off` / `coords` 时置灰而不是隐藏** —— 隐藏会让用户以为
  这一项不存在，置灰能看出"它得先开地名档才有意义"。

### 23.8 App 图标按方案 B 重绘

`assets/icon.png`：1024×1024、**RGB 无 alpha**（iOS 要求，带 alpha 会被拒），
深灰底 `#141518`、暗盒筒身 `#2A2C31`、银色顶盖 `#C8CCD2`、
橙色标带 `#E8551F` 写 `ISO 400`、下端一个六叶光圈符号。扁平矢量，无渐变无噪点。

生成脚本 [`scripts/generate_app_icon.py`](scripts/generate_app_icon.py) 用 4096 超采样
再缩回 1024（所以实测有 926 种颜色，**全部来自抗锯齿**，设计本身只有 4 个色）。
`ISO 400` 在 40px 下读不出字（缩成两道暗痕），这是小字号的必然，不是渲染问题。

> 已知弱点：筒身 `#2A2C31` 与底色 `#141518` 的亮度只差约 2 倍，40px 下剪影偏弱。
> 想更硬气需要把筒身提亮到 `#3A3D44` 一类，但那偏离了指定的色号。

### 23.9 这一版**没有**在真机验证过的东西

| 项 | 为什么没法在这台机器上验证 |
| --- | --- |
| 侧键模块的 Swift 能否编译 | Windows 没有 Xcode，代码从未编译过 |
| `pod install` 能否解析 `ExpoPhysicalShutter` | 本机没有 CocoaPods |
| 真机按 Camera Control / 音量键是否触发 | 没有真机跑过 |
| `.ended` 是不是正确的触发相位 | 同上；改一行常量即可换 `.began` |
| 灯箱的双指捏合能否与父层 `Pressable` / `FlatList` 抢到手势 | 需要真机 |
| 英文档地名罗马字化的实际输出 | 依赖 iOS 反查返回什么 |
| 分享在 Android 上不完好 | `expo-sharing` / `expo-clipboard` 都不在依赖里，只能用 RN 内置 `Share.share`，Android 只认 `message`（分享出去是文字不是图片） |

---

## 24. v1.3.0：按十一节规格重构

这一版覆盖原生模块、渲染管线、素材与相册四块。下面按"改了什么 / 为什么 / 怎么验证"写。

### 24.1 胶片噪点：删掉彩噪贴图，颗粒改银盐团簇

用户报的是"画面严重彩噪与紫绿噪波"。根因**不在** JS 逐像素循环里 —— 这个 App 根本没有
逐像素循环，噪点来自两张**预烘焙的 512×512 贴图**，由 `gradeLayers.ts` 用 `overlay` 叠上去：

| 贴图 | \|R−G\| | \|R−B\| | \|G−B\| | 结论 |
| --- | --- | --- | --- | --- |
| `grain.png` | **0.000** | **0.000** | **0.000** | 三个通道逐像素恒等 → 本来就是单色亮度颗粒 |
| `chroma-noise.png` | **49.276** | 14.703 | **34.573** | **满屏紫绿噪波只来自这一张** |

只有两款预设开了它：`CCD-CYBER` 的 `grainChroma: 0.46` 与 `DIGI-02` 的 `0.34` —— 正好就是
用户看到严重彩噪的那两款。

**处理：整链删除** `grainChroma` / `chroma-noise`。涉及 `types/index.ts`（`FilmPreset`、
`ResolvedFilmPreset`、`TextureId`）、`presets.ts`、`gradeLayers.ts` 第 13 层、贴图文件、
`generate_placeholder_assets.py`、`preview_grade.py`、`textures.ts`、README。
`TextureId` 从 5 个变成 4 个（`grain` / `dust` / `vignette` / `lightLeak`）。

> ⚠️ **不要再把任何"逐通道各取一个随机数"的彩噪加回来。** 单色颗粒是这类 App 的底线：
> 一旦某个通道单独抖动，成片上就是数码杂色而不是胶片颗粒。

**颗粒强度整体 ×0.4**：默认 `0.22 → 0.088`，十款预设各乘 0.4
（`0.3/0.2/0.24/0.26/0.2/0.3/0.3/0.38/0.38/0.34` → `0.12/0.08/0.1/0.1/0.08/0.12/0.12/0.15/0.15/0.14`）。
`GRAIN_LEVELS` 五档的 `scale`（`off` 0 / `light` 0.45 / `std` 1 / `heavy` 1.5 / `max` 2.2）
**一个都没动** —— 那一层是给用户调相对量的，动它就等于把滑块刻度也改了。

**`grain.png` 重做成多尺度团簇**：`fine + 0.5·box_mean(fine,2) + 0.25·box_mean(fine,4)`，
z-score 归一化到 σ=59，存成 **8 位灰度 `L` 模式**。
为什么不是逐像素白噪声：成片是在 3× 屏幕上渲染的，1 个贴图像素铺到 3×3 输出像素再被插值
抹平，逐像素白噪声的对比度只剩约 0.35 倍，剩下的观感是"电子沙沙声"；真实胶片的颗粒是
**银盐团簇**，所以叠三个尺度。盒平均用**环面**（`np.pad(mode="wrap")` 后滑窗），
这样平铺时接缝处不会出现一条断层。

实测：三通道差 `0.000000000`、σ = `57.4003`、均值 `127.3230`、平铺接缝差与图内相邻差同量级。
`mode=L` 是**构造性保证** —— 物理上没有第二、第三条通道可以抖。

### 24.2 §三 顶栏：画幅徽标改成文字胶囊

`FrameBadge.tsx` 205 → **151** 行，整块重写。原来它是"按 `frame.aspect` 画一个小矩形 +
渲染胶卷名"，现在只渲染文字胶囊：

- 内容 `▌ {code} · {n}/{N}`，例如 `▌ INSTANT SQ · 01/07`
  （v1.3.0 原为 `▌ POLAROID · 01/04`，代号里的厂商商标在 v1.4.0 已清掉，见 §25）；
- `▌` 是一个独立 `View`（宽 3、高 12、圆角 1、琥珀橙 `#E5A93C`），不是字符 ——
  字符在不同字体下宽度会变，徽标会跟着抖；
- 胶囊 `backgroundColor: 'rgba(255,255,255,0.08)'`、`borderRadius: 4`、
  `paddingHorizontal: 8`、`paddingVertical: 4`、等宽字体 12px、`maxWidth: '42%'`；
- **胶卷名从顶栏彻底移除** —— 它归左下角那张大卡片独占。原来两处都显示，
  375pt 机型上顶栏那行会被截成 `RE…`，正是用户报的溢出问题。

`FrameSpec` 为此新增了**必填** `code: string`（纯 ASCII 大写、五语言里都长一样、**不翻译**）：
v1.3.0 是 `'POLAROID'` / `'INSTAX'` / `'135 NEG'` / `'SLIDE'`，v1.4.0 起前两个换成
`'INSTANT SQ'` / `'INSTANT MINI'`（厂商商标，见 §25）。

`N` 用的是**相框总数**（v1.3.0 是 4，v1.4.0 起是 7）。规格里 `02/08` 与 `01/04` 两个分母对不上，判定那只是示范格式。

### 24.3 §一 物理侧键触发重触觉

`CameraScreen.tsx` 里 `onPress` 改成先 `void impactAsync(Heavy)` 再 `void handleShutter()` ——
**不 `await`**：等触觉返回再拍照会平白多等一帧，而快门是要抢那一下的。
`Heavy` 是**全项目唯一**允许出现重触觉的地方（侧键按下去要有"咔"的实感），
其余交互仍然是 `selectionAsync()` 与 `impactAsync(Light)` 两档。

侧键模块本身在 v1.2.0 就已经进包了（`modules/physical-shutter`），
`#available(iOS 17.2, *)` **保持不动** —— 规格里写的 18.0 不是 Apple 的真实可用性门槛，
照抄会让 17.2–18.0 的真机白白失去这个功能。

### 24.4 §四 胶卷抽屉与折行修复

- **折行 bug**：预设序号到 10/10 时，底部"轻触切换"被拆成两行。
  根因是那行 `Text` 没有 `numberOfLines`，两位数把宽度挤爆后按字断行。
  修法是**双保险**：文案从"轻触切换 / tap to switch / toucher pour changer"
  精简成"切换 / switch / changer"，同时加 `numberOfLines={1}` + `adjustsFontSizeToFit`
  + `minimumFontScale={0.75}`。
  （附带发现：底栏在 v1.2.0 重做成 `[序号] ◀ 胶卷名 ▶` 之后，这条提示已经**不再渲染**，
  只剩 `accessibilityHint` 在用；折行是被重设计顺带修掉的，结果一致。）
- **抽屉**：高度 `window.height * 0.58` 夹在 `[380, h*0.62]`，底色 `#1A1A1A`，
  标题 `SELECT FILM STOCK · 胶卷库`，右上 `✕`（触控区 ≥ 44×44pt），2 列 × 10 卡，
  选中卡琥珀橙边框 + 右上 `✓`，长按 400ms 触发 `impactAsync(Medium)`。
- 标题的五语言规则也改了：**英文牌是机身刻字、永不翻译**（`SELECT FILM STOCK`），
  ` · ` 后面那个词才是给人看的说明（`胶卷库` / `底片庫` / `フィルムライブラリ` / `FILM LIBRARY` / `FILMOTHÈQUE`）。
  原来是"五种语言共用一整串"，加了本地词之后就不再相同了 —— 注释已同步改写。

### 24.5 §五 主屏减负

颗粒条在 v1.2.0 就已从主屏移除、降级进设置页（`grainBar` / `handleGrainSelect` /
`grainSegment*` 在主屏零残留）。变焦仍是三档等宽按钮
（`ZoomStops.tsx` + `lenses.ts` 的 `ZOOM_STOPS`：`ultraWide05` / `wide10` / `wide20`），
容器宽度只由 `Math.min(232, round(window.width * 0.62))` 决定、与选中项无关，
选中态是画在格子**内部**的绝对定位柱，不参与布局。

### 24.6 §六 水印：七段石英日期 + 度分秒 + 国家前缀

**日期不再是文字。** 新增 `SegmentDate.tsx`（纯 RN `View` 手绘七段数码管，
不引字体、不引 SVG、不用 `Text`）。斜切梯形而不是直角矩形，**不画灭段**
（灭段在成片尺度上会糊成一片灰），用 `memo` 包装、不用 `Animated` ——
成片是 `react-native-view-shot` 抓的静态帧，动画只会让抓拍时机不确定。

字模 `QUARTZ_DATE_FORMAT = "'YY  MM  DD"` —— **前导单引号是真实字符**
（石英后背就是这样印年份的），年月日之间两个空格。

**灯管高度 = 日期字号 × 0.58**（`QUARTZ_HEIGHT_SCALE`，另有 `MIN_QUARTZ_HEIGHT = 6` 下限）。
规格要的是"字号 10~11pt"，但字号从 v1.0 起就跟**画面窗口宽度**成比例
（`fontSize ∝ window.width`），这条规则本轮没有松动 —— 松了就等于让相框越小字相对越大。
0.58 是两者的折算：窗口宽 321pt 时字号 18pt → 灯管 10.4pt（达标），
窗口宽 258pt 时字号 14pt → 灯管 8.1pt，再小的相框会到 7pt。
**要"任何相框上永远 10~11pt"，只能改 `fontSize ∝ window.width` 那条规则本身**，
那是比这一项大得多的回归，所以留在 0.58 这个取舍上，特此记一笔。

**"日期再也不会被截断"是算出来的，不是靠 `flexShrink: 0` 碰运气**：
`geometry.ts` 导出 `segmentDateWidth(text, height, gap)`，`computeWatermarkPlan` 用它算出
`WatermarkLine.quartz.width`，`SegmentDate` 用**同一个函数**算容器宽度与每格落点。
两边共用一份定义，所以不可能对不上。`quartz` 的存在是一条硬契约：
**有它的行必须交给 `<SegmentDate/>` 画，不能退回 `<Text>`**（文字行会被 flex 规则压缩）。

`placeNames.ts` 的坐标改成**度分秒**：`LAT 23°02'N LON 114°24'E`。
先把绝对值乘 60 再 `Math.round`，然后才拆度与分 —— 顺序反了会印出 `23°60'` 这种不存在的坐标。
纬度在前，秒舍入到分（`59.6′` 会进位成下一度的 `00′`）。

**国家/地区前缀**按新规格重写，五语言各一份：

| | 简体 | 繁體 | ja | en | fr |
| --- | --- | --- | --- | --- | --- |
| 港澳台的前缀 | `中国` | `中國` | `中国` | `CHINA` | `CHINE` |
| 档案档 | `中国 · 广东 · 深圳` | `中國 · 廣東 · 深圳` | 同简中形状 | `SHENZHEN, GUANGDONG / CN` | 同 en 形状 |
| 完整档 | `中国广东省深圳市` | `中國台灣省台北市` | — | `TAIPEI, TAIWAN, CHINA` | — |

港澳台在**所有语言的每一档都无条件加前缀**，永远不会裸输出 `台湾` / `香港` / `澳门`。
区码一律写 `CN` 而不是 `TWN` / `HKG` / `MAC` —— 那是把中国的地区写成了国家。
`CHINA_PREFIX` 与 `GREATER_CHINA_LABEL` 都声明成 `Record<LocaleId, …>`：
**将来加第六种语言时，tsc 会在这一行直接报错**，不会悄悄漏掉。

关定位时印**摄影代号**：`PR-400 // ISO 400 · 35MM · EXP.07`。
代号就是 `preset.name`；ISO 从代号里**解析最后一段连续数字**（`PR-400`→`400`、`DIGI-02`→`02`
保留前导零）；解析不出来时（`CCD-CYBER` 这种纯字母）**整段 `ISO xxx` 丢掉**，不猜不编。
`EXP.` 用的是 `exposureIndex`（**1 起数**）。

> 这一项在 v1.2.0 是"透传了但没人读"的状态 —— 设置项改了不影响成片。
> 本轮由 `FilmCompositor` 真正消费（`formatExposureCode` + `useMemo` 依赖表），
> 并且**顺手补了同一类型的第二个洞**：只有坐标、没有城市时 `formatResolvedPlace`
> 返回空串，整行地名会被丢掉；现在退回 `place.coords`。

### 24.7 §七 四款相框按物理规格纠偏

| id | PNG | 开孔 px | 开孔宽占比 | 改动 |
| --- | --- | --- | --- | --- |
| `polaroid-600` | 1408×1712 | (72, 72, 1264, 1264) | 89.77% | 纸色改 `#F7F6F2`，开孔**外**侧加 1.5px `rgba(0,0,0,0.12)` 内阴影 |
| `instax-mini` | 1080×1720 | (81, 90, 918, 1224) | 85.00% | **逐字节未变**（本来就是 `#FAFAFA` + 6px 圆角，是任务书写错了） |
| `neg-135` | 1350×1950 | (212, 280, 926, 1389) | 68.59% | 片边墨色改暖橙黄 `#E8A33C` + 浅白 `#F2EFE6`，`C-41 135` → `PROCESS C-41` |
| `slide-mount` | 1350×1350 | (189, **403**, 972, 648) | **72.00%** | 开孔**居中偏下**（上留白 403 / 下 299 = 1.348），`SLIDE MOUNT` 缩到 34pt、改 `#A0A09A` |

- `slide-mount` 的**宽度一个像素都没动**：`972/1350 = 72.000000%` 已经在规格要的 68–72% 内
  （上沿），而 `972×648` 是**精确的 3:2**。压到区间中位（70% → 945px）就必须放弃 3:2。
- 内阴影画在开孔**外侧**：往孔里画 12% 黑必须带半透明 alpha，既会破坏"alpha 直方图只有
  0/255"这条硬约束，又会压暗照片。画在外侧纸面上只改 RGB，孔仍是干净的透明。
- 四款相框实测**半透明像素 = 0 px**，窗口逐点不符 **0 px**，两个独立全量 pass 的
  SHA256 逐字节一致。

**`▷` 是这一版抓到的一个真 bug。** `generate_frames.py` 里原来用 `paste_text("▷ 12A")`
印片边帧号，而 `ImageFont.load_default()` 在这个环境里**只带一套极窄的默认字形，基本只有
ASCII** —— `▷`(U+25B7) 落到 `.notdef`，印出来是**"方框里画个叉"的豆腐块**，不是三角。
判定方法：把待测字符与私用区码位 U+E000（必定缺字形）的渲染逐像素比对，
`'A'`/`'1'`/`'-'` 都不同，而 `▷`/`▶`/`△`/`•` 四个**全部相同**。

所以新增 `right_triangle()`：用 `ImageDraw.polygon` 画图元，绕**重心**缩一个 0.42 得到镂空。
为什么按重心缩而不是逐顶点内缩 —— 三角形三个内角不一样大，逐顶点固定内缩的笔画粗细不均，
锐角那头会断。底下的片基纹理原样透出，不在深色片基上留一块死色补丁。

> 教训：**`ImageFont.load_default()` 没有几何符号字形。画进 PNG 的文字一律限 ASCII，
> 符号一律用图元画。**

### 24.8 §八 相册导入重冲印（类似 Dazz）

相簿页顶部新增【＋ 導入】。`importPhoto.ts`（新，458 行）导出
`importAndDevelop(options)`：选图 → 读 EXIF → 逐张走同一套冲印管线 → 存 `RETRO CAM` → 返回 uri 列表。

- 依赖新增 `expo-image-picker@~57.0.20` + `app.json` 插件 + `NSPhotoLibraryUsageDescription`。
- **EXIF 拍摄时间优先**：`DateTimeOriginal` 的**顶层键与 `{Exif}` 嵌套键两种都试**
  （`expo-image-picker` 的 `ImageUtils.swift` 会把 `{Exif}` 拍平、给 `{GPS}` 加 `GPS` 前缀
  后塞进顶层，但这条推断没有真机验证过，所以两级都留着）。
  读不到就回落到今天，并提示一次 `gallery.import.noExif`。
- **GPS 同理**：有历史坐标就解析历史地名。
- ⚠️ **导入路径绝不调用 `useLocationStamp` / `fetchLocationStamp`** ——
  那会拿**当前设备位置**去给一张十年前的老照片配地名，比不印更糟。没有坐标就静默走摄影代号。

### 24.9 §九 35mm 连续底片长卷

`StripView.tsx`（新，1052 行）。相簿页双模式，**默认长卷**：

- 背景 `#0A0A0C`，上下两条**贯穿整屏、完全相连**的 36pt 齿孔轨道。
  齿孔用 `#0A0A0C` 的小圆角矩形**盖**出来而不是真抠洞 —— 真抠洞会引入 alpha 合成，
  滚动时每一帧都要重算，而盖色是纯 GPU 填充。
- 轨道暗码：上轨帧号 `▷ 01`（1 起数），下轨 `PROCESS C-41`。
- **过片触觉挂在 `onMomentumScrollEnd` 而不是 `onScroll`**：
  `selectionAsync()` 是异步的，`onScroll` 在惯性阶段一秒能来上百次，连发会让马达糊成一片。
  "滑过一张"定义为"一次滑动落定后停留位置与上次不同"（用 ref 去重）。
- **6.25% 打滑彩蛋用 `index % 16 === 0`，不是 `Math.random()`** ——
  随机数每次重渲染都会得到不同结果，底片会在滚动中不停跳。
  现在完全确定、可复现、可断言（滚 200 张实测 13 张 = 6.50%）。
  打滑时**只改 `translateX` 把后一张拉回来叠**，不动间距 ——
  改间距会让总长和 `snapToInterval` 一起乱。
  `A` 后缀的规则：只有打滑时，后一张的号才是 `{前一张号}A`。
- 切片导出支持连续 3 或 4 张，高分辨率拼合成带齿孔的条状海报存进系统相册。
  **导出键一直存在、只置灰**（按钮凭空出现/消失会让人以为点错了），
  置灰态只降不透明度、不缩尺寸（否则选够的那一刻按钮会跳位，正要点的手指落空）。

### 24.10 §十 灯箱删除键与遮罩

- 遮罩从 `#0E0F11` 改成 **`rgba(18, 18, 18, 0.98)`**，进一步阻断底层取景器穿透。
  （这个常量在 `SettingsScreen.tsx` 与 `GalleryScreen.tsx` 里**各写一份**，
  改一处必须同时改另一处。）
- 灯箱底栏重写成「左侧状态 `已存入 {album}` + 右侧分享与删除」，
  各 44×44pt、间距 16pt。删除走 `Alert` 确认 → `useGallery().remove(id)` →
  `galleryStore.deleteShot(id)`，并回一声 `gallery.deleted`。
- 设置页选中态统一改成**文字靠左 + 最右侧琥珀橙 `✓`**（原来是整行高亮方块）。
  语言**保留 6 项**（跟随系统 + 5 种），没有按规格字面砍掉日语和法语 ——
  那两种语言的翻译是完整的，删掉是功能倒退。

### 24.11 §十一 App 图标按方案 B 重绘

`assets/icon.png` 与 `assets/adaptive-icon.png`（内容相同）：1024×1024、**RGB 无 alpha**。

- 底板 `#111113` + 极轻径向暗角（峰值 0.14）+ 微弱竖向 35mm 导轨线（+7 级 / 2px）；
- 正中一个 **340×480、圆角 76** 的齿孔镂空，内部 `#FFF3D6 → #FFA000 → #E64A19 → #240500`
  的日落透光渐变 + 外发光 + 1.5px 赛璐珞切边高光；
- **无任何文字、数字、电池柱、六边形螺母**。

生成脚本 4096 超采样后 LANCZOS 缩回 1024。实测孔中轴竖剖精确命中 `#FFA000`(y=454) 与
`#E64A19`(y=617)，导轨线 +7 级 / 2px，两个文件同 hash。

> 已知弱点：**40px 下"这是胶片齿孔"这层身份会丢**。齿孔本身就是圆角矩形，
> 而规格禁止一切文字/数字/可辨识形状，语义只能靠那两条导轨线承载，
> 它们降到 40px 就完全消失了。40px 读作"深色底上的暖光竖直圆角窗口"，60px 下好转明显。
> 这是"极简 + 无文字"约束的必然结果，不是画错了。

### 24.12 这一版**没有**在真机验证过的东西

| 项 | 为什么没法在这台机器上验证 |
| --- | --- |
| 侧键 `Heavy` 触觉的实际手感 | 没有真机；而且它和拍照之间没有 `await`，顺序对不对只能上手 |
| `SegmentDate` 七段在成片像素下的清晰度 | 需要真机截图；字模宽度是算出来的，观感不是 |
| 4 张切片海报能否截全 | 海报 pt 尺寸约 575×1752，**超出屏幕可视区**；`drawViewHierarchyInRect` 对超出屏幕的部分没有文档保证。**真机上第一件事就试 4 张导出** |
| 齿孔轨道会不会被 `FlatList` 裁剪 | 结构上两层的父层都没有 `overflow: hidden`，但帧落到屏幕外的部分本来就不渲染 |
| `expo-image-picker` 真实返回的 EXIF 形状 | 没有真实照片可验；代码里顶层与嵌套两级都试了 |
| 打滑彩蛋的观感 | 6.25% 是确定的，但"像过片失误"这层感觉要眼睛看 |
| `✓` / `✕` 字符在真机上会不会缺字 | 与 `▷` 是同一类风险，但这两个码位在 iOS 系统字体里有 |

---

## 25. v1.4.0：Dazz 级极简重构 + 六节增量 + 商标清理

这一版是**六节规格**（取景器解耦、点按对焦 + EV、变焦不重载、深浅色、水印字号与地理语言、相框横竖自适应）
加上**转公开仓库前的商标清理**。`app.json` 版本 `1.3.0` → **`1.4.0`**。

### 25.1 §一 取景框彻底解耦 + 三层新控制台

旧版取景器把"相框预览"直接盖在 `CameraView` 上（`<FrameOverlay>`），
结果是预览画面与成片永远对不齐，而且一屏堆了颗粒条、LCD 面板、变焦条、底片切换条。

| 动作 | 结果 |
| --- | --- |
| 删掉 `<FrameOverlay>` | **文件保留**（`src/components/FrameOverlay.tsx` 仍在仓库里，只是没人引用了），取景器只留 `AspectGuide.tsx` 的 1px 半透明白圆角参考线 + 顶部 `35mm` 等宽小字 |
| 删掉 `styles.lcdWrap` / `lcdPanel` / `zoomBar` 整块 | 主屏从 **1402 行降到 1126 行** |
| 新增三层控制台 | 悬浮胶囊 `ViewfinderBar.tsx`（色温/焦段/曝光）+ 5 个线性图标 `ToolRow.tsx`（导入/重曝/定时/闪光/翻转）+ 底部「缩略图｜快门｜胶卷抽屉」 |
| 顶栏减负 | 只留画幅徽标 + 底片计数 + **一枚**设置 `DialButton` |

**新增/重写的组件**：`FocusExposure.tsx`(226) / `ViewfinderBar.tsx`(304) / `ToolRow.tsx`(280) /
`AlbumThumb.tsx`(78) / `AspectGuide.tsx`(64)；`FocusReticle.tsx` 103→**94**（受控 opacity 的黄色 1px 方框 + spring 脉冲）。
`DialButton.tsx` / `ShutterButton.tsx` / `DevelopOverlay.tsx` / `constants/zoom.ts` / `constants/lenses.ts` / `hooks/usePinchZoom.ts` **一行未改**。

**参考线画在真实成像窗口上，不是画在标称画幅上。** 规格里写的 1:1 / 3:2 / 3:4
与四款相框的真实画幅（`0.822` / `0.628` / `0.692` / `1.0`）对不上，
所以 `AspectGuide` 直接取 `previewLayout.window` —— 画在标称比例上等于画错。

### 25.2 §二 点按对焦 + 垂直 EV 滑块（`expo-camera` 补丁第二次扩展）

§19 那次补丁只做了"点哪对哪"。这一版把 `exposureBias` 也加进了原生侧，
见 `src/components/CameraScreen.tsx` 的 `FocusPointProp` 类型别名与 `cameraFocusProps`。

- **EV 步进 1/3 档**（`EXPOSURE_STEP = 1/3`，−2.0…+2.0 共 13 档）。不用 0.1：
  原生收的是连续 `Float`，0.1 是**假精度**，只会让读数好看。
- **两个入口都做了**（规格写的是"二选一"）：对焦后 3 秒内出现的垂直 EV 滑块（右侧 8pt 竖线，
  每格 `selectionAsync()`），**外加** `ViewfinderBar` 里那颗可上下拖的 EV 胶囊（阈值 4pt，
  满量程 `DRAG_SPAN = 150`，轻点归零）。理由是硬性的：滑块只在对焦后存在 3 秒，
  把 EV 的唯一入口挂上去等于那颗胶囊 95% 时间是死按钮。
- `cameraFocusProps` 在 **EV === 0 时省略 `exposureBias`** —— 不传才是"恢复原生自动"，
  传 0 在某些机型上会被当成"手动 0"。
- 翻转相机重置 zoom / stopIndex，但**故意不重置 EV**（EV 是拍摄意图，不是镜头属性）。
- `FocusReticle` 改成黄色细线方框 + 脉冲回弹，3 秒淡出；焦点坐标归一的**分母由"画幅框"改成 `previewBox`**。

### 25.3 §三 换焦段不再重载 + 120ms 镜头推拉

旧版切档会改 `<CameraView>` 的 `key`，等于每次换焦段都重建一次相机会话（黑一下）。
现在 `key` 恒定，切档**只改 `zoom` prop**，props 全部用 `useMemo` 稳定；
容器给 120ms `Animated.spring`（`setValue(0.965)` → 1，`speed: 28`、`bounciness: 7`、
`useNativeDriver: true`）做"推拉镜头"的错觉，**只包住 `CameraView` 那一层**
（三分线和参考线不跟着缩放，否则整个取景框在呼吸）。
焦段胶囊显示按原生焦距折算后的真实毫米数（13 / 26 / 52mm），
色温胶囊显示带符号数字（`+0.28`）—— 5 个语言包里没有"暖/冷"词，且本轮不许新增 i18n 键。

### 25.4 §四 机身跟随系统深浅色

`src/constants/theme.ts` 整体重写成 hook 式 API：

```ts
export interface Theme {
  scheme: 'dark' | 'light';
  body; panel; scrim; glass; glassBorder; focus; sliderTrack;
  ink: { paper; paperDim; paperFaint; amber; amberSoft; amberDeep; hairline };
}
export function useTheme(): Theme        // useColorScheme() === 'light' ? LIGHT : DARK
export function themeFor(scheme): Theme  // 给 Alert / createStyles 这类没有 hook 上下文的地方
```

`DARK_THEME` 是原来的"暗夜黑钛"（`body '#151518'`、`ink.amber '#E5A93C'`），
`LIGHT_THEME` 是新增的"经典徕卡银"（`body '#E5E5E2'`、`scrim 'rgba(237,236,232,0.985)'`、
`ink.amber '#D32F2F'` —— 浅色下用红不用黄，黄在银底上读不出来）。

**迁移的坑（下次改颜色请先读这段）**：`useTheme()` 是唯一正路。模块级
`StyleSheet.create({ color: INK.x })` 会在**模块加载时**把颜色烧死，
切深浅色一行都不会变 —— 必须把 `createStyles` 搬进组件内用 `useMemo(() => createStyles(theme), [theme])`。
旧导出 `INK` / `BODY_COLOR` 还留着但已标 `@deprecated`；**全仓零处仍在用**。

- `app.json` 加了 `"userInterfaceStyle": "automatic"` —— **不写这一行 iOS 永远给亮色外观**，
  这是最容易漏的一步。
- `App.tsx` 根容器接 `theme.body`，`<StatusBar>` 跟随 `theme.scheme`。
- **`StripView` 的暗房面例外**：`const DARKROOM = '#0A0A0C'` 固定取深色。
  暗房是"背光看片"的物理场景，浅色机身下也得是暗的，否则胶片条浮在白底上。
- 设置页在"地名详细度"之后新增 **④ 地名语言** 四档（`auto` / `zh-Hans` / `zh-Hant` / `en`）。

### 25.5 §五 水印字号与地理语言

**字号收口在一处**（`src/utils/geometry.ts` 的 `dateFontOf`），渲染层一个系数都不乘：

```ts
const shortEdge = Math.min(layout.width, layout.height);
const capped = Math.min(layout.window.width * config.fontSizeRatio,
                        shortEdge * DATE_FONT_SHORT_EDGE_RATIO);   // 0.02
return Math.round(clamp(capped * fontScale, MIN_DATE_FONT, MAX_DATE_FONT));
```

实测舞台 358×640（短边 358）：四款日期 **14→8 / 17→8 / 14→8 / 12→8 pt**，
灯管高一律 **6pt**（`MIN_QUARTZ_HEIGHT` 兜住），地名一律 **6pt**。

> ⚠️ **"缩 35~40%" 和 "短边 2%" 数学上不能同时成立** —— 短边 2% = 7.16pt，
> 相当于把 14pt 砍 49%、17pt 砍 58%。本版以 **2% + 下限**为准。
> 若哪天要卡死 −35~40%，**只改 `DATE_FONT_SHORT_EDGE_RATIO`（如 0.026）一处即可**。
> 三条硬要求都守住了：管高 ≥ 6、日期行 `fits=true` 全过、`centered` 仍居中。

`resolveGeoLocale`（`src/utils/placeNames.ts` 新增）：`'auto'` 时界面语言是
`zh-Hans`/`zh-Hant` 就原样用，**ja / en / fr 一律落 `en`**（这三档没有对应地名库）；
显式设置完全压过界面语言。**港澳台前缀在两种详细度下都没有回退**，行为与 v1.3.0 一致。

### 25.6 §六 相框：横竖自适应、纸纤维、3 款新相框

四款现有相框全部**新生成一张横版 PNG**（`*-landscape.png`），`FrameSpec` 新增可选的
`landscape: FrameOrientationVariant`。选朝向的逻辑在 `processFilmPhoto` 里按**原图**横竖
调 `resolveFrameOrientation` + `computeFrameLayout` 重算布局，渲染层**不重判**，
用 `frameOrientationOfLayout` 从布局反推该铺哪张 PNG —— **"布局与 PNG"永远同源**。

> **正方形相框的坑**：`slide-mount` 横竖 `aspect` 都是 1.0，
> 按 aspect 反推会把横版布局误判成竖版。改成**归一化窗口距离为主判据**（窗口也相同才退回 aspect）。

**新增三款**：`fp100c`（FP-100C 撕拉片，药水毛边只在纸边一圈）、
`half-frame`（半格双联框，**两个 `slots`**，左右并列 3:4 竖槽 + 84px 立筋 + 上缘防挂切口）、
`sheet8x10`（8×10 大画幅散页，纯黑窄片边 + 左下角 Notch + 片边 ASCII 标识字）。
`FrameSpec` 新增 `slots` 与 `FrameOrientationVariant`（见 `src/types/index.ts`）。

**纸纤维**：所有相纸类相框烘进 **3%~4% 低频纸纤维噪点**（`neg-135` 黑片基不加），
alpha 仍然只有 **0 / 255** 两个值（`P` 模式 + `transparency=255`）。

**重曝与双联渲染**（`FilmCompositor.tsx` 597→735）：`<ViewShot>` → 窗口内
先底图、再 `overlayUri`（默认 `opacity 0.5`）、**然后**才盖调色/颗粒/暗角图层，最后相框、水印。
顺序不能反 —— 每层各自"洗"一遍再叠会得到**两道暗角 + 双份颗粒**。第二张**不设 `mixBlendMode`**
（纯 alpha 叠加才是"同一格曝光两次"）。有 `slots` 的相框走**逐槽渲染**：
第一格内叠 `overlayUri`，第二格画 `secondUri` 且**没有**重曝分支，缺省时第二格**留黑**
（不拿第一张去填），`layers` 只挂一次盖在并集上 → 接缝两侧颗粒连续。

**三个只有看图才会发现的真 bug**（都已修，写在这里是为了下次别再犯）：

1. **`half-frame` 两个槽重叠 164px** —— 成品里根本没有立筋，是一个 960px 的大洞，
   而 `frames.ts` 的并集窗口还比真洞宽 100px（端上右边 100px 会压在纸面上）。
   生成器自带的 `audit()` 当时全绿，**因为期望掩码和产物错得一样**。
   → 教训：审计脚本不能和被审计对象共享同一份期望值，必须有一路独立测量。
2. **横版印字被转 90°** —— 整层 `transpose` 任何方向都不行（转的是画布坐标，
   字的位置跟着转，一半出界一半被 `punch()` 挖掉）；`ROTATE_90` 与 `ROTATE_270`
   都是竖排但**字头朝向相反**，全局统计分不出。只能按块搬运 + 与底图同旋向的影射。
3. **`FASTOCTREE` 把纸纤维量化抹平** —— 它是每通道固定 16 格的八叉树，
   纸色落在 240…255 之内就被并成 **1 个色号**（σ 3.713 → 0.000），
   烘进去的纤维在成品里彻底不存在。换 `MEDIANCUT` 并修掉它 `putpalette` 少字节导致透明索引失效的连带 bug。

**代价**：11 张 PNG 从 42.3 KB 涨到 **1409.1 KB**。24 位对照下 P 模式只剩 **1.4×** 优势，
P 模式现在唯一的理由是"alpha 天然二值"（不需要半透明掩码）。这是纤维真被保留下来的代价，**接受**。

### 25.7 商标清理（转公开仓库的前置）

公开前清掉仓库里**真实在用的第三方商标**。判断标准不是"有没有出现品牌词"，
而是**"它是不是渲染在用户能看见的界面上"**：

| 位置 | 原值 | 现值 | 为什么 |
| --- | --- | --- | --- |
| 顶栏画幅徽标（`FrameSpec.code`） | `POLAROID` | **`INSTANT SQ`** | 印在界面上，当自己 App 的画幅名称用，是描述性合理使用里**最弱**的一种 |
| 顶栏画幅徽标 | `INSTAX` | **`INSTANT MINI`** | 同上 |
| `sheet8x10.png` 片边字 | `KODAK 4142` | **`SAFETY 8X10`** | 厂商名与商品编号**一起**换掉 —— 只删 `KODAK` 而留 `4142` 等于把检索线索留在图里 |

替换原则：**用描述"画幅规格"的词，不用品牌名**，风格与已有的 `135 NEG` / `SLIDE` 保持一致。

**顶栏徽标宽度核算**（`FrameBadge` 是 `maxWidth: '42%'` + `numberOfLines={1}` +
`adjustsFontSizeToFit` + `minimumFontScale={0.75}` 的胶囊）：
Menlo 字宽 0.6023 em × 12pt = 7.224pt，加 `letterSpacing: 0.6` → **7.824pt/字符**；
胶囊固定开销 = `paddingHorizontal 8×2` + 装饰条 3 + `marginLeft 6` = **25pt**。

| 代号 | 字符数 | 文本宽 | 屏宽 375pt 下的缩放 |
| --- | --- | --- | --- |
| `INSTANT MINI · 02/07` | 20 | 156.48pt | **0.772** |
| `INSTANT SQ · 01/07` | 18 | 140.83pt | 0.857 |
| `135 NEG · 03/07` | 16 | 125.18pt | 0.965 |
| `FP-100C · 05/07` | 16 | 125.18pt | 0.965 |
| `SLIDE` / `HALF` / `8X10` | 13 | 101.71pt | **不触发缩放** |

`minimumFontScale: 0.75` 的下限要到屏宽 **366.95pt** 才触到，
而能跑 iOS 16.4 的最窄机型（iPhone SE 2/3、iPhone 8、12/13 mini）都是 **375pt**
→ **任何能跑本版 iOS 的机型都不会截断**，最紧的一款还留 2.9% 余量。

**有意保留、不清理的**（都不是用户可见文案）：

- `src/constants/presets.ts` 里 `portra-400` / `superia-x` / `velvia-50` / `cinestill-800t` /
  `tri-x-400` 这些 **`id`** —— 它们会写进相册索引与照片元数据，
  **改了会让老用户的成片对不上号**，是数据兼容性问题，不是商标问题。
- `assets/frames/polaroid-600.png` / `instax-mini.png` 这些**内部文件名**（描述性使用，风险低得多）。
  改名要动 `generate_frames.py` 的常量与 `FRAMES` 字典键、重生成四款、逐一验字节，
  风险和收益不成比例，**留作后续单独处理**。
- `generate_frames.py` 里的 `WINDOW_POLAROID_600` / `WINDOW_INSTAX_MINI` / `RADIUS_INSTAX`
  等**内部标识符**，以及各处"原来是什么、为什么换掉"的注释记录。

**相框的 i18n 名称本来就是无品牌的**（`frame.polaroid600` = 一次成像 / インスタント / INSTANT /
INSTANTANÉ，`frame.instaxMini` = 迷你画幅 / ミニ / MINI），所以只改了 `code`，`nameKey` 一个没动。

> 本次商标清理**没有单独触发构建**，已并入 v1.4.0 这一轮提交。

### 25.8 已知限制

| 限制 | 说明 |
| --- | --- |
| **`half-frame` 横拍取景与成片不一致** | 这一款只有竖版。横拍时原图 `cover` 进 `slots[0]`（3:4 竖槽，只保留中间约 56% 宽）、`slots[1]` 留黑；而取景器参考线画的是**两槽并集**（1.603）。修它需要给 `FrameOrientationVariant` 加 `slots` 并再生成一张横版 PNG（两槽上下叠放）。**想拍横幅请换别的相框。** |
| **`fp100c` / `half-frame` / `sheet8x10` 没有横版** | 横拍会退回竖版 PNG 走 `cover` 裁切 |
| **横版相框四周留白只有 15~17pt** | `anchor === 'frame'` 时日期行盒（9.3pt + inset 10）会轻微压到照片：polaroid 越界 **5.92pt**、instax **3.92pt**。本轮**没有改锚点规则**，要修的话把横版下留白加到 ≥24pt，或给横版单独指定 `anchor: 'window'` |
| **`stage.locale` 语义已变** | 现在指"地理语言"而不是界面语言，全树只有 `planWatermark` 消费它 |
| **`stacked` 版式在 `neg-135` 上丢地名行** | v1.3.0 既有行为，本轮没动 |

### 25.9 这一版**没有**在真机验证过的东西

| 项 | 为什么没法在这台机器上验证 |
| --- | --- |
| ~~**8pt 日期 / 6pt 灯管在成片上认不认得出**~~ | **v1.4.1 已查明：认不出。** 6pt 七段管的竖段只有 0.74pt，比段厚 0.840pt 还短，整串退化成横虚线 —— 这就是当时担心的那件事成真了。见 **§26.1** |
| EV 是否真的改变了画面亮度 | 补丁只扩了原生参数透传，端上没法验证曝光结果 |
| 定时器精度 | 3s / 10s 倒计时在 JS 侧，真机后台会掉精度 |
| 重曝叠合的观感、临时文件存活 | 需要真机拍两次；`overlayUri` 的临时文件生命周期依赖 `FileSystem` cache 目录 |
| 120ms 弹簧手感、375pt 上三颗胶囊挤不挤 | 手上没有 375pt 真机；宽度是算出来的，观感不是 |
| 取景器与成片是否真的一致 | `FrameOverlay` 不画水印，两者本来就不同源 |
| 浅色主题下的对比度 | 只能靠算，没有真机眼睛 |
| 捏合缩放与 EV 滑块抢手势 | 两个手势在同一块区域内，`hitSlop` 也是算的 |
| VoiceOver 朗读顺序 | 三层新控制台加了不少可聚焦元素，顺序只能上手听 |
| ~~七段日期在 `centered` 6pt 下能显示几个字~~ | 七段字模已在 v1.4.1 整体删除，这个问题不存在了 |

---

## 26. v1.4.1：日期"乱码"与半格双联

`app.json` 版本 `1.4.0` → **`1.4.1`**。两处修复：一处是 v1.4.0 §五 字号收口的**后果**，
一处是 v1.4.0 §六 新相框的**没做完**。

### 26.1 日期的"水平虚线乱码" —— 真因不是字体

用户报：成片右下角的日期渲染成"水平虚线乱码"，怀疑是第三方数码管字体（Digital-7 / DSEG）
没在原生工程里 Link 上。

**查证结果：本仓库从来没有加载过任何第三方字体。** 两条独立证据：

| 证据 | 位置 |
| --- | --- |
| `CUSTOM_FONT` 恒为 `null`，`useFonts` 收到的是**空 map**，`customLoaded` 恒为 `false` | `src/hooks/useFilmFonts.ts`（v1.4.0 版 `:33`） |
| 日期压根不是文字：纯 `View` 手绘七段，**不用 `Text`、不碰 `fontFamily`** | `src/components/SegmentDate.tsx`（v1.4.1 已删除） |

所以"字体加载失败导致乱码"这条因果链在本仓库里**不可能成立**。

**真因**：v1.4.0 §五 把日期字号收到"画布短边 2%"，落到 `MIN_DATE_FONT = 8pt`；
而七段管的高度是 `fontSize × QUARTZ_HEIGHT_SCALE(0.58)` → **管高 6pt**。按 `SegmentDate` 的公式：

```
段厚 = 6 × STROKE_RATIO(0.14)                   = 0.840pt
缝   = min(QUARTZ_SEGMENT_GAP(0.5), 6 × 0.105)  = 0.500pt
竖段 = 6/2 − 0.840 × 1.5 − 0.5 × 2              = 0.740pt   ← 比段厚还短
```

竖段比它自己还"粗"的时候，视觉上就是一个**方点**；而横段是 `3.30 × 0.840pt` 的长条。
整串于是只剩"一排横虚线"—— 这正是用户看到的东西。

**不用真机也能复现**：`scripts/_quartz_repro.py`（**本地探针，未入库**，`.gitignore` 挡掉了）
逐行照抄 `SegmentDate.tsx` 的常量与 `digitViews` 公式，按 **1pt = 64px** 画出 6 / 8 / 11 / 16pt 四行对照
（统一放大倍数、不统一显示尺寸 —— 后者会把"字太小"这个事实藏起来）。
同一套放大倍数下"修复前 / 修复后"的四行对照由 `scripts/_date_fix_preview.py` 生成：

| 管高 | 竖段长 | 竖段/段厚 | 观感 |
| --- | --- | --- | --- |
| **6pt（v1.4.0 现状）** | 0.740pt | **0.881** | **完全认不出，就是横虚线** |
| 8pt | 1.320pt | 1.179 | 勉强 |
| 11pt | 2.190pt | 1.422 | 成形 |
| 16pt | 3.640pt | 1.625 | 清楚 |

**改法**：整个字模换成**系统等宽粗体 + 字距**，七段那套代码全部删掉。

| 文件 | 改动 |
| --- | --- |
| `src/hooks/useFilmFonts.ts` | 整体重写。`DATE_MONO_FAMILY = Platform.select({ ios: 'CourierNewPS-BoldMT', android: 'monospace', default: 'monospace' })`；`SYSTEM_MONO_FAMILY` 作为旧名保留（调用点一个没动）；`useFilmFonts()` 恒返回 `{ ready: true, customLoaded: false, fontFamily: DATE_MONO_FAMILY, source: 'system' }`。**`useFonts` / `expo-font` 的 import 彻底删除**，`CUSTOM_FONT` / `CUSTOM_FONT_FAMILY` 两个常量也没了 |
| `src/components/DateStamp.tsx` | **新建**。`<DateStamp quartz color fontFamily />`，根容器 `{ flexShrink: 0, width: quartz.width }`，内部 `<Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.9} allowFontScaling={false}>` |
| `src/components/SegmentDate.tsx` | **删除** |
| `src/utils/geometry.ts` | 字宽模型换成 `dateStampWidth(text, fontSize, letterSpacing) = round2(n × (fontSize × MONO_ADVANCE_RATIO(0.6) + letterSpacing))`。删掉 `QUARTZ_DIGIT_WIDTH_RATIO` / `QUARTZ_MARK_WIDTH_RATIO` / `QUARTZ_CELL_GAP_RATIO` / `QUARTZ_SEGMENT_GAP` / `QUARTZ_HEIGHT_SCALE` / `MIN_QUARTZ_HEIGHT` / `quartzCellLayout()` / `segmentDateWidth()` 等一整套七段几何。`WatermarkQuartz` 从 `{ text, height, gap }` 变成 `{ text, width, fontSize, letterSpacing, fontWeight, shadowColor, shadowRadius }` |
| `src/components/FilmCompositor.tsx` | `<SegmentDate>` → `<DateStamp>`；删掉 `TEXT_DESCENT_RATIO(0.21)` 与 `centered` 版式里那个 `marginBottom` 包层 —— 那 0.21 是给"没有降部的管子"补的，真 `<Text>` 的降部本来就在行盒里 |

**为什么 `MONO_ADVANCE_RATIO = 0.6` 不需要 `Platform.select`**：Courier New 与 Android 的
`monospace` 都是 600/1000 em，同一个数。宽度公式**不减尾字距**（RN 的 `letterSpacing` 走
`NSKernAttributeName`，最后一个字形后面也加）—— 宁可多出 2pt，也不冒截断的险。

### 26.2 半格双联必须拍两张才出片

v1.4.0 §六 加了 `half-frame`（两个 `slots`），但**快门逻辑没跟上**：
第一张就直接进冲印管道，`slots[0]` 有画面、`slots[1]` 留黑 —— 出来就是"左半边有像、右半边是黑板"。

`src/components/CameraScreen.tsx` 新增缓存状态（判据从相框推导，**不硬编码 id**）：

```ts
const [halfFrameBuffer, setHalfFrameBuffer] = useState<CapturedPhoto | null>(null);
const needsTwoShots = frame.slots !== undefined && frame.slots.length >= 2;
```

| 时机 | 行为 |
| --- | --- |
| 第一格 | 只入缓存 + `setStatus({ kind: 'idle' })` + `return` —— **不冲印、不增曝光数**（`exposureCount` 是"已出片张数"，半格两格合起来才是 1 张） |
| 第二格 | 两张一起入管道，成功后 `exposureCount + 1`、清缓存、刷相册 |
| 取景器 | 常显 `[ 1 / 2 ]` + 「再按一次完成」（i18n 新键 `camera.half.plate` / `camera.half.hint`，5 个语言包齐全） |
| 切相框 | `handleFrameChange` 与 `handleBadgeFramePress` 两条路径都**静默清空**缓存 |

**槽位归属是合成层写死的，不是这里说了算的**：`FilmCompositor.slotPhotoUri` 里
`slotIndex === 0 → rawUri`、`=== 1 → secondUri`；而 `half-frame` 的 `slots[0]` 窗口 x 更小，就是**左格**。
所以"先拍的进左格"要求先拍的当**主图** `photo`（→ `rawUri` → 左格），后拍的走 `secondUri`。

**顺序关键**：两条半格分支排在重曝分支**之前**，所以"半格 + 重曝同时开着"时**重曝被静默忽略**。
理由：半格的两个槽是并排的，重曝是叠在同一格里的 —— 半格没有"往哪一格叠"的答案；
而合成层的规则是"重曝只叠在第一格"，那正是半格框最不该有的东西（左半格是鬼影、右半格是单次曝光）。
代价：重曝开关的灯还亮着，但它对半格框不生效。

**缓存必须在冲印成功之后才清** —— 冲印抛错时它还在，用户可以直接补拍第二格。
`src/utils/processFilmPhoto.ts`（`:147` 早已有 `secondUri` 入参、`:227` 早已透传）与
`src/hooks/useFilmStage.ts`（`:38-49` 的就绪计数已把第二张算进去）**零改动**。

### 26.3 这一版**没有**照字面执行用户方案的两处，以及为什么

1. **`#E5A93C` 没有采用。** 用户给的琥珀色是**深色机身**的 UI 强调色，但成片水印有一套
   **两档墨色**规则，是按"印在什么材质上"分的：`anchor === 'window'`（压在照片上）要亮
   （amber `#FF8A00`），`anchor === 'frame'`（印在相纸留白上）要暗（amber `#B45309`），
   见 `geometry.ts` 的 `resolveInk`。把两者统一成 `#E5A93C` 会让印在白色相纸上的日期
   对比度掉到读不清。**保留了现有规则**，只换了字模。
2. **`letterSpacing: 2` 的代价必须知道**：日期串 `'26  10  12` 共 11 字符，
   宽度从七段的 **30.80pt** 涨到 **74.8pt（2.43×）**。已逐款核算
   `slotMaxWidth = max(24, region.width − quartz.width − SPLIT_GUTTER(12))`：
   `neg-135` 最紧也只有 **138.8pt**，七款相框**全部不溢出**。

`gamut` 的代价则是：日期从"画出来的形体"变成"真字体"，**字号下限不再自动等于可读下限** ——
`MIN_DATE_FONT = 8pt` 现在是唯一的下限。要更大只改 `DATE_FONT_SHORT_EDGE_RATIO`。

### 26.4 这一版**没有**在真机验证过的东西

| 项 | 为什么没法在这台机器上验证 |
| --- | --- |
| `CourierNewPS-BoldMT` 在 iOS 上是否真的命中 | 它是 iOS 内置字体（Courier New 家族），但**只有真机/模拟器能确认没有回退**；`scripts/_date_fix_preview.py` 用的是 Windows 的 `courbd.ttf`，字形接近但不是同一个文件 |
| 8pt 日期在成片像素下够不够大 | 宽度是算出来的，观感不是。按 `captureLongEdge = 2048` / 舞台 358pt 换算，8pt ≈ 46px 高的字面 |
| 半格两格的实际左右顺序 | 只是静态推断 `slotPhotoUri` + `slots[0].window.x`，没拍过 |
| 半格提示 `top: 54` 会不会压到别的控件 | 没有 375pt 真机 |
| 缓存的生命周期 | 第一张的临时文件在 `FileSystem` cache 目录，**没有超时清理**：切后台几小时回来再拍第二格，可能拿一张很旧的画面凑格 |
| 物理侧键 / 定时器是否也走半格分支 | 两条路径都汇入同一个 `handleShutter`，结构上继承，但没实机触发过 |
| 仓库里没有测试 | `__tests__` 不存在，`expo export` 也不做类型检查 —— 唯一的自动防线是 `npm run typecheck` |

---

## 27. v1.5.0：液态玻璃取景器 + 真光学变焦 + 导入反查地名

用户给的三段规格**一次做完、一次提交、一次 CI**。三段里有三处"规格点名要的 API 在本项目的
`expo-camera@57.0.6` 上并不存在"，走的是等价但不同的路线 —— 下面每条都按
「规格说什么 / 实际怎么做 / 为什么」写清。

### 27.1 §一 Liquid Glass：材质收成两个组件

规格要的是：`BlurView tint="systemUltraThinMaterialDark" intensity={75}` + `rgba(18,18,22,0.42)`
底色、45° 斜向 1px 折射环（左上亮 / 中段几乎透明 / 右下微亮）、顶部 0.5px 内高光；相机预览
铺满整屏；中央镂空取景窗；色温/焦段/曝光胶囊与次级按钮全部套玻璃；**彻底删掉拟物齿轮贴图**。

落地成**两个组件**，其它地方只 import、不各写一份：

| 文件 | 职责 |
| --- | --- |
| `src/components/LiquidGlassView.tsx` | 材质本体。`BlurView` + 底色 + `LinearGradient` 画折射环（`RIM_COLORS` = 左上 `rgba(255,255,255,0.6)` / 中段 `rgba(255,255,255,0.1)` / 右下 `rgba(255,255,255,0.32)`，`start {0,0}` → `end {1,1}` 就是那条 45°）+ 顶部 0.5pt `rgba(255,255,255,0.4)` 内高光。导出 `GLASS_TEXT_COLOR = '#FFFFFF'` 与 `glassTextShadow`（`rgba(0,0,0,0.65)`、radius 2、offset 0）。 |
| `src/components/ViewfinderWindow.tsx` | 镂空取景窗。**四块**玻璃围出窗口（不用 `MaskedView`，理由见 §27.5），窗口内 1px `rgba(255,255,255,0.75)` 亮框 + 四个 L 型角标（`CORNER_ARM 16` / `CORNER_THICK 2`）+ 九宫格 `rgba(255,255,255,0.28)`；整层 `pointerEvents="none"`。切画幅时四个 `Animated.Value` + `Animated.spring`（`speed 22` / `bounciness 5`）补间 `left/top/width/height`，**起点取动画中途的当前值**，所以连点画幅不会跳回原位。 |

⚠️ **RN 0.86 已经把 `StyleSheet.absoluteFillObject` 删掉了**（只剩 `absoluteFill`，那是个注册过的
数字 ID，展开不了）。所以这两个文件都手写了 `position/top/right/bottom/left` 四行；全仓
`DialButton` / `ShutterButton` / `FilmDrawer` / `SettingsScreen` / `GalleryScreen` 都留了同样的注释提醒。

**"删掉拟物齿轮贴图"落到了哪里。** 规格点名的"锯齿拟物齿轮贴图"指的是 `DialButton` 底下那张
48 齿滚花位图（`assets/ui/dial.png`）与设置入口的 `icon-settings.png`（它本身就是"三档推子"，
见 `generate_ui_assets.py` 里"为什么不用齿轮：图标在界面上只占 21pt，齿轮的齿在 21pt 上会糊成
一团"那段注释）。这一版把**五个已经零引用的条目**一并删干净了，合计 **29.0 KB**：

| 删掉的 | 原用途 | 大小 |
| --- | --- | --- |
| `dial.png` / `dial-on.png` | 44pt 滚花拨轮底（未点亮 / 点亮） | 23.0 KB |
| `icon-settings.png` | 设置入口图标（三档推子） | 1.4 KB |
| `icon-film.png` | 胶卷抽屉入口图标（细线胶片条） | 2.2 KB |
| `icon-album.png` | 相册入口图标（**早就是零引用**） | 2.4 KB |

三处一起改：`src/constants/uiAssets.ts` 删条目、`assets/ui/` 删 PNG、`generate_ui_assets.py`
的 `main()` 删调用（`make_*` 函数留着当参考实现，所以重跑脚本不会把它们变回来）。
替代品是纯 `View` 画的矢量图形：`SettingsGlyph`（18pt，三条长短不一的横轨 + 三颗旋钮 ——
**换画法不换语义**，被删的那张 PNG 本来就是三档推子）与 `FilmGlyph`（22pt，带齿孔的圆角矩形）。
`DialButton` 的 props 因此从 `icon: ImageSourcePropType` 变成 `glyph: (color) => ReactElement`，
点亮态改由玻璃自己的 overlay（`rgba(229,169,60,0.22)`）表达，图标保持纯白。

⚠️ `leather-tile.png` 从 **v1.6.1** 起**没有任何 `require` 了**（`UI_ASSETS.leatherTile` 条目已删），
但**文件本身留在仓库里没删** —— `scripts/preview_ui_mock.py` 还要拿它出设计稿。
暗房面板上那次撤除的理由见 §31.3：那张 320×320 的 tile 左右边缘对不上，`resizeMode="repeat"`
每 320pt 就是一条贯穿全高的纵向断层，正是用户报的"✕ 旁边那条竖线"。
（取景器里那块皮革底纹是 v1.5.0 删的 —— 玻璃要能采到画面，铺一张不透明底纹等于让模糊去采一块死平的布。）

### 27.2 §二 真光学变焦：五档，每档都切物理镜头

规格点名要用 `device.neutralZoom`、`virtualDeviceSwitchOverVideoZoomFactors`、`physicalDevices`
把 13 / 24-26 / 35 / 48-52mm 与长焦档一一映射。

**这三个 API 在 `expo-camera@57.0.6` 里都不存在** —— JS 侧能拿到的只有
`selectedLens: string`、`onAvailableLensesChanged`、`ref.getAvailableLensesAsync()` 三样。
所以走的是"**切物理镜头 + 每档 `zoom: 0`**"，它在数学上等价：

```
expo-camera 原生实现（CameraSessionManager.swift）
    device.videoZoomFactor = videoMaxZoomFactor ^ zoom
```

`zoom` 是**指数行程**、底数是**当前设备 activeFormat 的 `videoMaxZoomFactor`**，而那个底数
JS 侧从来读不到。三摄虚拟设备的 `videoMaxZoomFactor` 在 100 以上 —— 按本项目的
`ASSUMED_MAX_ZOOM_FACTOR = 16` 写出来的 `zoom` 落到虚拟设备上会放大 6 倍以上，
捏合到底就是 37× 数码变焦。**这就是"切焦段变马赛克"的真因**（`transform: [{ scale }]`
那 3.5% 只是换档推拉动效，从来不是变焦机制）。

而 `zoom = 0` 时 `videoZoomFactor = videoMaxZoomFactor ^ 0 = 1.0`，**正好是该镜头的 100% 原生视场，
与底数无关**。所以：每档切对物理镜头 + `zoom: 0`，光学视场就精确，完全绕开未知的底数。

| 档 | `lens` | `factor` | `zoom` | 说明 |
| --- | --- | --- | --- | --- |
| `0.5×` | `ultraWide` | 1 | 0 | 超广角原生视场 |
| `1×` | `wide` | 1 | 0 | 主摄原生视场 |
| `1.4×` | `wide` | 1.4 | `0.12136` | 主摄传感器内裁切 |
| `2×` | `wide` | 2 | `0.25` | 同上 |
| `3×` | `telephoto` | 1 | 0 | 长焦原生视场（没有长焦的机型变灰） |

- **`1.4×` 为什么不是精确的 `35/26 = 1.3462`**：那样按钮上的"1.4×"和实际裁切就对不上，
  而"标签和画面严格一致"是这张表的第一原则。26mm 假定下 1.4 = 36.4mm，长约 4%，肉眼无感。
- **`3×` 的标签是算出来的**：`TELEPHOTO_MULTIPLIER = round(ASSUMED_LENS_NATIVE_MM.telephoto / ASSUMED_LENS_NATIVE_MM.wide)`
  = `round(77/26)` = 3。它不参与任何换算，只是按钮上的字 —— 写成算式是为了改假定焦距时它跟着变。
- **超广角与长焦没有"回落到默认镜头"的兜底**：默认镜头是主摄，落到主摄上等于给用户一个假档位。
  取不到就 `available: false`（变灰）。单摄机型 0.5× 与长焦变灰，**1.4× / 2× 仍然可用**。
- **捏合是唯一会临时造出 `zoom > 0` 的入口**，而"16"这条行程只对主摄成立。所以
  `handleZoomChange` 会**先把镜头钉回主摄**再写 `zoom`。它刻意不调用 `applyStop()` ——
  那会把 `zoom` 归零，而 `usePinchZoom` 的基准是捏合开始那一刻的 `zoom`，中途归零每一帧都会跳。
- `DEFAULT_STOP_INDEX` 从写死的 `1` 改成 `ZOOM_STOPS.findIndex((s) => s.id === 'wide10')`：
  档位表是**语义顺序**不是硬件寄存器顺序，往表里插一档，写死的 `1` 就会静默指错档。

### 27.3 §三 导入：EXIF 坐标先反查地名，失败退回坐标

老照片导入以前**只印坐标**（`toResolvedPlace` 把 `city/region/country/countryCode` 一律填空串）。
现在 `importPhoto.ts` 读到的 EXIF GPS 会走一次 `Location.reverseGeocodeAsync`：

- 成功 → `resolvePlaceFromGeocode()` 的逐级降级结果（城市 / 省 / 国家），跟 `options.locale` 与
  设置页的"地名语言"档位走，港澳台前缀规则**只许保持不许回退**；
- 失败 → `null`，调用方退回 `toResolvedPlace`（**只有坐标**）。

⚠️ **反查失败绝不退化成"当前设备位置"** —— 那会把一张上海拍的旧照片印上"深圳"。这条不是靠自觉：
`resolvePlaceFromExifGps` 的入参**只有坐标**，整个函数里没有任何"取当前位置"的调用。

- 反查是**联网**调用，自己带 5 秒超时（`IMPORT_GEOCODE_TIMEOUT_MS`，与相机页的
  `GEOCODE_TIMEOUT_MS` 取同一个数）。用不了 `AbortController` —— `reverseGeocodeAsync` 的签名里
  没有 `signal` 参数，所以是 `Promise.race` 一个哨兵值。
- 反查"成功"但一个字段都没解析出来（海上、极地、系统只回了街道名）→ 也退成坐标。
  判据是 `placeNames.hasPlaceName()`，**不能**用 `formatResolvedPlace(...).trim().length > 0`
  —— 渲染器在一个字段都没有时会退回坐标串，那个判据永远为真，等于没判。
- "只有坐标"这个形状现在**只有一个构造点** `placeNames.coordsOnlyPlace()`，相机页的"坐标档"
  与导入的兜底共用它。两处各写一份字面量的话，将来给 `ResolvedPlace` 加字段只会改到一处，
  于是"同一张照片、同一个档位、两种输出"。
- ⚠️ **这一步绝不抛**：它是锦上添花，抛出去会被 `importAndDevelop` 的 per-photo catch 记成
  `failed += 1` —— 一张本来能出片的照片会因为"没网"被算成失败。
- **只有"地名"档才联网**：`ImportAndDevelopOptions` 新增 `locationMode`，两个调用方
  （`CameraScreen` / `GalleryScreen`）把设置里的档位原样传下来，`'place'` 之外一律不发反查。
  这是为了和相机页对齐 —— `locationStamp.ts` 的 `mode === 'coords'` 分支**根本不发反查**，
  导入这条路要是照发，同一对坐标在两条路上会得到两种结果（一个真地名、一个坐标串）；
  而 `'off'` 档那一行字压根不会印（`planWatermark` 挡住），为一个注定被丢掉的结果把 EXIF
  坐标发给 Apple 的地理编码服务，既是白等 5 秒也是隐私问题。

### 27.4 §三 导入：把居中裁切从"凑巧成立"变成显式的一步

`processFilmPhoto.ts` 新增 `centerCropPhoto()`：归一化**之后**，按 `layout.window` 的宽高比
居中裁出最大内接矩形，再交给合成层。

- **为什么现在才加**：合成层给照片的一直是 `resizeMode="cover"`，它**本来就会居中裁切**。
  于是"取景框所见 = 成片内容"过去只是凑巧成立（只要没人改 `photoFit`、没人动窗口坐标、
  没人换 `resizeMode`，它就一直成立，也一直没人能断言它）。裁成窗口比例之后 `cover` 面对的
  是一张比例已经相同的图，缩放是唯一剩下的动作、裁切量为零 —— **`cover` 成了恒等变换**，
  "所见即所得"从"依赖渲染器的行为"变成"图本身的属性"。
- ⚠️ **这一步不会改变现有成片的构图**（`cover` 本来就居中，这里也居中，裁掉的是同一块区域，
  差别只在取整和多解码了一次 JPEG）。它**不是为了修构图，是为了让构图变成结构上必然的**。
- **为什么在归一化之后裁**：归一化会改像素数量，裁切比例是按像素算的。先裁再缩会让两处独立的
  取整叠在一起（宽高各差 1px），裁出来的就不是"居中最大内接矩形"了。反过来先缩后裁只有**一次**
  取整，而且那次取整是 `normalizePhoto` 里已经验证过的那一次。
- **两种情况下不裁**：① 多开槽相框（半格双联）—— 它的 `layout.window` 是**两个槽的并集**（含中间
  的立筋），而渲染器是逐槽 `cover` 的，按并集裁出来送进 3:4 的槽里还要再 cover 一次，那一次
  **不是恒等变换**，等于"裁了等于没裁"却多付一次全图解码 + 重编码的内存峰值；
  ② `photoFit: 'contain'` 的相框 —— `contain` 的语义就是"整张完整放入、可以留黑边"，
  按窗口比例裁掉两边正好是它承诺不做的事。
- **失败一律降级**：裁切抛异常 / 原图宽高为 0 / 比例非有限数 → 退回归一化那张图，记一条 `note`，
  **绝不出片失败**。

### 27.5 这一版没有照字面执行规格的四处

| 规格写的 | 实际做的 | 为什么 |
| --- | --- | --- |
| `react-native-reanimated` 的 `SharedValue` + `withSpring` / Layout Animation | RN 自带的 `Animated`（`Animated.spring`） | 仓库没装 reanimated。为一个 150ms 补间引入原生重依赖 + 改 babel 配置，收益不成比例；`Animated.spring` 的观感一致 |
| `device.neutralZoom` / `virtualDeviceSwitchOverVideoZoomFactors` / `physicalDevices` | `selectedLens` + 每档 `zoom: 0` | 这三个 API 在 `expo-camera@57.0.6` 里**不存在**（详见 §27.2），等价且更稳 |
| `@react-native-masked-view/masked-view` 做镂空 | 四块 `LiquidGlassView` 围出窗口 | 同样没装。四块拼接不引入依赖，而且镂空边界就是四块玻璃的内边缘，天然对齐 |
| 胶囊文字"强制纯白" | 照做（`GLASS_TEXT_COLOR` + 字重 600 + 暗晕） | 用户明确要求。**代价**见 §27.6 |

### 27.6 已知限制

- **浅色主题下玻璃上的纯白文字对比度不足**：底色是 `rgba(255,255,255,0.52)`，白字白底。
  规格要求"强制纯白"，所以照做，但这是这一版最明显的观感风险。
- **模糊能不能真的采到相机预览画面，没有验证过**：iOS 上 `BlurView` 采的是它后面那一层，
  而相机预览走的是 `AVCaptureVideoPreviewLayer`。所以 `LiquidGlassView` 的底色
  （深色 `rgba(18,18,22,0.42)`）是**按"模糊完全不生效也要好看"定的**，不是按"模糊一定生效"。
- **`half-frame` 横拍时取景与成片仍然不一致**（v1.4.0 起就有的缺陷）：取景器参考线画的是
  两个槽的**并集**（1.603），而成片是逐槽 `cover`。本轮没有给
  `FrameOrientationVariant` 加 `slots`，因为那要再生成一张横版 PNG。
- **临时文件没有清理**：`normalizePhoto` 与新增的 `centerCropPhoto` 各留一张 JPEG 在 cache 目录，
  全仓没有任何 `deleteAsync`。这一版把每次导入的临时文件数从 1 张变成 2 张。
  系统会自己回收 cache，但频繁导入会让 cache 涨得快。
- **`src/components/ZoomStops.tsx` 是死代码**：从 v1.4.0 起 `CameraScreen` 就没再 import 它
  （取景器里已经没有档位条，只有焦段胶囊点按循环）。它描述的还是旧的"三档 + `flex: 1`"模型，
  已经过期。本轮没删（README §22 / §24 是历史章节，引用了它），**但别再照它推理**。
- **取景器那一侧仍然没传 `orientation`**：`CameraScreen.tsx` 里 `previewLayout` 的 `useMemo`
  只传了 `frame` 与盒子的宽高，第 4 个参数（`orientation`）是空的，而
  `processFilmPhoto.ts` 会按原图横竖选朝向。**目前踩不到**：`app.json` 锁了
  `"orientation": "portrait"`，拍照永远出竖图，两边都落竖版，实测取景窗与成片的窗口比例
  差 0.04%~0.3%（来自"取景盒 ≠ 显影盒"，每轴差 20pt，肉眼不可见）。
  会踩到的是**以后解锁横屏拍照**（或给取景器加横版预览）：`instax-mini` / `neg-135` /
  `slide-mount` 的横版窗口是竖版的**转置**，那时取景与成片会变成**互为倒数的两次裁切** ——
  各裁掉对方保留的那条边，就是典型的"边缘被误裁"。修法**不是**把照片传进去（取景那一刻还
  没有照片），而是拿取景盒自身去掉 padding 后的宽高比调一次 `resolveFrameOrientation`。

### 27.7 这一版**没有**在真机验证过的东西

| 项 | 为什么没法在这台机器上验证 |
| --- | --- |
| `BlurView` 能否采到相机预览层 | 只有真机能看出来。Windows 上跑不了 `AVCaptureVideoPreviewLayer` |
| 五档焦段在真机上是不是都对 | 每台机型的 `getAvailableLensesAsync()` 返回值不同，本机连相机都没有 |
| 反查地名的实际结果 | `reverseGeocodeAsync` 是 Apple 的服务，本机没有 EXIF 带 GPS 的照片可测 |
| 居中裁切改动前后是否逐像素一致 | 需要同一张照片改动前后各出一张片对比，没有真机跑不了合成 |
| 浅色主题下玻璃的观感 | 没有真机、也没有浅色主题下的截图 |
| 长焦档在 iPhone 11/12/13/14/15/16 基础款上是否如预期变灰 | 只是静态推断（那些机型没有长焦物理镜头） |
| 仓库里没有测试 | `__tests__` 不存在，`expo export` 也不做类型检查 —— 唯一的自动防线是 `npm run typecheck` |

---

## 28. v1.5.1：真机实测反馈的七条

来源：用户拿 v1.5.0 的真机录屏逐条反馈了 7 个问题，另外附了一份**由别的 AI 从视频里推断出的"病因"**。
处理原则写在这里，以后遇到同类反馈照办：**用户看到的症状一律采信；随症状附上的病因推断必须逐条用代码核实，不许照抄。**
下面每一条都标了"那份推断"与"代码里的事实"，其中 28.3 的推断是错的。

### 28.1 底部胶囊栏消失

**症状**：底部 `[色温][焦段][曝光]` 那排悬浮胶囊整个看不见了。

**那份推断**：遮罩 `zIndex` 盖住了；或者 `getAvailableLensesAsync()` 返回本地化名，过滤后是空数组，于是变焦按钮被藏了。

**事实**：胶囊从来就没有被门控过 —— `CameraScreen` 里的 `<ViewfinderBar>` 是无条件渲染的，`focalMm` / `onCycleFocal` 也一直接着。

真因是**定位基准变了**：`ViewfinderBar` 挂在 `styles.barLayer` 上，而 `barLayer` 是 `styles.preview` 的子层，用的是 `position: 'absolute', bottom: 12`。
v1.5.0 把 `styles.preview` 从"占屏幕中间一块"改成了 `position: 'absolute'` **铺满全屏**，于是 `bottom: 12` 的含义从"距控制台上沿 12pt"变成了"距**屏幕**底 12pt"——
整排胶囊正好落进控制台那块全宽玻璃面板背后（控制台有 `overlayChrome: { zIndex: 2 }`，而且它声明在 `preview` 之后）。

**改法**：不再写死 `bottom`。控制台 `LiquidGlassView` 加 `onLayout` 把实测高度存进 `consoleHeight`，`barLayer` 的 `bottom` 现算成 `consoleHeight + BAR_LAYER_GAP`。
任何机型、任何刘海高度、控制台以后长高变矮，胶囊都自动跟着走。

### 28.2 画面掉帧

**症状**：取景时画面发僵，不如系统相机跟手。

**那份推断**：同屏十几个 `BlurView` 实时高斯模糊榨干 GPU。

**事实**：成立，而且比"十几个"更集中 —— 镂空取景窗四周那**四块**紧贴屏幕边的 `LiquidGlassView` 是占整屏约 60% 面积的 `UIVisualEffectView`，
它们背后正好是每帧都在出图的 `AVCaptureVideoPreviewLayer`。面积 × 帧率，这是全屏里最贵的一处。

**改法**：四周换成哑光 `rgba(10,10,14,0.84)` 的 `Animated.View`（`ViewfinderWindow.tsx` 的 `MATTE_COLOR`），玻璃只留给顶栏、控制台、三颗胶囊和底片抽屉这些**小块**。
一句话概括这条取舍：**遮罩要的是"看不见"，玻璃要的是"厚度"** —— 遮罩不需要模糊。

顺带修掉一个一直在的小错位：四块哑光板的内边界改成和窗口弹簧共用同一组动画值（`Animated.add(left, width)` / `Animated.add(top, height)`），
以前窗口在弹、遮罩硬跳。同时把 `CameraScreen` 里那套静态的 `FocusBrackets`（四角括号 + 中央十字）整块删掉，四角归 `ViewfinderWindow` 的 2pt 纯白角标，
中央十字搬进同一层动画窗口 —— 于是"切画幅"只剩一套动画在跑。

### 28.3 导入带 GPS 的照片，水印仍然只印坐标

**症状**：设置里明明选的是「地名」，导入一张日本熊本机场的照片，成片下巴上还是 `LAT 32°50'N LON 130°51'E`。

**那份推断**：导入分支漏调 `reverseGeocodeAsync`；海外地址的字段兜底链缺失，应该 `place.city || place.subregion || place.district || place.region || place.name`。

**事实：这条推断是错的，而且是两处都错。**

- `src/utils/importPhoto.ts` 的 `resolvePlaceFromExifGps()` **确实**调了 `Location.reverseGeocodeAsync`，导入这条路一直有反查。
- 那条"字段兜底链"**本来就在** `src/utils/placeNames.ts` 里（`city: firstNonEmpty(source.city, source.district, source.subregion, source.region, fallbackCity)`）。

真正可能让用户看到坐标的只有三种情况，而且**三种都是静默退回**：反查超时（`IMPORT_GEOCODE_TIMEOUT_MS`）、`reverseGeocodeAsync` 抛异常、返回空数组。
所以这一条的修法不是"补上没写的那一步"，而是**把静默失败变得更能扛、也更可诊断**：

- 字段兜底链**补上 `name` / `street`**：机场、车站、景点这类 POI，iOS 经常只给 `name`（"熊本空港"压根不在 city/subregion 这些字段里），
  而原来的链子在拿到一个"字段全空但有 name"的结果时会判成"没拿到地名"，于是退回坐标。这是本轮**最可能真正命中用户那台机器**的一处。
- 超时后**重试一次**，两条路（拍照取景与导入）共用同一条耐心值与同一个 helper，不允许一边 5 秒一边 8 秒。
- 失败**留痕**（`console.warn`）但**绝不抛** —— 地名是这个 App 的装饰，不能因为它把一张照片的保存流程带崩。

另外要如实说一句：`settingsStore.ts` 里 `locationMode` 的**默认值是 `'off'`**。用户"以为自己选了地名、其实没选上"也是一条完全合理的解释 ——
这一条没法从录屏里区分，所以没有当成 bug 改，只在报告里提出来。

### 28.4 底片库抽屉被快门栏压住

**症状**：打开 `SELECT FILM STOCK · 底片庫`，底部那 5 个工具图标、白色大快门、相册缩略图浮在抽屉上面挡住半截列表。

**事实**：**RN 里 `zIndex` 压过声明顺序**。抽屉声明得比控制台晚，本该盖住它，但控制台有 `zIndex: 2`、抽屉**没有任何 `zIndex`**。

**改法**：还在 `styles.root` 上补 `zIndex: 10`。顺手把全屏提示层（`noticeLayer`）补成 `50` —— 它有同样的毛病，只是还没被用户撞到。
`overlayChrome` 那条注释扩写成了一张全局层级阶梯表，以后加层先看表：

| zIndex | 谁 |
| --- | --- |
| 2 | 顶栏 / 控制台 |
| 10 | 底片抽屉 `FilmDrawer` |
| 20 | 冲印进度遮罩 `DevelopOverlay` |
| 30 | 相册页 / 设置页 |
| 40 | 相册页里的"冲印中"遮罩 |
| 50 | 全屏提示 `noticeLayer` |

**不要**把 `FilmDrawer` 改成 RN `Modal` —— 理由写在它文件头（`Modal` 在 New Architecture 下会新开一个原生窗口层，而这台相机是设备级独占；`pageSheet` / `formSheet` 还自带圆角半透明背景）。

### 28.5 对焦框越界，切画幅不归位

**症状**：黄色对焦框卡在取景框最下边缘，一半在框内一半漏到框外的遮罩区；切换相框时它不会自己消失归位。

**事实**：`reticleOrigin()` 夹的是 `[0, width - RETICLE_SIZE]`，也就是**整块取景器**（= 全屏），而不是那个镂空窗。竖条同理。
另外 `handleFrameChange` / `handleBadgeFramePress` 只清了 `halfFrameBuffer`，**没有清 `focusTarget`**（`handleFlipCamera` 是清的）。

**改法**：`FocusReticle` / `FocusExposure` 都新增可选 `bounds`，`CameraScreen` 把 `viewfinderWindow`（`frameOffset + previewLayout.window`，正是镂空窗在这个坐标系里的矩形）传下去。
夹紧留 6pt 内缩（`BOUNDS_INSET`）：不是为了"框在窗内"（那只需 0），而是让框和那 1pt 窗口白线之间始终有缝，也刚好让开两根 2pt 角标。
竖条改成三处夹紧，右侧放不下就**翻到左侧**去。
两个切画幅的回调各补 `setFocusTarget(null)` —— 落点是按归一化坐标算的，换了画幅窗口的位置和大小都变了，与"切镜头要归位"是同一条规矩。

### 28.6 点开相册先黑屏约一秒

**症状**：点左下角相册缩略图，先黑屏约 1 秒才蹦出成片。

**事实**：不是人为延时，是**"打开"这个动作每次都把已经拿到的列表擦掉重画一遍**。
`GalleryScreen` 每次翻成可见都调 `refresh()`，而 `refresh()` 会置 `loading = true`；
`loading` 为真时整块列表被换成一颗 `ActivityIndicator`（`{loading ? <ActivityIndicator/> : ...}`），暗房底色又是接近纯黑，那颗小 spinner 在录屏里基本看不见。
这台机器上 `readGallery()` 还不只是读一次 `AsyncStorage` —— 它要对每条记录做 1~2 次 `new File(uri).exists` 的 native 往返，那一秒并不短。

（顺带纠正另一件事：`GalleryScreen` 其实**一直挂着**，它的 `useGallery()` 在 App 启动时就跑过一次，所以"列表是空的"只发生在启动后头一秒，不是每次打开都空。）

**改法**：

- `useGallery` 新增 `refreshSilently()`（= `load(true)`，不碰 `loading`）。隐藏→可见那一次对账改走它：**旧列表一直挂着，新结果回来一次性替换**。该更新还是更新，只是不再闪黑。
- 大图下面**永远垫一层缩略图**（`Lightbox` 新增可选 `thumbUri`，`GalleryScreen` 把已知的 `thumbUri` 递下去）。
  不做 `onLoad` 切换、不做透明度过渡 —— 大图不透明，画出来就盖住了；而 iOS 上缓存命中时 `onLoad` 可能根本不触发，拿它当开关等于把"能不能看到图"押在一个会漏的事件上。
- 新增 `src/utils/imageWarmup.ts`：`warmImageCache` / `scheduleWarmImageCache`（`setTimeout(..., 0)` 起跑 + 可取消）。
  `AlbumThumb` 预取最新的那一张成片 —— 它是唯一一张没在屏幕上渲染过、又最可能被点开的图。**刻意不 await**：预热是白赚就赚，不该挡任何一帧。

### 28.7 下巴水印过小

**症状**：成片下巴上的字太小。

**事实**：真的小，而且原因很具体。`dateFontOf()` 取的是
`round(clamp(min(window.width × config.fontSizeRatio, shortEdge × 0.02) × fontScale, MIN_DATE_FONT, 96))`。
手机短边约 358pt，`358 × 0.02 = 7.16pt`，**永远低于下限** —— 也就是说 `DATE_FONT_SHORT_EDGE_RATIO` 那条上限从来没生效过，真正在用的字号就是 `MIN_DATE_FONT`。
而 `MIN_DATE_FONT = 8` 是 v1.4.0"缩 35~40%"那一版配**自绘七段数码管**定的；v1.4.1 把数码管换成真字形（等宽粗体）之后，8pt 已经太小。

**改法**（三处常量，`src/utils/geometry.ts`）：

| 常量 | 旧 | 新 | 为什么 |
| --- | --- | --- | --- |
| `MIN_DATE_FONT` | 8 | **11** | 成片里约 63px 字高；这才是真正在用的那个数 |
| `DATE_FONT_SHORT_EDGE_RATIO` | 0.02 | **0.032** | 358 × 3.2% = 11.46pt，刚好压在下限之上 → 这条上限**开始真正生效**：大屏随短边变大，小屏由下限兜住 |
| `PLACE_FONT_SCALE` | 0.62 | **0.72** | 11 × 0.62 = 6.8pt 太小；0.72 让两行的落差与上一版一致，地名落到 8pt 的可读线 |

**"挤在偏右"这一半不成立**：`watermarkLayout` 的默认值本来就是 `'split'`，`computeWatermarkPlan` 里 `placeLine.align.left = region.left`、`dateLine.align.right = regionRight` —— 左地名右日期一直是对的。
用户看到的"偏右"应该是字太小 + 地名那一行短，视觉重心被右边的日期拉过去了；字号上来之后这一条应该自然消失，**没有为它改版式逻辑**。

### 28.8 这一版**没有照做**的三件事

1. **焦段按钮常驻显示 `[13mm | 26mm | 35mm | 52mm]` 四个档位** —— 没做。
   v1.5.0 的规格（用户自己定的 §一）明确要求删掉底部那条 `ZoomStops` 循环条，理由是"底部不该有两排控件"。
   这一版要修的是"胶囊被遮住"，不是"档位不够多"：焦段胶囊本来就显示当前毫米数、点它就能换档，再插一排四个按钮等于把用户自己删掉的东西加回来。
2. **切画幅用 `LayoutAnimation.configureNext`** —— 没做，因为不需要了。
   `useSpringRect` 本来就在补间窗口四边；这一版又把哑光遮罩和中央十字接进了同一组动画值，那个"硬跳的第二套"已经消失。再叠一层 `LayoutAnimation` 只会和弹簧打架。
3. **给 `Lightbox` 加左右翻页手势** —— 没做。
   录屏里没有提这个需求。但它连带影响一处：`GalleryScreen` 里原本有一段"打开大图时预热相邻两张"的代码，前提是"用户能滑到相邻那张"—— 而 `Lightbox` 里**没有翻页手势**（`PanResponder` 只做双击/平移缩放和单击关闭）。既然翻不过去，预热它们就是白解两张 12MB 位图，已删除。哪天加了翻页再按"只预热下一张"加回来。

### 28.9 这一版没有在真机验证过的东西

| 没能验证的 | 为什么 |
| --- | --- |
| 胶囊栏现在的位置对不对 | `consoleHeight` 来自 `onLayout`，算术上对；但"10pt 这个间距好不好看"要真机看 |
| 哑光遮罩的观感 | 少了模糊之后四周是不是"太平"，只有真机能判断 |
| 掉帧到底改善了多少 | 没有 Instruments，`BlurView` 从 4 大块降到 0 大块是事实，帧率数字拿不到 |
| 「地名」那条路在真机上是否真的通了 | 补了 `name` / `street` 兜底与重试，但 `reverseGeocodeAsync` 是 Apple 的服务，本机没有带 GPS 的 EXIF 照片可测 |
| 静默对账之后"黑屏"还剩多少 | 没有 `os_signpost`；`readGallery()` 里那些 `File.exists` 往返一次都没实测过耗时 |
| 预热有没有真的命中同一条缓存 | `Image.prefetch` 的 `RCTImageCache` 与 `<Image>` 是否同一个 key、写内存还是只写盘，都无法在本机确认 |
| 垫底缩略图会不会让"成片盖上来"闪一下清晰 | 400px 的 JPEG 放大版与 2048px 成片的锐度差，在纯黑底上可能被放大成一次跳变 |
| 水印 11pt 在大画幅上会不会顶到边界 | 探针只验证了"七款相框 × 三种版式都算得出 86pt 宽"，没有跑真实合成 |

### 29. 打包机换镜像这件事（v1.5.1 发布时踩出来的）

#### 29.1 经过

| 次序 | 镜像 | 结果 |
| --- | --- | --- |
| 1 | `macos-latest`（= macOS 26 **arm64**） | 连续 **3 次**排队满 15 分钟被 GitHub 取消，每次 `steps=0`，一步都没跑 |
| 2 | `macos-15-intel`（macOS 15 x64） | 机器**秒分配**，前 7 步全过（`npm ci` / `prebuild` / `pod install` 都成功），第 8 步 `xcodebuild` **退出码 65** |
| 3 | **`macos-26-intel`**（macOS 26 x64） | ✅ 一次通过，产出 `FretroCam-unsigned.ipa` |

第 1 次的两条标注原文：

```
[failure] The job was not acquired by Runner of type hosted even after multiple attempts
[notice]  Due to capacity constraints, jobs targeting macOS arm64 runners may experience longer queue times.
```

**排队没排上机器不消耗 Actions 额度**，但也产不出 ipa。用 `POST /actions/runs/{id}/rerun` 重跑同一
次 run（不改 commit、不新开 run）连续三轮同样被取消 —— 纯粹是 arm64 池没机器，与代码无关。

#### 29.2 第 2 次为什么编译不过（这条最值得记）

失败的不是我们的代码，是一个 CocoaPods 脚本阶段：

```
** BUILD FAILED **
The following build commands failed:
	PhaseScriptExecution [CP-User]\ Build\ ExpoModulesJSI\ xcframework
	  (in target 'ExpoModulesJSI' from project 'Pods')
	Building workspace FretroCam with scheme FretroCam and configuration Release
(2 failures)
```

那个脚本内部又嵌套调用了 `xcodebuild`，后者报的是：

```
xcodebuild: error: Could not resolve package dependencies:
```

**根因是镜像自带的 Xcode 版本，不是 CPU 架构。** 本工作流**刻意不 pin Xcode**，所以「换镜像 =
换工具链」：

| 镜像 | 自带 Xcode |
| --- | --- |
| `macos-15-intel` | `/Applications/Xcode_16.4.app` ← 太旧 |
| `macos-latest` / `macos-26-intel` | `Xcode_26.6.app` ✅ |

RN 0.86 / Expo SDK 57 的 `ExpoModulesJSI` xcframework 构建需要 Xcode 26 那一代的 SPM 工具链，
在 16.4 上会以「包依赖解析不了」这种**完全看不出真因**的方式失败。

**规矩**：以后改 `runs-on` 时，**macOS 大版本必须跟着一起保**（要 Xcode 26 就得选 macOS 26 的
标签）。宿主机是 Intel 还是 arm64 不影响未签名 ipa 的内容 —— 我们只做 `prebuild` + `xcodebuild`。

标签事实（`actions/runner-images` 的 README）：macOS 26 x64 = `macos-26-intel` / `macos-26-large`；
macOS 26 arm64 = `macos-latest` / `macos-26`；macOS 15 x64 = `macos-15-intel`。
只有带 `-large` / `-xlarge` 后缀的才是**计费的** larger runner，别改过去。

#### 29.3 v1.5.1 的产物

| 项 | 值 |
| --- | --- |
| 提交 | `eca224c4f5c17feabcdea3f846acb4a351592baa` |
| CI run | `38753851213`（job `116486964319`，`macos-26-intel`，全绿） |
| 工件 id | `11982897979`（`10864665` B 的 zip，内含 `FretroCam-unsigned.ipa`） |
| Release | `v1.5.1`，release id `413941631`，asset id `644208984` |
| ipa | `FretroCam-v1.5.1-unsigned.ipa`，**10,977,887 B** |
| sha256 | `e83cc6e5a0c62c5dcfe36fd9c566329634cc57f33f5e44f5e5be3b17057116a8` |

发布后回读 `Payload/FretroCam.app/main.jsbundle`（1,925,275 B）的字符串表：新增符号
`reverseGeocodeWithRetry` / `describeGeocodeFailure` / `refreshSilently` / `warmImageCache` /
`scheduleWarmImageCache` 各命中 1 次；`withGeocodeTimeout` / `IMPORT_GEOCODE_TIMEOUT_MS` /
`SegmentDate` / `FocusBrackets` / `AspectGuide` / `expo-font` / `reanimated` /
`POLAROID` / `INSTAX` / `KODAK` 全部 **0 次**；11 张相框 PNG 全部在包里。

#### 29.4 已知但这一版**没修**的一处观感回归（如实记）

v1.5.1 给 `placeNames.ts` 的降级链补了 `name`（POI 名）之后，在**「地名详细度 = 完整」**这一档
会出现行政区后缀被粘到 POI 名后面的现象：

```
日本熊本県省熊本空港市      ← 「省」「市」都是 ensureAdminSuffix 无条件粘上去的
Kumamoto Airport市
1-1 Chome市
```

**默认档位（`archive` 简略）不受影响**，输出是 `日本 · 熊本県 · 熊本空港`，正确。
修法是让 `ensureAdminSuffix` 对「非中日韩字符的名字」不粘后缀、或把「県」补进它的后缀表 ——
本轮没做，因为 `fe72d69` 已经推送、CI 已在队列里，不想为一个非默认档位的观感问题多烧一次
CI 额度（私有仓库每月约 2000 分钟，macOS 按 10 倍计费 ≈ 每月 200 分钟真实时间）。

---

## 30. v1.6.0：四模块重构（胶囊刻度尺 / 相纸正向 / 长卷不再叠合 / 地名与日期）

这一版是用户一次性提的四条需求，四条都动了**真代码**，没有一条是"看起来改了"。
四条各自都有可复现的探针证据（探针脚本跑完即删，命令与输出记在下面）。

### 30.1 模块一：悬浮参数胶囊 → `<ParameterScrubBar />`

三颗胶囊（色温 / 焦段 / 曝光）从"点一下切一档"升级成**单击快切 + 长按一滑到底**。

- 新文件 `src/components/ParameterScrubBar.tsx`（1154 行）：手势状态机 + 三轴纯换算 + 尺子几何。
- `src/components/ViewfinderBar.tsx` 重写为**两态视觉**（三胶囊 ↔ 展开态），里面**一行手势代码都没有** ——
  真实触摸在 `ParameterScrubBar` 的**捕获阶段**就被接走，所以胶囊内部的 `Pressable` 不会抢走长按。
- 依赖方向 `CameraScreen` → `ParameterScrubBar` → `ViewfinderBar`，单向，无 require 循环。

| 交互 | 判据 | 行为 |
| --- | --- | --- |
| 短按 | `< 160ms` 且 `\|dx\| < 5px` | 焦段循环 13→26→35→52；色温/曝光非 0 则归零 + `Light` |
| 长按 | `>= 160ms` | 展开刻度尺 + `Medium` |
| 起拖 | `\|dx\| > 5px`（不等时间） | 同上，立即展开 |
| 展开后 | 同一次 `PanResponder` 会话 | **不抬手**继续左右滑就改值 |
| 松手 | `Release` / `Terminate` | `COLLAPSE_DELAY_MS = 350` 后收拢 |

映射与触感：`wb` −1.00~+1.00、**每 6px 变 0.02**（`WB_PER_PX = 0.02 / 6`）、每 0.05 一次
`selectionAsync`、过 0.00 磁吸 + `Light`；`zoom` 13~52mm、四档标准位磁吸 + `Medium`、
13↔26 临界点换物理镜头（沿用 `lenses.ts` 的 `factorToZoom` / `ZoomLensRole`，没有第二套映射）；
`ev` −2.0~+2.0 步进 0.1，每跨 0.1 一次 `selectionAsync`。

**防卡顿是这一节的硬指标**（v1.5.1 刚修过掉帧）：
- 尺子位移由单个 `Animated.Value` 驱动，`RulerStrip` 唯一的 prop 就是这个引用恒定的值 →
  读数每 25ms 变一次时，**200 根刻度一根都不重建**。
- 写回 `CameraScreen` 严格按 `EMIT_INTERVAL_MS = 25` 节流，松手时 `settle()` 补发最后一帧。
- `CameraScreen` 顶层只在节流窗口被写；`cameraFocusProps` 仍走 `useMemo`。

**色温覆盖新加了一层 `gradedPreset`**（`CameraScreen.tsx`）：`applyGrainLevel`（设置项）与
"用户拧色温"（手势）各占一层，互不抹除。`color` 必须**整块展开复制** ——
就地改 `preset.color` 会污染 `PRESETS` 共享常量表。只有成片链路读它（快门 3 处 + 导入 1 处），
取景器实时预览不跑 `buildGradeLayers`，所以覆盖是"按下快门才生效"，不会把预览染色。

三处**有意偏离**（都写在代码注释里）：
1. **删掉了契约里的 `onPickFilm()`**。色温胶囊短按按规格改为**归零**；底片抽屉另有主入口
   （控制台右侧那颗 `DialButton` → `handleOpenFilmDrawer`），胶囊只是重复了一遍，
   而色温旧版**没有任何回到 0.00 的路**。
2. **`RULER_PAD_PX` / `RULER_RANGE_PX` 从契约的 360 / 1080 改成 800 / 1600**。
   契约那两个数**不够长**：最长的轴是 `ev`（整程 800px），滚到底时 `translateX = -800`，
   此刻指针（在 86% 屏宽的中线）底下还需要 `800 + 屏宽 × 0.86` 的刻度存在，
   1080 撑不住，会露出空白尾巴。
3. **`props` 增补**：`ParameterScrubBar` 增加 `focalMinMm`（只有父级知道这一面有没有超广角）、
   去掉 `onPickFilm`；`ViewfinderBar` 增加 `onCycleFocal` / `onReset(dial)` / `onAdjust(dial, dir)`
   （胶囊在它里面渲染，这三条通路必须由它转发）。

收拢态胶囊里**只有图标 + 读数**，删掉了旧版那三个 9px 中文词（色温/焦段/曝光）——
`CAPSULE_WIDTH = 86` 装不下 `13 + 18 + 33 + 22 = 96`。这是有意的视觉变更。

### 30.2 模块二：相纸**永远垂直正向**

用户报"横图把宝来来的宽下巴转到左侧、竖图缩在相纸左上角、右侧一条畸形白边"。

**真因不是居中公式错**，而是**横版 PNG 是把竖版纸整体转 90° 生成的**：
`scripts/generate_frames.py` 的 `landscape()` 自述「窗口跟着转：竖版 `(x, y, w, h)` 顺时针转 90°
之后落在 `(W − y − h, x, h, w)`」。代入 `polaroid-600` 得 `(1712 − 72 − 1264, 72) = (376, 72)`，
`376 / 1712 = 0.219626` —— 正是 `src/constants/frames.ts` 里 `landscape.window.x` 的值。
横向缺口左 72 / 右 **376**，所以"一侧大白边"是窗口坐标跟着纸转出来的，与照片居中无关。

**修法是一个单点开关**：`src/utils/geometry.ts` 的
`resolveFrameOrientation(frame, photo)` 自 v1.6.0 起**恒返回 `'portrait'`**。于是：

```
resolveFrameOrientation → 'portrait'（唯一开关）
  → computeFrameLayout 永远拿竖版 aspect / window
  → frameOrientationOfLayout 反推必为 'portrait'
  → frameSourceOf 恒取竖版 PNG（唯一的横版分支前置条件永不满足）
```

`computeFrameLayout` 全仓只有 2 个调用点（`processFilmPhoto.ts:373-374` 与
`CameraScreen.tsx` 的取景器预览，后者**根本不传 orientation**）→ **取景器与成片必然同版**。

顺带把"居中"这件事也钉死：`processFilmPhoto.ts` 新增纯函数
`centerCropOrigin(imageWidth, imageHeight, cropWidth, cropHeight)`（`originX/Y` 都是
`Math.floor((尺寸 − 裁切尺寸) / 2)`），探针 21 组余量全部 `|左−右| ≤ 1px`、`|上−下| ≤ 1px`
（奇数差那 1px 永远归左/上，是 `floor` 的必然结果）。渲染层同样没有 `(0,0)` 偏移：
`FilmCompositor.tsx` 用 `left/top/width/height` 定位窗口，照片是 `StyleSheet.absoluteFill` +
`cover`，`cover` 语义下 RN 在窗口内水平垂直都居中。

`frame.landscape` 字段与 4 款已有变体**保留不动**（现在不可达），留给将来真正为横构图
独立设计的横版纸；只要把那一个开关改回按比例判就能重新启用。**不要**为了让它们"活起来"
去改 `frameSourceOf` 或绕过 `resolveFrameOrientation`。

> ⚠️ 一处**口径收窄**：探针实测 4 款横版里 **`neg-135` 的横版窗口本来就是居中的**
> （`frames.ts:161` `x: 0.144103, width: 0.712308`，左右各 245px）。所以"宽下巴被转到侧边"
> 对 `polaroid-600` / `instax-mini` / `slide-mount` 精确成立，对 `neg-135` 不成立 ——
> 它顶多表现为"留白被搬到另一侧 + 齿孔带从左右转到上下"。

### 30.3 模块三：长卷底片不再互相叠合

**转述报告里的 `isOverlapBleed` 这个标识符在仓库里根本不存在**（`git grep` 零命中），
但它描述的打滑机制是真的。机制与量级（`StripView.tsx`）：

- `overlap = frameWidth × slip`，`slip` 只有 `index % 16 === 0` 的下一张有，取值 0.15~0.2。
- 但格子本来就有**正间距**，所以真正盖住前一张的是 **`overlap − FRAME_GAP`**：
  slip 0.15 → 26.27pt（帧宽 10.9%），slip 0.2 → 38.36pt（帧宽 15.9%），
  理论上限（`frameWidth` 300、slip 0.2）50pt = **帧宽 16.7%**。
- **"同一个量被减两次"在浏览态不成立**：布局层 `computeStripLayout()` 里那行
  `cursor -= frameWidth * previousSlip` 只污染 `offsets[16]` 这一个**从未被读的值**
  （渲染层传的间距是常量 `FRAME_GAP`）。实测 17 张时 `contentWidth` 新旧同为 **4366.6**、
  `holes` 同为 **191**，可见量零变化。
- **它真正成立的地方是海报导出路径**：`posterWidth` 的 reduce 减一次、`StripPoster` 渲染层
  又 `translateX: -overlap` 减一次 → 海报容器比画面窄、右侧被裁。已删，实测 3 张 / 4 张海报溢出 **0.00pt**。

**真正"越滚越对不上"的来源是第三个**：`contentWidth` 与视觉总宽的差值 = **`Σ overlap`**。
原先视觉层每张只推进 `frameWidth + FRAME_GAP − overlap`，而那个透明 `FlatList` 的 item 宽
与 `snapToInterval` 都写的是 `frameWidth + FRAME_GAP` → 每过一张错开 `overlap`，
17 张长卷在 `index 15` 打滑，从第 17 张起累计错位 **36.27pt**（约帧宽 15%）。
**现已归零**：视觉推进量 / `snapToInterval` / FlatList item 宽三者全部派生自同一个
`const sweepStep = layout.frameWidth + FRAME_GAP;`（实测三处同为 257.8pt）。

删除清单（全仓库 grep 剩下的 8 处命中**全是"说明为什么删"的注释**，无一处活代码）：
`SLIP_MARK` / `SLIP_RATIO_MIN` / `SLIP_RATIO_MAX` / `slipAt()` / `frameSuffix()` /
`overlap` / `overlapVeil` / `slipMark` / `translateX: -overlap` / `cursor -=`。

其它：单格容器改成**与是哪一张无关**的固定几何（`frameHeight = clamp(usableHeight, 120, 520)`、
`frameWidth = clamp(widest, 140, min(availableWidth × 0.62, 300))`，验算 n = 1/3/5/17 张时逐项相同）；
`FRAME_GAP` 10 → **16**，位移改用**正的右间距** `marginRight: isLast ? 0 : FRAME_GAP`；
图片 `resizeMode="contain"` 并改成显式 `position:'absolute'` + 四边 0 钉死，不再由自己的宽高比撑宽。
海报导出那格**有意保留 `cover`**：格高固定 748pt、格宽 = `748 × 图片宽高比`，
格子宽高比 ≡ 图片宽高比，`cover` 与 `contain` 像素级相同（理由写在 `:349-355`）。

> ⚠️ **`contain` 会留黑边**，这是行为改变不是 bug：格 241.8×520（宽高比 0.465），
> 竖版 3:4 画面实为 241.8×322.4，**上下各留约 98.8pt**。这是"单格固定宽高比"这条要求的
> 直接代价 —— 因为 7 款相框的宽高比本来就各不相同（0.6278 ~ 1.0077），任何单一格宽高比
> 都不可能让每一款都填满。
>
> ⚠️ **"约 80%"从这份代码里复现不出来**：能算出的最大遮挡只有"叠合 ≤ 帧宽 16.7%" +
> "旧 `cover` 两侧合计裁图宽 38%~65%"（竖版 3:4 图宽 390pt vs 帧宽 241.8pt → 可见 62%）。
> 合起来能解释"被挤/被盖"的观感，但 80% 这个数字找不到对应的代码路径。

### 30.4 模块四：地名**绝不回退坐标** + 双通道反查 + 日期不被截断

**① 不读 `GPSLatitudeRef` / `GPSLongitudeRef` —— 补读才是 bug。**
`node_modules/expo-image-picker/ios/ImageUtils.swift:317-333` 的 `readExifFrom(imageMetadata:)`
把 `kCGImagePropertyGPSDictionary` 里的**每一个键加 `GPS` 前缀拍平进 EXIF 顶层**，
取值来自 CoreLocation，**已经是折过符号的十进制度数**。对已带符号的值再按 `Ref === 'S'` 取负
= 南半球 / 西半球**坐标翻面**（悉尼变北纬东经）。探针实测：巴黎 `48.8566` 原样、悉尼 `−33.8688`
符号未丢、旧金山 `−122.4194` 符号未丢，越界 `91 → null`、只有纬度 `→ null` 也符合预期。
**结论：维持现状**，并把这条证据链写进 `importPhoto.ts` 的 `readExifGps` 上方注释。

**② 地名档绝不回退坐标。** `importPhoto.ts` 主循环改成三档语义：

```ts
const mode: LocationMode = options.locationMode ?? 'place';
const wantsPlace = mode === 'place';
const geocoded = gps !== null && wantsPlace ? await resolvePlaceFromExifGps(gps) : null;
const place = geocoded ?? (gps !== null && mode === 'coords' ? toResolvedPlace(gps) : null);
```

老写法 `geocoded ?? (gps === null ? null : toResolvedPlace(gps))` 在地名档失败时**也印坐标**，
正是要消掉的。`mode === 'coords'`（用户显式选坐标模式）那条路与 `coordsOnlyPlace`
**一字未动**。地名档反查无果时**左侧留空、不印胶卷编号** —— 因为 `FilmCompositor.tsx:179`
本来就有 `codeText = placeText.length === 0 ? formatExposureCode(...) : ''`：
地名空时左边**自动**变成胶卷编号，不需要在 `locationStamp` 里再造一份（那样会抢同一格）。

**③ 双通道反查（BigDataCloud 兜底）。** `Location.reverseGeocodeAsync` 失败 / 超时 / 返回空城市时，
用 `fetch` 打 `https://api.bigdatacloud.net/data/reverse-geocode-client`：
- `AbortController` + `fetchWithAbortTimeout(url, ms)`，**绝不抛**，失败只 `console.warn` 留痕。
- 提取顺序 `countryName` → `principalSubdivision` → `city`（`city` 缺失才退 `locality`）。
  **刻意不读 `localityInfo.administrative[]`** —— 实测香港那次回 7 条，会带出
  「香港特别行政区」这种越级名字。
- 格式化**完全复用** `resolvePlaceFromGeocode` + `formatResolvedPlace`，港澳台前置规则自动生效，
  没有第二套格式化。
- 复用 v1.5.1 那套常量（`GEOCODE_ATTEMPT_TIMEOUT_MS = 5000` / `GEOCODE_MAX_ATTEMPTS = 2` /
  `GEOCODE_TOTAL_BUDGET_MS = 10000`），**新增唯一一个** `GEOCODE_NETWORK_TIMEOUT_MS = 4000`。
  **最坏等待 = 10s + 4s = 14s**（网络通道不重试），写进了注释。
- 新增 `resolvePlaceFromCoords(coords, locale?, uiLocale?)` 作为**唯一入口**，
  返回 `{status:'ok', address, place, channel:'native'|'network'}` 或 `{status:'failed', reason, ...}`；
  `locationStamp.ts` 与 `importPhoto.ts` 共用它。

**④ 日期掉字的真因是"零余量"，不是"和地名拼在一行"。**
转述报告说的因果链是错的。逐条否掉全部候选：
1. **`dateStampWidth()` 低估字宽 —— 否。** PIL 读 `C:\Windows\Fonts\courbd.ttf`
   （iOS `CourierNewPS-BoldMT` 同族）实测 advance **精确 0.6000 em**，
   `MONO_ADVANCE_RATIO = 0.6` 本来就准。
2. **v1.5.1 抬字号（8→11pt）导致预留不够 —— 否。** 容器宽度与字号是同一条线性函数（同一个 `dateFont`），同比缩放。
3. **`region` 宽度不够 —— 否。** 490 组（5 舞台 × 7 相框 × 2 档）**全部** `reserved > measured`。
4. **日期块与地名槽相交 —— 否。** 35 组相交 **0**，两者之间恒为一条 `SPLIT_GUTTER`（12pt）。
5. **split 里日期会跟着 `frame.watermark.align` 贴左 —— 否。** `geometry.ts:1170` 无条件右贴。

**唯一真实存在的风险 = 容器宽度与文字 advance 恰好相等、余量 0**：
模型 = 真字体 = 94.60pt，多出的 2pt 只来自"RN 是否给最后一个字形也加字距"这条**未写进文档的假设**；
iOS CoreText 逐字形取整，11 个字形各差零点几 pt 累起来就超容器 → `numberOfLines={1}` 给省略号。
**修法（最小）**：新增 `export const DATE_GLYPH_SLACK = 0.5`，`dateStampWidth()` 末尾 `+ DATE_GLYPH_SLACK`
（每个字形留 0.5pt，11 字形 = 5.5pt ≈ 5.8% 确定余量，**只在日期这一处**）；
`DateStamp.tsx` 容器改成 `{ width: quartz.width, maxWidth: quartz.width }` 两者同值钉死。
`adjustsFontSizeToFit` / `minimumFontScale={0.9}` 保留为兜底，但注释改成"不是宽度来源"。

**⑤ 顺带修掉的真 bug**：`placeNames.ts` 的 `compactPlace` 原来**无条件**
`return { ...place, region: '' }`。对"`region` 与 `city` 同名"的港澳形状会清空 region →
`full` 档少掉「香港」半截、再给空城市补「市」→ **`中国市` 这种缺字串**（`archive` 档看不出来）。
修法是把 `distinctRegion` 的判据抽成共享定义，`region` 为空时原样返回。验证：香港精简前后
`archive` = `中国 · 香港`、`full` = `中国香港特别行政区` **逐字不变**。

**⑥ 超长地名自动精简（用户要求）已接进渲染链。** `geometry.ts` 抽出
`splitPlaceAvailableWidth(regionWidth, quartzWidth, gutter)` —— 它和 `computeWatermarkPlan` 的
`split` 分支**是同一行算术**（`geometry.ts:1152` 自己就调它），所以"算出来的可用宽"与
"画出来的可用宽"永远是同一个数。`FilmCompositor.tsx` 的 `planWatermark` 里做**两趟排**：

```
第一趟：按完整地名 computeWatermarkPlan
  → 从 plan.region.width 与日期行的 quartz.width 算出地名可用宽
  → shouldCompactPlaceText(地名, 字号, 字距, 可用宽) 为真才精简
第二趟：用 compactPlace(地名) 重排一次（只排一次，不迭代）
```

精简形仍走 `formatResolvedPlace`，所以港澳台规则 / 多语言 / 详细度档全部自动继承。
**不做"截断 + 省略号"**：`上海市 · 黄浦…` 比 `中国 · 上海` 更没用。

### 30.5 三条「转述报告说错了」的更正（如实记）

| 转述报告的说法 | 核实结果 |
| --- | --- |
| `isOverlapBleed` 逻辑要删 | **这个标识符在仓库里不存在**（`git grep` 零命中）；机制真存在，已删干净 |
| "地名与日期拼在同一个字符串里单行渲染导致日期被截断" | **因果链错**。`split`（左地名右日期）本来就是默认版式；真因是**日期容器零余量** |
| "EXIF GPS 要按 `GPSLatitudeRef === 'S'` 处理正负号" | **照做反而会出 bug**。`expo-image-picker` 给的值已带符号，补读 Ref = 双重取负 → 南半球翻面 |
| "后一张盖住前一张约 80% 画面" | **复现不出来**。最大叠合 ≤ 帧宽 16.7%；旧 `cover` 两侧合计裁图宽 38%~65% |
| 历史注释里的 `中国香港市` | **该字面量在仓库里从未存在过**（`git grep` exit 1）。香港 `full` 档自 v1.5.0 起恒为 `中国香港特别行政区` |

### 30.6 没有照做 / 办不到 / 留作后续

1. **没有真机验证**（最大缺口）。本机是 Windows、无 iOS 运行时；`tsc` 只证类型，
   `expo export` 只证能打包，**两者都不证视觉与触摸**。所有手势（160ms / 5px / 350ms / 磁吸手感）、
   触感频度、玻璃观感、变焦是否闪黑、VoiceOver 四条通道**一次都没在设备上跑过**。
2. **缺一个 i18n 键**：`camera.bar.scrub.hint`（"长按滑动调整，轻点归零"）。
   现在**完全没有**这层提示 —— 上一位作者选择"宁可空着也不传旧版那句错的"
   （`camera.bar.ev.hint` 原值"上下滑动调整曝光"是旧版竖直拖的说法，与本轮"长按展开后横向滑"
   不是一回事）。另建议修订 `camera.bar.focal.a11y`（现值"焦段 {label}，轻点切换"在长按可搓之后语义不完整）。
   **这两个键本轮没加**（要动 5 个语言包 + 一个渲染位）。
3. **曝光读数口径不一致**：胶囊按用户规格走 **0.1 步进**（`+0.4`），
   而 `FocusExposure.formatExposure` 会把同一个值**量化到 1/3 EV** 显示（`+0.3`）。
   同一份 `exposure` state，两个控件读数会差一档。判断是胶囊更接近真值
   （原生 `setExposureTargetBias` 收连续量），**没有统一**。
4. **§29.4 那条观感回归仍然没修**：`full`（完整）档 POI 名会被 `ensureAdminSuffix` 粘行政区后缀
   （`日本熊本県省熊本空港市`）。默认 `archive` 档不受影响。
5. **`contain` 的黑边**（见 30.3 的 ⚠️）与**横版变体仍然不可达**（见 30.2）都是有意保留的状态。
6. **没有自动化回归测试**：`devDependencies` 只有 `typescript` / `babel-preset-expo` / `patch-package`，
   按"不新增依赖"的约束没有引入测试框架，所以那些探针断言**未来不会被重跑**。

### 30.7 这一版验证到什么程度

| 项目 | 命令 / 方式 | 结果 |
| --- | --- | --- |
| 类型 | `npm run typecheck` | **exit 0** |
| 打包 | `npx expo export --platform ios --no-bytecode` | **exit 0**，bundle `index-c661d9ba51706c9677431d379015219d.js`（1.3MB） |
| 模块二 | 21 组（7 相框 × 竖/横/正方）真函数探针 | **326 项断言全绿**，取到横版 PNG 的组数 **= 0**（期望 0）；含反向守卫与 `stage=0x0` / `photo=-5x-5` 边界 |
| 模块三 | 40 项断言（含空数组、极矮屏、窄屏、横版、`height=0`、帧号 `A` 后缀必须消失、海报宽度不溢出） | **ALL PASS**；`contentWidth` 新旧同为 4366.6、海报溢出 0.00pt |
| 模块四 | 2660 项断言（42 条地名 × 语言/档位、红线逐字基线 + 20 条守护、地名档零 LAT/LON、EXIF 符号保真、BigDataCloud 5 结局、490 组 split 宽度） | **2660 通过 / 0 失败** |
| 红线 | 港澳台中文简繁基线 | `中国 · 香港`、`中国 · 台湾 · 台北`、`中国台湾省台北市`、`中國 · 台灣 · 台北` **逐字一致** |

**真机未验证清单**（要盖章就得在设备上过一遍）：
胶囊长按展开与不抬手续滑 · 三颗胶囊的磁吸手感与触感频度 · 展开态 86%×48 玻璃的观感与
`alignSelf:'stretch'` 下 `86%` 的实际解析值 · 13↔26 换镜头时 `CameraView` 是否闪黑 ·
相纸是否真的永远正向直立、宽下巴回到正底部 · 日期是否真的不再出省略号 ·
长卷单格是否真的完整居中不叠合 · 地名档在真实无网/弱网下是否 14s 内必有结论。

### 30.8 v1.6.0 产物指纹（发布后回填）

| 项目 | 值 |
| --- | --- |
| 本地提交 | `7beb0f9bb6a39340e49111ab19f4c1dda7d1c9af`（父 `63eae680ef888e2458c273ce7567165fa96046f2`，14 个文件） |
| 远端提交 | `36ccb5741db3482b9b7fbb6a5c152e4fd89dc820`（父 `9bd872365c0de369c7c90f8f9049da78c99f41a5`） |
| 远端树 | `3d56fa86dba1a7820fb80066dbef81c4a0f24779`（与本地 HEAD 的树逐字节相同） |
| CI | run `38767439059` **success**（head `36ccb5741db3`），job `116534209125` 全 step 通过 |
| artifact | `11990665707` · `FretroCam-unsigned-ipa` · 10,875,740 B |
| Release | `v1.6.0` · release id `414030371` |
| asset | `644458011` · `FretroCam-v1.6.0-unsigned.ipa` · 10,989,875 B |
| sha256 | `3c23ec31e7fbb5da5e3ac17494bb564aacb50826a18248b9eebdc25b60a6e08e` |
| 下载地址 | `https://github.com/lizimo20041023-oss/retro-film-cam/releases/download/v1.6.0/FretroCam-v1.6.0-unsigned.ipa` |

产物回读核对（`_verify_ipa_v160.py 11990665707` → **RESULT: OK**）：34 个「应存在」符号全部命中
一次（本版新函数名 + `api.bigdatacloud.net/data/reverse-geocode-client`），18 个「应不存在」符号
全部 0 次（含转述报告里那个 `isOverlapBleed`）；`Info.plist` 版本已是 `1.6.0`、旧 `1.5.1` 不在、
bundle id `com.canyerylee.fretrocam`；相框 PNG 仍 11 张。

⚠️ 那 4 张 `*-landscape.png` **还在包里但已是死资源**（`frameSourceOf` 的横版分支不可达）。留着是
有意的 —— 将来真要给横构图设计横版纸时它们还在，删掉反而要多一次重新生成资源。代价是 IPA 里白白
多背约 500KB。

---

## 31. v1.6.1：六模块体检落地 + 闪光灯三档

这一版没有新玩法，全部是"把用户报的问题逐条核实、再改掉"。三条结论值得单独留档：
一个 `require` 环让整排刻度算成了 `NaN`；一条 320×320 的 tile 因为左右边缘对不上，
每 320pt 就切出一条贯穿全屏的竖线；以及"焦段卡在 13~15mm"的真因，跟用户描述的
"边滑边切镜头"完全不是一回事。

### 31.1 这一版改了什么

| 模块 | 文件 | 关键改动 |
| --- | --- | --- |
| 相框精简 | `src/constants/frames.ts`、`FilmCompositor.tsx`、`useFilmStage.ts`、`src/utils/geometry.ts`、`src/utils/processFilmPhoto.ts`、`src/types/index.ts` | 相框 **7 → 5 款**，连带删掉整套"一框多图"机制（见 31.4） |
| 三颗常驻胶囊 + 刻度尺 | `ParameterScrubBar.tsx`、`ViewfinderBar.tsx` | 修掉 `require` 环导致的 `NaN`、焦段改四档分段条（见 31.2 / 31.5） |
| 对焦框与曝光条 | `FocusReticle.tsx`、`FocusExposure.tsx` | 新增 48pt 安全内区、淡出改 2000ms、拖动期间重置计时器（见 31.6） |
| 底片库 | `FilmDrawer.tsx`、`FilmCard.tsx` | 撤纹理层、修卡片描述两行（见 31.3） |
| 闪光灯 | `ToolRow.tsx`、`CameraScreen.tsx` | 两档开关 → 三档循环（见 31.7） |
| 文案与死资源 | 5 个语言包、`src/constants/uiAssets.ts`、`assets/ui/README.md` | 删 6 个死键、订正 6 处过时文字（见 31.8） |

`git diff --stat` 覆盖 **24 个文件**（2125 insertions / 1969 deletions）；`npm run typecheck` 与
`npx expo export --platform ios` 两道门槛都 exit 0。

### 31.2 一个 `require` 环，把 41 根刻度算成了 `NaN`

**症状**：长按胶囊展开后是一个"玻璃在、指针在、刻度一根没有"的空洞灰框。

**根因**：`ViewfinderBar.tsx` 反向从 `ParameterScrubBar.tsx` import 了 15 个几何常量，
而 `ParameterScrubBar.tsx:32` 又 `import { ViewfinderBar } from './ViewfinderBar'`。于是
`ViewfinderBar` 模块顶层那句

```ts
const MARK_COUNT = Math.round(RULER_RANGE_PX / MARK_GAP);
```

被求值的那一刻，`ParameterScrubBar` 才执行到第 32 行 —— `RULER_RANGE_PX` 的真定义
（原 `ParameterScrubBar.tsx:435-436`）还在后面，读到的是 `undefined`：
`Math.round(undefined / 8)` = `NaN`，`Array.from({ length: NaN })` = `[]`，**一根刻度都不画**。
同一批 `undefined` / `NaN` 还进了 `styles.rulerClip.height`、`styles.marks.width`、
`styles.markMajor` / `markMinor.height`、`styles.pointer.width` / `height`，以及三颗胶囊的
`radius={CAPSULE_HEIGHT / 2}` —— 所以真机上那三颗也不是按规格画出来的壳子。

**治法**：几何常量只归一处所有，且不反向依赖手势层。常量全部搬进 `ViewfinderBar.tsx`
（`:4-14` 写明了原因），手势层单向 import、只用 `import type` 指一次类型。

顺带把刻度数字对齐规格：主刻度高 12 → **14**，次刻度 6 → **7**，透明度 0.85 / 0.35，
每 5 格一根主刻度、周期 40px。刻度根数**按窗口宽算**而不是写死：

```ts
rulerMarkCount(windowWidth) = Math.ceil((0.86 * windowWidth + 40) / 8) + 1
// 320pt → 41 根（用户规格里的那个数）；390pt → 48 根（写死 41 右侧会露白）
```

### 31.3 暗房面板那条竖线：320×320 的 tile 左右边缘对不上

`assets/ui/leather-tile.png` 是 320×320、同目录没有 @2x/@3x，以 `resizeMode="repeat"`
铺在抽屉面板上。逐像素量下来它**左右边缘接不上**：`col319 ↔ col0` 的平均绝对差 **2.0697**
= 内部相邻列 1.2812 的 **1.62 倍**，320 条边界里排**第 1 陡**；行方向 wrap 2.1343 vs
内部 1.2854 = 1.66 倍。面板是全宽的，于是这条缝恒在 **x = 320pt**：屏宽 375 / 390 / 393 /
414 / 430 时，它就在 ✕ 按钮左侧 3 / 18 / 21 / 42 / 58pt —— 与用户说的"✕ 旁边"吻合。

**两条反证**（这次核实里最有价值的部分）：

- 用户猜的"左右背景色不一致"**不成立** —— 接缝两侧各 20pt 的平均亮度是 18.855 vs 18.840
  （差 −0.015，约等于 0），是**纹样断层**，不是两种底色。
- 用户说的"✕ 外层多余异色背景块"在 v1.6.0 里**不存在** —— `git diff` 证明那个 `Pressable`
  与 `HEAD` 逐字节相同，它本来就没有背景色。

**分寸**：把合成接缝图 5× 放大亲眼看过，**肉眼并不显眼**（整图 std 0.643、接缝每行平均跳
0.726）。所以只敢定性成"统计上最强 + 位置完全吻合的连贯断层"，**不写成"一条明显的黑线"**。

**修法**：抽屉里删掉纹理层，只留一块不透明底色 `SHEET_SURFACE_DARK = '#141416'` 加一道顶部微光
（`experimental_backgroundImage`，RN 0.86 核心能力、零新依赖；iOS 侧解析失败会优雅降级成纯色，
**Android 侧未验**）。要的不变量是"抽屉内没有任何会横向变化的层"。
`assets/ui/leather-tile.png` 从此在 App 里**没有任何 `require`**（`UI_ASSETS.leatherTile` 条目已删），
但**文件本身留在仓库里**：`scripts/preview_ui_mock.py` 还要拿它出设计稿，
`assets/ui/README.md` 里已写明"实测左右边缘仍然对不上，别再铺回任何面板"。

### 31.4 相框 7 → 5：半格双联的退场

删掉的是 `half-frame`（半格双联，v1.4.1 加的，见 §26）与 `sheet8x10`（8×10 散页）。剩下 5 款：
`polaroid-600`（`INSTANT SQ`）、`instax-mini`（`INSTANT MINI`）、`neg-135`（`135 NEG`）、
`slide-mount`（`SLIDE`）、`fp100c`（`FP-100C`）。

连带删掉的是整套"一框多图"机制，一处不留：`FrameSpec.slots`、`FrameSlot` 类型、
`geometry.ts` 的 `computeSlotRects` / `slotBounds`、`FilmCompositor` 的 `slotRects.map` 渲染路径
（含每格 `overflow: hidden` 的 `styles.slot`）、`useFilmStage` 的就绪计数分支、`stage.secondUri`
的一路透传。删除的理由很直接：5 款相框里再没有一款开槽，留着等于给不可能的状态写代码。

- 五个语言包各删 4 键（`camera.half.plate`、`camera.half.hint`、`frame.halfFrame`、`frame.sheet8x10`）。
- `assets/frames/half-frame.png`（177,081 B）与 `sheet8x10.png`（80,910 B）**文件仍在仓库里、已无 `require`**，
  包里因此少背 **约 258 KB**。`sheet8x10.png` 也正是唯一印着 `KODAK 4142` 的那张图（§25 商标清理时改的片边字）。
- `FilmCompositor.tsx` 805 → 719 行，`frames.ts` 326 → 252 行。

### 31.5 焦段"卡在 13~15mm"的真因，与用户描述不符

用户描述是"边滑边切镜头就卡死"。代码上**单指根本到不了** `handleZoomChange`
（`src/hooks/usePinchZoom.ts:71,73` 要求 `touches.length === 2`），`CameraView` 也只在重试路径
自增 `key`（`CameraScreen.tsx:1176`，自增点在 `:558`）—— 所以"切镜头导致 `CameraView` 重挂载、
`PanResponder` 被 terminate"这条假说被**反证排除**。

真凶是上一版的 `uAtFocalMm`：它把**绝对对数比** `ln(mm / 26)` 当成**段长** `ln(f₁ / f₀)` 来用，
于是任何 ≤ 26mm 的输入都返回 `u = 0`；`offsetAtValue('zoom', 26)` 因此落在刻度轴最左端 `−720px`，
**展开那一瞬间指针底下就是 13.0mm**，手指再走一点就上报 `onFocal(13.x, 'ultraWide', 1)`。

这一版把整段"连续映射"删掉，换成**四档标准位**（13 / 26 / 35 / 52mm）的分段条：
滑选期间**一次都不上报**（`previewFocal`），只在松手或点选那一刻提交一次（`commitFocal`，
全仓唯一发 `onFocal` 的地方），13↔26 临界点自动切 `selectedLens`。因此**不存在"滑一半就把
镜头切走"的路径**。手感常量沿用上一轮：长按判据 `HOLD_MS = 160`、抖动阈值 `TAP_SLOP = 5`、
收拢延迟 `COLLAPSE_DELAY_MS = 350`、焦段 `FOCAL_COLLAPSE_DELAY_MS = 500`、父级同步节流
`EMIT_INTERVAL_MS = 25`。

⚠️ **曝光读数与写回相机的量化步长不是同一个**：胶囊按用户规格以 0.1 显示、触感也按 0.1 一步
（`EV_HAPTIC_STEP = 0.1`），而写回相机的 `exposure` 恒为 `1/3` EV 的整数倍
（`FocusExposure.tsx:30 EXPOSURE_STEP = 1 / 3`，`:41 quantizeExposure`）—— 读数并没有"对不上"
（它显示的就是量化后的真值，`−1/3` 渲染成 `-0.3`），只是**数值每 1/3 才动一格、触感却响三下**。
这是照用户原话实现的；若哪天想改成"响一下 = 读数动一格"，把
`ParameterScrubBar.tsx:94` 的 `EV_HAPTIC_STEP` 改成 `1 / 3` 即可（一行）。

### 31.6 对焦框：48pt 安全内区是新加的，淡出 3000 → 2000 不是根因

- **"48pt 安全内区"这条规格从来就没实现过**。上一版只有一个 `BOUNDS_INSET = 6`，作用是把框
  夹进窗口 —— 8 组真实窗口实测"贴角时距窗右沿恒 6.0pt、越界 = false"，所以"越窗"复现不出来。
  这一版新增 `export const SAFE_INSET = 48;` 与 `export function safeAreaRect(bounds): Rect`，
  `reticleOrigin` 改用安全区且**不再叠加 6**。实测：iPhone 15 Pro 方形窗口 `L20 T90 W353 H410`
  → 安全区 `L68 T138 W257 H314`；左上角的框从 `(26, 96)` 挪到 `(68, 138)`。
  退化窗口用 `insetX = Math.min(SAFE_INSET, Math.max(0, (width − RETICLE_SIZE) / 2))` 收缩到 0 ——
  **硬收 48 会让框越界，而"越界"是明确禁止的那一条**，两者冲突时保不越界。
- 淡出 `IDLE_MS` 3000 → **2000**，并按用户要求"拖动期间重置计时器"：`onPanResponderMove` 里
  显式 `clearIdle(); resetIdleTimer();`，节流到 `IDLE_MS / 4 = 500ms`，且**"没到点"时不直接
  return**，而是挂一个补偿计时器把重排补上（否则会出现"没有任何计时器在飞"的空档）。
- ⚠️ **3000 → 2000 是"把等待期砍掉 1/3"的改善，不是被证实的根因**。"淡出提前"这条投诉的机理
  **没能复现**：`fade` 是组件私有的 `Animated.Value`，全仓扫过 `fade.` / `Animated.Value` /
  `.stop()`，没有任何跨文件共享的触点，"别处有人动了同一个值"从嫌疑名单里划掉。
  真机若仍复现，下一步查"父级 `focusTarget` 没被清"或"目标机型 `useNativeDriver` 完成回调不回调"。

### 31.7 闪光灯：两档开关 → 三档循环

`CameraView` 的 `flash` 属性（**新架构里属性名是 `flash`，不是旧文档里的 `flashMode`**）现在接
`'off' | 'on' | 'auto'`，`ToolRow` 那颗按钮从"开/关"变成三档循环，切换瞬间在取景器顶部浮
0.8 秒的微型状态提示（`FLASH_HINT_MS = 800`）。

三种状态刻意落在**三条互相独立的通道**上（描边 / 图标 / 底盘），日光下也能一眼分清：

| | off | auto | on |
| --- | --- | --- | --- |
| 图标 | 半透明暗灰 + 一道 `View` 画的斜杠 | 纯白 | 琥珀橙 `#E5A93C` + 琥珀发光 |
| 底盘 | 深色玻璃原样 | 深色玻璃原样 | 再压一层 `rgba(229,169,60,0.28)` |
| 描边 | 1pt `rgba(255,255,255,0.45)` | 无 | 1pt `#E5A93C` |
| 角标 | 无 | 右上角 15×13 琥珀胶囊 `A` | 无 |

- **"实心闪电"办不到**：`assets/ui/` 只有两张闪电贴图，都是 168×168、不透明像素都是 3951、
  bbox 都是 `(47,15,122,154)`、**alpha 通道逐字节相同**（只有预烤 RGB 不同，RN 的 `tintColor`
  按 alpha 上色），bbox 内覆盖率只有 37.1% —— 是线稿，不是实心。实心感由"琥珀底 + 发光"承载，
  不手画多边形。
- `on` 档走的是**叠层**而不是 `LiquidGlassView` 的 `overlay`：后者的 `overlay ?? …` 是**替换**
  语义，走它会把深色玻璃底丢掉，过曝天空一淹，琥珀图标就没了。
- 琥珀色写死成 `FLASH_AMBER`，**不取 `ink.amber`**：`src/constants/theme.ts:72` 的深色机身是
  `#E5A93C`，但 `:83` 的 `LIGHT_INK.amber` 是**朱红 `#D32F2F`** —— 闪光灯与 `theme.focus` 一样
  是硬件信号，不跟机身换色（`:60` 有先例）。
- 角标 `A` 的文字用近黑 `#1A1206`（对琥珀底 8.7:1，纯白只有 2.1:1）+ 1pt 暗描边。
- ⚠️ **Android 上 `shadow*` 不吃 `elevation`**，`on` 档的"微发光"等于没有，那台机器只剩
  "琥珀图标 + 琥珀底 + 琥珀描边"三条通道。

### 31.8 这一版删掉 / 订正的文字

- **删** 闪光灯旧的两个**动作**键 `camera.flash.on` / `camera.flash.off`（三档之后一个动作名
  覆盖不了三种状态，全仓零消费）→ 5 个语言包各删 2 键，现每包 **174 键**。
- **订正** 5 个语言包的"胶卷库"小节注释：原文写着"长按取景器下方的胶片名打开"，而**全仓根本
  没有那个长按手势**（`onLongPress` 只出现在 `GalleryScreen.tsx:636/659/662` 与
  `StripView.tsx:461/468/720`）→ 改成"点右下角那颗胶卷按钮打开"
  （`zh-Hans.ts:48` / `zh-Hant.ts:39` / `en.ts:40` / `fr.ts:40` / `ja.ts:39`）。
- **订正** 底片库提示文案 `film.drawer.hint`：旧文案描述的也是那个不存在的手势。
- **订正** `camera.bar.temp/focal/ev.a11y` 三条无障碍标签：上一版写"轻点切换"，在焦段改成
  原地展开分段条之后已不成立 → 补上真实手势（"长按滑动调整，轻点归零 / 展开档位"）。
- **删** `UI_ASSETS.leatherTile` 条目（见 31.3）。

### 31.9 这一版验证到什么程度

- `npm run typecheck` **exit 0**；`npx expo export --platform ios --no-bytecode` **exit 0**。
- 各模块自带的探针（typescript `transpileModule` + require 桩，不装任何测试框架）分别跑过
  123 / 176 / 179 / 297 条断言，全绿；跑完的临时目录与脚本**全部自删**，`git status` 无残留。
- 每次导出的 bundle 都做了**包内 grep**（`rgba(40,40,45`、`#141416`、五种语言的新文案等），
  确认改动真的进了包。⚠️ 这里有个假阴性坑：Metro 把 CJK 转义成 `\uXXXX`、把 `·`(U+00B7)
  转义成 `\xXX`，探针只解 `\uXXXX` 会把中文文案全判成"没进包"。

**真机未验证清单**（一条都没跑过，本机无设备无模拟器）：

- 全部触摸手感：160ms 长按判据、5pt 抖动阈值、"不松手接着滑"、350ms 收拢、磁吸与 `Haptics` 实感；
- 展开态 86%×48 玻璃的观感、`alignSelf:'stretch'` 下 `86%` 的实际解析值、320pt 窄屏上三颗胶囊
  是否会先丢中文词；刻度尺是否真的 60fps（只保证"25ms 节流 + `Animated.Value` 驱动"两条代码事实）；
- 13↔26 换镜头时 `CameraView` 是否闪黑；"零上报"是否真能根除卡顿（机制上成立，未在设备上验）；
- 闪光灯三档在真机上的可分辨度、`auto` 档是否真被相机接受、`A` 角标在 15×13 里能否读出；
- 暗房那条竖线是否真的消失（本机没有那条竖线的实拍，做不了 A/B）；弹簧手感（`speed 14 / bounciness 0`
  是纸面推算，位移约 490pt）；
- 对焦框 48pt 安全区与 2000ms 淡出的观感；探针**只覆盖纯函数，没有渲染过组件**
  （"屏幕上真有 41 根可见"没验）；
- VoiceOver 实读顺序、浅色主题下的对比度。

### 31.10 v1.6.1 产物指纹（已回填）

| 项目 | 值 |
| --- | --- |
| 本地提交 | `0c88268c9e1daa3f455b2cc727bc48d9eef87fef`（24 files changed, 2338 insertions(+), 1969 deletions(-)，树 `c37e07ea7d69f5c1a4701113c84ceb51442883db`） |
| 远端提交 | `28ddb003e8060b0f4eddd25ab78e6b10248df8b2`（树与本地逐字节相同；父是远端 docs 提交 `43b4d530c28ba87d3ec64efaffe9ba64d6c76b2e`） |
| CI | run `38925319275` / job `117055245208` `build-ipa` = **success**（13 步全绿，`macos-26-intel`） |
| artifact | `12056588356` `FretroCam-unsigned-ipa`，10,527,599 B |
| Release | `v1.6.1`，release id `415140877` |
| asset | asset id `647843907` `FretroCam-v1.6.1-unsigned.ipa`，10,641,027 B（回读 digest 一致） |
| sha256 | `93ea7dc20a5f2aaa2c3e74da885b8ef3f4da4b063b0fefeca30ddacc8a578ebd` |
| 下载地址 | `https://github.com/lizimo20041023-oss/retro-film-cam/releases/download/v1.6.1/FretroCam-v1.6.1-unsigned.ipa` |

产物结构自证（`_verify_ipa_v161.py 12056588356` → `RESULT: OK`）：`Payload/FretroCam.app/main.jsbundle`
1,951,603 B；**应存在的 55 个符号 / 字面量全部 ×1**（`ParameterScrubBarInner`、`RulerStrip`、
`rulerMarkCount`、`buildFocalOptions`、`magnetToZero` 与 `offsetAtValue` / `valueAtOffset` /
`formatScrubTemperature` / `formatScrubExposure` 等纯函数、`safeAreaRect`、`reticleOrigin`、
`FilmDrawer`、`FilmCard`、`withAlpha`、`computeStripLayout`、
`resolvePlaceFromGeocode`、`api.bigdatacloud.net/…`、`camera.flash.state.{off,on,auto}`、
`camera.bar.{temp,focal,ev}.a11y`、5 个画幅代号）；**应缺席的 26 个符号全部 ×0**
（`computeSlotRects` / `slotBounds` / `secondUri` / `leatherTile` / `leather-tile` /
`camera.flash.on` / `camera.flash.off` / `half-frame` / `sheet8x10` + 历次守着的黑名单）；
`assets/assets/frames/` 只剩 **9 张** PNG（5 款相框，`half-frame` 与 `sheet8x10` 已随之出包）；
`Info.plist` 2469 B，版本 `1.6.1`、bundle id `com.canyerylee.fretrocam`，旧版本号 `1.6.0` 已不在。

---

## 32. v1.7.0：画幅强锁 + 相框三变体 + 实时预览 + 水印像素锁定

> **已发布**：[FretroCam-v1.7.0-unsigned.ipa](https://github.com/lizimo20041023-oss/retro-film-cam/releases/download/v1.7.0/FretroCam-v1.7.0-unsigned.ipa)
> （未签名 IPA，需自签/sideload；sha256 与整条证据链见 §32.9）

四大模块。原则和上一版一样：**症状一律采信，随症状附上的"病因推断"逐条用真代码核实** ——
这一轮三条推断是错的，逐条记在下面（§32.1 的"视差"、§32.2 的"48MP 能接"、
§32.5 的"字号随画布缩放"的真机制），三条都被改成了实测结论而不是照着改。

### 32.1 模块一 · 画幅强锁（"取景器里看见多大，洗出来就是多大"）

整条锁只靠**一个等式**：取景器中央镂空窗的比例 = 静态原图进合成器前的居中裁切比例。

- 取景器的洞是 `frameOffset + previewLayout.window`（`CameraScreen.tsx`），
  成片的裁切比例是 `resolveCropAspect(frame, layout) = layout.window.width / layout.window.height`
  （`src/utils/processFilmPhoto.ts:219`），`layout` 同样来自
  `computeFrameLayout(frame, stage.w, stage.h)`（`src/utils/geometry.ts:218`）。
  **两边不是"对得齐"，是同一个数**。用户报的"成片比取景框大"因此从结构上消失。
- 裁切本身是 `centerCropPhoto()`（`src/utils/processFilmPhoto.ts:268`）：按窗口比例算最大内接矩形，
  `originX = Math.floor((width - cropWidth) / 2)`、`originY` 同理 —— **严格居中，零偏移**，
  绝不放传感器边缘那些没进过取景器的像素。
- 平台侧还有一层：iOS 拍完就已经把原图裁成 `CameraView` 的宽高比
  （`node_modules/expo-camera/ios/**/CameraPhotoCapture.swift:187-190`，纯裁剪零缩放），
  所以"捕获全传感器、成片比预览大"这件事**本来就不会发生** —— 上一轮那个推断是错的，
  真正缺的是"从 CameraView 比例再收到镂空窗比例"这一步居中裁切。
- 实测（`_probe_lead_integration.mjs` A 节）：5 款相框 × 3 种设备 = 15 组，
  「取景器窗比例 vs 成片裁切比例」相对差**最差 0.429%**（`neg-135` / iPhone 16 Pro Max 440pt）。
  这点残差的来源是 `computeFrameLayout` 把窗口矩形 `Math.round` 成整数（±0.5pt），
  **不是算法差异** —— 相框的 `window` / `aspect` / `source` / `code` 数值这一版一个都没动
  （动了会同时破坏画幅锁与相框对位）。

### 32.2 模块一 · 高画质捕获 + `[标准/高清/极致]` 档位的真相

- 快门走 expo-camera 的**高画质静态拍摄**通道（`CameraScreen.tsx` 快门处）：
  `takePictureAsync({ quality: 1, skipProcessing: false, exif: false })`。
  **全仓没有任何"截取实时预览流"的路径**。`skipProcessing: false` 是显式写出来的
  （它本来就是默认值，`expo-camera` 的 `Options.kt:15`）：置 `true` 会跳过后处理，
  官方文档原话是 "Enabling skipProcessing would cause orientation uncertainty" ——
  方向不定 + 压缩质量丢失，正是"模糊/马赛克 + 方向乱"的来源。该开关在 expo-camera 57 里
  **只有 Android 读**（`ResolveTakenPicture.kt:81`），iOS 无论传什么都走后处理，写上对两端都安全。
- 真正的画质瓶颈从来不在那次调用上，而在**成片像素口径**：成片是把合成舞台 `captureRef` 出来的一张图，
  v1.6.1 把 `captureLongEdge` 钉死在 2048。现在三档 **2048 / 3024 / 4032**，
  在 402×489pt 的舞台上实测成片 **1683×2049（≈3.45MP）/ 2487×3024（≈7.5MP）/ 3315×4032（≈13.4MP）**，
  `max` 档是 `standard` 档的**约 3.9 倍像素数**。
- ⚠️ **这一档不是 48MP，也不可能是 48MP。** 证据（不是猜）：把
  `node_modules/expo-camera/ios/**/*.swift` 全文 grep `activeFormat` / `setActiveFormat` /
  `device.formats` / `supportedMaxPhotoDimensions` —— **零命中**；整个 iOS 侧唯一的尺寸声明是
  `CameraPhotoCapture.swift` 的 `photoSettings.maxPhotoDimensions = photoOutput.maxPhotoDimensions`
  （系统给多少要多少）；`getAvailablePictureSizesAsync()` 在 iOS 上是 `CameraViewModule.swift:268-270`
  的 9 个硬编码枚举值。**真 48MP 必须写原生相机模块**，不在本版范围内。
  所以 UI 上写的是 `[标准]/[高清]/[极致]`（顶栏胶囊循环 + 设置页 ⑥ 画质分区），
  并配一句如实说明 `settings.quality.capNote`：
  「最长边 `{longEdge}`px。真正的 48MP 需要原生相机模块 —— 这一档只决定成片尺寸。」
  **把 4032 说成 48MP 就是撒谎，这一版不做这件事。**
- 档位真的生效，四条缝全接上了：`settings.captureQuality` → `effectivePreset.captureLongEdge`
  （`CameraScreen.tsx`，拍摄与相册导入两条路共用同一个 `effectivePreset`）→
  `processFilmPhoto.ts:430` 的 `planCapture({ targetLongEdge })` → 合成层；
  另一条是 App 内相册副本 `addShot({ maxLongEdge })` → `galleryStore.ts` 的 `planResize`。
- `planCapture` 新增 `targetLongEdge` / `clampedToSource`（`src/utils/captureOptions.ts:65` / `:73`）：
  **绝不凭空上采样** —— 目标长边超过源图长边时夹到源长边并在返回值里说明。
  不传 `sourceLongEdge` 时与 v1.6.0 **逐字同行为**。

### 32.3 模块二 · 相框 A/B/C 三风格变体（`FrameSkin`）

- **零新素材**：全仓没有 canvas，变体是用 React Native 的 `<View>` 叠加层画出来的。
  `expo export` 产物仍是 17 个 assets（9 张相框 PNG + 颗粒/灰尘/漏光/暗角 + 4 张 UI），**一张没多**。
- 新建 `src/constants/frameVariants.ts`（纯查表，零 `require`，避免把 PNG 拖进这条依赖链）与
  `src/components/FrameSkin.tsx`（749 行）。
- **A 经典（`classic`）**：`buildSkinElements('classic', …)` 恒返回 `[]`，组件 `return null`
  ⇒ 老用户外观**逐像素不变**（这也是默认档）。
- **B 泛黄复古（`aged`）**：整幅 `#F4EEDC` 以 `multiply` 盖 0.6 不透明度；四边由外向内 6 级暗房晕染
  （α 0.2 → 0.034，越靠边越深）；20 颗确定性岁月斑点（直径 0.30%~1.28% 相纸宽，
  `rgba(120,90,40,0.05~0.14)`）。`fp100c` 因左右留白只有 3.3%/9.2%，最内侧一级放不进被过滤 ⇒ 19 条。
- **C Dazz 手绘涂鸦（`doodle`）**：16 颗不规则撞色圆点（粉 `#FF5FA2` / 黄 `#FFD34D` / 蓝 `#3FB6F0` /
  薄荷 `#7BE3C0`，直径 1.51%~4.99% 相纸宽）+ 4 个空心圈 + **恒定 3 条**圆角笔触
  （长 65.5~127.9pt、厚 6.9~28.4pt、倾角 ≤14°）。
- **确定性**：`mulberry32(hashSeed(变体名 · seed))`，`useMemo` 只算一次，全文件 `Math.random` 零命中
  ⇒ 同一款相框每次进来图案一样。**预览与成片必须一致才可能"所见即所得"**，随机纹样做不到这一点。
- **绝不画进照片窗口**：生成时双重过滤（中心 + 外接盒，按相纸短边 0.6% 内缩），
  探针在 5 款相框 × 2 档尺寸下断言**窗口内 0 命中**。
- 两个**绝对 pt 阈值改成了比例**（`MIN_VISIBLE_RATIO = 0.004`、`SKIN_WINDOW_PADDING_RATIO = 0.006`）：
  绝对阈值会让 96pt 的预览与 390pt 的成片**元素集合不同**。改成比例的过程里探针抓出一个真 bug：
  空心圈的 `borderWidth < 0.4`（写死 0.4pt）在 96×72 预览里把 4 个圈**全过滤掉**了，成片里 4 个都在。
- **一处做不到，如实记**：`fp100c / aged` 在 96×72 预览是 17 条晕染、成片 18 条（差最贴边那一级）。
  根因不在皮肤：`computeFrameLayout` 把归一化窗口乘尺寸后取整（±0.5pt），在 55pt 宽的相纸上
  相对误差 0.9%，而皮肤必须严格避让**已取整**的那个窗口（否则边上露半像素照片）。
  冻结的接口只给取整后的 `window: Rect`，这 0.5pt 无法两全。所以该处断言是
  「非晕染元素逐元素全等 + 晕染条数差 ≤ 1」；理想等比（同一归一化窗口按比例放大）下的
  **逐元素全等 < 1e-9** 仍由探针严格保证。
- **抽屉里的一行**（`src/components/FilmDrawer.tsx`）：相框名 + 左右滑动切档（阈值 34pt）
  + 三颗药丸点按（永远可用的第二条路）+ VoiceOver 的 `adjustable` 上/下滑动动作；
  右侧一块 **96×72（窄屏 76×57）迷你成片预览**，几何走**同一个** `computeFrameLayout`、
  皮肤走**同一个** `FrameSkin`。
  **为什么预览不放在取景器里**：抽屉一开 `covered` 为真（`CameraScreen.tsx:589`），
  整个取景器被 `previewCovered`（`opacity: 0`）隐掉 —— 而且抽屉占屏高 0.58，相纸中心恰好被盖住，
  放宽那个 `opacity` 也没用。所以"实时更新预览效果"落在抽屉自己身上。
- 种子只许有一个产地：`frameSkinSeedOf(frame)`（`src/constants/frames.ts:265`，返回 `frame.id`），
  三个调用点（成片 / 取景器预览 / 抽屉预览）全走它。
- 删掉 `src/components/FrameOverlay.tsx`（43 行死代码，全仓零 import）——留着就是第二份实现。

### 32.4 模块三 · 取景器「相框实时预览」开关

- 工具行第 **6** 枚按钮 `[🖼️ 预览 开/关]`（`src/components/ToolRow.tsx`）。
  **六枚是这一行的上限**：6×44 + 12 = 276pt，375pt 机型剩 99pt；第七枚会挤进 320pt 老 SE 且缝里只剩 4pt。
- 新建 `src/components/FramePreviewLayer.tsx`：**不重算任何几何**，直接吃 `CameraScreen` 里
  已经存在的 `previewLayout` 与 `frameOffset`，于是"预览层画的窗口"与"玻璃遮罩挖的窗口"
  逐点重合 —— 这不是对齐得好，这是同一个数。
- **不画照片**：相框 PNG 的画面区是全透明的，合成时透出底图，取景时透出的就是实时画面。
  多铺一层截图反而会把实时预览挡住。
- 半透明 `FRAME_PREVIEW_OPACITY = 0.82`：纸面盖住取景器边缘的同时，窗外实时画面仍看得见在动。
- 时钟与地名每 `FRAME_PREVIEW_REFRESH_MS = 30_000` 刷一次（地名走 `locationStamp.resolveForShot()`）；
  `resolveForShot` **必须**从 `useLocationStamp()` 里解构出来再用 —— 那个 hook 每次渲染返回新对象字面量，
  直接当依赖会"重建 → tick → setState → 重渲染"死循环。
- 开关是**本地 state 不是设置项**：它回答的是"这一张我想怎么看"，不是"App 该怎么工作"；
  而且开着时取景器边缘一直是半透明的，不该是"用户忘了关就一直背着"的状态。
- 抽屉 / 设置 / 相册、以及冲印期间，预览层一律隐藏。

### 32.5 模块四 · 水印字体绝对像素锁定

- 字号算法收归一处：新建 `src/utils/watermarkTypography.ts`，**零 import**（连 `react-native` 都不许进）
  —— 否则早晚会出现"看着屏幕调字号"的第二套算法。
- 旧机制为什么"时大时小"：`min(窗口宽 × fontSizeRatio, 短边 × 0.032) × 墨色系数`，
  再被 `MIN_DATE_FONT = 11` 从下面顶住。**两处都在破坏比例**：`min()` 让两款基准
  在不同相框之间跳变；11pt 下限让小画布上的字**相对变大**（320pt 上五款相框的字号
  实测全是 11 —— 那不是比例，那是下限）。
- 新机制：`dateFontOf(canvasWidth, ratio) = round2(clamp(canvasWidth × ratio, 5, canvasWidth × 0.12))`，
  地名字号 `×0.72`、代号 `×0.9`，间距 `dateLetterSpacing = 2pt` 绝对值。
  **不变量：字号 ÷ 相纸宽度 = 常数**（用户要的"绝对像素基准"）。
  旧常量（`MIN_DATE_FONT` / `MAX_DATE_FONT` / `DATE_FONT_SHORT_EDGE_RATIO` / 旧 `dateFontOf`）
  已删净，`geometry.ts` 里的旧调用点改成从新模块转发导出，调用方导入路径与签名一字未变。
- 渲染期**唯一会偷偷缩放**的地方也拆了：`DateStamp.tsx` 去掉
  `adjustsFontSizeToFit` + `minimumFontScale={0.9}`，改 `ellipsizeMode="clip"`。
  静默缩放会让"算出来的字号 ≠ 画出来的字号"，绝对锁定当场失效且**没人能发现**；
  现在真溢出会变成**可见的裁切**。宽度由 `dateStampWidth`（含每字形 +0.5pt 正向余量）结构性保证。
- 实测：四档画布宽 289/358/400/440 上「字号 ÷ 画布宽」相对离散 **0.035%**；
  同一相框 4 种视口、成片 2048 长边下日期像素高 44.24 / 44.21 / 44.18 / 44.22 px
  （极差 **0.06px = 0.14%**）。这点残差来自 `fitBox` 的整数取整与 `round2`，
  已量化到"肉眼与像素级都不可见"，不再动它。
- 390pt / 430pt 的 amber 档与旧值**四舍五入后相同**（11.46 → 11），默认观感不变；
  iPad 锚点 25 → 25.09。
- **两处可见变化，装之前请知情**：① 320pt 档 5 款相框的日期都变小了
  （amber 7.33~9.22 / graphite 6.01~7.56，旧值恒为 11 的下限）；
  ② 390/430pt 的 graphite 档变小（默认相框 `polaroid-600` 上 11 → 9.39）。
  这是"去掉尺寸相关下限"的必然结果 —— 旧值**就是**那个下限，不是比例。
  若真机上觉得小屏偏小，唯一的杠杆是 `geometry.ts` 的 `TONE_STYLE.graphite.fontScale`（0.82），
  但改它会让 iPad 涨 18%，所以这一版保持不动。

### 32.6 集成接缝（四处模块之间最容易漏的地方，由 Lead 收口）

1. **画质档并进 `effectivePreset`**：`preset` 是整条成片链路唯一的像素口径入口，
   用户档位**无条件**覆盖预设自带值（全仓没有任何 `PRESETS` 卷显式声明过 `captureLongEdge`）。
2. **`frameVariant` 漏传了两个调用点**：`<FilmCompositor>` 在 `CameraScreen.tsx` 与
   `GalleryScreen.tsx` 各有一个，都不传就退回默认 `'classic'` ⇒
   取景器预览是泛黄相纸、洗出来却是白卡纸，**直接违背"所见即所得"**。两处都补上了。
3. **`<FilmDrawer frameId>` 一直是 `undefined`** ⇒ 抽屉里"现在套的是哪款相框"永远显示默认款。已补。
4. **相册副本不认画质档**：`addShot` 原来硬写 2048，用户选了极致档回 App 相册还是小图。
   新增 `AddShotInput.maxLongEdge`（`planResize` 只缩不放，所以小档位不会把大图放大）。

### 32.7 验证清单

| 探针 | 断言 | 覆盖 |
| --- | --- | --- |
| `_probe_capture_quality.mjs` | **78 / 0** | 三档表、`planCapture` 夹取、预设通道、端到端像素、`capNote` 本地化与兜底两条路 |
| `_probe_typo_invariant.cjs` | **464 / 0** | 不变量、MIN/MAX 从未触发、旧接口逐位同源、split 分栏 80 例、结构断言 |
| `_probe_frameskin.cjs` | **347 / 0** | 确定性、绝不画进窗口、预览与成片元素集合、空心圈 bug 回归 |
| `_probe_lead_integration.mjs` | **85 / 0** | 画幅锁、预览层对齐、皮肤、水印不变量、档位接线（源码级）、三档成片长边 |

合计 **974 条断言 / 0 失败** —— 四支探针都在**冻结提交 `74ebd99`（远端 `78f6bd3`）的树上复跑过**
（`_probe_capture_quality.mjs` 从 77 涨到 78：`captureQualityCapNote` 的契约在 v1.7.0 收尾时从
"本地化前缀 + 英文事实尾巴"改成"优先整句本地化的 `settings.quality.capNote`"，探针原来那条期望
编码的是旧契约 —— 复跑时它当场失败，于是补了一条"键缺失时退回英文事实尾巴"的断言，两条路都钉住）。
另加冻结版本后跑的最终门槛：`npx tsc --noEmit -p tsconfig.json` → **EXIT 0 零诊断**；
`npx expo export --platform ios --no-bytecode` → **EXIT 0**，bundle `index-fec6a7d4d51ab5447a94b88b2b3a8226.js` = **1,283,975 B**，
产物 19 个文件 / 2,981,584 B，其中素材仍是 **17 个**（9 张相框 PNG + 4 张纹理 + 4 张 UI）——
**`FrameSkin` 一个素材都没新增**，变体全是 `<View>` 画出来的。
所有探针都在**工作区根**，不在仓库里（产物目录也在仓库外 `_export_v170_final`）。

### 32.8 没能验证的 / 拿不准的

- **没有真机、也没有模拟器**：上面每一条视觉结论都是纯函数探针 + 算术，**一张截图都没有**。
  `aged` / `doodle` 的实际观感、96×72 迷你预览里皮肤是否还看得出纹样、取景器叠加层 0.82
  是否真的"既能看清相框又不挡构图"—— 全部未验证。
- 画幅锁最差 0.429% 的取整残差、水印 0.14% 的像素残差：都已量化，都没有归零。
- 抽屉里**横向滑动**能否在纵向 ScrollView 里稳定接管手势，未在真机上验证；
  药丸点按是刻意留的第二条路。
- `fp100c / aged` 的 17 vs 18 条晕染差异（原因见 §32.3）。
- 320pt 档与 graphite 档的字号变化是否是你想要的最终观感（见 §32.5 末）。

### 32.9 v1.7.0 产物指纹

| 项目 | 值 |
| --- | --- |
| 本地提交 | `74ebd9976839f7c6791b55313468e3e9faea8b5c`（30 文件 +4324/−1523） |
| 远端提交 | `78f6bd3d72a652bbd924396a142294b4dcf171ae`（树与本地逐条相同；父提交是 `7cf27bf` 而本地父提交是 `65f892b`，所以两者 SHA 不同名） |
| CI | run `38936043880` — 全绿：prebuild / CocoaPods / Release 编译 / 打 ipa / 上传产物（10 步全 success） |
| artifact | `12061566898`（`FretroCam-unsigned-ipa`，10,545,628 B） |
| Release | `415201107` — https://github.com/lizimo20041023-oss/retro-film-cam/releases/tag/v1.7.0 |
| asset | `648035272`（`FretroCam-v1.7.0-unsigned.ipa`，10,659,162 B） |
| sha256 | `e9bce8afa3330e58f2b2ab68187673e63332b3bff21d66ccc63703d88525ccba`（上传后回读 digest 逐字相同） |
| 下载地址 | https://github.com/lizimo20041023-oss/retro-film-cam/releases/download/v1.7.0/FretroCam-v1.7.0-unsigned.ipa |

`_verify_ipa_v170.py <artifact_id>` 对**真实 IPA**（不是本地导出）逐条核过：`Payload/FretroCam.app/main.jsbundle`
= 1,987,127 B（Release 走 Hermes 字节码，比本地 `--no-bytecode` 的 1,283,975 B 大是正常的）、
`Info.plist` 里 `1.7.0` 与 `com.canyerylee.fretrocam` 都在且没有残留 `1.6.1`、
`assets/frames/` 恰好 **9 张** PNG、撤掉的纹理（`leather` / `half-frame` / `sheet8x10`）一张都没进包、
`FrameOverlay` 与四条被废掉的旧字号常量 / 旧函数名一个都搜不到，而 `FrameSkin` / `FramePreviewLayer` /
`dateFontOf` / `planCapture` / `settings.quality.capNote` / `frame.variant.*` / `camera.tool.preview*`
全部在包内 ⇒ `RESULT: OK`。

> 核验器本身修过一次：Hermes 把**含非 ASCII 的字符串按 UTF-16 存**，所以设置在
> `settings.quality.capNote` 里那句「…真正的 48MP 需要原生相机模块…」在包内是
> `4\x008\x00M\x00P\x00`，第一版核验器数 ASCII 的 `48MP` 数到 0 就假报了 `missing:48MP`
> （61 条断言里唯一一条 FAIL，字面量其实一直在）。现在两种编码都数 ⇒ `48MP` 命中 6 次。

---

## 33. v1.8.0：去白雾的色彩引擎 + 暗房纸材 + 参数胶囊 + 日期引擎 + 像素级锁定

这一版的主线是你报的那句"成片被极厚的半透明乳白辉光糊住"。查下来不是"某个参数调大了"，而是**三处结构性加白**：一张 99.9% 像素都在加亮的漏光贴图、一层纯白 `screen` 曝光层、一条把画面拉向中灰的 `contrast<1` 反差层。它们被删掉/重写，胶片感改由**抬起的暗部灰 + 团簇颗粒 + 微尘**承担。同一版里还交付了另外四个模块：三种暗房纸材、参数胶囊自动隐藏、日期引擎、以及水印字号的像素级锁定与画幅强锁复核。

下面每一条结论都附**可复跑的命令**；`_haze_audit.mjs` / `_purity_audit.mjs` / `_probe_*.cjs` 都在工作区根、零依赖、`EXIT 0` 才算绿。

---

### 33.1 白雾的根因与"四刀"

改动前 `node _haze_audit.mjs` 是 **10 / 10 预设全部超预算**（`EXIT=1`）。三个结构性来源，都有量化证据：

| 来源 | 证据（改动前） | 它为什么是"整幅加白" |
| --- | --- | --- |
| `assets/textures/light-leak.png` | 768×768 RGBA，`mean=[0.9950, 0.5608, 0.1847]`、`meanLum 0.6260`、`meanAlpha 0.2829`、**`fracScreenNeutral 0.08%`** | 99.9% 的像素都在给画面增亮，却用 `screen` 混合并拉伸到整幅；10 卷里 3 卷开着它（`gold-200` 0.22 / `cinestill-800t` 0.18 / `expired-64` 0.34） |
| `exposure-up` 层 | 纯白 `#FFFFFF` + `screen`；10 / 10 预设 `whiteLoss` 超 0.02 预算，最差 `ccd-cyber` **0.0805** | `screen(1, cs) = 1`：它在数学上**必然**把成片白点推到 1.0，是构造性加白 |
| `contrast < 1` 走"中灰 + `normal`" | 关掉混合的对照列里 `tri-x-400` 平坦 **0.4590**、`digicam-2002` `y(0)=0.2854` / `y(1.0)=0.3837` | `normal` 混合把每个像素拉向中灰 ⇒ 得到的是"死灰"，不是"抬黑" |

另外两处助燃：`bloom` 用的 `color-dodge` 会把阴影也一起提亮；`vignette` 用 `multiply` 会把纯白压到 0.91~0.97，制造"白点不是白"。

**四刀（全部落在色彩引擎与贴图里，预算一个数字没改、预设一个没删）：**

1. **删 `exposure-up`** —— 色彩引擎里不再有任何"整幅加白"的层；曝光由 `fade` / `contrast` 承担。
2. **删 `contrast < 1` 的中灰 `normal`** —— 对比度只许 ≥ 1，软化交给 `fade` 的托黑。
3. **暗角 `multiply → overlay`** —— `overlay(1, cs) = 1`，对纯白**零影响**，白点不再被压。
4. **重烤 `light-leak.png`（512×512）** —— `mean=[0.1322, 0.0726, 0.0291]`、`meanLum **0.0821**`（旧 0.6260）、`meanAlpha **0.0755**`（旧 0.2829）、`maxAlpha 0.6196`、**`fracScreenNeutral 80.0%`**（旧 0.08%）、`fracLumGE50 **10.3%**`（旧 99.02%）；图层 `opacity` 再夹 ≤ 0.10 ⇒ 只剩角落一条光斑。
5. **`bloom` 的 `color-dodge` → 两层 halation** —— `kind:'photo'` 自叠模糊高光 + `blurRadius 8`（真泛光）+ 暖红 `#FF4B2D` `screen` ×0.05；阴影区贡献为 0。

**结果（`node _haze_audit.mjs`，10 卷 × 双模式）：**

| 指标 | 改动前 | 改动后 |
| --- | --- | --- |
| 超预算预设 | **10 / 10**（`EXIT=1`） | **0 / 10**（`EXIT=0`，`RESULT: OK`） |
| `whiteLoss` | 最差 `expired-64` **0.0866**，`ccd-cyber` 0.0805 | 8 卷恰为 **0.0000**；`superia-x` 0.0062 / `velvia` 0.0124 / `ccd-cyber` 0.0182 |
| `blackLift` | `expired-64` **0.1613** | 0.0017 ~ 0.0275 |
| `satRatio` | `expired-64` **0.5095** | 0.9517 ~ 1.1288 |
| `veilHigh` | 多卷超 0.02 | 最大 `cinestill-800t` +0.0170 |
| `veilMid` | `gold-200` +0.0406 | **只有 `cinestill-800t` 为正** +0.0096（halation 的 `screen` 层） |
| 白点 `y(1.0)` | 被压到 0.91~0.97 区间 | **1.0000** |

预算原封不动：`{whiteLoss 0.02, veilHigh 0.02, veilMid 0.02, blackLift 0.07, satFloor 0.95, normalMid 0.06}`。

**一个诚实的代价**：`blackLift ≤ 0.07` 等价于"输入 0.02 处最多抬到 0.09"，而设计稿里的暗部色 `#12181C` 需要 0.0702、`#181E24` 需要 0.0943。我选择**保预算**（你这一轮投诉的就是加白），所以暗部是"微灰"而不是设计稿那个更深的青灰。连带的观感变化：`expired-64` 的"过期褪色"味比上一版淡（它的 `satRatio` 从 0.5095 到 0.9517 这个变化本身，就是那张乳白膜消失的证据）。

---

### 33.2 色彩引擎的数学：亮度恰为 0.5 的浓色 + `overlay`

你要的是"保持原图真实对比度与饱和度"。以前的色温/色调/分离色调层是"深色 + `screen`"或"中灰 + `normal`"，两者都会改亮度。现在四条彩色层统一成：

```
WARM         #FF641A   Y = 0.5004
COOL         #1393FF   Y = 0.5003
TINT_GREEN   #1AA81A   Y = 0.5002
TINT_MAGENTA #E657E6   Y = 0.5009      |Y − 0.5| ≤ 0.002
```

`overlay` 对源色是**线性**的，偏差正比于 `(Y − 0.5)` ⇒ **`Y = 0.5` 时亮度映射精确恒等**：白点仍是白点、黑场仍是黑场，只有色相/饱和度被动。这就是"只改色不改亮"的数学保证，也是 8 支预设 `whiteLoss = 0.0000` 的原因。

`satRatio` 的机制值得单独记一笔（我一开始猜错了）：门禁里 `BLEND.saturation` 是恒等映射，所以 `satRatio` 与 `color.saturation` 参数**数学上无关**，它就是暗/亮对比度之比 `((y(0.9)+0.05) / (y(0.1)+0.05)) / 12`；唯一能压低它的是"托黑在 0.1 处抬亮度"。⇒ 这是**管道层问题**，不是"某卷本该低饱和"。修法是给 fade 重的卷补 `contrast-boost`（photo soft-light）并收紧 fade（`cinestill-800t` 0.14→0.13、`digicam-2002` 0.34→0.27、`expired-64` 0.42→0.29），另 3 支从低对比改回 1.15~1.20 —— **门槛与断言一个字没改**。

---

### 33.3 团簇颗粒

- 新 `assets/textures/grain.png`：512×512 8 位灰度（三通道恒等），`mean 127.480`（0.4999）、**σ 66.424（归一化 0.2605，旧 0.2314 ⇒ +12.6%）**、`p05 11` / `p95 244`。
- 新脚本 `retro-film-cam/scripts/generate_grain_clump.py`（numpy + Pillow，`SEED = 20261017`）：FFT **周期**滤波 + 周期双线性重采样 ⇒ 结构上严格可平铺。实测水平内部梯度 24.839 vs 跨接缝 25.150（**+1.3%**）、垂直 24.777 vs 22.158（−10.6%，差异来自接缝处采样噪声，不是断裂）。
- **影调加权**（不再是一层均匀噪点）：`effAmp(cb) = grain × 2·min(cb, 1−cb) × 0.2605` ⇒ 中调最强、高光暗部最弱。默认档实测 **0.1094 ~ 0.1614**，全落设计窗 `[0.10, 0.22]`；`effAmp(0.9) ≤ 0.0323`、`effAmp(0.02) ≤ 0.0065`。
- 配方：`PRESET_DEFAULTS.grain` 0.088 → **0.52**，10 卷 0.42~0.62。档位表 `GRAIN_LEVELS`（`off 0 / light 0.45 / std 1 / heavy 1.5 / max 2.2`）**一个字没改**：默认档落窗、heavy 档 0.16~0.21 仍在窗内、max 档 ×2.2 会到 0.24~0.35（这是你主动选"最强颗粒"时的本意，超窗属设计）。
- 已知取舍：`2·min(cb, 1−cb)` 让暗部的颗粒只有中调的大约 5%。要让暗部"同样明显"只能换成 screen 型贴图，那会抬黑场 —— 与这一版的白雾诉求直接冲突，所以**不做**。

### 33.4 微尘

成片新增 2~4 颗微尘：`count = clamp(2 + round(dust × 2), 2, 4)`，半径 `0.004~0.010 × 短边`，位置在 `0.08~0.92` 之间按种子均匀分布，每颗由 3 层同心白圆组成（halo 3.1r / ring 1.9r / core r）。**只在成片（composite）面渲染**，实时预览里没有 —— 免得取景器里出现"贴纸"。

---

### 33.5 三种暗房纸材

`src/constants/frameVariants.ts` 是配方的唯一产地（画幅只管开窗比例，材质只管纸面）：

| 材质 | 纸面 | 渐变 | 结构纹理 | 元素数 |
| --- | --- | --- | --- | --- |
| `archival` | 纯白卡纸 `#F7F6F1`（平色） | 无（Δ=0） | `embossRatio 0.0028` 压凹 | **12** |
| `baryta` | 岁月暖黄 `#E9DCBF` | `#F2E9D5 → #DFCEAE`，12 级 | 6 级褐晕染（bloom） | **80** |
| `obsidian` | 暗房雅黑 `#1A1A1D` | `#1E1E22 → #151517`，12 级 | 开窗亮边（cut） | **60** |

元素数只由材质决定，与画幅尺寸/朝向无关（`96×72` 迷你预览与整幅相框的元素数量一致）。

**窗口零侵入（v1.7.0 的做法是错的）**：v1.7.0 的 `buildSkinWash` 会在整幅照片上压一层暖化层 —— 那正是"材质覆盖到画面里"的做法。这一版**删代码**（不是停用）：15 组 / 760 个元素里 758 个严格通过、2 个只差浮点尾巴，**最大侵入面积 2.069e-11 pt²**（容差 1e-6）；再用 12 个代表尺寸做像素级复核，窗口内 **1,358,268 个像素 0 个不同**。

**为什么用"切条 `<View>`"而不是 `expo-linear-gradient`**：统一矩形模型才能断言"没有元素压进窗口"，而且本项目有"只用 View"的硬规则。它需要证据，所以补了色阶测量 —— 同带相邻级 RGB 差 baryta **Δ ≤ 3/255**（常见 (1.2, 1.7, 2.4)）、obsidian **Δ ≤ 1**、archival 0；窗口四角的**跨带接缝** baryta Δ ≤ 2 / obsidian Δ ≤ 1 ⇒ **没有硬色阶**。颜色取**全局 y 中点采样**（`mixHexColor(gradientTop, gradientBottom, 该条中点 y ÷ 相纸高)`），不是带内 `i/(steps−1)` —— 四条边带各自切 12 条，按带内映射会让窗口四角必然出现硬色阶。端点保真：首/末条 vs 配方端点逐通道 **Δ = 0 / 0**（只有 `fp100c`·baryta 的末条 Δ = 1）。

岁月斑点**没有放回来**：几何噪点是"贴上去的图形"而不是材质，baryta 的岁月感由渐变 + 6 级晕染 + 铭文色承担。

抽屉跟着改：材质芯片显示真实材质色，选中态只改描边（不再整块反白），芯片从 34pt 放大到 44pt。

---

### 33.6 参数胶囊自动隐藏

- 3000 ms 无操作后淡出（`translateY 24pt`，退出 220 ms / 进入 160 ms）。
- 按住滑动期间 `lock()` 计数 +1 并**取消**计时表（不是排队等待）；松手 `unlock()` + `wake()`；任何一个参数真值变化也唤醒。
- 轻触对焦通过 `wakeSignal` 自增唤醒：`CameraScreen` 里 `setCapsuleWake(n + 1)` → `ParameterScrubBar` 的 `useEffect([wakeSignalValue, wakeCapsules])` → `wake()`。**这条是静态链路确认，没有真机运行时验证**（见 §33.12）。
- 隐藏时 `pointerEvents='none'` + `accessibilityElementsHidden`，把轻触对焦让给取景器。
- 证据：`node _probe_capsule_autohide.cjs` → **126 条断言 / 0 失败 / EXIT=0**（假计时器 + 记账 sink，含 `ALL_PROBE_ASSERTIONS_PASSED`）。

---

### 33.7 日期引擎

四组配置进 `AppSettings.dateEngine`：**13 种格式 / 5 种字形 / 8 个机位 / 5 档发光**。默认值 `MM_DD_YY · led_7seg · strip_split · classic_amber` 与 v1.7.0 **逐字相同** —— 老用户升级后看到的还是那一行橙色液晶日期。

设置页新增"⑥ 日期引擎"区：四组共 31 行选择器（`SectionHeading` + `OptionRow`，每行带 a11y），i18n 5 语言 × 37 键 0 缺。

机位分两类：`strip_*`（2 个，排在白边文档流里）与 `in_*`（6 个，**画在照片里**，坐标由 `resolveDateSpot()` 按窗口算绝对盒，不参与文档流）。390×844 视口（成片画布 358×435 pt、窗口 321×321、白边高 96、字号 10.94、文本盒 99.59×9.96、`inset 10`）的实测坐标 —— `box` 是**未旋转**文本盒左上角（RN 绕中心旋转），`bounds` 是旋转后外接矩形：

| 机位 | 旋转 | `box` | `bounds` | 区域 |
| --- | ---: | --- | --- | --- |
| `in_bl_v` | 90° | (−16.81, 274.23) | (28.00, 229.41) 9.96×99.59 | photo |
| `in_bl_h` | 0° | (28.00, 319.04) | — | photo |
| `in_br_h` | 0° | (229.41, 319.04) | — | photo |
| `in_br_v` | 90° | (274.23, 274.23) | (319.04, 229.41) 9.96×99.59 | photo |
| `in_tr_v` | 90° | (274.23, 72.82) | (319.04, 28.00) 9.96×99.59 | photo |
| `in_cb_h` | 0° | (128.70, 319.04) | — | photo |
| `strip_split` | 0° | (248.41, 382.02) | — | strip |
| `strip_center` | 0° | (129.20, 382.02) | — | strip |

规则：竖排三档 = 绕盒中心 90°；**装不下只换落区（photo ↔ strip），绝不动字号**；`degraded` 标记这次 1200 例里 0 次触发。画内机位下白边**只印地名**（不再印第二份日期）。

---

### 33.8 水印字号的像素级锁定（两条口径变更）

唯一换算入口是 `src/constants/canvasBase.ts`：`BASE_CANVAS_W = 1440`、`absoluteFontPx(designPx, canvasWidth) = round2(designPx × canvasWidth ÷ 1440)`、`designPxOf(pointPx, canvasWidth)`。设计像素表：`DATE_DESIGN_PX`（`led_7seg` 44 / `led_dot_matrix` 42 / `ccd_osd` 46 / `lab_inkjet` 44 / `archival_steel` 46）、`PLACE_DESIGN_PX = 32`、`CODE_DESIGN_PX = 29`；字距 8、缝 48 也走设计像素。

**旧机器全部删净**：`MIN_DATE_FONT_PT` / `MAX_DATE_FONT_CANVAS_RATIO` / `DATE_FONT_WEIGHT_BASELINE` / `WATERMARK_RATIOS` / `dateFontRatioOf` / 两处私有 `clamp`；`dateStampWidth` 的两个可选参数改成**必填**（不传就编不过）。

实测"字号 ÷ 画布宽"恒定：`led_7seg` 0.03055~0.03056 / `led_dot_matrix` 0.02917 / `ccd_osd` 0.03194 / `lab_inkjet` 0.03055 / `archival_steel` 0.03194。参考画布 358 pt：日期 10.94 / 地名 7.96 / 代号 7.21 / 字距 1.99 / 缝 11.93。画幅强锁复核 580 条：5 相框 × 14 取景盒 × 4 视口，长宽比相对差**全 < 1%**。

**两条口径变更（如实记，都是"回到 v1.7.0 的意图"）：**

1. **地名比例从这一版中途的 0.909 回到 0.72**（`PLACE_DESIGN_PX` 40 → 32）。理由：你没有要求把地名放大 26%，"无请求的观感变化"是这一版最该避免的东西。
2. **字形余量统一为常量 0.5 pt**。排版层曾经写 `dateGlyphSlackOf(W) = 2W/1440`（随画布缩放），而渲染层用 `dateEngine.GLYPH_SLACK = 0.5`（绝对点），两者只在参考画布相等；在 956 pt 上差 **62.41%（≈11 pt）** ⇒ 右对齐的日期离白边忽远忽近。裁定：余量是**设备像素取整补偿**、与画布宽无关 ⇒ 常量；字距与缝继续随画布缩放。参考画布上 `dateStampWidth("'26  10  17")` 仍是 **99.5900**（与旧口径同值 —— 旧式 `absoluteFontPx(2, 358) = round2(0.4972) = 0.50` 恰好相等），偏离参考画布才生效：289 pt 80.39 → **81.49**、440 pt 122.25 → **121.04**（±1 pt 量级）。
3. 代号比例回到 0.9：v1.7.0 的 `codeFontOf(placeFont)` 入参是**地名**字号，`codeFont: 0.9` 是"相对地名"的比 ⇒ `CODE_DESIGN_PX` 取 **29**（`29/32 = 0.9063`，358 pt 实测 `7.21/7.96 = 0.9058`）。

### 33.9 取景窗顶端写死的 `35mm`

你上一版看到的"残字/鬼影"是取景窗顶端那段真焦段标签。真焦段可以切 13 / 26 / 35 / 52 mm，而它永远写着 `35mm`。这一版**整段删除**（`ViewfinderWindow.tsx` 291 → 271 行，`CameraScreen.tsx` 去掉常量与 prop），并加 6 条断言钉住"不许回来"。

---

### 33.10 门槛与证据

| 门槛 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `cd retro-film-cam && npx tsc --noEmit -p tsconfig.json` | **EXIT=0**，零诊断 |
| 白雾 | `node _haze_audit.mjs` | **0 / 10 超预算**，`RESULT: OK`，EXIT=0 |
| 纯净度（旧层不许回来） | `node _purity_audit.mjs` | **59 条断言 / 0 失败 / RESULT: PURE** |
| 色彩引擎 | `node _probe_film_look.cjs` | **972 / 0**（门槛 ≥ 250） |
| 画幅+水印+八机位 | `node _probe_geo_lock.cjs` | **15843 / 0**（⓪18 ①580 ②188 ③12765 ④2233 ⑤59） |
| 参数胶囊 | `node _probe_capsule_autohide.cjs` | **126 / 0** |
| 相框材质 | `node _probe_skin_material.cjs` | **755 / 0** |
| 日期引擎 | `node _probe_date_engine.cjs` | **1793 / 0** |
| 画质档位 | `node _probe_capture_quality.mjs` | **78 / 0** |
| v1.8.0 接缝 | `node _probe_v180_seams.mjs` | **1190 / 0** |
| 集成接线（Lead） | `node _probe_lead_integration.mjs` | **110 / 0** |
| 打包 | `npx expo export --platform ios --no-bytecode` | 见 §33.13 |

> 探针全部在工作区根、**不在仓库里**（不污染 `git status`），零新依赖；它们用仓库自带 typescript 的 `transpileModule` + 自写 require 桩加载**真源码**，不复制实现。

### 33.11 改动清单

本次提交 **36 个文件 / +6436 −1907**：其中源码是 **35 个文件**（29 个已跟踪，含 2 张二进制贴图；6 个新文件），文本改动 **+6203 / −1907**（6 个新文件本身占 2566 行），本 README 的 §33 正文与目录行另占 **+233** 行。

| 文件 | +/− | 说明 |
| --- | --- | --- |
| `src/components/FilmCompositor.tsx` | +919 / −749 | 整条调色管线交给 `FilmLookLayers`，`GradeLayerView` 整体删除，就绪计数单一来源 |
| `src/components/FrameSkin.tsx` | +429 / −511 | 按材质重建；删 `buildSkinWash`/`buildAgedElements`/`buildDoodleElements` |
| `src/utils/geometry.ts` | +292 / −64 | `resolveDateSpot` 八机位 / 竖排 / 内缩 / 退化换落区 |
| `src/components/FramePreviewLayer.tsx` | +222 / −85 | 四块幕布 + 材质预览 |
| `src/components/SettingsScreen.tsx` | +196 / −5 | 日期引擎 ⑥ 区（31 行选择器） |
| `src/constants/frameVariants.ts` | +193 / −54 | 三种纸材配方唯一产地 |
| `src/utils/gradeLayers.ts` | +185 / −82 | 色彩引擎重写，新增 `planFilmLooks` / `countStageImages` |
| `src/utils/watermarkTypography.ts` | +180 / −144 | 设计像素换算 + `DATE_GLYPH_SLACK` |
| `src/components/DateStamp.tsx` | +175 / −73 | 新日期引擎渲染 |
| `src/components/ParameterScrubBar.tsx` | +121 / −14 | 接自动隐藏 + 唤醒 |
| `src/types/index.ts` | +119 / −4 | `DateEngineConfig` / 材质 / 胶囊类型 |
| `src/components/CameraScreen.tsx` | +98 / −8 | 档位并进 `effectivePreset`、唤醒信号、残影清理 |
| `src/utils/settingsStore.ts` | +89 / −3 | 新字段迁移 |
| `src/constants/presets.ts` | +60 / −29 | 10 卷配方重调 + 颗粒基准 |
| `src/i18n/locales/{en,fr,ja,zh-Hans,zh-Hant}.ts` | 各 +43 / −3 | 日期引擎 + 画质档位文案 |
| `src/components/FilmDrawer.tsx` | +43 / −12 | 材质芯片 44pt |
| `src/components/ZoomStops.tsx` | +37 / −1 | — |
| `src/hooks/useSettings.tsx` | +17 / −1 | — |
| `src/utils/formatTimestamp.ts` | +15 / −14 | 走新格式器 |
| `src/hooks/useFilmStage.ts` | +12 / −4 | 就绪口径注释 |
| `src/components/ViewfinderWindow.tsx` | +9 / −29 | **删 `35mm` 丝印** |
| `src/constants/textures.ts` | +8 / −5 | 注释订正（贴图新数字） |
| `app.json` | +1 / −1 | 版本号 1.8.0 |
| `assets/textures/grain.png` · `light-leak.png` | 二进制 | 重烤 |

新文件：`src/components/DateGlyphs.tsx` 958 · `src/constants/dateEngine.ts` 572 · `src/hooks/useCapsuleAutoHide.ts` 393 · `src/components/FilmLookLayers.tsx` 299 · `scripts/generate_grain_clump.py` 259 · `src/constants/canvasBase.ts` 85。

（零新依赖、零 `as any`；`FilmCompositor.tsx` 之外没有任何组件直接读贴图或写混合模式。）

---

### 33.12 已知缺口 / 没能验证的事

1. **这一版没有任何真机或模拟器验证**（本机没有 iOS 运行时）。以下都只有"数学 + 源码形状"级别的证据：白雾是否真的从成片里消失、颗粒与微尘的实际观感、`blurRadius` 是否真的产生模糊、`mixBlendMode` 在 ViewShot 截图路径里是否真的生效、90° 旋转在 RN 里的锚点、胶囊淡出的手感、`pointerEvents` 是否真的把轻触对焦让出来。
2. **实时预览里没有"荧光晕"**：`glow` 是 photo 类自叠层，`surface='live'` 永远跳过它（否则取景器里会叠一层更亮的自己）。
3. **取景器预览看不到画内日期**（6 个 `in_*` 机位）：`FramePreviewLayer` 的四块幕布按设计只盖相纸留白、绝不压镂空窗，画内日期没有可画的位置。属结构性缺口，这一版不做。
4. **字符类字形的墨迹高无法验证**：`led_7seg` / `led_dot_matrix` 是像素画（高度恒定），`ccd_osd` / `lab_inkjet` / `archival_steel` 走 `<Text>`，最终墨迹高由系统字体度量决定。"日期像素高 ÷ 成片长边恒定"对前者结构成立，对后者只到"字号 ∝ 画布宽"这一层。
5. **48MP 仍然不可能**（见 §32.2）：iOS 的 `pictureSize` 是 `CameraView` 的 prop、只有 9 个硬编码枚举；本版画质档位只决定**成片尺寸**（standard ≈ 3.45MP / high ≈ 7.5MP / max ≈ 13.4MP，按 402×874 pt 舞台实测）。
6. **颗粒幅度**按"1 贴图像素 = 1 逻辑点、3x 屏"推算；若设备缩放口径不同，σ 约按 0.35 倍衰减（探针会红）。
7. `expired-64` 的过期褪色味比上一版淡（§33.1 末），`tri-x-400` 的图层数是 9 层而其余 9 支是 10~13 层 —— 这是该卷配方本身（4 个 color 层而不是 6 个），**不是缺层**。

### 33.13 产物指纹

| 项 | 值 |
| --- | --- |
| 提交 | 本地 `4cfab40`（`v1.8.0：去白雾的色彩引擎 + 三种暗房纸材 + 参数胶囊自动隐藏 + 日期引擎 + 像素级锁定`，父 `27d4ca6`，36 files / +6436 −1907）；推送走 Git Data API（本机 github.com:443 不通）⇒ 远端 `1c2eca96`（父 `6f76d2ad`），远端 129 个 blob 与本地逐个 sha 相同 |
| CI | run [`38949347146`](https://github.com/lizimo20041023-oss/retro-film-cam/actions/runs/38949347146) **success**（job `build-ipa` 13 步全成功：prebuild → pod install → xcodebuild Release → 打 ipa → 上传 artifact） |
| IPA | workflow artifact `12068516114`（`FretroCam-unsigned-ipa`，10,344,498 B）⇒ 解出 `FretroCam-v1.8.0-unsigned.ipa` **10,458,969 B** |
| 体积 / SHA-256 | **10,458,969 B**（9.97 MiB）· `sha256:78b41325f8120bc0311252bd14111503f2f68c004418b373e920b88b837c3de2`（上传后回读 Release asset digest 逐字节一致） |
| Release | [`v1.8.0`](https://github.com/lizimo20041023-oss/retro-film-cam/releases/tag/v1.8.0)（release id `415279702`，asset id `648273642`，`target_commitish` = 远端 `1c2eca96`；下载地址见 Release 页） |
| bundle `main.jsbundle` | 本地 `expo export --platform ios --no-bytecode` **EXIT=0** ⇒ `_expo/static/js/ios/index-7631b44e6b5afcf4be18cc38f3a1110e.js` **1,331,062 B**；17 个资源（`grain.png` 211111 B / `light-leak.png` 18214 B，与源文件逐字节同尺寸）；`_verify_ipa_v180.py --local` 在该产物上校准后 **RESULT: OK**（`SHOULD_BE_ABSENT` 全 0 命中） |
| 核验 | `python _verify_ipa_v180.py 12068516114` → **RESULT: OK**：IPA 内 114 个条目、`Payload/FretroCam.app/main.jsbundle` **2,032,295 B**、`Info.plist` 版本 `1.8.0` + `com.canyerylee.fretrocam`、相框 PNG 恰好 **9 张**、v1.8.0 贴图 4 张（grain / light-leak / vignette / dust）都在包、撤掉的素材（`leather` / `half-frame` / `sheet8x10`）**全 0 命中**、`SHOULD_BE_ABSENT` 清单**全 x0** |

---

## 34. v1.8.1：日期背景 100% 透明 + 颗粒不透明度硬上限 + `00 NO FRAME` 无相框模式

这一版是**三条真机投诉**的抢修，不是新功能版：① 日期背后那块"诡异的橙色大方块"；
② 调颗粒强度/大小时整幅画面被一层**不透明灰色大网**盖住；③ 新增 `00 NO FRAME` 无相框纯净全屏模式。
三条都按用户给的**强制规范**做（"背景必须 100% 透明，绝对禁止任何实色或半透明矩形背景框"、
"不透明度严格锁死在 0.12~0.22，绝不随参数变成实心遮罩"、"彻底隐藏所有实体相纸外框"）。

### 34.1 日期背后那块橙色大方块：根因与"副本光"

**现象**（真机实测）：相纸下巴上的 `10 17 '26` 背后有一块亮橙色长方形底块。

**根因**（两个矩形叠出来的，跟颜色浓淡无关）：

1. `DateStamp.tsx` 在字形之外还渲染一层独立的晕染层 `DateHaze`，它的实现是"按**文字盒**的宽高铺两层圆角矩形"——
   文字盒是矩形，光晕于是也是矩形；
2. `DateGlyphs.tsx` 里 LED 段/点阵点在**未点亮**时仍各画一个矩形（`ghost` 色，`GHOST_OPACITY = 0.18`），
   一行 8~11 个字形的熄灭段加起来就是一块几乎连续的浅色底。

**修法**（三处；全部否决"把颜色调淡一点遮过去"这类做法）：

1. `GHOST_OPACITY` **0.18 → 0**：熄灭段**一个像素都不渲染**（`_probe_date_engine.cjs` 逐字形断言 `ghost` 是
   `rgba(r,g,b,0)`）；
2. **删掉整个 `DateHaze`**（`DateGlyphs.tsx` 的"八、发光层"段 + `DateStamp.tsx:45` 的 import 与
   `hazeW`/`hazeH` 两个变量），顶部只留一句说明它为什么不存在了；
3. 光晕改成**每个灯自己画的「副本光」**：`lampLayers(box, palette, fontPx, round)` 把同一个灯的盒子
   按配方 spread **放大两层垫在灯下面**——外圈 spread `= 0.18 × fontPx`、内圈 `= 0.09 × fontPx`，
   两层 alpha 仍是配方的 `0.22` / `0.30`（**颜色与配方一个字没改**，只改了"这层光画多大、什么形状"）。
   矩形不见了，光的形状 = 字形的形状。

> **为什么不用 `View` 的 `shadowColor` / `shadowRadius`**：iOS 的阴影是按**渲染后的 alpha 蒙版**生成的，
> 一盏 1~2pt 的小灯配 `shadowRadius ≈ 2pt` 只会糊成一片橙雾，而且每个带阴影的 View 都要一次离屏栅格化
> ——取景器里要逐帧付这个代价。副本光没有这两个问题，并且能被探针逐像素断言。
> 代价写在 §34.6：外扩的副本光不参与布局（父容器不被撑开），贴边放置时最外圈理论上可能被裁。

`TextGlyph`（`ccd_osd` / `lab_inkjet` / `archival_steel` 这三个真字体字形档）现在也带**字形形状**的微发光：
`textShadowColor: palette.haloInner` + `textShadowRadius: r2(fontPx × haloOuterRatio)`。
理由：旧 `DateHaze` 是**对所有字形档**都铺橙光的，删掉矩形后不把"光"还给印字档，
这三种日期的观感会从"微微发光"直接掉到"完全没光"——而无相框模式（§34.3）明确要求日期与地名都带半透明微发光。

**现在的防线**（三重，都在 `_probe_*` 里，不是靠注释约束）：

- `_probe_noframe_v181.cjs` A 组：`DateHaze` 不存在、`stripComments` 后的源码里没有 `DateHazeProps`/`DateHaze`
  标识符、没有 `backgroundColor: layer.color` 这类"整盒铺色"写法、`GHOST_OPACITY === 0`；
- `_probe_date_engine.cjs`：每个字形的熄灭段 alpha 恒 0、`haloOuter`/`haloInner` 必须是半透明 rgba、
  `haloOuterRatio ∈ (0, 0.3]`、`haloInnerRatio ∈ (0, haloOuterRatio)`；
- `_probe_film_look.cjs` ②.5 组：颗粒层不透明度硬上限（见 §34.2）。

### 34.2 颗粒层变成"不透明灰色大网"：一行算术的根因与硬上限

**现象**（真机实测）：在取景器里把颗粒强度/大小往上调，整个相机画面被灰网盖住。

**根因**（就一行）：v1.8.0 把 `preset.grain` 的语义从"图层 opacity"改成了"颗粒**强度**"（0.42~0.62），
但 `gradeLayers.ts` ⑨ 颗粒层写的仍是 `opacity: clamp01(preset.grain)`；而档位是**乘**在预设值上的
（`applyGrainLevel`：off 0 / light 0.45 / std 1 / heavy 1.5 / max 2.2）⇒ max 档
**0.52 × 2.2 = 1.144** → `clamp01` 夹成 **1.0** ⇒ 一张 σ=0.2605 的中灰贴图以 100% 不透明度铺满画面。
取景器与成片共用同一份 `buildGradeLayers`，所以成片同样中招（只是没人会拿成片去调这个滑块）。

**修法**：`src/constants/grain.ts` 新增

```ts
export const GRAIN_OPACITY_MIN = 0.12;   // 硬上限：不许抬
export const GRAIN_OPACITY_MAX = 0.22;
export function grainLayerOpacity(strength: number): number   // clamp01 后线性映射进 [0.12, 0.22]
```

⑨ 层改成 `opacity: grainLayerOpacity(preset.grain)`。**预设的 `grain` 列一个数字没动**（仍 0.42~0.62，
语义 = 强度），`GRAIN_LEVELS` 五个档位也没动，`GRAIN_OPACITY_MAX = 0.22` 是**规范里写死的硬上限**。

**这一版颗粒看起来会比 v1.8.0 细**，这是上限的必然代价，数字如下：

| 项 | v1.8.0（口径） | v1.8.1（硬上限） |
| --- | --- | --- |
| 图层 opacity | `clamp01(grain × scale)`，max 档 = **1.000** | `grainLayerOpacity(...)` ∈ **[0.12, 0.22]** |
| 可见振幅 `opacity × σ(0.2605)` | 探针实测窗 [0.10, 0.22] | **0.0313 ~ 0.0573**（`effAmp(0.5)` 实测 0.0422~0.0474） |
| 混合模式被降级时最坏灰度覆盖 | 0.5 | **≤ 0.11** |

想要更浓的颗粒：**重烤更高对比度的 `assets/textures/grain.png`**（`scripts/generate_grain_clump.py`），
不许抬 opacity 上限。另外两条用户规范也已在位：`FilmLookLayers` 根容器本来就是 `pointerEvents="none"`
（规范①），取景器实时预览与 ViewShot 成片走的是**同一份** `planFilmLooks`（规范③）。

### 34.3 `00 NO FRAME`：无相框纯净全屏模式

相框抽屉首页新增编号 **`00 NO FRAME`**（`FRAMES[0]`，`fullBleed: true`）。其余 5 款纸框的 id/顺序/窗口参数一字未动，
`DEFAULT_FRAME_ID` 仍是 `'polaroid-600'`（现在下标 1）。

- **三档画幅**（设置页 `⑨ 无相框画幅`）：`1:1` = 1、`3:4` = **0.75**、`3:2` = **2/3**，默认 `3:4`。
  390×844 上实测成片 **390×390 / 390×520 / 390×585**（照片按 `cover` 铺满，**不拉伸**；
  `computeFrameLayout` 的 contain 语义作用在相框盒上，`fitBox` 一行未改）。
- **不画任何实体相纸**（卡纸/白边/齿孔/压痕/阴影全不渲染），三处守卫都在首个 `<FrameSkin` **之前**：
  `FilmCompositor.tsx:506/:660`（相纸 `Image` + 皮肤）、`FramePreviewLayer.tsx:211/:253`
  （纸/皮肤）、`FilmDrawer.tsx:255`（抽屉预览）。
  ⚠️ `FramePreviewLayer` 还要**整组跳过四块 `CURTAIN_COLOR = '#0A0A0C'` 幕布**（`:230`）——
  那块幕布是"相机画面只在镂空窗内透出"的机制，全铺时留着会把预览整片涂黑。
- **水印**：默认右下 `in_br_h`（左下 `in_bl_h` 保留，竖排机位只留左下）；
  内缩 = `max(2, round(短边 × 0.045))`（390 上 **18pt**、358 上 **16pt**，比纸框的 0.028 大，
  因为不再有相纸留白当护边）；**分两行右对齐**（**地名在上、日期在下**，行距 = **1.32 × 日期字号**）
  ⇒ 390 上日期底沿 18 / 右沿 18，地名底沿 **33.73** / 右沿 **19.21**。
  日期行仍受 v1.8.0 那条"日期宽度压不动"的约束（`maxWidth === quartz.width`）。
- **抽屉缩略图**：铺满卡片的纯照片 + 左上角 12pt `00` 角标（`rgba(0,0,0,0.45)` 底、白字、内缩 6pt、选中琥珀描边），
  沿用抽屉既有的 96×72pt 迷你实时预览机制。
- **顺手修掉一个静默丢失的 bug**：全铺帧的 `bottomStripHeight === 0`，而 `stacked` 版式的守卫
  `hasSlot && vertical.top + placeTop <= vertical.bottom`（[`geometry.ts:1199`](src/utils/geometry.ts#L1199)）因此**恒假** ⇒
  地名行不 push、**不报错、不打印**。机制：`regionVertical`（`geometry.ts:772`）的 `'window'` 分支返回
  `height = max(0, layout.bottomStripHeight)`，而这个高度由 `geometry.ts:245` 的
  `max(0, box.height - (top + height))` 算出 —— 全铺帧就是 0。
  现在由 `geometry.ts:1005-1013` 给无相框换了一条专用区域（理由写在注释里，纸框老口径逐位不变）；
  `geometry.ts:1147` 的 `planLayoutId` 只在用户选默认 `split` 时才重判成 `stacked`，
  明确选过 `dateOnly` / `centered` / `stacked` 的版式原样保留。

### 34.4 这一版动了哪些文件

（探针脚本全在工作区根，不进仓库；下表是 `retro-film-cam` 内的改动。）

| 文件 | 改动 | 说明 |
| --- | --- | --- |
| `src/components/DateGlyphs.tsx` | 重写发光机制 | `GHOST_OPACITY = 0`；`GlyphPalette` 增 4 个副本光字段；新增 `lampLayers` / `Lamp` / `PunctuationLamp`；删整个 `DateHaze` |
| `src/components/DateStamp.tsx` | 删除晕染层调用 | 去掉 `DateHaze`、`hazeW`/`hazeH` |
| `src/constants/grain.ts` | 新增硬上限 | `GRAIN_OPACITY_MIN/MAX` + `grainLayerOpacity()` |
| `src/utils/gradeLayers.ts` | ⑨ 层接线 | `opacity: grainLayerOpacity(preset.grain)` |
| `src/constants/presets.ts` | 注释订正 | `grain` 列语义 = 强度；图层 opacity 归 `grainLayerOpacity()` |
| `src/types/index.ts` | 契约 | `NoFrameAspect`（`:114`）、`FrameSpec.fullBleed?`（`:208`）、`AppSettings.noFrameAspect`（`:813`） |
| `src/constants/frames.ts` | 名录 + 解析 | `NO_FRAME_ASPECTS`（`:85-105`）、`resolveFrame`（`:129-145`）、`FRAMES[0]`（`:168/177`） |
| `src/utils/geometry.ts` | 无相框几何与水印 | `NO_FRAME_INSET_RATIO = 0.045`（`:919`）、内缩算式（`:999`）、`insetOverride`（`:798-800`）、无相框专用区域（`:1005-1013`）、`planLayoutId`（`:1147`） |
| `src/utils/settingsStore.ts` | 白名单 + 默认 | `noFrameAspect: '3:4'`（`:69`）、文件内白名单（`:119-123`）、`pick`（`:226-229`） |
| `src/hooks/useSettings.tsx` | setter | `setNoFrameAspect` |
| `src/components/SettingsScreen.tsx` | 设置区 | `⑨ 无相框画幅` 三行 `OptionRow`（`:540-550`） |
| `src/components/CameraScreen.tsx` | 接线 | `resolvedFrame`（`:478`）、快门带 `noFrameAspect`（`:1247`）、抽屉回调（`:832/:1947`） |
| `src/utils/processFilmPhoto.ts` | 单点解析 | `resolveFrame(...)`（`:380`）——只解析一次，layout/裁切/frameId 自动一致 |
| `src/hooks/useFilmStage.ts` | 就绪计数 −1 | 全铺帧没有贴图（不减则每次快门白等 1500ms） |
| `src/components/FilmCompositor.tsx` · `FramePreviewLayer.tsx` · `FilmDrawer.tsx` | `fullBleed` 守卫 | 见 §34.3 |
| `src/i18n/locales/*.ts`（5 个） | 各 +7 键 | 4 个 `frame.noFrame*` + 3 个 `settings.noFrame.*` |
| `assets/frames/no-frame.png` | 新素材 | 全铺帧占位（`source` 必填） |
| `app.json` | +1 / −1 | 版本号 1.8.1 |

### 34.5 验证清单（本地，全部实际跑过）

| 命令 | 结果 |
| --- | --- |
| `cd retro-film-cam; npx tsc --noEmit -p tsconfig.json` | **EXIT=0**，零诊断 |
| `node _probe_noframe_v181.cjs` | **217 断言 / 0 失败 / PENDING 0 / EXIT=0**（本版规格真源） |
| `node _probe_noframe_watermark.cjs` | **458 断言 / 0 失败 / EXIT=0**（无相框几何/水印 + 纸框 60 例回归） |
| `node _probe_date_engine.cjs` | **1818 断言 / 0 失败 / EXIT=0**（v1.8.0 是 1793） |
| `node _probe_film_look.cjs` | **1126 断言 / 0 失败 / EXIT=0**（新增 ②.5 颗粒上限组） |
| `node _probe_geo_lock.cjs` | **19336 断言 / 0 失败 / EXIT=0** |
| `node _probe_skin_material.cjs` | **859 断言 / 0 失败 / EXIT=0** |
| `node _probe_v180_seams.mjs` | **1312 断言 / 0 失败 / EXIT=0** |
| `node _probe_lead_integration.mjs` | **133 断言 / 0 失败 / EXIT=0** |
| `node _probe_capture_quality.mjs` | **78 断言 / 0 失败 / EXIT=0** |
| `node _haze_audit.mjs` | 超预算预设 **0 / 10**，**EXIT=0** |
| `node _purity_audit.mjs` | **59 断言 / 0 失败 / RESULT: PURE** |
| `npx expo export --platform ios --no-bytecode` | **EXIT=0**（产物目录在工作区根，不进仓库） |

去污染说明：`00 NO FRAME` 让 `FRAMES` 从 5 项变 6 项且 **`FRAMES[0]` 不再是 `polaroid-600`**，
几个探针里"取 `FRAMES[0]` 当默认相框"的写法会**静默测错对象**（其中一个会直接 `TypeError`）。
本轮把它们统一改成 `findFrameIndex(DEFAULT_FRAME_ID)` 显式取样，并把纸边元素数之类的期望值改成派生式
（`FRAMES.length × FRAME_VARIANTS.length`）。
**只改取样口径与过期期望值，没有放宽任何阈值**；`_probe_geo_lock.cjs` ④ 组里"无相框 + `split`"那两条
改成了**更强的正面断言**（地名行 `align.maxWidth` 必须等于整条画布宽 + 该机位确实被判成 `stacked`），
不是删断言。

### 34.6 已知缺口 / 没能验证的事

1. **这一版仍然没有任何真机或模拟器验证**（本机没有 iOS 运行时）。三条修复都只有"数学 + 源码形状"级别的证据：
   橙色方块是否真的从成片里消失、颗粒灰网是否真的不再遮住画面、无相框模式铺满后取景器里的实际观感、
   `pointerEvents` 是否真的把轻触对焦让出来。
2. **无相框模式下，取景器实时预览看不到画内日期**（`in_*` 机位）——与 §33.12 第 3 条同源的结构性缺口
   （预览幕布按设计只盖相纸留白、绝不压照片区），这一版不做。
3. **副本光的代价**：外扩的灯圈不参与布局（父容器不被撑开），贴边放置时最外圈理论上会被裁。
   已用机位内缩（纸框 0.028 / 无相框 0.045）把光圈留在安全区内，但没有真机确认"看起来是否被切"。
4. **颗粒幅度仍是推算值**：按"1 贴图像素 = 1 逻辑点、3x 屏"换算，0.031~0.057 是数学振幅不是观感；
   设备缩放口径若变，σ 约按 0.35 倍衰减（探针会红）。
5. **`heavy` 与 `max` 两档的差距被上限压小了**：`grainLayerOpacity` 是线性映射 ⇒ heavy(×1.5) 0.198、
   max(×2.2) 0.22，只差 0.022。这是硬上限的必然代价，要拉开只能重烤贴图（**不许抬上限**）。
6. `tri-x-400` 的图层数是 9 层而其余 9 支是 10~13 层——这是该卷配方本身（4 个 color 层而不是 6 个），
   **不是缺层**（同 §33.12 第 7 条）。

### 34.7 产物指纹

| 项 | 值 |
| --- | --- |
| 提交 | 本地 `f09240b`（`v1.8.1：日期水印背景 100% 透明（删 DateHaze 实心矩形 + 副本光）+ 颗粒层不透明度硬上限 [0.12,0.22]（不让 max 档变成不透明灰网）+ 00 NO FRAME 无相框纯净全屏模式`，父 `21ef42c`，27 files / +1422 −455，tree `151b9368`）；推送走 Git Data API（本机 github.com:443 不通）⇒ 远端 `373974d5`（父 `0c8e4ad`），远端 130 个 blob 与本地逐个 sha 相同（`TREE MATCH = True`） |
| CI | run [`38957342905`](https://github.com/lizimo20041023-oss/retro-film-cam/actions/runs/38957342905) **success**（job `build-ipa` `117163413029`：prebuild → pod install → xcodebuild Release → 打 ipa → 上传 artifact，13 步全成功，另一条 skipped 的步骤是"只在上传失败时才执行"的兜底） |
| IPA | workflow artifact `12071168466`（`FretroCam-unsigned-ipa`，10,348,480 B）⇒ 解出 `FretroCam-v1.8.1-unsigned.ipa` **10,462,954 B** |
| 体积 / SHA-256 | **10,462,954 B**（9.98 MiB）· `sha256:4e2d38f88f5d360f481e9cf065047ab34d4c43a8173707915b413a4509c58715`（上传后回读 Release asset digest 逐字节一致，`SIZE MATCH` / `DIGEST MATCH` 均 True） |
| Release | [`v1.8.1`](https://github.com/lizimo20041023-oss/retro-film-cam/releases/tag/v1.8.1)（release id `415332537`，asset id `648454723`，`target_commitish` = 远端 `373974d5`）· 下载：<https://github.com/lizimo20041023-oss/retro-film-cam/releases/download/v1.8.1/FretroCam-v1.8.1-unsigned.ipa> |
| bundle `main.jsbundle` | 本地 `expo export --platform ios --no-bytecode` **EXIT=0** ⇒ `_expo/static/js/ios/index-a1be5160fade386027948f1629879ff1.js` **1,339,211 B**；产物 20 个文件 / 2,816,976 B（`grain.png` 211,111 B / `light-leak.png` 18,214 B / `no-frame.png` 68 B，与源文件逐字节同尺寸）；`_verify_ipa_v181.py --local` 在该产物上校准后 **RESULT: OK** |
| 核验 | `python _verify_ipa_v181.py 12071168466` → **RESULT: OK**：IPA 内 **115** 个条目、`Payload/FretroCam.app/main.jsbundle` **2,040,168 B**、`Info.plist` 版本 `1.8.1` + `com.canyerylee.fretrocam`、相框 PNG 恰好 **10 张**（含 `no-frame.png` 68 B）、四张贴图（grain / light-leak / vignette / dust）都在包、撤掉的素材（`leather` / `half-frame` / `sheet8x10`）全 0 命中、`SHOULD_BE_ABSENT` 清单**全 x0**（含本版删掉的 `DateHaze` / `DateHazeProps`）、v1.8.1 的十七根新针（`NO_FRAME_ID` / `NO_FRAME_ASPECTS` / `DEFAULT_NO_FRAME_ASPECT` / `resolveFrame` / `noFrameAspect` / `fullBleed` / 7 个 `*.noFrame*` i18n 键 / `grainLayerOpacity` / `haloOuterRatio` / `haloInnerRatio` / `lampLayers` / `PunctuationLamp`）**全 x≥1**；内部名 canary `makeRandom` 不在包内 ⇒ 该段按设计跳过（内部名的证据交给源码级探针，不靠字节码） |

---

## 35. v1.8.2：颗粒不再糊成脏云雾（贴图重烤 + 1:1 手工平铺）

这一版只修一件事：**颗粒档打开后整幅画面被 3~20pt 的软斑块盖住**。用户投诉原话是
「为什么会这样啊 把颗粒关掉又没有了」——同一张取景器截图里，颗粒「輕 LT」开着时满屏云斑，关掉即干净。
根因有两条，缺一不可；两条都修了才干净。

### 35.1 根因一：贴图本身的能量压在 8~64px 周期上

`assets/textures/grain.png` 的环带能量（FFT 环带占比，周期 = 512/半径）：

| 频带 | `<8px` | `8–24px` | `24–64px` | `64–160px` | `>160px` |
| --- | --- | --- | --- | --- | --- |
| v1.8.1 旧贴图 | 25.8% | **55.0%** | **16.2%** | 2.4% | 0.5% |

也就是说 71% 的能量在周期 ≥8px 上。**这不是"对比度被放大"造成的**：归一化只做了一次全局标量
（除以 0.7406 ⇒ 1.3502×），标量改不了频谱形状。形状来自旧配方
`0.62·细支(σ≈0.77px) + 0.38·粗支(σ≈2.24px)`，其中 `wrap_resize()` 的 1.4× 上采样单独就把
`<8px` 带的能量搬走 12.6pp（方差传递 0.445/白噪），`SIGMA_MICRO=0.7` 的微模糊又把细支在
`<8px` 上的能量削掉 52%。

### 35.2 根因二：打包路径把贴图整体放大 3 倍

iOS 的 `resizeMode="repeat"` 不是 `colorWithPatternImage`，而是
`node_modules/react-native/Libraries/Image/RCTImageComponentView.mm:148-150` 的
`resizableImageWithMode:UIImageResizingModeTile`，**方格边长 = `image.size`（单位：点）**。
`image.size` 取决于这张资源被解码成几倍图：

| 路径 | 解码倍率 | `grain.png` 的 `image.size` | 屏幕上的方格 |
| --- | --- | --- | --- |
| Metro / 数据 URL（开发期） | 3× | 512/3 ≈ **170.7pt** | 1 贴图像素 = 1 设备像素 |
| 打包进 App 的资源（真机 IPA） | 1× | **512pt** | 1 贴图像素 = **3 设备像素** |

打包路径走 `RCTUtils.mm:966-998` 的 `RCTImageFromLocalAssetURL`，而 `assets/textures/` 里没有
`@2x/@3x` 变体 ⇒ `scale=1`。于是同一张贴图在真机上被放大 3 倍：`8–24px` 的团簇成了屏幕上的
**8–24pt 斑块**、`24–64px` 的团块成了 24–64pt 的"云"，与用户截图的观感逐条对上。
这也解释了为什么开发期看着还行、装到手机上就糊。

### 35.3 修法一：重烤 `grain.png`（先定尺 → 再定形 → 最后定对比度）

`scripts/generate_grain_clump.py` 的 `bake_grain()` 重写：直接在最终 `512×512` 网格上取**一支**白噪，
`fine = wrap_blur(white, 0.60)`、`clump = wrap_blur(white, 1.80)`（各自除以自身 std），
`pat = 0.78·fine + 0.22·clump`；**删掉 `COARSE=366` + `wrap_resize()` 的 1.4× 上采样，删掉 `SIGMA_MICRO` 微模糊**。
对比度最后才定：`sigma_pre` 从 0.16 起按 0.002 步进，直到 `clip(0.5 + pat·sp, 0, 1)` 的 std 达到
`TARGET_SIGMA = 0.2605`（停在 0.280），再用整数偏移把 mean 顶到 127.5。新贴图实测：

| 指标 | v1.8.1 | v1.8.2 |
| --- | --- | --- |
| `<8px` | 25.8% | **65.7%** |
| `8–24px` | 55.0% | 28.5% |
| `24–64px` | 16.2% | **5.0%** |
| `64–160px` / `>160px` | 2.4% / 0.5% | 0.7% / 0.1% |
| σ（0~1） | 0.26049 | 0.2616 |
| mean | 0.49991 | 0.49987 |
| 跨接缝 / 图内梯度 | — | x 0.97 / y 1.03 |
| SHA-256 | `381acc560c0faa21630071e3370d3a562c6ddcbe77ed9394301e008a41f9ff2d` | `2d30d07745e2863d3a2a55bb479d4f5ee9319993b6affa456550d9ce5ae86ad0` |

脚本里加了**频带自检门**：`<8px ≥ 0.60`（`BAND_FINE_MIN`）、`24–64px ≤ 0.06`（`BAND_COARSE_MAX`），
越界即 `sys.exit(1)`。旧配方在这两条上是 0.258 / 0.162 ⇒ **这道门真能把旧贴图挡回去**。

> 口径出处：本节这些环带数字与 `_plate_stats.json` 里 **v1.8.2 新增**的 `bands` 列，权威定义只有一处 ——
> `scripts/generate_grain_clump.py:108-123` 的 `band_energy()`（探针里的 JS FFT 实现与它逐位一致）。
> v1.8.1 及以前 `_plate_stats.py` 只统计均值 / 分位数 / alpha，**环带能量从未被任何脚本记录过**；
> 这正是这个缺陷能一路 CI 全绿出厂的原因。
它此前一直没被任何门禁覆盖，所以这个缺陷能在 CI 全绿的情况下出厂 —— 这是这一版最该记住的一件事。
`light-leak.png` 逐字节未变（`8BCD14BF5EBE…0107B7`），漏光烘焙代码一行未动。

### 35.4 修法二：手工 1:1 平铺（`TEXTURE_TILE_PT = 512/3`）

`src/components/FilmLookLayers.tsx` 里颗粒层不再交给 `resizeMode="repeat"`，改为
`planTextureTiles(width, height, tilePt = TEXTURE_TILE_PT)` 算出方格，铺绝对定位的
`<Image resizeMode="stretch">`：

- `TEXTURE_SIZE_PX = 512`、`TEXTURE_TILE_PT = TEXTURE_SIZE_PX / 3`（3× 屏上 **1 贴图像素 = 1 设备像素**），
  与前面那条解码路径差无关；取景窗 341pt ⇒ **2×2 四块**，越界的最后一行/列由根节点
  `overflow: 'hidden'` 裁掉；
- 触发条件是 `layer.resizeMode === 'repeat' && layer.textureId === 'grain'` ⇒ **图层计划没动**
  （`gradeLayers.ts:291-301` 仍是 `resizeMode:'repeat'`），改的只是"谁来画这张平铺"；
- 就绪计数口径不变：整层**只上报一次** `onPlateLoad`（平铺分支是
  `onLoad={index === 0 ? onPlateLoad : undefined}`，多报会让"还差几张图"提前归零）。
  实测计数：文件里 `<Image` 共 **3 处**（`:238` 照片层 / `:275` 平铺块 / `:293` 非平铺贴图层），
  `onLoad={onPlateLoad}` **2 处**（`:238` / `:297`），守卫式 **1 处**（`:288`）—— 不变量是
  "每个贴图层在**运行时**恰好上报一次"，不是"字面出现次数相等"（§35.7 记录了口径订正）；
- `dust.png` 仍走 RN 的 `repeat`：它是稀疏离散点，每 170.67pt 重复一次会被一眼看出来。

### 35.5 前后对照（离线仿真）

`_sim_grain_v182.py`：341.333pt 见方的取景窗、@3x = 1024 设备像素、overlay + 层 opacity 0.14；
旧侧 = 旧贴图按 512pt 方格铺，新侧 = 新贴图按 170.667pt 方格铺，比对**调制量**（这一层单独的贡献）：

| 口径 | 修复前 | 修复后 |
| --- | --- | --- |
| σ（调制量） | 0.0339 | 0.0352 |
| `<8px` | 0.4% | **65.7%** |
| `8–24px` | 22.6% | 28.5% |
| `24–64px` | **53.1%** | **5.0%** |
| `64–160px` / `>160px` | 19.5% / 4.5% | 0.7% / 0.1% |

修复前 53.1% 的能量落在 24–64 设备像素上（= 8–21pt 的团块，正是投诉里"3~20pt 斑块"的来源）；
修复后 65.7% 落到设备像素级，而**总强度几乎不变（0.0339 → 0.0352）** —— 不是靠把颗粒调淡来遮丑。
对照图 `_grain_sim_v182.png`（左 = 修复前，右 = 修复后）。

### 35.6 文件改动

| 文件 | 改动 |
| --- | --- |
| `scripts/generate_grain_clump.py` | `bake_grain()` 重写（一支白噪两个尺度、无上采样、无微模糊）+ `band_energy()` + 两条频带自检门 + 文件头订正 |
| `src/components/FilmLookLayers.tsx` | 新增 `TEXTURE_SIZE_PX` / `TEXTURE_TILE_PT` / `TextureTile` / `planTextureTiles()`；颗粒层改手工平铺（只有第一块挂 `onPlateLoad`）；文件头补「为什么不再用 repeat」 |
| `src/constants/textures.ts` | 文件头「尺寸那些事」重写（1 贴图像素 = 1 设备像素）；`grain.note` 换新配方与新频带数字 |
| `assets/textures/grain.png` | 重烤（249,201 B，SHA-256 `2D30D077…86AD0`） |
| `app.json` | 版本号 1.8.2 |
| `README.md` | 本节（目录 + §35） |

### 35.7 验证清单（本地实测）

写手全部停手后，先由门禁侧（写域只有工作区根的 `_plate_stats.py` / `_probe_*`）复跑一轮，
再由 Lead 在冻结树上重跑一遍，数字逐条一致：

| 门禁 | v1.8.1 基线 | v1.8.2 | EXIT |
| --- | --- | --- | --- |
| `_probe_date_engine.cjs` | 1818 / 0 | 1818 / 0 | 0 |
| `_probe_film_look.cjs` | 1126 / 0 | **1201 / 0** | 0 |
| `_probe_geo_lock.cjs` | 19336 / 0 | 19336 / 0 | 0 |
| `_probe_noframe_v181.cjs` | 217 / 0 | 217 / 0 | 0 |
| `_probe_noframe_watermark.cjs` | 458 / 0 | 458 / 0 | 0 |
| `_probe_skin_material.cjs` | 859 / 0 | 859 / 0 | 0 |
| `_probe_v180_seams.mjs` | 1312 / 0 | 1312 / 0 | 0 |
| `_probe_lead_integration.mjs` | 133 / 0 | 133 / 0 | 0 |
| `_probe_capture_quality.mjs` | 78 / 0 | 78 / 0 | 0 |
| `_haze_audit.mjs` | 超预算 0 / 10 | 超预算 0 / 10 | 0 |
| `_purity_audit.mjs` | 59 / 0 PURE | 59 / 0 PURE | 0 |
| `npx tsc --noEmit -p tsconfig.json` | 0 诊断 | 0 诊断 | 0 |

合计 **25,412 条断言 / 0 失败**（再加 `_purity_audit` 的 59 条 = 25,471）。除 `film_look` 外
10 道门禁的条数与 v1.8.1 基线**逐条相同** —— 没有靠放宽哪条门来换绿。

`film_look` 1126 → 1201（+75）是**订正 + 新增**，不是放宽。用插桩副本实测分解：
`≤⑥ 1116 ｜ ⑦ 15 ｜ ⑧ 27 ｜ ⑨ 43 = 1201`，旧 §⑦ = 1126 − 1116 = 10 ⇒ **+5** 来自 §⑦ 判据重写
（旧判据把 `<Image>` 字面出现次数钉死成 2、并假设 `onLoad={onPlateLoad}` 出现次数等于 `<Image>` 数；
平铺后一个贴图层有 N 张 `<Image>`，口径改成"每个贴图层运行时恰好上报一次就绪"，见 §35.4），
**+27** 来自 §⑧ 平铺契约，**+43** 来自 §⑨ 频带门。**旧断言一条没删**，`:816` 的
`eq(grain.resizeMode, 'repeat', '⑥ 颗粒平铺')` 继续绿（图层计划没动）。

§⑧ 钉住的新契约（`planTextureTiles`）：`TEXTURE_SIZE_PX = 512`、`TEXTURE_TILE_PT = 512/3`、
`tile.size × 3 = 512`、`341.333² → 4 块`、`321×373 → 6`、`352×466 → 9`、`4000² → 36`、
`0 / 负 / tilePt=0 → []`；源码级：颗粒分支调用 `planTextureTiles(`、守卫式 `onLoad` 存在、
旧的 `resizeMode={… ? 'repeat' : 'stretch'}` 只剩非颗粒分支一处。

§⑨ 频带门 —— 同一段测量喂两张图，**新绿旧红**：

| 环带 | 门线 | 新 `grain.png` | 旧 v1.8.1 贴图 |
| --- | --- | --- | --- |
| `<8px` | `≥ 0.60` | **0.6566 绿** | **0.2584 红** |
| `8–24px` | `≤ 0.35` | 0.2854 绿 | 0.5501 红 |
| `24–64px` | `≤ 0.06` | **0.0496 绿** | **0.1624 红** |
| `64–160px` | `≤ 0.02` | 0.0070 绿 | 0.0238 红 |

旧贴图 = `git show HEAD:assets/textures/grain.png`（211,111 B，字节 sha256 钉死）导出的
`_grain_v181_old.png`，喂进同一段测量后有 6 条 `【红】` 断言全部成立；另有 6 条"冻结值"断言
（删掉图片也仍然成立，防"删图变绿"）。σ 0.2605 → 0.2616（+0.4%）⇒ 是**频谱搬家**，不是调淡。

四份独立实现互相印证（数字完全一致）：烤图脚本内联 numpy、`_plate_stats.py`、探针里的 radix-2 FFT
（与 numpy 逐位一致）、`_verify_ipa_v182.py --grain`；并固化成 7 条跨实现断言 + 3 条"改了图不重跑
统计就会被抓"的过期检测。`_plate_stats.json` 本轮刷新：grain `p05 0.0431→0.0392`、
`p95Lum 0.9569→0.9608`、`fracScreenNeutral 0.0423→0.0435`、`fracLumGE50 0.4982→0.4990`、
`mean / meanLum 0.4999` 不变，并新增 `sigma`（0.2616）与 `bands` 两列（**新增维度，不是放宽**）；
`dust` / `vignette` / `light-leak` 三行逐字段未变，`light-leak.png` 逐字节未变。

打包侧（`expo export` 冒烟 + IPA 核验）见 §35.9。

### 35.8 已知缺口

- **`dust.png` 在打包路径下同样被放大 3 倍**（斑点比开发期大 3 倍）。它是稀疏离散点、不改观感，
  这版不动它；要修就照 `grain` 的办法给它也做 1:1 平铺。
- 频带门是**离线**判据（对 PNG 做 FFT 环带分解），不是真机截图判据；"1 贴图像素 = 1 设备像素"
  是按 `TEXTURE_TILE_PT = 512/3` 在 3× 屏上推出来的，2×/1× 设备上这层仍按 512/3pt 铺，颗粒会略粗。
- 门禁只证明**三条契约**：贴图频谱（§⑨）、平铺几何（§⑧）、就绪语义（§⑦）。它不模拟系统合成器，
  也不出真机截图，所以"装到手机上看着是否舒服"仍然只能靠人眼确认（见上一条）。
- 没有真机验证：本机跑不了 iOS 模拟器/真机，"斑块消失"的结论来自 §35.5 的离线仿真 + §35.2 的
  RN 源码级路径分析。

### 35.9 产物指纹（全部为本次实测值）

| 项目 | 实测值 |
| --- | --- |
| 本地提交 | `cbe4e45`（6 files changed，376 insertions(+)，43 deletions(-)） |
| 推送 | `_push_v180_api.py` 重建远端提交 `60680533a35b49e4d1d559fbe8bc6c5f1e1d4f15`（`TREE MATCH = True`；上传 6 个 blob；130 个条目逐个比对：无 only-remote / only-local / differ） |
| 远端备注 | 上一条被同步出来的远端提交 `22ee7cb1…` 与当时的远端树 `1c90bdc5…` **完全一致**（内容无差异的空提交，`_push_v180_api.py` 每次都会重建提交对象所致） |
| CI | run `38964010866`（event=push，master）→ job `117185858537` 全部 success；<https://github.com/lizimo20041023-oss/retro-film-cam/actions/runs/38964010866> |
| artifact | `FretroCam-unsigned-ipa`，id `12074597677`，zip 10,387,445 B |
| IPA 内 bundle | `Payload/FretroCam.app/main.jsbundle` 2,041,414 B；IPA 条目 115 |
| IPA | `FretroCam-v1.8.2-unsigned.ipa` **10,501,887 B**，SHA-256 `108cdd8d886f602406a127e221cc696ffc2a1967ac852d704589e70dddbd0d35` |
| 核验（CI 产物） | `python _verify_ipa_v182.py 12074597677` ⇒ **`RESULT: OK`**：新针 `planTextureTiles` / `TEXTURE_SIZE_PX` / `TEXTURE_TILE_PT` 各 x1；`assets/assets/textures/grain.png` 249,201 B **字节 sha256 = `2d30d077…86ad0` 一致** + 解码频谱 `<8=65.7% / 24-64=5.0%` 两道门 OK；`Info.plist` = `1.8.2` + `com.canyerylee.fretrocam`；相框素材 10 张（含 `no-frame.png` 68 B）；`SHOULD_BE_ABSENT` 全部 0 命中 |
| Release | id `415371815`，tag `v1.8.2`，asset id `648592311`，`SIZE MATCH = True` / `DIGEST MATCH = True` |
| 打包前 export 冒烟 | `npx expo export --platform ios --no-bytecode` ⇒ EXIT=0；bundle `index-d4e1b8f6aebafebdb42f7c62aaf5d2e8.js` 1,339,980 B；导出目录 20 文件 / 2,855,835 B；`python _verify_ipa_v182.py --local …` ⇒ `RESULT(local): OK`；导出资产 `assets/5ebf6a817cd386ced4e993fe322baa5f` 与源 `grain.png` 逐字节一致 |
| 下载 | <https://github.com/lizimo20041023-oss/retro-film-cam/releases/download/v1.8.2/FretroCam-v1.8.2-unsigned.ipa> |

---

## 36. v1.8.3：四模块军规改造（手风琴设置页 / 原生等宽三层发光日期 / 原图零柔焦 / 实色卡纸与暗色相机壳）

这一版不加工能，是把四个"一直在将就"的地方按用户给的军规重做。用户 m01534 定了四条红线，
直接当验收口径写在这里：

1. **严禁省略代码 / 用 TODO 占位** —— 每个分支都真写出来，不留"以后补"。
2. **严禁用多色块拼接模拟渐变** —— 相框纸面、遮罩、光晕都算。
3. **严禁在照片上方叠 `blurRadius` 模糊副本** —— 旧实现里那层"微柔焦"被点名删除。
4. **100% 恢复原生锐度** —— 照片以 `opacity 1.0` 直接呈现，不许再压半透明色罩。

四个模块分四节，每节先写"旧实现为什么错"，再写新实现的关键数字。

### 36.1 模块一 A1：设置页从"五组滚动"改成"12 栏手风琴"

**旧实现的问题**：`SettingsScreen.tsx` 原来把全部选项纵向平铺（语言 7 行 + 定位 4 行 + 详细度 2 行 +
地名语言 4 行 + 水印版式 4 行 + 日期引擎 31 行 + 画质 3 + 颗粒 5 + 无相框 3 ≈ 60 行），
手机上要滑三四屏；而日期引擎那 31 行把格式/字形/机位/颜色四条**正交的轴**混成一栏 ——
用户想改"日期颜色"要在一堆日期样例里找。

**新实现**：`src/components/SettingsScreen.tsx` 整文件重写（969 → 1345 行）。12 个单行折叠栏，
一行一个设置大类，默认全收：12 行 × 54pt = **648pt**，iPhone 13 可用高度约 760pt，
加标题栏正好一屏看完 —— 这就是 54pt 这个数字的算术依据。

| key | 标题 | 收起态右侧摘要示例 | 展开体 |
| --- | --- | --- | --- |
| `lang` | 語言 LANGUAGE | `繁體中文` | 5 种界面语言 |
| `loc_mode` | 定位浮水印 LOCATION | `地名` | 關閉 / 地名 / 座標 |
| `loc_detail` | 地名詳細度 | `精簡` | 精簡 / 完整 |
| `loc_lang` | 地名語言 | `跟隨介面` | 跟隨介面 / 簡 / 繁 / EN |
| `watermark_layout` | 水印版式 | `地名在左 · 日期在右` | 4 种版式 |
| `date_format` | 日期格式 DATE FORMAT | `10 17 '26`（按当前格式实时生成预览） | 12 格式 + 關閉 |
| `date_style` | 日期字形 STAMP FONT | `石英機背發光` | 4 档（见 §36.2） |
| `date_pos` | 日期位置 STAMP POSITION | `畫內左下 · 直排` | 8 种机位 |
| `date_color` | 日期色彩 LED COLOR | 琥珀圆点 + `琥珀` | 5 色（圆点取该色 `filament`） |
| `quality` | 畫質 RESOLUTION | `極致 4032px` | 標準 / 高清 / 極致 |
| `grain` | 顆粒 FILM GRAIN | `輕 LT` | 5 档（见 §36.3） |
| `frameless_ratio` | 無相框畫幅 | `3:4` | 1:1 / 3:4 / 3:2 |

关键实现点（都在 `SettingsScreen.tsx`，探针可断）：

- 状态机：`const [expandedKey, setExpandedKey] = useState<SectionKey | null>(null)` —— **只允许一栏展开**，
  默认 `null`（全收）。同栏再点即收起：`setExpandedKey(prev => prev === key ? null : key)`。
- 触感与动画：`LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)` +
  `Haptics.selectionAsync()`，选中后 `scheduleCollapse()` 延迟 **180ms** 自动收起
  （`pickAfter(apply)` 保证先落值、再排定时器；`useEffect` 卸载时 `clearCollapseTimer`）。
- 竖条与摘要：左侧 2×14pt 竖条用 `ink.amberDeep`；标题 14/600；摘要 14pt、颜色 `SUMMARY_GOLD='#C86418'`、
  `maxWidth: 170`；`date_color` 的摘要前多一枚 8pt 圆点（`SectionMeta.dotColor`）。
  箭头是 `⌄`，展开时 `transform: [{ rotate: '180deg' }]`。
- **旧档位兜底**：摘要用 `findOrFirst(rows, match)`（`rows.find(...) ?? rows[0]`）计算 ——
  持久化里若还是个已删除的旧档位（比如 1.8.2 的 `glyphStyle: 'led_7seg'`），摘要不会变成 `undefined`，
  真正的迁移在 `settingsStore` 里做（§36.2）。
- 展开体用 `renderBody(key)` 的 `switch` 穷尽 12 栏，`default` 分支是
  `const _exhaustive: never = key; return null;` —— 以后加栏忘写展开体会直接编译红。
- 无障碍：`AccordionHeader` 是 `Pressable` + `accessibilityRole="button"` +
  `accessibilityState={{ expanded }}`。
- i18n（Lead 独占写域）：5 个 locale 全加 6 个 `settings.section.*` 标题键
  （`dateFormat`/`dateFont`/`datePos`/`dateColor`/`quality`/`grain`）；
  `settings.dateEngine.glyph.led_7seg` 与 `.led_dot_matrix` 两个键删除，换成
  `settings.dateEngine.glyph.quartz_led`（石英機背發光 / 石英机背发光 / クオーツLED / LED quartz / Quartz LED）。

### 36.2 模块二 B1：日期戳从"逐格拼线段"改成"原生等宽字体 + 三层发光"

**旧实现的问题**：`DateGlyphs.tsx` 用 1047 行手写几何在 `<View>` 里一根根画 LED 线段 / 点阵圆点
（`CHAR_TO_7SEG`、`CHAR_TO_DOTS`、`ledSegmentGeometry`、`dotMatrixGeometry`…），
每个字形都是一个 React 元素树。后果：① 笔画边缘没有字体的抗锯齿，亮部是"塑料块"；
② 每个字符单独摆位，竖排时逐字符 rotate 会累积基线误差；③ 两档字形（7 段 / 5×7 点阵）是同一种
"拼积木"思路的两种分辨率，属于一个问题的两个版本。

**新实现**：`DateGlyphs.tsx` 整文件重写（1047 → 222 行），导出 `OpticalDateText`。
三层 `<Text>` 用 `position:'absolute'` + 四边 0 叠满同一块区域，**共用同一份 TextStyle**
（`fontFamily`/`fontSize`/`lineHeight`/`letterSpacing`/`fontWeight` 完全一致），
只有 `color` 与 `textShadow*` 不同 ⇒ 三层是同一行字的三个光晕层，绝对对齐：

| 层 | kind | 颜色来源 | 阴影 | 阴影半径 |
| --- | --- | --- | --- | --- |
| 外层外晕 | `outer` | `DATE_GLOW_PALETTE[glow].outer` | 同色 | `hazeSpread(fontPx, glow) * glowScale`（≈ 8 × fontPx/44） |
| 中层近晕 | `mid` | `DATE_GLOW_PALETTE[glow].filament` | `palette.inner` | 0.5 × 外层半径 × `glowScale`（≈ 3.5 × fontPx/44） |
| 顶层灯丝 | `core` | `DATE_GLOW_PALETTE[glow].core` | **无** | 0 |

- 字体：`OPTICAL_FONT_FAMILY = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace'`，
  `fontVariant: ['tabular-nums']`（数字等宽，日期不会跳格），`allowFontScaling={false}`，
  `letterSpacing = dateLetterSpacingOf(canvasWidth) * DATE_GLYPH_STYLES[style].trackingScale`
  （`quartz_led` 在 358pt 画布上 ≈ 2.49pt）。
- **没有任何矩形/View 光晕层**：背景 100% 透明，亮度全部来自 `textShadow`。
- 字族/字距/字重的唯一真源拆成三张表，避免"改一处漏一处"：
  `DateGlyphStyleId`（`src/types/index.ts:734-738`，4 值）、
  `DATE_GLYPH_STYLES`（`src/constants/dateEngine.ts:491-496`）、
  `DATE_DESIGN_PX`（`src/constants/canvasBase.ts:32-37`）。

| id | 中文名 | fontWeight | trackingScale | glowScale | heightRatio | 设计字号 |
| --- | --- | --- | --- | --- | --- | --- |
| `quartz_led` | 石英機背發光 QUARTZ LED（默认） | 700 | 1.25 | 1 | 1.16 | 44 |
| `ccd_osd` | CCD 錄製字幕 | 700 | 1 | 0.8 | 1.16 | 46 |
| `lab_inkjet` | 暗房噴墨 | 600 | 0.92 | 0.4 | 1.16 | 44 |
| `archival_steel` | 檔案鋼印 | 800 | 0.84 | 0.35 | 1.16 | 46 |

- **竖排**：整行日期先作为**单个水平 `<View>`** 渲染，再对整层容器
  `transform: [{ rotate: '90deg' }]`（或 0）—— 严禁 `text.split('')` 逐字符 rotate，
  同一条基线一次旋转，没有累积误差。
- **旧值迁移**：`settingsStore.ts` 的 `LEGACY_DATE_GLYPH_STYLES = { led_7seg: 'quartz_led',
  led_dot_matrix: 'quartz_led' }` 在 `pickGlyphStyle()` 里先迁移再白名单校验；
  这两条字符串**必须留在源码里**（旧存档还要能读），别整仓 grep 当残留删掉。
- **两处偏离规范原文的取舍（有意为之）**：
  1. 规范给的示例色 `rgba(255,45,20,0.45)` / `#FF5232` / `#FFB8A8` **没有硬编码**，
     全部改从既有 `DATE_GLOW_PALETTE` 派生（用户原文写的是"如"= 举例）。所以 `classic_amber`
     的外晕实际是 `rgba(255,138,0,0.22)`、灯丝是调色板里的 filament 色 —— 好处是"日期色彩"
     那 5 档选项和三层发光自动同步，改一处全变。
  2. 规范说"移除 7 段/点阵两档、合并为王牌档"，落地时**沿用了后 3 个旧 id**
     （`ccd_osd`/`lab_inkjet`/`archival_steel`）而不是任务示例里的 `ccd_caption`/`darkroom_ink`/`archive_stamp`：
     这 3 个 id 已经写进持久化数据，改名要再铺一层迁移表，收益为零。

### 36.3 模块三 C1：原图零柔焦 + 颗粒 5 档绝对不透明度 + 取景器去颗粒

**旧实现的三宗罪**（全在 `src/utils/gradeLayers.ts` 的图层栈里）：

1. **`micro-soft-focus`**：一张与照片同尺寸的 `<Image>`，`blurRadius: 1.2`、
   `opacity: 0.16`、`offsetX/offsetY: 0.5` —— 这就是用户说的"在照片上盖了一张模糊副本"。
   它同时吃掉了锐度：1.2pt 的高斯在 3× 屏上等于 3.6 设备像素。
2. **`fade` 褪色托黑**：`blendMode:'lighten'`、纯色 `#545A61`、`opacity ≤ 0.13` ——
   把全画幅的暗部抬向灰蓝。用户说的"全画幅半透明青灰遮罩 / 发灰"就是它 + 上一层的叠加效果。
3. **颗粒层的不透明度是乘出来的**：旧 `grainLayerOpacity()` 把预设强度 `0.52` 乘 2.2 再
   `clamp01` 到 `1.0`，靠 v1.8.1 的 `[0.12, 0.22]` 夹紧兜底 —— 关掉颗粒整幅画面立刻"干净"，
   正是因为颗粒层同时是第二层灰罩。

**新实现**：

| 删除的东西 | 原来的参数 | 删除理由 |
| --- | --- | --- |
| `micro-soft-focus` 层 | `blurRadius: 1.2`、`opacity: 0.16`、offset 0.5 | 用户红线 3：不许叠模糊副本 |
| `fade` 层 | `lighten`、`#545A61`、`opacity ≤ 0.13` | 用户红线 4：全画幅灰罩，压对比度 |
| `dust` 纹理层（`assets/textures/dust.png` 平铺） | `screen`、随机撒点 | 太密、随机，换成成片上 1~2 颗"白尘 specks" |

`planFilmLooks(preset, 'live')`（取景器实时预览）现在**同时滤掉 `kind:'photo'` 与
`textureId === 'grain'` 的层** —— 取景器里一格颗粒都不画，只有成片合成阶段才上颗粒。
`dust.png` 资源本身保留（没删文件），只是不再作为图层渲染。

**颗粒 5 档改成绝对不透明度**（`src/constants/grain.ts`）：

| 档位 | id | code | opacity（绝对值，写死） |
| --- | --- | --- | --- |
| 關 | `off` | `OFF` | 0 |
| 輕 | `light` | `LT` | 0.022 |
| 標準 | `std` | `STD` | 0.045 |
| 重 | `heavy` | `HV` | 0.075 |
| 極重 | `max` | `MAX` | 0.110 |

- `GRAIN_OPACITY_MAX = 0.11` 是唯一硬顶：`grainLayerOpacity(s) = round(min(clamp01(s), 0.11), 3)`，
  0 直接返回 0。v1.8.1 那套 `[0.12, 0.22]` 夹紧连同 `GRAIN_OPACITY_MIN` 一起删了。
- `applyGrainLevel(preset, opacity)` 从"乘预设原值"改成**绝对覆盖** `{...preset, grain: clamp01(opacity)}`，
  三处调用点（`CameraScreen.tsx`、`GalleryScreen.tsx`、`importPhoto.ts`）的字段名从
  `grainLevelAt(...).scale` 改为 `.opacity`。
- **白尘 specks 只在最重两档**：`dustSpecCountForGrain(grain)` → `0 / 0 / 0 / 1 / 2`（OFF/LT/STD/HV/MAX）；
  `dustSpecAlpha(i) = min(0.18, 0.1 + 0.08 * i)` ⇒ 0.10 / 0.18（硬顶 `DUST_SPEC_ALPHA_MAX = 0.18`）；
  位置 x/y ∈ [0.14, 0.86]，半径 = 0.0022~0.005 × 短边（同心三层圆，`FilmLookLayers.tsx` 的 `planDustSpecks`）。
- 数据字段 `FilmPreset.dust` / `FilmPreset.color.fade` **保留不删**（预设数据与旧存档还在），
  只是不再参与渲染。

### 36.4 模块四 D1：实色卡纸 + 暗黑相机壳

**D1① 相框：从"多色块拼渐变"改成"4 块实色卡纸 + 4 条 1px 压痕线"**

旧 `FrameSkin.tsx`（674 行）用循环把相纸边带切成多段色带、叠 emboss/shade/cut/bloom 去模拟渐变和
做旧纹理，导出图上下边带能看到 5~6 道百叶窗横纹。新实现（312 行）把皮肤收敛成一个纯函数
`buildSkinElements(material, width, height, window)`，**每帧恒 8 个元素**：

| # | key | kind | 颜色 | 几何 |
| --- | --- | --- | --- | --- |
| 1 | `base:top` | tint | `material.base` | 纸宽 × `window.top` 高 |
| 2 | `base:bottom` | tint | `material.base` | 纸宽 × (纸高 − 窗口底) |
| 3 | `base:left` | tint | `material.base` | `window.left` 宽 × 窗口高 |
| 4 | `base:right` | tint | `material.base` | (纸宽 − 窗口右) 宽 × 窗口高 |
| 5 | `border:top` | border | `material.borderColor` | 窗口左 −1、上 −1，宽 +2，高 1 |
| 6 | `border:bottom` | border | 同上 | 窗口底边，宽 +2，高 1 |
| 7 | `border:left` | border | 同上 | 窗口左 −1，宽 1，窗口高 |
| 8 | `border:right` | border | 同上 | 窗口右边，宽 1，窗口高 |

- 8 个元素 `opacity` 恒 1（alpha 写进颜色的 rgba）、无 `blendMode`、无随机数、无渐变；
  每块都过 `isUsableBox`（正面积 / 在纸内 / 与窗口相交面积为 0）再 `clampToPaper`。
- 数量与材质/画幅/朝向/缩放无关，**只由几何决定**：341.333² 相纸 × 9 个实际窗口 × 3 材质实测
  8/8/8；缩到 85.333² 仍 8/8/8；`fullBleed`（窗口 = 整张纸）三材质 **0/0/0**（`fullBleed` 下
  `FilmCompositor.tsx:660` 与 `FramePreviewLayer.tsx:253` 直接不渲染皮肤）。
- **防百叶窗的最硬断言**：每款材质、任意尺寸下，所有 tint 元素颜色去重后 = 1、所有 border 元素颜色去重后 = 1。
- 三款材质（`src/constants/frameVariants.ts`，`FrameMaterialSpec`）：

| id | 中文 | base | borderColor（1px 内窗压痕线） |
| --- | --- | --- | --- |
| `archival` | 經典 | `#F6F5F0` | `rgba(0, 0, 0, 0.12)` |
| `baryta` | 復古 | `#EDE3CE` | `rgba(80, 60, 40, 0.18)` |
| `obsidian` | 暗房 | `#141416` | `rgba(255, 255, 255, 0.14)` |

  旧字段 `gradientTop`/`gradientBottom`/`gradientSteps`/`emboss`/`shade`/`cut`/`bloom` 与
  `MaterialInk`/`MaterialBloom`/`MaterialLine`/`MaterialCut` 类型全删；旧色
  `#F7F6F1`/`#E9DCBF`/`#F2E9D5`/`#DFCEAE`/`#1A1A1D`/`#1E1E22`/`#151517` 全仓 0 命中。
- `FilmDrawer` 的材质芯片直接取 `spec.base` + `spec.borderColor`；`FramePreviewLayer`/`FrameSwitcher`
  本轮 0 改动（调用点本来就对）。

**D1② 相机壳：系统浅色也不许变米白**

根因：`useTheme()` 在系统浅色时返回 `LIGHT_THEME`，而 `LiquidGlassView` 的浅色分支用
`systemUltraThinMaterialLight` + `rgba(255,255,255,0.52)` 覆盖层 ⇒ 控制台/顶栏变成米白玻璃。

修法不是逐处 `if (dark)`，而是在 `src/constants/theme.ts` 加一层主题作用域：

- `const ThemeScopeOverride = createContext<Theme | null>(null)`；`<ThemeScope value={DARK_THEME}>…</ThemeScope>`；
  `useTheme()` 改成 `context ?? (scheme === 'light' ? LIGHT_THEME : DARK_THEME)`。其余导出签名不变。
- `CameraScreen` 整树用 `<ThemeScope value={DARK_THEME}>` 包住（`:1520`–`:1988`），根 View 背景锁
  `CAMERA_ROOT_BACKGROUND = '#09090C'`（`:212` 常量）。嵌套的 `ToolRow`/`DialButton`/`ViewfinderBar`/
  `LiquidGlassView` 全部自动落到深色玻璃（overlay `rgba(18,18,22,0.42)`）。
- 5 枚圆形功能钮（`ToolRow.tsx`）：底 `DISC_FILL = 'rgba(32, 32, 38, 0.78)'`、
  边框 `DISC_BORDER = 'rgba(255, 255, 255, 0.28)'` + `DISC_BORDER_WIDTH = 1`、图标纯白 `#FFFFFF`、
  激活态琥珀 `FLASH_AMBER = '#E5A93C'`；禁用的 `INACTIVE_FILL`/`INACTIVE_INK` 不变。
  旧的白色 `accentRing` 删了（会盖住琥珀描边），激活态改为"图标变琥珀 + 圆点"。
- `LiquidGlassView` 的浅色分支**保留**（非相机树仍然支持浅色主题），只是相机树里永远走不到；
  另外新增 `borderColor`/`borderWidth` 两个描边 props，描边画在 children 之后。
- 副作用（有意的）：设置页、相册页都渲染在相机树里，所以一起变深色 —— 用户要的就是相机 App
  永远暗房底，这与系统外观设置解耦。

### 36.5 联动但不显眼的五处改动

1. **NaN 静默丢地名（顺带修的真 bug）**：`geometry.ts:955` / `:1319` 的 `glyphStyle` 默认形参
   原本是 `'led_7seg'`（已从 `DATE_DESIGN_PX` 删除）⇒ `DATE_DESIGN_PX[undefined]` 变 `NaN` ⇒
   日期宽度算成 NaN ⇒ 整行地名被静默丢弃。现在默认 `'quartz_led'`，链路已断。
2. **颗粒档数据契约**：`GrainLevel` 类型里 `scale: number` 换成 `opacity: number`（语义变了，
   不是改名 —— 旧值 `scale 0.45~2.2` 与新值 `opacity 0.022~0.11` 不可互换）。
3. **日期基线口径**：`DateStamp` 高度改为 `glyphHeight(style, dateEngineFontPx(style, canvasWidth))`
   与 `FilmCompositor` 的 `boxHeight` 逐点相等；`watermarkTypography.dateFontOf(canvasWidth, glyphStyle)`
   按档位取设计字号。旧探针里"字距与字形档无关"的断言作废。
4. **`FilmCompositor` 的图层注释**：删 `micro-soft-focus`/`fade`/`dust` 后图层序号重排
   （①色温 ②色调 ③分离色调 ④饱和度 ⑤对比度 ⑥曝光 ⑦光晕 ⑧颗粒 ⑨暗角 ⑩漏光），
   `countStageImages` 的"photo 层 3→2"自动跟着变。
5. **`frames.ts` 的 `frameSkinSeedOf`**：皮肤不再有随机花纹，`FrameSkin` 也不再读 `seed`
   （prop 保留只为不动调用契约）；函数本身保留，将来加回花纹时种子仍只在这一处算。

### 36.6 文件改动

`git diff --stat`：**29 files changed, 1985 insertions(+), 2515 deletions(-)**（净 −530 行，删掉的比加上的多）。

| 模块 | 文件 | 改动 |
| --- | --- | --- |
| A1 | `src/components/SettingsScreen.tsx` | 整文件重写，12 栏手风琴（969 → 1345 行） |
| A1 | `src/i18n/locales/{zh-Hant,zh-Hans,ja,fr,en}.ts` | 新增 6 个 `settings.section.*` 键；`led_7seg`/`led_dot_matrix` 换 `quartz_led` |
| B1 | `src/components/DateGlyphs.tsx` | 整文件重写：逐格几何 → `OpticalDateText` 三层发光（1047 → 222 行） |
| B1 | `src/components/DateStamp.tsx` | 新路径改走 `OpticalDateText`，高度公式对齐 |
| B1 | `src/constants/dateEngine.ts` | 新增 `DATE_GLYPH_STYLES`（四档字重/字距/光强） |
| B1 | `src/constants/canvasBase.ts` | `DATE_DESIGN_PX` 四键（删 `led_7seg`/`led_dot_matrix`） |
| B1 | `src/types/index.ts` | `DateGlyphStyleId` 四值；`GrainLevel.scale` → `.opacity` |
| B1 | `src/utils/settingsStore.ts` | 旧字形 id 迁移表 + 白名单 |
| B1 | `src/utils/geometry.ts` | 默认 `quartz_led`；字距 × `trackingScale`；NaN bug 修复 |
| B1 | `src/utils/watermarkTypography.ts` | `dateFontOf(canvasWidth, glyphStyle)` 按档取字号 |
| C1 | `src/utils/gradeLayers.ts` | 删 soft-focus / fade / dust 三处图层；live 滤掉颗粒 |
| C1 | `src/constants/grain.ts` | 5 档绝对 opacity + 硬顶 0.11；`applyGrainLevel` 绝对覆盖；白尘配额 |
| C1 | `src/components/FilmLookLayers.tsx` | `planDustSpecks` 改用它俩（0/0/0/1/2 颗） |
| C1 | `src/components/CameraScreen.tsx` / `GalleryScreen.tsx` / `src/utils/importPhoto.ts` | `.scale` → `.opacity` 三处调用点 |
| D1 | `src/components/FrameSkin.tsx` | 整文件重写：多色块渐变 → 8 元素实色带（674 → 312 行） |
| D1 | `src/constants/frameVariants.ts` | 三款材质实色 + 1px 框线（254 → 128 行） |
| D1 | `src/constants/theme.ts` | `ThemeScope` context + `useTheme()` override |
| D1 | `src/components/CameraScreen.tsx` | 整树 `ThemeScope(DARK_THEME)` + 根背景 `#09090C` |
| D1 | `src/components/ToolRow.tsx` | 圆钮暗底/白描边/琥珀激活（654 → 572 行） |
| D1 | `src/components/LiquidGlassView.tsx` | 新增 `borderColor`/`borderWidth` props |
| D1 | `src/components/FilmDrawer.tsx` | 材质芯片取 `spec.base`/`spec.borderColor` |
| 杂 | `src/components/FilmCompositor.tsx` / `src/constants/frames.ts` | 注释修正（图层语义、seed 语义） |
| 版本 | `app.json` | `version: 1.8.3` |

### 36.7 验证清单（本地实测，全部真实跑过）

> 全部为冻结树（本地提交 `e0e006d`）上的独立实跑；11 道串行门禁总耗时 5065ms。
> 探针在本轮按新契约重写过（A1/B1/C1/D1 都是行为级重写，不是删断言），
> 每道门禁的"断言条数变化"与理由见 `_gate_v183_report.txt` §五。

| 门禁 | 结果 | v1.8.2 基线 |
| --- | --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | **EXIT=0**（全仓 0 诊断） | 0 |
| `_probe_date_engine.cjs` | **3810 条 / 0 失败**（B1：四档算术 + 5 glow × 4 style × 3 字号三层配方 + 旧几何 30 导出缺席） | 1818 |
| `_probe_film_look.cjs` | **1656 条 / 0 失败**（C1：颗粒 5 档绝对值 0/0.022/0.045/0.075/0.11 + 0.11 硬顶 + 白尘 0/0/0/1/2 + 三层删除证据 + §⑨ 频带门） | 1201 |
| `_probe_geo_lock.cjs` | **16207 条 / 0 失败**（四机位/白边/上下限全绿；④ 段期望已乘 `trackingScale`） | 19336 |
| `_probe_noframe_v181.cjs` | **455 条 / 0 失败**（A8–A24 按 B1 重写） | 217 |
| `_probe_noframe_watermark.cjs` | **458 条 / 0 失败** | 458 |
| `_probe_skin_material.cjs` | **879 条 / 0 失败**（D1：恒 8 元素逐 key/kind/顺序、三材质、fullBleed 0、旧色缺席） | 859 |
| `_probe_v180_seams.mjs` | **1339 条 / 0 失败**（C 段元素数 12/80/60 → 恒 8；D 段四档字形） | 1312 |
| `_probe_lead_integration.mjs` | **315 条 / 0 失败**（新增 G 段 A1 手风琴、H 段暗黑锁定） | 133 |
| `_probe_capture_quality.mjs` | **78 条 / 0 失败** | 78 |
| `_haze_audit.mjs` | **超预算预设 0 / 10**，`RESULT: OK` | 0/10 |
| `_purity_audit.mjs` | **59 断言 / 0 失败**，`RESULT: PURE` | 59 |
| `npx expo export --platform ios --no-bytecode` | **EXIT=0**（bundle `index-53a7ba4cba5e97274d57856a1ec5b03d.js`，1,332,811 B；18 张 PNG 资产） | — |

**grain 频带门"旧红新绿"负控制**（`_plate_stats.py` / 探针 §⑨ / 独立 FFT 三方同式，见 §35）：

| 贴图 | `<8px` | `8–24px` | `24–64px` | `64–160px` | `>160px` | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| 当前 `grain.png`（`2d30d077…`，249,201 B） | 65.66% | 28.54% | 4.96% | 0.70% | 0.14% | **全过** |
| 旧 v1.8.1 贴图（`381acc56…`，211,111 B） | 25.84% | 55.01% | 16.24% | 2.38% | 0.54% | **4 条越界** |

门线：`<8px ≥ 0.60`、`8–24px ≤ 0.35`、`24–64px ≤ 0.06`、`64–160px ≤ 0.02`。
负控制断言已固化进探针：同一段测量喂旧贴图必红、喂新贴图必绿，门不是恒真。

### 36.8 已知缺口

- **没有真机验证**：本机跑不了 iOS 模拟器/真机。A1 的 54pt 一屏算术是按 iPhone 13 可用高度估的，
  iPhone SE / Pro Max 上会多出或差一点；B1 的 `Menlo-Bold` 在真机上的实际字宽/字距只能在真机看。
- **相机预览层还是旧日期路径**：`FramePreviewLayer.tsx` 的两处 `DateStamp` 不传 `dateEngine`，
  取景器/画框预览里的日期走默认档（`quartz_led` + `classic_amber`），不跟用户在设置里选的
  格式/颜色/机位同步 —— 成片是对的（`FilmCompositor` 传了），只有预览不同步。未在本版修。
- **发光色是派生值而非规范字面值**：见 §36.2 的偏离说明；如果哪天要"规范字面色"，
  得改成第三张表而不是从 palette 派生。
- **`dust.png` 成了未使用的资源**：文件还在 `assets/textures/`（会进包，5.4KB），
  只是不再渲染；删掉要动 `constants/textures.ts` 的纹理目录契约，收益太小，留着。
- **门禁只覆盖结构与数值契约**，不模拟 GPU 合成器，也不出真机截图 —— "三层发光在真实屏幕上
  够不够亮/会不会糊"仍然只能靠人眼。

### 36.9 产物指纹（全部为本次实测值）

| 项目 | 实测值 |
| --- | --- |
| 本地提交 | `e0e006d`（30 files changed, +2301 / −2515） |
| 推送 | 远端 `master` = `522d65d1accb512b6d1c924bb2cc2857b0869ea7`，tree `004aef22da6c900ab0e71220475ec679fee16c99`，`TREE MATCH = True` |
| CI | run `39016560029`（job `117349768614`，`build-ipa`），**CONCLUSION = success** |
| artifact | `12095162792`（`FretroCam-unsigned-ipa`，10,381,357 B，zip 内 1 个 `.ipa`） |
| IPA | `FretroCam-v1.8.3-unsigned.ipa`，**10,495,729 B**，sha256 `e209fa062266e7acee1d6e8a7519fe034368625a71c65dcf55b08ca5d2681d53`（115 entries，jsbundle `main.jsbundle` 2,031,633 B） |
| 核验（CI 产物） | `python _verify_ipa_v183.py 12095162792` → 7 段全过：PRESENT（A1/B1/C1/D1 新符号与色值）、ABSENT（旧 7seg/点阵/柔焦/渐变/旧纸色/旧 i18n 键全为 0）、grain 贴图 249,201 B + sha256 `2d30d077…` + 频带 `<8=65.7% / 24–64=5.0%`、19 个非 frame 素材与 10 张 frame、`Info.plist` 版本 `1.8.3`；**`RESULT: OK`**。本地导包 `--local` 亦 `RESULT(local): OK` |
| Release | tag `v1.8.3`，id `415677030`，asset id `649969775`（远端 size/digest 与本地双匹配） |
| 打包前 export 冒烟 | `npx expo export --platform ios --no-bytecode` **EXIT=0**，bundle `index-53a7ba4cba5e97274d57856a1ec5b03d.js` 1,332,811 B，18 张 PNG 资产全含 |
| 下载 | `https://github.com/lizimo20041023-oss/retro-film-cam/releases/download/v1.8.3/FretroCam-v1.8.3-unsigned.ipa` |

---

## 37. v1.8.4：真机焦段归位（取景盒重几何 / 四档焦段 / 最高分辨率 / 取景器去雾）

这一版只做一件事：**把相机底层拍对**。用户（m02103）真机对着系统相机逐档比：
13mm（0.5×）的视野和系统 1× 一模一样，26mm（1×）被数码放大了两倍多、画质发糊；
取景器还有一层去不掉的雾。四条红线照旧：严禁省略代码 / 严禁多色块拼渐变 /
严禁原图上叠 `blurRadius` 模糊副本 / 100% 原生锐度。

### 37.1 真因链：一张照片被裁了两次，取景器也被裁了一次

不是变焦公式写错，是**预览层和成片共用的那张 4:3 传感器画幅被裁掉了一多半**。

1. **expo-camera 的成片永远被裁成预览层宽高比**。
   `node_modules/expo-camera/ios/Current/CameraPhotoCapture.swift:187-190`：
   ```swift
   let cropRect = CGRect(x: 0, y: 0, width: takenCgImage.width, height: takenCgImage.height)
   let croppedSize = AVMakeRect(aspectRatio: previewSize, insideRect: cropRect)
   takenImage = ExpoCameraUtils.crop(image: takenImage, to: croppedSize)
   ```
   `previewSize` 来自 `currentPreviewSize()`（同文件 `:159-167`，就是
   `previewLayer.frame.size`，竖向会交换宽高）。也就是说：**你给 `<CameraView>` 多大、
   什么比例，它拍出来的照片就被裁成那个比例。**
2. **上一版的 `<CameraView>` 铺满整屏**（`styles.fill`，`.resizeAspectFill` ——
   `node_modules/expo-camera/ios/Current/CameraView.swift:248-250`
   `previewLayer.videoGravity = .resizeAspectFill`）。以 iPhone 13 的 393×852pt 取景区为例：
   预览区宽高比 0.461，传感器竖拍宽高比 0.75，`.resizeAspectFill` 横向只保留
   `0.461 / 0.75 = 61.5%` 的传感器宽度 ⇒ **预览先被数码放大 1.63×**。
3. **相框窗口再裁一刀**。1:1 窗口（341pt）在 393pt 宽的预览里占 86.8%，于是窗口里
   实际只有 `0.615 × 0.868 = 53.4%` 的传感器宽度 ⇒ **合计放大约 1.87×**。
   - 0.5× 档：13mm × 1.87 ≈ **24mm**，和系统 26mm 的 1× 几乎重合 —— 用户看到的就是这个。
   - 1× 档：26mm × 1.87 ≈ **49mm**，看起来就是「被数码放大了两倍多」。
4. **成片分辨率同步崩**：3024×4032 的原图先按 0.461 比例裁成约 **1859×4032**，
   再按 1:1 窗口裁成 1859×1859（5.4MP，只剩传感器 12.2MP 的 44%）；随后
   `processFilmPhoto` 的「源图更小就夹回源长边」逻辑把 極致 4032px 的目标夹到 1859px
   —— 这就是「画质严重劣化」的第二个来源。

结论：**只要相机视图的宽高比不等于传感器宽高比，取景器、成片、分辨率三件事会一起坏。**
所以修法的第一刀不是调 zoom，而是给相机一个「宽高比恒为 4:3 的盒子」。

### 37.2 修法一：`cameraBox` 取景盒（`src/utils/cameraGeometry.ts`，新增）

盒子（`box`）宽高比恒为传感器比例 `SENSOR_ASPECT = 3 / 4`、居中于取景窗（`clip`），
并且只在窗口里露出一块（`visibleFraction`）：

| 窗口比例 | 盒子尺寸（窗口 = 341×H） | 偏移（相对窗口） | 窗口占传感器 |
| --- | --- | --- | --- |
| 1:1（341×341） | 341 × 454.67 | y = −56.83 | (1, 0.75) |
| 3:4（341×454.67） | 341 × 454.67 | (0, 0) | (1, 1) |
| 3:2（341×227.33） | 341 × 454.67 | y = −113.67 | (1, 0.5) |
| 1:1 + digitalFactor 2 | 682 × 909.33 | y = −284.17 | (0.5, 0.375) |

- **成片一侧的裁切变成恒等**：盒子宽高比 == 传感器宽高比 ⇒ `.resizeAspectFill` 不裁、
  expo 的 `AVMakeRect` 裁切也不裁 ⇒ `takePictureAsync` 返回 **3024×4032 全幅**。
- **取景器里窗口看到的就是传感器上的最大内接裁切**，和成片按窗口裁出来的区域逐点一致
  （同一套 `planCameraLayer` / `planPhotoCrop` 几何，WYSIWYG 是结构性的，不是靠调参数）。
- `digitalFactor > 1` 时盒子等比放大、仍居中 ⇒ 窗口露出的传感器范围缩小为 `1 / digitalFactor`
  —— 这就是 35mm / 52mm 两档的**确定性数码裁切**（不使用 expo 的原生 zoom）。

> 为什么不做「在整屏预览上盖一个窗口」：`CURTAIN_COLOR` 虽然不透明，但预览层本身仍会把
> 传感器裁成整屏比例，expo 也会把成片裁成整屏比例 —— 裁切发生在原生层，JS 侧遮不住。

### 37.3 修法二：四档焦段 13 / 26 / 35 / 52，原生 `zoom` 恒 0

`src/constants/lenses.ts` 的 `ZOOM_STOPS` 从五档改成四档，`ZoomStop` 增加 `digitalFactor`：

| 档位 | 等效焦距 | 倍率 | 镜头 | 数码因子 | 原生 zoom |
| --- | --- | --- | --- | --- | --- |
| `ultra13` | 13mm | 0.5× | `ultraWide` | 1 | **0** |
| `wide26` | 26mm | 1× | `wide` | 1 | **0** |
| `wide35` | 35mm | 35/26 ≈ 1.346× | `wide` | 35/26 | **0** |
| `wide52` | 52mm | 2× | `wide` | 2 | **0** |

- 13mm / 26mm 档**一律不写任何大于 0 的 `zoom`**：`selectedLens` 直接切到超广角/主摄物理镜头，
  原生 `zoom = 0` 就是该镜头的原生视场。
- **35mm / 52mm 档不再用 `zoom` 去做**。expo-camera 的 `zoom` 是指数映射：
  `node_modules/expo-camera/ios/Current/CameraSessionManager.swift:392`
  `device.videoZoomFactor = minZoom * pow(device.activeFormat.videoMaxZoomFactor / minZoom, delegate.zoom)`，
  而这个 `videoMaxZoomFactor`（公式里的 M）**JS 侧完全不可读**（物理镜头约 16、虚拟多摄 >100）。
  在这个模型下，用户给的 `0.018` 在 M=16 时只有 `16^0.018 = 1.05×`、`0.045` 只有 `1.13×`，
  **远达不到 1.4× / 2×**；若按 `0.12136` / `0.25` 去设（v1.8.3 的做法），换到 M 不同的机型上
  又会偏。所以 v1.8.4 改成**布局裁切**：盒子放大到 `1.346×` / `2×`，成片按同一因子中心裁切
  —— 与设备无关、与 M 无关，读数、取景、成片三处必然一致。
- **偏离说明（用户原始要求）**：用户希望「有 telephotoLens 就切长焦」。本版**没有**把长焦接到
  52mm 档：App 对长焦的原生焦距假定是 `ASSUMED_LENS_NATIVE_MM.telephoto = 77mm`，真机 Pro 系列
  是 77/120mm，接上去 2× 档会变成 3×/4.6× 视野、与档位标签 52mm 直接矛盾。**长焦光学没有丢**：
  刻度尺（`ParameterScrubBar`）连续行程仍会切到 `telephoto` 镜头 + 原生 `zoom = 0`（v1.8.3 能力保留）。
- 捏合变焦（`usePinchZoom`）与刻度尺的**连续**行程仍走原生 `zoom`（它们本来就是对当前镜头做
  相对放大，且是唯一需要连续读数的入口）；这两条入口会同时把 `digitalFactor` 复位为 1。
  刻度尺在「有长焦」时会额外追加一段 77mm 长焦行程（`buildFocalOptions`，切 `telephoto` 镜头 +
  原生 `zoom = 0`）——这是 v1.8.3 的能力，不属于四档按钮。
- 35mm 档的按钮读数显示 `1.35×`（`formatMultiplier` 两位小数；`35/26 = 1.346…` 四舍五入）。
  四档的倍率标签与 `digitalFactor` 刻意取同一个数，免得「标签写 1.35×、画面按 2× 裁」。
- `resolveStop()` 的可用性语义：**空镜头列表（`lenses.length === 0`）时四档一律
  `available: false`（保守）**；「列表还没回来」与「设备真没有」由调用方用 `lensesKnown`
  区分，`CameraScreen` 在 `!lensesKnown` 时自己按「够得到」放行，所以第一帧不会闪灰。
  列表已知但镜头名字认不出（`unknown`）时，wide 系四档里 26/35/52 **仍然可用**
  （`lens: undefined` 交给原生回落默认主摄——35/52 是布局裁切，不需要镜头名字）；
  只有超广角/长焦认不出时才变灰（不回落主摄当假 0.5× / 假长焦）。

### 37.4 修法三：`pictureSize` 与 `autofocus` 的真实 API 语义

- **iOS 的 `pictureSize` 不是像素尺寸**。`node_modules/expo-camera/ios/Current/CameraRecordingOptions.swift:56-88`
  的 `enum PictureSize: String` 只有 9 个值：`"3840x2160" / "1920x1080" / "1280x720" / "640x480" /
  "352x288" / "Photo" / "High" / "Medium" / "Low"`，`toCapturePreset()` 把它们映射成
  `AVCaptureSession.Preset`（`.hd4K3840x2160` … `.photo` / `.high` …）。
  `getAvailablePictureSizesAsync()`（`CameraViewModule.swift:268-270`）返回的就是这 9 个**枚举字符串**，
  不是 `4032x3024`。用户要求的 「`4032x3024` / `8064x6048`」**无法喂给这个 prop**。
  本版按用户意图落地为：`onCameraReady` / `selectedLens` / `facing` / `cameraKey` 变化后拉一次
  `getAvailablePictureSizesAsync()`，**优先 `'Photo'`（照片最大预设），否则按 `WxH` 面积降序取最大**，
  显式传给 `<CameraView pictureSize={...}>`；真实像素尺寸由 `photoOutput` 的 active format 与
  `photoSettings.maxPhotoDimensions` 决定（`CameraPhotoCapture.swift:92-94`，expo 已把它设成设备最大）。
- **`autofocus` 的 `'on'` 不是「连续对焦」**。`node_modules/expo-camera/ios/Current/CameraEnums.swift:45-50`：
  `'on' → .autoFocus`（**对焦一次后锁定**）、`'off' → .continuousAutoFocus`（连续自动对焦）。
  用户原话是「加 `autofocus="on"`，并在切换焦段时先 off 50ms 再切回 on 强制重锁」——按本库语义，
  那样会把相机长期锁死在一次对焦上（近摄必糊）。本版的落地是：**常态 `autofocus="off"`（连续 AF），
  每次切档脉冲 `'on'` 50ms 再回 `'off'`**，既满足「切档强制重新对焦」的意图，又不牺牲连续对焦。
  常量 `FOCUS_PULSE_MS = 50`。
- 聚焦点换算：`cameraFocusProps.focusPoint` 现在经 `focusPointInCamera()` 从「预览容器 0~1」
  换算到「相机盒 0~1」，盒子被窗口裁过、还有负偏移，不能再用预览比例直接当相机比例。

### 37.5 修法四：取景器去雾（`src/utils/gradeLayers.ts` 的 `planFilmLooks('live')`）

- 取景器继续滤掉 `kind:'photo'`（自叠/泛光）与颗粒纹理层；**再滤掉一切降对比的中性层**
  （desaturate / saturate / contrast 这类以 `NEUTRAL_GRAY` / `SATURATE_ACCENT` 为载体、
  用 saturation / soft-light 混合的层）。取景器里绝不允许出现灰白色纱。
- 剩下的色彩/色温层 opacity 统一乘 `LIVE_LOOK_OPACITY_SCALE = 0.4`（= 降 60%），并硬夹到
  `[LIVE_LOOK_OPACITY_MIN = 0.04, LIVE_LOOK_OPACITY_MAX = 0.08]`；导出 `liveLookOpacity()` 纯函数，
  探针直接断言这个区间。
- 暗角 / 漏光层保留原 opacity（它们是边缘质感，不是纱）；**成片路径完全不动** —— 胶片调依旧
  只在成片里发生，取景器回到接近原生相机的通透度。
- 为什么不是「再盖一层提亮/对比层」：任何额外合成层都会继续糊字、糊细节，用户要的是
  「文字边缘和细节跟原生相机一样锐利、黑白分明」，唯一正确的做法是**减层**，不是补层。

### 37.6 修法五：1:1 导出与 JPEG 0.98

- 尺寸规划沿用 `captureOptions.planCapture` 的真实口径：`captureRef` 的 `width/height` 单位是**点**，
  `planCapture` 把目标像素除以 `PixelRatio.get()` 得到点值（= 用户要求的 `targetPx / PixelRatio.get()`），
  iOS `UIGraphicsImageRendererFormat.scale = 0` 会把整棵合成树按真像素重绘，照片重采样、文字矢量、
  相框 PNG 重采样，**不丢像素**。
- JPEG `quality` 从 0.95 提到 **0.98**（`captureOptions.ts` 的 `JPEG_QUALITY`）；源图更小时仍按
  「夹回源长边、不凭空插值」处理（这条逻辑没动）。
- 合成器的成片 `<Image>` 直接消费裁好的**全尺寸原图 URI**，不存在二次 resize/降采样。
- 分辨率上限的物理事实（写清楚避免误期待）：1:1 窗口从 4:3 传感器里裁的是「全宽正方形」，
  短边 = 传感器短边 3024px ⇒ 極致 4032px 的目标会被夹到 **3024px**（成片仍是 9.1MP 真像素）。
  要更高只能换设备/换画幅比例，靠插值放大违背 100% 原生锐度红线。

### 37.7 验证清单（本地实测）

冻结树（12 个改动文件 + 新增 `src/utils/cameraGeometry.ts`）实测，全部 EXIT=0：

| 门禁 | 断言 / 失败 | 耗时 |
| --- | --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | 0 诊断（输出 0 字节） | 2311ms |
| `_probe_date_engine.cjs` | 3810 / 0 | 300ms |
| `_probe_film_look.cjs` | 1676 / 0 | 584ms |
| `_probe_geo_lock.cjs` | 16207 / 0 | 464ms |
| `_probe_noframe_v181.cjs` | 455 / 0 | 347ms |
| `_probe_noframe_watermark.cjs` | 458 / 0 | 312ms |
| `_probe_skin_material.cjs` | 879 / 0 | 444ms |
| `_probe_v180_seams.mjs` | 1349 / 0 | 367ms |
| `_probe_lead_integration.mjs` | 315 / 0 | 351ms |
| `_probe_capture_quality.mjs` | 78 / 0 | 422ms |
| `_haze_audit.mjs` | 超预算 0 / 10（= 整幅加白层一个都不在） | 281ms |
| `_purity_audit.mjs` | 59 / 0 PURE | 77ms |
| `_probe_v184_camera.cjs`（新增） | 979 / 0 | 301ms |

- 12 道探针合计 4263ms；与 v1.8.3 终版对照，只有 `_probe_film_look.cjs`（1656 → 1676）与
  `_probe_v180_seams.mjs`（1339 → 1349）数字变化，其余 9 道断言数一字未动。
- 旧探针修复口径（**只加语义断言，没放宽**）：`film_look` 的 `countStageImages` 改成绝对项
  `2 + textureLive + grainCount + photoCount`、live = composite 差值加 `neutralCount`；
  `seams` 的 G 段「必须包含」集合豁免中性灰层，并新增「live 零中性灰层」反向断言（10 preset 各 +1）。
- `npx expo export --platform ios --no-bytecode` → EXIT=0，6139ms；bundle
  `dist/_expo/static/js/ios/index-1a56d2de705876f48e93ab5416f1b5c0.js` **1,336,677 B**；
  dist 合计 20 文件 / 2,852,532 B（2.72MB），颗粒/漏光/尘埃/暗角贴图全部进包。
- `_probe_v184_camera.cjs` 用三种独立手段覆盖契约 §7①~⑥：真模块加载（tsc 转译后 require）+
  探针内手抄等价算法逐位对拍（`planCameraLayer` / `planPhotoCrop` / `focusPointInCamera`）+
  剥注释源码文本断言（`cameraClip` 接线、`pictureSize`、50ms AF 脉冲）；其中「裁切后可见区
  比例 == 取景器可见比例」正是 live 与成片一致性的数学证明。

### 37.8 已知缺口

- **仍然没有真机/模拟器验证**：本机跑不了 iOS 真机。所有结论来自 expo-camera 57.0.6 源码级契约 +
  几何推导 + 零依赖探针；真机上的观感（尤其 35/52 档裁切后的锐度、f/1.78 主摄近摄的 AF 脉冲）
  建议装上去目视确认一次。
- **4:3 假设**：`SENSOR_ASPECT = 3/4` 是按 expo-camera 拍照默认输出（`.photo` 预设 4:3）写死的。
  如果哪天 iOS 设备/预设改成 16:9 输出，取景盒与成片的对应关系会偏，需要同步改这个常量。
- **52mm 档与用户原始要求有偏差**：见 §37.3（长焦 77/120mm 不接 52mm 档；长焦光学从刻度尺可达）。
- **数码档的分辨率损失是物理的**：35mm 档裁后 2246×2246、52mm 档 1512×1512，再按画质档放大到目标
  长边；这是「主摄数码变焦」的固有代价，不引入插值糊图（`planCapture` 的夹回逻辑会如实反映）。
- **取景器与成片的色彩仍不是逐像素相同**：取景器是「远景调的减配版」，成片才是完整胶片调，
  两者一致性靠 `buildGradeLayers` 同源 + live 层过滤保证，不是同一张图。

### 37.9 产物指纹（全部为本次实测值）

| 项目 | 实测值 |
| --- | --- |
| 本地提交 | `1b09d6b`（13 files changed, +1089 / −250，含新增 `src/utils/cameraGeometry.ts`） |
| 推送 | 远端 `master` = `ae84743d3aa3231e5657e35125e107a7460128ac`，tree `00b365301e1197de5dbc22c9838045707d1062d7`，131 blobs，`TREE MATCH = True` |
| CI | run `39021455715`（job `117363934615`，`build-ipa`），**CONCLUSION = success** |
| artifact | `12097396157`（`FretroCam-unsigned-ipa`，10,384,207 B，zip 内 1 个 `.ipa`） |
| IPA | `FretroCam-v1.8.4-unsigned.ipa`，**10,498,948 B**，sha256 `a1bce74a82f3c3f37f1c3496e0af13ee4a870a6a2b161973cff52955849509f1`（115 entries，jsbundle `main.jsbundle` 2,038,900 B） |
| 核验（CI 产物） | `python _verify_ipa_v184.py 12097396157` → 全段通过：PRESENT（`planCameraLayer`/`planPhotoCrop`/`focusPointInCamera`/`clampDigitalFactor`、四档 id `ultra13`/`wide26`/`wide35`/`wide52`、`pictureSize`/`autofocus`/`getAvailablePictureSizesAsync`/`cameraClip` 全在）、ABSENT（旧五档 id `ultraWide05`/`wide20`、旧 7seg/点阵/柔焦/渐变/旧纸色/旧 i18n 键全为 0）、grain 贴图 249,201 B + sha256 `2d30d077…` + 频带 `<8=65.7% / 24–64=5.0%`、10 张 frame 与 19 个非 frame 素材、`Info.plist` 版本 `1.8.4`；**`RESULT: OK`**。本地导包 `--local` 亦 `RESULT(local): OK` |
| Release | tag `v1.8.4`，id `415711264`，asset id `650101437`（远端 size/digest 与本地双匹配） |
| 打包前 export 冒烟 | `npx expo export --platform ios --no-bytecode` **EXIT=0**，bundle `index-1a56d2de705876f48e93ab5416f1b5c0.js` 1,336,677 B，dist 20 文件 / 2,852,532 B |
| 下载 | `https://github.com/lizimo20041023-oss/retro-film-cam/releases/download/v1.8.4/FretroCam-v1.8.4-unsigned.ipa` |

### 37.10 文件改动

| 文件 | 改动 |
| --- | --- |
| `src/utils/cameraGeometry.ts` | **新增**：`SENSOR_ASPECT`、`planCameraLayer()`、`planPhotoCrop()`、`focusPointInCamera()`、`clampDigitalFactor()` 纯函数（取景盒与成片裁切的唯一几何来源） |
| `src/constants/lenses.ts` | `ZoomStop` 增加 `digitalFactor` / `focalMm`；`ZOOM_STOPS` 五档→四档（13/26/35/52，zoom 全 0）；`TELEPHOTO_FOCAL_STOP`（77mm，只给刻度尺）；`resolveStop()` 返回数码因子，wide 系恒可用 |
| `src/components/CameraScreen.tsx` | 相机视图装进 `cameraClip`（窗口几何 + `overflow:'hidden'`）；新增 `pictureSize` / `autofocus` prop、`digitalFactor` state、图片尺寸枚举拉取、AF 50ms 脉冲、翻面补拉镜头列表、对焦坐标重算、快门传 `digitalFactor`；`focalMm` 计入数码因子 |
| `src/components/ParameterScrubBar.tsx` / `ViewfinderBar.tsx` | 四档表适配（默认档 `wide26`、按相邻中点就近取档、刻度尺保留 77mm 长焦光学行程）；35 档读数 `1.35×` |
| `src/utils/processFilmPhoto.ts` | 新增 `digitalFactor` 入参；`centerCropPhoto` 改用 `planPhotoCrop()` 一次裁出（live/成片同一几何模型）；中间 JPEG 0.98 |
| `src/utils/captureOptions.ts` / `src/utils/normalizePhoto.ts` | `JPEG_QUALITY` 0.95 → 0.98（归一化 / 裁切 / 成片截图三处统一） |
| `src/hooks/useFilmStage.ts` / `src/components/FilmCompositor.tsx` | 核对 1:1 导出链路（ViewShot 5.1.0 的 `capture()` 读 `<ViewShot options>`；全尺寸原图直读，无二次降采样），补注释 |
| `src/utils/gradeLayers.ts` | `planFilmLooks('live')` 去雾：滤中性层 + 色彩层 ×0.4 且夹 [0.04, 0.08]；成片路径不动 |
| `app.json` | version `1.8.3` → `1.8.4` |
| `README.md` | 本节 §37 + TOC |

---

## 38. v1.8.5：Dazz #Inst C 立体相纸（内窗黑边根治 / 9 款传奇胶卷 / 135 NEG 齿孔与地名 / 纯净化地名多语言）

> 一句话：v1.8.4 把"拍到的画面"钉准了，v1.8.5 把**纸**做成了一件东西 ——
> 内窗不再漏黑边、相纸有圆角/压边/压痕的实体感、135 NEG 的齿孔与帧号重新画、
> 胶卷换成 9 款按真实传奇代号命名的基调、水印在窄留白里不再丢地名、地名按语言纯净输出。
>
> 五个模块（用户 m02760）：M1 相纸结构 3D 纸感 · M2 传奇胶卷 + 真黑白 + 光学暗角 ·
> M3 水印排版（stacked 不丢地名 / 地名语言字体） · M4 地名纯净多语言 · M5 内窗黑边根治 + 导出衬底。

### 38.1 五条投诉 → 五条真因链（先看这张表再看代码）

| 模块 | 用户看到的病 | 真因（代码层） | 修法 |
| --- | --- | --- | --- |
| M1 | 相纸"像一张贴纸"，没有纸的厚度感；135 NEG 的齿孔/片边丢了 | v1.8.3 的 `FrameSkin` 是 4 条 `opacity:1` 实色带 + 4 条内框线，**整块盖在 PNG 之上**，纸纹/镌刻/孔全被盖死；齿孔是 PNG 里烘死的固定色，暗房纸一上色就穿帮 | 实色带改 `mixBlendMode:'multiply'`（只着色不盖纹理）；删内框线整类；新增 `FrameSpec.skin` 数据 + `buildPaperDetails()` 程序化画圆角/枕形压边/下巴压痕/135 齿孔/帧号 |
| M2 | 画面发灰发雾、黑白卷不黑白、暗角是一块"黑蒙版" | 泛光 = 把原图模糊 8pt 再 screen 叠回（`halation-glow`）+ 暖色偏两层，模糊副本让全场发软；黑白卷只有 saturation 混合，取景器还会滤掉中性层；旧 `vignette.png` 是黑底贴图 | 删 `bloom`/模糊副本，`halation` 改为**单层暖红纯色 screen ≤0.06、全栈零模糊**；`mono:true` 加满幅 `#808080`+`saturation` 层并在 live 例外放行；暗角重烤成 1024² RGBA 光学径向渐变、`normal` 混合 |
| M3 | 窄相框/无相框下"地名+日期两行"里的**地名消失**；日文地名用中文字体 | `stacked` 版式放不下时直接丢行；`place`/`code` 行只用一个全局字体 | 改为**钳制不丢弃**（`maxPlaceBottom/minPlaceBottom`）；新增 `watermarkPlaceFont(locale)` 按地名语言换字体，日期行不换 |
| M4 | 英文界面下地名混中文、中文档里出现 `CHINA` 这种拉丁国名、没有日文档 | 只有 auto/zh-Hans/zh-Hant/en 四档，且 archive/full 没有按**地名语言**分表；国家名靠接口原样透传 | 4 语言 × 2 详情矩阵 + 47 国四语字典；恒 `' · '` 分隔；中/日档禁用拉丁国名；港澳台 full 冠"中国"；新增 ja 档 + `GEO_LOCALES` 持久化 + `localityLanguage()` |
| M5 | 照片与内窗之间有 1~2px 黑线；成片"像浮在桌面上的截图"不是一张卡纸 | 内窗容器矩形带小数 + 位图整像素 + 容器底色 `#000` + 深色内框线，四件事叠出黑缝；成片相纸顶满画布、无衬底/阴影 | 内窗 `Math.round` 四值取整 + 底色=相纸色 + 1px 高光切边 + 照片外扩 2px；顶部 6pt/左侧 4pt 内阴影；导出衬底（短边 0.026 留白）+ 底部悬浮阴影 + 相纸圆角（三调用点同口径） |

### 38.2 M1：相纸的程序化结构（`FrameSkin.tsx` + `frames.ts` 数据）

`FrameSpec.skin`（`FrameSkinSpec`）是**纯数据**，`FrameSkin` 用三个纯函数画出来：

| 帧 | `skin` 数据 | 全尺寸实测（designSize） |
| --- | --- | --- |
| polaroid-600 | `cornerRadius:10, paddedBevel:true, chinCrease:true` | 圆角 39.33、压边厚 7.87、下巴压痕 1403.68/1407.61（下巴 376） |
| instax-mini | `cornerRadius:6, paddedBevel:true, chinCrease:true` | 圆角 18.1、压痕 1387.08 |
| neg-135 | `cornerRadius:2, paddedBevel:false, chinCrease:false, sprockets:{…}, frameCode:'▷ 04A'` | 20 个齿孔 + 1 个帧号（见下表） |
| slide-mount | `cornerRadius:3, paddedBevel:true, chinCrease:false` | 圆角 11.31（开孔上方留白 > 下巴，无药水包） |
| fp100c | `cornerRadius:6, paddedBevel:true, chinCrease:true` | 圆角/压边/压痕同上口径 |
| 00 NO FRAME | 无 `skin` | 恒 0 元素（无纸可画） |

**渲染顺序（冻结）**：`tint(4) → bevel → crease → sprocket → frameCode`。不变量：所有元素在纸内、
与照片窗口 `intersectionArea === 0`、同参数两次调用逐字节相同（预览与成片必须一模一样）。
`tint` 恒为 `material.base`、`opacity:1`、`blendMode:'multiply'` —— **只着色不盖 PNG**，
这是"纸纹透出来"的全部秘密。`SkinElementKind` 只许 `'tint'|'bevel'|'crease'|'sprocket'|'frameCode'`（不再有 `'border'`）。

135 NEG 齿孔/帧号是**从 `neg-135.png` 逐像素实测反推**的（PNG 里本来就烘了 10 个透明孔，
程序化白孔必须逐孔覆盖，否则会出现双孔/错位）：

- 每侧 10 个孔，首孔 `{left:54, top:116.49, width:108, height:72}`，`pitch = 182.78`（= 孔高 × 2.5386），
  末孔下沿 1833.51，孔中心线距纸边 108，孔圆角 16（= 孔高 × 16/72）；
- 帧号 `▷ 04A`：字号 1350×0.032 = 43.2、颜色 `rgba(229,169,60,0.88)`、落点 (54, 24.3)，
  比 PNG 里烘死的 `▷ 12A`（bbox x224..378, y151..205）更靠纸边 —— 两行字**有意并存**（印刷字 vs 结构字）。

**相纸圆角**：`paperCornerRadius(w,h,skin) = snap(skin.cornerRadius × min(w,h)/358)`，夹 `min(w,h)/2`。
三个调用点（`FilmCompositor` 成片 / `FramePreviewLayer` 取景器 / `FilmDrawer` 抽屉迷你预览）
都用这个函数，且都要 `borderRadius + overflow:'hidden'` **连 PNG 一起裁**（否则 PNG 直角盖回来）。
`filmCompositor` 侧圆角挂在"缩放前内容层"上，缩放后视觉半径 = 半径 × `printCushion.scale`，与预览同口径。

### 38.3 M2：9 款传奇胶卷（`presets.ts` 重写）

`DEFAULT_PRESET_ID = 'gd-200'`；旧 10 个持久化 id（`retro-400`/`portra-400`/…）实测走 `findPresetIndex → 0`
安全回落 gd-200，`resolvePreset` 补默认值不崩（`mono:false`/`halation:0`）。

| id | 名字 | 基调 | temp | tint | sat | contrast | split | grain | vignette | halation | leak | mono |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gd-200 | GD-200 | 金色日光·暖调通透 | .12 | −.14 | 1 | 1.06 | .13 | .045 | .22 | — | — | — |
| pt-400 | PT-400 | 柔和人像·肤色微暖 | .10 | −.13 | .95 | 1.0 | .12 | .05 | .18 | — | — | — |
| um-400 | UM-400 | 浓郁街拍·高反差 | −.10 | .16 | 1.06 | 1.18 | .14 | .055 | .26 | — | — | — |
| cp-200 | CP-200 | 复古琥珀·黄昏暖调 | .15 | −.16 | 1 | 1.08 | .16 | .05 | .28 | — | .14 | — |
| fj-400 | FJ-400 | 日系青绿·冷调通透 | −.12 | .21 | .95 | 1.0 | .12 | .05 | .22 | — | — | — |
| ek-100 | EK-100 | 反转锐利·零雾高对比 | 0 | 0 | 1.04 | 1.20 | .11 | **0（GRAINLESS）** | .32 | — | — | — |
| cs-800t | CS-800T | 电影钨丝灯·冷蓝+暖红光晕 | −.15 | 0 | 1 | 1.10 | .13 | .05 | .26 | .85 | .18 | — |
| hp-400-bw | HP-400 BW | 纪实黑白·中灰层次 | 0 | 0 | 0 | 1.12 | — | .055 | .24 | — | — | **true** |
| tx-400-bw | TX-400 BW | 硬朗银盐·高反差 | 0 | 0 | 0 | 1.25 | — | .055 | .38 | — | — | **true** |

**泛光重写（零模糊）**：删 `bloom` 字段与 `HALATION_BLUR`；`halation` = **一层** `#FF4028` 纯色 `screen`，
`opacity = clamp01(halation) × 0.06 ≤ 0.06`（screen 会抬暗部 Y=0.4034，0.06 是"能看见光晕但不糊"的上限）。
全图层栈**零 `blurRadius`、零 `'lighten'`**（旧 `micro-soft-focus`/`halation-glow` 都不再存在）。

**真黑白**：`mono:true` 的卷在彩色层之后、颗粒之前叠 `{kind:'color', color:'#808080', blendMode:'saturation', opacity:1}`；
`sat:0` 的彩色层对 mono 卷**跳过**（不叠两层冗余去色）。取景器 live 对 `key:'mono'` **例外放行**
（满幅 opacity 1，不参与 `liveLookOpacity` 缩放）—— 黑白卷取景器所见即所得是用户红线。

**光学暗角**：`assets/textures/vignette.png` 重烤为 1024×1024 RGBA（由 `scripts/generate_vignette.py` 逐像素生成，零依赖）：

- `rho = min(1, dist(pixel, center) / (shortEdge/2))`；
- `t = clamp((rho − 0.65) / 0.35, 0, 1)`，`alpha = round(255 × smoothstep(t))`（中心 0，65% 以内全透明）；
- RGB 恒 `(6, 14, 20)`；层 = `{kind:'texture', asset:'vignette', blendMode:'normal', opacity: preset.vignette}`。

实测：rho 0.70/0.75/0.80/0.85/0.90/1.0 → alpha 14/51/100/155/204/255；中心 0、四角/边中点 255；
sha256 `6b45e862b6c23f30d9c1db97013e5d90bf82f4b49aa6e8dfae3e0a98ef70c79c`（114,530 B）。

### 38.4 M3：水印排版（stacked 钳制 + 地名语言字体）

**stacked 不再丢行**：旧实现"相框留白上下两行放不下就把地名扔掉"，现在改为钳制 ——
`maxPlaceBottom = H − vertical.top − slotFont`、`minPlaceBottom = min(maxPlaceBottom, max(bottom + slotFont, inset))`，
地名行底边夹在 `[minPlaceBottom, maxPlaceBottom]` 之间，宁可贴边也不消失（`geometry.ts` stacked 分支）。

**地名语言字体**：`planWatermark` 产出的 piece 带 `kind`（`'place'|'date'|'code'`），`FilmCompositor` 里
`place`/`code` 行用 `watermarkPlaceFont(placeFontLocaleOf(stage.locale))` 换字体：

| 地名语言 | 字体 |
| --- | --- |
| `ja` | `Hiragino Mincho ProN`（iOS 明朝体，写真集韵味） |
| `en` | `Menlo` |
| `zh-Hans` / `zh-Hant` | `undefined`（回退预设日期字体 / 系统等宽兜底） |

`placeFontLocaleOf` 只做 `LocaleId → GeoLocale` 的钉边：zh-Hant/ja/en 直通、`fr → en`、其余 `zh-Hans`。
**日期行不换字体**（日期字形是灯丝管线，换字体=换一套发光几何）。

### 38.5 M4：地名纯净多语言（`placeNames.ts` 重写）

四种语言 × 两档详情，分隔符**恒** `' · '`（U+00B7，两侧各一个半角空格）。以神户为例：

| 语言 | archive（剥行政后缀、从大到小） | full（保/补后缀） |
| --- | --- | --- |
| zh-Hans | 日本 · 兵库 · 神户 | 日本 · 兵库县 · 神户市 |
| zh-Hant | 日本 · 兵庫 · 神戶 | 日本 · 兵庫縣 · 神戶市 |
| ja | 日本 · 兵庫県 · 神戸市 | 日本 · 兵庫県 · 神戸市（两档同形） |
| en | KOBE · HYOGO · JAPAN | KOBE · HYOGO · JAPAN（两档同形） |

细则：`COUNTRY_NAMES` 是 47 国四语字典（alpha-2/alpha-3 都收）；中文/日文档**禁止拉丁国名**（红线断言）；
港澳台 full 冠中国：`中国 · 香港特别行政区` / `中国 · 台湾省 · 台北市`，en 恒 `HONG KONG · CHINA`；
日文档后缀规则：输入已带 県/都/府/道/市 则原样，无后缀才补（梅州市→梅州市，兵库→兵庫県）；
行政同名去重（`广东省 广州市` → `广东 · 广州`）。
`resolveGeoLocale(geoLocale, uiLocale)`：auto 跟界面语言（zh-Hans/zh-Hant/ja/en；仅 fr 退 en）；
`GEO_LOCALES` 白名单加 `'ja'`（可持久化）；`localityLanguage(GeoLocale): 'zh'|'ja'|'en'` 用于网络反查语言，
**界面语言不参与**（日文界面 + 英文地名 = Menlo，不是明朝体）。

### 38.6 M5：内窗黑边根治 + 导出衬底（`FilmCompositor.tsx` / `geometry.ts`）

**内窗（四条一起做，少一条就还看得见缝）**：

1. `roundInnerWindow(window)`：四值 `Math.round` —— 位图整像素 vs 容器亚像素的黑缝从结构上消失；
2. 容器底色 = `findFrameMaterial(frameVariant).base`（**严禁 #000**：万一还有 1px 偏差，漏出的是纸不是黑线）；
3. 照片向外冗余 2px（`left/top = −1`、宽高 `+2`），任何取整误差都由照片自己盖住；
4. 深色内框线整类删除，改 1px 极柔和纸张高光切边 `rgba(255,255,255,0.65)`（顶/左/底/右同一圈）。

**内阴影（相纸厚度投在照片上的微阴影）**：设计值顶部 6pt / 左侧 4pt，基准短边 358pt 等比缩放
（`INNER_SHADOW_DESIGN_TOP=6`、`LEFT=4`、`REFERENCE_SHORT_EDGE=358`），实际尺寸取整后
`max(3, round(6×scale))` / `max(2, round(4×scale))`；顶部 `rgba(0,0,0,0.28)`、左侧 `rgba(0,0,0,0.16)` 的
`LinearGradient`，只画在窗口内侧（`fullBleed` 不画）。

**导出衬底（"拿在手里的卡纸"，用户 M5 最后一块）**：`planPrintCushion(width, height)`：

- `margin = round(min(w,h) × 0.026)`（`PRINT_CUSHION_RATIO`），相纸缩到 `min−2m`；
- 内容层 `transform: scale(scale)` + `transformOrigin: 'left top'`，照片/相框/皮肤/水印**一起缩**；
- 衬底色 = `mixHexColor(material.base, '#000000', 0.06)`（相纸 base 压暗 6%，不是黑）；
- 阴影 `offset(0,6) / opacity .28 / radius 10`（相纸"浮"在衬底上）；
- 例：358×640 → `margin 9`、`scale 340/358`、`left 9`、`top 16.09`。
- 展示开关：`FilmCompositor` 新增 `presentation?: 'preview' | 'print'`（默认 `'preview'` = v1.8.4 相位），
  仅 `print` 且 `!fullBleed` 走衬底分支；两个 capture 挂载点（`CameraScreen` 的快门显影、`GalleryScreen` 的导入冲印）
  显式传 `presentation="print"` —— 它们挂的那棵树就是 ViewShot 的截图目标，也就是成片本身。
- `00 NO FRAME` 没有相纸：整幅铺满、不套衬底、不裁圆角（v1.8.1 行为保留）。

### 38.7 冻结接口 / 新增导出（给后来改代码的人）

- `types/index.ts`：新增 `FrameSprocketSpec` / `FrameSkinSpec`（`FrameSpec.skin?`）；`ColorGradeConfig.bloom` 删除、
  改为 `halation?`；`FilmPreset.mono?` / `ResolvedFilmPreset.mono`；`GeoLocale` 增加 `'ja'`。
- `FrameSkin.tsx`：`buildSkinElements(material,w,h,window)`（4 参，只返 4 条 multiply tint）、
  `buildPaperDetails(width,height,window,material,skin)`（5 参）、`frameSprocketBoxes(w,h,skin)`、
  `paperScale(w,h)`、`paperCornerRadius(w,h,skin)`；`FrameSkinProps` 加 `skin?`。
- `geometry.ts`：`roundInnerWindow`、`planInnerWindowShadows`、`planPrintCushion`（+ `INNER_SHADOW_*`/`PRINT_CUSHION_RATIO`）。
- `gradeLayers.ts`：`HALATION='#FF4028'`、`mono` 层、`GRAINLESS_PRESET_IDS`（`ek-100`）、live 对 `mono` 例外放行。
- `placeNames.ts`：`watermarkPlaceFont(GeoLocale)` 导出；`resolveGeoLocale`/`isGeoLocale` 支持 `ja`。

### 38.8 已知缺口

- **仍然没有真机/模拟器验证**：本机跑不了 iOS 真机。3D 纸感、齿孔重合、内阴影浓度都建议装上目视一次。
- **multiply 色偏是预期行为**：落屏色 = `material.base × PNG纸色 / 255`（PNG 纸底不是纯白，如 polaroid ~#F7F6F2），
  所以实际比 `frameVariants.ts` 的 base 略暗（archival on polaroid ≈ #EEECE4）。门禁断常量与乘算后取色，不按截图纯色。
- **fp100c 撕纸毛边**：PNG 最外沿是透明羽化（顶部 ~35–70px、左右 ~1px），4 条矩形 tint 边带会把那圈透明填成纸色，
  观感上"撕边被拉直"。v1.8.4 的实色带本来就是这个覆盖范围（非本轮引入），本轮**不改**
（`buildSkinElements` 4 参签名已冻结，要根治需另开一版给 tint 加按 PNG alpha 的内缩）。
- **135 NEG 双行片边字**：PNG 烘死的 `▷ 12A` 与程序化 `▷ 04A` 并存，有意保留（印刷字 vs 结构字分层）。
- **繁中网络反查只回简体**：BigDataCloud 的 `'zh'` 不分简繁，真机繁中可能显示简体（仓库无繁简转换表，v1.8.4 同样存在）。
- **英文罗马字化不完整**：拿不到拉丁写法时保留本地写法，但国家段恒字典国名，不会中英混排。
- **旧存档 preset id**：10 个旧 id 全部安全回落 gd-200（不崩，但也不保留旧外观 —— 本轮就是换卷）。
- **颗粒档位全局覆盖**：用户颗粒档位无条件覆盖 `preset.grain`，"每卷颗粒性格"只靠 `GRAINLESS_PRESET_IDS` 区分（既定行为）。

### 38.9 验证清单与门禁

> v1.8.5 门禁（14 道，全部 EXIT 0；工作区根 `node <脚本名>` 直接运行，零依赖、零网络）。
> 合计 28,538 条探针断言 + 64 条 purity 断言 + 9 预设 haze 审计，0 失败。

| # | 门禁 | 命令（工作区根） | 断言数 / 结果 |
|---|------|------------------|---------------|
| 1 | 日期引擎 | `node _probe_date_engine.cjs` | 3810 条 / 0 失败 / EXIT 0 |
| 2 | 胶片观感（9 卷/去雾/暗角） | `node _probe_film_look.cjs` | 1612 条 / 0 失败 / EXIT 0 |
| 3 | 合成/导出主链路 | `node _probe_geo_lock.cjs` | 16207 条 / 0 失败 / EXIT 0 |
| 4 | NO FRAME 几何 | `node _probe_noframe_v181.cjs` | 455 条 / 0 失败 / EXIT 0 |
| 5 | NO FRAME 水印 | `node _probe_noframe_watermark.cjs` | 458 条 / 0 失败 / EXIT 0 |
| 6 | 相框皮肤材质（M1） | `node _probe_skin_material.cjs` | 1069 条 / 0 失败 / EXIT 0 |
| 7 | 取景器/成片分面（M2） | `node _probe_v180_seams.mjs` | 1349 条 / 0 失败 / EXIT 0 |
| 8 | 集成回归 | `node _probe_lead_integration.mjs` | 315 条 / 0 失败 / EXIT 0 |
| 9 | 拍摄品质 | `node _probe_capture_quality.mjs` | 78 条 / 0 失败 / EXIT 0 |
| 10 | 相机焦段/取景（v1.8.4） | `node _probe_v184_camera.cjs` | 938 条 / 0 失败 / EXIT 0 |
| 11 | 地名多语言（M4） | `node _probe_v185_place.cjs` | 468 条 / 0 失败 / EXIT 0 |
| 12 | 相框皮肤/内窗/衬底（M1+M5） | `node _probe_v185_frame.cjs` | 1779 条 / 0 失败 / EXIT 0 |
| 13 | 去雾/白蒙预算审计 | `node _haze_audit.mjs` | 9/9 预设 PASS，结构门禁 0 失败，EXIT 0 |
| 14 | 纯净度（零 `as any`/零新依赖） | `node _purity_audit.mjs` | 64 条 / 0 失败 / EXIT 0 |
| T | TypeScript 类型检查 | `cd retro-film-cam && npx tsc --noEmit -p tsconfig.json` | EXIT 0，零输出 |
| E | iOS 导出 | `cd retro-film-cam && npx expo export --platform ios --no-bytecode` | EXIT 0，bundle `index-8a062966395dd49b396fb1693b5c5afc.js` 1,348,011 B |

环境与自证：

- node v24.18.0；`retro-film-cam/**` 零字节改动（门禁工程师全程只读源码）；零新依赖 / 零 `as any`（purity G 段 git 自证）。
- `_plate_stats.json` 已用捆绑 Python 刷新：vignette 1024² RGBA `centerAlpha 0` / `edgeAlpha 0.9951` /
  `alphaProfile 0.65→0、0.70→0.055、0.80→0.392、0.90→0.8、1.00→1`、RGB(6,14,20)；grain 512² center/edge 1；
  light-leak center 0 / edge 0.1352。
- 负控制（旧实现必须红）：v1.8.4 的纯黑 vignette 模型、旧 8 元素皮肤、旧 10 卷表喂进新门禁都会红；G02/G10
  断言数从 1676→1612、979→938 是「通用断言改精确单列」所致，不是覆盖缩减。
- `_haze_audit.mjs` 的 `satFloor` 用**核心栈（不含 halation）**口径：cs-800t 全栈 `satRatio 0.9347` 是契约保留的
  halation 暖红 screen 层（opacity 0.051 ≤ 0.06）造成，核心栈 `1.0550` 过线，预算数值未放宽。

原始输出：`_gate_v185_run.out.txt`（末轮 14 道 + tsc）与 `_gate_v185_report.txt`（逐道改动/踩坑/遗留风险）。

### 38.10 产物指纹

v1.8.5 发布指纹（2026-10-17，Asia/Shanghai）：

| 项 | 值 |
| --- | --- |
| 本地提交 | `66d1f4b8e08738cf8bbf2bae1b9745d0fff38e63`（25 files changed, +2112 −576；含 `scripts/generate_vignette.py` 新增） |
| 远端提交 | `1f32c711eb812f62fca353922ce2ef64a0830035`（父 `430a33fb…` = v1.8.4 docs 回填） |
| CI run | `39041345069`（job `117421311943` · build-ipa · 全 step success） |
| artifact | `12104516110`（`FretroCam-unsigned-ipa`，10,474,194 B zip） |
| IPA | `FretroCam-v1.8.5-unsigned.ipa`，**10,587,553 B** |
| SHA256 | `c6ab8c88ff2ea2db165f9f348e987f7f2a7b7cd43695ff84715442f52005d2c7` |
| Release | id `415865660`（tag `v1.8.5`）；asset id `650756725`（远端 size/digest 与本地一致） |
| 下载 | https://github.com/lizimo20041023-oss/retro-film-cam/releases/download/v1.8.5/FretroCam-v1.8.5-unsigned.ipa |
| 核验 | `_verify_ipa_v185.py 12104516110` = `RESULT: OK`：应存在 250+ 字面量/导出名全过、应删清单全 0（旧卷 id / `halation-glow` / `#FF4B2D` / 旧字形 / 旧皮肤废名全 0）、vignette PNG 内容 sha256 `6b45e862…` + 中心 alpha 0 + R/G/B 恒 (6,14,20)、grain PNG 频带门 `<8px 65.7%` / `24–64px 5.0%`、Info.plist 版本 `1.8.5`、10 张相框 + `no-frame.png` 全在包 |
| export 冒烟 | `_export_v185_lead` → `index-8a062966395dd49b396fb1693b5c5afc.js` 1,348,011 B（CI 内 `main.jsbundle` 2,053,389 B，压缩/预构建口径不同属正常） |
| 本地 IPA 副本 | 工作区根 `FretroCam-v1.8.5-unsigned.ipa`（10,587,553 B，与 Release 资产同 sha256） |

### 38.11 文件改动

| 文件 | 改动 |
| --- | --- |
| `src/types/index.ts` | `FrameSprocketSpec`/`FrameSkinSpec`、`FrameSpec.skin?`、`bloom`→`halation`、`mono`、`GeoLocale` 加 `ja` |
| `src/utils/geometry.ts` | 内窗 `roundInnerWindow`、内阴影 `planInnerWindowShadows`、衬底 `planPrintCushion`、`regionVertical` window 锚点改照片真实边界、stacked 钳制不丢行 |
| `src/components/FrameSkin.tsx` | **重写**：4 条 multiply 边带 + 程序化细节纯函数（压边/压痕/齿孔/帧号/圆角） |
| `src/components/FramePreviewLayer.tsx` | 相纸层圆角裁剪 + `skin={frame.skin}` 接线 |
| `src/constants/frames.ts` | 5 款纸框的 `skin` 数据（135 齿孔按 PNG 实测反推） |
| `src/components/FilmCompositor.tsx` | 内窗取整/纸色底/高光切边/照片外扩/内阴影/导出衬底/相纸圆角；`presentation` prop（`preview` 默认 / `print` 两处 capture 挂载点）；`WatermarkPiece.kind`；地名行按语言换字体 |
| `src/components/FilmDrawer.tsx` | 迷你相纸圆角裁剪 + `skin={frame.skin}`（与成片同口径） |
| `src/constants/presets.ts` | **重写**：9 款传奇胶卷 + `GRAINLESS_PRESET_IDS` + `DEFAULT_PRESET_ID='gd-200'` |
| `src/utils/gradeLayers.ts` | `bloom`/模糊副本删除 → 单层暖红 halation；`mono` 满幅去色层；暗角 normal；live 对 mono 例外 |
| `src/components/FilmLookLayers.tsx` | EK-100 无白尘点（`GRAINLESS_PRESET_IDS`）；注释口径更新 |
| `src/utils/placeNames.ts` | **重写**：4 语言 × 2 详情矩阵、47 国四语字典、恒 `' · '`、`watermarkPlaceFont` 导出 |
| `src/components/SettingsScreen.tsx` / `src/i18n/locales/*.ts`（5 份） / `src/utils/settingsStore.ts` | 地名语言加 `ja` 档（UI 行 + `settings.geoLocale.ja` 文案 + 持久化白名单） |
| `src/utils/locationStamp.ts` | 新增 `localityLanguage(GeoLocale)`，网络反查语言跟地名语言而非界面语言 |
| `assets/textures/vignette.png` | 暗角重烤为 1024² RGBA 光学渐变（中心全透明、外缘 RGB(6,14,20)） |
| `scripts/generate_vignette.py` | 新增零依赖生成脚本（逐像素手写 PNG 编码），可复现重烤 |
| `app.json` | version `1.8.4` → `1.8.5` |
| `README.md` | 本节 §38 + TOC |

---

## 39. v1.8.6：真机发热五条投诉的逐条核查（按需合成 / 硬件光栅化 / 零 SVG / 六节点隔离 / 画质档与 GPS 去重）

> 本版**零新依赖、零 `as any`、成片像素零回归**；`planCapture` / `planPhotoCrop` / `takePictureAsync`
> 参数 / 画质三档长边（2048 / 3024 / 4032）/ JPEG 0.98 一行未动。
>
> 先说结论：五条投诉里有三条在 v1.8.5 的代码里**本来就不成立**——离屏合成器不常驻、全仓零 SVG、
> 胶囊动画本来就是 `useNativeDriver: true`。本版把这三件事从"现状如此"升级成**结构性不可回退**
> （组件早退 + 门禁断言），把剩下两条里四条真实的高频路径真正修掉。

### 39.1 五条投诉 → 代码事实 → 本版动作

| # | 投诉（要点） | v1.8.5 冻结树的实测事实 | 本版动作 |
|---|-------------|------------------------|---------|
| ① | 离屏 `Composer` 常驻挂载、`left:-9999` | **不常驻**：`<FilmCompositor>` 全仓只有 2 个挂载点（`CameraScreen.tsx` / `GalleryScreen.tsx`），都按 `filmStage.stage !== null` 门控；`left:-9999` 全仓 0 命中；`processFilmPhoto.ts` 是 `mount → whenReady → capture → finally unmount` | 新增 `FilmStageComposer`：`stage === null` 直接 `return null`，两处挂载点改用它；`useFilmStage` 加挂载互斥与幂等卸载。**"不常驻"从调用约定变成组件结构**，任何路径都回退不回去 |
| ② | 实时相框预览要 `shouldRasterizeIOS` | 全仓 `shouldRasterizeIOS` / `renderToHardwareTextureAndroid` **0 命中**；`FramePreviewLayer` 根是 `pointerEvents="none"` 的绝对定位 View，子树全是静态 PNG + `FrameSkin` | 根 View 加两属性；`FilmDrawer` 静态相纸组同加。附零损失论证与"四类禁区"注释（见 §39.3） |
| ③ | 颗粒 / `FeColorMatrix` / SVG 节点过多 | 全仓**零** `react-native-svg` / `<Svg>` / `<Circle>` / `FeColorMatrix`；颗粒是预烘 `grain.png` 一张 `<Image>`（`FilmLookLayers` 的 `texture` 层）；`GrainOverlay` / `LiveFramePreviewOverlay` 这两个名字不存在 | 不引入 SVG；补 `OpticalDateText` 的 `memo`；新门禁把"零 SVG / 零新依赖"锁成断言（见 §39.4） |
| ④ | 参数栏 3 秒隐现 / 滑动 / 对焦坐标导致整屏重绘 | 胶囊动画**已经**是 `Animated.Value` + `useNativeDriver: true`（`useCapsuleAutoHide.ts`），没有逐帧 `setState`；真因是 `temperature` **25ms** 直写顶层、`exposure` / `zoom` 同类，顶层 37 个 state，且相机块/取景框/相框预览/控制台**没有 memo** | ① 上报节流 25ms → **50ms**（松手补发最后一档）；② 六个 `useMemo` 渲染节点挡住静态子树；③ 对焦脉冲改**显式令牌**，搓焦段/捏合不再打硬件 autofocus 往返（见 §39.5） |
| ⑤ | 分辨率策略 + 硬件/GPS 防抖 | `pictureSize` effect 依赖含 `lens`（搓一次焦段就发一次原生往返）；`focusPulse` effect 依赖 `[cameraReady, stop.id, lens, facing]`（每档都打 50ms `autofocus='on'`）；定位每张照片重取一次 fix | `pictureSize` 改画质档驱动 + 4:3 取景不变量、effect 去掉 `lens`；对焦脉冲依赖只剩令牌；定位加 **60s TTL** 缓存 + in-flight 去重（见 §39.6） |

**关于「48MP（8064×6048）」**：expo-camera 57.0.6 iOS 的 `PictureSize` 只有 9 个枚举串
（`CameraRecordingOptions.swift:56-88`：`3840x2160 / 1920x1080 / 1280x720 / 640x480 / 352x288 / Photo / High / Medium / Low`），
每个都映射到一个 `AVCaptureSession.Preset`；`CameraPhotoCapture.swift:93` 写死
`photoSettings.maxPhotoDimensions = photoOutput.maxPhotoDimensions`，没有 48MP 通道。
`'Photo'` 就是 4:3 全幅（12MP，4032×3024），三档画质只改**导出画布长边**（2048 / 3024 / 4032），
不伪造 48MP、也不降低成片。`captureQualityCapNote()` 早已如实写明"真 48MP 需原生相机模块"。

### 39.2 模块一：离屏合成器"按需瞬时挂载"

新增 `src/components/FilmStageComposer.tsx`（93 行）：

```tsx
export interface FilmStageComposerProps {
  stage: FilmStageInput | null;
  viewShotRef: RefObject<ViewShotRef | null>;
  onLayout: () => void;
  onImageLoad: () => void;
  timestampFontFamily?: string;
  frameVariant: FrameVariant;
  dateEngine: DateEngineConfig;
  lookSeed?: number;
}

export const FilmStageComposer = memo(function FilmStageComposer(props) {
  if (props.stage === null) return null;   // ← 不挂载任何原生节点
  return <FilmCompositor … presentation="print" />;
});
```

- `CameraScreen` 与 `GalleryScreen` 的 `<FilmCompositor>` 全部换成 `<FilmStageComposer>`，
  `presentation="print"` 由组件内部写死；两屏的渲染树里不再出现直接的 `<FilmCompositor>`（门禁 S1 断言）。
- `GalleryScreen` 刻意**不传** `lookSeed`，保持 `FilmCompositor` 缺省值 0，成片颗粒与 v1.8.5 逐像素一致。
- `DevelopOverlay` / `FilmCompositor` 用 `memo` 包一层（**函数体一行未改**，`FilmCompositorImpl` 仍含
  `function FilmCompositor` 文本前缀以兼容旧探针的文本锚点）；`useFilmStage` 的计数三函数一行未动。
- `useFilmStage` 加固：`mount()` 发现上一轮未卸载先幂等收掉；`unmount()` 可重复调用；
  1500ms 兜底超时改为 `__DEV__` 下 `console.warn` 后仍然放行；`capture()` 在 `stage` 为空时抛错；
  截图前补**两帧 `requestAnimationFrame`**（等 iOS 图层提交后再 `capture()`）。

### 39.3 模块二：iOS 硬件光栅化（静态相纸整棵烘成一张纹理）

`FramePreviewLayer` 根 View（`pointerEvents="none"` 之后）追加：

```tsx
shouldRasterizeIOS
renderToHardwareTextureAndroid
```

`FilmDrawer` 的迷你成片窗加在内层**纯静态相纸组** `framePreviewPaperLayer` 上（PNG + `FrameSkin`），
**不是**外层 `framePreviewBox`——后者含可点的 `00` 角标。

- **零损失论证**：幕布是全不透明的，相纸层 0.82 的透明度在子树**内部**已经合成完毕，
  所以烘成位图后 alpha 不变；整组在两次烘焙之间完全静态。
- **不会变糊**：RN 0.86 Fabric 在 `RCTViewComponentView.mm:339-343` 里给
  `layer.rasterizationScale = shouldRasterize ? traitCollection.displayScale : 1.0`，
  按屏幕倍率烘焙，不是按逻辑点。
- **重烘时机**：`frame/layout/left/top/variant/pieces/fontFamily/glow` 变化，以及 30s 地名心跳
  （`FRAME_PREVIEW_REFRESH_MS`）——约 2 次/分钟，可接受。
- **四类禁区**（注释与门禁双保险）：`FilmCompositor`（成片走 `drawViewHierarchyInRect` 按点尺寸重绘放大，
  栅格化会糊）、`Animated.View`（`lensScale` spring 子树）、`CameraView`、`FilmLookLayers`
  （层上是 `mixBlendMode`，离屏后混合语义会变）。

### 39.4 模块三：零 SVG + memo（颗粒本来就是一张 PNG）

- 颗粒没有 80~100 个 `<Circle>`：全仓零 `react-native-svg`，取景器/成片的颗粒都是
  `assets/textures/grain.png` 一张 `<Image>` 贴图 + 混合模式。一张预烘 512² PNG 比上百个矢量节点省得多，
  **本版不为了"优化"引入 SVG**，只把"零 SVG"变成门禁断言，防止以后有人加回来。
- `OpticalDateText` 补 `memo`（`OpticalDateTextImpl` + `export const OpticalDateText = memo(...)`，
  导出名与 props 不变）；`FramePreviewLayer` / `FilmLookLayers` / `FrameSkin` / `DateStamp` /
  `ParameterScrubBar` / `ViewfinderBar` / `ToolRow` / `FrameBadge` / `FilmDrawer` 的既有 `memo` 全部保持。
- 依赖白名单由探针逐字断言：dependencies **18 项**、devDependencies **5 项**，`package.json` /
  `package-lock.json` 零改动；`src/**` 递归扫描 `react-native-svg` / `<Svg` / `<Circle` / `<Path` /
  `feColorMatrix` 命中文件数为 0。

### 39.5 模块四：六个 `useMemo` 渲染节点（高频 state 不再穿透整屏）

`CameraScreen` 顶层仍有 37 个 state（不改语义），但把渲染树拆成六个依赖冻结的元素缓存节点。
元素引用不变时 React 直接 bailout，不会重建子树：

| 节点 | 内容 | 关键依赖（逐字冻结进门禁 S8） | 明确不含 |
|------|------|-----------------------------|----------|
| `cameraClipNode` | `<Animated.View styles.cameraClip>` + `<CameraView>` | `cameraGranted` / `previewBox` / `viewfinderWindow` / `lensScale` / `cameraKey` / `cameraLayer` / `facing` / `cameraFocusProps` / `flashMode` / `lens` / `zoom` / `pictureSize` / `focusPulse` / 三个回调 | `exposure` / `temperatureOverride` / `resolved` / `exposureCount` / `doubleExposure` |
| `liveLookNode` | `styles.liveLook` + `<FilmLookLayers surface="live">` | `previewBox` / `viewfinderWindow` / `resolved` | — |
| `viewfinderNode` | `<ViewfinderWindow>` | `previewBox` / `viewfinderWindow` / `resolved.showGuide` | — |
| `framePreviewNode` | `framePreviewVisible` 门控的 `<FramePreviewLayer>` | `previewPieces` / `previewLayout` / `frameOffset.left/top` / `resolvedFrame` / `settings.frameVariant` / `fonts.fontFamily` / `resolved.timestamp.glow` | — |
| `controlNode` | 顶栏 `LiquidGlassView`（帧徽标/计数/画质/设置）+ 控制台 `LiquidGlassView`（ToolRow + coreRow） | 交互回调 / `developing` / `albumKey` / `cameraReady` / `interactive` / `t` / `preset.name` 等 | 高频调色值 |
| `overlayNode` | flash/focus hint、倒计时、banner、胶囊行、`DevelopOverlay` + `<FilmStageComposer>` | `flashHint` / `countdown` / `bannerMessage` / `consoleHeight` / 胶囊回调 / `status` / `filmStage.stage` 等 | — |

- 顶栏与控制台共 2 个 `LiquidGlassView`：控制台在 `controlNode` 里，**顶栏刻意不 memo**
  （帧徽标、胶卷计数、画质 chip 要每渲染拿最新 props），门禁按"2 个、只有 1 个在 memo 内"断言。
- `FrameSwitcher` / `FocusExposure` **刻意不 memo**：命中区要最新的 `handleTapFocus`，
  对焦框动画在组件内部走 native driver。
- 对焦脉冲：新增 `focusPulseToken` state，effect 依赖只剩 `[cameraReady, focusPulseToken]`；
  自增点恰好 2 处 —— `applyStop`（按档位/循环焦段最终都落到它）与 `handleFlipCamera`（换朝向要重新锁焦）。
  搓焦段（`handleFocalScrub`）与捏合**不再**触发 `autofocus='on'` 的原生往返；原生 `'on'` 语义正好是
  "对一次焦然后锁定"，所以手感不变。
- `ParameterScrubBar` 上报节流 `EMIT_INTERVAL_MS = 25 → 50`（20Hz），松手时 `state.pending`
  补发被压住的最后一档，降频不吞值；尺子动画仍走 `Animated.Value`，不进 React。
- 胶囊自动隐现**本来就是** `Animated.timing(..., useNativeDriver: true)`，本版不改，
  只加门禁断言防止有人改成逐帧 `setState`。

### 39.6 模块五：画质档驱动 `pictureSize` + 镜头/定位去重

`pickPictureSize(sizes, targetLongEdge)` 的决策顺序（纯函数，门禁用 9 条真实枚举串跑表）：

1. 空列表 / 解析失败 → `undefined`；
2. 广告项里 **4:3 比例**（宽高比 4/3 ± 0.02）且"按 4:3 裁切后的长边" ≥ 目标长边的最小者；
3. 否则 `'Photo'`（iOS 唯一的 4:3 全幅预设）；
4. 否则满足 4:3 裁切长边 ≥ 目标的最大 `WxH`；
5. 否则 `'High'` / `undefined`。

- **永不选 16:9**（`3840x2160` / `1920x1080` / `1280x720`）：`pictureSize` 是**全局 sessionPreset**，
  16:9 会同时打破 `planCameraLayer` 的 3:4 sensor 假设、`planPhotoCrop` 的裁切与
  `captureQuality.ts:29-31`「画质档只买清晰度，不买取景范围」的约定。
- `targetLongEdge` 来自 `findCaptureQualitySpec(settings.captureQuality).longEdge`（2048 / 3024 / 4032），
  `refreshPictureSize` 依赖它；effect 依赖去掉 `lens`，改为
  `[cameraReady, facing, cameraKey, refreshPictureSize]` —— 换镜头不再重拉 sessionPreset。
- 结果用 `setPictureSize(prev => prev === next ? prev : next)` 去重；
  `getAvailableLensesAsync` 加 in-flight 去重，`handleLensesChanged` 同值 bailout。
- 定位：`LOCATION_CACHE_TTL_MS = 60_000`，缓存键 `${mode}|${geoLocale}|${detail}|${localeId}`，
  只缓存 `outcome.ok` 的成功结果（失败不缓存）；`resolveForShot()` 命中缓存直接返回，
  快门最多等 2500ms；`refresh()` 先清缓存再自增 `probeToken`（手动刷新绕缓存）。
  全仓仍然没有 `watchPositionAsync(` —— 只取单次 fix，不订阅连续定位。

### 39.7 已知缺口与如实说明

- **48MP 不存在**：见 §39.1 末尾。本版不伪造 48MP，也不为了"看起来更高清"去选 16:9 高分辨率预设。
- **离屏合成器本来就不常驻**：本版不是修一个"常驻 bug"，而是把"只在显影时挂载"从调用约定
  升级成组件结构（`stage === null` 直接 `return null`），并用门禁锁死。真正的问题从来不是常驻，
  而是挂载点分散、`presentation` 靠 prop 传、卸载路径依赖调用方自觉。
- **零 SVG 是既成事实，不是本版成果**：颗粒一直是预烘 PNG。本版只做"防回退"，不引入矢量颗粒。
- **胶囊动画本来就是 native driver**：3 秒隐现没有走 React state 逐帧重绘，本版未改。
- **本版真正修掉的发热源**（四条，全部有门禁对应）：
  1. `pictureSize` 每次换镜头都发一次 `getAvailablePictureSizesAsync` + 重配 sessionPreset；
  2. 对焦脉冲 `autofocus='on'` 每换一档镜头/每拖一格行程就打一次原生对焦；
  3. 每张照片都重新取一次 GPS fix（无 TTL、无并发去重）；
  4. 顶层高频 state（色温 25ms / 曝光 / 变焦）触发整屏重渲染，静态子树每次重建。
- **仍未解决的**：`zoom` 的 60Hz 值仍要穿过一次顶层 state（`cameraLayer` 的 `digitalFactor` 需要它），
  只是已被 `cameraClipNode` 之外的节点挡住；相框预览的栅格化纹理每 30s 地名心跳会重烘一次（约 2 次/分钟）。
- **不改的东西**：`takePictureAsync` 参数、`planPhotoCrop`、`planCapture`、`centerCropOrigin`、
  画质三档长边、JPEG 0.98、i18n 文案与设置项——一行未动。

### 39.8 验证清单与门禁

> v1.8.6 门禁（15 道，全部 EXIT 0；工作区根 `node <脚本名>` 直接运行，零依赖、零网络）。
> 合计 **28,926 条断言**（含 haze 81 + purity 64），0 失败。

| # | 门禁 | 命令（工作区根） | 断言数 / 结果 |
|---|------|------------------|---------------|
| 1 | 日期引擎 | `node _probe_date_engine.cjs` | 3810 条 / 0 失败 / EXIT 0 |
| 2 | 胶片观感（9 卷/去雾/暗角） | `node _probe_film_look.cjs` | 1612 条 / 0 失败 / EXIT 0 |
| 3 | 合成/导出主链路 | `node _probe_geo_lock.cjs` | 16207 条 / 0 失败 / EXIT 0 |
| 4 | NO FRAME 几何 | `node _probe_noframe_v181.cjs` | 455 条 / 0 失败 / EXIT 0 |
| 5 | NO FRAME 水印 | `node _probe_noframe_watermark.cjs` | 458 条 / 0 失败 / EXIT 0 |
| 6 | 相框皮肤材质（M1） | `node _probe_skin_material.cjs` | 1069 条 / 0 失败 / EXIT 0 |
| 7 | 取景器/成片分面（M2） | `node _probe_v180_seams.mjs` | 1349 条 / 0 失败 / EXIT 0 |
| 8 | 集成回归 | `node _probe_lead_integration.mjs` | 315 条 / 0 失败 / EXIT 0 |
| 9 | 拍摄品质 | `node _probe_capture_quality.mjs` | 78 条 / 0 失败 / EXIT 0 |
| 10 | 相机焦段/取景（v1.8.4） | `node _probe_v184_camera.cjs` | 938 条 / 0 失败 / EXIT 0 |
| 11 | 地名多语言（M4） | `node _probe_v185_place.cjs` | 468 条 / 0 失败 / EXIT 0 |
| 12 | 相框皮肤/内窗/衬底（M1+M5） | `node _probe_v185_frame.cjs` | 1781 条 / 0 失败 / EXIT 0 |
| 13 | 去雾/白蒙预算审计 | `node _haze_audit.mjs` | 9/9 预设 PASS，结构门禁 0 失败，EXIT 0 |
| 14 | 纯净度（零 `as any`/零新依赖） | `node _purity_audit.mjs` | 64 条 / 0 失败 / EXIT 0 |
| 15 | **性能改造（v1.8.6 新增）** | `node _probe_v186_perf.cjs` | 241 条 / 0 失败 / EXIT 0 |
| T | TypeScript 类型检查 | `cd retro-film-cam && npx tsc --noEmit -p tsconfig.json` | EXIT 0，零输出 |
| E | iOS 导出 | `cd retro-film-cam && npx expo export --platform ios --no-bytecode` | EXIT 0，bundle `index-977478d678e54a43493327ab2445eca9.js` 1,350,807 B（754 modules） |

新探针 `_probe_v186_perf.cjs` 的九节（全部为源码形态 + 纯函数实测，不 require 业务模块）：

1. **S1 按需挂载**：读 `FilmStageComposer` / `CameraScreen` / `GalleryScreen` / `useFilmStage` 的 AST，
   断言 `stage === null` 早退、两屏不直接渲染 `<FilmCompositor>`、`presentation="print"` 只在组件内部、
   挂载互斥/幂等卸载/两帧 rAF/超时 warning；`countStageImages` / `countExtraStageImages` /
   `countMissingStageImages` 三函数用 `new Function` **真跑**（`overlayUri` 有/空/缺 → 1/0/0，
   `fullBleed` true/false/缺 → 1/0/0）。
2. **S2 栅格化**：两文件各恰 1 处两属性 + 位置断言；`FilmCompositor` / `FilmLookLayers` / `CameraScreen` /
   `GalleryScreen` 里合计 0 次。
3. **S3 零 SVG / 零新依赖**：递归扫 `src/**`；依赖白名单 18 + 5 逐字对拍。
4. **S4 节流**：AST 实测 `EMIT_INTERVAL_MS = 50`；松手补发 `emit(dial, state.pending)`；
   `useCapsuleAutoHide` 的 `useNativeDriver: true` 存在且没有 `false`。
5. **S5 对焦脉冲**：effect 依赖逐字冻结；`setFocusPulseToken` 恰 2 处、owner 排序 =
   `['applyStop','handleFlipCamera']`；`handleCycleFocal` 经 `applyStop`。
6. **S6 `pickPictureSize` 跑表**：9 条真实枚举串 × 多个 target（2048/3024/4032/8064），
   断言 4:3 优先、16:9 永不选中、`'Photo'` 兜底、空列表 `undefined`、确定性。
7. **S7 定位**：TTL=60000、缓存键、命中/失效、in-flight 去重、`refresh` 先清缓存、
   `SHOT_DEADLINE_MS = 2500`、全仓无 `watchPositionAsync(`。
8. **S8 六节点**：节点存在、`useMemo` 包裹、依赖数组**逐字冻结**；
   `cameraClipNode` 不含 `exposure` / `temperatureOverride` / `resolved` / `exposureCount` / `doubleExposure`。
9. **S9 旧探针更新**：`_probe_v185_frame.cjs` 改断 `FilmStageComposer`、`_probe_noframe_v181.cjs`
   指向 `OpticalDateTextImpl`（带原名兜底），语义断言全部保留。

环境与自证：

- node v24.18.0；15 道探针全部在仓库外只读源码/纯函数，`retro-film-cam/**` 里除本节与 §39.10 列出的文件外零改动。
- 零新依赖 / 零 `as any` / `package.json`、`package-lock.json` 零改动（purity G 段 git 自证）。
- 探针首轮 5 个红全部是探针自身缺陷（同模块多条 import 覆盖、注释里的 `target.capture()` 抢先、
  `flushPending` 只存在于注释、顶栏 `LiquidGlassView` 实际 2 个、自指断言写反），已逐条修正；
  业务实现未因探针改过一行。
- 旧探针与新实现冲突的两处（`_probe_v185_frame.cjs` 的 `presentation` 计数、
  `_probe_noframe_v181.cjs` 的 `OpticalDateText` 函数体）只改代码形态匹配，语义断言原样保留。

原始输出：`_gate_v186_run.out.txt`（15 道全量输出）、`_gate_v186_lead.txt`（15 道 EXIT 码汇总）。

### 39.9 产物指纹

- 本地提交 `eb2971d`（13 files changed，1229 insertions / 396 deletions）→ 远端 `e0f920d316742629db4c233d9c240f5229ebdacb`（经 `_push_v180_api.py` 建树提交，本地/远端 tree 一致）。
- CI run `39046576765`（job `117436392897`，`build-ipa` 全绿）；artifact `12105923462`（`FretroCam-unsigned-ipa`，10,476,521 B）。
- IPA：**10,590,352 B**，sha256 `fb1bcc61c3ef77d9a8d76afa22d9d4f4912b24ff6f30b5761278c38171bea00b`（Release 回读 digest 与本地一致）。
- Release `v1.8.6` id `415910247`，asset id `650899519`（`FretroCam-v1.8.6-unsigned.ipa`）；
  下载 <https://github.com/lizimo20041023-oss/retro-film-cam/releases/download/v1.8.6/FretroCam-v1.8.6-unsigned.ipa>。
- 核验：`python _verify_ipa_v186.py --local dist/_expo/static/js/ios/index-977478d678e54a43493327ab2445eca9.js` → `RESULT(local): OK`；
  `python _verify_ipa_v186.py 12105923462` → `RESULT: OK`（包内 `FilmStageComposer` / `shouldRasterizeIOS` / `renderToHardwareTextureAndroid` 均命中，
  `FilmCompositorImpl` / `DevelopOverlayImpl` / `pickPictureSize` 在 canary 下命中，颗粒/暗角 sha256 与 v1.8.2/v1.8.5 一致，Info.plist 版本 `1.8.6`，10 张相框齐全，bundle 2,059,280 B）。
- export 冒烟：`npx expo export --platform ios --no-bytecode` EXIT 0 → `index-977478d678e54a43493327ab2445eca9.js` 1,350,807 B（754 modules）。
- 本地 IPA 副本：workspace 根 `FretroCam-v1.8.6-unsigned.ipa`（10,590,352 B）。
- 环境：node v24.18.0；日期 2026-10-17。

### 39.10 文件改动

| 文件 | 改动 |
| --- | --- |
| `src/components/FilmStageComposer.tsx` | **新增**（93 行）：`memo` + `stage === null` 早退 + `presentation="print"` 写死 |
| `src/hooks/useFilmStage.ts` | 挂载互斥、幂等卸载、超时 warning、`capture()` 前两帧 rAF；计数三函数未改 |
| `src/components/DevelopOverlay.tsx` | 实现体改名 `DevelopOverlayImpl` + `memo` 导出（逻辑零改动） |
| `src/components/FilmCompositor.tsx` | 实现体改名 `FilmCompositorImpl` + `memo` 导出（函数体零改动） |
| `src/components/GalleryScreen.tsx` | 挂载点换 `FilmStageComposer`（不传 `lookSeed`，成片颗粒不变） |
| `src/components/CameraScreen.tsx` | 六个 `useMemo` 渲染节点、`pickPictureSize` 画质档驱动、`focusPulseToken`、`sameLensList`、effect 依赖收紧 |
| `src/components/ParameterScrubBar.tsx` | `EMIT_INTERVAL_MS` 25→50，注释同步 |
| `src/hooks/useLocationStamp.ts` | 60s TTL 缓存 + in-flight 去重 + `refresh()` 清缓存 |
| `src/components/FramePreviewLayer.tsx` | 根 View 加 `shouldRasterizeIOS` / `renderToHardwareTextureAndroid` + 零损失论证注释 |
| `src/components/FilmDrawer.tsx` | 静态相纸组加同两属性 |
| `src/components/DateGlyphs.tsx` | `OpticalDateText` 改 `memo`（导出名/props 不变） |
| `app.json` | version `1.8.5` → `1.8.6` |
| `README.md` | 本节 §39 + TOC |

工作区根（不进仓库）：`_probe_v186_perf.cjs`（新增第 15 道门禁）、`_gate_v186_run.out.txt`、
`_gate_v186_lead.txt`、`_gate_v186_report.txt`、`_v186_contract.md`。

---

## 40. v1.8.7：字形档四档真正分家（STAMP FONT 实时穿透 / 自混合 S-Curve / 9 卷重调 / 胶片卡渐变与无框日期暗影）

> 本版**零新依赖、零 `as any`、成片几何零回归**；`planCapture` / `planPhotoCrop` / `takePictureAsync`
> 参数 / 画质三档长边（2048 / 3024 / 4032）/ JPEG 0.98 一行未动。
>
> 四条用户指令：①「日期字形 STAMP FONT」切档必须实时穿透预览与成片、四档必须肉眼可分；
> ②调色要有自混合 S-Curve、分离色调，暗角要径向而不是平涂黑边；③9 款胶卷按用户给定配方重调；
> ④`SELECT FILM STOCK` 卡片头部要渐变 + ISO 角标，`00 NO FRAME` 的白色日期/地名要双层暗影。
>
> 四条里最刺眼的一条是①：v1.8.6 的渲染层把字体族写死成 `Menlo-Bold`，四档只在
> `fontWeight` / `letterSpacing` 上差几个百分点 —— 用户"看不出区别"是**代码事实**，
> 不是主观感受。本版从字体族、几何变换、层数、阴影四条轴同时拉开，并且把
> `dateEngine` 一路传进取景器相框预览层（此前它根本收不到字形档）。

### 40.1 四条指令 → 真因 → 本版动作

| # | 指令（要点） | v1.8.6 冻结树的实测事实 | 本版动作 |
|---|-------------|------------------------|---------|
| ① | STAMP FONT 切档无效，四档看起来一样 | `DateGlyphs.tsx` 的 `OPTICAL_FONT_FAMILY` 写死 `Menlo-Bold`（注释还写明"不许按字形档换字体"）；四档只差 `fontWeight`（700/700/600/800，三档几乎同粗）与 `trackingScale`（0.84~1.25）；渲染层永远画三层同色发光。**取景器预览层 `FramePreviewLayer` 的 props 根本没有 `dateEngine`**，两处 `<DateStamp>` 没传 `glyphStyle`/`glow`/`spot` → 预览永远走旧文字路径 | 重写 `DateGlyphs.tsx`：四档各一支 iOS 原生字体 + 各一套材质配方（见 §40.2）；`dateGlyphLayers()` 返回 1~3 层墨迹；`FramePreviewLayer` 加 `dateEngine?` 并传 `glyphStyle`/`glow`/`spot`；`CameraScreen` 传 `dateEngine={settings.dateEngine}` 且进 `framePreviewNode` 依赖；设置页每行右侧直接渲染该档样例 |
| ② | 调色要自混合 S-Curve / 分离色调，暗角要径向 | `ColorGradeConfig` 只有 `contrast` 等旧字段；暗角是 `vignette.png` 以 `normal` 叠加且**中心也有 alpha**（≈0.65 起跳）；照片内窗顶部是一条 `0.28` 不透明的黑灰渐变（`innerShadows.top`，高度 = 实测包边像素） | `ColorGradeConfig` 加 8 个可选字段（`sCurveIntensity` / `curveBlendMode` / `shadowTint*` / `highlightTint*`）；`gradeLayers` 在 `mono` 之后插 `s-curve`（同源副本自叠）与 `shadow-tint` / `highlight-tint`；暗角蒙版改 `INNER_RADIUS=0.68`（中心 alpha 0）且 `blendMode: 'multiply'`；顶部内窗阴影降到 `0.12`、高度 `min(2, innerShadows.top)`（见 §40.3） |
| ③ | 9 卷重调 | 9 卷只有旧的 `contrast` / `saturation` / 少量 `color` 层；无 S-Curve、无分离色调 | 按用户给定逐卷配方写进 `PRESETS`（表见 §40.4），`PRESET_DEFAULTS` / `resolvePreset` 同步默认值 |
| ④ | 胶片卡渐变 + ISO 角标；无框日期双层暗影 | `FilmCard` 卡片头是 3 条 `swatchZone` 纯色块；`00 NO FRAME` 的日期只有一层发光/墨色，白天浅色照片上白字发飘 | 卡片头改 `LinearGradient` 三段渐变 + 右上角 `ISO 200`/`ISO 400`/`SLIDE`/`800T`/`B&W` 微角标（按底色亮度自适应黑/白）；无框模式日期与地名加双层全向暗影（预览层 + 成片合成器 + `DateStamp` 的 `haloShadow` 三处，见 §40.5） |

### 40.2 模块一：四档字形从"同一支字体"到"四种材质"

**真因两层**：渲染层把字体族写死（`OPTICAL_FONT_FAMILY = Menlo-Bold`），且取景器预览层
根本没接字形档数据。所以此前用户切档时：预览层纹丝不动，成片只换字距/字重 —— 两者都不像"换字体"。

渲染层重写后的四档口径（`src/components/DateGlyphs.tsx`，`S = fontPx / 44` 为相对字号基准）：

| 档位 | iOS 字体 / 字重 | 几何 | 墨迹层 | 阴影 / 透明度 |
| --- | --- | --- | --- | --- |
| `quartz_led` 石英 LED | `Courier-Bold` / 700 | 整层 `skewX: '-10deg'`（机械斜刀） | 3 层（`outer` / `mid` / `core`，仍由 `opticalGlowLayers()` 派生） | 外两层同色大半径发光，`core` 无阴影；层不透明度全部 1 |
| `ccd_osd` CCD OSD | `Menlo-Bold` / 800 | `scaleY: 1.22` + `scaleX: 0.92`（窄高体） | 1 层纯白 `#F8F9FA` | 零模糊硬黑投影 `rgba(0,0,0,0.92)`，radius 0.2、offset `1.8S / 1.8S`；**严禁柔和红晕** |
| `lab_inkjet` 暗房喷墨 | `AmericanTypewriter` / 400 | 无变换（正体） | 1 层墨色（调色板 `core`） | 整体 `opacity: 0.84`；油墨边缘 `rgba(30,20,10,0.35)`，radius `1.2S`、offset y `0.5S`；无发光 |
| `archival_steel` 档案钢印 | `Copperplate` / 600 | 无整层变换，字号 `0.90×`（`glyphFontPx` 唯一入口） | 2 层：底层右下高光 `rgba(255,248,232,0.34)` + 顶层主体 | 高光层 `translateX/Y: 0.8S`；主体层左上暗影 `rgba(0,0,0,0.65)`，radius `0.5S`、offset `-0.8S / -0.8S` |

- 新导出 `GLYPH_FONT_FAMILY`（iOS 四档映射，Android 统一 `monospace`）与 `glyphFontPx()`
  （archival 的 0.90× 只在这里发生）；旧导出 `OPTICAL_FONT_FAMILY` 保留为 `Menlo-Bold` 兼容旧探针。
- 新函数 `dateGlyphLayers(style, glow, fontPx, letterSpacing, haloShadow = false)`：纯函数返回
  `DateGlyphLayer[]`（`key` / `color` / `opacity` / `shadowColor` / `shadowRadius` / `shadowOffset` /
  `transform?`），渲染层只负责把配方铺成 N 层 `<Text>`。
- 渲染层仍是**同一处 JSX `map`**（不是复制 N 份），各层共用一份 `textStyle`；每层的
  `transform` 由 `combineTransforms(基础变换, 层位移)` **显式合并** —— RN 样式数组是覆盖语义，
  某一层如果写 `transform: undefined` 会把整层斜刀/窄高体盖掉，那样四档又只剩字体族不同。
- `type GlyphTransform = Extract<NonNullable<TextStyle['transform']>, ReadonlyArray<unknown>>`：
  避免 `[...base, ...extra]` 的元素类型退化成 `string`，不需要任何类型断言。

**穿透链**（一遍读完即可确认"切档立即生效"）：

```
settings.dateEngine
  ├─ CameraScreen: previewPieces = planWatermark({ dateEngine })
  │     └─ FramePreviewLayer（新增 dateEngine?: DateEngineConfig）
  │           └─ DateStamp（传 glyphStyle / glow / spot）
  ├─ CameraScreen: <FramePreviewLayer dateEngine={settings.dateEngine}>（依赖已加）
  ├─ FilmStageComposer → FilmCompositor → QuartzPiece → DateStamp（既有路径）
  └─ SettingsScreen: 每行 date_style 右侧 <DateGlyphSample>（直接渲染 `10 17 '26`）
```

设置页 `日期字形` 四行右侧新增样例列（`GLYPH_SAMPLE_TEXT = "10 17 '26"`，
`GLYPH_SAMPLE_FONT_PX = 12`，字距按 `trackingScale` 折算），用的就是 `OpticalDateText` ——
用户在设置页看到的样例与取景器/成片是同一套渲染代码，不是另画的示意图。

### 40.3 模块二：自混合 S-Curve + 分离色调 + 径向暗角

`src/utils/gradeLayers.ts` 的图层顺序（自底向上）：

| 序 | 层 | 本版变化 |
| --- | --- | --- |
| ① | 原图 | **零雾**：不铺任何全屏白膜（v1.8.0 已确立） |
| ⑦ | 漏光 `halation` | 系数 `0.06` → `0.08`、上限同步 0.08 |
| ⑧ | 对比 `contrast-boost` | 未改 |
| ⑧.5 | **`s-curve`（新增）** | `kind: 'photo'`：同源照片副本，`opacity: min(0.42, sCurveIntensity)`，`blendMode: curveBlendMode`（`soft-light` / `overlay`）→ "同源自叠"近似 S 曲线，而不是给画面加灰 |
| ⑧.6 | **`shadow-tint` / `highlight-tint`（新增）** | `kind: 'color'`：暗部染色（`multiply` / `exclusion` / `color-burn`）与高光染色（`soft-light`），空串或 opacity ≤ 0.01 不产生层 |
| ⑨ | 黑白 `mono` | 未改（`#808080` + `saturation` + 1.0） |
| ⑩ | 暗角 `vignette` | 蒙版重生成（`INNER_RADIUS = 0.68`，中心 alpha 0，68%→100% 过渡到四角），`blendMode: 'multiply'`；不再用 `normal` 平涂 |
| ⑪ | 颗粒 `grain` | 未改（`overlay`，不透明度硬夹 0.12~0.22） |

**顶部黑灰带**：`FilmCompositor.tsx` 的照片内窗顶部渐变由
`['rgba(0, 0, 0, 0.28)', 'rgba(0, 0, 0, 0)']` + `height: innerShadows.top` 改为
`['rgba(0, 0, 0, 0.12)', 'rgba(0, 0, 0, 0)']` + `height: Math.min(2, innerShadows.top)` ——
用户说的"照片顶部生硬黑灰带"就是这条包边阴影，v1.8.6 的实测包边像素把它撑成了可见的灰带。

数据结构（`src/types/index.ts` 的 `ColorGradeConfig`，全部可选，缺省 = 行为不变）：

```ts
sCurveIntensity?: number;      curveBlendMode?: BlendMode;
shadowTint?: string;           shadowTintBlendMode?: BlendMode;   shadowTintOpacity?: number;
highlightTint?: string;        highlightTintBlendMode?: BlendMode; highlightTintOpacity?: number;
```

`PRESET_DEFAULTS` 里对应默认值：`sCurveIntensity: 0`、`curveBlendMode: 'soft-light'`、
`shadowTint: ''`、`shadowTintBlendMode: 'multiply'`、`shadowTintOpacity: 0`、
`highlightTint: ''`、`highlightTintBlendMode: 'soft-light'`、`highlightTintOpacity: 0`；
`resolvePreset()` 逐项 `??` 填充，旧自定义预设（缺字段）原样可用。

**暗角蒙版**由 `scripts/generate_vignette.py` 生成（`INNER_RADIUS = 0.68`）：
`vignette.png` 1024×1024 RGBA、117,094 B、sha256 `e02d6c6ba3b6b9a389ae29c07bb3672d8a817b92465acfb6e26e941b3d8e6561`；
alpha 剖面实测 `ρ=0.65 → 0`、`0.70 → 3`、`0.75 → 31`、`0.80 → 81`、`0.85 → 139`、`0.90 → 196`、`1.0 → 255`。

### 40.4 模块三：9 卷重调（逐卷配方）

| 预设 | `curveBlendMode` / `sCurveIntensity` | 暗部层 | 高光/柔光层 | 暗角 | 其它 |
| --- | --- | --- | --- | --- | --- |
| `gd-200` 经典金 200 | `soft-light` / 0.32 | `#2D1C0C` `multiply` 0.10 | `#FFC85F` `soft-light` 0.22 | 0.26 | — |
| `pt-400` 人像 400T | `soft-light` / 0.24 | `#0A1623` `exclusion` 0.08 | `#FFDAC3` `soft-light` 0.18 | — | — |
| `um-400` 都市 400 | `overlay` / 0.28 | — | `#0F2D5F` `soft-light` 0.18 | 0.34 | — |
| `cp-200` 复古彩 200 | `soft-light` / 0.26 | `#3A2612` `multiply` 0.12 | `#F5B964` `soft-light` 0.20 | 0.28 | — |
| `fj-400` 富士 400 | `soft-light` / 0.30 | `#082026` `exclusion` 0.12 | `#146E5F` `soft-light` 0.16 | — | — |
| `ek-100` 柯达 100 | `overlay` / 0.34 | `#141923` `color-burn` 0.06 | — | 0.38 | — |
| `cs-800T` 电影 800T | `overlay` / 0.26 | — | `#125596` `soft-light` 0.28 | — | 径向暖红 `rgba(255,55,30,0.08)`（`screen`）+ halation |
| `hp-400-bw` 黑白 400 | `soft-light` / 0.30 | — | — | — | 先 `color` 叠 `#808080` 去色，再同源 `soft-light` 0.30 |
| `tx-400-bw` 黑白 400T | `overlay` / 0.42 | — | — | 0.42 | 去色同 `hp-400-bw`，同源 `overlay` 0.42 |

所有 9 卷在门禁里逐项核对：`s-curve` 层必须存在且 `opacity === min(0.42, sCurveIntensity)`、
`blendMode === curveBlendMode`、无 `blurRadius`；黑白卷的 `s-curve` 必须排在 `mono` **之后**；
`shadow-tint` / `highlight-tint` 的颜色、blendMode、opacity 与上表逐位相等。

### 40.5 模块四：胶片卡渐变 / ISO 角标 + 00 NO FRAME 日期双层暗影

**胶片卡（`FilmCard.tsx`）**：删除 3 条 `swatchZone` 纯色块，卡片头改成
`<LinearGradient colors={[top, mid, bottom] as const} start={{x:0.15,y:0}} end={{x:0.4,y:1}}>`，
保留 `swatchSheen` 高光。右上角新增微角标：

| 预设 | 角标 | 预设 | 角标 |
| --- | --- | --- | --- |
| `gd-200` / `cp-200` | `ISO 200` | `pt-400` / `um-400` / `fj-400` | `ISO 400` |
| `ek-100` | `SLIDE` | `cs-800t` | `800T` |
| `hp-400-bw` / `tx-400-bw` | `B&W` | 其它 | 名字末段数字 → `ISO n`，否则 `FILM` |

角标底色/字色按渐变顶端色（`swatchZones(preset.color)` 的最后一段）亮度自适应：
亮度 > 0.62 用 `rgba(255,255,255,0.72)` 底 + 近黑字，否则 `rgba(0,0,0,0.55)` 底 + 近白字。
选中勾从 `right: 4` 挪到 `left: 6`，避开角标与 2pt 选中导轨。

**`00 NO FRAME` 日期/地名双层暗影**（三处同口径，保证"预览 = 成片"）：

| 位置 | 实现 |
| --- | --- |
| `DateGlyphs.tsx` | `dateGlyphLayers(..., haloShadow = true)` 在**所有材质层下面**垫两层黑色同字形副本：`halo-around`（字色 `rgba(0,0,0,0.55)`、阴影 `rgba(0,0,0,0.82)`、半径 `max(3, 9.7S)`）+ `halo-drop`（字色 `rgba(0,0,0,0.62)`、阴影 `rgba(0,0,0,0.92)`、半径 `max(1.5, 3.5S)`、向下 `max(1, 0.9S)`）；默认 `false` 时返回值与 v1.8.6 逐字节一致 |
| `FramePreviewLayer.tsx` | 纯文字水印分支：`fullBleed` 时返回两层 `<Text>`（`noFrameHaloStyle` 大半径 + `noFrameFaceStyle` 贴边），否则仍是单层；两处 `<DateStamp>` 传 `haloShadow={fullBleed}` |
| `FilmCompositor.tsx` | 画内日期/地名同款双层 Text（`NO_FRAME_HALO_COLOR` / `noFrameHaloStyle` / `noFrameFaceStyle`）；`QuartzPiece` 新增 `haloShadow` prop 并透传 `DateStamp`；两处调用传 `haloShadow={fullBleed}` |

白边水印（`fullBleed === false`）**零变化**：不加任何额外阴影、层数不变 —— 用户只要求无框模式可读。

### 40.6 验证清单与门禁

15 道探针全部 EXIT 0（workspace 根，`node <probe>` 直跑；原始输出 `_gate_v187_*.out.txt`）：

| # | 门禁 | 本版实测 |
| --- | --- | --- |
| 1 | `_probe_date_engine.cjs` | 3372 条 / 0 失败（v1.8.7 四档字体族/层数/材质配方/transform/halo） |
| 2 | `_probe_film_look.cjs` | 1743 条 / 0 失败（新增 `exclusion`/`color-burn` 混合、S-Curve/tint 层、暗角 68% + multiply、halation 0.08、预算重定标） |
| 3 | `_probe_geo_lock.cjs` | 16207 通过 / 0 失败 |
| 4 | `_probe_noframe_v181.cjs` | 455 条 / 0 失败 |
| 5 | `_probe_noframe_watermark.cjs` | 458 条 / 0 失败 |
| 6 | `_probe_skin_material.cjs` | 1069 条 / 0 失败 |
| 7 | `_probe_v180_seams.mjs` | 1349 条 / 0 失败（`dateEngine` 透传点期望改为 2：取景器预览 + 合成器） |
| 8 | `_probe_lead_integration.mjs` | 315 条 / 0 失败 |
| 9 | `_probe_capture_quality.mjs` | 78 条 / 0 失败 |
| 10 | `_probe_v184_camera.cjs` | 960 条 / 0 失败 |
| 11 | `_probe_v185_place.cjs` | 468 条 / 0 失败 |
| 12 | `_probe_v185_frame.cjs` | 1781 条 / 0 失败 |
| 13 | `_haze_audit.mjs` | 9/9 卷 PASS；超预算 0/9、结构门禁 0 失败、暗角问题 0（预算按 v1.8.7 染色契约重定标：whiteLoss ≤0.14 / veilHigh ≤0.10 / veilMid ≤0.10 / satFloor ≥0.88） |
| 14 | `_purity_audit.mjs` | 64 条 / 0 失败，`RESULT: PURE` |
| 15 | `_probe_v186_perf.cjs` | 241 条 / 0 失败（`framePreviewNode` 依赖新增 `settings.dateEngine`） |

- `npx tsc --noEmit -p tsconfig.json` → **EXIT 0**。
- `npx expo export --platform ios --no-bytecode` → **EXIT 0**，bundle
  `index-f22b0f86b99df58a4b838fde35a2dd2c.js` **1,358,721 B**。
- 探针改动（只改口径，不放宽语义）：`_probe_date_engine.cjs` 的 §4 冻结表换 v1.8.7 值、
  §9 改为按 `dateGlyphLayers()` 配方逐层核对；`_probe_film_look.cjs` 的图层白名单 16 键、
  `BLEND` 增 `exclusion` / `color-burn`；`_haze_audit.mjs` 预算重定标、结构门禁按声明上限
  区分 `shadow-tint` / `highlight-tint` / `s-curve`、暗角门禁改 `multiply` 数学；
  `_probe_v186_perf.cjs` / `_probe_v180_seams.mjs` / `_probe_v185_frame.cjs` /
  `_probe_noframe_v181.cjs` 各一处锚点跟随新代码形态。

### 40.7 已知缺口与如实说明

- **`s-curve` 不是真正的曲线**：RN 没有 color matrix / LUT 通道，本版用"同源照片副本按
  `soft-light`/`overlay` 自叠"近似 S 曲线。好处是零新依赖、零逐像素 JS；代价是白位会被
  轻微抬高 —— 所以 `_haze_audit.mjs` 的 `whiteLoss` 预算从 0.02 调到 **0.14**，并如实打印每卷实测值
  （最大 0.0961 cp-200），不是"看起来没变所以放过"。
- **暗角是预烘 PNG**（1024×1024）而不是逐像素 shader；`multiply` 下中心 alpha=0 不参与混合，
  四角乘向深青黑 `(6,14,20)`。蒙版重生成会改变 `vignette.png` 的 sha256（见 §40.3）。
- **`mixBlendMode` 在 iOS RN 上映射到 CALayer 的 compositingFilter**，旧设备/低电量模式下
  个别 blend 可能被系统降级为 normal；图层顺序与不透明度仍保证"就算退化也是同源图叠同源图"，
  不会出现第三种颜色。
- **48MP 仍然不存在**：expo-camera 57.0.6 iOS 的 `PictureSize` 只有 9 个枚举串，`'Photo'` 是
  4:3 全幅（4032×3024），三档画质只改导出画布长边。此结论与 v1.8.6 §39.1 一致，未变。
- 四档字形的差异在 `12pt` 设置页样例上靠字体族 + 阴影已可分辨；再细小的差异（例如
  `letterSpacing` 的 ±0.1pt）不做承诺 —— 那是系统字体渲染的舍入范围。

### 40.8 产物指纹

- 本地提交 `caacdaab68c6c65db2735ad70145c529c247d682`（16 files changed，1170 insertions / 158 deletions）→ 远端
  `a2dd8c7ee717bde7d7b75dd91f2635e2bac2f436`（经 `_push_v180_api.py` 建树提交，16 blobs，本地/远端 tree 一致）。
- CI run `39051441240`（job `117450678403`，`build-ipa` 全绿；queued 00:54:34 → completed 01:02:38）；
  artifact `12107822191`（`FretroCam-unsigned-ipa`，10,481,563 B zip）。
- IPA：**10,595,953 B**，sha256 `baeacd27c14cec74570af97ea34a16b67facdafd3acd3ed72eaad0f7e2f93c16`
  （Release 回读 digest 与本地一致）。
- Release `v1.8.7` id `415949834`，asset id `651056201`（`FretroCam-v1.8.7-unsigned.ipa`）；
  下载 <https://github.com/lizimo20041023-oss/retro-film-cam/releases/download/v1.8.7/FretroCam-v1.8.7-unsigned.ipa>。
- 核验：
  - `python _verify_ipa_v187.py --local dist/_expo/static/js/ios/index-f22b0f86b99df58a4b838fde35a2dd2c.js`
    → `RESULT(local): OK`；
  - `python _verify_ipa_v187.py 12107822191` → `RESULT: OK`（原始输出 `_verify_v187_artifact.out.txt`）：
    包内 bundle 2,066,810 B；v1.8.7 新增串 `dateGlyphLayers` / `Courier-Bold` / `AmericanTypewriter` /
    `Copperplate` / `#F8F9FA` / `halo-around` / `halo-drop` / `steel-highlight` / `ccd-hard` / `lab-ink` /
    `sCurveIntensity` / `curveBlendMode` / `s-curve` / `shadow-tint` / `highlight-tint` / `ISO 200` / `800T` /
    `B&W` 全部命中（各 x2，Hermes ASCII + UTF-16 两种计数）；v1.8.5/v1.8.6 旧串 0 命中，`swatchZoneTop` 0；
    `makeRandom` canary 不在 ⇒ 内部名段（`DateGlyphSample` / `stockBadgeOf` 等）按设计跳过，不判失败；
    暗角 sha256 `e02d6c6b…8e6561` / 117,094 B / 中心 alpha 0 / 四角 255 全对；颗粒仍 v1.8.2 指纹与频谱；
    Info.plist 版本 `1.8.7`、bundle id 在、旧版本号 `1.8.6` 不在；10 张相框与 `no-frame.png` 齐全。
- export 冒烟：`npx expo export --platform ios --no-bytecode` EXIT 0 →
  `index-f22b0f86b99df58a4b838fde35a2dd2c.js` 1,358,721 B。
- 本地 IPA 副本：workspace 根 `FretroCam-v1.8.7-unsigned.ipa`（10,595,953 B，sha256 同 Release）。
- 本节为 docs-only 回填，`.github/workflows/build-ios-ipa.yml` 的 `paths-ignore: '**.md'` 会跳过 CI（与 v1.8.6 §39.9 同口径）。
- 环境：node v24.18.0；日期 2026-10-18。

### 40.9 文件改动

| 文件 | 改动 |
| --- | --- |
| `src/components/DateGlyphs.tsx` | 重写为四档材质配方（`GLYPH_FONT_FAMILY` / `glyphFontPx` / `dateGlyphLayers` / `haloLayers` / `combineTransforms` / `glyphTextTransform`），`OpticalDateText` 加 `haloShadow` |
| `src/components/DateStamp.tsx` | 加 `haloShadow?: boolean` 并透传（旧文字路径零改动） |
| `src/components/FramePreviewLayer.tsx` | props 加 `dateEngine?`，两处 `DateStamp` 传 `glyphStyle`/`glow`/`spot`/`haloShadow`，纯文字分支加无框双层暗影 |
| `src/components/FilmCompositor.tsx` | 顶部内窗黑灰带 0.28→0.12、高度 `min(2, …)`；无框日期双层暗影；`QuartzPiece` 加 `haloShadow` |
| `src/components/CameraScreen.tsx` | `framePreviewNode` 传 `dateEngine={settings.dateEngine}` 并加进依赖 |
| `src/components/SettingsScreen.tsx` | `OptionRow` 支持右侧 `preview`；`日期字形` 四行渲染 `DateGlyphSample`（`10 17 '26`） |
| `src/components/FilmCard.tsx` | 卡片头渐变 + ISO/SLIDE/800T/B&W 角标（亮度自适应），选中勾左移 |
| `src/constants/dateEngine.ts` | `DateGlyphStyleSpec.fontWeight` 增 `'400'`；四档 `fontWeight` / `trackingScale` / `glowScale` 重定（700/1.25/1、800/0.6/0.8、400/1.1/0.4、600/1.9/0.35） |
| `src/types/index.ts` | `ColorGradeConfig` 加 8 个可选字段（S-Curve / 分离色调） |
| `src/constants/presets.ts` | 8 个新默认值 + `resolvePreset` 填充 + 9 卷逐卷配方 |
| `src/utils/gradeLayers.ts` | 新增 `s-curve`（photo）/ `shadow-tint` / `highlight-tint`（color）层；暗角改 `multiply`；halation 0.06→0.08 |
| `src/constants/textures.ts` | 暗角纹理注释改 v1.8.7 口径（68% / multiply / 中心 alpha 0） |
| `scripts/generate_vignette.py` | `INNER_RADIUS = 0.68`，重新生成 `vignette.png` |
| `assets/textures/vignette.png` | 重新生成（117,094 B，sha256 `e02d6c6b…8e6561`） |
| `app.json` | version `1.8.6` → `1.8.7` |
| `README.md` | 本节 §40 + TOC |

工作区根（不进仓库）：`_probe_date_engine.cjs` / `_probe_film_look.cjs` / `_haze_audit.mjs` /
`_probe_v186_perf.cjs` / `_probe_v180_seams.mjs` / `_probe_v185_frame.cjs` / `_probe_noframe_v181.cjs`
（本版口径更新）、`_gate_v187_*.out.txt`、`_plate_stats.json` / `_plate_stats.py`。

---

## 41. v1.8.8：成片糊的根因（错位自叠层）与真机发热三刀

> 用户原话（m05280）：「为什么这么糊啊，之前还不会的，而且还是会发热。能不能再优化一下」
> 附两张成片：城市彩虹（1856×2257）与雪地日本（1857×2258），都是 `polaroid-600` 相纸。
> 硬约束沿用：**成片画质与观感不许降、不新增依赖、零 `as any`、CI 全绿**。

### 41.1 两条投诉 → 取证 → 根因

**取证一：到底哪里糊。** 把两张样张放大 2×~4× 后按行/列取亮度剖面（脚本在 workspace 根
`_v188_probe/`，零依赖 PIL+numpy）：

- 相纸内窗边界在 x=138 / x=1711 处是**单样本跳变**（img1 y=420 x=138：`217→105`；
  x=1711：`41→162→180`）⇒ 相框 PNG、日期字形、地名文字在成片里是**锐的**；
- 照片内部强竖边的 10–90% 过渡宽度是 **4–14px**（img1 x=967 为 6px、x=1033 为 7px、
  x=1097 为 7px），而 img2 近景建筑边只有 1px ⇒ **只有照片内容发虚，且是"重影式"发虚**。

**取证二：为什么"之前不会"。** `git show eb2971d:src/constants/presets.ts` 与 v1.8.7 逐字对比：
九支卷的 `contrast` 值**完全相同** ⇒ 「同源照片再画一遍」的对比度自叠在 v1.8.6 就存在。
v1.8.7 真正新增的是 **九支卷全开的 `sCurveIntensity` 0.24~0.42（第二条自叠）** + 两条
`shadow-tint`/`highlight-tint` 色层 + 提高的暗角 —— 新增的错位自叠就是"之前不会、现在糊"的来由。

**根因（一个 4pt 的盒差）。** `kind:'photo'` 的调色层是"同一张原图再画一遍 + 混合"：

- 底板照片的盒（`FilmCompositor`）：`left:-1, top:-1, width: innerWindow.width+2, height: innerWindow.height+2`
  （v1.8.5 防内窗黑边的 2px overscan，语义必须是"比窗口大"）；
- 自叠副本的盒（`FilmLookLayers` 里的 `StyleSheet.absoluteFill`）：取的是窗口容器的**内容盒**，
  窗口有 `borderWidth: 1` ⇒ 副本盒 = `innerWindow − 2`（比底板小 4pt）。

两个盒**同心但不同尺度**：324pt 的窗口上，底板 326、副本 322，缩放差 `326/322 ≈ 1.24%`；
窗口边缘的错位 = `(326−322)/2 = 2pt`；在 2268px 的成片画布上（361pt 舞台宽，约 6.28px/pt）
就是 **≈12.6px 的重影**。取景器把 `kind:'photo'` 层全滤掉了，所以**取景器看着仍然锐** ——
用户"之前还不会"的直觉完全正确，糊只发生在成片。

另外 `overlayUri`（重曝第二张底片）当时也用 `styles.fill`（容器内容盒），两张底片叠在一起
也有同样的 1.2% 尺度差 —— 重曝场景会额外发虚。

### 41.2 模块一：`photoBoxStyle` —— 底板 / 自叠副本 / 重曝共用同一个盒

- `FilmCompositor.tsx` 里把底板照片的盒抽成一个 `ImageStyle` 常量 `photoBoxStyle`：
  - 非 fullBleed：`{ position:'absolute', left:-1, top:-1, width: innerWindow.width+2, height: innerWindow.height+2 }`；
  - fullBleed（`00 NO FRAME`）：显式 `{ position:'absolute', left:0, right:0, top:0, bottom:0 }`
    （RN 0.86 的类型里已没有 `StyleSheet.absoluteFillObject`，这里不依赖它）。
- 底板照片 `<Image source={{uri: rawUri}} style={photoBoxStyle}>`、重曝底片
  `style={[photoBoxStyle, { opacity: overlayOpacity }]}`、自叠副本经
  `<FilmLookLayers photoBoxStyle={photoBoxStyle}>` 原样传下去 —— **三个渲染使用的就是同一个 style
  对象，缩放差恒 0，不是"调小到差不多"**。
- `FilmLookLayers.tsx` 的 `FilmLookLayersProps` 新增 `photoBoxStyle?: StyleProp<ViewStyle>`：
  photo 层渲染为 `[photoBoxStyle ?? StyleSheet.absoluteFill, overlayStyle(layer)]`；
  不传时退回旧口径（其它调用点零改动）。
- 为什么不是"把 overscan 去掉"：2px 是 v1.8.5 为内窗黑边留的保险，且它属于**底板语义**；
  让副本跟着底板走，既修糊又保住防黑边。

### 41.3 模块二：真机发热三刀（不改任何成片参数）

1. **相机会话可暂停**：`CameraScreen` 新增
   `const cameraActive = cameraGranted && !covered && !developing && appActive;`，
   `<CameraView active={cameraActive}>`。iOS 侧 `active` 直接落到
   `CameraSessionManager.updateCameraIsActive()`：`active=false` 会 `session.stopRunning()`，
   **真的停 AVCaptureSession**（不是停渲染）；面板打开 / 相册 / 胶片抽屉 / 冲印中 / 退后台
   都会停采集，回到取景再 `startRunning()`。`cameraClipNode` 的依赖数组补 `cameraActive`。
2. **前后台门控 + 地名节奏**：新增 `AppState.addEventListener('change', …)` 维护 `appActive`
   （只有 `'active'` 算前台）；取景器心跳 effect 在「没开预览 / 被面板盖住 / 退后台」时
   **直接不挂定时器**。地名刷新窗口从"30 秒心跳里每 60 秒真的醒一次 GPS"改成
   `PREVIEW_LOCATION_REFRESH_MS = 10 * 60_000`（十分钟），并用 `lastPreviewPlaceAtRef` 记录
   上次取定位的时刻；30 秒心跳从此只翻日期，不再碰定位与逆地理编码。
3. **取景器不再画两条全屏染色层**：`gradeLayers.ts` 新增
   `LIVE_DROPPED_COLOR_LAYER_KEYS = new Set(['shadow-tint','highlight-tint'])`，
   `planFilmLooks(preset,'live')` 过滤链增一步剔除；成片 `'composite'` 面**一条都不少**
   （分离色调原本就是成片观感的一部分）。每帧省两次全屏 `mixBlendMode` 混合。

全仓仍然零 `watchPositionAsync`（定位只取一次 + 10 分钟窗口），`CameraView` 仍然只挂一处
（`active` 只是停/启采集，不卸载重建会话，避免回来黑一下）。

### 41.4 验证清单与门禁

16 道探针全部 EXIT 0（workspace 根，`node <probe>` 直跑；原始输出 `_gate_v188_*.out.txt`）：

| # | 门禁 | 本版实测 |
| --- | --- | --- |
| 1 | `_probe_date_engine.cjs` | 3372 条 / 0 失败 |
| 2 | `_probe_film_look.cjs` | 1752 条 / 0 失败（新增"live 面零分离染色层、composite 面保留"断言） |
| 3 | `_probe_geo_lock.cjs` | 16207 通过 / 0 失败 |
| 4 | `_probe_noframe_v181.cjs` | 455 条 / 0 失败 |
| 5 | `_probe_noframe_watermark.cjs` | 458 条 / 0 失败 |
| 6 | `_probe_skin_material.cjs` | 1069 条 / 0 失败 |
| 7 | `_probe_v180_seams.mjs` | 1358 条 / 0 失败（live 面 `tintLive=0` 断言） |
| 8 | `_probe_lead_integration.mjs` | 315 条 / 0 失败 |
| 9 | `_probe_capture_quality.mjs` | 78 条 / 0 失败 |
| 10 | `_probe_v184_camera.cjs` | 947 条 / 0 失败（live 面 `expectedKeys` 过滤掉被剔除的染色层） |
| 11 | `_probe_v185_place.cjs` | 468 条 / 0 失败 |
| 12 | `_probe_v185_frame.cjs` | 1781 条 / 0 失败 |
| 13 | `_haze_audit.mjs` | 9/9 卷 PASS；超预算 0/9、结构门禁 0 失败、暗角问题 0 |
| 14 | `_purity_audit.mjs` | 64 条 / 0 失败，`RESULT: PURE` |
| 15 | `_probe_v186_perf.cjs` | 241 条 / 0 失败（`cameraClipNode` 依赖追加 `cameraActive`） |
| 16 | `_probe_v188_sharp.cjs` | 79 条 / 0 失败（**本版新探针**：糊的源码接线 + 独立算法量化 + 发热三刀 + 不回归） |

`_probe_v188_sharp.cjs` 的量化部分不 import 被测模块的常量，而是用 `computeFrameLayout` /
`roundInnerWindow` 自己算：324pt 窗口 → 底板盒 326 / 旧副本盒 322 → 缩放差 >1%、
边缘错位恰 2pt、2268px 画布上 >10px；并断言九支卷 `color.sCurveIntensity > 0`（证明"新增的
错位自叠确实全卷生效"）、photo 层零 `blurRadius`。

- `npx tsc --noEmit -p tsconfig.json` → **EXIT 0**。
- `npx expo export --platform ios --no-bytecode` → **EXIT 0**，bundle
  `index-96674eca2a23f03819953db9d70675b7.js` **1,359,126 B**。

### 41.5 已知缺口与如实说明

- **没有真机复测**：糊的根因是源码几何 + 样张剖面推导，修复是"三个渲染共用同一个盒"的
  结构性不变量，探针用独立算法量化了修复前后的错位量；但"用户手上确实变锐了"仍需真机确认。
- **发热只能降、不能归零**：expo-camera 57.0.6 iOS 的取景 session preset 是 `.photo` 全幅，
  这是原生侧常量；本版能做的是"不取景时真的停采集 + 不轮询 GPS + 每帧少两层混合"。
  预览缓冲区的像素量没有变，持续取景时的功耗不会变成"不热"，只是明显下降。
- **重曝场景**：两张底片现在同盒，但因为 `opacity` 混合本身，重曝的"叠影"仍在（那是功能），
  不会再额外多出一层 1.2% 的尺度差。
- **取景器与成片的色差**：live 面去掉分离染色层后，取景器会比成片少一点冷暖分离感 ——
  这是用"每帧省两次全屏混合"换来的，成片观感不受影响。
- **`mixBlendMode` 仍可能被系统降级**（v1.8.7 §40.7 同口径）；即便降级，自叠层现在与底板
  逐点同盒，退化结果只是"同源图叠同源图"，不会再有额外重影。
- **48MP 不存在**、`pictureSize` 只映射 9 个枚举 —— 与 §39.1 / §40.7 结论一致，本版未动。

### 41.6 产物指纹

- 本地提交 `e3947c527a7179c2c141d93a25c89bd1afff6bd9`（「v1.8.8：成片糊的根因修复 + 真机发热三刀（用户 m05280）」，
  6 files changed，300 insertions / 23 deletions；parent `6058abc`）→ 远端 master
  `4a1ab734511cd1426ca7c5f9480d7f8ac9934b92`（经 `_push_v180_api.py` 建树提交，133 blobs，本地/远端 tree 一致）。
- CI run `39056677238`（job `117465950490`，`build-ipa` 全绿；queued 02:06:59 → completed 02:19:03）；
  artifact `12109748964`（`FretroCam-unsigned-ipa`，10,481,035 B zip）。
- IPA：**10,596,187 B**，sha256 `9dafc5aade4af1a1460f3b5eee854f73df8ccb82484116ebaf43f773b633191f`
  （Release 回读 digest 与本地一致）。
- Release `v1.8.8` id `415984793`，asset id `651228464`（`FretroCam-v1.8.8-unsigned.ipa`）；
  下载 <https://github.com/lizimo20041023-oss/retro-film-cam/releases/download/v1.8.8/FretroCam-v1.8.8-unsigned.ipa>。
- 核验：
  - `python _verify_ipa_v188.py --local ..\_export_v188_lead\_expo\static\js\ios\index-96674eca2a23f03819953db9d70675b7.js`
    → `RESULT(local): OK`；
  - `python _verify_ipa_v188.py 12109748964` → `RESULT: OK`（原始输出 `_gate_v188_ipa_verify.txt`）：
    包内 115 entries、Hermes 主包 2,067,661 B；PRESENT 236 条 needle 全命中（ASCII + UTF-16 两种计数），
    ABSENT 122 条全 x0；v1.8.8 新增串 `photoBoxStyle` / `AppState` 命中；`makeRandom` canary 不在 ⇒ 内部名段
    （`cameraActive` / `appActive` / `lastPreviewPlaceAtRef` / `PREVIEW_LOCATION_REFRESH_MS` 等）按设计跳过，
    不判失败；颗粒仍 v1.8.2 指纹（sha256 `2d30d077…` / 512×512 / std 0.2616 / `<8px`=65.7%）；
    暗角仍 v1.8.7 指纹（sha256 `e02d6c6b…` / 117,094 B / 中心 alpha 0 / 四角 255）；Info.plist 版本 `1.8.8`、
    bundle id 在、旧版本号 `1.8.7` 不在；10 张相框与 `no-frame.png` 齐全。
- export 冒烟：`npx expo export --platform ios --no-bytecode` EXIT 0 →
  `index-96674eca2a23f03819953db9d70675b7.js` 1,359,126 B。
- 本地 IPA 副本：workspace 根 `FretroCam-v1.8.8-unsigned.ipa`（10,596,187 B，sha256 同 Release）。
- 本节为 docs-only 回填，`.github/workflows/build-ios-ipa.yml` 的 `paths-ignore: '**.md'` 会跳过 CI
  （与 v1.8.7 §40.8 同口径）。
- 环境：node v24.18.0；日期 2026-10-18。

### 41.7 文件改动

| 文件 | 改动 |
| --- | --- |
| `src/components/FilmCompositor.tsx` | 新增 `photoBoxStyle: ImageStyle`（非 fullBleed = `innerWindow+2`/`-1`，fullBleed = 显式四边 0）；底板照片、重曝底片、`FilmLookLayers` 三处共用 |
| `src/components/FilmLookLayers.tsx` | props 新增 `photoBoxStyle?: StyleProp<ViewStyle>`，photo 层盒优先用它 |
| `src/components/CameraScreen.tsx` | `CameraView active={cameraActive}`；AppState 监听 + `appActive`；心跳门控与 `PREVIEW_LOCATION_REFRESH_MS = 10 * 60_000` + `lastPreviewPlaceAtRef`；`cameraClipNode` 依赖加 `cameraActive` |
| `src/utils/gradeLayers.ts` | `LIVE_DROPPED_COLOR_LAYER_KEYS`（`shadow-tint`/`highlight-tint`），live 面剔除、composite 面保留 |
| `app.json` | version `1.8.7` → `1.8.8` |
| `README.md` | 本节 §41 + TOC |

工作区根（不进仓库）：`_probe_v188_sharp.cjs`（新）、`_probe_film_look.cjs` / `_probe_v180_seams.mjs` /
`_probe_v184_camera.cjs` / `_probe_v186_perf.cjs`（口径跟随）、`_v188_probe/`（样张取证脚本与裁切图）、
`_gate_v188_*.out.txt`。

---

## 42. v1.8.9：闪光灯拍摄被停机打断（v1.8.8 发热改动的回归）与修法

### 42.1 用户报告与取证

用户 m06262（附图）：「使用闪光灯拍照拍不了，出现底下这行提示」。截图里取景页底部是红色错误卡，
原文 `顯影失敗 CameraImageCaptureException: Image could not be captured (at
ExpoCamera/CameraPhotoCapture.swift:130)`，提示「輕觸畫面繼續拍攝」；**关键细节：取景画面是冻结的**
—— 这说明 `AVCaptureSession` 已经被停掉了，不是测光/闪光灯硬件的问题。

原生代码取证（`node_modules/expo-camera/ios/Current/`，57.0.6）：

- `CameraSessionManager.swift:119-130` `func updateCameraIsActive()`：`delegate.active` 为假时直接
  `self.session.stopRunning()`；为真时 `if hasAvailableCameraDevice && !self.session.isRunning { self.session.startRunning() }`；
- `CameraView.swift:183-189` `var active = true { didSet { sessionQueue.async { self.sessionManager.updateCameraIsActive() } } }`
  —— 改 `active` 就是异步停机/开机；
- `CameraView.swift:349-361` `takePictureRef` / `takePicturePromise` 直接调
  `photoCapture.takePicturePromise(...)`，**不经过 `sessionQueue`**；
- `CameraPhotoCapture.swift:107` 把请求交给 `photoOutput.capturePhoto(with:delegate:)`，回调
  `didFinishProcessingPhoto` 的 `if error != nil` 分支（`:129-131`）抛 `CameraImageCaptureException()`，
  错误串定义在 `Common/CameraExceptions.swift:23`（`"Image could not be captured"`）。

也就是说：**停机请求与在飞的拍摄请求没有任何互斥**，停会话会把 `capturePhoto` 中止掉。

### 42.2 根因链条（v1.8.8 引入）

v1.8.8 为降发热加了 `CameraView active={cameraActive}`，表达式是
`cameraGranted && !covered && !developing && appActive`；而 `handleShutter` 的顺序是
**先** `setStatus({ kind: 'developing', stage: 'normalizing' })`、**再** `await camera.takePictureAsync(...)`：

1. 快门按下 → `developing` 提交 → 下一帧 `cameraActive` 变 `false`；
2. expo-camera 在 `sessionQueue` 上异步 `stopRunning()`；
3. 此时 `capturePhoto` 正在飞（静态全幅拍摄要几百毫秒）→ 被中止 → 错误分支抛异常；
4. 闪光灯拍摄要**预闪 + 测光**，耗时比普通拍摄更长，几乎 100% 输掉这次竞态；普通拍摄偶尔输，
   所以现象看起来像「只有开闪光灯才拍不了」。

`developing` 这个依赖是 v1.8.8 发热改造里唯一"能动到拍摄"的部分，回归面 100% 对得上用户症状。

### 42.3 修法：冲印期不再停会话

```ts
// v1.8.8 的写法（回归）
const cameraActive = cameraGranted && !covered && !developing && appActive;
// v1.8.9
const cameraActive = cameraGranted && !covered && appActive;
```

- 拍摄链路优先：快门按下后到 `takePictureAsync` 完成期间，会话**任何状态都不许去停**；
- 面板盖住（`covered`）/ 退后台（`appActive === false`）这两个真正的耗电大头继续停采集 ——
  它们不会与拍摄并发（面板打开时快门被 UI 遮住，退后台时没有按下动作）；
- 冲印期多跑几秒采集的耗电，远小于"把一次拍摄打断"的代价（冲印本身只有几秒，且取景器已被冲印层盖住）。

### 42.4 为什么不干脆把 `active` 整个关掉

`active` 是 v1.8.8 降发热的主力（面板浏览 / 退后台时真的停采集），关掉它等于退回 v1.8.7 的发热水平；
这次要修的是"依赖了错误的维度"（冲印状态），不是"停机这个手段"本身。修完的表达式只剩
**面板可见性**与**前台**两个不会与快门并发的条件。

### 42.5 17 道门禁（全部 EXIT 0）

| # | 门禁 | 本版实测 |
| --- | --- | --- |
| 1 | `_probe_date_engine.cjs` | 3372 条 / 0 失败 |
| 2 | `_probe_film_look.cjs` | 1752 条 / 0 失败 |
| 3 | `_probe_geo_lock.cjs` | 16207 通过 / 0 失败 |
| 4 | `_probe_noframe_v181.cjs` | 455 条 / 0 失败 |
| 5 | `_probe_noframe_watermark.cjs` | 458 条 / 0 失败 |
| 6 | `_probe_skin_material.cjs` | 1069 条 / 0 失败 |
| 7 | `_probe_v180_seams.mjs` | 1358 条 / 0 失败 |
| 8 | `_probe_lead_integration.mjs` | 315 条 / 0 失败 |
| 9 | `_probe_capture_quality.mjs` | 78 条 / 0 失败 |
| 10 | `_probe_v184_camera.cjs` | 947 条 / 0 失败 |
| 11 | `_probe_v185_place.cjs` | 468 条 / 0 失败 |
| 12 | `_probe_v185_frame.cjs` | 1781 条 / 0 失败 |
| 13 | `_haze_audit.mjs` | 9/9 卷 PASS；超预算 0/9、结构门禁 0 失败 |
| 14 | `_purity_audit.mjs` | 64 条 / 0 失败，`RESULT: PURE` |
| 15 | `_probe_v186_perf.cjs` | 241 条 / 0 失败 |
| 16 | `_probe_v188_sharp.cjs` | 80 条 / 0 失败（S3.3 同步新表达式 + 新增 S3.3b「`cameraActive` 不得含 `developing`」） |
| 17 | `_probe_v189_flash.cjs` | 51 条 / 0 失败（**本版新探针**） |

`_probe_v189_flash.cjs` 分六组钉不变式：

- S1：**原生侧机制冻结** —— 直接读 `node_modules/expo-camera/ios/Current/*.swift`，断言
  `active.didSet → updateCameraIsActive → stopRunning`、`takePicturePromise` 不经过 `sessionQueue`、
  `didFinishProcessingPhoto` 的 error 分支抛 `CameraImageCaptureException`（这条因果链是"为什么必须
  有这个修复"的证据，不许被后人当成多余的防御删掉）；
- S2：`cameraActive` 表达式**不得**出现 `developing` / `status`（含一个专门抓 `status.kind` 的正则），
  且 `covered` / `appActive` / `cameraGranted` 三个门控一个不许丢；注释里必须带
  `CameraPhotoCapture.swift:130` 与用户单号 `m06262`（可追溯）；
- S3：停机开关接线 —— `CameraView` 单挂载、`active={cameraActive}` 唯一、`cameraClipNode` 依赖含
  `cameraActive` 与 `handleCameraReady`、`AppState` 监听仍在、无"条件渲染 CameraView"；
- S4：**拍摄顺序与闪灯链路** —— `setStatus(developing)` 仍在 `takePictureAsync` 之前（顺序不变，
  修的是 `cameraActive` 不再跟它）、快门入口守卫 `!camera || !cameraReady || developing` 仍在、
  `shotLockRef` 仍在入口置位、`takePictureAsync` 全屏只一处且参数仍是
  `quality: 1 / skipProcessing: false / exif: false`、闪灯三档 `off/on/auto` 与
  `flash={facing === 'back' ? flashMode : 'off'}`、`handleCycleFlash` 依赖 `[facing, flashMode]` 全部未变；
- S5：降发热其余两刀（心跳门控 / 10 分钟地名窗口 / live 面剔除分离染色层）**不许被顺手回退**
  —— 修 bug 不许用"把优化全关掉"的方式；
- S6：成片质量链路零回归（`photoBoxStyle` 三处共用、`presentation="print"`、JPEG 0.98、
  零 `as any`）与版本号 `1.8.9`。

- `npx tsc --noEmit -p tsconfig.json` → **EXIT 0**。
- `npx expo export --platform ios --no-bytecode` → **EXIT 0**，bundle
  `index-48a8a051a6b55afc6a8ddfbffbf873c3.js` **1,359,121 B**；
  `python _verify_ipa_v189.py --local ...` → `RESULT(local): OK`。

### 42.6 已知缺口与如实说明

- **没有真机复测**：修复依据是"停机会中止在飞拍摄"这条原生因果链 + 用户截图里冻结的取景画面；
  装上后建议**连续拍 10 张闪光灯照片**再确认，并顺手试一次开闪光灯连拍。
- **冲印期会话保持运行**：相比 v1.8.8 会多一点功耗，但那只有冲印的几秒，且这段时间取景器画面被
  冲印层盖住；持续取景 / 面板浏览 / 退后台的停机策略都没变。
- **面板关闭后立刻按快门仍有极小的"会话重启中"窗口**（`startRunning()` 是异步的，iOS 没有
  "会话已就绪"的 JS 回调）。这个窗口在 v1.8.8 之前的版本同样存在（面板掩盖时并不停会话，所以
  从未暴露）；本版没有新增该风险，也不打算用"永远不停会话"去绕开它。
- 其余缺口与 §41.6 一致：没有真机、解析不了 `.photo` preset 的预览缓冲成本、`mixBlendMode` 仍可能
  被系统降级等。

### 42.7 产物指纹

| 项目 | 值 |
| --- | --- |
| 本地提交 | `5be5daec3b8b8fdca5b7f6f94eee984bc92cd957`（「v1.8.9：修闪光灯拍摄被停机打断（用户 m06262）」，3 files +152/−3） |
| 远端 master | `01b42f73b2c9d9625cdf4b466603c36860b59275`（TREE MATCH True，133 blobs 全一致） |
| CI run / job | `39058923298` / `117472663936`（`build-ipa`，各 step 全 success） |
| Artifact | `12111011715`（`FretroCam-unsigned-ipa`，10,481,341 B） |
| IPA | `FretroCam-v1.8.9-unsigned.ipa` **10,596,096 B**，sha256 `e5eac2f26fc7f96b1e161cd7b717fd5b75bc92930aa9124f9f7c3d6e8f73114c` |
| Release | tag `v1.8.9`，id `415997408`，asset id `651288459`（回读 size / digest 双 MATCH） |
| 下载 | `https://github.com/lizimo20041023-oss/retro-film-cam/releases/download/v1.8.9/FretroCam-v1.8.9-unsigned.ipa` |

IPA 回读核验（`python _verify_ipa_v189.py 12111011715` → **`RESULT: OK`**，原始输出
`_gate_v189_ipa_verify.txt`）：

- `ipa entries = 115`，`Payload/FretroCam.app/main.jsbundle` **2,067,653 B**；
- 「应该存在」**244 行全命中**（x2/x3），无缺项；16 条 `x0` 全部是 `EXPLAINED_ABSENT` 里预先登记的
  兜底/内联符号（如 `COUNTRY_NAMES`、`hashSeed`、`buildSprocketDetails`、`GradeLayerView` 等）；
- Info.plist 2469 B，`1.8.9` **FOUND**、`com.canyerylee.fretrocam` **FOUND**；
- 颗粒贴图 249,201 B / sha256 `2d30d07745e2863d…` / 512×512 / std 0.2616 / `<8px` 频带 65.7%（门禁 0.60）；
- 光学暗角 117,094 B / sha256 `e02d6c6ba3b6b9a3…`（v1.8.7 重烤、v1.8.9 未动）/ 中心 α=0 / 四角 α=255；
- 10 张相框素材齐全，`no-frame.png`、`grain/light-leak/vignette/dust` 四张贴图齐全。

export 冒烟：`npx expo export --platform ios --no-bytecode` → EXIT 0，bundle
`index-48a8a051a6b55afc6a8ddfbffbf873c3.js` **1,359,121 B**（v1.8.8 为 1,359,126 B）；
`npx tsc --noEmit -p tsconfig.json` → EXIT 0。

### 42.8 文件改动

| 文件 | 改动 |
| --- | --- |
| `src/components/CameraScreen.tsx` | `cameraActive` 去掉 `!developing`（冲印期不再停会话）；注释补 v1.8.9 回归因果链（原生行号 + 错误串） |
| `app.json` | version `1.8.8` → `1.8.9` |
| `README.md` | 本节 §42 + TOC |

工作区根（不进仓库）：`_probe_v189_flash.cjs`（新）、`_probe_v188_sharp.cjs`（S3.3/S3.3b 口径跟随）、
`_verify_ipa_v189.py` / `_release_v189.py` / `_commit_v189_msg.txt`、`_gate_v189_run.out.txt`、
`_export_v189_lead/`。

---

## 43. v1.8.10：底片库整套重做（九支新代号 + 仿色 + 旧照片兼容）

### 43.1 用户需求（m06500）

原话：「图一这张图是我现在 app 的滤镜库，我要求把他删了重做，接下来，参考我给你发的这几种胶卷，
对其进行仿色并导入我 app 中的数据库中『Kodak Gold 200 / Kodak Portra 400 / Kodak UltraMax 400 /
Kodak ColorPlus 200 / Fujifilm 400 / Kodak Ektar 100 / CineStill 800T / Ilford HP5 Plus 400 /
Kodak Tri-X 400』且必须每个换名字成新代号，以防侵权纠纷，然后再修改成新的 ipa 出来」。

三条硬要求：① 旧九支卷**整套删掉**，不是停用；② 按九种胶卷的样张性格**重新仿色**；
③ 每支卷**必须换新代号**（用户红线：防商标纠纷）。附图给了九种胶卷的参考成片与性格描述：

| 参考胶卷 | 性格（用户附图描述） |
| --- | --- |
| Gold 200 | 暖黄色、阳光感、复古日常，适合旅行和校园 |
| Portra 400 | 肤色自然、柔和、层次好，人像经典 |
| UltraMax 400 | 色彩相对鲜明，日常/街拍/旅行都万能 |
| ColorPlus 200 | 暖调、微复古，比较便宜的日常胶卷 |
| Fujifilm 400 | 日常记录舒服、颜色自然，ISO 400 好用 |
| Ektar 100 | 颗粒非常细、颜色浓郁，风景/建筑特别漂亮 |
| CineStill 800T | 夜景王者，霓虹灯、高光晕光、蓝红色调有电影感 |
| Ilford HP5 Plus 400 | 经典黑白，颗粒感与反差有味道，人文/街拍/情绪人像好用 |
| Kodak Tri-X 400 | 比 HP5 更经典纪实，黑白反差和颗粒有辨识度，街头夜景 |

### 43.2 九支新卷（代号 + 仿色）

命名规则：两个字母 + ISO 数字（黑白卷带 `-bw` 后缀），**不含任何厂商名/商品名/产品线名**；
卡片副标题也重写，不复用旧文案。顺序 = 抽屉卡片顺序，第一支是默认卷。

| id | 代号 | 副标题 | 色温 | 色调 | 饱和 | 反差 | 分离染色 | S-Curve | 暗角 | 特殊 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `su-200` | SU-200 | 暖阳日光 · 通透日常 | +0.14 | −0.13 | 1 | 1.05 | 0.12 | 0.30 soft-light | 0.24 | 暖棕暗部 multiply + 金色高光 |
| `vl-400` | VL-400 | 丝绒人像 · 肤色自然 | +0.09 | −0.13 | 0.95 | 1 | 0.10 | 0.22 soft-light | 0.16 | 冷蓝暗部 exclusion + 柔桃高光（最平的反差，人像专用） |
| `vx-400` | VX-400 | 鲜活色彩 · 万能日常 | −0.08 | +0.13 | 1.06 | 1.14 | 0.12 | 0.30 overlay | 0.30 | 冷蓝柔光，街拍/旅行 |
| `am-200` | AM-200 | 琥珀怀旧 · 黄昏暖调 | +0.15 | −0.14 | 1 | 1.06 | 0.15 | 0.26 soft-light | 0.27 | 琥珀暗部 multiply + 轻漏光 0.12 |
| `nz-400` | NZ-400 | 自然清透 · 日系冷调 | −0.10 | +0.18 | 0.97 | 1 | 0.12 | 0.28 soft-light | 0.20 | 青绿暗部 exclusion，低对比 |
| `ri-100` | RI-100 | 浓郁反转 · 零雾高饱和 | 0 | 0 | 1.06 | 1.18 | 0.11 | 0.34 overlay | 0.36 | **零颗粒**（`GRAINLESS_PRESET_IDS`）+ 极淡冷黑 color-burn |
| `nt-800t` | NT-800T | 夜色钨丝 · 霓虹光晕 | −0.13 | 0 | 1.05 | 1.10 | 0.13 | 0.26 overlay | 0.24 | 暖红光晕 `halation:1`（screen ≤0.08）+ 漏光 0.16 |
| `mn-400-bw` | MN-400 BW | 纪实黑白 · 中灰层次 | 0 | 0 | 0 | 1.10 | 0 | 0.30 soft-light | 0.22 | `mono: true`，保中灰层次 |
| `sl-400-bw` | SL-400 BW | 硬朗银盐 · 高反差 | 0 | 0 | 0 | 1.24 | 0 | 0.42 overlay | 0.42 | `mono: true`，最硬曲线 + 最重暗角 |

数值纪律（v1.8.5 起冻结、v1.8.7 只改配方不改公式）：色层 opacity 必须落在 `[0.03, 0.06]`
（`_haze_audit` 全绿的前提），S-Curve ≤ 0.42，`halation × 0.08 ≤ 0.08`；`grain` 列统一 0.045
（G02 冻结口径：颗粒粗细归用户全局档位，不靠数据分家；零颗粒卷是 0 并由 `GRAINLESS_PRESET_IDS` 兜底）。
因此九支卷的性格差异主要来自**色相倾向 + 反差 + 分离染色 + 暗角**，而不是靠加不透明度堆出来。

### 43.3 商标规避

- `PRESETS` 数据里只有新代号与自写副标题；旧商品名（GD-200 / PT-400 / … / TX-400 BW）、
  旧副标题（金色日光 / 浓郁街拍 / 日系青绿 / 反转锐利 / 电影钨丝灯）**全部删除**，
  连 `FilmCard` 的角标映射与注释都换掉了。
- 九种参考胶卷的厂商名/商品名（Kodak / Portra / Ektar / UltraMax / ColorPlus / CineStill /
  Ilford / Fujifilm / HP5 / Tri-X）在 `src/` 里一次都不出现；仓库源码与产物都靠门禁守着：
  `_probe_v1810_stocks.cjs` 的 S2（源码，词边界）与 `_verify_ipa_v1810.py` 的 `SHOULD_BE_ABSENT`
  （压缩后的包内字符串）。
- 说明书只写"参考九种经典胶卷的观感"，不出现品牌名。

### 43.4 旧照片兼容（不能碎）

旧照片的 `presetId` 存在照片记录里，换库后如果直接查表，旧照片会默默变成默认卷（甚至下标错位）。
本版新增 `LEGACY_PRESET_ID_ALIASES`，把旧 id 映射到**性格最接近**的新卷：

| 旧 id | → 新 id | 理由 |
| --- | --- | --- |
| gd-200 | su-200 | 都是暖日光日常 |
| pt-400 | vl-400 | 都是低反差人像 |
| um-400 | vx-400 | 都是高饱和万能卷 |
| cp-200 | am-200 | 都是复古暖调 |
| fj-400 | nz-400 | 都是日系冷调自然 |
| ek-100 | ri-100 | 都是高饱和零颗粒反转观感 |
| cs-800t | nt-800t | 都是钨丝夜景+光晕 |
| hp-400-bw | mn-400-bw | 都是中灰纪实黑白 |
| tx-400-bw | sl-400-bw | 都是高反差硬黑白 |

`findPresetIndex(id)` 的顺序是：**先查别名表 → 再查 `PRESETS` → 都没有才回落 0**（默认卷）。
`DEFAULT_PRESET_ID` 从旧默认（gd-200）改成 `su-200`，即新装用户第一支卷。

### 43.5 门禁与验证

- `npx tsc --noEmit -p tsconfig.json` → **EXIT 0**。
- **18 道门禁全绿、0 失败**（`_gate_v1810_run.out.txt`）：G01 3372 / G02 1754 / G03 16207 / G04 455 /
  G05 458 / G06 1069 / G07 1358 / G08 315 / G09 78 / G10 947 / G11 468 / G12 1781 / G13（9 卷超预算 0）/
  G14 64 / G15 241 / G16 80 / G17 51 / **G18 204**，合计约 2.89 万条断言。
- 新增 `_probe_v1810_stocks.cjs`（204 条，零新依赖）六组：
  S0 装载与版本；S1 九卷数据完整性（id/代号正则、副标题格式、唯一性）；
  S2 商标规避（源码 27 条禁用词）；S3 兼容映射（9 别名目标互不重复、旧照片落点、
  `wrapPresetIndex` 环形）；S4 仿色性格（暖/冷/低反差/高饱和/零颗粒/光晕/黑白对比等约 40 条）；
  S5 图层纪律（无 blurRadius、色层 ∈[0.03,0.06]、S-Curve ≤0.42、零颗粒卷无 grain 层、mono 单层）；
  S6 接线（`FilmCard` 角标 9 个新 id、源码无旧 id 残留除别名表、`_haze_audit` 数据源、零 `as any`）。
- 过程中真实踩到并修掉的一条：`sl-400-bw` 最初把 `grain` 写成 0.075（想表达"颗粒重"），
  G02 `_probe_film_look.cjs` 的"颗粒列必须统一 = `PRESET_DEFAULTS.grain`"与"旧最坏乘积 ≤ 0.11"
  两条同时失败（0.075 × 2.2 = 0.165）→ 改回 0.045。**这正好说明门禁在守"颗粒粗细归全局档位"，
  底片数据只负责性格**。
- `_haze_audit.mjs` 的零颗粒名单原来从 `gradeLayers.ts` 的正则里抓（v1.8.5 时那里确实有一份），
  现在定义搬到了 `constants/presets.ts`，若不同步读新位置就会永远走 fallback —— 本版改成
  **先读 `presets.ts`、再兜底 `gradeLayers.ts`、最后 fallback `'ri-100'`**。
- `npx expo export --platform ios --no-bytecode` → **EXIT 0**，bundle
  `index-0dad5ac75ca2456c53c8ca0cbc362b0b.js` **1,359,374 B**；
  `python _verify_ipa_v1810.py --local ...` → `RESULT(local): OK`。
- 仍**没有真机复测**：装上后建议逐支卷各拍一张对比观感，重点看人像（VL-400 肤色）、
  夜景（NT-800T 光晕）与黑白（MN-400 BW / SL-400 BW 的层次差别）。

### 43.6 产物指纹

| 项目 | 值 |
| --- | --- |
| 本地提交 | `d6afa4fab7533ca3f5f154de424118f01e532967`（「v1.8.10：底片库整套重做（九支新代号 + 仿色 + 旧照片兼容，用户 m06500）」，6 files +290/−122） |
| 远端 master | `4dc05cd0d6841be0361d3d909d86f67dd8ba90cf`（TREE MATCH True，133 blobs 全一致） |
| CI run / job | `39061313006` / `117479687713`（`build-ipa`，各 step 全 success） |
| Artifact | `12111990741`（`FretroCam-unsigned-ipa`，10,481,732 B） |
| IPA | `FretroCam-v1.8.10-unsigned.ipa` **10,596,362 B**，sha256 `05f00b53afe61394f7a3ca7080243683ab739aa2edc43829dddaccea386f7ebe` |
| Release | tag `v1.8.10`，id `416012139`，asset id `651369518`（回读 size / digest 双 MATCH） |
| 下载 | `https://github.com/lizimo20041023-oss/retro-film-cam/releases/download/v1.8.10/FretroCam-v1.8.10-unsigned.ipa` |

IPA 回读核验（`python _verify_ipa_v1810.py 12111990741` → **`RESULT: OK`**，原始输出
`_gate_v1810_ipa_verify.txt`）：

- `ipa entries = 115`，`Payload/FretroCam.app/main.jsbundle` **2,067,908 B**（v1.8.9 为 2,067,653 B，
  +255 B 正是九支新代号的字符串差）；
- 「应该存在」全部命中（x2/x3），**零 `missing:`**；16 条 `x0` 全部是 `EXPLAINED_ABSENT` / 跳过
  登记的兜底/内联符号（如 `COUNTRY_NAMES`、`hashSeed`、`buildSprocketDetails`、`stockBadgeOf` 等）；
- 九支新 id（`su-200` … `sl-400-bw`）与九支新代号（`SU-200` … `SL-400 BW`）全部命中；
  旧商品名（`GD-200` … `TX-400 BW`）、旧副标题与商标词（`Kodak` / `Portra` / `Ektar` /
  `UltraMax` / `ColorPlus` / `CineStill` / `Ilford` / `Fujifilm` / `HP5` / `Tri-X`）全部 `x0`；
- Info.plist 2470 B，`1.8.10` **FOUND**、`com.canyerylee.fretrocam` **FOUND**；
- 颗粒贴图 249,201 B / sha256 `2d30d07745e2863d…`、光学暗角 117,094 B / sha256 `e02d6c6ba3b6b9a3…`
  （与 v1.8.9 同一份，换底片库没动成片管线的像素）；10 张相框素材齐全。

export 冒烟：`npx expo export --platform ios --no-bytecode` → EXIT 0，bundle
`index-0dad5ac75ca2456c53c8ca0cbc362b0b.js` **1,359,374 B**（v1.8.9 为 1,359,121 B）；
`npx tsc --noEmit -p tsconfig.json` → EXIT 0。

### 43.7 文件改动

| 文件 | 改动 |
| --- | --- |
| `src/constants/presets.ts` | `PRESETS` 九支卷整套替换（新 id/代号/副标题/仿色数值）；`GRAINLESS_PRESET_IDS` → `ri-100`；`DEFAULT_PRESET_ID` → `su-200`；新增 `LEGACY_PRESET_ID_ALIASES`；`findPresetIndex` 先查别名；文件头数值纪律补 v1.8.10 段、halation 口径修正为 ≤0.08 |
| `src/components/FilmCard.tsx` | `stockBadgeOf()` 角标 switch 换新 id（ISO 200 / ISO 400 / SLIDE / 800T / B&W）；头注释同步 |
| `src/utils/gradeLayers.ts` | 注释里的 EK-100 → RI-100、CS-800T → NT-800T（逻辑零改） |
| `src/components/FilmLookLayers.tsx` | 注释 EK-100 → RI-100（逻辑零改） |
| `app.json` | version `1.8.9` → `1.8.10` |
| `README.md` | 本节 §43 + TOC |

工作区根（不进仓库）：`_probe_v1810_stocks.cjs`（新）、`_probe_v188_sharp.cjs`（S4.5 版本号跟随）、
`_probe_v189_flash.cjs`（S6.8 版本号跟随）、`_haze_audit.mjs`（零颗粒数据源改读 presets.ts）、
`_make_v1810_scripts.py`、`_verify_ipa_v1810.py` / `_release_v1810.py` / `_commit_v1810_msg.txt`、
`_gate_v1810_run.out.txt`、`_export_v1810_lead/`。

## 44. v1.8.11：场景自适应冲印（按光线测光补偿）与水印位置两轴可设

### 44.1 用户需求（m06849）

两条，都是「设置里那个开关其实没用 / 调色是假的」这一类：

> ①「不要简单的调个色，而是深入底层代码，去修改这个滤镜的底层逻辑，而不是简简单单换个色调，
> 使得这个照片的质感很假很虚，要更换成那种可以根据光线变化而改变的，明部暗部也是要根据拍摄
> 场景自己去计算而不是简简单单换个色调和饱和度」
>
> ②「设置里『水印版式』需要修改，设置这一栏无法地名或者坐标在整个图片里的位置」

对应到代码就是两件事：

- 九支卷此前只有**静态曲线**（`buildGradeLayers` 的 ①–⑪ 层是常数），同一支卷在逆光、夜景、
  室内暖光下给出的补偿完全一样 —— 所以"换色调和饱和度"的观感是结构性的，不是数值没调好；
- 水印版式只有 `split / stacked / centered / dateOnly` 四种**排法**，纵向永远钉在相纸下留白
  （或压照片时的窗口下缘），用户没有任何办法把地名/坐标挪到别处。

这一版的做法是**先真的测光，再在预设曲线上做有界补偿**；水印则把「纵向位置」与「横向对齐」
拆成两个独立设置项，`auto + auto` 时逐字节保留旧行为。

### 44.2 测量层：只解 DC 系数的场景统计

新增三个纯 JS 模块（零依赖、零 RN 引用，Node 探针可直接装载）：

- `src/utils/sceneProbe.ts` —— 成片时唯一的对外入口 `probeScene(uri)`。它用
  `expo-file-system` 的 `File.bytes()` 把**裁切后的底片字节**读进来：不缩放、不重编码
  （再走一次 ImageManipulator 既慢又可能改直方图）。超过 `SCENE_PROBE_MAX_BYTES = 6MB`
  直接放弃，任何异常都 `return null`，**绝不抛** —— 采样是锦上添花，不能挡住出片。
- `src/utils/jpegSample.ts` —— 纯 JS baseline-JPEG 解码器，**只解 DC 系数**：不反量化成
  像素、不做 IDCT、不解 AC、不建全尺寸位图。输出是 MCU 网格的分块均值
  （`SampledLuma`：亮度 + Cb/Cr 同网格）：
  - 4:4:4 / 灰度：一格 8×8px，`cols = ceil(width/8)`、`rows = ceil(height/8)`；
  - 4:2:0：一格 16×16px；4:2:2 等非方形 MCU 报长边 16（`blockPx` 只是标量，
    统计单位是"格"不是像素）；
  - 格数上限 `MAX_CELLS = 1 << 22`，防畸形尺寸申请超大数组。
  - **接受**：SOF0/SOF1、8-bit、1 或 3 分量、采样因子 1–4（4:4:4 / 4:2:2 / 4:2:0 及通用 h/v）、
    DQT（8/16 位）、DHT（DC+AC）、单扫描 SOS、DRI + RSTn（每 interval 重置 DC 预测）、
    APPn/COM/DNL 跳过、灰度 JPEG（cb/cr 全 128）。
  - **一律返回 null 且不抛**：渐进式（SOF2）、SOF9+ 算术编码/DAC、SOF3 无损、差分/分层
    （SOF5/6/7/13/14/15）、precision ≠ 8（含 12-bit）、分量数非 1/3（CMYK）、多扫描
    （第二个 SOS）、非交错扫描、`height=0`（DNL 延迟解码，不实现）、非法 Huffman 码表/码字、
    `q0=0`、段/熵数据越界与截断、非法标记。
- `src/utils/sceneStats.ts` —— `analyzeScene(sample)` 把网格换算成 `SceneStats`
  （BT.601 full-range YCbCr → RGB，电平偏移 128，RGB 各自 clamp 0–255）：
  - `meanLuma = mean(l)`，`l = (0.299r + 0.587g + 0.114b)/255`；
  - `contrast = √mean((l − meanLuma)²)`（**两遍**算，不用 `E[l²]−mean²` 展开式，
    避免纯灰面方差≈0 时的相消误差）；
  - 分区：shadow `l < 0.25` / mid `0.25 ≤ l < 0.70` / highlight `0.70 ≤ l < 0.995` /
    clip `l ≥ 0.995`；
  - `warmth = (meanR − meanB)/(meanR + meanB + 1e-6)`、
    `tintBias = (meanG − (meanR+meanB)/2)/(meanLuma + 1e-6)`、`saturation = mean((max−min)/max)`；
  - 全部 `round4`，`samples` = 实际参与的格数（< 12 视为统计噪声太大，不启用自适应）。
  - 夹具 `_v1811_fixtures/`（12 张 JPEG + `truth.json`，Pillow 真值）由
    `_v1811_make_fixtures.py` 生成；`_probe_v1811_scene.mjs` 实测误差远低于契约阈值
    （meanLuma ≤ 0.0008、warmth ≤ 0.0028、saturation ≤ 0.0020）。

**为什么取景器里不做**：v1.8.6 的发热纪律（用户 m03551）把实时预览的每帧开销卡死了 ——
取景器只允许"已烘焙的静态层 + 一次截图"。场景分析**只在按下快门 / 导入之后**对裁切底片
跑一次，是"每张成片一次"的量级，不是每帧。

### 44.3 决策层：有界场景补偿（`src/utils/adaptiveGrade.ts`）

`planAdaptiveGrade(scene, preset)` 把测量值换成四类补偿，**每一项都有硬上下限**，
最坏情况也洗不掉一支卷的性格。公式（`_probe_v1811_adaptive.cjs` 逐条断言）：

| 补偿 | 公式 | 边界 |
| --- | --- | --- |
| 白平衡 | `clamp((0.06 − warmth) × 0.35, ±0.14)` 加到 `color.temperature` | `WB_SHIFT_MAX = 0.14` |
| 色调（绿-品红） | `clamp((0 − tintBias) × 0.20, ±0.08)` 加到 `color.tint` | `TINT_SHIFT_MAX = 0.08` |
| 反差 | `clamp(1 + (0.16 − contrast) × 1.00, 0.90, 1.10)` 乘 `color.contrast` | `[0.90, 1.10]` |
| 饱和度 | `clamp(1 + (0.22 − saturation) × 0.30, 0.92, 1.08)` 乘 `color.saturation` | `[0.92, 1.08]` |
| 中调 S 曲线 | `clamp((0.48 − meanLuma) × 0.12, ±0.06)` 加到 `color.sCurveIntensity` | `[0, 0.42]` 表上限 |
| 暗部提亮层 | `clamp((shadowShare − 0.26) × 0.45, 0, 0.05)`，< 0.03 不生成 | `[0.03, 0.05]` |
| 高光收敛层 | `clamp((highlightShare + 2×clipShare − 0.20) × 0.50, 0, 0.06)`，< 0.03 不生成 | `[0.03, 0.06]` |

- **黑白卷**：`mono === true` 时白平衡/色调补偿恒为 0（反正会被满幅去色层抽掉色度），
  但反差、S 曲线、暗部、高光**照常**补偿 —— 黑白卷同样要按场景光比调整。
- **落地**：①②③ 是**改数值再走原有图层公式**（不新增层、不改公式）；④ 追加两层
  `kind:'color'`，排在 ⑧.6 分离染色之后、⑨ 颗粒之前（属于"按场景算的曝光/反差补偿"，
  必须作用在完整调色结果上，又不能盖到颗粒/暗角/漏光这些物理质感之上）：
  - 暗部提亮 `scene-shadow-lift`：`screen` 混合 + 场景色的**补色**
    （warmth > 0.04 用冷白 `#DCE8FF`，否则暖白 `#FFE9D6`），opacity ∈ [0.03, 0.05]；
  - 高光收敛 `scene-highlight-rolloff`：`multiply` 混合 + 近白
    （warmth > 0.08 用 `#FFEFE2`，否则 `#F4F7FF`），opacity ∈ [0.03, 0.06]；
  - label 里带实测原因（`场景 · 暗部提亮 4%（暗部占比 35%）` /
    `场景 · 高光收敛 5%（高光 18% / 溢出 2%）`），冲印日志能看出"为什么加这一层"。
- **可退化（硬保证）**：`scene` 缺失（取景器实时预览、纯函数探针、旧存档重放）或
  `samples < 12` 时 `plan === null` —— `applyAdaptiveColor` **返回同一个引用**、
  `buildSceneLayers` 返回空数组，图层栈逐字节回到 v1.8.10 静态曲线（18 道旧门禁数值不许漂）。
- **不把画面弄虚的具体理由**：不产生任何 `kind:'photo'` 层、不碰 `blurRadius`（v1.8.3/v1.8.5
  红线）；screen 层 opacity ≤ 0.05 且色值 Y ≥ 0.85（最坏白场损失 ≈ 0.0075）、multiply 层
  色值 ≥ `#F2` 级别，白场损失 ≤ 0.005 —— 都在 `_haze_audit` 的 0.02 预算内。
- **开关**：设置「场景自适应」默认开；关掉后 `processFilmPhoto` 直接不采样，
  与旧版本逐字节一致（`adaptiveGrade !== false` 才启用）。

### 44.4 水印位置：纵向 `watermarkZone` + 横向 `watermarkAlign`

**结构性零漂移**：`computeWatermarkPlan` 末尾追加两个可选参数
（`zone: WatermarkZone = 'auto'`、`align: WatermarkAlign = 'auto'`）；当两者都是 `auto` 时
`placement === null`，下面整段走 v1.8.10 的原实现 —— 这是**分支结构**保证，不是"把两套公式
调成一样"。`_probe_v1811_watermark.cjs` 用 8 组夹具 × 4 版式与 v1.8.10 快照 `deepEqual`。

- 纵向四档（`resolveWatermarkPlacement`，:1103）：
  - `auto`：`bottom` / `region` 与旧 `resolveBaselineAndRegion` 逐字段相等；
    无相框（`00 NO FRAME`）仍用整块画布（`{top: inset, bottom: h − inset}`），
    否则"只改横向对齐"会连垂直位置一起挪掉；
  - `paper`：相纸下留白档，`bottom = clamp(round(下留白/2 − 日期字号×0.62), inset,
    max(inset, 下留白 − round(日期字号×1.05)))`，即旧 `frame` 分支公式，锚点强制 `frame`；
  - `photo-top`：照片窗口上缘一条 `round(日期字号×2.6)` 高的带，基线换算回"距舞台底"后
    落在带下沿，锚点强制 `window`；
  - `photo-bottom`：公式与旧 `window` 分支完全一致（`bottom = 下留白 + inset`），
    只是纸框用户选它时锚点也强制 `window`（墨色转浅色系）。
  - **锚点换了颜色必须跟着换**：`ink` / `placeInk` / `glowRadius` / `quartzShadow` 全部读
    `effectiveAnchor` —— 压照片用画面浅色 + 投影/辉光，印留白用纸系墨色（漏切一处就会出现
    白纸上的隐形字）。
- 横向四档：`auto` = 跟随相框 `watermark.align`（缺省右）；`left` / `right` 直接换边；
  `center` 时 `split` 版式降级成 `stacked` 才能"两行同侧堆叠"居中（`centered` 保留自身的
  整体行移动，`dateOnly` / `stacked` 不降级）。
- 设置接线：`settingsStore` 默认 `watermarkZone:'auto'` / `watermarkAlign:'auto'` /
  `adaptiveGrade:true`，白名单 `WATERMARK_ZONES` / `WATERMARK_ALIGNS` + `pickBoolean` 容错；
  `useSettings` 三个 setter；`SettingsScreen` 手风琴 **12 → 15 栏**（新增三栏紧接
  「水印版式」之后）；五个语言文件各 +17 键。
- 数据链：`FilmStageInput` / `ProcessFilmPhotoInput` / `ImportAndDevelopOptions` 各加
  `watermarkZone?` / `watermarkAlign?`（缺省 `auto`），`FilmCompositor` 的
  `WatermarkPlanInput` 改为必填两轴，`CameraScreen`（预览 / 快门 / 导入三处）与
  `GalleryScreen`（导入）全部接线。

### 44.5 门禁与验证

- `npx tsc --noEmit -p tsconfig.json` → **EXIT 0**。
- **22 道门禁全绿、0 失败**（`_gate_v1811_run2.out.txt`）：G01 3372 / G02 1754 / G03 16207 /
  G04 455 / G05 458 / G06 1069 / G07 1358 / G08 315 / G09 78 / G10 947 / G11 468 / G12 1781 /
  G13（9 卷超预算 0）/ G14 64 / G15 241 / G16 80 / G17 51 / G18 204 /
  **G19 503 / G20 441 / G21 1497 / G22 79**，合计 **31,422 条断言 + `_haze_audit` 9/9**。
- 四个新探针（零依赖、`ts.transpileModule` 装真源码）：
  - `_probe_v1811_scene.mjs`（441）：解码器装载、12 组夹具与 Pillow 真值误差、网格行列一致性、
    `blockPx ∈ {8,16}`、拒绝清单（渐进式/算术编码/12-bit/CMYK/多扫描/截断/坏表/随机字节，
    全部 null 且不 throw）；
  - `_probe_v1811_watermark.cjs`（1497）：auto 与 v1.8.10 快照逐字段相等（8 夹具 × 4 版式 +
    参数个数兼容）、四 zone 的 bottom/vertical/region/anchor 公式重算、四 align 的
    `lines.left/right/maxWidth/textAlign`、`forceLayout` 只在 base split 生效、墨色系、
    坐标有限性；
  - `_probe_v1811_adaptive.cjs`（503）：缺省退化（无 scene / 样本不足 → 图层顺序 = v1.8.10
    基线）、七项补偿公式与边界、`applyAdaptiveColor` 的同一引用契约、场景层 id/颜色/混合模式、
    图层顺序（⑧.6 之后 ⑨ 之前）、色层 opacity ∈ [0.03,0.06]；
  - `_probe_v1811_wiring.cjs`（79）：S0 版本/依赖 → S15 零 `as any` / 无 `watchPositionAsync`，
    把「设置 → 场景统计 → 自适应冲印 → 水印位置 → 合成器」整条接线逐文件钉住。
- 旧探针只改数据不改逻辑：`_probe_lead_integration.mjs` 手风琴 12 → 15 栏（SECTION_IDS +
  两处文案）、`_probe_v188_sharp.cjs` / `_probe_v189_flash.cjs` / `_probe_v1810_stocks.cjs`
  的 `app.json` 版本钉跟随到 1.8.11。
- `_probe_preset_tune.mjs` 仍是**非门禁**的临时设计工具（文件头自述），它 import 的
  `constants/captureQuality` 早已不存在而报 `ERR_MODULE_NOT_FOUND` —— 不计入门禁，保留原状。
- `npx expo export --platform ios --no-bytecode` → **EXIT 0**，bundle
  `index-ca6d773d92a2b18a6e3365a358aad5fa.js` **1,381,274 B**（v1.8.10 为 1,359,374 B，
  +21,900 B 来自解码器/统计/自适应/水印位置四处新代码）；
  `python _verify_ipa_v1811.py --local ...` → `RESULT(local): OK`（新增 needle 全部命中）。
- 仍**没有真机复测**：建议分别在逆光、夜景、室内暖光三种光线各拍一张，对比「场景自适应」
  开 / 关的成片；再在带水印版式下把纵向四档、横向四档各过一遍，重点看「画面顶部/底部」
  压在照片上时地名是否自动转成浅色墨、以及 `center` 是否把 split 降级成两行同侧。

### 44.6 产物指纹

- **本地提交**：`655a22800b2536e4cb86af1b7f549bc99d02d38d`（22 files，+2,199 / −70）
- **远端 master**：`976914cf88d3528453a95ddaae197b7794af6e7a`（`_push_v180_api.py`，
  TREE MATCH True，137 blobs 全一致）
- **CI**：run [`39065036127`](https://github.com/lizimo20041023-oss/retro-film-cam/actions/runs/39065036127)
  / job `117490773227` —— 12 个 step 全 success（skip 1 个「只在上次失败时才执行」的哈希缓存 step）
- **artifact**：`12113351715`（`FretroCam-unsigned-ipa`，10,495,140 B）
- **IPA**：`FretroCam-v1.8.11-unsigned.ipa`，**10,609,079 B**
  sha256 `91be1ceaea8a5609c9fd4804a050a910a050b55de81873fabe837f11940efe86`
- **Release**：id `416035905`，tag `v1.8.11`，asset `651491918`（size / digest 双 MATCH）
- **下载**：<https://github.com/lizimo20041023-oss/retro-film-cam/releases/download/v1.8.11/FretroCam-v1.8.11-unsigned.ipa>
- **IPA 回读核验**（`python _verify_ipa_v1811.py 12113351715` → `RESULT: OK`，115 entries）：
  `main.jsbundle` **2,093,114 B**；`Info.plist` 1.8.11 FOUND；10 张相框素材齐全；
  颗粒 `2d30d077…`（频带 <8px = 65.7% / 24–64px = 5.0%，两道门禁 OK）、
  暗角 `e02d6c6b…`（中心 alpha 0、四角 255、RGB 恒 (6,14,20)）；
  v1.8.11 新 needle 全命中（`scene-shadow-lift` ×2、`scene-highlight-rolloff` ×2、
  `settings.adaptiveGrade` ×8、`settings.watermarkZone` ×10、`settings.watermarkAlign` ×10），
  零 `missing:`，登记的 x0 全部是已知兜底（源码级探针另行守护）。

### 44.7 文件改动

| 文件 | 改动 |
| --- | --- |
| `src/types/index.ts` | 新增 `WatermarkZone` / `WatermarkAlign` / `SceneStats`；`ResolvedFilmPreset.scene?`；`AppSettings` 加三字段；`FilmStageInput` 加两轴 |
| `src/utils/jpegSample.ts` | **新增**（616 行）：只解 DC 系数的 baseline-JPEG 解码器 |
| `src/utils/sceneStats.ts` | **新增**（138 行）：格网格 → `SceneStats`（BT.601 + 分区 + 两遍反差） |
| `src/utils/sceneProbe.ts` | **新增**（64 行）：`probeScene(uri)`，6MB 上限、失败即 null |
| `src/utils/adaptiveGrade.ts` | **新增**（245 行）：`planAdaptiveGrade` / `applyAdaptiveColor` / `buildSceneLayers` |
| `src/utils/gradeLayers.ts` | 接入 ①②③（改数值）+ ④（⑧.7 两层场景补偿层） |
| `src/utils/processFilmPhoto.ts` | 4.5 场景统计（裁切后采样一次）+ zone/align/adaptive 选项 |
| `src/utils/importPhoto.ts` | `ImportAndDevelopOptions` 加三选项并透传（导入也逐张采样） |
| `src/utils/geometry.ts` | 新增 `WatermarkPlacement` / `resolveWatermarkPlacement`；`computeWatermarkPlan` 末尾两个可选参数；auto 路径保持旧公式 |
| `src/components/FilmCompositor.tsx` | `WatermarkPlanInput` 必填两轴；两处 `computeWatermarkPlan` 调用与 `watermarkInput` 接线 |
| `src/components/CameraScreen.tsx` | 预览 / 快门 / 导入三处接线 + 三个 deps 数组 |
| `src/components/GalleryScreen.tsx` | 导入调用与 deps 接线 |
| `src/components/SettingsScreen.tsx` | 手风琴 12 → 15 栏（watermark_zone / watermark_align / adaptive_grade） |
| `src/hooks/useSettings.tsx` | 三个 setter |
| `src/utils/settingsStore.ts` | 三默认值 + 两份白名单 + `pickBoolean` 容错 |
| `src/i18n/locales/*.ts` | 五语各 +17 键（zh-Hans / zh-Hant / ja / en / fr） |
| `app.json` | version `1.8.10` → `1.8.11` |
| `README.md` | 本节 §44 + TOC |

工作区根（不进仓库）：`_probe_v1811_scene.mjs` / `_probe_v1811_watermark.cjs` /
`_probe_v1811_adaptive.cjs` / `_probe_v1811_wiring.cjs`（四个新探针）、
`_v1811_make_fixtures.py` + `_v1811_fixtures/`（12 张夹具 + truth.json）、
`_make_v1811_scripts.py`、`_verify_ipa_v1811.py` / `_release_v1811.py` /
`_commit_v1811_msg.txt`、`_gate_v1811_run2.out.txt`、`_export_v1811_lead/`；
另改了 `_probe_lead_integration.mjs`（12 → 15 栏）、`_probe_v188_sharp.cjs`、
`_probe_v189_flash.cjs`、`_probe_v1810_stocks.cjs`（版本钉跟随）。

---

## 45. v1.9.0：五道手术（非阻塞快门 + 极速测光 / 12 层同源显影 / 反 HDR 四场景 / 九支新卷 / 4×4 水印矩阵保留）

### 45.1 用户需求（m07595）

这一版不是"调个参"，用户明确要求**重构核心光学引擎、极速测光链路与胶卷库**，并且给出
五道手术的具体做法，同时**严禁微弱无效数值调整**、**严禁降级成"原图盖水泥灰玻璃纸"**：

> ①「砍掉 5~7 秒快门卡顿与发热」——成片链路把 4032×3024 原图直接喂纯 JS 解码；
> 要求先用原生把底片缩到 64×64 JPEG（约 2KB）只做测光，快门一按就拿原图 URI 释放
> 取景器，裁切 / 测光 / 离屏合成 / 写相册全部丢进异步队列；
>
> ②「重写 `gradeLayers.ts` = 真 5 层拍立得光学显影管线」——废除平涂色块：同源柔焦、
> 同源 `multiply` 压暗部（Y²）、同源 `blur(14)` `screen` 提高光（1-(1-Y)²）、化学冷暖
> 分离、四角显影黑角；
>
> ③「重写 `adaptiveGrade.ts`，废除 ±0.06 微调」——不是数码 HDR 思维，而是按
> 强光/逆光、阴天平光、开阔天空、夜景四类场景**反向**补偿；
>
> ④「清空旧滤镜，重做 9 款防侵权王牌胶卷」——每款参数在契约里逐项冻结；
>
> ⑤「保留 4×4 水印位置矩阵与 4 款日期字形完整生效」——并同步全部单测/快照/门禁。

### 45.2 手术一：快门不再等冲印（异步冲印队列 + 64×64 极速测光）

**旧痛点**：`probeScene(uri)` 用 `expo-file-system` 读**裁切后的全尺寸底片字节**（4032×3024，
约 5~12 MB），再在 JS 主线程逐字节解 DC 系数，单次 5~7 秒；这期间 `developing === true`，
快门键被禁用、取景器停摆 —— 发热与卡顿同源。

**新链路**（`src/utils/sceneProbe.ts`，207 行）：

```
ImageManipulator.manipulate(uri)
  → resize({ width: 64, height: 64 })      // iOS 原生缩放，JS 0 次解码
  → renderAsync()
  → saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: true })   // ~0.5~2 KB
  → base64ToBytes()                        // 手写 RFC4648 解码，常量查表
  → sampleJpegDc()                         // 只解 DC：不解 IDCT、不建位图
  → analyzeScene()                         // SceneStats
```

- 导出 `FAST_SAMPLE_EDGE = 64`、`FAST_SAMPLE_COMPRESS = 0.75`、`base64ToBytes`、`probeScene`
  （任何一步失败都 `return null`，**绝不抛**）。
- 64×64 彩色 JPEG 默认 4:2:0：4×4 = 16 个 MCU，每 MCU 4 个 Y DC → 64 个 Y 样本；按
  `jpegSample.ts` 的"同 MCU 取平均 = 1 格"契约，`analyzeScene` 看到 **4×4 = 16 格**，
  `MIN_SAMPLES = 12` 刚好够判四类；4:4:4 / 灰度编码器则是 8×8 = 64 格（三种布局都有夹具）。
- **实测**（node 50 次中位，与生产同尺寸夹具）：`sampleJpegDc` 0.0096~0.0161 ms、
  `analyzeScene` 0.0009~0.0047 ms，**合计 ≈0.010~0.013 ms**，对 5 ms 预算有两个数量级余量。
- 源码里已不存在 `expo-file-system` / `File(` / `SCENE_PROBE_MAX_BYTES` /
  `manipulateAsync` 旧路径（`_probe_v190_wiring.cjs` S5 逐条扫描）。

**快门侧改造**（`src/components/CameraScreen.tsx`）：

- `shotLockRef` 现在**只包住 `takePictureAsync`**：拿到 `CapturedPhoto` 后立刻 `push` 一个
  job 快照进 `jobQueueRef`、`kickQueue()`、`finally` 释放快门锁 —— 取景器与快门下一帧就
  恢复，连拍/继续对焦不再被冲印挡住（`interactive = cameraGranted`，`usePhysicalShutter`
  只要求 `cameraGranted && cameraReady`）。
- job 在**按下快门那一刻冻结**全部输入：`frame` / `noFrameAspect` / `preset` / `locale` /
  `watermarkLayout/Zone/Align` / `adaptiveGrade` / `placeDetail` / `grainLevel` /
  `locationMode`，之后用户改设置也不会污染已拍的那张；`exposureIndex =
  exposureCount + queuedExposures + 1`（重曝与队列并存）。
- `pumpQueue` 单飞串行冲印（`pumpingRef` 互斥）：`processAndSaveFilmPhoto` →
  done → `exposureCount+1` →（仅带重曝覆盖时清 `pendingExposureUri`）→ `albumKey+1` →
  `addShot`；`importAndDevelop` 走同一条队列（`DevelopShotJob` / `DevelopImportJob`）。
- **空截图兜底**：iOS 在取景器刚恢复的瞬间偶发返回空图，`isEmptyCaptureError(error)` 命中时
  把该 job 标记 `stageElevated=true`、等两帧后**重试同一次拍摄**（只重试一次，不再弹错）。
- 离屏舞台仍在 `styles.preview` 内、`cameraClipNode` 之前，其后跟一层
  `<View pointerEvents="none" style={styles.stageOccluder} />`（不透明 `#0A0A0B`）遮住；
  `stageElevated` 时舞台提到 `zIndex: 9`。平时 `stage === null` → `FilmStageComposer`
  返回 `null`：**取景器 0 离屏 GPU 负载**（v1.8.6 纪律不变）。
- UI 从整屏 DevelopOverlay 换成 `DevelopBadge` 小徽标（`DevelopOverlay.tsx` 导出
  `DevelopBadge = memo(DevelopOverlayImpl)`）：冲印中显示 `队列 {count}`（五语新键
  `develop.queue.count`），done 3 秒 / error 5 秒自动退场，不再吃触摸、不再挡取景。

### 45.3 手术二：12 层同源光学显影管线（`src/utils/gradeLayers.ts`，438 行）

所有"照片自己叠自己"的层都是**同源副本**——同一个 URI、同一个 `<Image>`，靠
`blurRadius` + `mixBlendMode` 完成光学运算，不是平涂色块：

| # | key | 类型 | 渲染 | opacity 来源 | 作用 |
| --- | --- | --- | --- | --- | --- |
| 1 | `temperature` | color | overlay 色纸 | `min(1, |temperature|×GAIN)` | 自适应白平衡（WB 偏移只改这里） |
| 2 | `tint` | color | overlay 色纸 | `min(1, |tint|×GAIN)` | 绿-品红偏移 |
| 3 | `lens-softness` | **photo** | `<Image blurRadius={1.2} normal>` | `lensSoftness` | 抹平 Smart HDR 数码锐边，树脂柔润 |
| 4 | `mono-desaturate` | color | `#808080` · `color` | **1.0** | 真黑白（仅 mono 卷） |
| 5 | `shadow-crush` | **photo** | 同源 `multiply` | `shadowCrush` | Y' = Y²：树荫/柏油/深色车压成深黑 |
| 6 | `highlight-bloom` | **photo** | 同源 `blurRadius={14}` · `screen` | `highlightBloom` | Y' = 1-(1-Y)²：只提亮高光 + 奶油 Bloom |
| 7 | `shadow-tint` | color | 化学混合（预设决定） | `shadowTintOpacity × separationScale` | 暗部化学染色 |
| 8 | `highlight-tint` | color | 化学混合（预设决定） | `highlightTintOpacity × separationScale × colorDensityScale` | 高光化学染色 |
| 9 | `halation` | color | `#FF4028` · `screen` | `halation × 0.18`（`HALATION_RENDER_CAP` 封顶） | 暖红光晕 |
| 10 | `grain` | texture | `overlay` 平铺 | `grainLayerOpacity()` 硬上限 | 颗粒（ek-100 永不生成） |
| 11 | `vignette` | texture | `multiply` 拉伸 | `min(vignette + Δ, 0.72)` | 四角显影黑角 |
| 12 | `light-leak` | texture | `screen`（可镜像） | `min(0.1, lightLeak × 0.29)` | 漏光 |

- 常量冻结在文件头：`LENS_SOFTNESS_BLUR_PX = 1.2`、`HIGHLIGHT_BLOOM_BLUR_PX = 14`、
  `HALATION_RENDER_CAP = 0.18`、`VIGNETTE_OPACITY_MAX = 0.72`、
  `LIGHT_LEAK_OPACITY_MAX = 0.1`、`LIGHT_LEAK_GAIN = 0.29`；色值
  `WARM_OVERLAY #FF641A` / `COOL_OVERLAY #1393FF` / `TINT_GREEN #1AA81A` /
  `TINT_MAGENTA #E657E6` / `NEUTRAL_GRAY #808080` / `HALATION_RED #FF4028`。
- **暗角贴图重烤**（`scripts/generate_vignette.py`）：中心到 **56% 半径** alpha 恒 0，
  56%→100% 用 smoothstep 陡升到 255（膝盖约 78% 半径），RGB 恒 `(4,12,20)`；产物
  `assets/textures/vignette.png` **115,936 B**、sha256 `bf5148cd…`，`multiply` 叠加 ——
  中心透明所以白场不变灰，四角才被压暗（`_haze_audit` 9 预设 × 12 条断言守护）。
- **取景器 live 面继续按 v1.8.6 发热纪律过滤**（`planFilmLooks(preset, 'live')`）：
  所有 `kind:'photo'` 同源层（柔焦/压暗部/高光溢出）**一律不画**；`grain` 不画；
  `shadow-tint` / `highlight-tint` 全屏染色层丢弃；剩下 `temperature` / `tint` /
  `halation` 压到 `liveLookOpacity` ∈ [0.04, 0.08]；`mono-desaturate` 保留 opacity 1
  （黑白卷取景器必须当场是黑白）、暗角/漏光保留原值。
- `countStageImages` 契约不变（背景 2 + 纹理/photo 层数）：um/gd/pt/cp/fj/cs-800t/hp-400/tx-400
  都是 **7**；ek-100 **6**（3 张 photo 同源层 + 1 张暗角纹理，无颗粒）。预热图片数与
  v1.8.11 同量级，离屏舞台的 onLoad 计数逻辑不用改。

### 45.4 手术三：反 HDR 四场景自适应（`src/utils/adaptiveGrade.ts`，274 行）

判定顺序 **dark → bright → high-contrast → flat → neutral**（先命中先停），阈值直接用
`SceneStats` 原始字段：

| 场景 | 判定条件 | 压暗部 Δ | 高光溢出 Δ | 染色密度 | 分离度 | 暗角 Δ | 光晕 Δ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `dark` 夜景/室内极暗 | `shadowShare > 0.60 且 highlightShare < 0.08` | **−0.14** | **+0.22** | 1.00 | 1.00 | 0 | **+0.50** |
| `bright` 开阔天空/雪景 | `highlightShare > 0.42` | 0 | +0.12 | **1.20** | 1.00 | **+0.16** | 0 |
| `high-contrast` 强光/逆光 | `(highlightShare > 0.16 且 shadowShare > 0.18) 或 contrast > 0.22` | **+0.16** | **+0.18** | **1.22** | 1.00 | 0 | 0 |
| `flat` 阴天平光 | `contrast < 0.16 且 midShare > 0.52` | **+0.18** | **+0.15** | 1.25 | **1.25** | 0 | 0 |
| `neutral` | 其余 | 0 | 0 | 1.00 | 1.00 | 0 | 0 |

- **反 HDR 的方向**：`dark` 的 `shadowCrushDelta` 是**负的**——夜景不再"提亮暗部"（数码
  HDR 思维），而是让暗部保持暗，用 +0.22 高光溢出与 +0.50 光晕表现胶片欠曝的补偿；
  `high-contrast` 双向加层（+0.16 压暗部、+0.18 提高光）反而拉开动态；`bright` 不压高光，
  加暗角把视线收回中心；`flat` 同时加压暗部与高光溢出、并把染色分离度 ×1.25。
- 白平衡（唯一读颜色的量）：`whiteBalanceShift = clamp((0.06 − warmth) × 1.4, ±0.14)`、
  `tintShift = clamp((0 − tintBias) × 0.9, ±0.08)`；`applyAdaptiveColor(color, plan)` **只改
  `temperature` / `tint` 两个键**，plan 为 null 时返回**同一引用**。
- 全部增量为 `round4` 的冻结常量（`SCENE_DELTA_*` / `SCENE_DENSITY_*` /
  `SCENE_SEPARATION_FLAT` / `WB_SHIFT_MAX = 0.14` / `TINT_SHIFT_MAX = 0.08`）。
- **可退化硬保证**：`scene == null` / `samples < MIN_SAMPLES = 12` → `plan === null` →
  `buildGradeLayers` 层表与静态预设**逐字节一致**（九卷 × 三条退化路径
  `JSON.stringify` 全等，探针快照守护）。

### 45.5 手术四：九支防侵权王牌胶卷（`src/constants/presets.ts`）

`PRESETS` 整套替换，代号不含任何厂商名/商品名（防商标纠纷红线）；数值全部落在
"数字纪律"区间（softness 0.15~0.34 / crush 0.25~0.55 / bloom 0.20~0.48 /
vignette 0.28~0.56）：

| id | 代号 | 定位 | lensSoftness | shadowCrush | highlightBloom | vignette | grain | 化学染色（暗部 / 高光） | 特殊 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `um-400` | UM-400 | 高反差拍立得 · 街拍王牌（默认） | 0.30 | 0.42 | 0.36 | 0.46 | 0.045 | `#061626` multiply 0.22 / `#125FA5` soft-light 0.28 | — |
| `gd-200` | GD-200 | 金色日光 · 暖阳日常 | 0.24 | 0.34 | 0.32 | 0.36 | 0.045 | `#301A0A` multiply 0.18 / `#FFC655` soft-light 0.30 | — |
| `pt-400` | PT-400 | 大师人像 · 奶油肤色 | 0.26 | 0.28 | 0.34 | 0.28 | 0.045 | `#0E1C24` exclusion 0.12 / `#FFD7BC` soft-light 0.26 | — |
| `cp-200` | CP-200 | 复古琥珀 · 九十年代 | 0.28 | 0.32 | 0.28 | 0.38 | 0.045 | `#37240E` multiply 0.20 / `#F5B65C` soft-light 0.28 | — |
| `fj-400` | FJ-400 | 日系青绿 · 空气感 | 0.24 | 0.35 | 0.34 | 0.34 | 0.045 | `#08342E` multiply 0.22 / `#A0EBE1` soft-light 0.24 | — |
| `ek-100` | EK-100 | 反转片 · 高密红蓝 | 0.15 | 0.46 | 0.30 | 0.44 | **0** | `#B03A48` **overlay** 0.32 | `GRAINLESS_PRESET_IDS` |
| `cs-800t` | CS-800T | 电影钨丝 · 霓虹光晕 | 0.28 | 0.34 | 0.42 | 0.40 | 0.045 | `#0C4E94` soft-light 0.32 | `halation: 1` |
| `hp-400` | HP-400 | 纪实黑白 · 银盐灰阶 | 0.26 | 0.32 | 0.30 | 0.35 | 0.045 | — | `mono: true` |
| `tx-400` | TX-400 | 硬朗黑白 · 森山冲击 | 0.24 | **0.50** | 0.38 | 0.48 | 0.045 | — | `mono: true` |

- `DEFAULT_PRESET_ID = 'um-400'`（冷启动第一张）；`GRAINLESS_PRESET_IDS = new Set(['ek-100'])`。
- **旧照片兼容**（`LEGACY_PRESET_ID_ALIASES`，11 条只读历史账本；选卷 UI 不读它）：
  `hp-400-bw→hp-400`、`tx-400-bw→tx-400`、`su-200→gd-200`、`vl-400→pt-400`、
  `vx-400→um-400`、`am-200→cp-200`、`nz-400→fj-400`、`ri-100→ek-100`、
  `nt-800t→cs-800t`、`mn-400-bw→hp-400`、`sl-400-bw→tx-400`。
- `FilmCard` 同步：九卷角标 `um-400 → ISO 400`、`gd-200/cp-200 → ISO 200`、
  `pt-400/fj-400 → ISO 400`、`ek-100 → SLIDE`、`cs-800t → 800T`、`hp-400/tx-400 → B&W`；
  卡片渐变改读新五键（`lensSoftness / shadowCrush / highlightBloom / shadowTint /
  highlightTint` 派生）。
- 旧 7 个 color 字段（`saturation` / `contrast` / `fade` / `exposure` / `splitTone` /
  `sCurveIntensity` / `curveBlendMode`）已从类型与数据中删除；`buildGradeLayers` 里不再有
  `s-curve` / `scene-shadow-lift` / `scene-highlight-rolloff` 这类"数码曲线"层。

### 45.6 手术五：4×4 水印矩阵与四款日期字形原样保留

v1.8.11 的水印位置能力是"用户已经可用的功能"，这一版**一行语义都没动**，只被新管线间接
保护（全部由 `_probe_v1811_watermark.cjs` 1497 条与 `_probe_v1811_adaptive.cjs` 1701 条
继续守护）：

- 纵向 `watermarkZone ∈ {auto, paper, photo-top, photo-bottom}` × 横向
  `watermarkAlign ∈ {auto, left, center, right}` = **16 种组合**；`auto + auto` 时
  `placement === null`，走 v1.8.10 原实现（`_probe_v1811_watermark.cjs` 与旧快照 `deepEqual`）。
- 四款日期字形 `quartz_led / ccd_osd / lab_inkjet / archival_steel` 全部生效
  （`DateGlyphs.tsx` 未被本版触碰）。
- 设置页 15 栏、三默认值（`watermarkZone:'auto'` / `watermarkAlign:'auto'` /
  `adaptiveGrade:true`）、五语 17 键全部保持；本版 i18n 只新增 1 个键
  `develop.queue.count`（异步队列徽标用）。

### 45.7 门禁与验证

- `npx tsc --noEmit -p tsconfig.json` → **EXIT 0**。
- **26 道门禁全绿、0 失败**（`_gate_v190_run.out.txt`，跑批脚本 `_run_gates_v190.ps1`）：

| # | 门禁 | 断言 | # | 门禁 | 断言 |
| --- | --- | --- | --- | --- | --- |
| G01 | `_probe_date_engine.cjs` | 3372 | G14 | `_purity_audit.mjs` | 64 |
| G02 | `_probe_film_look.cjs` | 2000 | G15 | `_probe_v186_perf.cjs` | 241 |
| G03 | `_probe_geo_lock.cjs` | 16207 | G16 | `_probe_v188_sharp.cjs` | 118 |
| G04 | `_probe_noframe_v181.cjs` | 455 | G17 | `_probe_v189_flash.cjs` | 56 |
| G05 | `_probe_noframe_watermark.cjs` | 458 | G18 | `_probe_v190_stocks.cjs` | **727** |
| G06 | `_probe_skin_material.cjs` | 1069 | G19 | `_probe_v190_optics.cjs` | **612** |
| G07 | `_probe_v180_seams.mjs` | 1421 | G20 | `_probe_v190_meter.mjs` | **253** |
| G08 | `_probe_lead_integration.mjs` | 315 | G21 | `_probe_v190_async.cjs` | **150** |
| G09 | `_probe_capture_quality.mjs` | 78 | G22 | `_probe_v190_wiring.cjs` | **322** |
| G10 | `_probe_v184_camera.cjs` | 910 | G23 | `_probe_v1811_adaptive.cjs` | 1701 |
| G11 | `_probe_v185_place.cjs` | 468 | G24 | `_probe_v1811_scene.mjs` | 478 |
| G12 | `_probe_v185_frame.cjs` | 1781 | G25 | `_probe_v1811_watermark.cjs` | 1497 |
| G13 | `_haze_audit.mjs` | 9/9（9 预设 × 12 条 0 失败） | — | **合计** | **34,753 条断言 + 暗角 9/9** |

- 五个新探针（零依赖、`ts.transpileModule` 装真源码）：
  - `_probe_v190_stocks.cjs`（727）：九卷数据结构/顺序/ID 正则/27 个商标词规避/11 条兼容
    映射/逐卷 15 参数精确值/数值纪律区间/FilmCard 角标与 `_haze_audit` 数据源；
  - `_probe_v190_optics.cjs`（612）：12 层顺序与 photo 层属性、同源/混合模式、暗部压片与
    高光溢出的 Y² / 1-(1-Y)² 恒等、自适应增量接线、live 过滤规则、无 scene 逐字节不变；
  - `_probe_v190_meter.mjs`（253）：64×64 夹具真值、4:2:0/4:4:4/灰度三种 MCU 布局的格数
    （16/64/64，均 ≥ 12）、四场景分类、`FAST_SAMPLE_EDGE` / `FAST_SAMPLE_COMPRESS` /
    `base64ToBytes` 契约、单次测光实耗打印；
  - `_probe_v190_async.cjs`（150）：队列字段/冻结快照/`exposureIndex`/`pumpQueue` 单飞/
    空截图重试/`DevelopBadge`/`stageOccluder`/无 `disabled={developing}`/五语队列键；
  - `_probe_v190_wiring.cjs`（322）：S0 版本与 18 依赖 → S9 零 `as any` / 零
    `watchPositionAsync`，把「设置 → 64×64 测光 → 四场景 → 12 层显影 → 九卷 → 水印矩阵 →
    异步队列」整条接线逐文件钉住。
- 旧探针按新契约改数据/形态不改语义：`_probe_film_look.cjs`（1117 → 2000）、
  `_probe_v1811_adaptive.cjs`（503 → 1701）、`_probe_v180_seams.mjs`（1190 → 1421）、
  `_probe_v184_camera.cjs`（895 → 910）、`_probe_v188_sharp.cjs`（80 → 118）、
  `_probe_v189_flash.cjs`（51 → 56，S4 按非阻塞重写）、`_probe_v186_perf.cjs`（241 不变）。
  **替代而非新增**：删除失效的 `_probe_v1810_stocks.cjs` 与 `_probe_v1811_wiring.cjs`，
  换成 `_probe_v190_stocks.cjs` + `_probe_v190_wiring.cjs`（门禁总数 22 → 26）。
- `npx expo export --platform ios --no-bytecode` → **EXIT 0**，bundle
  `index-23aea521adf641c6d8d33db0609b617d.js` **1,385,027 B**（v1.8.11 为 1,381,274 B，
  +3,753 B）；素材含新 `vignette.png` 115,936 B。
  `python _verify_ipa_v190.py --local ...` → `RESULT(local): OK`（新 needle 全命中、
  零 `missing:`、ABSENT 全 x0）。
- **仍没有真机复测**：建议①连拍 5 张看快门是否即按即响应、冲印徽标是否排到"队列 5"；
  ②同一场景对比九卷（重点 UM-400 的暗部压片与 CS-800T 的暖红光晕）；
  ③逆光/夜景各拍一张对比"场景自适应"开 / 关，确认暗部不再被提亮成灰雾；
  ④水印 16 组合过一遍，确认 v1.8.11 的纵横向位置行为逐像素没变。

### 45.8 产物指纹

- **本地提交**：`786304d26c5694b8c5d072ff11d8e7cae6b346c0`（18 files，+1,952 / −1,418）
- **远端 master**：`f540a94813d47f4098e8f146897e89f9ff9af8be`（`_push_v180_api.py`，
  TREE MATCH True，137 blobs 全一致）
- **CI**：run [`39117905815`](https://github.com/lizimo20041023-oss/retro-film-cam/actions/runs/39117905815)
  / job `117647338646` —— 12 个 step 全 success（skip 1 个「只在上次失败时才执行」的哈希缓存 step）
- **artifact**：`12132593712`（`FretroCam-unsigned-ipa`，10,498,571 B）
- **IPA**：`FretroCam-v1.9.0-unsigned.ipa`，**10,613,104 B**
  sha256 `c5be089bf50351972f2bc47d0432bf5ae7b8da4ce3ed87d157e4d50bbdb0b4a7`
- **Release**：id `416377637`，tag `v1.9.0`，asset `653173121`（size / digest 双 MATCH）
- **下载**：<https://github.com/lizimo20041023-oss/retro-film-cam/releases/download/v1.9.0/FretroCam-v1.9.0-unsigned.ipa>
- **IPA 回读核验**（`python _verify_ipa_v190.py 12132593712` → `RESULT: OK`，115 entries）：
  `main.jsbundle` **2,101,132 B**；`Info.plist` 1.9.0 FOUND；10 张相框素材齐全；
  颗粒 `2d30d077…`（频带 <8px = 65.7% / 24–64px = 5.0%，两道门禁 OK）、
  暗角 `bf5148cd…`（中心 alpha 0、四角 255、RGB 恒 (4,12,20)、115,936 B）；
  v1.9.0 新 needle 全命中（`lens-softness` ×2、`shadow-crush` ×2、`highlight-bloom` ×2、
  `mono-desaturate` ×2、`halation` ×2、`halationDelta` ×2、`FAST_SAMPLE_EDGE` ×2、
  `FAST_SAMPLE_COMPRESS` ×2、`base64ToBytes` ×2、`DevelopBadge` ×2、`queueDepth` ×2、
  `develop.queue.count` ×2），零 `missing:`，登记的 x0 全部是已知兜底（源码级探针另行守护）。

### 45.9 文件改动

| 文件 | 改动 |
| --- | --- |
| `src/types/index.ts` | `ColorGradeConfig` 重写：删 7 个旧色阶字段，新增 `lensSoftness?` / `shadowCrush?` / `highlightBloom?`，`halation` 语义改为光晕上限；`SceneStats` 文档改 64×64 原生测光 |
| `src/constants/presets.ts` | **整文件重写**：九支新卷 + `PRESET_DEFAULTS` 12 色键 + `DEFAULT_PRESET_ID='um-400'` + `GRAINLESS_PRESET_IDS={'ek-100'}` + 11 条兼容映射 + `resolvePreset` 新键 |
| `src/utils/gradeLayers.ts` | **整文件重写**（438 行）：12 层同源光学显影管线 + 四场景增量接线 + live 面过滤 + `countStageImages` 口径 |
| `src/utils/adaptiveGrade.ts` | **整文件重写**（274 行）：反 HDR 四场景分类/增量表/WB-Tint 偏移/退化契约 |
| `src/utils/sceneProbe.ts` | **整文件重写**（207 行）：原生 64×64 JPEG 极速测光（`FAST_SAMPLE_EDGE` / `base64ToBytes`），删全尺寸读取 |
| `src/utils/processFilmPhoto.ts` | 测光路径注释与 4.5 场景统计块改 64×64 说法（调用签名不变） |
| `src/components/CameraScreen.tsx` | 非阻塞冲印队列（`jobQueueRef`/`pumpQueue`/`kickQueue`/`exposureIndex`/空截图重试）+ 舞台遮挡 + `DevelopBadge` 接线 |
| `src/components/DevelopOverlay.tsx` | 全屏遮罩改为 `DevelopBadge` 小徽标（`memo`），显示 `队列 {count}`、3s/5s 自动退场 |
| `src/components/FilmCard.tsx` | 九卷新角标与渐变派生键更新 |
| `src/i18n/locales/*.ts` | 五语各 +1 键 `develop.queue.count`（zh-Hans / zh-Hant / ja / en / fr） |
| `assets/textures/vignette.png` | 重生成：中心 56% 透明、RGB (4,12,20)、115,936 B |
| `scripts/generate_vignette.py` | 常量改 `INNER_RADIUS = 0.56`、`RGB = (4,12,20)` |
| `app.json` | version `1.8.11` → `1.9.0` |
| `README.md` | 本节 §45 + TOC |

工作区根（不进仓库）：`_probe_v190_stocks.cjs` / `_probe_v190_optics.cjs` /
`_probe_v190_meter.mjs` / `_probe_v190_async.cjs` / `_probe_v190_wiring.cjs`（五个新门禁）、
`_v190_make_fixtures.py` + `_v190_meter_fixtures/`（64×64 夹具 7 张 + truth.json）、
`_run_gates_v190.ps1`、`_verify_ipa_v190.py` / `_release_v190.py` / `_commit_v190_msg.txt`、
`_gate_v190_run.out.txt`、`_gate_v190_local_verify.txt`、`_export_v190_lead/`；
删除了 `_probe_v1810_stocks.cjs` / `_probe_v1811_wiring.cjs`（被 v190 两探针替代）。
## 46. v1.9.1：去糊、去雾、去灰（零模糊 S 曲线 / 零模糊曝光提亮 / 四场景去雾 / 九卷零模糊基准 / 70% 暗角）

### 46.1 用户需求（对照 8 张实拍样片）

v1.9.0 的 12 层同源显影在纸面上是对的，但真机 8 张实拍样片给出的结论很直接：
**整组照片「又糊、又暗、又蒙了一层廉价 CCD 柔光雾」**。用户逐条点名了四个病根：

1. `highlight-bloom` 的 **14px 大半径模糊** 配上 `screen` 混合，把光晕从「高光边缘」扩散成
   「全图乳白」，连纯黑背景都被抬成灰雾；
2. `adaptiveGrade` 的暗场景把 `halation` 往上推了 **+0.50**，夜景与室内直接满屏白雾；
3. `lens-softness` 的 **1.2px `blurRadius` 全图重采样** 把原本清晰的底片抹糊；真正的
   Dazz #Inst C 是「刀锐清晰」而不是柔焦；
4. `shadow-crush` 用 `multiply` + Y² 以 0.35~0.50 的强度压暗部，把白雪、樱花压成脏灰色；
   另外染色层用了 `exclusion` / `screen` / 高透明度 `multiply`，会污染黑场与白场；
   暗角中心透明区只有 56%，画面中央的山体与海湾被压黑。

用户要求三道手术（`gradeLayers.ts` 零模糊化、`adaptiveGrade.ts` 去雾化、九卷零模糊基准重定），
硬约束与历次版本一致：不改框架、不加依赖、同步更新全部探针断言与快照，
26 道门禁 + `tsc --noEmit` + GitHub Actions IPA 打包 100% 绿灯。

操作化冻结版是工作区磁盘文件 `_v191_contract.md`（§0 文件所有权 / §1 types 12 键 /
§2 九卷表 / §3 零模糊 12 层与常量 / §4 四场景表 / §5 FilmCard 派生公式 /
§6 探针归属 / §7 验收命令）。本节的数值全部与契约一致。

### 46.2 病根定位（源码级）

| 症状 | 源码位置 | 旧数值 | 为什么会这样 |
| --- | --- | --- | --- |
| 整图糊 | `src/utils/gradeLayers.ts` 的 `lens-softness` 层 | `blurRadius: 1.2` + `normal` | 同一张原图以模糊副本叠回自身，等于对整幅图做了一次不可逆重采样；放大看边缘全发虚 |
| 乳白雾 | `src/utils/gradeLayers.ts` 的 `highlight-bloom` 层 | `blurRadius: 14` + `screen` | `screen` 的 `f(0)=0` 本身没错，但 14px 模糊把「高光附近」摊到全图；黑背景沾到模糊光斑就被抬亮 |
| 夜间/室内白雾 | `src/utils/adaptiveGrade.ts` 暗场景增量表 | `halation +0.50` | 光晕层是 `screen` 混合，强度翻倍后整片阴影都在发光 |
| 白雪变脏灰 | `src/utils/gradeLayers.ts` 的 `shadow-crush` 层 | `multiply` 0.35~0.50 + Y² | Y² 对高亮区也生效（0.8²=0.64），白色被乘成 0.64 的灰；且 `multiply` 染色层不受控 |
| 黑场/白场被染色 | `shadow-tint` / `highlight-tint` 的 blendMode | 允许 `exclusion` / `screen` / 高透明度 `multiply` | `exclusion` 对纯黑/纯白是「反转」，黑场会被染成彩色 |
| 画面中央压黑 | `assets/textures/vignette.png` 生成器 | `INNER_RADIUS = 0.56` | 中心透明区太小，山体/海湾本就位于画面中部 |

### 46.3 手术一：`gradeLayers.ts` 零模糊 12 层

层序、键名与 `kind` 全部保持 v1.9.0 的冻结接口，只把「模糊」从显影管线里彻底拿掉：

| # | key | 同源层 | 混合 | 强度上限 | 数学 |
| --- | --- | --- | --- | --- | --- |
| 1 | `temperature` | 用户旋钮 | `overlay` | 原有 | 色温 |
| 2 | `tint` | 用户旋钮 | `soft-light` | 原有 | 色调 |
| 3 | `s-curve-contrast` | 原图 | `overlay` | `S_CURVE_OPACITY_MAX = 0.72` | `Y<0.5 → 2Y²`；`Y≥0.5 → 1−2(1−Y)²`（真 S，`f(0)=0`、`f(0.5)=0.5`、`f(1)=1`） |
| 4 | `exposure-lift` | 原图 | `screen` | `EXPOSURE_LIFT_OPACITY_MAX = 0.5` | `Y' = 2Y−Y²`（`f(0)=0`，零模糊提亮，黑场不动） |
| 5 | `shadow-crush` | 原图 | `multiply` | `SHADOW_CRUSH_OPACITY_MAX = 0.12` | 只压 Y² 的暗部，上限从 0.50 砍到 0.12 |
| 6 | `mono-desaturate` | 原图 | color | — | B&W 卷去色（`#808080`） |
| 7 | `shadow-tint` | 原图 | **仅 `soft-light` / `overlay`** | `sanitizeTintBlendMode` 钳制 | `exclusion` / `screen` 被当非法值降级 |
| 8 | `highlight-tint` | 原图 | **仅 `soft-light` / `overlay`** | 同上 | 同上 |
| 9 | `halation` | 原图 | `screen` | `HALATION_OPACITY_MAX = 0.06` | 红色 `#FF4028`，只有 4 个卷允许非零 |
| 10 | `grain` | 贴图 | normal | 既有 | 颗粒 PNG |
| 11 | `vignette` | 贴图 | `multiply` | `VIGNETTE_OPACITY_MAX = 0.32` | 中心 70% 透明 |
| 12 | `light-leak` | 贴图 | normal | 既有 | 漏光 PNG |

关键点：

- 3/4/5 三层都是**同一张原图自叠**（`kind: 'photo'`），但三层全部显式 `blurRadius: 0`；
  取景器 `planFilmLooks` 的 live 过滤规则不变（photo 层、颗粒、染色层仍被丢弃）。
- 删除 `LENS_SOFTNESS_BLUR_PX` / `HIGHLIGHT_BLOOM_BLUR_PX` / `HALATION_RENDER_CAP`
  三个旧常量；`halation` 不再走「声明值 × 0.18」的隐藏换算，直接 clamp 到 0~0.06。
- `sanitizeTintBlendMode()` 是新的出口：任何 `exclusion` / `screen` 进染色层都会被降级为
  `soft-light`，源码级杜绝黑场/白场污染。
- 层标签改为「零模糊 S 曲线」「零模糊曝光提亮」「黑位托底」；
  `countStageImages` 口径随层数不变：`um-400` = 7 张同源图、`ek-100` = 6 张。

### 46.4 手术二：`adaptiveGrade.ts` 去雾四场景表

分类顺序与阈值全部保留（dark → bright → high-contrast → flat → neutral），只换增量表：

| 场景 | sCurveContrast | exposureLift | shadowCrushTarget | vignetteDelta | colorDensity | separation | halation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dark | **+0.15** | **+0.21** | **0** | 0 | 1.0 | 1.0 | **0**（`HALATION_DELTA_MAX = 0.03` 夹取） |
| high-contrast | **+0.22** | **+0.12** | **0.08** | 0 | 1.0 | 1.0 | 0 |
| flat | **+0.28** | **+0.10** | **0.08** | 0 | **1.25** | **1.25** | 0 |
| bright | **+0.18** | **+0.10** | **0** | **+0.16** | **1.20** | 1.0 | 0 |
| neutral | 0 | 0 | 0 | 0 | 1.0 | 1.0 | 0 |

要点：

- 旧字段 `shadowCrushDelta` / `highlightBloomDelta` 已从 `AdaptivePlan` 删除，改为
  `shadowCrushTarget: number | null`（`null` = 完全不干预）与 `sCurveContrastDelta` /
  `exposureLiftDelta`；
- 暗场景不再「加光晕」，改成「加 S 曲线 + 提亮曝光」，这是去雾的关键；
- 白平衡/Tint 偏移上限 `WB_SHIFT_MAX = 0.14` / `TINT_SHIFT_MAX = 0.08` 不变；
- 无 `scene` 时逐字节回到 v1.9.0 静态路径（`planAdaptiveGrade` 退化契约未变）。

### 46.5 手术三：九卷零模糊基准

字段序 = `sCurveContrast / exposureLift / shadowCrush / vignette / halation`：

| 代号 | 名称 | 参数 | 染色（全部 soft-light） | 备注 |
| --- | --- | --- | --- | --- |
| `um-400` | 极光 400 | .38 / .16 / .08 / .28 / 0 | 阴影 `#0F4C8C`.18 / 高光 `#FFC46B`.16 | 默认卷 |
| `gd-200` | 拾光 200 | .30 / .18 / .05 / .22 / 0 | 阴影 `#3A2614`.12 / 高光 `#FFC85A`.26 | 暖调 |
| `pt-400` | 徕卡 400 | .24 / .22 / .03 / .18 / 0 | 阴影 `#33465A`.10 / 高光 `#FFD9C2`.22 | 奶油暖桃 |
| `cp-200` | 峡湾 200 | .28 / .16 / .06 / .24 / 0 | 阴影 `#3E2A12`.14 / 高光 `#F0B25A`.20 | — |
| `fj-400` | 翡翠 400 | .32 / .20 / .05 / .22 / 0 | 阴影 `#0E5C50`.16 / 高光 `#D6F2EC`.14 | 翡翠青绿 |
| `ek-100` | 雪原 100 | .45 / .14 / .10 / .30 / 0 | 阴影 `#B03A48`.26（**overlay**，唯一例外） | 唯一零颗粒卷 |
| `cs-800t` | 寒潮 800T | .34 / .18 / .06 / .26 / **.05** | 阴影 `#123A6B`.18 / 高光 `#2E6FBF`.22 | 唯一允许光晕的卷 |
| `hp-400` | 石墨 400 | .32 / .18 / .06 / .20 / 0 | — | mono |
| `tx-400` | 玄铁 400 | **.48 / .16 / .12** / .26 / 0 | — | mono，最强 S 曲线 |

- 九卷的 `lensSoftness` / `highlightBloom` 字段从 `ColorGradeConfig` 整体删除，预设里不再出现；
- 兼容映射（11 条旧 id → 新 id）、`DEFAULT_PRESET_ID='um-400'`、
  `GRAINLESS_PRESET_IDS={'ek-100'}` 全部保留；
- `FilmCard.tsx` 的渐变卡按新字段派生：
  底 = `132 − shadowCrush×46 − sCurveContrast×30×0.8 + exposureLift×18×0.3`；
  中 = `132 + sCurveContrast×30×0.05 + exposureLift×18×0.6`；
  顶 = `132 + shadowCrush×46×0.15 + sCurveContrast×30 + exposureLift×18`；
  常量 `CRUSH_RANGE=46` / `S_RANGE=30` / `LIFT_RANGE=18` / `CHEMISTRY_GAIN=1.2`。

### 46.6 暗角重烤：中心透明区 56% → 70%

`scripts/generate_vignette.py` 改 `INNER_RADIUS = 0.70`，alpha 剖面按
`0.0 / 0.30 / 0.50 / 0.60 / 0.70 / 0.78 / 0.86 / 0.94 / 1.0` 采样，
RGB 恒 `(4,12,20)`。重生成 `assets/textures/vignette.png`：

- 1024×1024 RGBA，**117,771 B**，sha256 `7e9c6e8e8699a148434357ff04931d7c5feae74f6036a8e261d58885a5e6cc7e`；
- alpha 实测：rho 0.70 = 0 / 0.78 = 45 / 0.86 = 140 / 0.94 = 228 / 1.0 = 255；
- `_plate_stats.json` 同步按 70% 内圈重生成（centerAlpha 0 / edgeAlpha 0.993）；
- `_haze_audit.mjs` 的径向暗角 9 预设 × 12 条断言全绿，中心不再被压暗。

### 46.7 门禁（26 道，36,791 条断言 + 暗角 9/9）

| # | 门禁 | 断言 | # | 门禁 | 断言 |
| --- | --- | --- | --- | --- | --- |
| G01 | `_probe_date_engine.cjs` | 3372 | G14 | `_purity_audit.mjs` | 64 |
| G02 | `_probe_film_look.cjs` | 2083 | G15 | `_probe_v186_perf.cjs` | 241 |
| G03 | `_probe_geo_lock.cjs` | 16207 | G16 | `_probe_v188_sharp.cjs` | 137 |
| G04 | `_probe_noframe_v181.cjs` | 455 | G17 | `_probe_v189_flash.cjs` | 56 |
| G05 | `_probe_noframe_watermark.cjs` | 458 | G18 | `_probe_v190_stocks.cjs` | 787 |
| G06 | `_probe_skin_material.cjs` | 1069 | G19 | `_probe_v190_optics.cjs` | 816 |
| G07 | `_probe_v180_seams.mjs` | 1459 | G20 | `_probe_v190_meter.mjs` | 254 |
| G08 | `_probe_lead_integration.mjs` | 315 | G21 | `_probe_v190_async.cjs` | 150 |
| G09 | `_probe_capture_quality.mjs` | 78 | G22 | `_probe_v190_wiring.cjs` | 1279 |
| G10 | `_probe_v184_camera.cjs` | 940 | G23 | `_probe_v1811_adaptive.cjs` | 2347 |
| G11 | `_probe_v185_place.cjs` | 468 | G24 | `_probe_v1811_scene.mjs` | 478 |
| G12 | `_probe_v185_frame.cjs` | 1781 | G25 | `_probe_v1811_watermark.cjs` | 1497 |
| G13 | `_haze_audit.mjs` | 9/9（9 预设 × 12 条 0 失败） | — | **合计** | **36,791 条断言 + 暗角 9/9** |

- `tsc --noEmit -p tsconfig.json` → EXIT 0；26 门禁全 EXIT 0 / 0 失败
  （`_run_gates_v191.ps1`，日志 `_gate_v191_run.out.txt`）。
- `_haze_audit.mjs` 同时做结构门禁（9 卷 × 12 条）与径向暗角（9 卷 × 12 条），各 0 失败；
  其中 `normalMid` 预算由 0.06 重标定为 0.07：正文已说明，pt-400 新 `highlightTint` 0.22
  的声明成本是 0.0615，仍远低于历史雾层（0.15+），属于预算口径更新而非放宽雾限。
- `_probe_v190_meter.mjs` 唯一红项是**探针口径过期**（仍读 v1.9.0 已删除的
  `shadowCrushDelta` / `highlightBloomDelta`），按 v1.9.1 新字段重写后 254 条全绿，源码无回归。
- 本地包核验 `python _verify_ipa_v191.py --local <bundle>` → `RESULT(local): OK`，
  bundle `index-da5c6fc22dde743914ddb7d0c6b998ce.js` = **1,386,100 B**
  （v1.9.0 为 1,385,027 B，+1,073 B）；`--grain` / `--vignette` 单验均 OK。
- **CI 计费插曲（排错记档）**：v1.9.1 首次推送后连续 4 次 run 都在 30 秒内判负、
  `runner_id=0` / `steps=[]`，一度误判为 `macos-26-intel` 池无机器并改 `macos-26`（仍失败）。
  最终由 check-run annotations 定位真因：「The job was not started because recent account
  payments have failed or your spending limit needs to be increased」——仓库是 private，
  macOS runner 按 10 倍费率消耗包含分钟，当日多次打包后触顶。把仓库临时转为 **public**
  （public 仓库标准 runner 免费）后同一条 workflow 重跑成功；`macos-26-intel` 已回退保留。
  → 后续若再次出现该标注，先查 Billing & plans，再动 runner label。

### 46.8 发布指纹

*（实测值，2026-10-18 发布回填）*

| 项 | 值 |
| --- | --- |
| 本地提交 | `8b64c2e`（v1.9.1 特性）+ `29f74c7` / `e6c36c3`（CI runner 修正与回退） |
| 远端 master | `1f173df635bb1846c2d150f266503f7da763be46`（Git Data API 推送，TREE MATCH） |
| CI run / job | run `39123549264` / job `117665549352`（macos-26-intel，全 success） |
| artifact id / 体积 | `12135706737` / **10,500,059 B**（`FretroCam-unsigned-ipa`） |
| IPA 文件 / 体积 / sha256 | `FretroCam-v1.9.1-unsigned.ipa` / **10,614,302 B** / `14e8c819f7bcacf07fe31ce5abf2ea2129fc4ec25cd0e6b8b57892330824b576` |
| Release id / asset id | release `416420930`（tag `v1.9.1`）/ asset `653378959` |
| IPA 回读核验 | `RESULT: OK` —— 115 entries、`main.jsbundle` **2,102,181 B**、Info.plist `1.9.1` + `com.canyerylee.fretrocam` FOUND、10 张相框、grain/vignette sha 与频谱全 OK、PRESENT 全命中且 `missing:` 为 0 |
| 下载地址 | https://github.com/lizimo20041023-oss/retro-film-cam/releases/download/v1.9.1/FretroCam-v1.9.1-unsigned.ipa |

### 46.9 文件改动

| 文件 | 改动 |
| --- | --- |
| `src/types/index.ts` | `ColorGradeConfig` 重写为 12 键：删 `lensSoftness?` / `highlightBloom?`，新增 `sCurveContrast` / `exposureLift` / `shadowCrush`；染色 blendMode 文档限定 `soft-light` / `overlay`；注释写明零模糊数学 |
| `src/utils/gradeLayers.ts` | **整文件重写**：零模糊 12 层（3 条同源 photo 层全部 `blurRadius: 0`）+ 五个强度上限常量 + `sanitizeTintBlendMode`；删三个旧模糊常量 |
| `src/utils/adaptiveGrade.ts` | **整文件重写**：去雾四场景增量表、`shadowCrushTarget: number \| null`、`HALATION_DELTA_MAX = 0.03`；删 `halation +0.50` |
| `src/constants/presets.ts` | **整文件重写**：九卷零模糊基准参数与 soft-light 染色；保留 11 条兼容映射、默认卷、零颗粒卷 |
| `src/components/FilmCard.tsx` | 渐变卡改为 `S_RANGE=30` / `LIFT_RANGE=18` 的派生公式；角标映射不变 |
| `src/constants/textures.ts` | vignette 注释 68% → 70%，标注 v1.9.1 重烤 |
| `scripts/generate_vignette.py` | `INNER_RADIUS = 0.70`、alpha 剖面元组与 docstring 更新 |
| `assets/textures/vignette.png` | 重生成：中心 70% 透明、RGB (4,12,20)、117,771 B |
| `app.json` | version `1.9.0` → `1.9.1` |
| `README.md` | 本节 §46 + TOC |

工作区根（不进仓库）：`_v191_contract.md`、`_patch_verify_v191.py`、
`_run_gates_v191.ps1`、`_gate_v191_run.out.txt`、`_gate_v191_local_verify.txt`、
`_verify_ipa_v191.py` / `_release_v191.py` / `_commit_v191_msg.txt`、`_export_v191_lead/`；
A/B 组探针由 `zero-blur-optics` / `optics-engine` 就地更新，
C 组由 `quality-gate` 全量复跑（26 道门禁 + 暗角单验）。

## 47. v1.9.2：亮白通透（层序倒置 + 无 crush + 高明度染色 + 80% 内圈暗角 + RGBA 颗粒 + 地名后缀）

### 47.1 用户需求与四条数学病根

用户 m09093 对照 v1.9.1 的十张实拍样片，结论是**整体欠曝 0.7~1.0 EV**
（白衬衫、斑马线、白云、白雪全在发灰）、且仍有灰雾。四条数学病根：

1. 照片上方还有 `normal` 混合的半透明层 —— 等价于「用一张黑纸垫在照片上再压白」，
   亮度乘性垫灰；
2. `shadowCrush` 的 multiply 压暗 + 过强 `sCurveContrast` 的 overlay 压中间调，
   两刀都朝下；
3. 深色 `soft-light` 染色（RGB<128）在 iOS 的 CoreImage 公式下等于减光镜；
4. 暗角中心透明区只有 70%、强度偏大，画面中间的山体/海湾被压黑。

用户冻结规格：**除基底（opacity:1）外严禁照片上方出现 `normal` 或未声明混合模式的
半透明层**；染色只许 `soft-light`（每卷明文例外优先）；废除 shadowCrush；曝光提亮翻倍；
暗角中心 80% 全透明、上限 0.15。

### 47.2 手术一：层序倒置 —— 先加光、后拉反差（`gradeLayers.ts`）

v1.9.1 的层序是「sCurve(overlay) → exposure(screen)」，先压黑再提亮，中调被两刀反复
揉搓。v1.9.2 倒置为「exposure(screen) → sCurve(overlay)」，并把三条 photo 层的
`blurRadius` 全部锁 0：

| # | 层 key | 混合模式 | 不透明度 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | `exposure-lift` | `screen`（同源、blurRadius 0） | `clamp(exposureLift, 0, 0.62)` | 零模糊曝光提亮，Y' = 2Y − Y² |
| 2 | `s-curve-contrast` | `overlay`（同源、blurRadius 0） | `clamp(sCurveContrast, 0, 0.30)` | 零模糊 S 曲线，Y<0.5→2Y²，Y≥0.5→1−2(1−Y)² |
| 3 | `temperature` | `soft-light` | `clamp(ΔT, 0, 0.22)` | 仅非 0 才出层（九卷静态为 0） |
| 4 | `tint` | `soft-light` | `clamp(Δt, 0, 0.22)` | 同上 |
| 5 | `shadow-crush` | `multiply`（同源、blurRadius 0） | `clamp(crush, 0, 0.03)` | 仅 >0.005 才出层（九卷只剩 TX-400 0.03） |
| 6 | `mono-desaturate` | `color` | 1.0 | 真黑白去色 |
| 7 | `shadow-tint` | `soft-light` | `clamp(opacity, 0, 0.28)` | 暗部色纸（高明度色） |
| 8 | `highlight-tint` | `soft-light` / `overlay` | `clamp(opacity, 0, 0.30)` | 高光色纸；EK-100 按用户明文用 overlay |
| 9 | `grain` | `multiply` | `grainLevel` 档位 | 颗粒（RGBA 透明载体） |
| 10 | `vignette` | `multiply` | `clamp(vignette, 0, 0.15)` | 80% 内圈暗角 |
| 11 | `light-leak` | `screen` | `clamp(leak, 0, 0.10)` | 漏光 |

- 常量导出：`S_CURVE_OPACITY_MAX = 0.30`、`EXPOSURE_LIFT_OPACITY_MAX = 0.62`、
  `SHADOW_CRUSH_OPACITY_MAX = 0.03`、`VIGNETTE_OPACITY_MAX = 0.15`、
  `sanitizeTintBlendMode()`；`halation` 层与 `HALATION_OPACITY_MAX` 一起删除
  （九卷全 0，`halation` 字段仅为兼容保留在 `ColorGradeConfig`）；
- 色温/色调四个化学色全部换成**高明度色纸**：`#FFE2C2`（暖）/ `#C9E6FF`（冷）/
  `#D2F6C8`（绿）/ `#FFD1F2`（品红），不再有深色 soft-light 当减光镜；
- `countStageImages` 契约：um-400/gd-200/pt-400/cp-200/fj-400/cs-800t/hp-400 各 6 层，
  ek-100 5 层（零颗粒），tx-400 7 层（带 crush）。

### 47.3 手术二：自适应只加光、不压暗（`adaptiveGrade.ts`）

删 `shadowCrushTarget` 与四个 `SCENE_CRUSH_TARGET_*`（绝对目标值会强行抬高预设 crush，
与新约束冲突），四场景改为纯增量：

| 场景 | `sCurveContrastDelta` | `exposureLiftDelta` | `shadowCrushDelta` | 密度 / 分离 |
| --- | --- | --- | --- | --- |
| `dark`（夜景/室内） | +0.06 | **+0.15** | 0 | 1.00 / 1.00 |
| `high-contrast`（大光比） | +0.10 | +0.06 | 0 | 1.00 / 1.00 |
| `flat`（阴天平光） | +0.12 | +0.12 | 0 | 1.20 / 1.20 |
| `bright`（雪地/天空） | +0.04 | +0.04 | 0 | 1.00 / 1.00 |
| `neutral` | 0 | 0 | 0 | 1.00 / 1.00 |

任何场景都不再减少曝光提亮、也不增加压暗；`HALATION_DELTA_MAX = 0`。
`classifyScene` 阈值与 `MIN_SAMPLES=12` 不变，白平衡/色调夹取仍为 ±0.14 / ±0.08。

### 47.4 手术三：九卷亮白通透基准（`presets.ts` / `FilmCard.tsx`）

| id | 代号 | sCurve / lift / crush / vignette / halation | 染色（全部 soft-light） |
| --- | --- | --- | --- |
| `um-400` | 幽蓝 400（默认） | .24 / **.42** / 0 / .12 / 0 | 暗部 `#91CDFF`.22 + 高光 `#FFE6AF`.18 |
| `gd-200` | 金调 200 | .20 / .44 / 0 / .10 / 0 | 高光 `#FFE096`.28 |
| `pt-400` | 蜜桃 400 | .16 / **.46** / 0 / .08 / 0 | 高光 `#FFE8D7`.26 |
| `cp-200` | 琥珀 200 | .18 / .40 / 0 / .12 / 0 | 高光 `#FFD791`.26 |
| `fj-400` | 翡翠 400 | .20 / .44 / 0 / .10 / 0 | 高光 `#9BEEE1`.26 |
| `ek-100` | 暖金 100 | .26 / .38 / 0 / .14 / 0 | 高光 `#FFEBCD`.18 **overlay**（用户明文例外），零颗粒 |
| `cs-800t` | 冰川 800T | .22 / .42 / 0 / .12 / 0 | 暗部 `#8CD2FF`.28 |
| `hp-400` | 石墨 400（mono） | .22 / .42 / 0 / .10 / 0 | — |
| `tx-400` | 玄铁 400（mono） | .30 / .38 / **.03** / .15 / 0 | — |

- 九卷 halation 全 0（用户铁律），grain 默认 0.025（比 v1.9.1 再降 50%）；
  `PRESET_DEFAULTS.grain = 0.025`、`PRESET_DEFAULTS.vignette = 0.10`；
- `FilmCard.tsx` 渐变卡随新量程重标定：`BASE_GRAY=110`、`CRUSH_RANGE=240`、
  `S_RANGE=150`、`LIFT_RANGE=160`、`VIGNETTE_RANGE=170`、`CHEMISTRY_GAIN=1.2`；
  三档都带暗角下沿项，九卷两两可辨（max ≥15 / 累计 ≥50）；
- 11 条旧 id 兼容映射、`DEFAULT_PRESET_ID='um-400'`、
  `GRAINLESS_PRESET_IDS={'ek-100'}` 全部保留。

### 47.5 颗粒重烤（RGBA alpha 载体）与暗角重烤（80% 内圈）

- `grain.ts` 档位改为 LT 0.012 / STD 0.025 / HV 0.038 / MAX 0.055、
  `GRAIN_OPACITY_MAX = 0.055`；dust 阈值 0.035 / 0.05；
- `scripts/generate_grain_clump.py` 改为**真 RGBA 透明 alpha 载体**（RGB 只做白/黑粒子
  载体，alpha 承载透明度），重生成 `assets/textures/grain.png`：
  512×512 RGBA、**390,943 B**、
  sha256 `84098a73fe0c8d86049718c85252d46231bc6172f6303eaefb8165e792c00994`；
  alpha mean 0.2078 / std 0.1570 / zeroFrac 0.0060，频带 `<8px 84.4% / 24–64px 1.6%`；
- `scripts/generate_vignette.py` 改 `INNER_RADIUS = 0.80`：中心 80% 完全透明、仅四角
  20% 过渡，RGB 恒 `(4,12,20)`；重生成 `assets/textures/vignette.png`：
  1024×1024 RGBA、**118,547 B**、
  sha256 `a379f92417b71890aca3e4ea75e6a4ac1e2824c11beee32d47a0accc98185e70`；
  alpha 实测 rho 0.80 = 0 / 0.86 = 55 / 0.94 = 200 / 1.0 = 255。

### 47.6 地名后缀修复：CHINA / JAPAN 在中文/日文水印里归位

- `placeNames.ts` 新增 `LATIN_COUNTRY_ALIASES` / `normalizeLatinAliasKey` /
  `codeFromCountryName` / `resolveCountryCode`：中文/日文地名栏的国名后缀先按
  四语反表 → 地区名 → 拉丁别名 → alpha-3 归一成国家代码，再走 `COUNTRY_NAMES`
  输出 中国/中國/日本，不再直接漏出 `CHINA` / `JAPAN`；
- 覆盖 CHINA 6 种变体 / JAPAN 5 种变体 × 3 种语言 × 3 种形态，英文档逐字不变，
  港澳台仍走 `CHINA_PREFIX`；
- `CameraScreen.tsx` 预览水印的 `planWatermark` 改传
  `locale: resolveGeoLocale(settings.geoLocale, localeId)`（并把 `settings.geoLocale`
  加进依赖），修掉 UI=en/fr + 地名语言=zh/ja 时预览漏出 `CITY · CHINA` 的路径；
  成片链路 `useFilmStage` 此前已是正确 locale，无需改。

### 47.7 门禁（26 道，39,312 条断言 + 暗角 9/9）

| # | 门禁 | 断言 | # | 门禁 | 断言 |
| --- | --- | --- | --- | --- | --- |
| G01 | `_probe_date_engine.cjs` | 3372 | G14 | `_purity_audit.mjs` | 64 |
| G02 | `_probe_film_look.cjs` | 2417 | G15 | `_probe_v186_perf.cjs` | 241 |
| G03 | `_probe_geo_lock.cjs` | 16207 | G16 | `_probe_v188_sharp.cjs` | 158 |
| G04 | `_probe_noframe_v181.cjs` | 455 | G17 | `_probe_v189_flash.cjs` | 56 |
| G05 | `_probe_noframe_watermark.cjs` | 458 | G18 | `_probe_v190_stocks.cjs` | 919 |
| G06 | `_probe_skin_material.cjs` | 1069 | G19 | `_probe_v190_optics.cjs` | 1319 |
| G07 | `_probe_v180_seams.mjs` | 1468 | G20 | `_probe_v190_meter.mjs` | 281 |
| G08 | `_probe_lead_integration.mjs` | 315 | G21 | `_probe_v190_async.cjs` | 150 |
| G09 | `_probe_capture_quality.mjs` | 78 | G22 | `_probe_v190_wiring.cjs` | 1953 |
| G10 | `_probe_v184_camera.cjs` | 940 | G23 | `_probe_v1811_adaptive.cjs` | 2717 |
| G11 | `_probe_v185_place.cjs` | 731 | G24 | `_probe_v1811_scene.mjs` | 478 |
| G12 | `_probe_v185_frame.cjs` | 1781 | G25 | `_probe_v1811_watermark.cjs` | 1497 |
| G13 | `_haze_audit.mjs` | 9/9（结构 108 + 数据/源码 80，超预算 0/9） | — | **合计** | **39,312 条断言 + 暗角 9/9** |

- `tsc --noEmit -p tsconfig.json` → EXIT 0；26 门禁全 EXIT 0 / 0 失败
  （`_run_gates_v192.ps1`，日志 `_gate_v192_run.out.txt`）。
- `_haze_audit.mjs` 结构门禁 9 卷 × 12 条与径向暗角 9 卷 × 12 条各 0 失败；
  `veilMid` 预算由 0.10 重标定为 0.18：exposureLift 翻倍后光晕的声明成本实测
  0.1110~0.1746，仍能抓住额外 ≥0.02 的雾层，属预算口径更新而非放宽雾限。
- 本地包核验 `python _verify_ipa_v192.py --local <bundle>` → `RESULT(local): OK`，
  bundle `index-144d259c9b13df301d519b91f6decd9e.js` = **1,386,381 B**
  （v1.9.1 为 1,386,100 B，+281 B）；`--grain` / `--vignette` 单验均 OK
  （颗粒改按 512×512 RGBA alpha 通道统计 mean/std/zeroFrac 与 alpha 频带）。

### 47.8 发布指纹

*（实测值，2026-10-18 发布回填）*

| 项 | 值 |
| --- | --- |
| 本地提交 | `43b2e85`（v1.9.2 特性）+ 本文档回填提交（docs-only，`paths-ignore` 跳过 CI） |
| 远端 master | `87d4f6eb92051787265ee7a9b9023b11fc087b2d`（Git Data API 推送，TREE MATCH） |
| CI run / job | run `39131478827` / job `117687380745`（macos-26-intel，全 success） |
| artifact id / 体积 | `12137653657` / **10,644,088 B**（`FretroCam-unsigned-ipa`） |
| IPA 文件 / 体积 / sha256 | `FretroCam-v1.9.2-unsigned.ipa` / **10,758,404 B** / `869a51a7961960e45ee7c01baec4a3527043ae6f2faf6a0b918a89aa6caef25a` |
| Release id / asset id | release `416473758`（tag `v1.9.2`）/ asset `653583148` |
| IPA 回读核验 | `RESULT: OK` —— 115 entries、`main.jsbundle` **2,103,239 B**、Info.plist `1.9.2` + `com.canyerylee.fretrocam` FOUND、10 张相框、grain.png 390,943 B sha `84098a73…`（RGBA alpha mean 0.2078/std 0.1570，<8px 84.4%）、vignette.png 118,547 B sha `a379f924…`（中心 0/四角 255/RGB(4,12,20)）、PRESENT 全命中零 missing、ABSENT 全 0 |
| 下载地址 | https://github.com/lizimo20041023-oss/retro-film-cam/releases/download/v1.9.2/FretroCam-v1.9.2-unsigned.ipa |

### 47.9 文件改动

| 文件 | 改动 |
| --- | --- |
| `src/utils/gradeLayers.ts` | 层序倒置（exposure → sCurve）、删 halation 层、染色强制 soft-light/overlay、高明度化学色、五常量改 0.30/0.62/0.03/0.15、文件头注释重写 |
| `src/utils/adaptiveGrade.ts` | 删 `shadowCrushTarget` 与四个 `SCENE_CRUSH_TARGET_*`；四场景纯增量（只加光不压暗）；`HALATION_DELTA_MAX=0` |
| `src/constants/presets.ts` | 九卷亮白基准重标定；`PRESET_DEFAULTS.grain=0.025` / `vignette=0.10`；染色换高明度色纸 |
| `src/components/FilmCard.tsx` | swatch 量程与公式重标定（BASE_GRAY=110 等），九卷两两可辨 |
| `src/constants/grain.ts` | 档位 0.012/0.025/0.038/0.055、上限 0.055、dust 阈值 |
| `scripts/generate_grain_clump.py` | 改为 RGBA 透明 alpha 载体 |
| `assets/textures/grain.png` | 重烤 512² RGBA、390,943 B、sha256 `84098a73…` |
| `scripts/generate_vignette.py` | `INNER_RADIUS = 0.80`、剖面元组与 docstring |
| `assets/textures/vignette.png` | 重烤 1024² RGBA、118,547 B、sha256 `a379f924…` |
| `src/utils/placeNames.ts` | 新增国家码归一化四函数；中文/日文国名后缀不再漏 CHINA/JAPAN |
| `src/components/CameraScreen.tsx` | 预览水印 locale 走 `resolveGeoLocale(settings.geoLocale, localeId)` |
| `src/types/index.ts` | `ColorGradeConfig` 结构不变，注释改 v1.9.2 口径（halation 不产生图层） |
| `src/constants/textures.ts` | 纹理注释更新 |
| `app.json` | version `1.9.1` → `1.9.2` |
| `README.md` | 本节 §47 + TOC |

工作区根（不进仓库）：`_v192_contract.md`、`_patch_verify_v192.py` / `_patch_verify_v192b.py`、
`_run_gates_v192.ps1`、`_gate_v192_run.out.txt`、`_gate_v192_local_verify.txt`、
`_verify_ipa_v192.py` / `_release_v192.py` / `_commit_v192_msg.txt`、`_export_v192_lead/`；
A/B/D 组探针由 `zero-blur-optics` / `optics-engine` / `watermark-engine` 就地更新，
C 组由 `quality-gate` 全量复跑（26 道门禁 + 颗粒/暗角单验）。

---

**改代码前请先读 `src/types/index.ts`** —— 所有数据结构都在那一个文件里，
`constants`（纯数据）→ `utils`（纯逻辑）→ `components`（渲染）的单向依赖是刻意设计的。
