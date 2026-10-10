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
 *    · Python（推荐，和 scripts/generate_placeholder_assets.py 里一样的做法）：
 *        from PIL import Image
 *        im = Image.open('assets/frames/你的.png').convert('RGBA')
 *        a = im.getchannel('A')
 *        print(a.getbbox(), im.size)   # bbox 就是窗口像素范围
 *      然后把 bbox 除以尺寸得到归一化值。
 *    · 也可以在代码里临时打印：把下面的 window 随便填，跑 `npm run typecheck`，
 *      在 App 里点一下显影，观察 `assets/frames/README.md` 里写的自检方法。
 *
 * 3. 往下面数组里加一条：
 *    { id: 'my-frame', name: '我的相框', source: require('../../assets/frames/my-frame.png'),
 *      aspect: 宽/高, window: { x, y, width, height }, defaultTimestampAnchor: 'window' }
 *
 * ⚠️ 改了相框以后，相机取景窗口和成片画幅会自动跟着变 —— 因为两者都由这一份数据算出来
 *    （见 `src/utils/geometry.ts` 的 computeFrameLayout）。
 * ─────────────────────────────────────────────────────────────────────────
 */
import type { FrameSpec } from '../types';

export const FRAMES: FrameSpec[] = [
  {
    id: 'classic-white',
    name: '白边印刷',
    // 1350×1800 = 3:4，镂空窗口 1200×1599（画面比例 ≈ 0.7505，接近 3:4）
    source: require('../../assets/frames/classic-white.png'),
    aspect: 1350 / 1800,
    window: { x: 0.055556, y: 0.05, width: 0.888889, height: 0.888333 },
    photoFit: 'cover',
    // 白边很窄，日期烧在画面内部右下角更好看
    defaultTimestampAnchor: 'window',
    designSize: { width: 1350, height: 1800 },
    description: '白边 + 极细内描边，底边印 "RETRO 400 · 36 EXP · C-41"',
  },
  {
    id: 'instant-square',
    name: '拍立得',
    // 1425×1800，镂空窗口是正方形（1275×1275）
    source: require('../../assets/frames/instant-square.png'),
    aspect: 1425 / 1800,
    window: { x: 0.052632, y: 0.05, width: 0.894737, height: 0.708333 },
    photoFit: 'cover',
    // 拍立得的下白边很宽：日期烧在留白里，就像真机手写/打印的日期
    defaultTimestampAnchor: 'frame',
    designSize: { width: 1425, height: 1800 },
    description: '1:1 正方形画面 + 宽下白边，日期烧在下白边的留白里',
  },
  {
    id: 'film-35mm',
    name: '35mm 胶片',
    // 1350×1950，镂空窗口 930×1240（3:4），上下黑边 + 左右透明齿孔
    source: require('../../assets/frames/film-35mm.png'),
    aspect: 1350 / 1950,
    window: { x: 0.155556, y: 0.138462, width: 0.688889, height: 0.635897 },
    photoFit: 'cover',
    defaultTimestampAnchor: 'frame',
    designSize: { width: 1350, height: 1950 },
    description: '3:4 画面 + 黑边齿孔，日期烧在下黑边（刻度盘字体）',
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
