/**
 * 纯 JS base64 解码（零依赖，成片管线专用）
 *
 * 为什么需要：九卷 33³ LUT 图集以 base64 字符串打进 JS bundle（`constants/lutAtlas.ts`），
 * 运行时解成 Uint8Array 再喂 `decodePng` + `extractLutFromAtlas`。只在「首次用某一卷」时
 * 解一次（`lutAssets.ts` 内有缓存），总量约 250KB，耗时可以忽略。
 *
 * 只做解码：编码方向不需要（image 写盘走 expo-file-system 的 Uint8Array 写入）。
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** 字节 → base64 字符值；非 base64 字符（含 '='、换行、空格）一律 -1 */
const DECODE_TABLE: Int16Array = (() => {
  const table = new Int16Array(256);
  table.fill(-1);
  for (let i = 0; i < ALPHABET.length; i += 1) {
    table[ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

/**
 * base64 → 字节。宽容处理：忽略 '=' 填充与任意非 base64 字符（含换行）。
 *
 * 调用方要保证输入是标准 base64（本仓库里的图集是生成器产出的，不含 URL-safe 变体）。
 */
export function decodeBase64(input: string): Uint8Array {
  const length = input.length;
  const capacity = ((length + 3) >> 2) * 3;
  const bytes = new Uint8Array(capacity);
  let buffer = 0;
  let bits = 0;
  let offset = 0;

  for (let i = 0; i < length; i += 1) {
    const value = DECODE_TABLE[input.charCodeAt(i)];
    if (value < 0) {
      continue;
    }
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[offset] = (buffer >> bits) & 0xff;
      offset += 1;
    }
  }

  return bytes.slice(0, offset);
}
