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
- **GitHub Actions 开始计费**：Free 账号私有仓库每月 2000 分钟，macOS 机器按 **10 倍**扣，
  一次约 5 分钟的构建记掉约 50 分钟 —— 一个月只够跑 4 次。
  所以 `.github/workflows/build-ios-ipa.yml` 的 push 触发器加了 `paths-ignore`，
  纯文档提交不再构建。
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

- 内容 `▌ {code} · {n}/{N}`，例如 `▌ POLAROID · 01/04`；
- `▌` 是一个独立 `View`（宽 3、高 12、圆角 1、琥珀橙 `#E5A93C`），不是字符 ——
  字符在不同字体下宽度会变，徽标会跟着抖；
- 胶囊 `backgroundColor: 'rgba(255,255,255,0.08)'`、`borderRadius: 4`、
  `paddingHorizontal: 8`、`paddingVertical: 4`、等宽字体 12px、`maxWidth: '42%'`；
- **胶卷名从顶栏彻底移除** —— 它归左下角那张大卡片独占。原来两处都显示，
  375pt 机型上顶栏那行会被截成 `RE…`，正是用户报的溢出问题。

`FrameSpec` 为此新增了**必填** `code: string`（纯 ASCII 大写、五语言里都长一样、**不翻译**）：
`'POLAROID'` / `'INSTAX'` / `'135 NEG'` / `'SLIDE'`。

`N` 用的是**相框总数**（4）。规格里 `02/08` 与 `01/04` 两个分母对不上，判定那只是示范格式。

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

**改代码前请先读 `src/types/index.ts`** —— 所有数据结构都在那一个文件里，
`constants`（纯数据）→ `utils`（纯逻辑）→ `components`（渲染）的单向依赖是刻意设计的。
