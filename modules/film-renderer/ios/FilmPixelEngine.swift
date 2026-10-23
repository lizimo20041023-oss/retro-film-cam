import Foundation

/// Pure pixel engine. Shares Q8/Q16 interpolation and seeded monochrome grain
/// with filmRender.ts. No UIKit, bridge calls, or work on the main / JS thread.
enum FilmPixelEngine {
  struct Look {
    var intensity: Double = 1
    var gamma: Double = 1
    var vignette: Double = 0
    var grain: Double = 0
    var halation: Double = 0
    var mono: Bool = false
    var seed: UInt32 = 0
    var overlayOpacity: Double = 0.5
  }

  @inline(__always) static func byte(_ value: Int) -> UInt8 {
    UInt8(max(0, min(255, value)))
  }
  @inline(__always) static func lerp(_ a: Int, _ b: Int, _ f: Int) -> Int {
    (a * (256 - f) + b * f + 128) >> 8
  }
  static func noise(_ x: Int, _ y: Int, _ seed: UInt32) -> Float {
    var h = (UInt32(truncatingIfNeeded: x) &* 0x27d4eb2d)
      ^ (UInt32(truncatingIfNeeded: y) &* 0x165667b1) ^ seed
    h ^= h >> 15
    h = h &* 0x2545f491
    h ^= h >> 13
    h = h &* 0x27d4eb2b
    h ^= h >> 16
    return Float(Double(h) / Double(UInt32.max) * 2 - 1)
  }

  static func render(_ rgba: inout [UInt8], width: Int, height: Int,
                     lut: [UInt8], size: Int, look: Look, overlay: [UInt8]? = nil) throws {
    guard width > 0, height > 0, width <= 8192, height <= 8192,
          rgba.count == width * height * 4, size >= 2, size <= 65,
          lut.count == size * size * size * 3,
          overlay == nil || overlay?.count == rgba.count else {
      throw NSError(domain: "FilmRenderer", code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Invalid film pixel buffers"])
    }
    var lo = [Int](repeating: 0, count: 256)
    var hi = lo
    var frac = lo
    var gamma = [UInt8](repeating: 0, count: 256)
    var weights = [Float](repeating: 0, count: 256)
    for v in 0..<256 {
      let p = Double(v * (size - 1)) / 255
      lo[v] = Int(p)
      hi[v] = min(size - 1, lo[v] + 1)
      frac[v] = min(255, Int(((p - Double(lo[v])) * 256).rounded()))
      gamma[v] = byte(Int((255 * pow(Double(v) / 255, look.gamma)).rounded()))
      let y = Double(v) / 255
      weights[v] = Float((4 * y * (1 - y) + 0.15) / 1.15)
    }
    let intensityQ = Int((min(1, max(0.35, look.intensity)) * 65536).rounded())
    let overlayQ = Int((max(0, min(1, look.overlayOpacity)) * 256).rounded())
    let plane = size * size
    var vignette = [Int](repeating: 65536, count: 257)
    if look.vignette > 0 {
      for i in 0...256 {
        let radius = sqrt(Double(i) / 256)
        let t = max(0, (radius - 0.55) / 0.45)
        vignette[i] = Int((pow(2, -look.vignette * t * t * (3 - 2 * t)) * 65536).rounded())
      }
    }
    func radii(_ n: Int) -> [Int] {
      let c = Double(n - 1) / 2
      return (0..<n).map { i in
        guard c > 0 else { return 0 }
        let d = (Double(i) - c) / c
        return min(128, Int((d * d * 128).rounded()))
      }
    }
    let rx = radii(width), ry = radii(height)
    let mw = (width + 1) / 2, mh = (height + 1) / 2
    var mask = look.halation > 0 ? [Float](repeating: 0, count: mw * mh) : []
    var hasHighlights = false
    var clusters = [Float](repeating: 0, count: mw)
    var dithers = clusters
    for y in 0..<height {
      if look.grain > 0 && y & 1 == 0 {
        for x in 0..<mw {
          clusters[x] = noise(x, y >> 1, look.seed)
          dithers[x] = Float((Double(noise(x, y >> 1, look.seed ^ 0x9e3779b9)) + 1) * 0.5)
        }
      }
      for x in 0..<width {
        let o = (y * width + x) * 4
        var r = Int(rgba[o]), g = Int(rgba[o + 1]), b = Int(rgba[o + 2])
        if let overlay {
          r = lerp(r, Int(overlay[o]), overlayQ)
          g = lerp(g, Int(overlay[o + 1]), overlayQ)
          b = lerp(b, Int(overlay[o + 2]), overlayQ)
        }
        r = Int(gamma[r]); g = Int(gamma[g]); b = Int(gamma[b])
        let base = lo[r] * plane + lo[g] * size + lo[b]
        let dr = (hi[r] - lo[r]) * plane
        let dg = (hi[g] - lo[g]) * size
        let db = hi[b] - lo[b]
        let fr = frac[r], fg = frac[g], fb = frac[b]
        @inline(__always) func sample(_ c: Int) -> Int {
          let a = lerp(Int(lut[base * 3 + c]), Int(lut[(base + db) * 3 + c]), fb)
          let b = lerp(Int(lut[(base + dg) * 3 + c]), Int(lut[(base + dg + db) * 3 + c]), fb)
          let d = lerp(Int(lut[(base + dr) * 3 + c]), Int(lut[(base + dr + db) * 3 + c]), fb)
          let e = lerp(Int(lut[(base + dr + dg) * 3 + c]), Int(lut[(base + dr + dg + db) * 3 + c]), fb)
          return lerp(lerp(a, b, fg), lerp(d, e, fg), fr)
        }
        var red = r + (((sample(0) - r) * intensityQ + 32768) >> 16)
        var green = g + (((sample(1) - g) * intensityQ + 32768) >> 16)
        var blue = b + (((sample(2) - b) * intensityQ + 32768) >> 16)
        if look.mono {
          let luma = (red * 77 + green * 150 + blue * 29) >> 8
          red = luma; green = luma; blue = luma
        }
        let mul = vignette[rx[x] + ry[y]]
        red = (red * mul + 32768) >> 16
        green = (green * mul + 32768) >> 16
        blue = (blue * mul + 32768) >> 16
        let luma = (red * 77 + green * 150 + blue * 29) >> 8
        if !mask.isEmpty && luma >= 224 {
          hasHighlights = true
          let m = (y >> 1) * mw + (x >> 1)
          mask[m] = Float(Double(mask[m]) + Double(luma - 224) / 31)
        }
        if look.grain > 0 {
          let amount = Double(clusters[x >> 1]) * Double(weights[luma]) * look.grain
          let magnitude = abs(amount)
          let whole = Int(magnitude)
          let quantized = whole + (Double(dithers[x >> 1]) < magnitude - Double(whole) ? 1 : 0)
          let delta = amount < 0 ? -quantized : quantized
          red += delta; green += delta; blue += delta
        }
        rgba[o] = byte(red); rgba[o + 1] = byte(green); rgba[o + 2] = byte(blue)
      }
    }
    if hasHighlights {
      let raw = [0.02942, 0.08333, 0.11794, 0.08333, 0.02942]
      let sum = raw.reduce(0, +)
      let kernel = raw.map { Float($0 / sum) }
      var tmp = [Float](repeating: 0, count: mask.count)
      for y in 0..<mh {
        for x in 0..<mw {
          var total: Double = 0
          for k in 0..<5 where x + k - 2 >= 0 && x + k - 2 < mw {
            total += Double(mask[y * mw + x + k - 2]) * Double(kernel[k])
          }
          tmp[y * mw + x] = Float(total)
        }
      }
      for y in 0..<mh {
        for x in 0..<mw {
          var total: Double = 0
          for k in 0..<5 where y + k - 2 >= 0 && y + k - 2 < mh {
            total += Double(tmp[(y + k - 2) * mw + x]) * Double(kernel[k])
          }
          let i = y * mw + x
          mask[i] = Float(max(0, (total - Double(mask[i])) * 0.25))
        }
      }
      for y in 0..<height {
        for x in 0..<width {
          let o = (y * width + x) * 4
          let add = Int(Double(mask[(y >> 1) * mw + (x >> 1)]) * look.halation * 255)
          rgba[o] = byte(Int(rgba[o]) + add)
        }
      }
    }
  }
}
