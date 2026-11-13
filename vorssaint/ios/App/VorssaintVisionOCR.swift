import Foundation
import UIKit
import Vision

/**
 * Vorssaint OS — Apple Vision Framework On-Device OCR Engine
 * Extracts text, code, and symbols from photos, screenshots, and camera input on iOS & iPadOS.
 * Zero network requests. 100% on-device neural processing.
 */
@available(iOS 13.0, *)
class VorssaintVisionOCR {

    enum OCRError: Error {
        case invalidImage
        case recognitionFailed(String)
    }

    static func extractText(from image: UIImage, recognitionLevel: VNRequestTextRecognitionLevel = .accurate) async throws -> String {
        guard let cgImage = image.cgImage else {
            throw OCRError.invalidImage
        }

        return try await withCheckedThrowingContinuation { continuation in
            let request = VNRecognizeTextRequest { request, error in
                if let error = error {
                    continuation.resume(throwing: OCRError.recognitionFailed(error.localizedDescription))
                    return
                }

                guard let observations = request.results as? [VNRecognizedTextObservation] else {
                    continuation.resume(returning: "")
                    return
                }

                let lines = observations.compactMap { observation in
                    observation.topCandidates(1).first?.string
                }

                continuation.resume(returning: lines.joined(separator: "\n"))
            }

            request.recognitionLevel = recognitionLevel
            request.usesLanguageCorrection = true

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            do {
                try handler.perform([request])
            } catch {
                continuation.resume(throwing: OCRError.recognitionFailed(error.localizedDescription))
            }
        }
    }
}
