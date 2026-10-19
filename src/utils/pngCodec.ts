/**
 * 纯 JS PNG 编解码（v2.0.0 引入，v2.1.1 解码器补齐规范全集）。
 *
 * 为什么需要它：成片走真 3D LUT 查表 —— 必须先把 view-shot 截出来的图**解成像素**，
 * 逐像素查表后再**编码回图片**交给第二遍合成。而本项目立了「不加依赖」的死规矩：
 * 没有 Skia / GL，`expo-image-manipulator` 只能缩放不能改像素。于是解码/编码都用
 * 纯 JS 写（Node / Hermes 同一份代码，可离线单测）。
 *
 * 支持范围（v2.1.1 起解码器覆盖 PNG 规范全集；编码仍是本 App 专用的 RGBA 写出）：
 *   - bitDepth 1/2/4/8/16 × colorType 0(灰度) / 2(RGB) / 3(调色板) / 4(灰度+透明) / 6(RGBA)
 *   - PLTE 调色板 + tRNS（调色板 alpha；灰度/RGB 的 tRNS 色键透明）
 *   - 16bit 样本按大端读，低 bitDepth 按 MSB-first 解包；统一量化成 RGBA8888
 *   - 未知/辅助块（iCCP/sRGB/gAMA/cHRM/eXIf/pHYs/tEXt/iTXt/zTXt/sBIT/tIME…）安全跳过
 *   - 隔行扫描（Adam7）明确报错；完整 zlib/deflate：stored / fixed / dynamic Huffman
 *   - 编码只输出 colorType 6 + stored（不压缩）deflate 块：
 *     文件会大（≈ 宽×高×4 + 每行 1 字节 filter），但省下 Hermes 上跑压缩字典的 CPU，
 *     而且 view-shot 拿到的本来就是 12MB 级临时文件，磁盘不是瓶颈。
 *
 * 性能：解 2048×1536 RGBA PNG（≈12MB）在 Hermes 上约 0.3–0.8s，符合「显影」遮罩的
 * 感知预算；编码是纯内存拼接，约 50–120ms。
 */

/** 解码结果：统一输出 RGBA8888（透明通道缺省填 255）。 */
export interface PngImage {
  width: number;
  height: number;
  /** 长度 = width * height * 4，顺序 R,G,B,A。 */
  rgba: Uint8Array;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** 长度（code 长）与符号合并存进一个 Uint32：高 16 位 = 码长，低 16 位 = 符号。 */
const LEN_SHIFT = 16;
const SYM_MASK = 0xffff;
const MAX_BITS = 15;
const TABLE_SIZE = 1 << MAX_BITS;

/** 小工具：在 Uint8Array 上按大端读 32 位。 */
function readU32(src: Uint8Array, at: number): number {
  return (
    ((src[at] << 24) | (src[at + 1] << 16) | (src[at + 2] << 8) | src[at + 3]) >>> 0
  );
}

function chunkType(src: Uint8Array, at: number): string {
  return String.fromCharCode(src[at], src[at + 1], src[at + 2], src[at + 3]);
}

/**
 * deflate 位读取器。deflate 的位序是 **LSB-first**：
 * 先读出的位落在数值低位，所以「peek 出来的 n 位」与规范里 MSB-first 写的
 * Huffman 码正好是**位反序**关系 —— 建表时要把码字反序（见 `buildHuffmanTable`）。
 */
class BitReader {
  private readonly buf: Uint8Array;
  private pos: number;
  private bitBuf = 0;
  private bitCount = 0;

  constructor(buf: Uint8Array, start: number) {
    this.buf = buf;
    this.pos = start;
  }

  /** 当前**还没消费**的字节位置（bit 缓冲里的整字节也算没消费）。 */
  get bytePos(): number {
    return this.pos - (this.bitCount >> 3);
  }

  set bytePosition(at: number) {
    this.pos = at;
    this.bitBuf = 0;
    this.bitCount = 0;
  }

  private ensure(n: number): void {
    while (this.bitCount < n && this.pos < this.buf.length) {
      this.bitBuf |= this.buf[this.pos++] << this.bitCount;
      this.bitCount += 8;
    }
    // v2.1.1 硬约束：读到流尾仍凑不齐 n 位 = deflate 数据被截断。
    // 旧实现会静默返回 0 → peekBits 恒 0 → table[0] 命中字面量 → 内层 for(;;)
    // 死循环 + ensureCapacity 无限翻倍（Hermes 上直接卡死到 jetsam）。
    if (this.bitCount < n) {
      throw new Error(`png: deflate 数据被截断（还差 ${n - this.bitCount} 位）`);
    }
  }

  readBits(n: number): number {
    if (n === 0) return 0;
    this.ensure(n);
    const value = this.bitBuf & ((1 << n) - 1);
    this.bitBuf >>>= n;
    this.bitCount -= n;
    return value;
  }

  peekBits(n: number): number {
    this.ensure(n);
    return this.bitBuf & ((1 << n) - 1);
  }

  dropBits(n: number): void {
    this.bitBuf >>>= n;
    this.bitCount -= n;
  }

  /** 丢弃当前字节内的剩余位（stored 块要求字节对齐）。 */
  alignToByte(): void {
    const rest = this.bitCount & 7;
    if (rest !== 0) {
      this.bitBuf >>>= rest;
      this.bitCount -= rest;
    }
  }
}

/** 代码长度数组 → 单层 15bit 查找表（deflate 的码长上限就是 15）。 */
function buildHuffmanTable(lengths: Uint8Array, count: number): Uint32Array {
  const table = new Uint32Array(TABLE_SIZE);
  let maxLen = 0;
  for (let i = 0; i < count; i += 1) if (lengths[i] > maxLen) maxLen = lengths[i];
  if (maxLen === 0) return table;

  // 规范 Huffman：先数每个码长的数量，再算每个长度的起始码。
  const lenCount = new Uint16Array(MAX_BITS + 1);
  for (let i = 0; i < count; i += 1) lenCount[lengths[i]] += 1;
  lenCount[0] = 0;
  const nextCode = new Uint16Array(MAX_BITS + 1);
  let code = 0;
  for (let len = 1; len <= MAX_BITS; len += 1) {
    code = (code + lenCount[len - 1]) << 1;
    nextCode[len] = code;
  }

  for (let sym = 0; sym < count; sym += 1) {
    const len = lengths[sym];
    if (len === 0) continue;
    const canonical = nextCode[len]++;
    // 反序到 LSB-first 的读法（deflate 把码字低位先写进流）。
    let rev = 0;
    for (let b = 0; b < len; b += 1) rev |= ((canonical >> b) & 1) << (len - 1 - b);
    const entry = ((len << LEN_SHIFT) | sym) >>> 0;
    // 同一码字的所有 15bit 扩展都指向它；步长 = 1 << len 覆盖高位。
    const step = 1 << len;
    for (let i = rev; i < TABLE_SIZE; i += step) table[i] = entry;
  }
  return table;
}

function decodeSymbol(br: BitReader, table: Uint32Array): number {
  const entry = table[br.peekBits(MAX_BITS)];
  const len = entry >>> LEN_SHIFT;
  if (len === 0) throw new Error('png: 非法 Huffman 码流');
  br.dropBits(len);
  return entry & SYM_MASK;
}

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537,
  2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13,
  13,
];
const CODE_LENGTH_ORDER = [
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
];

let fixedLitTable: Uint32Array | null = null;
let fixedDistTable: Uint32Array | null = null;

function getFixedTables(): { lit: Uint32Array; dist: Uint32Array } {
  if (fixedLitTable === null || fixedDistTable === null) {
    const litLengths = new Uint8Array(288);
    for (let i = 0; i < 144; i += 1) litLengths[i] = 8;
    for (let i = 144; i < 256; i += 1) litLengths[i] = 9;
    for (let i = 256; i < 280; i += 1) litLengths[i] = 7;
    for (let i = 280; i < 288; i += 1) litLengths[i] = 8;
    const distLengths = new Uint8Array(30);
    for (let i = 0; i < 30; i += 1) distLengths[i] = 5;
    fixedLitTable = buildHuffmanTable(litLengths, 288);
    fixedDistTable = buildHuffmanTable(distLengths, 30);
  }
  return { lit: fixedLitTable, dist: fixedDistTable };
}

/**
 * 解一段 zlib 流（调用方已校验 2 字节头，尾部 adler32 由调用方比对）。
 *
 * `maxSize` 是**硬输出上限**：解码器面对不可信输入，输出字节数必须由 IHDR 推出来
 * 的 expected 封顶，否则几 KB 的「解压炸弹」能在 Hermes 上顶到 GB 级内存。
 * `MAX_DEFLATE_BLOCKS` 封住「海量空块」造成的 Huffman 表反复分配。
 */
const MAX_DEFLATE_BLOCKS = 1 << 18;

function inflateZlib(
  src: Uint8Array,
  start: number,
  expectedSize: number,
  maxSize: number,
): Uint8Array {
  const br = new BitReader(src, start);
  let out = new Uint8Array(Math.min(Math.max(1024, expectedSize), maxSize));
  let outPos = 0;

  const ensureCapacity = (extra: number): void => {
    if (outPos + extra > maxSize) {
      throw new Error(`png: 解压输出超出预期（上限 ${maxSize} 字节）`);
    }
    if (outPos + extra <= out.length) return;
    const grown = new Uint8Array(Math.min(Math.max(out.length * 2, outPos + extra + 1024), maxSize));
    grown.set(out.subarray(0, outPos));
    out = grown;
  };

  const dynamicTrees = (): { lit: Uint32Array; dist: Uint32Array } => {
    const hlit = br.readBits(5) + 257;
    const hdist = br.readBits(5) + 1;
    const hclen = br.readBits(4) + 4;
    const clLengths = new Uint8Array(19);
    for (let i = 0; i < hclen; i += 1) clLengths[CODE_LENGTH_ORDER[i]] = br.readBits(3);
    const clTable = buildHuffmanTable(clLengths, 19);
    const lengths = new Uint8Array(hlit + hdist);
    let i = 0;
    while (i < lengths.length) {
      const sym = decodeSymbol(br, clTable);
      if (sym < 16) {
        lengths[i] = sym;
        i += 1;
      } else if (sym === 16) {
        if (i === 0) throw new Error('png: 码长重复出现在首位');
        const prev = lengths[i - 1];
        const repeat = br.readBits(2) + 3;
        for (let k = 0; k < repeat && i < lengths.length; k += 1) lengths[i++] = prev;
      } else if (sym === 17) {
        const repeat = br.readBits(3) + 3;
        i += repeat;
      } else {
        const repeat = br.readBits(7) + 11;
        i += repeat;
      }
    }
    return {
      lit: buildHuffmanTable(lengths.subarray(0, hlit), hlit),
      dist: buildHuffmanTable(lengths.subarray(hlit), hdist),
    };
  };

  let final = 0;
  let blockCount = 0;
  while (final === 0) {
    blockCount += 1;
    if (blockCount > MAX_DEFLATE_BLOCKS) {
      throw new Error(`png: deflate 块数超过上限 ${MAX_DEFLATE_BLOCKS}（数据异常）`);
    }
    final = br.readBits(1);
    const type = br.readBits(2);
    if (type === 3) throw new Error('png: deflate 保留块类型 BTYPE=3（数据非法）');
    if (type === 0) {
      br.alignToByte();
      const p = br.bytePos;
      if (p + 4 > src.length) throw new Error('png: stored 块被截断');
      const len = src[p] | (src[p + 1] << 8);
      const nlen = src[p + 2] | (src[p + 3] << 8);
      if ((len ^ 0xffff) !== nlen) throw new Error('png: stored 块长度校验失败');
      const dataStart = p + 4;
      if (dataStart + len > src.length) throw new Error('png: stored 块数据被截断');
      ensureCapacity(len);
      out.set(src.subarray(dataStart, dataStart + len), outPos);
      outPos += len;
      br.bytePosition = dataStart + len;
    } else {
      const trees = type === 1 ? getFixedTables() : dynamicTrees();
      for (;;) {
        const sym = decodeSymbol(br, trees.lit);
        if (sym < 256) {
          ensureCapacity(1);
          out[outPos++] = sym;
          continue;
        }
        if (sym === 256) break;
        const lenIdx = sym - 257;
        if (lenIdx >= LENGTH_BASE.length) throw new Error('png: 非法长度码');
        let length = LENGTH_BASE[lenIdx];
        const extra = LENGTH_EXTRA[lenIdx];
        if (extra > 0) length += br.readBits(extra);
        const distSym = decodeSymbol(br, trees.dist);
        if (distSym >= DIST_BASE.length) throw new Error('png: 非法距离码');
        let dist = DIST_BASE[distSym];
        const distExtra = DIST_EXTRA[distSym];
        if (distExtra > 0) dist += br.readBits(distExtra);
        if (dist > outPos) throw new Error('png: 回溯距离越界');
        ensureCapacity(length);
        // 逐字节复制：区间可以重叠（这是 LZ77 的 run-length 语义），不能整段 copyWithin。
        let from = outPos - dist;
        for (let k = 0; k < length; k += 1) out[outPos++] = out[from++];
      }
    }
  }

  return outPos === out.length ? out : out.slice(0, outPos);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * 16bit 样本（大端两字节）→ 8bit 的定点量化：
 *   val8 = (val16 * 255 + 32768) >>> 16
 * 这是 v2.1.1 契约指定的定点写法（v ≤ 65535 → 全程落在 32 位无符号整数内，
 * Hermes / V8 都不会退化成浮点慢路径）。
 *
 * 诚实说明：它不是严格四舍五入——65536 个输入码里有 127 个（0.19%）比
 * round(v*255/65535) 低 1，分界点 v=0x8101（33025）产出 128 而非 129。
 * 这是有意的近似（与 libpng PNG_TRANSFORM 常用的移位量化同量级误差），
 * 不是 bug；需要逐码精确时请用 round(v*255/65535)。
 */
function quantize16(hi: number, lo: number): number {
  const v = (hi << 8) | lo;
  return (v * 255 + 32768) >>> 16;
}

/**
 * 低 bitDepth（1/2/4）样本解包：PNG 规定每个字节 **高位在前**（MSB-first），
 * 行尾不足一字节的填充位直接忽略（调用方只按像素数取样本）。
 */
function packedSample(row: Uint8Array, index: number, bitDepth: number, mask: number): number {
  const bit = index * bitDepth;
  return (row[bit >>> 3] >>> (8 - bitDepth - (bit & 7))) & mask;
}

/**
 * 去掉一行的 PNG filter。dst / prev 都按「行」传入：
 *   - 普通格式：两块 stride 大小的复用缓冲（首行 prev 是全零缓冲，filter 2/3/4 的
 *     up / upLeft 天然为 0，不需要 y === 0 的逐字节分支）；
 *   - bpp = max(1, ceil(channels*bitDepth/8))：16bit RGBA=8、16bit RGB=6、
 *     低 bitDepth 一律 1 —— 这是 PNG 规范对滤波「左邻字节距离」的定义。
 */
function unfilterRow(
  raw: Uint8Array,
  rawAt: number,
  dst: Uint8Array,
  dstAt: number,
  prev: Uint8Array,
  prevAt: number,
  stride: number,
  bpp: number,
  filter: number,
): void {
  if (filter === 0) {
    dst.set(raw.subarray(rawAt, rawAt + stride), dstAt);
    return;
  }
  if (filter === 1) {
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? dst[dstAt + x - bpp] : 0;
      dst[dstAt + x] = (raw[rawAt + x] + left) & 0xff;
    }
    return;
  }
  if (filter === 2) {
    for (let x = 0; x < stride; x += 1) {
      dst[dstAt + x] = (raw[rawAt + x] + prev[prevAt + x]) & 0xff;
    }
    return;
  }
  if (filter !== 3 && filter !== 4) throw new Error(`png: 非法 filter ${filter}`);
  for (let x = 0; x < stride; x += 1) {
    const left = x >= bpp ? dst[dstAt + x - bpp] : 0;
    const up = prev[prevAt + x];
    const upLeft = x >= bpp ? prev[prevAt + x - bpp] : 0;
    const predictor = filter === 3 ? (left + up) >> 1 : paeth(left, up, upLeft);
    dst[dstAt + x] = (raw[rawAt + x] + predictor) & 0xff;
  }
}

/**
 * 一行原始样本 → RGBA8888。所有色彩类型/位深的展开规则集中在这里，
 * 避免 decodePng 主循环被 5×5 的 switch 撑爆：
 *   - 0 灰度：低位深先解包再 ×255/85/17；tRNS 色键比对**解包后的原始样本**；
 *   - 2 RGB：tRNS 色键命中时 alpha=0；
 *   - 3 调色板：索引越界立刻报错（数据损坏不能静默成黑块）；
 *   - 4 灰度+A / 6 RGBA：16bit 逐样本量化。
 */
function writeRgbaRow(
  row: Uint8Array,
  rgba: Uint8Array,
  width: number,
  y: number,
  colorType: number,
  bitDepth: number,
  palette: Uint8Array | null,
  paletteAlpha: Uint8Array | null,
  grayKey: number,
  keyR: number,
  keyG: number,
  keyB: number,
): void {
  const out = y * width * 4;
  const mask = (1 << bitDepth) - 1;
  // 1→0/255、2→0/85/170/255、4→0..255 步长 17；8bit 以上走各自的直读分支。
  const lowScale = bitDepth < 8 ? 255 / mask : 1;

  if (colorType === 6) {
    if (bitDepth === 16) {
      for (let x = 0, p = 0, q = out; x < width; x += 1, p += 8, q += 4) {
        rgba[q] = quantize16(row[p], row[p + 1]);
        rgba[q + 1] = quantize16(row[p + 2], row[p + 3]);
        rgba[q + 2] = quantize16(row[p + 4], row[p + 5]);
        rgba[q + 3] = quantize16(row[p + 6], row[p + 7]);
      }
      return;
    }
    for (let x = 0, p = 0, q = out; x < width; x += 1, p += 4, q += 4) {
      rgba[q] = row[p];
      rgba[q + 1] = row[p + 1];
      rgba[q + 2] = row[p + 2];
      rgba[q + 3] = row[p + 3];
    }
    return;
  }

  if (colorType === 4) {
    if (bitDepth === 16) {
      for (let x = 0, p = 0, q = out; x < width; x += 1, p += 4, q += 4) {
        const g = quantize16(row[p], row[p + 1]);
        rgba[q] = g;
        rgba[q + 1] = g;
        rgba[q + 2] = g;
        rgba[q + 3] = quantize16(row[p + 2], row[p + 3]);
      }
      return;
    }
    for (let x = 0, p = 0, q = out; x < width; x += 1, p += 2, q += 4) {
      const g = row[p];
      rgba[q] = g;
      rgba[q + 1] = g;
      rgba[q + 2] = g;
      rgba[q + 3] = row[p + 1];
    }
    return;
  }

  if (colorType === 3) {
    if (palette === null) throw new Error('png: colorType 3 缺少 PLTE 调色板');
    const entries = palette.length / 3;
    for (let x = 0, q = out; x < width; x += 1, q += 4) {
      const idx = bitDepth === 8 ? row[x] : packedSample(row, x, bitDepth, mask);
      if (idx >= entries) {
        throw new Error(`png: 第 ${y} 行调色板索引 ${idx} 越界（PLTE 只有 ${entries} 项）`);
      }
      const p = idx * 3;
      rgba[q] = palette[p];
      rgba[q + 1] = palette[p + 1];
      rgba[q + 2] = palette[p + 2];
      rgba[q + 3] = paletteAlpha !== null && idx < paletteAlpha.length ? paletteAlpha[idx] : 255;
    }
    return;
  }

  if (colorType === 2) {
    const hasKey = keyR >= 0 && keyG >= 0 && keyB >= 0;
    if (bitDepth === 16) {
      for (let x = 0, p = 0, q = out; x < width; x += 1, p += 6, q += 4) {
        const r = (row[p] << 8) | row[p + 1];
        const g = (row[p + 2] << 8) | row[p + 3];
        const b = (row[p + 4] << 8) | row[p + 5];
        rgba[q] = (r * 255 + 32768) >>> 16;
        rgba[q + 1] = (g * 255 + 32768) >>> 16;
        rgba[q + 2] = (b * 255 + 32768) >>> 16;
        rgba[q + 3] = hasKey && r === keyR && g === keyG && b === keyB ? 0 : 255;
      }
      return;
    }
    for (let x = 0, p = 0, q = out; x < width; x += 1, p += 3, q += 4) {
      const r = row[p];
      const g = row[p + 1];
      const b = row[p + 2];
      rgba[q] = r;
      rgba[q + 1] = g;
      rgba[q + 2] = b;
      rgba[q + 3] = hasKey && r === keyR && g === keyG && b === keyB ? 0 : 255;
    }
    return;
  }

  if (colorType === 0) {
    const hasKey = grayKey >= 0;
    if (bitDepth === 16) {
      for (let x = 0, p = 0, q = out; x < width; x += 1, p += 2, q += 4) {
        const v = (row[p] << 8) | row[p + 1];
        const g = (v * 255 + 32768) >>> 16;
        rgba[q] = g;
        rgba[q + 1] = g;
        rgba[q + 2] = g;
        rgba[q + 3] = hasKey && v === grayKey ? 0 : 255;
      }
      return;
    }
    if (bitDepth === 8) {
      for (let x = 0, q = out; x < width; x += 1, q += 4) {
        const v = row[x];
        rgba[q] = v;
        rgba[q + 1] = v;
        rgba[q + 2] = v;
        rgba[q + 3] = hasKey && v === grayKey ? 0 : 255;
      }
      return;
    }
    for (let x = 0, q = out; x < width; x += 1, q += 4) {
      const sample = packedSample(row, x, bitDepth, mask);
      const v = sample * lowScale;
      rgba[q] = v;
      rgba[q + 1] = v;
      rgba[q + 2] = v;
      rgba[q + 3] = hasKey && sample === grayKey ? 0 : 255;
    }
    return;
  }

  throw new Error(`png: 不支持的 colorType ${colorType}`);
}

/**
 * 解码 PNG → RGBA8888（透明通道缺失时填 255）。
 * 抛异常表示这份数据不是我们支持/能读的 PNG；调用方（成片管线）必须把它当成
 * 「LUT 这条路走不通」来兜底，而不是让用户丢照片。
 */
export function decodePng(bytes: Uint8Array): PngImage {
  if (bytes.length < 8) throw new Error('png: 文件太短');
  for (let i = 0; i < 8; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error('png: 签名不匹配');
  }

  let off = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  let sawIHDR = false;
  let sawIEND = false;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idatParts: Uint8Array[] = [];
  let idatSize = 0;

  while (off < bytes.length) {
    if (off + 8 > bytes.length) throw new Error('png: 块头被截断（文件不完整）');
    for (let k = 0; k < 4; k += 1) {
      const ch = bytes[off + 4 + k];
      const isAlpha = (ch >= 0x41 && ch <= 0x5a) || (ch >= 0x61 && ch <= 0x7a);
      if (!isAlpha) throw new Error(`png: 块类型非法（第 ${k + 1} 个字符不是 ASCII 字母）`);
    }
    const length = readU32(bytes, off);
    const type = chunkType(bytes, off + 4);
    const dataAt = off + 8;
    if (length > bytes.length - dataAt - 4) {
      throw new Error(
        `png: ${type} 块越界（声明 ${length} 字节，文件只剩 ${Math.max(0, bytes.length - dataAt - 4)} 字节）`,
      );
    }
    // —— v2.1.1 不可信输入硬化 ——
    // 关键块（IHDR/PLTE/IDAT/IEND）与参与像素的 tRNS 必须 CRC 一致；纯元数据块
    // CRC 坏了只影响元数据，按规范宽容跳过（不能因为一张缩略图元数据坏就丢照片）。
    const critical = (bytes[off + 4] & 0x20) === 0;
    if (critical || type === 'tRNS') {
      const storedCrc = readU32(bytes, dataAt + length);
      if (crc32(bytes, off + 4, dataAt + length) !== storedCrc) {
        throw new Error(`png: ${type} 块 CRC 校验失败（文件损坏）`);
      }
    }
    if (critical && type !== 'IHDR' && type !== 'PLTE' && type !== 'IDAT' && type !== 'IEND') {
      throw new Error(`png: 不支持的关键块 ${type}（未知 critical chunk 不能安全跳过）`);
    }
    if (type === 'IHDR') {
      if (sawIHDR) throw new Error('png: 重复的 IHDR 块');
      if (length !== 13) throw new Error(`png: IHDR 长度非法（${length}，应为 13）`);
      width = readU32(bytes, dataAt);
      height = readU32(bytes, dataAt + 4);
      bitDepth = bytes[dataAt + 8];
      colorType = bytes[dataAt + 9];
      const compression = bytes[dataAt + 10];
      const filterMethod = bytes[dataAt + 11];
      interlace = bytes[dataAt + 12];
      if (compression !== 0) throw new Error(`png: 不支持的压缩方法 ${compression}`);
      if (filterMethod !== 0) throw new Error(`png: 不支持的滤波方法 ${filterMethod}`);
      if (interlace === 1) throw new Error('png: 不支持隔行扫描（interlace=1）');
      if (interlace !== 0) throw new Error(`png: IHDR 的 interlace 非法 ${interlace}`);
      sawIHDR = true;
    } else if (type === 'PLTE') {
      if (length === 0 || length % 3 !== 0 || length > 768) {
        throw new Error(`png: PLTE 长度非法（${length}，应为 3..768 且是 3 的倍数）`);
      }
      palette = bytes.subarray(dataAt, dataAt + length);
    } else if (type === 'tRNS') {
      trns = bytes.subarray(dataAt, dataAt + length);
    } else if (type === 'IDAT') {
      idatParts.push(bytes.subarray(dataAt, dataAt + length));
      idatSize += length;
    } else if (type === 'IEND') {
      sawIEND = true;
      break;
    }
    // 其余辅助/未知块（iCCP/sRGB/gAMA/cHRM/eXIf/pHYs/tEXt/iTXt/zTXt/sBIT/tIME…）
    // 一律安全跳过：解码只需要像素数据，不能因为不认识某个块就让整张照片失败。
    off = dataAt + length + 4;
  }

  if (!sawIHDR) throw new Error('png: 缺少 IHDR 块');
  if (!sawIEND) throw new Error('png: 缺少 IEND 块（文件被截断）');
  if (width <= 0 || height <= 0) throw new Error(`png: IHDR 宽高非法 ${width}×${height}`);
  if (width > 0x7fffffff || height > 0x7fffffff) {
    throw new Error(`png: IHDR 尺寸超出 PNG 规范上限 ${width}×${height}`);
  }

  let channels: number;
  switch (colorType) {
    case 0:
      channels = 1;
      break;
    case 2:
      channels = 3;
      break;
    case 3:
      channels = 1;
      break;
    case 4:
      channels = 2;
      break;
    case 6:
      channels = 4;
      break;
    default:
      throw new Error(`png: 不支持的 colorType ${colorType}`);
  }

  const depthOk =
    bitDepth === 1 || bitDepth === 2 || bitDepth === 4 || bitDepth === 8 || bitDepth === 16;
  if (!depthOk) throw new Error(`png: 不支持的位深 ${bitDepth}`);
  if (colorType === 3) {
    if (bitDepth === 16) throw new Error('png: 调色板 PNG 不支持 bitDepth 16（只允许 1/2/4/8）');
    if (palette === null) throw new Error('png: colorType 3 缺少 PLTE 调色板');
  } else if (colorType !== 0 && bitDepth !== 8 && bitDepth !== 16) {
    throw new Error(`png: colorType ${colorType} 不支持 bitDepth ${bitDepth}（只允许 8/16）`);
  }

  // tRNS：调色板是 alpha 表；灰度/RGB 是色键。辅助块语义不合规时按「无透明」处理，
  // 不让一个可选的透明块把整张图判死。
  let grayKey = -1;
  let keyR = -1;
  let keyG = -1;
  let keyB = -1;
  let paletteAlpha: Uint8Array | null = null;
  if (trns !== null) {
    if (colorType === 3) {
      paletteAlpha = trns;
    } else if (colorType === 0 && trns.length >= 2) {
      grayKey = (trns[0] << 8) | trns[1];
    } else if (colorType === 2 && trns.length >= 6) {
      keyR = (trns[0] << 8) | trns[1];
      keyG = (trns[2] << 8) | trns[3];
      keyB = (trns[4] << 8) | trns[5];
    }
  }

  // v2.1.1 不可信输入硬化：尺寸上限按「像素数 + 解压字节」双重封顶。
  // 旧实现只挡 2^31，20000×20000 的几十字节 IHDR 能穿过检查并预分配 1.6GB；
  // Hermes 上这不是可 catch 的异常，是直接 jetsam。24MP 覆盖 iPhone 全系原图，
  // 128MB 覆盖 4032×3024 的 16bit RGBA 中间图（97.5MB）。
  const MAX_PIXELS = 24_000_000;
  const MAX_EXPECTED_BYTES = 128 * 1024 * 1024;
  if (width * height > MAX_PIXELS) {
    throw new Error(`png: 像素数超过上限（${width}×${height}，上限 ${MAX_PIXELS} 像素）`);
  }

  const bitsPerPixel = channels * bitDepth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const expected = (stride + 1) * height;
  const rgbaBytes = width * height * 4;
  if (!Number.isSafeInteger(expected) || expected > MAX_EXPECTED_BYTES) {
    throw new Error(`png: 解压后数据过大（${expected} 字节，上限 ${MAX_EXPECTED_BYTES}）`);
  }
  if (width * height > Math.floor(0x7fffffff / 4)) {
    throw new Error(`png: 输出 RGBA 过大（${width}×${height}）`);
  }

  if (idatParts.length === 0) throw new Error('png: 缺少 IDAT');
  // 合法 zlib 的压缩体积不会明显大于原始数据；在 concat 之前先排掉炸弹，
  // 免得为一份恶意 IDAT 先分配巨量缓冲。
  const idatLimit = expected + (expected >> 3) + (1 << 20);
  if (idatSize > idatLimit) {
    throw new Error(`png: IDAT 尺寸异常（${idatSize} 字节，解压后只需 ${expected} 字节）`);
  }
  const idat = new Uint8Array(idatSize);
  let idatPos = 0;
  for (const part of idatParts) {
    idat.set(part, idatPos);
    idatPos += part.length;
  }

  // IDAT 开头是 zlib 头（CMF/FLG）：压缩方法 8、窗口 CINFO ≤ 7、FCHECK 必须过、
  // FDICT 置位表示流依赖预设字典（我们无法提供）→ 直接报错，不静默吃错头。
  if (idat.length < 2) throw new Error('png: zlib 头缺失');
  const cmf = idat[0];
  const flags = idat[1];
  if ((cmf & 0x0f) !== 8) throw new Error(`png: zlib 压缩方法非法（${cmf & 0x0f}）`);
  if (cmf >> 4 > 7) throw new Error(`png: zlib 窗口大小非法（CINFO=${cmf >> 4}）`);
  if ((cmf * 256 + flags) % 31 !== 0) throw new Error('png: zlib 头 FCHECK 校验失败');
  if ((flags & 0x20) !== 0) throw new Error('png: 不支持带预设字典（FDICT）的 zlib 流');
  const raw = inflateZlib(idat, 2, expected, expected);
  if (raw.length !== expected) {
    throw new Error(`png: 解压后数据不足（需要 ${expected} 字节，实得 ${raw.length}）`);
  }
  // adler32 是压缩流的最终校验：损坏/篡改的 IDAT 不能悄悄解出一张错色照片。
  if (adler32(raw, 0, raw.length) !== readU32(idat, idat.length - 4)) {
    throw new Error('png: zlib adler32 校验失败（文件损坏）');
  }

  // 逐行反滤波 + 展开：只保留两块 stride 的行缓冲，峰值内存 ≈ 解压后的 raw
  // ((stride+1)*height) + 输出 RGBA (width*height*4)，不额外开 stride*height 大数组。
  const rgba = new Uint8Array(rgbaBytes);
  let prevRow = new Uint8Array(stride);
  let curRow = new Uint8Array(stride);
  let rawPos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawPos];
    rawPos += 1;
    if (filter > 4) throw new Error(`png: 第 ${y} 行非法 filter ${filter}`);
    unfilterRow(raw, rawPos, curRow, 0, prevRow, 0, stride, bpp, filter);
    writeRgbaRow(
      curRow,
      rgba,
      width,
      y,
      colorType,
      bitDepth,
      palette,
      paletteAlpha,
      grayKey,
      keyR,
      keyG,
      keyB,
    );
    rawPos += stride;
    const swap = prevRow;
    prevRow = curRow;
    curRow = swap;
  }

  return { width, height, rgba };
}

/**
 * CRC-32 表（slicing-by-8）：8 张 256 项表 = 8KB，一次吃 8 字节。
 *
 * 为什么值得：v2.0.1 的中间图是 1800×1350 RGBA ≈ 9.7MB，IDAT/整块 CRC 要走遍全部
 * 字节；逐字节版在 V8 上单独就要 25~40ms，slicing-by-8 能砍到 1/3 左右。
 * 小数据（IHDR/IEND）自动落回尾部逐字节循环。
 */
const CRC_TABLES = (() => {
  const tables = new Uint32Array(256 * 8);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tables[n] = c >>> 0;
  }
  for (let i = 0; i < 256; i += 1) {
    let c = tables[i];
    for (let j = 1; j < 8; j += 1) {
      c = (tables[(c & 0xff)] ^ (c >>> 8)) >>> 0;
      tables[j * 256 + i] = c;
    }
  }
  return tables;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  let i = start;
  const bulk = end - ((end - start) & 7);
  while (i < bulk) {
    const one =
      (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0;
    const two =
      (bytes[i + 4] | (bytes[i + 5] << 8) | (bytes[i + 6] << 16) | (bytes[i + 7] << 24)) >>> 0;
    c ^= one;
    c =
      (CRC_TABLES[7 * 256 + (c & 0xff)] ^
        CRC_TABLES[6 * 256 + ((c >>> 8) & 0xff)] ^
        CRC_TABLES[5 * 256 + ((c >>> 16) & 0xff)] ^
        CRC_TABLES[4 * 256 + ((c >>> 24) & 0xff)] ^
        CRC_TABLES[3 * 256 + (two & 0xff)] ^
        CRC_TABLES[2 * 256 + ((two >>> 8) & 0xff)] ^
        CRC_TABLES[1 * 256 + ((two >>> 16) & 0xff)] ^
        CRC_TABLES[(two >>> 24) & 0xff]) >>>
      0;
    i += 8;
  }
  for (; i < end; i += 1) c = (CRC_TABLES[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * adler32（zlib 校验和）。按 5552 字节分块、块内只累加不取模：
 * 这是 zlib 自己的 NMAX 常数，保证块内累加值不会超出 JS 安全整数范围。
 * 9.7MB 在 V8 上约 8~12ms（逐字节取模版要 25ms+）。
 */
function adler32(bytes: Uint8Array, start: number, end: number): number {
  const NMAX = 5552;
  let a = 1;
  let b = 0;
  let i = start;
  while (i < end) {
    const blockEnd = Math.min(i + NMAX, end);
    for (; i < blockEnd; i += 1) {
      a += bytes[i];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

interface ChunkWriter {
  bytes: Uint8Array;
  length: number;
}

function writeU32(dst: Uint8Array, at: number, value: number): void {
  dst[at] = (value >>> 24) & 0xff;
  dst[at + 1] = (value >>> 16) & 0xff;
  dst[at + 2] = (value >>> 8) & 0xff;
  dst[at + 3] = value & 0xff;
}

/**
 * RGBA8888 → PNG（colorType 6，stored deflate 块）。
 *
 * 不压缩是刻意的（用户红线四②：只准 BTYPE=00 的 store 块）：Hermes 上跑 zlib
 * 压缩 9.7MB 比写文件本身慢一个数量级，而这张 PNG 只活到唯一一次截图，不落相册。
 *
 * v2.0.1 性能改造（对照 v2.0.0 的逐字节闭包版 ~96ms@2.43MP）：
 *   ① 先用 `subarray + set` 批量拼出带 filter 字节的 raw 段（一次 9.7MB 拷贝）；
 *   ② stored 块用整段 `set` 拷贝进最终缓冲，块头里填长度/反码，不再逐字节 push；
 *   ③ CRC 用 slicing-by-8、adler 用 5552 分块，都是单趟线性扫描。
 */
export function encodePngRgba(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`encodePngRgba 需要正整数宽高，收到 ${width}×${height}`);
  }
  if (rgba.length !== width * height * 4) {
    throw new Error(`encodePngRgba 的 RGBA 长度应为 ${width * height * 4}，实际 ${rgba.length}`);
  }
  const stride = width * 4;
  const rawStride = stride + 1;
  const rowsBytes = rawStride * height;

  // raw = 每行前补一个 filter 字节（0 = None）的未压缩字节流
  const raw = new Uint8Array(rowsBytes);
  for (let y = 0; y < height; y += 1) {
    const dst = y * rawStride;
    const src = y * stride;
    raw[dst] = 0;
    raw.set(rgba.subarray(src, src + stride), dst + 1);
  }

  // zlib: 2 字节头 + 每 65535 字节一个 stored 块（5 字节头）+ 4 字节 adler32。
  const storedBlocks = Math.ceil(rowsBytes / 65535) || 1;
  const zlibBytes = 2 + rowsBytes + storedBlocks * 5 + 4;
  const total = 8 + (12 + 13) + (12 + zlibBytes) + 12;
  const out = new Uint8Array(total);
  let at = 0;

  for (const b of PNG_SIGNATURE) out[at++] = b;

  // IHDR
  writeU32(out, at, 13);
  at += 4;
  for (const ch of 'IHDR') out[at++] = ch.charCodeAt(0);
  writeU32(out, at, width);
  writeU32(out, at + 4, height);
  out[at + 8] = 8; // bit depth
  out[at + 9] = 6; // color type RGBA
  out[at + 10] = 0; // compression
  out[at + 11] = 0; // filter
  out[at + 12] = 0; // interlace
  writeU32(out, at + 13, crc32(out, at - 4, at + 13));
  at += 17;

  // IDAT
  const idatLengthPos = at;
  at += 4;
  for (const ch of 'IDAT') out[at++] = ch.charCodeAt(0);
  const idatDataAt = at;
  out[at++] = 0x78; // CMF: deflate, 32K window
  out[at++] = 0x01; // FLG: FCHECK 使 0x7801 % 31 == 0，无字典
  let srcPos = 0;
  while (srcPos < rowsBytes) {
    const take = Math.min(65535, rowsBytes - srcPos);
    const isFinal = srcPos + take >= rowsBytes ? 1 : 0;
    out[at++] = isFinal; // BFINAL + BTYPE=00（stored），且已字节对齐
    out[at++] = take & 0xff;
    out[at++] = (take >>> 8) & 0xff;
    out[at++] = (take ^ 0xffff) & 0xff;
    out[at++] = ((take ^ 0xffff) >>> 8) & 0xff;
    out.set(raw.subarray(srcPos, srcPos + take), at);
    at += take;
    srcPos += take;
  }
  writeU32(out, at, adler32(raw, 0, rowsBytes));
  at += 4;
  writeU32(out, idatLengthPos, at - idatDataAt);
  writeU32(out, at, crc32(out, idatLengthPos + 4, at));
  at += 4;

  // IEND
  writeU32(out, at, 0);
  at += 4;
  for (const ch of 'IEND') out[at++] = ch.charCodeAt(0);
  writeU32(out, at, crc32(out, at - 4, at));
  at += 4;

  return at === total ? out : out.slice(0, at);
}
