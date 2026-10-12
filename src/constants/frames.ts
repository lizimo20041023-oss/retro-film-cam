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
 *      aspect: 宽/高, window: { x, y, width, height },
 *      watermark: { anchor: 'window', tone: 'amber', align: 'right' } }
 *    （`name` 直接写中文也行 —— 只有内置相框会配 `nameKey` 走多语言翻译。）
 *
 * ⚠️ 改了相框以后，相机取景窗口和成片画幅会自动跟着变 —— 因为两者都由这一份数据算出来
 *    （见 `src/utils/geometry.ts` 的 computeFrameLayout）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 这四款是怎么来的：**每一款对应一种真实存在的物理产物**
 * ─────────────────────────────────────────────────────────────────────────
 * 上一版有 8 款，问题不在数量，在于其中几款是"滤镜思维"的产物 —— 靠撒噪点、
 * 撒污渍、印一行 `RT-400 · 36 EXP · C-41` 来暗示"我很旧"。真实相纸不长那样：
 * 纸面是干净的，做旧是**时间和使用**留下的，不是印刷时喷上去的。所以这一版：
 *
 *   1. 每款的画幅比、留白比例、开孔位置都照**真实规格**算（86×54 的 instax mini、
 *      88×107 的 600 系即时成像、35mm 的 24×36 开孔、50×50 幻灯卡）；
 *   2. 只保留**工艺决定的**细节（片边齿孔、片基代号、幻灯卡的纸纹），
 *      删掉一切"为了像旧照片而画上去的"脏点；
 *   3. 留白不说话 —— 字只出现在真有信息的地方（片边代号、卡纸上的规格印字）。
 *
 * ⚠️ `watermark` 决定水印烧在哪，**加相框时一定要顺手核一遍**：
 *    · `{ anchor: 'frame' }`  烧在下留白里。下留白 < 110px 的相框千万别选它，
 *      日期会压到边框外；留白里已有的印字（片基代号、卡纸规格字）也要给它让位。
 *    · `{ anchor: 'window' }` 烧在画面内部右下角，永远不会和边框上的字打架。
 *    · `tone`：`'graphite'` 给"下巴默认纯留白"的相框（拍立得、幻灯卡）用，
 *      它输出的是一行极细灰色打字机体小字，不是橙色点阵液晶。
 * ─────────────────────────────────────────────────────────────────────────
 */
import type { FrameSpec } from '../types';

export const FRAMES: FrameSpec[] = [
  {
    id: 'polaroid-600',
    name: '一次成像',
    nameKey: 'frame.polaroid600',
    // 顶栏胶囊徽标上的相框代号：纯 ASCII 大写短名，**不翻译**，也不走 `nameKey` ——
    // 它和胶卷预设的 `RT-400` / `PR-400` 是同一类东西：机器印在机身和片基上的代号，
    // 五种语言里都该长一样。徽标显示的是 `▌ {code} · {n}/{N}`。
    code: 'POLAROID',
    // 1408×1712 = 88:107（600 系即时成像的真实外框比）。
    // 画面区 1264×1264 正方形，四周留白 72px，底部下巴 376px —— 三边等宽、下重，
    // 这个"头轻脚重"的比例就是拍立得的辨识度来源，改一点点都不像。
    source: require('../../assets/frames/polaroid-600.png'),
    aspect: 1408 / 1712,
    window: { x: 0.051136, y: 0.042056, width: 0.897727, height: 0.738318 },
    photoFit: 'cover',
    // 下巴默认纯留白（真的拍立得是留给你写字的）→ 水印走灰色打字机体、贴左
    watermark: { anchor: 'frame', tone: 'graphite', align: 'left', uppercase: true },
    designSize: { width: 1408, height: 1712 },
    description: '600 系一次成像：1:1 正方形画面 + 三边等宽 + 厚重下巴，纸面干净无印花',
  },
  {
    id: 'instax-mini',
    name: '迷你画幅',
    nameKey: 'frame.instaxMini',
    // 机器代号，不翻译（说明见上面 `polaroid-600` 那条）。
    code: 'INSTAX',
    // 1080×1720 = 54:86（instax mini 的真实外框比）。
    // 画面区 918×1224 严格 3:4 竖构图，上留白 90px、下巴 406px。
    source: require('../../assets/frames/instax-mini.png'),
    aspect: 1080 / 1720,
    window: { x: 0.075, y: 0.052326, width: 0.85, height: 0.711628 },
    photoFit: 'cover',
    watermark: { anchor: 'frame', tone: 'amber', align: 'right' },
    designSize: { width: 1080, height: 1720 },
    description: '迷你即时成像：3:4 竖幅 + 6px 圆角画面区，冷白细腻无杂质',
  },
  {
    id: 'neg-135',
    name: '135 负片',
    nameKey: 'frame.neg135',
    // 机器代号，不翻译（说明见上面 `polaroid-600` 那条）。带空格是故意的：
    // 真实片边上印的就是 `135`，前面冠一个胶卷家族的短名，比硬凑成一个词好认。
    code: '135 NEG',
    // 1350×1950。按 35mm 胶片的真实毫米数放大（约 38.6 px/mm）：
    // 画面区 926×1389 = 24×36mm 竖拍，两侧各 212px 是齿孔带，
    // 上下各留 280/281px 片头片尾用来印代号。
    source: require('../../assets/frames/neg-135.png'),
    aspect: 1350 / 1950,
    window: { x: 0.157037, y: 0.14359, width: 0.685926, height: 0.712308 },
    photoFit: 'cover',
    // 片边已经印满了字（齿孔代号 / PROCESS C-41），日期改烧画面内部右下角，谁也不挤谁
    watermark: { anchor: 'window', tone: 'amber', align: 'right' },
    designSize: { width: 1350, height: 1950 },
    description: '135 负片：两侧真齿孔 + 橙黄/浅白片边代号（▷ 12A / PROCESS C-41），纯黑片基无污渍',
  },
  {
    id: 'slide-mount',
    name: '幻灯装裱',
    nameKey: 'frame.slideMount',
    // 机器代号，不翻译（说明见上面 `polaroid-600` 那条）。
    code: 'SLIDE',
    // 1350×1350 = 1:1（50×50mm 幻灯卡纸的真实外形）。
    // 开孔 972×648 = 36×24mm 横幅，**居中偏下**（上 403px / 下 299px ≈ 1.35:1），
    // 这就是唯一一张横构图。开孔宽占卡纸宽的 72.000%，落在设计规格的 68~72% 区间内，
    // 所以宽度一像素都没动 —— 一动 3:2 就不正了。
    source: require('../../assets/frames/slide-mount.png'),
    aspect: 1350 / 1350,
    window: { x: 0.14, y: 0.298519, width: 0.72, height: 0.48 },
    photoFit: 'cover',
    watermark: { anchor: 'frame', tone: 'graphite', align: 'right' },
    designSize: { width: 1350, height: 1350 },
    description: '幻灯装裱卡：1:1 象牙白卡纸 + 3:2 横幅开孔 + 顶部极细 SLIDE MOUNT 印字',
  },
  // ↓↓↓ 在这里继续加你的相框 ↓↓↓
];

/**
 * 冷启动时用哪个相框（必须是上面某个 id）。
 *
 * 选 `polaroid-600` 而不是 `neg-135`：它的 0.822 画幅比最接近手机屏幕，
 * 取景器里浪费的黑边最少；而且正方形画面 + 厚下巴是所有胶片形态里辨识度最高的。
 */
export const DEFAULT_FRAME_ID = 'polaroid-600';

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
