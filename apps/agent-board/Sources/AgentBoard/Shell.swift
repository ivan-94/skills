import AppKit
import Foundation

struct Shell {
    struct Result {
        var stdout: String
        var stderr: String
        var exitCode: Int32
    }

    static func run(_ command: [String], cwd: String? = nil) async throws -> Result {
        try await withCheckedThrowingContinuation { continuation in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: command[0])
            process.arguments = Array(command.dropFirst())
            if let cwd {
                process.currentDirectoryURL = URL(fileURLWithPath: cwd)
            }

            let stdout = Pipe()
            let stderr = Pipe()
            process.standardOutput = stdout
            process.standardError = stderr

            process.terminationHandler = { process in
                let out = String(data: stdout.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                let err = String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                continuation.resume(returning: Result(stdout: out.trimmingCharacters(in: .whitespacesAndNewlines), stderr: err.trimmingCharacters(in: .whitespacesAndNewlines), exitCode: process.terminationStatus))
            }

            do {
                try process.run()
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    static func require(_ command: [String], cwd: String? = nil) async throws -> String {
        let result = try await run(command, cwd: cwd)
        if result.exitCode != 0 {
            throw AgentBoardError.commandFailed(command.joined(separator: " "), result.stderr.isEmpty ? result.stdout : result.stderr)
        }
        return result.stdout
    }
}

enum AgentBoardError: LocalizedError {
    case commandFailed(String, String)
    case noGitHubRemote
    case invalidWorkspacePath
    case missingWorkspace

    var errorDescription: String? {
        switch self {
        case let .commandFailed(command, output):
            "\(command) failed: \(output)"
        case .noGitHubRemote:
            "No GitHub remote found in this git repository."
        case .invalidWorkspacePath:
            "Choose a local Git repository with a GitHub remote."
        case .missingWorkspace:
            "Select a workspace first."
        }
    }
}

struct GitHubRemote {
    var name: String
    var url: String
    var slug: String
}

func parseGitHubRemote(_ url: String) -> String? {
    if url.hasPrefix("git@github.com:") {
        let rest = String(url.dropFirst("git@github.com:".count))
        return rest.replacingOccurrences(of: ".git", with: "")
    }
    if url.hasPrefix("https://github.com/") {
        let rest = String(url.dropFirst("https://github.com/".count))
        return rest.replacingOccurrences(of: ".git", with: "")
    }
    return nil
}

func sha1Hex(_ value: String) -> String {
    // SwiftPM has no CryptoKit dependency on all toolchains used by agents.
    // Use the platform `shasum` command for a stable workspace identifier.
    let process = Process()
    let input = Pipe()
    let output = Pipe()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/shasum")
    process.arguments = ["-a", "1"]
    process.standardInput = input
    process.standardOutput = output
    try? process.run()
    input.fileHandleForWriting.write(Data(value.utf8))
    input.fileHandleForWriting.closeFile()
    process.waitUntilExit()
    let digest = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? UUID().uuidString
    return String(digest.split(separator: " ").first ?? Substring(UUID().uuidString)).prefix(16).description
}
