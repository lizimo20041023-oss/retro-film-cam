# 胶片预设调色参考（2026-10-21）

新增的 FG-400（富士绿）和 RB-100（理光蓝）是本项目独立调校的 33³ LUT，不是富士或理光官方 LUT，也不代表厂商认可。网上样张仅用于观察色彩特征；图片本身没有复制到 App。

| 预设 | 公开参考 | 调色目标 |
| --- | --- | --- |
| FG-400 | [富士 Classic Neg. 官方说明与样张](https://www.fujifilm-x.com/global/products/film-simulation/classic-neg/)、[富士技术故事](https://www.fujifilm-x.com/en-my/stories/x-pro3-stories-2-learning-from-film/) | 青绿色阴影、少量品红高光、较硬的色彩反差；压住植被绿的荧光感并保留肤色。与 FJ-400 的明亮通透青绿区分。 |
| RB-100 | [Ricoh GR 官方 Positive Film 说明](https://www.ricoh-imaging.co.jp/english/support/qa/gr-3/index.html)、[GR IV 官方样张](https://www.ricoh-imaging.co.jp/english/products/gr-4/ex/)、[Camset Ricoh Blue 原创配方和样张](https://camset-app.com/ricoh-film-recipes-GR3/posts/ricoh_blue/) | 正片式反差；定向增加蓝天的密度与饱和度，控制亮部，保持暖色主体。与 CS-800T 的钨丝夜景冷蓝区分。 |

Ricoh Blue 是公开配方的名称，并非理光官方 Image Control 模式名。两款预设复用项目现有、已注明 MIT 来源的光谱 LUT 作为基底，再分别生成并缓存独立色表，避免在安装包中复制大段原始图集。

用户提供的 `Desktop/1` 照片用于同图对照；其已有日期字样和胶片质感，因此主要用于观察不同预设之间的差异，不视为中性原图。没有将这些照片加入 App 安装包。
