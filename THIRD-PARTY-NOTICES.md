# 第三方组件与许可证

FretroCam 的**源代码**是专有作品，见 [LICENSE](LICENSE)。
但它构建出来的 App 里打包了若干开源组件，这些组件继续适用它们各自的许可证；
[LICENSE](LICENSE) 不改变、也不限制你依那些许可证所享有的权利。

下表是**直接依赖**（`package.json` 里声明的）以及几个实际被打进 IPA 的原生模块。
版本号取自本机 `node_modules/` 里实际安装到的版本。

## MIT

| 组件 | 版本 | 版权 |
|---|---|---|
| `@react-native-async-storage/async-storage` | 2.2.0 | Copyright (c) 2015-present, Facebook, Inc. |
| `expo` | 57.0.27 | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| `expo-camera` | 57.0.6 | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| `expo-file-system` | 57.0.7 | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| `expo-font` | 57.0.4 | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| `expo-haptics` | 57.0.3 | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| `expo-image-manipulator` | 57.0.21 | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| `expo-localization` | 57.0.2 | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| `expo-location` | 57.0.20 | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| `expo-media-library` | 57.0.5 | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| `expo-modules-core` | 57.0.21 | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| `expo-status-bar` | 57.0.1 | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| `react` | 19.2.3 | Copyright (c) Meta Platforms, Inc. and affiliates. |
| `react-native` | 0.86.3 | Copyright (c) Meta Platforms, Inc. and affiliates. |
| `react-native-safe-area-context` | 5.7.0 | Copyright (c) 2019 Th3rd Wave |
| `react-native-view-shot` | 5.1.0 | Copyright (c) 2016 Gaëtan Renaudeau |

### MIT 许可证全文

```
MIT License

Copyright (c) <各组件各自的版权人，见上表>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 随二进制一起打包的原生依赖

除上表外，IPA 里还链接了下面这些（都由上面的包以预编译产物或 SPM 依赖的形式带入，
不是本仓库的直接依赖）：

| 组件 | 来源 | 许可证 |
|---|---|---|
| Hermes（`hermesvm.framework`） | `react-native` | MIT |
| React Native Core / ReactNativeDependencies | `react-native` 预编译产物 | MIT |
| SDWebImage、SDWebImageWebPCoder | `expo-image-manipulator` 的 SPM 依赖，链接时被 strip 掉 | MIT |

## 开发期依赖（不进 App）

`@babel/core`、`babel-preset-expo`、`patch-package`、`@types/react` 均为 MIT；
`typescript` 为 Apache-2.0。它们只在构建机上运行，不会出现在 IPA 里。

## 对 expo-camera 的本地修改

`patches/expo-camera+57.0.6.patch` 是对 MIT 许可的 `expo-camera@57.0.6` 的修改
（新增「点画面对焦」的原生实现，共 3 个 Swift 文件、+204 行、0 删除）。
该修改同样以 MIT 许可提供；`patch-package` 在 `npm ci` 时自动套用。

## 胶片预设调色数据（t3mujinpack，MIT）

v1.9.5 起，九卷调色参数由 [t3mujinpack](https://github.com/t3mujin/t3mujinpack) 的
九款胶片 Hald CLUT **离线转译**而来：只取拟合后的调色参数，不打包任何 LUT 文件；
App 内没有 LUT / 运行时转换，也没有新增依赖。

- 来源：https://github.com/t3mujin/t3mujinpack
- 许可证：MIT，`Copyright (c) 2017 João Almeida`
- 使用方式：离线拟合（`_v195_fit_all3.py`），转译口径见 README §50
- 归因：九卷调色参数是该预设数据的衍生作品，继续以 MIT 许可提供

该数据的 MIT 全文与上表相同，版权人为 `Copyright (c) 2017 João Almeida`。

## 胶片 LUT 数据（spectral_film_lut，MIT）

v2.0.0 起，九卷底片的**成片像素映射**改用真 33³ 3D LUT：由开源项目 spectral_film_lut 的
负片 + 印片光谱模拟模型**离线生成**，不打包上游源码或数据文件，App 内只内置生成好的
LUT 图集（PNG base64），运行时零网络请求、零新增依赖。

- 来源：https://github.com/JanLohse/spectral_film_lut
- 许可证：MIT License，`Copyright (c) 2017 Jan Lohse`（与包内 `LUT_ATLAS_LICENSE` 归属声明同文）
- 使用方式：离线生成（`_v196_gen_luts.py` 调上游 `create_lut`，sRGB→sRGB 33³；
  `_v200_gen_atlas.py` 打包为 256×141 RGBA 图集并生成 `src/constants/lutAtlas.ts`），
  转译与格式口径见 README §51.2/§51.3
- 不打包源码/上游数据：App 内无 Python 源码、无底片 datasheet、无 numpy/colour-science
- 归因：九卷 LUT 是该模型输出的**衍生数据**（v2.0.0 九卷 PNG 合计 407,760 B、base64 543,692 字符；
  v2.0.1 重标定后见下节），继续以 MIT 许可提供
- 映射：九卷固定为 UM-400 / GD-200 / PT-400 / CP-200 / FJ-400 / EK-100 / CS-800T / HP-400 / TX-400；
  卷代号与上游负片/相纸常量的逐卷对应只记录在 `_v201_lut_provenance.json` 与本仓库 README 的
  LUT 溯源表，本通知不重复上游厂商名或商品名；黑白两卷共用同一黑白相纸模型，EK-100 为反转片（无印片）

### v2.0.1 重标定（2026-10）

v2.0.1 对九卷 LUT 做了一次亮度轴重标定：只改中性灰轴的亮度映射（黑位/中间调/白场锚点），
不改色相与饱和度结构；九卷 PNG 合计 406,830 B、base64 542,456 字符，图集格式不变。
许可与归属不变（MIT，`Copyright (c) 2017 Jan Lohse`，衍生数据继续以 MIT 提供）；
不新增依赖、不联网，App 内仍只内置生成好的 LUT 图集，不含上游源码或数据文件。

该数据的 MIT 全文与上文「MIT 许可证全文」相同，版权人为 `Copyright (c) 2017 Jan Lohse`。

## 素材

`assets/` 下的全部图片（8 张相框、7 张纹理、11 个界面图标、App 图标）
都由本仓库自带的 Python 脚本生成，不含任何第三方素材。
仓库内不含任何字体文件，界面字体一律使用 iOS 系统自带的等宽字体。
