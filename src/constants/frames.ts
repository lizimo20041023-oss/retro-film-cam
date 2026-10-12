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
 * 这七款是怎么来的：**每一款对应一种真实存在的物理产物**
 * ─────────────────────────────────────────────────────────────────────────
 * 上一版有 8 款，问题不在数量，在于其中几款是"滤镜思维"的产物 —— 靠撒噪点、
 * 撒污渍、印一行 `RT-400 · 36 EXP · C-41` 来暗示"我很旧"。真实相纸不长那样：
 * 纸面是干净的，做旧是**时间和使用**留下的，不是印刷时喷上去的。所以这一版：
 *
 *   1. 每款的画幅比、留白比例、开孔位置都照**真实规格**算（86×54 的 instax mini、
 *      88×107 的 600 系即时成像、35mm 的 24×36 开孔、50×50 幻灯卡、
 *      73×55.6mm 的 FP-100C、半格的 18×24mm、8×10 英寸的散页）；
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
import type { FrameSpec } from '../types';

export const FRAMES: FrameSpec[] = [
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
    // ⚠️ **这一款只有竖版**（同理：half-frame、sheet8x10 也没有横版）。
    //   横拍照片会按 `photoFit: 'cover'` 裁切成上面这个 3:2 横孔的形状 ——
    //   因为开孔本身就是横幅，横照片在竖版卡纸上其实**不会被裁掉多少**，
    //   但两侧的纸边和药水痕是竖版留白，构图重心会和真机横持时不一样。
    //   要补横版的话照 `assets/frames/README.md` 走一遍即可。
    description:
      'FP-100C 撕拉片：宽大卡纸 + 窄纸边 3:2 画面 + 只在纸边一圈的微黄显影药水痕与撕纸毛边',
  },
  {
    id: 'half-frame',
    name: '半格双联',
    nameKey: 'frame.halfFrame',
    // 机器代号，不翻译（说明见上面 `polaroid-600` 那条）。
    code: 'HALF',
    // 1500×1488。致敬奥林巴斯 Pen-F：**一张成片里左右并列两个 3:4 竖幅开槽**
    // （半格画幅 18×24mm 就是 3:4，一卷拍 72 张而不是 36 张）。
    // 每个槽 612×816（精确 3:4），两槽之间留 84px 立筋 —— 真半格底片的两格
    // 之间本来就留着片间间隙，印样时那一条也会留在纸上。
    // ⚠️ 画布为什么是 1500 宽：96 + 612 + 84 + 612 + 96 = 1500，两个 3:4 槽
    //   并排放得下、左右留白还等宽。早先的 1080 宽画布根本容不下两个 612 的槽
    //   （两个槽会重叠、立筋消失，成品是一个 960px 宽的大洞），所以加宽了画布。
    source: require('../../assets/frames/half-frame.png'),
    aspect: 1500 / 1488,
    // `window` 写的是**两个槽的并集**（1308×816，含中间那根 84px 立筋）。
    // 它的作用有两个：
    //   1. 单图兜底 —— 调用方没读 `slots` 时，整张照片仍然落在合理的位置；
    //   2. 取景器构图参考线的依据（`computeFrameLayout` 用它画安全框）。
    // 并集的宽高比 1.603 不是 3:2：两个 3:4 竖幅并排、中间还留一条筋，
    // 并集本来就不该是某个"标准"比例。这不是误差。
    window: { x: 0.064, y: 0.290323, width: 0.872, height: 0.548387 },
    // 两个槽各自的位置（左→右）。`window` = slots[0].window ∪ slots[1].window。
    slots: [
      { window: { x: 0.064, y: 0.290323, width: 0.408, height: 0.548387 } },
      { window: { x: 0.528, y: 0.290323, width: 0.408, height: 0.548387 } },
    ],
    photoFit: 'cover',
    // 下巴 240px、左右留白 96px；水印走 frame 锚点，
    // 上缘的两个防挂切口（y ≤ 10）离得很远，不打架。
    watermark: { anchor: 'frame', tone: 'graphite', align: 'left' },
    designSize: { width: 1500, height: 1488 },
    // ⚠️ **只有竖版**，而且这一款的横拍行为要说清楚 —— 下面的描述与
    //   `FilmCompositor` 的实际分支一致（**D 交付时的注释写错了，这里已更正**）：
    //
    //   镜头前的原图是横的时，渲染器**没有**把照片 cover 进并集 `window` ——
    //   `FilmCompositor.tsx:374` 的分支是 `slotRects.length > 0 ? 逐槽渲染 : 单窗口`，
    //   本款有 `slots`，所以走的是**逐槽**：原图 `cover` 进 `slots[0]`（612×816 的
    //   3:4 竖槽），`slots[1]` 因为没有第二张底片而**留黑**（那正是"半格只用了一半"
    //   的真实结果，渲染器里就是这么注释的）。所以不会出现"同一画面被切成左右两半"。
    //
    //   代价是**横照片被 3:4 竖槽裁掉两侧**（4:3 的横图只保留中间约 56% 宽），
    //   而取景器那条构图参考线画的是并集（1.603），**取景与成片在这一款上不一致**。
    //   这是本款唯一的已知语义缺陷，修它需要给 `FrameOrientationVariant` 加 `slots`
    //   并再生成一张横版 PNG（两张槽上下叠放）—— 本轮没做，见 README §25
    //   的"已知限制"。**想拍横幅请换别的相框**，这是当前唯一正确的用法。
    description:
      '半格双联框：象牙白厚卡 + 左右并列两个 3:4 竖幅开槽（中间 84px 立筋）+ 上缘两个防挂切口',
  },
  {
    id: 'sheet8x10',
    name: '8×10 散页',
    nameKey: 'frame.sheet8x10',
    // 机器代号，不翻译（说明见上面 `polaroid-600` 那条）。
    code: '8X10',
    // 1080×1350 = 4:5（8×10 英寸的真实散页外形）。
    // 画面区 1032×688（**精确 3:2**，大画幅散页常见的是裁切后的横构图）：
    // 左右各 24px、上 24px 的**纯黑片边**，下巴 638px。
    // 大画幅散页的片边本来就窄（不是小片，没有齿孔也没有卷轴空间），
    // 宽下巴是留给暗袋里捏片的地方。
    source: require('../../assets/frames/sheet8x10.png'),
    aspect: 1080 / 1350,
    window: { x: 0.022222, y: 0.017778, width: 0.955556, height: 0.50963 },
    photoFit: 'cover',
    // 下巴很宽（638px），但里面的 `SHEET FILM` / `SAFETY 8X10` 都贴在**左**边，
    // 水印靠右对齐，谁也不压谁。
    //
    // ⚠️ 上边缘**没有**规格印字：上边只有 24px 片边，36~40 号的字身就占约 30px，
    //    一印就会骑到窗口顶上（实测「8X10」在 (24, 4) 时字占 y=17…49，
    //    窗口从 y=24 开始 → 烧进去 897px）。落进窗口的墨会烧进用户的每一张成片，
    //    所以那一行字是被**删掉**的，不是忘了加。
    watermark: { anchor: 'frame', tone: 'amber', align: 'right' },
    designSize: { width: 1080, height: 1350 },
    // ⚠️ **只有竖版**。横拍照片按 `photoFit: 'cover'` 裁切到这个 3:2 横孔。
    description:
      '8×10 大画幅散页：纯黑窄片边 + 左下角防挂切口（Notch）+ 片边 ASCII 标识字（SHEET FILM / SAFETY 8X10）',
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
