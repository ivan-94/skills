import Foundation

enum ItemType: String, Codable, CaseIterable, Identifiable {
    case issue
    case pullRequest

    var id: String { rawValue }
    var title: String { self == .issue ? "Issues" : "Pull Requests" }
}

enum LabelAction: String, Codable {
    case add
    case remove
}

struct Workspace: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var gitRoot: String
    var repoSlug: String
    var repoURL: String
}

struct AppConfiguration: Codable {
    var version: Int = 1
    var lastUsedWorkspaceID: String?
    var runners: [RunnerConfiguration] = RunnerConfiguration.defaults
    var terminal: TerminalConfiguration = .init()
    var workspaces: [Workspace] = []
}

struct WorkflowConfiguration: Codable {
    var version: Int = 1
    var boards: [BoardConfiguration] = BoardConfiguration.defaults
}

struct BoardConfiguration: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var itemType: ItemType
    var lanes: [LaneConfiguration]

    static let defaults: [BoardConfiguration] = [
        BoardConfiguration(
            id: "issues",
            title: "Issues",
            itemType: .issue,
            lanes: [
                LaneConfiguration(
                    id: "inbox",
                    title: "Inbox",
                    query: LaneQuery(labelsNone: ["needs-info", "ready-for-agent", "ready-for-human", "wontfix"]),
                    actions: [ActionConfiguration(id: "triage", title: "分诊", promptTemplate: "/triage 对以下 Issue 进行分诊：{{refs}}")]
                ),
                LaneConfiguration(id: "needs-info", title: "Needs Info", query: LaneQuery(labelsAll: ["needs-info"]), actions: []),
                LaneConfiguration(
                    id: "ready-for-agent",
                    title: "Ready For Agent",
                    query: LaneQuery(labelsAll: ["ready-for-agent"]),
                    actions: [
                        ActionConfiguration(id: "deliver", title: "Deliver", promptTemplate: "/deliver-issue {{refs}}"),
                        ActionConfiguration(id: "tdd", title: "TDD", promptTemplate: "/tdd {{ref}}")
                    ]
                ),
                LaneConfiguration(id: "ready-for-human", title: "Ready For Human", query: LaneQuery(labelsAll: ["ready-for-human"]), actions: [])
            ]
        ),
        BoardConfiguration(
            id: "pull-requests",
            title: "Pull Requests",
            itemType: .pullRequest,
            lanes: [
                LaneConfiguration(id: "initial", title: "Initial", query: LaneQuery(labelsNone: ["HAT-Ready", "HAT-Needs-Human", "HAT-Blocked", "HAT-Passed"]), actions: []),
                LaneConfiguration(id: "hat-ready", title: "HAT Ready", query: LaneQuery(labelsAll: ["HAT-Ready"]), actions: [ActionConfiguration(id: "hat-dispatch", title: "执行 HAT", promptTemplate: "/hat-dispatch {{refs}}")]),
                LaneConfiguration(id: "hat-needs-human", title: "HAT Needs Human", query: LaneQuery(labelsAll: ["HAT-Needs-Human"]), actions: []),
                LaneConfiguration(id: "hat-blocked", title: "HAT Blocked", query: LaneQuery(labelsAll: ["HAT-Blocked"]), actions: []),
                LaneConfiguration(id: "hat-passed", title: "HAT Passed", query: LaneQuery(labelsAll: ["HAT-Passed"]), actions: [])
            ]
        )
    ]
}

struct LaneConfiguration: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var query: LaneQuery
    var actions: [ActionConfiguration]
}

struct LaneQuery: Codable, Hashable {
    var labelsAll: [String]? = nil
    var labelsAny: [String]? = nil
    var labelsNone: [String]? = nil
    var includeUnlabeled: Bool? = nil
    var noAssignee: Bool? = nil
    var isDraft: Bool? = nil
    var reviewDecisionAny: [String]? = nil
}

struct ActionConfiguration: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var promptTemplate: String
    var runner: String? = nil
    var confirmBeforeRun: Bool? = nil
}

struct RunnerConfiguration: Codable, Identifiable, Hashable {
    var id: String
    var label: String
    var command: String
    var arguments: [String]
    var permissionModes: [PermissionMode] = []
    var defaultPermissionMode: String = "default"

    static let defaults: [RunnerConfiguration] = [
        RunnerConfiguration(
            id: "codex",
            label: "Codex",
            command: "codex",
            arguments: ["{{prompt}}"],
            permissionModes: [
                PermissionMode(id: "default", label: "Default", arguments: [], detail: "Use Codex defaults."),
                PermissionMode(id: "auto-review", label: "Auto Review", arguments: ["--ask-for-approval", "on-request", "--sandbox", "workspace-write"], detail: "Ask for approval when needed."),
                PermissionMode(id: "full-access", label: "All Permissions", arguments: ["--dangerously-bypass-approvals-and-sandbox"], detail: "Bypass approvals and sandbox.")
            ]
        ),
        RunnerConfiguration(
            id: "claude",
            label: "Claude Code",
            command: "claude",
            arguments: ["{{prompt}}"],
            permissionModes: [
                PermissionMode(id: "default", label: "Default", arguments: ["--permission-mode", "default"], detail: "Reads run without prompts; writes and commands ask for approval."),
                PermissionMode(id: "auto-review", label: "Auto Review", arguments: ["--permission-mode", "auto"], detail: "Claude Code auto mode routes actions through its safety classifier."),
                PermissionMode(id: "full-access", label: "All Permissions", arguments: ["--permission-mode", "bypassPermissions"], detail: "Bypass permission checks. Use only in an isolated workspace.")
            ]
        )
    ]
}

struct PermissionMode: Codable, Identifiable, Hashable {
    var id: String
    var label: String
    var arguments: [String]
    var detail: String
}

struct TerminalConfiguration: Codable, Hashable {
    var appIdentifier: String = "com.apple.Terminal"
    var openMode: TerminalOpenMode = .window
}

enum TerminalOpenMode: String, Codable, CaseIterable, Identifiable {
    case window
    case tab

    var id: String { rawValue }
}

struct BoardItem: Identifiable, Hashable {
    var id: String { "\(itemType.rawValue):\(number)" }
    var itemType: ItemType
    var number: Int
    var ref: String { "#\(number)" }
    var title: String
    var url: String
    var labels: [String]
    var assignees: [String]
    var author: String
    var updatedAt: Date?
    var isDraft: Bool
    var headRefName: String?
    var baseRefName: String?
    var reviewDecision: String?
}

struct RenderedLane: Identifiable {
    var id: String { configuration.id }
    var configuration: LaneConfiguration
    var items: [BoardItem]
}

struct RenderedBoard: Identifiable {
    var id: String { configuration.id }
    var configuration: BoardConfiguration
    var lanes: [RenderedLane]
}

struct RunDraft: Identifiable {
    var id = UUID()
    var board: BoardConfiguration
    var lane: LaneConfiguration
    var action: ActionConfiguration
    var items: [BoardItem]
    var prompt: String
    var runnerID: String
    var permissionModeID: String
    var splitRuns: Bool = false
}

struct RunRecord: Identifiable, Codable, Hashable {
    var id: String
    var itemIDs: [String]
    var statusPath: String
    var scriptPath: String
    var status: RunExecutionStatus = .pending
}

struct BoardMessage: Identifiable, Hashable {
    var id = UUID()
    var title: String
    var detail: String
    var createdAt = Date()
}

enum RunExecutionStatus: String, Codable, Hashable {
    case pending
    case running
    case exited
    case unknown
}

struct TerminalPreset: Identifiable, Hashable {
    var id: String
    var label: String
    var appName: String
    var bundleID: String
    var supportsTabs: Bool
    var detected: Bool

    static func detectAll() -> [TerminalPreset] {
        [
            TerminalPreset(id: "system", label: "System Terminal", appName: "Terminal", bundleID: "com.apple.Terminal", supportsTabs: true, detected: true),
            TerminalPreset(id: "iterm", label: "iTerm2", appName: "iTerm", bundleID: "com.googlecode.iterm2", supportsTabs: true, detected: appExists("iTerm") || appExists("iTerm2")),
            TerminalPreset(id: "warp", label: "Warp", appName: "Warp", bundleID: "dev.warp.Warp-Stable", supportsTabs: false, detected: appExists("Warp")),
            TerminalPreset(id: "ghostty", label: "Ghostty", appName: "Ghostty", bundleID: "com.mitchellh.ghostty", supportsTabs: false, detected: appExists("Ghostty"))
        ]
    }

    private static func appExists(_ name: String) -> Bool {
        let paths = [
            "/Applications/\(name).app",
            FileManager.default.homeDirectoryForCurrentUser.appending(path: "Applications/\(name).app").path
        ]
        return paths.contains { FileManager.default.fileExists(atPath: $0) }
    }
}
