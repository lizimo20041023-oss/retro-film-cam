/**
 * 相框表 —— 纯数据。加相框**不需要改任何逻辑代码**。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 怎么新增一个相框（3 步）
 * ─────────────────────────────────────────────────────────────────────────
 * 1. 把你的相框 PNG 丢进 `assets/frames/`。
 *    规范：**照片要露出来的那块必须是全透明（alpha = 0）**，其余部分随便画。
 *    PNG 尺寸不限（建议长边 1200~2400 px），但 `aspect` 必须和真实像素比一致。
 *
 * 2. 量出"透明窗口"在整张 PNG 里的归一化位置（0~1）：
 *    window.x = 窗口左边界像素 / PNG 总宽
 *    window.y = 窗口上边界像素 / PNG 总高
 *    window.width = 窗口宽度像素 / PNG 总宽
 *    window.height = 窗口高度像素 / PNG 总高
 *    量法（任选）：
 *    · Photoshop / 预览：用矩形选区选中透明区域，读选区坐标；
 *    · Python（推荐，和 scripts/generate_frames.py 里一样的做法）：
 *        from PIL import Image
 *        im = Image.open('assets/frames/你的.png').convert('RGBA')
 *        a = im.getchannel('A')
 *        print(a.getbbox(), im.size)   # bbox 就是窗口像素范围
 *      然后把 bbox 除以尺寸得到归一化值。
 *    · 也可以跑 `python scripts/preview_frames.py 你的照片.jpg` ——
 *      它会把取景器里几张相框并排贴在同一张照片上，一眼看出窗口量错没有。
 *
 * 3. 往下面数组里加一条：
 *    { id: 'my-frame', name: '我的相框', source: require('../../assets/frames/my-frame.png'),
 *      aspect: 宽/高, window: { x, y, width, height }, defaultTimestampAnchor: 'window' }
 *    （`name` 直接写中文也行 —— 只有内置相框会配 `nameKey` 走多语言翻译。）
 *
 * ⚠️ 改了相框以后，相机取景窗口和成片画幅会自动跟着变 —— 因为两者都由这一份数据算出来
 *    （见 `src/utils/geometry.ts` 的 computeFrameLayout）。
 *
 * ⚠️ `defaultTimestampAnchor` 决定日期烧在哪，**加相框时一定要顺手核一遍**：
 *    · 'frame'  烧在下留白里（右对齐，距底 insetRatio × 相框宽）。下留白 < 110px
 *               的相框千万别选它，日期会压到边框外；留白里已有的文字（色标条、
 *               档案卡的红线）也要给它让位 —— 具体位置见 scripts/generate_frames.py
 *               里每张图的注释，那里标了"这里是日期水印的地盘"。
 *    · 'window' 烧在画面内部右下角，永远不会和边框上的字打架。
 * ─────────────────────────────────────────────────────────────────────────
 */
import type { FrameSpec } from '../types';

export const FRAMES: FrameSpec[] = [
  {
    id: 'classic-white',
    name: '白边印刷',
    nameKey: 'frame.classicWhite',
    // 1350×1800，镂空窗口 1197×1596（3:4）。通篇无字 —— 留白就是它的设计。
    source: require('../../assets/frames/classic-white.png'),
    aspect: 1350 / 1800,
    window: { x: 0.056296, y: 0.046667, width: 0.886667, height: 0.886667 },
    photoFit: 'cover',
    // 下留白只有 120px，装不下日期 → 烧在画面内部右下角
    defaultTimestampAnchor: 'window',
    designSize: { width: 1350, height: 1800 },
    description: '纤维相纸：暖白 + 低频不匀 + 内缩细线 + 窗口压痕，无任何印刷字',
  },
  {
    id: 'instant-square',
    name: '拍立得',
    nameKey: 'frame.instant',
    // 1425×1800，镂空窗口是正方形（1269×1269）
    source: require('../../assets/frames/instant-square.png'),
    aspect: 1425 / 1800,
    window: { x: 0.054737, y: 0.051111, width: 0.890526, height: 0.705 },
    photoFit: 'cover',
    // 下白边 439px 很宽：日期烧在留白里，就像真机打印上去的那样
    defaultTimestampAnchor: 'frame',
    designSize: { width: 1425, height: 1800 },
    description: '1:1 画面 + 宽下白边，纸面带涂层杂质，下白边刻意留空（真宝丽来是给你写字的）',
  },
  {
    id: 'film-35mm',
    name: '35mm 胶片',
    nameKey: 'frame.film35',
    // 1350×1950，镂空窗口 930×1330，上下片边 + 两侧透明齿孔
    source: require('../../assets/frames/film-35mm.png'),
    aspect: 1350 / 1950,
    window: { x: 0.155556, y: 0.153846, width: 0.688889, height: 0.682051 },
    photoFit: 'cover',
    defaultTimestampAnchor: 'frame',
    designSize: { width: 1350, height: 1950 },
    description: '真实片边：齿孔 + 帧号（▶ 12A / 13 ▷）+ 片基代号，日期烧在下片边',
  },
  {
    id: 'darkroom',
    name: '暗房放大',
    nameKey: 'frame.darkroom',
    // 1350×1800，镂空窗口 1168×1590，四边宽度刻意不等（手工裁切）
    source: require('../../assets/frames/darkroom.png'),
    aspect: 1350 / 1800,
    window: { x: 0.057778, y: 0.051111, width: 0.865185, height: 0.883333 },
    photoFit: 'cover',
    defaultTimestampAnchor: 'frame',
    designSize: { width: 1350, height: 1800 },
    description: '纯黑卡纸 + 手工裁切的毛边窗口 + 左下角一枚小编号，最"摄影师"的一张',
  },
  {
    id: 'slide-mount',
    name: '幻灯装裱',
    nameKey: 'frame.slideMount',
    // 1350×1350 方卡，镂空窗口 1010×674（3:2 横向）—— 唯一一张横构图
    source: require('../../assets/frames/slide-mount.png'),
    aspect: 1350 / 1350,
    window: { x: 0.125926, y: 0.266667, width: 0.748148, height: 0.499259 },
    photoFit: 'cover',
    defaultTimestampAnchor: 'frame',
    designSize: { width: 1350, height: 1350 },
    description: '方形冷灰卡纸 + 圆角 + 压纹 + 3:2 横向开孔，唯一一张横构图',
  },
  {
    id: 'orange-base',
    name: '负片片基',
    nameKey: 'frame.orangeBase',
    // 1350×1800，镂空窗口 1050×1400
    source: require('../../assets/frames/orange-base.png'),
    aspect: 1350 / 1800,
    window: { x: 0.111111, y: 0.144444, width: 0.777778, height: 0.777778 },
    photoFit: 'cover',
    defaultTimestampAnchor: 'frame',
    designSize: { width: 1350, height: 1800 },
    description: '彩色负片的橙色 mask 当整块边框 + 齿孔，辨识度最高的一张',
  },
  {
    id: 'crop-marks',
    name: '打样张',
    nameKey: 'frame.cropMarks',
    // 1350×1800，镂空窗口 1158×1584
    source: require('../../assets/frames/crop-marks.png'),
    aspect: 1350 / 1800,
    window: { x: 0.071111, y: 0.06, width: 0.857778, height: 0.88 },
    photoFit: 'cover',
    // 下留白里已经排了四色色标条 → 日期改烧画面内部，不跟色标抢位置
    defaultTimestampAnchor: 'window',
    designSize: { width: 1350, height: 1800 },
    description: '印刷打样张：四角裁切线 + 套准十字 + 底部 C/M/Y/K 色标条',
  },
  {
    id: 'archive-card',
    name: '牛皮档案卡',
    nameKey: 'frame.archiveCard',
    // 1350×1800，镂空窗口 960×1280，左侧留出装订打孔的位置
    source: require('../../assets/frames/archive-card.png'),
    aspect: 1350 / 1800,
    window: { x: 0.222222, y: 0.083333, width: 0.711111, height: 0.711111 },
    photoFit: 'cover',
    defaultTimestampAnchor: 'frame',
    designSize: { width: 1350, height: 1800 },
    description: '牛皮纸 + 左侧三个装订孔 + 红线 + 打字机打的编号（基线是抖的）',
  },
  // ↓↓↓ 在这里继续加你的相框 ↓↓↓
];

/** 冷启动时用哪个相框（必须是上面某个 id）。 */
export const DEFAULT_FRAME_ID = 'classic-white';

/**
 * 按 id 找相框下标；找不到返回 0，绝不抛错（用户改了 id 也不至于白屏）。
 */
export function findFrameIndex(id: string): number {
  const index = FRAMES.findIndex((frame) => frame.id === id);
  return index >= 0 ? index : 0;
}

/**
 * 循环取下标：3 个相框时 -1 → 2，3 → 0。
 * FrameSwitcher 的左右滑切换就靠它。
 */
export function wrapIndex(index: number, length: number = FRAMES.length): number {
  if (length <= 0) {
    return 0;
  }
  return ((index % length) + length) % length;
}
