import ExpoModulesCore
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

public class FilmRendererModule: Module {
  private let renderQueue = DispatchQueue(label: "com.fretrocam.film-renderer", qos: .userInitiated)
  private var luts: [String: [UInt8]] = [:]

  public func definition() -> ModuleDefinition {
    Name("FilmRenderer")
    AsyncFunction("render") { (uri: String, key: String, lutBase64: String,
                               size: Int, overlayUri: String?, values: [String: Double]) -> [String: Any] in
      try autoreleasepool {
        if self.luts[key] == nil {
          guard let data = Data(base64Encoded: lutBase64), data.count == size * size * size * 3 else {
            throw self.failure("Invalid LUT data")
          }
          self.luts[key] = Array(data)
        }
        guard let lut = self.luts[key] else { throw self.failure("LUT unavailable") }
        let source = try self.readPixels(uri)
        var pixels = source.bytes
        var overlay: [UInt8]?
        if let overlayUri, !overlayUri.isEmpty {
          let first = try self.readPixels(overlayUri)
          guard first.width == source.width, first.height == source.height else {
            throw self.failure("Double exposure dimensions differ")
          }
          overlay = first.bytes
        }
        var look = FilmPixelEngine.Look()
        look.intensity = values["intensity"] ?? 1
        look.gamma = values["gamma"] ?? 1
        look.vignette = values["vignette"] ?? 0
        look.grain = values["grain"] ?? 0
        look.halation = values["halation"] ?? 0
        look.mono = values["mono"] == 1
        look.seed = UInt32(truncatingIfNeeded: Int64(values["seed"] ?? 0))
        look.overlayOpacity = values["overlayOpacity"] ?? 0.5
        guard [look.intensity, look.gamma, look.vignette, look.grain, look.halation,
               look.overlayOpacity].allSatisfy({ $0.isFinite }),
              look.gamma > 0, look.gamma < 4, look.grain >= 0, look.grain <= 13,
              look.vignette >= 0, look.vignette <= 1, look.halation >= 0, look.halation <= 1 else {
          throw self.failure("Invalid film parameters")
        }
        try FilmPixelEngine.render(&pixels, width: source.width, height: source.height,
                                   lut: lut, size: size, look: look, overlay: overlay)
        let data = Data(pixels)
        guard let provider = CGDataProvider(data: data as CFData),
              let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
              let image = CGImage(width: source.width, height: source.height,
                                  bitsPerComponent: 8, bitsPerPixel: 32,
                                  bytesPerRow: source.width * 4, space: colorSpace,
                                  bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
                                  provider: provider, decode: nil, shouldInterpolate: true,
                                  intent: .defaultIntent) else {
          throw self.failure("Cannot create processed image")
        }
        let output = FileManager.default.temporaryDirectory
          .appendingPathComponent("film-native-\(UUID().uuidString).png")
        guard let destination = CGImageDestinationCreateWithURL(output as CFURL,
                UTType.png.identifier as CFString, 1, nil) else {
          throw self.failure("Cannot open processed image")
        }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else {
          try? FileManager.default.removeItem(at: output)
          throw self.failure("Cannot write processed image")
        }
        return ["uri": output.absoluteString, "width": source.width, "height": source.height]
      }
    }.runOnQueue(renderQueue)
  }

  private func failure(_ message: String) -> NSError {
    NSError(domain: "FilmRenderer", code: 2, userInfo: [NSLocalizedDescriptionKey: message])
  }

  private func readPixels(_ uri: String) throws -> (bytes: [UInt8], width: Int, height: Int) {
    guard let url = URL(string: uri), url.isFileURL,
          let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
          let space = CGColorSpace(name: CGColorSpace.sRGB),
          image.width <= 8192, image.height <= 8192 else {
      throw failure("Cannot decode local film source")
    }
    let width = image.width, height = image.height
    var bytes = [UInt8](repeating: 255, count: width * height * 4)
    let decoded = bytes.withUnsafeMutableBytes { buffer -> Bool in
      guard let context = CGContext(data: buffer.baseAddress, width: width, height: height,
        bitsPerComponent: 8, bytesPerRow: width * 4, space: space,
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return false }
      context.draw(image, in: CGRect(x: 0, y: 0, width: CGFloat(width), height: CGFloat(height)))
      return true
    }
    guard decoded else { throw failure("Cannot allocate film source buffer") }
    return (bytes, width, height)
  }
}
