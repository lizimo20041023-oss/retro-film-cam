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
 *        # ⚠️ 别用 a.getbbox() —— 相框的纸面一直铺到画布边缘，
 *        #    "非零 alpha"的包围盒永远等于整幅画布，什么也量不出来。
 *        #    要量的是**透明区**，所以反相之后再取包围盒：
 *        from PIL import ImageOps
 *        print(ImageOps.invert(a).getbbox(), im.size)
 *        # 更稳的是从窗口中心洪泛（见 scripts/_verify_frames.py 的 flood()）：
 *        # 反相 bbox 会被齿孔、撕边、防挂切口带偏，洪泛出来的才是"那一个矩形洞口"。
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
 * ⚠️ v1.8.1 起数组的 **0 位不是纸框**，是 `00 NO FRAME`（`fullBleed: true`）——
 *    「不要相框」这一个选择。它是"材质之外的第二个轴"，渲染层必须整组早退；
 *    下面这五款纸框才是真正的物理产物（v1.6.1 精简前的 7 款里
 * 另有半格双联框与 8×10 散页，因为「一框多图」那条链路整体下线而一并删除）。
 * ─────────────────────────────────────────────────────────────────────────
 * 这五款是怎么来的：**每一款对应一种真实存在的物理产物**。
 * ─────────────────────────────────────────────────────────────────────────
 * 上一版有 8 款，问题不在数量，在于其中几款是"滤镜思维"的产物 —— 靠撒噪点、
 * 撒污渍、印一行 `RT-400 · 36 EXP · C-41` 来暗示"我很旧"。真实相纸不长那样：
 * 纸面是干净的，做旧是**时间和使用**留下的，不是印刷时喷上去的。所以这一版：
 *
 *   1. 每款的画幅比、留白比例、开孔位置都照**真实规格**算（86×54 的 instax mini、
 *      88×107 的 600 系即时成像、35mm 的 24×36 开孔、50×50 幻灯卡、
 *      73×55.6mm 的 FP-100C）；
 *   2. 只保留**工艺决定的**细节（片边齿孔、片基代号、幻灯卡的纸纹、
 *      撕拉片的显影药水痕、散页的防挂切口），删掉一切"为了像旧照片而画上去的"脏点；
 *   3. 留白不说话 —— 字只出现在真有信息的地方（片边代号、卡纸上的规格印字）。
 *
 * ⚠️ `watermark` 决定水印烧在哪，**加相框时一定要顺手核一遍**：
 *    · `{ anchor: 'frame' }`  烧在下留白里。下留白 < 110px 的相框千万别选它，
 *      日期会压到边框外；留白里已有的印字（片基代号、卡纸规格字）也要给它让位。
 *    · `{ anchor: 'window' }` 烧在画面内部右下角，永远不会和边框上的字打架。
 *    · `tone`：`'graphite'` 给"下巴默认纯留白"的相框（拍立得、幻灯卡）用，
 *      它输出的是一行极细灰色打字机体小字，不是橙色点阵液晶。
 *    · ⚠️ **横版要单独核一遍**：横版的 `anchor: 'frame'` 落在**右侧留白**
 *      （竖版的下巴转 90° 之后就是右边那条），不是下方。`slide-mount-landscape`
 *      的右下角有 `SLIDE MOUNT` 印字，用 `frame` 锚点时水印可能贴到它旁边 ——
 *      这一条没有真机验证过，见交付报告"没能验证的"一节。
 * ─────────────────────────────────────────────────────────────────────────
 */
import type { FrameSpec, NoFrameAspect } from '../types';

/**
 * 无相框模式（`00 NO FRAME`）的稳定 id —— **字符串字面量，不许改**。
 *
 * 它是 `FRAMES[0]` 的 id，会被写进 `AppSettings` 之外的地方（相册条目的 `frameId`、
 * 顶栏徽标代号、日志），也可能被用户的老存档引用 ⇒ 改名等于让所有历史无相框成片
 * 落到 `findFrameIndex` 的兜底帧上，变成"打开旧片子相框自己长出来了"。
 */
export const NO_FRAME_ID = 'no-frame';

/** 一档无相框画幅比。`ratio` 是**宽 / 高**（`computeFrameLayout` / `fitBox` 的口径）。 */
export interface NoFrameAspectSpec {
  id: NoFrameAspect;
  ratio: number;
}

/**
 * 无相框的三档画幅比 —— 恰好三项，顺序 = 界面上的顺序。
 *
 * ⚠️ **这三个数字是门禁脚本 `_probe_noframe_v181.cjs` 的 B15 逐位冻结的**
 * （`{id:'1:1',ratio:1}` / `{id:'3:4',ratio:0.75}` / `{id:'3:2',ratio:2/3}`，容差 1e-9）：
 *   · `3:2` 这一档给出的画布是 **2:3 竖幅**（`ratio = 2/3`，`fitBox` 的宽/高口径），
 *     不是"3:2 横幅"（那需要 1.5）。这一点与"3:2 = 横向"的日常直觉相反，
 *     但它就是冻结规格，**不要**为了让命名顺眼把它改成 1.5（门禁会红）。
 *   · 三档都不超过 1（正方形或竖幅）。竖屏取景器里"全屏铺展"的语义就是
 *     "在 358×435 那种竖盒子里按这个比例铺满"，横幅会在上下留黑边。
 */
export const NO_FRAME_ASPECTS: readonly NoFrameAspectSpec[] = [
  { id: '1:1', ratio: 1 },
  { id: '3:4', ratio: 0.75 },
  { id: '3:2', ratio: 2 / 3 },
];

/**
 * `resolveFrame` 的兜底档 = 无相框的默认画幅。
 *
 * ⚠️ 这个字面量在 `src/utils/settingsStore.ts` 的默认值表里**刻意再写一份**
 * （那个文件不许 import 常量模块，理由写在它自己的注释里：启动最早一帧就会被求值，
 * 而它要能被独立加载）。两处必须一致，改一处就要改另一处。
 */
export const DEFAULT_NO_FRAME_ASPECT: NoFrameAspect = '3:4';

/**
 * 把"用户选中的相框" + "无相框画幅档"解析成**真正拿去排版的那一个 `FrameSpec`**。
 *
 * 这是全项目唯一一处把"无相框"从"一个相框"变成"一套几何"的地方，渲染层与几何层
 * 都只消费它的返回值：
 *   · `fullBleed !== true`（普通纸框）→ **原样返回同一个引用**。零拷贝、零分配，
 *     也保证 `useMemo` 的依赖比较与以前逐位相同（老路径一行行为都不变）。
 *   · `fullBleed === true` → **返回新对象**（`window` 铺满自己的画布、`aspect` = 该档比例），
 *     **绝不就地改写**：`FRAMES` 是模块级常量表，改它 = 污染所有画幅并把
 *     `_probe_geo_lock.cjs` 里"纸框窗口落在 [0,1]"那一批断言带偏。
 *
 * `aspect` 传未知值时按 `DEFAULT_NO_FRAME_ASPECT` 兜底（老存档 / 手改 JSON 都不会白屏）。
 */
export function resolveFrame(frame: FrameSpec, aspect: NoFrameAspect): FrameSpec {
  if (frame.fullBleed !== true) {
    return frame;
  }
  const spec =
    NO_FRAME_ASPECTS.find((entry) => entry.id === aspect) ??
    NO_FRAME_ASPECTS.find((entry) => entry.id === DEFAULT_NO_FRAME_ASPECT) ??
    NO_FRAME_ASPECTS[0];

  return {
    ...frame,
    // 画幅比归这一档决定；`window` 铺满自己的画布（= 铺满整幅照片）
    aspect: spec.ratio,
    window: { x: 0, y: 0, width: 1, height: 1 },
  };
}

export const FRAMES: FrameSpec[] = [
  /**
   * `00 NO FRAME`（v1.8.1）—— **必须钉在 0 位**。
   *
   * 为什么放在数组第一位而不是末尾：抽屉里的相框行、顶栏徽标的 `n/N`、左右滑切换
   * 都按数组顺序走，用户要的"新编号 00"就是这套顺序里的第一格；而且
   * `_probe_geo_lock.cjs` 明写"fullBleed 相框至多一项且必须占 0 位"。
   *
   * ⚠️ 它**不是一款相框**，是"不要相框"这一个选择：所以它没有纸、没有窗口留白、
   * 也没有做旧皮肤 —— 渲染层（`FilmCompositor` / `FramePreviewLayer` / `FilmDrawer`）
   * 都必须凭 `fullBleed` 整组早退，连取景器里那四块不透明幕布都不许画（画了 = 黑屏）。
   *
   * `aspect` / `window` 这里写的是**默认档（3:4）的兜底值**：真正排版时由
   * `resolveFrame(frame, settings.noFrameAspect)` 按用户选的那一档现算出新对象。
   * 直接拿这一条去 `computeFrameLayout` 得到的是"3:4 铺满"，不是错，只是没读设置。
   *
   * `source` 指向一张 1×1 全透明 PNG：`FrameSpec.source` 是必填字段，而这张图
   * **永远不会被渲染**（三处渲染点都有 `fullBleed` 守卫）。给一张真透明的而不是
   * 复用某款拍立得的纸：万一哪条守卫漏了，用户看到的是一张什么都没画的图，
   * 而不是"选了无相框却冒出一张白边纸"。
   */
  {
    id: NO_FRAME_ID,
    name: '无相框',
    nameKey: 'frame.noFrame',
    // 徽标代号：用户原话里的"编号 00"。纯 ASCII、不翻译（与 `INSTANT SQ` 同一类）。
    code: '00',
    source: require('../../assets/frames/no-frame.png'),
    aspect: 3 / 4,
    window: { x: 0, y: 0, width: 1, height: 1 },
    photoFit: 'cover',
    fullBleed: true,
    designSize: { width: 1, height: 1 },
    description: '无相框纯净全屏（00）：没有卡纸 / 白边 / 齿孔 / 压痕，照片按所选画幅比铺满整幅，日期与地名直接印在画面上',
  },
  {
    id: 'polaroid-600',
    name: '一次成像',
    nameKey: 'frame.polaroid600',
    // 顶栏胶囊徽标上的相框代号：纯 ASCII 大写短名，**不翻译**，也不走 `nameKey` ——
    // 它和胶卷预设的 `RT-400` / `PR-400` 是同一类东西：机器印在机身和片基上的代号，
    // 五种语言里都该长一样。徽标显示的是 `▌ {code} · {n}/{N}`。
    //
    // ⚠️ **代号只许描述画幅规格，不许写厂商商标**（本仓库要转公开）。
    // 这里原来是 `POLAROID` —— 那是注册在案的活商标，而且是被印在用户能看见的
    // 顶栏徽标上。描述性合理使用有抗辩空间，但"把别人的品牌当成自己 App 的画幅
    // 名称"恰恰是最弱的一种用法。改成描述**介质与画幅**的词（`INSTANT SQ` =
    // 一次成像方形），与已有的 `135 NEG` / `SLIDE` 同一风格。
    // 长度是有预算的：`FrameBadge` 的胶囊 `maxWidth: '42%'`，`INSTANT SQ` +
    // ` · 01/07` 在 375pt 窄屏上仍能整行放下（见 README 的宽度核算）。
    code: 'INSTANT SQ',
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
    // 横版 1712×1408：**同一张纸转 90°**（不是照横版重画一张），所以纸纹、留白、
    // 压痕、下巴的水印位都和竖版是同一份材质。窗口跟着转：1264×1264 是正方形，
    // 转过来还是它自己，只是左右留白从"三边 72px"变成"左边 376px"。
    landscape: {
      source: require('../../assets/frames/polaroid-600-landscape.png'),
      aspect: 1712 / 1408,
      window: { x: 0.219626, y: 0.051136, width: 0.738318, height: 0.897727 },
      designSize: { width: 1712, height: 1408 },
    },
    description: '600 系一次成像：1:1 正方形画面 + 三边等宽 + 厚重下巴，纸面干净无印花',
  },
  {
    id: 'instax-mini',
    name: '迷你画幅',
    nameKey: 'frame.instaxMini',
    // 机器代号，不翻译，也**不许写厂商商标**（完整理由见上面 `polaroid-600` 那条）。
    // 原来是 `INSTAX`（富士的注册商标）→ 改成 `INSTANT MINI`（一次成像·迷你画幅）。
    // 这一条是全表**最长**的代号：`INSTANT MINI · 02/07` 共 20 字符，在 375pt 窄屏上
    // 会触发 `adjustsFontSizeToFit` 把字号压到 77%（9.25pt），仍高于 `minimumFontScale`
    // 的 0.75 下限，所以不截断、不换行。**再长一个字符就会顶到下限**，
    // 以后想改这个代号必须先重算宽度。
    code: 'INSTANT MINI',
    // 1080×1720 = 54:86（instax mini 的真实外框比）。
    // 画面区 918×1224 严格 3:4 竖构图，上留白 90px、下巴 406px。
    source: require('../../assets/frames/instax-mini.png'),
    aspect: 1080 / 1720,
    window: { x: 0.075, y: 0.052326, width: 0.85, height: 0.711628 },
    photoFit: 'cover',
    watermark: { anchor: 'frame', tone: 'amber', align: 'right' },
    designSize: { width: 1080, height: 1720 },
    // 横版 1720×1080：画面区转成 1224×918（4:3 横构图）。
    // ⚠️ 圆角窗在横版要**重切一次**圆角 —— 四个圆角是从窗口往外啃的，
    // 旋转之后它们跑到横版窗口外面，留下 40px 的洞外透明（已修，见
    // `scripts/generate_frames.py` 的 `landscape()`）。数据侧只管坐标。
    landscape: {
      source: require('../../assets/frames/instax-mini-landscape.png'),
      aspect: 1720 / 1080,
      window: { x: 0.236047, y: 0.075, width: 0.711628, height: 0.85 },
      designSize: { width: 1720, height: 1080 },
    },
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
    // 横版 1950×1350：画面区转成 1389×926（36×24mm 横拍，正是 135 的标准横幅）。
    // 齿孔带从左右两侧转到上下两边。
    landscape: {
      source: require('../../assets/frames/neg-135-landscape.png'),
      aspect: 1950 / 1350,
      window: { x: 0.144103, y: 0.157037, width: 0.712308, height: 0.685926 },
      designSize: { width: 1950, height: 1350 },
    },
    description: '135 负片：两侧真齿孔 + 橙黄/浅白片边代号（▷ 12A / PROCESS C-41），纯黑片基无污渍',
  },
  {
    id: 'slide-mount',
    name: '幻灯装裱',
    nameKey: 'frame.slideMount',
    // 机器代号，不翻译（说明见上面 `polaroid-600` 那条）。
    code: 'SLIDE',
    // 1350×1350 = 1:1（50×50mm 幻灯卡纸的真实外形）。
    // 开孔 **993×662**（= 36.8×24.5mm 横幅），**居中偏下**（上 403px / 下 285px ≈ 1.41:1）。
    // 本轮把开孔从 972 放大到 993：宽度占卡纸宽 **73.556%**，落在用户给的
    // 72%~75% 区间内、离区间中位 73.5% 只差 0.056 个百分点；
    // 993/662 = **1.501511**，离 3:2 的 1.5 差 +0.10%（几何上就是 3:2）。
    // 为什么不用精确 3:2 的 990×660：那只到 73.333%，离中位更远 ——
    // "既落在区间内、又接近 3:2"这两个目标里，993×662 同时把误差压到 0.1% 以内。
    source: require('../../assets/frames/slide-mount.png'),
    aspect: 1350 / 1350,
    window: { x: 0.131852, y: 0.298519, width: 0.735556, height: 0.49037 },
    photoFit: 'cover',
    watermark: { anchor: 'frame', tone: 'graphite', align: 'right' },
    designSize: { width: 1350, height: 1350 },
    // 横版 1350×1350：卡纸是正方形，转 90° 之后画布还是 1350×1350，
    // 但开孔从"993 宽 × 662 高"变成"662 宽 × 993 高"（3:2 横孔 → 2:3 竖孔）。
    // 这一款是唯一"横竖两版都不是正方形画面"的相框，横竖版的选择直接决定成片构图。
    landscape: {
      source: require('../../assets/frames/slide-mount-landscape.png'),
      aspect: 1350 / 1350,
      window: { x: 0.211111, y: 0.131852, width: 0.49037, height: 0.735556 },
      designSize: { width: 1350, height: 1350 },
    },
    description:
      '幻灯装裱卡：1:1 象牙白卡纸 + 3:2 横幅开孔（占宽 73.6%）+ 开孔外圈 2px 接触内阴影 + 顶部极细 SLIDE MOUNT 印字',
  },
  {
    id: 'fp100c',
    name: '撕拉片',
    nameKey: 'frame.fp100c',
    // 机器代号，不翻译（说明见上面 `polaroid-600` 那条）。
    code: 'FP-100C',
    // 1080×1416。画面区 1008×672（**精确 3:2**，撕拉片标称的就是"接近 3:2 的横画幅"），
    // 左右各 36px（照片几乎顶到纸边，撕拉片就是这个样）、上 48px、下巴 696px。
    // 那片宽下巴是药水包被撕下来的地方，也是显影药水痕最重的一侧。
    source: require('../../assets/frames/fp100c.png'),
    aspect: 1080 / 1416,
    window: { x: 0.033333, y: 0.033898, width: 0.933333, height: 0.474576 },
    photoFit: 'cover',
    // 下巴最宽（696px）、实测没有印字（真撕拉片的卡纸就是空白的），水印走 frame 锚点
    watermark: { anchor: 'frame', tone: 'amber', align: 'right' },
    designSize: { width: 1080, height: 1416 },
    // ⚠️ **只有这一款没有横版**：现有 5 款里其余 4 款（`polaroid-600` / `instax-mini` /
    //   `neg-135` / `slide-mount`）都有 `landscape` 变体；`half-frame` 与 `sheet8x10`
    //   本来也没有，但它们在 v1.6.1 精简相框库时下线了。
    //   横拍照片会按 `photoFit: 'cover'` 裁切成上面这个 3:2 横孔的形状 ——
    //   因为开孔本身就是横幅，横照片在竖版卡纸上其实**不会被裁掉多少**，
    //   但两侧的纸边和药水痕是竖版留白，构图重心会和真机横持时不一样。
    //   要补横版的话照 `assets/frames/README.md` 走一遍即可。
    description:
      'FP-100C 撕拉片：宽大卡纸 + 窄纸边 3:2 画面 + 只在纸边一圈的微黄显影药水痕与撕纸毛边',
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
 * 按 id 找相框下标；找不到**退回默认帧**（`DEFAULT_FRAME_ID`），绝不抛错。
 *
 * ⚠️ 兜底必须显式找 `DEFAULT_FRAME_ID`，**不能**再写 `: 0`：
 * v1.8.1 起 0 位是 `no-frame`，而"找不到"最常见的来源是**用户的老存档里存着一个
 * 已经下线的相框 id**（v1.6.1 删过半格双联框与 8×10 散页）。`return 0` 会让这些
 * 老片子静默变成"无相框"，用户看到的不是"回落默认纸框"，而是"我的相框被吃掉了"。
 * 库里那两个已删除的 id 至今还可能躺在任意一台设备的相册条目里。
 */
export function findFrameIndex(id: string): number {
  const index = FRAMES.findIndex((frame) => frame.id === id);
  if (index >= 0) {
    return index;
  }
  const fallback = FRAMES.findIndex((frame) => frame.id === DEFAULT_FRAME_ID);
  return fallback >= 0 ? fallback : 0;
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

/**
 * 相框皮肤（`FrameSkin`）的图案种子 —— v1.7.0 的做旧斑点 / 涂鸦波点靠它决定落在哪。
 *
 * 为什么要有这个函数，而不是在渲染层直接 `seed={frame.id}`：
 *   1. **只此一处**。种子一改，所有相框的花纹全变；将来想换算法（比如掺进画幅比、
 *      或者让同一款相框的正反打用两套花纹），只改这里，取景器预览与成片不会分叉。
 *   2. 它保证"同一款相框永远是同一套花纹"：种子里**不许**掺时间 / 随机数，
 *      否则取景器里看到的和成片里拿到的就不是同一张。
 *
 * 种子只决定图案的**随机序列**；颜色与尺寸区间在 `FrameSkin` 的配方常量里，不在这里。
 */
export function frameSkinSeedOf(frame: FrameSpec): string {
  return frame.id;
}
