/**
 * baseline JPEG「只解 DC」采样器（v1.8.11 场景自适应调色的测量层）。
 *
 * 目的：成片链路要把"这张照片的光线长什么样"量出来（亮/暗占比、反差、色温……），
 * 但**不能**为了量它再跑一遍完整解码 + IDCT + 滤镜（发热纪律 v1.8.6：取景器实时预览
 * 都不许跑场景分析，成片链路也只允许一次快门算一次）。baseline JPEG 的每个 8×8 亮度块
 * 的 DC 系数正好是 `该块 8×8 像素均值 × 8`，所以只要把熵编码流走一遍、只保留 DC、
 * AC 全跳过，就能用极小的 CPU 拿到一张"分块均值图" —— 统计量对块均值和对像素均值
 * 的差异远小于契约阈值，而这比"降采样成 RGB 位图再统计"省掉 IDCT 和整幅位图。
 *
 * 支持（见 `_v1811_contract.md` §2）：
 *   · SOI + APPn/COM 任意跳过、DQT（8/16 位精度）、DHT（DC+AC，码长计数 + 首码查表）、
 *     SOF0/SOF1（8 bit，1 或 3 分量，采样因子 1~4）、SOS（单扫描基线）、DRI + RSTn
 *     （restart interval）、DNL 跳过；
 *   · 4:4:4 / 4:2:2 / 4:2:0 以及任意 h/v（1~4）采样因子；
 *   · 灰度（1 分量）JPEG。
 *
 * 明确拒绝（一律 `return null`，**绝不 throw**）：
 *   · 渐进式（SOF2）、算术编码（SOF9+ / DAC）、无损（SOF3）、差分/分层（SOF5/6/7/13/14/15）；
 *   · 12 bit 精度（SOF1 的 12 位变体）、4 分量/其它分量数（CMYK 等）；
 *   · 多扫描 JPEG（遇到第二个 SOS）、非交错扫描（SOS 分量数 ≠ SOF 分量数）；
 *   · SOF 高度为 0（要等 DNL 才知道行数，这里不做延迟解码）；
 *   · 截断、越界、非法 Huffman 码表/码字、非法标记、非法熵数据。
 *
 * 输出网格（**契约里 `blockPx` 的语义按这里实现**）：
 *   以 JPEG 的 MCU 为单位，一格 = 源图里 `8·maxH × 8·maxV` 像素的一块区域：
 *   · 4:4:4 / 灰度：一格 8×8 → `blockPx = 8`，`cols = ceil(width/8)`，`rows = ceil(height/8)`；
 *   · 4:2:0：一格 16×16 → `blockPx = 16`，`cols = ceil(width/16)`，`rows = ceil(height/16)`；
 *   · 4:2:2（h=2,v=1）：一格 16×8，`blockPx` 报水平边长 16（契约只允许 8 或 16 两种标量值）。
 *   `luma` = 该格里所有 Y 块 DC 重建值的平均（4:2:0 是 4 块平均，4:4:4 是 1 块），
 *   `cb`/`cr` 与 `luma` 同网格（每个 MCU 的色度块平均；无彩色分量时恒 128）。
 *   这样一格内的亮度/色度都是"同一块区域"的均值，统计时不必再做色度上采样。
 *
 * 零依赖、纯函数、不依赖 react-native，Node 探针可以直接用 typescript 转译装载。
 */

/** 只解 DC 得到的采样网格。 */
export interface SampledLuma {
  /** 每格一行（行主序）的亮度 0~255。 */
  luma: Uint8Array;
  /** 亮度格网格宽（列数）。 */
  cols: number;
  /** 亮度格网格高（行数）。 */
  rows: number;
  /** 同网格的 Cb 0~255（缺色度时全 128）。 */
  cb: Uint8Array;
  /** 同网格的 Cr 0~255（缺色度时全 128）。 */
  cr: Uint8Array;
  /** 一格在源图里覆盖的像素边长（8 或 16，取决于采样因子；非方形 MCU 取长边）。 */
  blockPx: number;
}

/* ── 内部结构 ──────────────────────────────────────────────────────────────── */

/** Huffman 表：counts[1..16] 是每档码长的码字数；解码用「首码 + 偏移」查表法。 */
interface HuffmanTable {
  counts: Uint8Array;
  firstCode: Int32Array;
  offsets: Int32Array;
  values: Uint8Array;
}

/** SOF 里的一个分量。 */
interface JpegComponent {
  id: number;
  /** 水平采样因子 1~4。 */
  h: number;
  /** 垂直采样因子 1~4。 */
  v: number;
  /** 量化表 id 0~3。 */
  tq: number;
  /** DC 预测器（每个 restart interval / 新扫描重置为 0）。 */
  pred: number;
}

/** SOF0/SOF1 头信息。 */
interface SofInfo {
  width: number;
  height: number;
  maxH: number;
  maxV: number;
  components: JpegComponent[];
}

/** 扫描里的分量条目（SOS 顺序 = MCU 内块顺序）。 */
interface ScanComponent {
  comp: JpegComponent;
  dc: HuffmanTable | null;
  ac: HuffmanTable | null;
}

/* ── 熵数据位读取器 ────────────────────────────────────────────────────────── */

/**
 * JPEG 熵编码段位读取器。
 * 负责 0xFF00 去填充（stuffed byte）与"遇到标记"的边界检测：
 * 读到 `0xFF` 后面不是 `0x00` 时**不消耗**该标记，返回 -1 表示熵数据已结束。
 */
class BitReader {
  readonly bytes: Uint8Array;

  /** 下一个待读字节在 bytes 里的下标。 */
  pos: number;

  private bitBuf: number;

  private bitCnt: number;

  constructor(bytes: Uint8Array, start: number) {
    this.bytes = bytes;
    this.pos = start;
    this.bitBuf = 0;
    this.bitCnt = 0;
  }

  /** 读一个去填充后的熵字节；-1 = 数据结束/遇到标记。 */
  private readByte(): number {
    const { bytes } = this;
    if (this.pos >= bytes.length) return -1;
    const value = bytes[this.pos];
    this.pos += 1;
    if (value !== 0xff) return value;
    if (this.pos >= bytes.length) return -1;
    const next = bytes[this.pos];
    if (next === 0x00) {
      this.pos += 1;
      return 0xff;
    }
    // 0xFF 后面是标记（或非法填充），把 0xFF 退回去，交给标记层处理。
    this.pos -= 1;
    return -1;
  }

  /** 读 1 bit；-1 = 数据结束。 */
  bit(): number {
    if (this.bitCnt === 0) {
      const value = this.readByte();
      if (value < 0) return -1;
      this.bitBuf = value;
      this.bitCnt = 8;
    }
    this.bitCnt -= 1;
    return (this.bitBuf >> this.bitCnt) & 1;
  }

  /** 读 n bit（n ≤ 16）；-1 = 数据结束。 */
  bits(n: number): number {
    let value = 0;
    for (let i = 0; i < n; i += 1) {
      const b = this.bit();
      if (b < 0) return -1;
      value = (value << 1) | b;
    }
    return value;
  }

  /** 丢弃当前字节里剩余的填充 bit，让 pos 对齐到下一个字节。 */
  align(): void {
    this.bitBuf = 0;
    this.bitCnt = 0;
  }

  /**
   * 对齐后消费一个 RSTn 标记（0xFF 后允许填充 0xFF，再跟 0xD0~0xD7）。
   * 成功返回 true；不是 restart 标记则返回 false（不消耗）。
   */
  consumeRestart(): boolean {
    this.align();
    const { bytes } = this;
    if (this.pos >= bytes.length || bytes[this.pos] !== 0xff) return false;
    let cursor = this.pos + 1;
    while (cursor < bytes.length && bytes[cursor] === 0xff) cursor += 1;
    if (cursor >= bytes.length) return false;
    const marker = bytes[cursor];
    if (marker < 0xd0 || marker > 0xd7) return false;
    this.pos = cursor + 1;
    return true;
  }
}

/* ── Huffman 表 ───────────────────────────────────────────────────────────── */

/** 由「码长计数 + 码字值」构造规范 Huffman 表；非法（空/过满/长度不符）返回 null。 */
function buildHuffman(counts: Uint8Array, values: Uint8Array): HuffmanTable | null {
  let total = 0;
  for (let len = 1; len <= 16; len += 1) total += counts[len];
  if (total === 0 || total !== values.length) return null;
  const firstCode = new Int32Array(17);
  const offsets = new Int32Array(17);
  let code = 0;
  let offset = 0;
  for (let len = 1; len <= 16; len += 1) {
    const count = counts[len];
    // 规范码必须完整落在 len 位空间里；过满 = 非法码表。
    if (code + count > 1 << len) return null;
    firstCode[len] = code;
    offsets[len] = offset;
    offset += count;
    code = (code + count) << 1;
  }
  return { counts, firstCode, offsets, values };
}

/** 从位流里解出一个 Huffman 符号；-1 = 非法码字/数据结束。 */
function decodeSymbol(reader: BitReader, table: HuffmanTable | null): number {
  if (table === null) return -1;
  let code = 0;
  for (let len = 1; len <= 16; len += 1) {
    const b = reader.bit();
    if (b < 0) return -1;
    code = (code << 1) | b;
    const count = table.counts[len];
    if (count === 0) continue;
    const first = table.firstCode[len];
    if (code >= first && code - first < count) {
      return table.values[table.offsets[len] + code - first];
    }
  }
  return -1;
}

/**
 * 解一个 8×8 块的 DC（AC 按 Huffman 跳过），返回**未取整**的亮度/色度重建值
 * `(pred + diff) * q0 / 8 + 128`（= 该块 8×8 均值 + 128 电平偏移的还原值）。
 * 失败返回 `Number.NaN`。
 */
function decodeBlockDc(
  reader: BitReader,
  scanComp: ScanComponent,
  q0: number,
): number {
  const { comp } = scanComp;
  const size = decodeSymbol(reader, scanComp.dc);
  if (size < 0 || size > 16) return Number.NaN;
  let diff = 0;
  if (size !== 0) {
    const raw = reader.bits(size);
    if (raw < 0) return Number.NaN;
    diff = raw < 1 << (size - 1) ? raw - (1 << size) + 1 : raw;
  }
  comp.pred += diff;
  // AC 系数只需要跳过：读 Huffman 符号拿到 (run, size)，跳过 size 个幅值 bit。
  for (let k = 1; k < 64; k += 1) {
    const symbol = decodeSymbol(reader, scanComp.ac);
    if (symbol < 0) return Number.NaN;
    const run = symbol >> 4;
    const acSize = symbol & 15;
    if (acSize === 0) {
      if (run !== 15) break; // 0x00 = EOB
      k += 15; // 0xF0 = ZRL：16 个零系数
    } else {
      k += run;
      if (k > 63) return Number.NaN;
      if (reader.bits(acSize) < 0) return Number.NaN;
    }
  }
  return (comp.pred * q0) / 8 + 128;
}

/* ── 小工具 ───────────────────────────────────────────────────────────────── */

/** bytes 在 [at, at+2) 里读 16 位大端；越界返回 -1。 */
function readU16(bytes: Uint8Array, at: number): number {
  if (at < 0 || at + 2 > bytes.length) return -1;
  return (bytes[at] << 8) | bytes[at + 1];
}

/** 0~255 clamp 后四舍五入。 */
function toByte(value: number): number {
  const rounded = Math.round(value);
  if (rounded <= 0) return 0;
  if (rounded >= 255) return 255;
  return rounded;
}

/** SOFn 里不是 baseline 顺序 DCT 的，一律拒绝。 */
function isRejectedSof(marker: number): boolean {
  return (
    marker === 0xc2 || // 渐进式
    marker === 0xc3 || // 无损
    marker === 0xc5 ||
    marker === 0xc6 ||
    marker === 0xc7 ||
    marker === 0xc8 || // JPG 保留
    marker === 0xc9 ||
    marker === 0xca ||
    marker === 0xcb ||
    marker === 0xcc || // DAC 算术编码条件
    marker === 0xcd ||
    marker === 0xce ||
    marker === 0xcf
  );
}

/* ── 主解析 ───────────────────────────────────────────────────────────────── */

/** 网格格数上限：防止畸形尺寸申请超大数组（正常成片 ≤1200 万像素时最多约 20 万格）。 */
const MAX_CELLS = 1 << 22;

/** 解析 SOF0/SOF1 段，返回分量表；非法返回 null。 */
function parseSof(
  bytes: Uint8Array,
  dataStart: number,
  end: number,
): SofInfo | null {
  if (dataStart + 6 > end) return null;
  const precision = bytes[dataStart];
  if (precision !== 8) return null; // 只支持 8 bit
  const height = (bytes[dataStart + 1] << 8) | bytes[dataStart + 2];
  const width = (bytes[dataStart + 3] << 8) | bytes[dataStart + 4];
  const count = bytes[dataStart + 5];
  // height=0 需要 DNL 定义行数（延迟解码），这里直接拒绝。
  if (width <= 0 || height <= 0) return null;
  if (count !== 1 && count !== 3) return null; // 灰度或 YCbCr
  if (dataStart + 6 + count * 3 > end) return null;
  const components: JpegComponent[] = [];
  let maxH = 1;
  let maxV = 1;
  for (let i = 0; i < count; i += 1) {
    const at = dataStart + 6 + i * 3;
    const id = bytes[at];
    const hv = bytes[at + 1];
    const h = hv >> 4;
    const v = hv & 15;
    const tq = bytes[at + 2];
    if (h < 1 || h > 4 || v < 1 || v > 4) return null;
    if (tq > 3) return null;
    if (h > maxH) maxH = h;
    if (v > maxV) maxV = v;
    components.push({ id, h, v, tq, pred: 0 });
  }
  return { width, height, maxH, maxV, components };
}

/** 一次熵数据解码的产出：采样网格 + 熵数据结束后的字节位置（用于找 EOI）。 */
interface DecodedScan {
  sample: SampledLuma;
  nextPos: number;
}

/** 解码一个 SOS 段之后的熵数据，产出 MCU 网格；非法/截断返回 null。 */
function decodeScan(
  bytes: Uint8Array,
  bitStart: number,
  sof: SofInfo,
  scanComps: ScanComponent[],
  q0ByTable: number[],
  restartInterval: number,
): DecodedScan | null {
  const { width, height, maxH, maxV } = sof;
  const cols = Math.ceil(width / (8 * maxH));
  const rows = Math.ceil(height / (8 * maxV));
  const cells = cols * rows;
  if (cols <= 0 || rows <= 0 || cells > MAX_CELLS) return null;

  const roleOf = new Map<JpegComponent, number>();
  for (let i = 0; i < sof.components.length; i += 1) {
    // 角色按 **SOF 里的分量顺序**定（第 0 个 = Y，第 1/2 个 = Cb/Cr），
    // 与 SOS 的扫描顺序无关（扫描顺序只影响熵数据里的块排列）。
    roleOf.set(sof.components[i], i);
  }
  const lumaCount = sof.components[0].h * sof.components[0].v;
  const cbComp = sof.components.length === 3 ? sof.components[1] : null;
  const crComp = sof.components.length === 3 ? sof.components[2] : null;
  const cbCount = cbComp === null ? 0 : cbComp.h * cbComp.v;
  const crCount = crComp === null ? 0 : crComp.h * crComp.v;

  const ySum = new Float64Array(cells);
  const cbSum = new Float64Array(cells);
  const crSum = new Float64Array(cells);
  const reader = new BitReader(bytes, bitStart);

  let mcu = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (restartInterval > 0 && mcu > 0 && mcu % restartInterval === 0) {
        if (!reader.consumeRestart()) return null;
        for (let i = 0; i < sof.components.length; i += 1) {
          sof.components[i].pred = 0;
        }
      }
      const cell = row * cols + col;
      for (let si = 0; si < scanComps.length; si += 1) {
        const scanComp = scanComps[si];
        const q0 = q0ByTable[scanComp.comp.tq];
        if (q0 < 1) return null; // 该分量引用的量化表没定义 / 非法
        const blocks = scanComp.comp.h * scanComp.comp.v;
        for (let blockIndex = 0; blockIndex < blocks; blockIndex += 1) {
          const value = decodeBlockDc(reader, scanComp, q0);
          if (Number.isNaN(value)) return null;
          const role = roleOf.get(scanComp.comp);
          if (role === 0) ySum[cell] += value;
          else if (role === 1) cbSum[cell] += value;
          else if (role === 2) crSum[cell] += value;
        }
      }
      mcu += 1;
    }
  }

  const luma = new Uint8Array(cells);
  const cb = new Uint8Array(cells);
  const cr = new Uint8Array(cells);
  for (let i = 0; i < cells; i += 1) {
    luma[i] = toByte(ySum[i] / lumaCount);
    cb[i] = cbComp === null ? 128 : toByte(cbSum[i] / cbCount);
    cr[i] = crComp === null ? 128 : toByte(crSum[i] / crCount);
  }
  reader.align();
  return {
    sample: { luma, cols, rows, cb, cr, blockPx: 8 * Math.max(maxH, maxV) },
    nextPos: reader.pos,
  };
}

/**
 * 只解 **baseline（SOF0/SOF1）** JPEG 的 DC 系数，不做 IDCT：
 * 每个块的 `DC × 量化表[0]` 就是该块 8×8 的均值（电平偏移 128 已加回），
 * 输出以 MCU 为格的亮度/色度采样网格（见文件头说明）。
 *
 * 任何不支持/畸形输入（渐进式、算术编码、截断、越界、非法 Huffman、空输入）
 * 一律返回 `null`，**绝不 throw**。
 */
export function sampleJpegDc(bytes: Uint8Array): SampledLuma | null {
  try {
    return parseJpeg(bytes);
  } catch {
    return null;
  }
}

/** 实际解析流程（外层已包 try/catch，这里只按顺序 return null）。 */
function parseJpeg(bytes: Uint8Array): SampledLuma | null {
  if (!bytes || typeof bytes.length !== 'number') return null;
  const length = bytes.length;
  if (length < 4) return null;
  // SOI 必须在文件最开头（相机/ImageManipulator 产出的就是这种规范文件）。
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let pos = 2;
  let sof: SofInfo | null = null;
  let restartInterval = 0;
  const q0ByTable: number[] = [0, 0, 0, 0];
  const dcTables: (HuffmanTable | null)[] = [null, null, null, null];
  const acTables: (HuffmanTable | null)[] = [null, null, null, null];

  while (pos < length) {
    if (bytes[pos] !== 0xff) return null;
    while (pos < length && bytes[pos] === 0xff) pos += 1; // 填充 0xFF
    if (pos >= length) return null;
    const marker = bytes[pos];
    pos += 1;

    if (marker === 0xd8) return null; // 重复 SOI
    if (marker === 0xd9) return null; // EOI 在没有任何扫描数据之前
    if (marker === 0x01) continue; // TEM：无长度段
    if (marker >= 0xd0 && marker <= 0xd7) return null; // 扫描外的 RSTn

    if (isRejectedSof(marker)) return null;
    if (marker === 0xda) {
      // SOS：必须已有 SOF 且还没扫描过（多扫描基线 JPEG 这里不实现）。
      if (sof === null) return null;
      const segLen = readU16(bytes, pos);
      if (segLen < 6) return null;
      const dataStart = pos + 2;
      const end = pos + segLen;
      if (end > length) return null;
      const scanCount = bytes[dataStart];
      if (scanCount < 1 || scanCount > 4) return null;
      if (segLen !== 6 + scanCount * 2) return null;
      // 只支持单扫描把所有分量一次扫完（灰度 1 分量同样满足）。
      if (scanCount !== sof.components.length) return null;
      const scanComps: ScanComponent[] = [];
      const seen = new Set<number>();
      let fail = false;
      for (let i = 0; i < scanCount; i += 1) {
        const at = dataStart + 1 + i * 2;
        const id = bytes[at];
        const tableSelect = bytes[at + 1];
        const td = tableSelect >> 4;
        const ta = tableSelect & 15;
        if (td > 3 || ta > 3) return null;
        if (seen.has(id)) return null;
        const comp = sof.components.find((c) => c.id === id);
        if (comp === undefined) return null;
        seen.add(id);
        scanComps.push({ comp, dc: dcTables[td], ac: acTables[ta] });
      }
      for (let i = 0; i < scanComps.length; i += 1) {
        if (scanComps[i].dc === null || scanComps[i].ac === null) fail = true;
      }
      if (fail) return null;
      // baseline 必须整带（Ss=0, Se=63, Ah=Al=0）。
      const ss = bytes[dataStart + 1 + scanCount * 2];
      const se = bytes[dataStart + 2 + scanCount * 2];
      const approximation = bytes[dataStart + 3 + scanCount * 2];
      if (ss !== 0 || se !== 63 || approximation !== 0) return null;

      const decoded = decodeScan(
        bytes,
        end,
        sof,
        scanComps,
        q0ByTable,
        restartInterval,
      );
      if (decoded === null) return null;
      // 熵数据之后必须是 EOI（允许中间夹 APPn/COM/DNL 段，其它一律视为畸形/多扫描）。
      return finishAfterScan(bytes, decoded.nextPos, decoded.sample);
    }

    // 其余标记都带 16 位长度段。
    const segLen = readU16(bytes, pos);
    if (segLen < 2) return null;
    const dataStart = pos + 2;
    const end = pos + segLen;
    if (end > length) return null;

    if (marker === 0xdb) {
      // DQT：每个表 1 字节 Pq/Tq + 64 个量化值（8 或 16 位）。
      let cursor = dataStart;
      while (cursor < end) {
        const pq = bytes[cursor] >> 4;
        const tq = bytes[cursor] & 15;
        cursor += 1;
        if (tq > 3) return null;
        if (pq === 0) {
          if (cursor + 64 > end) return null;
          q0ByTable[tq] = bytes[cursor];
          cursor += 64;
        } else if (pq === 1) {
          if (cursor + 128 > end) return null;
          q0ByTable[tq] = (bytes[cursor] << 8) | bytes[cursor + 1];
          cursor += 128;
        } else {
          return null;
        }
        if (q0ByTable[tq] < 1 || q0ByTable[tq] > 65535) return null;
      }
    } else if (marker === 0xc4) {
      // DHT：每个表 1 字节 Tc/Th + 16 个码长计数 + 码字值。
      let cursor = dataStart;
      while (cursor < end) {
        if (cursor + 17 > end) return null;
        const tc = bytes[cursor] >> 4;
        const th = bytes[cursor] & 15;
        cursor += 1;
        if (tc > 1 || th > 3) return null;
        const counts = new Uint8Array(17);
        let total = 0;
        for (let len = 1; len <= 16; len += 1) {
          counts[len] = bytes[cursor];
          total += bytes[cursor];
          cursor += 1;
        }
        if (cursor + total > end) return null;
        const values = bytes.slice(cursor, cursor + total);
        cursor += total;
        const table = buildHuffman(counts, values);
        if (table === null) return null;
        if (tc === 0) dcTables[th] = table;
        else acTables[th] = table;
      }
    } else if (marker === 0xc0 || marker === 0xc1) {
      if (sof !== null) return null;
      sof = parseSof(bytes, dataStart, end);
      if (sof === null) return null;
    } else if (marker === 0xdd) {
      // DRI：重启间隔（MCU 数）。
      if (segLen !== 4) return null;
      restartInterval = readU16(bytes, dataStart);
    } else if (marker === 0xdc) {
      // DNL：行数定义（此处只跳过；SOF height=0 的情况前面已拒绝）。
    } else if (marker >= 0xe0 && marker <= 0xef) {
      // APPn：跳过。
    } else if (marker === 0xfe) {
      // COM：跳过。
    } else if (marker >= 0xc0 && marker <= 0xcf) {
      return null; // 其它 SOFn（前面已过滤一部分，这里兜底）
    } else {
      // 未知/保留标记带长度段，按规范跳过（不影响 DC 读取）。
    }
    pos = end;
  }
  return null; // 没遇到 SOS
}

/** 熵数据之后必须是 EOI；允许跳过 APPn/COM/DNL 段。返回结果或 null。 */
function finishAfterScan(
  bytes: Uint8Array,
  from: number,
  result: SampledLuma,
): SampledLuma | null {
  let pos = from;
  const length = bytes.length;
  while (pos < length) {
    if (bytes[pos] !== 0xff) return null;
    while (pos < length && bytes[pos] === 0xff) pos += 1;
    if (pos >= length) return null;
    const marker = bytes[pos];
    pos += 1;
    if (marker === 0xd9) return result; // EOI
    if (marker === 0x01) continue;
    if (marker >= 0xd0 && marker <= 0xd7) continue; // 残余 RST（一般不会走到）
    const segLen = readU16(bytes, pos);
    if (segLen < 2) return null;
    if (pos + segLen > length) return null;
    const next = pos + segLen;
    // APPn / COM / DNL 可以出现在扫描之后；其它标记（尤其第二个 SOS）视为多扫描 → 拒绝。
    const allowed =
      (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe || marker === 0xdc;
    if (!allowed) return null;
    pos = next;
  }
  return null; // 没有 EOI = 截断
}
