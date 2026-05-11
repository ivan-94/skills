import Foundation

@MainActor
final class AgentBoardStore: ObservableObject {
    @Published var appConfiguration = AppConfiguration()
    @Published var workflow = WorkflowConfiguration()
    @Published var activeWorkspace: Workspace?
    @Published var repositoryLabels: [String] = []
    @Published var missingWorkflowLabels: [String] = []
    @Published var items: [BoardItem] = []
    @Published var renderedBoards: [RenderedBoard] = []
    @Published var isLoading = false
    @Published var isRefreshingInBackground = false
    @Published var lastRefreshedAt: Date?
    @Published var message: String?
    @Published var messages: [BoardMessage] = []
    @Published var detectedRunnerIDs: Set<String> = []
    @Published var selectedIDs: Set<BoardItem.ID> = []
    @Published var runDraft: RunDraft?
    @Published var runRecords: [RunRecord] = []
    @Published var runningItemIDs: Set<BoardItem.ID> = []
    @Published var labelMutationIDs: Set<String> = []

    private let github = GitHubService()
    private let fileManager = FileManager.default
    private var autoRefreshTask: Task<Void, Never>?

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
            log("load:start appHome=\(appHome.path)")
            try fileManager.createDirectory(at: appHome, withIntermediateDirectories: true)
            if fileManager.fileExists(atPath: configurationURL.path) {
                let data = try Data(contentsOf: configurationURL)
                appConfiguration = try JSONDecoder().decode(AppConfiguration.self, from: data)
            } else {
                try saveAppConfiguration()
            }

            if let initialPath = ProcessInfo.processInfo.environment["AGENT_BOARD_INITIAL_PATH"]?.nilIfEmpty {
                do {
                    let workspace = try await resolveWorkspace(path: initialPath, displayName: nil)
                    upsertWorkspace(workspace)
                    activeWorkspace = workspace
                    try saveAppConfiguration()
                    log("load:initial-workspace path=\(initialPath) repo=\(workspace.repoSlug)")
                } catch {
                    log("load:initial-workspace-skipped path=\(initialPath) error=\(error.localizedDescription)")
                    if appConfiguration.workspaces.isEmpty {
                        postMessage(error.localizedDescription, title: "Workspace discovery failed")
                    }
                }
            }

            activeWorkspace = appConfiguration.workspaces.first { $0.id == appConfiguration.lastUsedWorkspaceID } ?? appConfiguration.workspaces.first
            try loadWorkflow()
            updateMissingLabels()
            await detectRunners()
            await refresh()
            log("load:complete workspace=\(activeWorkspace?.repoSlug ?? "none")")
        } catch {
            log("load:failed \(error.localizedDescription)")
            postMessage(error.localizedDescription, title: "Load failed")
        }
    }

    func addWorkspace(path: String, displayName: String? = nil) async {
        do {
            let workspace = try await resolveWorkspace(path: path, displayName: displayName)
            upsertWorkspace(workspace)
            activeWorkspace = workspace
            try saveAppConfiguration()
            try saveWorkflow()
            await refresh()
        } catch {
            postMessage(error.localizedDescription, title: "Add workspace failed")
        }
    }

    private func resolveWorkspace(path: String, displayName: String?) async throws -> Workspace {
        let gitRoot = try await Shell.require(["/usr/bin/git", "rev-parse", "--show-toplevel"], cwd: path)
        let remotes = try await Shell.require(["/usr/bin/git", "remote", "-v"], cwd: gitRoot)
        guard let remote = remotes.split(separator: "\n").compactMap({ parseGitHubRemoteLine(String($0)) }).first else {
            throw AgentBoardError.noGitHubRemote
        }

        let repo = try await github.fetchRepository(slug: remote.slug)
        let id = sha1Hex(gitRoot)
        return Workspace(
            id: id,
            name: displayName?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? repo.nameWithOwner.split(separator: "/").last.map(String.init) ?? URL(fileURLWithPath: gitRoot).lastPathComponent,
            gitRoot: gitRoot,
            repoSlug: remote.slug,
            repoURL: repo.url
        )
    }

    private func upsertWorkspace(_ workspace: Workspace) {
        appConfiguration.workspaces.removeAll { $0.id == workspace.id }
        appConfiguration.workspaces.insert(workspace, at: 0)
        appConfiguration.lastUsedWorkspaceID = workspace.id
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
            postMessage(error.localizedDescription, title: "Select workspace failed")
        }
    }

    func updateWorkspace(_ workspace: Workspace) {
        guard let index = appConfiguration.workspaces.firstIndex(where: { $0.id == workspace.id }) else { return }
        appConfiguration.workspaces[index] = workspace
        if activeWorkspace?.id == workspace.id {
            activeWorkspace = workspace
        }
        saveSettings()
    }

    func removeWorkspace(_ workspace: Workspace) {
        appConfiguration.workspaces.removeAll { $0.id == workspace.id }
        if activeWorkspace?.id == workspace.id {
            activeWorkspace = appConfiguration.workspaces.first
            appConfiguration.lastUsedWorkspaceID = activeWorkspace?.id
            selectedIDs = []
            try? loadWorkflow()
            Task { await refresh() }
        }
        saveSettings()
    }

    func refresh() async {
        guard let activeWorkspace else {
            renderedBoards = []
            missingWorkflowLabels = []
            return
        }
        let hasExistingData = !items.isEmpty
        if hasExistingData {
            isRefreshingInBackground = true
        } else {
            isLoading = true
        }
        defer {
            isLoading = false
            isRefreshingInBackground = false
        }
        do {
            log("refresh:start repo=\(activeWorkspace.repoSlug) background=\(hasExistingData)")
            let repository = try await github.fetchRepository(slug: activeWorkspace.repoSlug)
            async let issues = github.fetchIssues(slug: activeWorkspace.repoSlug)
            async let pullRequests = github.fetchPullRequests(slug: activeWorkspace.repoSlug)
            repositoryLabels = repository.labels.map(\.name)
            items = try await issues + pullRequests
            renderBoards()
            updateMissingLabels()
            await detectRunners()
            lastRefreshedAt = Date()
            log("refresh:complete items=\(items.count) labels=\(repositoryLabels.count)")
        } catch {
            log("refresh:failed \(error.localizedDescription)")
            postMessage(error.localizedDescription, title: "Refresh failed")
        }
    }

    func startAutoRefreshIfNeeded() {
        guard autoRefreshTask == nil else { return }
        autoRefreshTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(300))
                await self?.refresh()
            }
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
        log("render:boards boards=\(renderedBoards.count)")
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
            guard let runner = appConfiguration.runners.first(where: { $0.id == draft.runnerID }) else {
                throw AgentBoardError.commandFailed("runner", "Runner not found")
            }
            if !detectedRunnerIDs.contains(runner.id) {
                throw AgentBoardError.commandFailed(runner.command, "Runner command is not detected on this machine.")
            }
            let runItems = draft.splitRuns ? draft.items.map { [$0] } : [draft.items]
            log("run:start action=\(draft.action.id) runner=\(runner.id) mode=\(draft.permissionModeID) split=\(draft.splitRuns) groups=\(runItems.count)")
            for items in runItems {
                let prompt = draft.splitRuns ? renderPrompt(draft.action.promptTemplate, items: items) : draft.prompt
                let record = try await createRun(workspace: workspace, draft: draft, items: items, prompt: prompt)
                runRecords.append(record)
                for id in record.itemIDs {
                    runningItemIDs.insert(id)
                }
                watchRun(record)
            }
            runDraft = nil
            postMessage(draft.splitRuns ? "Started \(draft.items.count) runs." : "Run started.", title: "Run started")
        } catch {
            log("run:failed \(error.localizedDescription)")
            postMessage(error.localizedDescription, title: "Run failed")
        }
    }

    func saveSettings() {
        do {
            try saveAppConfiguration()
            try saveWorkflow()
            renderBoards()
            updateMissingLabels()
            Task { await detectRunners() }
        } catch {
            postMessage(error.localizedDescription, title: "Save failed")
        }
    }

    func postMessage(_ detail: String, title: String = "Agent Board") {
        messages.insert(BoardMessage(title: title, detail: detail), at: 0)
        if messages.count > 50 {
            messages.removeLast(messages.count - 50)
        }
    }

    func removeMessage(_ id: BoardMessage.ID) {
        messages.removeAll { $0.id == id }
    }

    func clearMessages() {
        messages.removeAll()
    }

    func addRunner() {
        let id = uniqueID(prefix: "custom-runner", existing: Set(appConfiguration.runners.map(\.id)))
        appConfiguration.runners.append(RunnerConfiguration(
            id: id,
            label: "Custom Runner",
            command: "my-agent-cli",
            arguments: ["{{prompt}}"],
            permissionModes: [
                PermissionMode(id: "default", label: "Default", arguments: [], detail: "Use runner defaults."),
                PermissionMode(id: "auto-review", label: "Auto Review", arguments: [], detail: "Configured by user."),
                PermissionMode(id: "full-access", label: "All Permissions", arguments: [], detail: "Configured by user.")
            ]
        ))
    }

    func removeRunner(id: String) {
        guard appConfiguration.runners.count > 1 else {
            postMessage("Keep at least one runner configured.", title: "Runner")
            return
        }
        appConfiguration.runners.removeAll { $0.id == id }
    }

    func addLane(to boardID: String) {
        guard let boardIndex = workflow.boards.firstIndex(where: { $0.id == boardID }) else { return }
        let id = uniqueID(prefix: "lane", existing: Set(workflow.boards[boardIndex].lanes.map(\.id)))
        workflow.boards[boardIndex].lanes.append(LaneConfiguration(id: id, title: "New Lane", query: LaneQuery(), actions: []))
    }

    func removeLane(boardID: String, laneID: String) {
        guard let boardIndex = workflow.boards.firstIndex(where: { $0.id == boardID }) else { return }
        workflow.boards[boardIndex].lanes.removeAll { $0.id == laneID }
    }

    func addAction(boardID: String, laneID: String) {
        guard let boardIndex = workflow.boards.firstIndex(where: { $0.id == boardID }),
              let laneIndex = workflow.boards[boardIndex].lanes.firstIndex(where: { $0.id == laneID }) else { return }
        let id = uniqueID(prefix: "action", existing: Set(workflow.boards[boardIndex].lanes[laneIndex].actions.map(\.id)))
        workflow.boards[boardIndex].lanes[laneIndex].actions.append(ActionConfiguration(id: id, title: "New Action", promptTemplate: "{{refs}}"))
    }

    func removeAction(boardID: String, laneID: String, actionID: String) {
        guard let boardIndex = workflow.boards.firstIndex(where: { $0.id == boardID }),
              let laneIndex = workflow.boards[boardIndex].lanes.firstIndex(where: { $0.id == laneID }) else { return }
        workflow.boards[boardIndex].lanes[laneIndex].actions.removeAll { $0.id == actionID }
    }

    func updateLabel(item: BoardItem, action: LabelAction, label rawLabel: String) async {
        let label = rawLabel.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !label.isEmpty else { return }
        let mutationID = labelMutationID(itemID: item.id, action: action, label: label)
        guard !labelMutationIDs.contains(mutationID) else { return }
        let previousLabels = items.first { $0.id == item.id }?.labels ?? item.labels
        labelMutationIDs.insert(mutationID)
        mutateLocalLabel(itemID: item.id, action: action, label: label)
        do {
            guard let workspace = activeWorkspace else { throw AgentBoardError.missingWorkspace }
            log("label:update:start \(action.rawValue) \(label) item=\(item.id)")
            try await github.updateLabel(slug: workspace.repoSlug, itemType: item.itemType, number: item.number, action: action, label: label)
            postMessage(action == .add ? "Label added." : "Label removed.", title: "Label updated")
            log("label:update:complete \(action.rawValue) \(label) item=\(item.id)")
        } catch {
            restoreLocalLabels(itemID: item.id, labels: previousLabels)
            log("label:update:failed \(error.localizedDescription)")
            postMessage(error.localizedDescription, title: "Label update failed")
        }
        labelMutationIDs.remove(mutationID)
    }

    func labelMutationID(itemID: BoardItem.ID, action: LabelAction, label: String) -> String {
        "\(itemID)|\(action.rawValue)|\(label.lowercased())"
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

    func renderPrompt(_ template: String, items: [BoardItem]) -> String {
        let refs = items.map(\.ref)
        return template
            .replacingOccurrences(of: "{{refs}}", with: refs.joined(separator: " "))
            .replacingOccurrences(of: "{{ref}}", with: refs.first ?? "")
            .replacingOccurrences(of: "{{count}}", with: String(items.count))
            .replacingOccurrences(of: "{{itemsJson}}", with: (try? String(data: JSONEncoder().encode(refs), encoding: .utf8)) ?? "[]")
    }

    private func createRun(workspace: Workspace, draft: RunDraft, items: [BoardItem], prompt: String) async throws -> RunRecord {
        guard let runner = appConfiguration.runners.first(where: { $0.id == draft.runnerID }) else {
            throw AgentBoardError.commandFailed("runner", "Runner not found")
        }
        let mode = runner.permissionModes.first { $0.id == draft.permissionModeID }
        let runID = "\(timestamp())-\(draft.action.id)-\(items.map(\.number).map(String.init).joined(separator: "-"))"
        let runDir = runsURL.appending(path: workspace.id)
        try fileManager.createDirectory(at: runDir, withIntermediateDirectories: true)
        let scriptURL = runDir.appending(path: "\(runID).sh")
        let statusURL = runDir.appending(path: "\(runID).status.json")
        let recordURL = runDir.appending(path: "\(runID).json")
        let arguments = (mode?.arguments ?? []) + runner.arguments
        let renderedArguments = arguments.map { $0.replacingOccurrences(of: "{{prompt}}", with: prompt).shellQuoted }
        let renderedCommand = ([runner.command.shellQuoted] + renderedArguments).joined(separator: " ")
        let record = RunRecord(id: runID, itemIDs: items.map(\.id), statusPath: statusURL.path, scriptPath: scriptURL.path)
        log("run:create id=\(runID) refs=\(items.map(\.ref).joined(separator: ","))")
        try JSONEncoder.pretty.encode([
            "id": runID,
            "workspaceId": workspace.id,
            "gitRoot": workspace.gitRoot,
            "boardId": draft.board.id,
            "laneId": draft.lane.id,
            "actionId": draft.action.id,
            "actionTitle": draft.action.title,
            "selectedRefs": items.map(\.ref).joined(separator: " "),
            "runnerId": runner.id,
            "permissionModeId": draft.permissionModeID,
            "command": runner.command,
            "prompt": prompt,
            "statusPath": statusURL.path,
            "scriptPath": scriptURL.path
        ]).write(to: recordURL)
        try JSONEncoder.pretty.encode(["runId": runID, "status": RunExecutionStatus.pending.rawValue]).write(to: statusURL)
        let script = """
        #!/bin/bash
        set -euo pipefail

        write_status() {
          local status="$1"
          local exit_code="${2:-}"
          local now
          now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
          if [ -n "$exit_code" ]; then
            printf '{"runId":"%s","status":"%s","pid":%s,"exitCode":%s,"updatedAt":"%s","endedAt":"%s"}\\n' \(runID.shellQuoted) "$status" "$$" "$exit_code" "$now" "$now" > \(statusURL.path.shellQuoted)
          else
            printf '{"runId":"%s","status":"%s","pid":%s,"startedAt":"%s","updatedAt":"%s"}\\n' \(runID.shellQuoted) "$status" "$$" "$now" "$now" > \(statusURL.path.shellQuoted)
          fi
        }

        cd \(workspace.gitRoot.shellQuoted)

        write_status running
        set +e
        \(renderedCommand)
        exit_code=$?
        set -e
        write_status exited "$exit_code"

        exec "${SHELL:-/bin/zsh}" -l
        """
        try script.write(to: scriptURL, atomically: true, encoding: .utf8)
        try fileManager.setAttributes([.posixPermissions: 0o755], ofItemAtPath: scriptURL.path)
        try await openTerminal(scriptURL: scriptURL)
        return record
    }

    private func openTerminal(scriptURL: URL) async throws {
        let bundleID = appConfiguration.terminal.appIdentifier
        let preset = TerminalPreset.detectAll().first { $0.bundleID == bundleID }
        let openMode: TerminalOpenMode = appConfiguration.terminal.openMode == .tab && preset?.supportsTabs == true ? .tab : .window
        let command = "bash \(scriptURL.path.shellQuoted)"
        log("terminal:open bundle=\(bundleID) mode=\(openMode.rawValue) script=\(scriptURL.path)")

        if bundleID == "com.apple.Terminal" {
            if openMode == .window {
                _ = try await Shell.require(["/usr/bin/open", "-b", "com.apple.Terminal", scriptURL.path])
                return
            }
            let lines = openMode == .tab
                ? [
                    "tell application \"Terminal\"",
                    "activate",
                    "if (count of windows) is 0 then",
                    "do script \(command.appleScriptString)",
                    "else",
                    "do script \(command.appleScriptString) in front window",
                    "end if",
                    "end tell"
                ]
                : [
                    "tell application \"Terminal\"",
                    "activate",
                    "do script \(command.appleScriptString)",
                    "end tell"
                ]
            _ = try await Shell.require(["/usr/bin/osascript"] + lines.flatMap { ["-e", $0] })
        } else if bundleID == "com.googlecode.iterm2" {
            let lines = openMode == .tab
                ? [
                    "tell application \"iTerm\"",
                    "activate",
                    "if (count of windows) is 0 then",
                    "create window with default profile",
                    "else",
                    "tell current window to create tab with default profile",
                    "end if",
                    "tell current session of current window to write text \(command.appleScriptString)",
                    "end tell"
                ]
                : [
                    "tell application \"iTerm\"",
                    "activate",
                    "create window with default profile",
                    "tell current session of current window to write text \(command.appleScriptString)",
                    "end tell"
                ]
            _ = try await Shell.require(["/usr/bin/osascript"] + lines.flatMap { ["-e", $0] })
        } else if bundleID == "com.mitchellh.ghostty" {
            _ = try await Shell.require(["/usr/bin/open", "-na", "Ghostty", "--args", "-e", "bash", scriptURL.path])
        } else {
            _ = try await Shell.require(["/usr/bin/open", "-b", bundleID, scriptURL.path])
        }
    }

    private func watchRun(_ record: RunRecord) {
        Task {
            for _ in 0..<240 {
                try? await Task.sleep(for: .seconds(2))
                guard let data = try? Data(contentsOf: URL(fileURLWithPath: record.statusPath)),
                      let statusPayload = try? JSONDecoder().decode(RunStatusPayload.self, from: data) else { continue }
                if let index = runRecords.firstIndex(where: { $0.id == record.id }) {
                    runRecords[index].status = statusPayload.status
                }
                if statusPayload.status == .exited {
                    for id in record.itemIDs {
                        runningItemIDs.remove(id)
                    }
                    log("run:exited id=\(record.id)")
                    return
                }
            }
        }
    }

    private func mutateLocalLabel(itemID: BoardItem.ID, action: LabelAction, label: String) {
        guard let index = items.firstIndex(where: { $0.id == itemID }) else { return }
        var labels = Set(items[index].labels)
        if action == .add {
            labels.insert(label)
            if !repositoryLabels.contains(label) {
                repositoryLabels.append(label)
                repositoryLabels.sort()
            }
        } else {
            labels.remove(label)
        }
        items[index].labels = labels.sorted()
        renderBoards()
        updateMissingLabels()
    }

    private func restoreLocalLabels(itemID: BoardItem.ID, labels: [String]) {
        guard let index = items.firstIndex(where: { $0.id == itemID }) else { return }
        items[index].labels = labels
        renderBoards()
        updateMissingLabels()
    }

    func detectRunners() async {
        log("runners:detect:start count=\(appConfiguration.runners.count)")
        var detected: Set<String> = []
        for runner in appConfiguration.runners where await isCommandDetected(runner.command) {
            detected.insert(runner.id)
        }
        detectedRunnerIDs = detected
        log("runners:detect:complete detected=\(detected.sorted().joined(separator: ","))")
    }

    private func isCommandDetected(_ command: String) async -> Bool {
        if command.contains("/") {
            return fileManager.isExecutableFile(atPath: command)
        }
        let result = try? await Shell.run(["/usr/bin/env", "which", command])
        return result?.exitCode == 0
    }

    private func updateMissingLabels() {
        let configuredLabels = workflow.boards
            .flatMap(\.lanes)
            .flatMap { lane -> [String] in
                (lane.query.labelsAll ?? []) + (lane.query.labelsAny ?? []) + (lane.query.labelsNone ?? [])
            }
        let existing = Set(repositoryLabels)
        missingWorkflowLabels = Array(Set(configuredLabels).subtracting(existing)).sorted()
    }

    private func uniqueID(prefix: String, existing: Set<String>) -> String {
        if !existing.contains(prefix) { return prefix }
        var index = 2
        while existing.contains("\(prefix)-\(index)") {
            index += 1
        }
        return "\(prefix)-\(index)"
    }

    private func loadWorkflow() throws {
        guard let activeWorkspace else {
            workflow = WorkflowConfiguration()
            return
        }
        let url = workflowURL(for: activeWorkspace.id)
        var shouldSave = false
        if fileManager.fileExists(atPath: url.path) {
            workflow = try JSONDecoder().decode(WorkflowConfiguration.self, from: Data(contentsOf: url))
        } else {
            workflow = WorkflowConfiguration()
            shouldSave = true
        }
        if migrateWorkflowDefaults() {
            shouldSave = true
        }
        if shouldSave {
            try saveWorkflow()
        }
    }

    private func migrateWorkflowDefaults() -> Bool {
        guard let boardIndex = workflow.boards.firstIndex(where: { $0.id == "issues" }),
              let laneIndex = workflow.boards[boardIndex].lanes.firstIndex(where: { $0.id == "inbox" }) else {
            return false
        }

        let oldDefaultExcludedLabels = ["needs-info", "ready-for-agent", "ready-for-human", "wontfix"]
        var query = workflow.boards[boardIndex].lanes[laneIndex].query
        guard query.includeUnlabeled == true,
              query.labelsAll?.isEmpty ?? true,
              query.labelsAny?.isEmpty ?? true,
              query.labelsNone == oldDefaultExcludedLabels else {
            return false
        }
        query.includeUnlabeled = nil
        workflow.boards[boardIndex].lanes[laneIndex].query = query
        log("workflow:migrate removed includeUnlabeled from default issues/inbox lane")
        return true
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

    private func log(_ message: String) {
        print("[AgentBoard] \(message)")
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

    var appleScriptString: String {
        "\"\(replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\""))\""
    }
}

private struct RunStatusPayload: Decodable {
    var status: RunExecutionStatus
}
