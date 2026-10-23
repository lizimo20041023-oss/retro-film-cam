import Foundation

let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
let fixtures = try JSONSerialization.jsonObject(with: data) as! [[String: Any]]
for fixture in fixtures {
  let p = fixture["params"] as! [String: Any]
  var look = FilmPixelEngine.Look()
  look.intensity = p["intensity"] as! Double
  look.gamma = p["gamma"] as! Double
  look.vignette = p["vignette"] as! Double
  look.grain = p["grain"] as! Double
  look.halation = p["halation"] as! Double
  look.mono = p["mono"] as! Bool
  look.seed = UInt32(p["seed"] as! Int)
  look.overlayOpacity = p["overlayOpacity"] as! Double
  var pixels = (fixture["input"] as! [Int]).map { UInt8($0) }
  let expected = fixture["expected"] as! [Int]
  let overlay = (fixture["overlay"] as? [Int])?.map { UInt8($0) }
  let lut = (fixture["lut"] as! [Int]).map { UInt8($0) }
  try FilmPixelEngine.render(&pixels, width: fixture["width"] as! Int,
    height: fixture["height"] as! Int, lut: lut, size: fixture["size"] as! Int, look: look, overlay: overlay)
  let errors = zip(pixels, expected).map { abs(Int($0.0) - $0.1) }
  // Float32 staging / CoreGraphics quantization can differ by one byte, never a hue shift.
  guard errors.max()! <= 1, errors.reduce(0, +) < pixels.count / 100 + 1 else {
    fatalError("Swift/JS parity failed: \(fixture["id"]!) max=\(errors.max()!) total=\(errors.reduce(0, +))")
  }
  print("PASS \(fixture["id"]!) max delta \(errors.max()!)")
}
// Release benchmark uses a real cached stock LUT, same 1024x768 budget as the app.
let first = fixtures[0]
let lut = (first["lut"] as! [Int]).map { UInt8($0) }
var frame = [UInt8](repeating: 140, count: 1024 * 768 * 4)
var look = FilmPixelEngine.Look()
look.grain = 2; look.vignette = 0.2; look.halation = 0.012; look.intensity = 0.8
let start = Date()
try FilmPixelEngine.render(&frame, width: 1024, height: 768, lut: lut, size: 33, look: look)
print("Native 1024x768 single-pass pixel benchmark: \(Int(Date().timeIntervalSince(start) * 1000))ms (CI macOS, not iPhone)")
print("Native parity: \(fixtures.count) cases passed")
