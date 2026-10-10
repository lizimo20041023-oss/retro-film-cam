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
- [13. 可选升级路径（默认代码不含）](#13-可选升级路径默认代码不含)
- [14. 路线 B：打独立 App 的技术说明](#14-路线-b打独立-app-的技术说明)
- [15. 界面设计：为什么"质感"是图片而不是样式](#15-界面设计为什么质感是图片而不是样式)
- [16. 成片质感：颗粒 / CCD / 分辨率天花板](#16-成片质感颗粒--ccd--分辨率天花板)

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
├── App.tsx                       # 应用根：SafeAreaProvider + 状态栏 + 单屏
├── index.ts                      # registerRootComponent(App)（package.json 的 "main"）
├── app.json                      # Expo 配置：图标、bundleId、权限文案、深色 UI、插件
├── package.json                  # 依赖 + 脚本（start / tunnel / typecheck / deps）
├── tsconfig.json                 # extends expo/tsconfig.base + strict
├── babel.config.js               # 只用 babel-preset-expo（不需要 reanimated 插件）
├── .gitignore                    # 忽略 node_modules / .expo / ios / android / 签名文件
├── 新手操作指南.md                # ★ 零基础：用 Expo Go 跑起来（路线 A）
├── 如何装到手机上.md              # ★ 零基础：打成独立 App 装到 iPhone（路线 B）
│
├── .github/
│   └── workflows/
│       └── build-ios-ipa.yml     # ★ GitHub 免费 Mac 机器上打未签名 .ipa 的流水线
│
├── assets/
│   ├── icon.png                  # App 图标 1024×1024（由 scripts/generate_app_icon.py 生成）
│   ├── frames/                   # 相框 PNG（透明镂空）+ 规范文档
│   │   ├── classic-white.png     #   白边印刷 1350×1800
│   │   ├── instant-square.png    #   拍立得 1425×1800（1:1 窗口）
│   │   ├── film-35mm.png         #   35mm 胶片条 1350×1950（含透明齿孔）
│   │   └── README.md             #   ★ 自己加相框看这里
│   ├── textures/                 # 颗粒 / 色噪 / 灰尘 / 暗角 / 漏光贴图
│   │   ├── grain.png             #   512×512 无缝平铺颗粒（8 位灰度，σ=62）
│   │   ├── chroma-noise.png      #   512×512 CCD 块状色噪（调色板 PNG）
│   │   ├── dust.png              #   512×512 灰尘与划痕（screen 混合）
│   │   ├── vignette.png          #   512×512 径向暗角
│   │   ├── light-leak.png        #   768×768 右上角暖色漏光
│   │   └── README.md             #   ★ 换纹理看这里
│   ├── ui/                       # ★ 界面质感素材（皮革底纹 / 拨轮 / 快门 / 细线图标）
│   │   ├── leather-tile.png      #   320×320 无缝底纹（resizeMode="repeat"）
│   │   ├── dial.png              #   176×176 滚花拨轮（未点亮）
│   │   ├── dial-on.png           #   176×176 滚花拨轮（琥珀发光）
│   │   ├── shutter-disc.png      #   240×240 快门内盘（径向渐变 + 内阴影）
│   │   ├── icon-torch[-on].png   #   168×168 补光图标（灰 / 琥珀）
│   │   ├── icon-flip.png         #   168×168 镜头反转图标
│   │   ├── icon-film.png         #   168×168 预设（胶片条）图标
│   │   └── README.md             #   ★ 改质感 / 加按钮看这里
│   └── fonts/                    # 默认空目录（数码管字体可选，见 README）
│       └── README.md             #   ★ 想用 DSEG7 数码管字体看这里
│
├── scripts/
│   ├── generate_placeholder_assets.py   # 程序化重生成占位相框/纹理（Python + Pillow）
│   ├── generate_app_icon.py             # 程序化重生成 App 图标（Python + Pillow）
│   ├── generate_ui_assets.py            # 程序化重生成界面质感素材（Python + Pillow + numpy）
│   ├── preview_ui_mock.py               # 把样式表"翻译"成一张排版示意图（本地看比例用）
│   └── preview_grade.py                 # 模拟调色管线、打印每个预设的颗粒 σ（本地看质感用）
│
└── src/
    ├── types/index.ts            # 全部类型（唯一类型来源，导出完整）
    ├── constants/
    │   ├── frames.ts             # ★ 相框纯数据（名称 / PNG / 比例 / 镂空窗口）
    │   ├── presets.ts            # ★ 预设纯数据（对比度/饱和度/色温/时间戳…）
    │   ├── textures.ts           # 纹理注册表
    │   └── uiAssets.ts           # ★ 界面质感素材注册表（require 全部 assets/ui/*）
    ├── utils/
    │   ├── processFilmPhoto.ts   # ★ 后处理主管线（纯逻辑 + 依赖注入，可单测）
    │   ├── geometry.ts           # 取景比例 / 相框窗口 / 日期定位的几何计算
    │   ├── gradeLayers.ts        # 预设数值 → 图层数组（声明式调色，13 层）
    │   ├── captureOptions.ts     # 成片分辨率规划（成片长边 → captureRef 参数 + 像素数）
    │   ├── normalizePhoto.ts     # 原图降采样（内存优化；默认已关，直接用原图）
    │   ├── saveToLibrary.ts      # 存相册（新 API 优先 + 旧 API 兜底）
    │   ├── formatTimestamp.ts    # 日期格式化（YY MM DD / YY-MM-DD…）
    │   └── describeError.ts      # unknown → 用户可读文案
    ├── hooks/
    │   ├── useFilmStage.ts       # 合成视图的"挂载 → 就绪 → 截图"状态机
    │   └── useFilmFonts.ts       # 数码管字体加载 + 系统等宽兜底
    └── components/
        ├── CameraScreen.tsx      # 主屏（顶栏 / 取景 / 主控 / LCD 四段式布局）
        ├── DialButton.tsx        # 滚花拨轮按钮（44pt，质感来自 PNG，无高亮填充色）
        ├── FilmCompositor.tsx    # 成片合成视图（被 ViewShot 截图的那块）
        ├── FrameOverlay.tsx      # 取景器上的相框预览
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
| `grainChroma` | 0 ~ 1 | `chroma-noise.png` 平铺，`mixBlendMode: 'overlay'`，`opacity = 值` | CCD 特有的**块状色噪**（品红 ↔ 绿交替），是"小 DC 味"的主力 |
| `grain` | 0 ~ 1 | `grain.png` 平铺（`resizeMode: 'repeat'`），`mixBlendMode: 'overlay'`，`opacity = 值` | 胶片颗粒强度；粗细由贴图决定，见 [`assets/textures/README.md`](assets/textures/README.md) |
| `dust` | 0 ~ 1 | `dust.png` 平铺，`mixBlendMode: 'screen'`，`opacity = 值` | 底片灰尘与划痕，只在暗部显形 |
| `vignette` | 0 ~ 1 | `vignette.png` 拉伸，`mixBlendMode: 'multiply'`，`opacity = 值` | 四角压暗 |
| `lightLeak` | 0 ~ 1 | `light-leak.png` 拉伸，`mixBlendMode: 'screen'`，`opacity = 值` | `lightLeakFlip: true` 时水平镜像换边 |
| `timestamp` | 见下 | 右下角 `<Text>`（不是图层） | 见下方"时间戳" |
| `showGuide` | bool | 取景器九宫格 | 只影响取景，不进成片 |

**图层顺序 = 数组顺序**（色温 → 色调 → **分离色调** → 饱和度 → 对比度 → 褪色 → 曝光 → **光晕** → **色噪** → 颗粒 → **灰尘** → 暗角 → 漏光，共 13 层），
想调整顺序就改 `buildGradeLayers` 里的 `push` 次序；想加一种新效果，就在 `GradeLayer` 联合类型里加一个成员。
顺序是有讲究的：分离色调放在饱和度**之前**，才能让后面的调色在同一个基调上做；
色噪放在颗粒**之前**，让颗粒压在色噪上面，看起来才像"胶片盖在传感器噪点上"。

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
  没写就用相框自己的 `defaultTimestampAnchor`。
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
8. **未做**：闪光灯自动策略、连拍、多张选片、EXIF 保留、iPad 布局适配、i18n。
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
5. **多屏 / 相册页 / 设置页**：现在是单屏（`App.tsx` 直接渲染 `CameraScreen`），
   要加导航就装 `@react-navigation/native` + `native-stack`（都在 Expo Go 支持范围内）。
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
│ ① topPanel   真实布局行（不是浮层）      │  ← 竖线 + "白边印刷 · 2/3 · RETRO 400" ｜ 两枚拨轮
├───────────────────────────────────────┤
│                                       │
│ ② preview    flex:1, overflow:hidden  │  ← CameraView 实时原始画面
│              └ FrameSwitcher          │     相框 PNG + 三分线 + 四角对焦框 + 准星
│                                       │
├───────────────────────────────────────┤
│ ③ dashboard  拨轮+预设卡片 ｜ 快门 ｜ ‹ › │
├───────────────────────────────────────┤
│ ④ lcdWrap    琥珀等宽状态条             │  ← 日期锚点 / 颗粒 / 暗角 / 漏光
└───────────────────────────────────────┘
```

**顶栏是真实布局行，不是绝对定位的浮层** —— 这是相对上一版最重要的改动。
浮层会盖住取景器顶部，而"取景器保持完整实时画面"是本项目的硬约束。

### 为什么用 PNG 而不是 StyleSheet

RN 在 iOS 上没有径向渐变、没有内阴影、没有滚花纹理，而 `filter` 只有 brightness/opacity。
要做出"实体相机"的观感只有两条路：引 `react-native-linear-gradient` / `react-native-svg`
（**会引入原生依赖，Expo Go 直接跑不了**），或者用 Pillow 预渲染成 PNG。

选了后者：`scripts/generate_ui_assets.py` 生成 `assets/ui/` 下的 8 张图，
`src/constants/uiAssets.ts` 统一 `require`，`DialButton` 负责摆放。
**改质感只要改 Python 再跑一次，JS 一行都不用动。**

| 元素 | 实现 |
| --- | --- |
| 机身底纹 | `leather-tile.png` 320×320 无缝平铺 + `opacity: 0.95`。振幅 ±2.5/255，远看是 #171716 纯色 |
| 拨轮按钮 | `dial.png` / `dial-on.png` 作底 + 细线图标叠在上面（`size * 0.48`）。**没有任何高亮填充色**，点亮只靠图里的琥珀内发光 |
| 顶栏刻字 | 两枚拨轮底下各有一行 8pt 的"补光" / "翻转"（`INK.paperFaint`，几乎看不见但凑近能读） |
| 快门 | 三层同心圆：外圈 hairline `rgba(236,232,224,0.38)`、中圈 2pt `rgba(244,240,232,0.88)`、内盘 `shutter-disc.png` |
| 预设卡片 | 暗橙边框（`rgba(194,122,48,0.55)`）+ 7.5% 琥珀底色，像一张纸质标签 |
| LCD 状态条 | `rgba(210,139,42,0.20)` 细框，两行 `#D28B2A` 等宽字（`UI_MONO`），字距 1.1 |

**为什么 LCD 用 `UI_MONO` 而不是 `useFilmFonts`**：`useFilmFonts` 可能加载 DSEG7 数码管字体，
而 DSEG7 **没有中文字形**，LCD 那一行是中英混排的，会变成一堆方框。
系统等宽字体（iOS `Menlo` / Android `monospace`）能自动回退到中文，才是这里要的。

### 顶栏那两枚拨轮：为什么图标底下还有字

图标在盘面上只占 **21pt**（`44 × 0.48`），这个尺寸下再精致的图形也认不出功能 ——
最初"镜头反转"用的是"中心镜头圆 + 两段循环箭头"，缩到 21pt 后读起来像**刷新按钮**，
根本没人发现那儿能切前置。改了两件事：

1. **图标减负**：去掉内圈镜头圆，弧线从 9px 加粗到 12px、箭头放大到 26px，
   只留"两段带箭头的循环弧"这一个轮廓（见 `scripts/generate_ui_assets.py` 的 `make_icon_flip`）。
2. **加蚀刻小字**：拨轮底下补一行 8pt 的"补光"/"翻转"。真机身上这类按钮也都有刻字，
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

| 改动 | 内容 |
| --- | --- |
| **颗粒贴图** | `grain.png` 从 192×192 / σ=26 换成 **512×512 / σ=62**（8 位灰度），掺入 22% 的低频团簇做"结块感" |
| **新增 CCD 色噪** | `chroma-noise.png` 512×512，品红 ↔ 绿交替的 **2×2 块状**色斑（小 DC 的色噪是块状的，逐像素彩噪只是脏） |
| **新增灰尘划痕** | `dust.png` 512×512，配 `screen` 混合，只在暗部显形 |
| **新增 3 个图层** | 分离色调（`splitTone`，冷暗部 + 暖高光）、光晕（`bloom`，`color-dodge` 近似 halation）、色噪 / 灰尘 |
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
python scripts/generate_placeholder_assets.py   # 重新生成相框 + 5 张贴图
python scripts/preview_grade.py                 # 模拟调色结果，打印每个预设的颗粒 σ
```

`preview_grade.py` 会用与 CoreImage 同源的混合公式，把 `presets.ts` 里的数值**解析出来重放一遍**
（不抄第二份参数表，避免两边漂移），输出两张九宫格临时图 —— 这是在没有 iPhone 的情况下
唯一能"看到"成片效果的办法。

---

**改代码前请先读 `src/types/index.ts`** —— 所有数据结构都在那一个文件里，
`constants`（纯数据）→ `utils`（纯逻辑）→ `components`（渲染）的单向依赖是刻意设计的。
