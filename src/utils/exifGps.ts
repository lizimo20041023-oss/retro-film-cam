/** GPS 只从所选照片的元数据读取；这个文件不接触设备当前位置。 */
type ExifBag = Record<string, unknown>;

export interface PhotoGps {
  latitude: number;
  longitude: number;
}

function isBag(value: unknown): value is ExifBag {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rational(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (isBag(value)) {
    const numerator = rational(value.numerator ?? value.num);
    const denominator = rational(value.denominator ?? value.den);
    return numerator !== null && denominator !== null && denominator !== 0
      ? numerator / denominator
      : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s*\/\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)))?$/.exec(trimmed);
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = match[2] === undefined ? 1 : Number(match[2]);
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0
    ? numerator / denominator
    : null;
}

/** 十进制度，或原始 EXIF 的 [度, 分, 秒] / "度/分母, 分/分母, 秒/分母"。 */
function coordinate(value: unknown): number | null {
  const decimal = rational(value);
  if (decimal !== null) return decimal;

  let parts: unknown[];
  if (Array.isArray(value)) {
    parts = value;
  } else if (typeof value === 'string') {
    const normalized = value.trim().replace(/[°º′'″"]/g, ' ').replace(/\bdeg(?:rees)?\b/gi, ' ');
    if (!/^[\s+\-\d.,/()]+$/.test(normalized)) return null;
    parts = normalized.replace(/[()]/g, '').split(/[\s,]+/).filter(Boolean);
  } else {
    return null;
  }

  if (parts.length !== 2 && parts.length !== 3) return null;
  const degrees = rational(parts[0]);
  const minutes = rational(parts[1]);
  const seconds = parts.length === 3 ? rational(parts[2]) : 0;
  if (degrees === null || minutes === null || seconds === null ||
      minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) return null;
  const magnitude = Math.abs(degrees) + minutes / 60 + seconds / 3600;
  return degrees < 0 ? -magnitude : magnitude;
}

function coordinateFrom(exif: ExifBag, axis: 'Latitude' | 'Longitude'): number | null {
  const maxMagnitude = axis === 'Latitude' ? 90 : 180;
  const nested = ['{GPS}', 'GPS', 'GPSInfo', '{Exif}']
    .map((key) => exif[key])
    .filter(isBag);
  const bags = [exif, ...nested];
  const valueKeys = [`GPS${axis}`, axis, axis.toLowerCase()];
  const refKeys = [`GPS${axis}Ref`, `${axis}Ref`];

  for (const bag of bags) {
    for (const key of valueKeys) {
      if (!(key in bag)) continue;
      const parsed = coordinate(bag[key]);
      // Some exporters leave a stale flat tag next to a valid nested GPS block.
      // Skip an invalid candidate so the nested value still has a chance to win.
      if (parsed === null || Math.abs(parsed) > maxMagnitude) continue;
      // Expo 在 Android/iOS 常返回已带符号的十进制度；原始 EXIF 则用 Ref 表示南/西。
      // 已经为负时绝不再次取反，避免把南半球/西半球翻到另一面。
      const ref = refKeys.map((refKey) => bag[refKey] ?? exif[refKey])
        .find((candidate): candidate is string => typeof candidate === 'string')?.trim().toUpperCase();
      return (ref === 'S' || ref === 'W') && parsed >= 0 ? -parsed : parsed;
    }
  }
  return null;
}

export function readExifGps(exif: ExifBag | null | undefined): PhotoGps | null {
  if (!isBag(exif)) return null;
  const latitude = coordinateFrom(exif, 'Latitude');
  const longitude = coordinateFrom(exif, 'Longitude');
  return latitude !== null && longitude !== null &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    ? { latitude, longitude }
    : null;
}
