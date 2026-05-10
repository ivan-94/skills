import Foundation

@MainActor
final class AgentBoardStore: ObservableObject {
    @Published var appConfiguration = AppConfiguration()
    @Published var workflow = WorkflowConfiguration()
    @Published var activeWorkspace: Workspace?
    @Published var repositoryLabels: [String] = []
    @Published var items: [BoardItem] = []
    @Published var renderedBoards: [RenderedBoard] = []
    @Published var isLoading = false
    @Published var message: String?
    @Published var selectedIDs: Set<BoardItem.ID> = []
    @Published var runDraft: RunDraft?

    private let github = GitHubService()
    private let fileManager = FileManager.default

    var appHome: URL {
        if let override = ProcessInfo.processInfo.environment["AGENT_BOARD_HOME"] {
            return URL(fileURLWithPath: override)
        }
        return fileManager.homeDirectoryForCurrentUser.appending(path: ".agent-board")
    }

    var configurationURL: URL { appHome.appending(path: "config.json") }
    var workspacesURL: URL { appHome.appending(path: "workspaces") }
    var runsURL: URL { appHome.appending(path: "runs") }

    init() {
        Task {
            await load()
        }
    }

    func load() async {
        do {
            try fileManager.createDirectory(at: appHome, withIntermediateDirectories: true)
            if fileManager.fileExists(atPath: configurationURL.path) {
                let data = try Data(contentsOf: configurationURL)
                appConfiguration = try JSONDecoder().decode(AppConfiguration.self, from: data)
            } else {
                try saveAppConfiguration()
            }

            activeWorkspace = appConfiguration.workspaces.first { $0.id == appConfiguration.lastUsedWorkspaceID } ?? appConfiguration.workspaces.first
            try loadWorkflow()
            await refresh()
        } catch {
            message = error.localizedDescription
        }
    }

    func addWorkspace(path: String, displayName: String? = nil) async {
        do {
            let gitRoot = try await Shell.require(["/usr/bin/git", "rev-parse", "--show-toplevel"], cwd: path)
            let remotes = try await Shell.require(["/usr/bin/git", "remote", "-v"], cwd: gitRoot)
            guard let remote = remotes.split(separator: "\n").compactMap({ line -> GitHubRemote? in
                let parts = line.split(separator: " ")
                guard parts.count >= 2, let slug = parseGitHubRemote(String(parts[1])) else { return nil }
                return GitHubRemote(name: String(parts[0]), url: String(parts[1]), slug: slug)
            }).first else {
                throw AgentBoardError.noGitHubRemote
            }

            let repo = try await github.fetchRepository(slug: remote.slug)
            let id = sha1Hex(gitRoot)
            let workspace = Workspace(
                id: id,
                name: displayName?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? repo.nameWithOwner.split(separator: "/").last.map(String.init) ?? URL(fileURLWithPath: gitRoot).lastPathComponent,
                gitRoot: gitRoot,
                repoSlug: remote.slug,
                repoURL: repo.url
            )
            appConfiguration.workspaces.removeAll { $0.id == workspace.id }
            appConfiguration.workspaces.insert(workspace, at: 0)
            appConfiguration.lastUsedWorkspaceID = workspace.id
            activeWorkspace = workspace
            try saveAppConfiguration()
            try saveWorkflow()
            await refresh()
        } catch {
            message = error.localizedDescription
        }
    }

    func selectWorkspace(_ workspace: Workspace) {
        activeWorkspace = workspace
        appConfiguration.lastUsedWorkspaceID = workspace.id
        selectedIDs = []
        do {
            try saveAppConfiguration()
            try loadWorkflow()
            Task { await refresh() }
        } catch {
            message = error.localizedDescription
        }
    }

    func refresh() async {
        guard let activeWorkspace else {
            renderedBoards = []
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let repository = try await github.fetchRepository(slug: activeWorkspace.repoSlug)
            async let issues = github.fetchIssues(slug: activeWorkspace.repoSlug)
            async let pullRequests = github.fetchPullRequests(slug: activeWorkspace.repoSlug)
            repositoryLabels = repository.labels.map(\.name)
            items = try await issues + pullRequests
            renderBoards()
        } catch {
            message = error.localizedDescription
        }
    }

    func renderBoards() {
        renderedBoards = workflow.boards.map { board in
            let boardItems = items.filter { $0.itemType == board.itemType }
            let lanes = board.lanes.map { lane in
                RenderedLane(configuration: lane, items: boardItems.filter { matches($0, query: lane.query) })
            }
            return RenderedBoard(configuration: board, lanes: lanes)
        }
    }

    func openRunDraft(board: BoardConfiguration, lane: LaneConfiguration, action: ActionConfiguration, items: [BoardItem]) {
        guard !items.isEmpty else { return }
        let runner = appConfiguration.runners.first { $0.id == action.runner } ?? appConfiguration.runners.first ?? RunnerConfiguration.defaults[0]
        let mode = runner.defaultPermissionMode
        runDraft = RunDraft(
            board: board,
            lane: lane,
            action: action,
            items: items,
            prompt: renderPrompt(action.promptTemplate, items: items),
            runnerID: runner.id,
            permissionModeID: mode
        )
    }

    func run(_ draft: RunDraft) async {
        do {
            guard let workspace = activeWorkspace else { throw AgentBoardError.missingWorkspace }
            let runItems = draft.splitRuns ? draft.items.map { [$0] } : [draft.items]
            for items in runItems {
                let prompt = draft.splitRuns ? renderPrompt(draft.action.promptTemplate, items: items) : draft.prompt
                try await createRun(workspace: workspace, draft: draft, items: items, prompt: prompt)
            }
            runDraft = nil
            message = draft.splitRuns ? "Started \(draft.items.count) runs." : "Run started."
        } catch {
            message = error.localizedDescription
        }
    }

    func saveSettings() {
        do {
            try saveAppConfiguration()
            try saveWorkflow()
            renderBoards()
        } catch {
            message = error.localizedDescription
        }
    }

    private func matches(_ item: BoardItem, query: LaneQuery) -> Bool {
        let labels = Set(item.labels)
        if let labelsAll = query.labelsAll, !Set(labelsAll).isSubset(of: labels) { return false }
        if let labelsAny = query.labelsAny, !labelsAny.isEmpty, labels.isDisjoint(with: Set(labelsAny)) { return false }
        if let labelsNone = query.labelsNone, !labels.isDisjoint(with: Set(labelsNone)) { return false }
        if query.includeUnlabeled == true && !item.labels.isEmpty && (query.labelsAll?.isEmpty ?? true) && (query.labelsAny?.isEmpty ?? true) {
            return false
        }
        if query.noAssignee == true && !item.assignees.isEmpty { return false }
        if let isDraft = query.isDraft, item.isDraft != isDraft { return false }
        if let decisions = query.reviewDecisionAny, !decisions.isEmpty, !decisions.contains(item.reviewDecision ?? "") { return false }
        return true
    }

    private func renderPrompt(_ template: String, items: [BoardItem]) -> String {
        let refs = items.map(\.ref)
        return template
            .replacingOccurrences(of: "{{refs}}", with: refs.joined(separator: " "))
            .replacingOccurrences(of: "{{ref}}", with: refs.first ?? "")
            .replacingOccurrences(of: "{{count}}", with: String(items.count))
            .replacingOccurrences(of: "{{itemsJson}}", with: (try? String(data: JSONEncoder().encode(refs), encoding: .utf8)) ?? "[]")
    }

    private func createRun(workspace: Workspace, draft: RunDraft, items: [BoardItem], prompt: String) async throws {
        guard let runner = appConfiguration.runners.first(where: { $0.id == draft.runnerID }) else {
            throw AgentBoardError.commandFailed("runner", "Runner not found")
        }
        let mode = runner.permissionModes.first { $0.id == draft.permissionModeID }
        let runID = "\(timestamp())-\(draft.action.id)-\(items.map(\.number).map(String.init).joined(separator: "-"))"
        let runDir = runsURL.appending(path: workspace.id)
        try fileManager.createDirectory(at: runDir, withIntermediateDirectories: true)
        let scriptURL = runDir.appending(path: "\(runID).sh")
        let arguments = (mode?.arguments ?? []) + runner.arguments
        let renderedArguments = arguments.map { $0.replacingOccurrences(of: "{{prompt}}", with: prompt).shellQuoted }
        let script = """
        #!/bin/bash
        set -euo pipefail
        cd \(workspace.gitRoot.shellQuoted)
        \(runner.command.shellQuoted) \(renderedArguments.joined(separator: " "))
        """
        try script.write(to: scriptURL, atomically: true, encoding: .utf8)
        try fileManager.setAttributes([.posixPermissions: 0o755], ofItemAtPath: scriptURL.path)
        _ = try await Shell.require(["/usr/bin/open", "-b", appConfiguration.terminal.appIdentifier, scriptURL.path])
    }

    private func loadWorkflow() throws {
        guard let activeWorkspace else {
            workflow = WorkflowConfiguration()
            return
        }
        let url = workflowURL(for: activeWorkspace.id)
        if fileManager.fileExists(atPath: url.path) {
            workflow = try JSONDecoder().decode(WorkflowConfiguration.self, from: Data(contentsOf: url))
        } else {
            workflow = WorkflowConfiguration()
            try saveWorkflow()
        }
    }

    private func saveAppConfiguration() throws {
        try fileManager.createDirectory(at: appHome, withIntermediateDirectories: true)
        let data = try JSONEncoder.pretty.encode(appConfiguration)
        try data.write(to: configurationURL)
    }

    private func saveWorkflow() throws {
        guard let activeWorkspace else { return }
        let url = workflowURL(for: activeWorkspace.id)
        try fileManager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder.pretty.encode(workflow).write(to: url)
    }

    private func workflowURL(for workspaceID: String) -> URL {
        workspacesURL.appending(path: workspaceID).appending(path: "workflow.json")
    }

    private func timestamp() -> String {
        ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "").replacingOccurrences(of: ".", with: "")
    }
}

extension JSONEncoder {
    static var pretty: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }
}

extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }

    var shellQuoted: String {
        if allSatisfy({ $0.isLetter || $0.isNumber || "_-./:@%+=".contains($0) }) {
            return self
        }
        return "'" + replacingOccurrences(of: "'", with: "'\\''") + "'"
    }
}
