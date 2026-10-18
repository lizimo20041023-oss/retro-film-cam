/**
 * 纯 JS PNG 编解码（v2.0.0 · 真 LUT 成片管线用）。
 *
 * 为什么需要它：成片走真 3D LUT 查表 —— 必须先把 view-shot 截出来的图**解成像素**，
 * 逐像素查表后再**编码回图片**交给第二遍合成。而本项目立了「不加依赖」的死规矩：
 * 没有 Skia / GL，`expo-image-manipulator` 只能缩放不能改像素。于是解码/编码都用
 * 纯 JS 写（Node / Hermes 同一份代码，可离线单测）。
 *
 * 支持范围（只覆盖本 App 自己会遇到的输入，不做通用 PNG 库）：
 *   - 8bit、非隔行、colorType 2(RGB) / 6(RGBA) / 0(灰度) / 4(灰度+透明)
 *   - 完整 zlib/deflate 解码：stored / fixed Huffman / dynamic Huffman 三种块
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

/** 解一段 zlib 流（跳过 2 字节头，忽略尾部 adler32）。 */
function inflateZlib(src: Uint8Array, start: number, expectedSize: number): Uint8Array {
  const br = new BitReader(src, start);
  let out = new Uint8Array(Math.max(1024, expectedSize));
  let outPos = 0;

  const ensureCapacity = (extra: number): void => {
    if (outPos + extra <= out.length) return;
    const grown = new Uint8Array(Math.max(out.length * 2, outPos + extra + 1024));
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
  while (final === 0) {
    final = br.readBits(1);
    const type = br.readBits(2);
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
 * 解码 PNG → RGBA。抛异常表示这份数据不是我们支持/能读的 PNG；
 * 调用方（成片管线）必须把它当成「LUT 这条路走不通」来兜底，而不是让用户丢照片。
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
  const idatParts: Uint8Array[] = [];
  let idatSize = 0;

  while (off + 8 <= bytes.length) {
    const length = readU32(bytes, off);
    const type = chunkType(bytes, off + 4);
    const dataAt = off + 8;
    if (dataAt + length + 4 > bytes.length) throw new Error(`png: ${type} 块越界`);
    if (type === 'IHDR') {
      width = readU32(bytes, dataAt);
      height = readU32(bytes, dataAt + 4);
      bitDepth = bytes[dataAt + 8];
      colorType = bytes[dataAt + 9];
      interlace = bytes[dataAt + 12];
    } else if (type === 'IDAT') {
      idatParts.push(bytes.subarray(dataAt, dataAt + length));
      idatSize += length;
    } else if (type === 'IEND') {
      break;
    }
    off = dataAt + length + 4;
  }

  if (width <= 0 || height <= 0) throw new Error('png: IHDR 非法');
  if (bitDepth !== 8) throw new Error(`png: 不支持的位深 ${bitDepth}`);
  if (interlace !== 0) throw new Error('png: 不支持隔行扫描');
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 0 ? 1 : -1;
  if (channels < 0) throw new Error(`png: 不支持的 colorType ${colorType}`);
  if (idatParts.length === 0) throw new Error('png: 缺少 IDAT');

  const idat = new Uint8Array(idatSize);
  let idatPos = 0;
  for (const part of idatParts) {
    idat.set(part, idatPos);
    idatPos += part.length;
  }

  const stride = width * channels;
  const expected = (stride + 1) * height;
  // IDAT 开头是 zlib 头：CMF/FLG 两个字节（FDICT 置位时再跟 4 字节字典 id）。
  if (idat.length < 2) throw new Error('png: zlib 头缺失');
  const flags = idat[1];
  const dataStart = 2 + ((flags & 0x20) !== 0 ? 4 : 0);
  const raw = inflateZlib(idat, dataStart, expected);
  if (raw.length < expected) throw new Error('png: 解压后数据不足');

  // 反滤波：filter 字节在每行开头，bpp = 每像素字节数。
  const bpp = channels;
  const pixels = new Uint8Array(stride * height);
  let rawPos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawPos++];
    const rowStart = y * stride;
    const prevRowStart = rowStart - stride;
    for (let x = 0; x < stride; x += 1) {
      const cur = raw[rawPos++];
      const left = x >= bpp ? pixels[rowStart + x - bpp] : 0;
      const up = y > 0 ? pixels[prevRowStart + x] : 0;
      const upLeft = y > 0 && x >= bpp ? pixels[prevRowStart + x - bpp] : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = cur;
          break;
        case 1:
          value = cur + left;
          break;
        case 2:
          value = cur + up;
          break;
        case 3:
          value = cur + ((left + up) >> 1);
          break;
        case 4:
          value = cur + paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`png: 非法 filter ${filter}`);
      }
      pixels[rowStart + x] = value & 0xff;
    }
  }

  if (channels === 4) return { width, height, rgba: pixels };

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, p = 0, q = 0; i < width * height; i += 1, p += channels, q += 4) {
    if (channels === 3) {
      rgba[q] = pixels[p];
      rgba[q + 1] = pixels[p + 1];
      rgba[q + 2] = pixels[p + 2];
      rgba[q + 3] = 255;
    } else if (channels === 2) {
      rgba[q] = pixels[p];
      rgba[q + 1] = pixels[p];
      rgba[q + 2] = pixels[p];
      rgba[q + 3] = pixels[p + 1];
    } else {
      rgba[q] = pixels[p];
      rgba[q + 1] = pixels[p];
      rgba[q + 2] = pixels[p];
      rgba[q + 3] = 255;
    }
  }
  return { width, height, rgba };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array, start: number, end: number): number {
  let a = 1;
  let b = 0;
  for (let i = start; i < end; i += 1) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
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
 * 不压缩是刻意的：Hermes 上跑一遍 zlib 压缩字典（12MB 输入）比写文件本身还慢，
 * 而这张 PNG 只活到第二次截图，不落相册、不上传。体积换 CPU，稳。
 */
export function encodePngRgba(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`encodePngRgba 需要正整数宽高，收到 ${width}×${height}`);
  }
  if (rgba.length !== width * height * 4) {
    throw new Error(`encodePngRgba 的 RGBA 长度应为 ${width * height * 4}，实际 ${rgba.length}`);
  }
  const stride = width * 4;
  const rowsBytes = (stride + 1) * height;
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

  // IDAT（先把数据放到最终位置，再回头补 chunk 头/尾，避免再复制一遍 12MB）
  const idatLengthPos = at;
  at += 4;
  for (const ch of 'IDAT') out[at++] = ch.charCodeAt(0);
  const idatDataAt = at;
  out[at++] = 0x78; // CMF: deflate, 32K window
  out[at++] = 0x01; // FLG: FCHECK 使 0x7801 % 31 == 0，无字典
  let srcPos = 0;
  let blockIndex = 0;
  // adler32 只覆盖未压缩数据（filter 字节 + 行字节），不含 zlib 头与 stored 块头。
  let adA = 1;
  let adB = 0;
  const pushData = (byte: number): void => {
    out[at++] = byte;
    adA += byte;
    if (adA >= 65521) adA -= 65521;
    adB += adA;
    if (adB >= 65521) adB -= 65521;
  };
  while (srcPos < rowsBytes) {
    const take = Math.min(65535, rowsBytes - srcPos);
    const isFinal = srcPos + take >= rowsBytes ? 1 : 0;
    out[at++] = isFinal; // BFINAL + BTYPE=00，且已字节对齐
    out[at++] = take & 0xff;
    out[at++] = (take >>> 8) & 0xff;
    out[at++] = (take ^ 0xffff) & 0xff;
    out[at++] = ((take ^ 0xffff) >>> 8) & 0xff;
    // 同一个循环里顺便把 "filter=0 + 行数据" 写进来，省一次 12MB 临时数组。
    for (let k = 0; k < take; k += 1) {
      const flat = srcPos + k;
      const inRowOffset = flat % (stride + 1);
      if (inRowOffset === 0) {
        pushData(0); // filter type 0（None）
      } else {
        // flat 是 "每行 filter 字节之后" 的展开流，需要换算回 rgba 下标。
        const row = Math.floor(flat / (stride + 1));
        const col = inRowOffset - 1;
        pushData(rgba[row * stride + col]);
      }
    }
    srcPos += take;
    blockIndex += 1;
  }
  void blockIndex;
  writeU32(out, at, (((adB << 16) | adA) >>> 0));
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
