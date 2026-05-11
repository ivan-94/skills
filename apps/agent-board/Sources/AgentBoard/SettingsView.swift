import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var store: AgentBoardStore
    @Environment(\.dismiss) private var dismiss
    @State private var selection: SettingsSection = .workspaces

    enum SettingsSection: String, CaseIterable, Identifiable {
        case workspaces = "Workspaces"
        case workflow = "Workflow"
        case runners = "Runners"
        case terminal = "Terminal"

        var id: String { rawValue }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Board Configuration")
                        .font(.title2.bold())
                    Text("Edit workspaces, workflow lanes, runners, terminals, and prompts.")
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                }
                .buttonStyle(.plain)
            }
            .padding(22)

            Divider()

            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(SettingsSection.allCases) { section in
                        SettingsNavButton(
                            title: section.rawValue,
                            icon: icon(for: section),
                            isSelected: selection == section
                        ) {
                            selection = section
                        }
                    }
                    Spacer()
                    Text(store.activeWorkspace?.repoSlug ?? "No workspace")
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                .padding(16)
                .frame(width: 230)
                .background(.bar)

                Divider()

                Group {
                    switch selection {
                    case .workspaces:
                        WorkspacesSettings()
                    case .workflow:
                        WorkflowSettings()
                    case .runners:
                        RunnersSettings()
                    case .terminal:
                        TerminalSettings()
                    }
                }
            }

            Divider()

            HStack {
                Text("Saving writes to \(store.appHome.path)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer()
                Button("Cancel") { dismiss() }
                Button {
                    store.saveSettings()
                    dismiss()
                } label: {
                    Label("Save Configuration", systemImage: "square.and.arrow.down")
                }
                .buttonStyle(.borderedProminent)
            }
            .padding(16)
        }
    }

    func icon(for section: SettingsSection) -> String {
        switch section {
        case .workspaces: "folder"
        case .workflow: "square.grid.3x3"
        case .runners: "terminal"
        case .terminal: "macwindow"
        }
    }
}

struct WorkspacesSettings: View {
    @EnvironmentObject private var store: AgentBoardStore
    @State private var pendingDelete: Workspace?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SettingsHeader(title: "Workspaces", subtitle: "Manage local repositories attached to Agent Board.")
                LazyVStack(spacing: 12) {
                    ForEach($store.appConfiguration.workspaces) { $workspace in
                        SettingsCard {
                            VStack(alignment: .leading, spacing: 10) {
                                TextField("Name", text: $workspace.name)
                                    .textFieldStyle(.roundedBorder)
                                Text(workspace.repoSlug)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(workspace.gitRoot)
                                    .font(.caption.monospaced())
                                    .foregroundStyle(.tertiary)
                                DangerRow(title: "Remove Workspace", detail: "Removes this workspace from Agent Board state. It does not delete the repository.") {
                                    pendingDelete = workspace
                                }
                            }
                        }
                    }
                }
            }
            .padding(24)
        }
        .alert("Remove workspace?", isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } })) {
            Button("Remove", role: .destructive) {
                if let pendingDelete {
                    store.removeWorkspace(pendingDelete)
                }
                pendingDelete = nil
            }
            Button("Cancel", role: .cancel) { pendingDelete = nil }
        } message: {
            Text(pendingDelete?.name ?? "")
        }
    }
}

struct WorkflowSettings: View {
    @EnvironmentObject private var store: AgentBoardStore
    @State private var selectedBoardID: String?
    @State private var selectedLaneID: String?
    @State private var pendingDeletion: WorkflowDeletion?

    var selectedBoardIndex: Int? {
        guard let selectedBoardID else { return store.workflow.boards.indices.first }
        return store.workflow.boards.firstIndex { $0.id == selectedBoardID } ?? store.workflow.boards.indices.first
    }

    var selectedLaneIndex: Int? {
        guard let boardIndex = selectedBoardIndex else { return nil }
        guard let selectedLaneID else { return store.workflow.boards[boardIndex].lanes.indices.first }
        return store.workflow.boards[boardIndex].lanes.firstIndex { $0.id == selectedLaneID } ?? store.workflow.boards[boardIndex].lanes.indices.first
    }

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                SettingsHeader(title: "Boards", subtitle: "Choose an Issue or PR board.")
                ForEach(store.workflow.boards) { board in
                    SettingsListButton(
                        title: board.title,
                        subtitle: board.itemType.rawValue,
                        isSelected: board.id == normalizedBoardID
                    ) {
                        selectedBoardID = board.id
                        selectedLaneID = board.lanes.first?.id
                    }
                }
                Spacer()
            }
            .padding(16)
            .frame(width: 190)
            .background(.bar)

            Divider()

            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    SettingsHeader(title: "Lanes", subtitle: "\(currentBoard?.lanes.count ?? 0) configured")
                    Spacer()
                    if let boardID = currentBoard?.id {
                        Button {
                            store.addLane(to: boardID)
                            selectedLaneID = store.workflow.boards.first { $0.id == boardID }?.lanes.last?.id
                        } label: {
                            Label("Lane", systemImage: "plus")
                        }
                    }
                }
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(currentBoard?.lanes ?? []) { lane in
                            LaneSummaryCard(
                                lane: lane,
                                itemCount: renderedLaneCount(laneID: lane.id),
                                missingLabels: missingLabels(for: lane),
                                isSelected: lane.id == normalizedLaneID
                            ) {
                                selectedLaneID = lane.id
                            }
                        }
                    }
                    .padding(.trailing, 2)
                }
            }
            .padding(16)
            .frame(width: 300)

            Divider()

            if let boardIndex = selectedBoardIndex, let laneIndex = selectedLaneIndex {
                WorkflowLaneDetail(
                    board: $store.workflow.boards[boardIndex],
                    lane: $store.workflow.boards[boardIndex].lanes[laneIndex],
                    boardID: store.workflow.boards[boardIndex].id,
                    onDeleteLane: {
                        pendingDeletion = WorkflowDeletion(kind: .lane, boardID: store.workflow.boards[boardIndex].id, laneID: store.workflow.boards[boardIndex].lanes[laneIndex].id, actionID: nil, title: store.workflow.boards[boardIndex].lanes[laneIndex].title)
                    },
                    onDeleteAction: { actionID, title in
                        pendingDeletion = WorkflowDeletion(kind: .action, boardID: store.workflow.boards[boardIndex].id, laneID: store.workflow.boards[boardIndex].lanes[laneIndex].id, actionID: actionID, title: title)
                    }
                )
            } else {
                ContentUnavailableView("No lane selected", systemImage: "square.grid.3x3")
            }
        }
        .onAppear(perform: normalizeSelection)
        .onChange(of: store.workflow.boards.map(\.id)) { _, _ in normalizeSelection() }
        .alert("Delete \(pendingDeletion?.kind.title ?? "item")?", isPresented: Binding(get: { pendingDeletion != nil }, set: { if !$0 { pendingDeletion = nil } })) {
            Button("Delete", role: .destructive) {
                if let deletion = pendingDeletion {
                    switch deletion.kind {
                    case .lane:
                        store.removeLane(boardID: deletion.boardID, laneID: deletion.laneID)
                    case .action:
                        if let actionID = deletion.actionID {
                            store.removeAction(boardID: deletion.boardID, laneID: deletion.laneID, actionID: actionID)
                        }
                    }
                }
                pendingDeletion = nil
                normalizeSelection()
            }
            Button("Cancel", role: .cancel) { pendingDeletion = nil }
        } message: {
            Text(pendingDeletion?.title ?? "")
        }
    }

    private var currentBoard: BoardConfiguration? {
        guard let selectedBoardIndex else { return nil }
        return store.workflow.boards[selectedBoardIndex]
    }

    private var normalizedBoardID: String? {
        currentBoard?.id
    }

    private var normalizedLaneID: String? {
        guard let board = currentBoard, let selectedLaneIndex else { return nil }
        return board.lanes[selectedLaneIndex].id
    }

    private func normalizeSelection() {
        if selectedBoardID == nil || !store.workflow.boards.contains(where: { $0.id == selectedBoardID }) {
            selectedBoardID = store.workflow.boards.first?.id
        }
        guard let board = currentBoard else {
            selectedLaneID = nil
            return
        }
        if selectedLaneID == nil || !board.lanes.contains(where: { $0.id == selectedLaneID }) {
            selectedLaneID = board.lanes.first?.id
        }
    }

    private func renderedLaneCount(laneID: String) -> Int {
        store.renderedBoards.first { $0.id == currentBoard?.id }?.lanes.first { $0.id == laneID }?.items.count ?? 0
    }

    private func missingLabels(for lane: LaneConfiguration) -> [String] {
        let labels = (lane.query.labelsAll ?? []) + (lane.query.labelsAny ?? []) + (lane.query.labelsNone ?? [])
        return labels.filter { store.missingWorkflowLabels.contains($0) }
    }
}

struct WorkflowLaneDetail: View {
    @EnvironmentObject private var store: AgentBoardStore
    @Binding var board: BoardConfiguration
    @Binding var lane: LaneConfiguration
    var boardID: String
    var onDeleteLane: () -> Void
    var onDeleteAction: (String, String) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    SettingsHeader(title: lane.title, subtitle: "Lane query and actions")
                    Spacer()
                    Button {
                        store.addAction(boardID: boardID, laneID: lane.id)
                    } label: {
                        Label("Action", systemImage: "plus")
                    }
                }

                if !validationWarnings.isEmpty {
                    ValidationPanel(warnings: validationWarnings)
                }

                SettingsCard(title: "Query Builder") {
                    TwoColumnFields {
                        LabeledField("Lane ID") {
                            TextField("lane-id", text: $lane.id)
                                .textFieldStyle(.roundedBorder)
                        }
                        LabeledField("Lane Title") {
                            TextField("Lane title", text: $lane.title)
                                .textFieldStyle(.roundedBorder)
                        }
                    }
                    LabelTokenField(title: "Labels All", text: csvBinding($lane.query.labelsAll))
                    LabelTokenField(title: "Labels Any", text: csvBinding($lane.query.labelsAny))
                    LabelTokenField(title: "Labels None", text: csvBinding($lane.query.labelsNone))
                    HStack(spacing: 24) {
                        Toggle("Include unlabeled", isOn: boolBinding($lane.query.includeUnlabeled))
                        Toggle("No assignee", isOn: boolBinding($lane.query.noAssignee))
                    }
                }

                SettingsCard(title: "Actions") {
                    PromptVariablesHelp()
                    ForEach(lane.actions.indices, id: \.self) { actionIndex in
                        ActionEditor(
                            action: $lane.actions[actionIndex],
                            runners: store.appConfiguration.runners,
                            detectedRunnerIDs: store.detectedRunnerIDs
                        ) {
                            onDeleteAction(lane.actions[actionIndex].id, lane.actions[actionIndex].title)
                        }
                    }
                }

                SettingsCard(title: "Danger Zone") {
                    DangerRow(title: "Delete Lane", detail: "Deletes this lane and all configured actions from the workflow.") {
                        onDeleteLane()
                    }
                }
            }
            .padding(24)
        }
    }

    private var validationWarnings: [String] {
        var warnings: [String] = []
        let laneIDs = board.lanes.map(\.id)
        if laneIDs.filter({ $0 == lane.id }).count > 1 {
            warnings.append("Lane ID \"\(lane.id)\" is duplicated in this board.")
        }
        let labels = (lane.query.labelsAll ?? []) + (lane.query.labelsAny ?? []) + (lane.query.labelsNone ?? [])
        let missing = labels.filter { store.missingWorkflowLabels.contains($0) }
        if !missing.isEmpty {
            warnings.append("Missing GitHub labels: \(missing.joined(separator: ", ")).")
        }
        let actionIDs = lane.actions.map(\.id)
        for action in lane.actions {
            if actionIDs.filter({ $0 == action.id }).count > 1 {
                warnings.append("Action ID \"\(action.id)\" is duplicated in this lane.")
            }
            if let runnerID = action.runner, !runnerID.isEmpty, !store.appConfiguration.runners.contains(where: { $0.id == runnerID }) {
                warnings.append("Action \"\(action.title)\" uses missing runner \"\(runnerID)\".")
            }
            let unknownVariables = unknownPromptVariables(in: action.promptTemplate)
            if !unknownVariables.isEmpty {
                warnings.append("Action \"\(action.title)\" has unknown prompt variables: \(unknownVariables.joined(separator: ", ")).")
            }
        }
        return warnings
    }
}

struct ActionEditor: View {
    @Binding var action: ActionConfiguration
    var runners: [RunnerConfiguration]
    var detectedRunnerIDs: Set<String>
    var onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(action.title.isEmpty ? "Untitled Action" : action.title)
                    .font(.headline)
                Spacer()
                Button(role: .destructive, action: onDelete) {
                    Label("Delete", systemImage: "trash")
                }
            }
            TwoColumnFields {
                LabeledField("Action ID") {
                    TextField("action-id", text: $action.id)
                        .textFieldStyle(.roundedBorder)
                }
                LabeledField("Title") {
                    TextField("Title", text: $action.title)
                        .textFieldStyle(.roundedBorder)
                }
            }
            LabeledField("Runner") {
                Picker("Runner", selection: optionalStringBinding($action.runner)) {
                    Text("Default Runner").tag("")
                    ForEach(runners) { runner in
                        Text("\(runner.label)\(detectedRunnerIDs.contains(runner.id) ? " · detected" : " · missing")").tag(runner.id)
                    }
                }
            }
            LabeledField("Prompt") {
                TextField("Prompt", text: $action.promptTemplate, axis: .vertical)
                    .font(.system(.body, design: .monospaced))
                    .lineLimit(3...8)
                    .textFieldStyle(.roundedBorder)
            }
            LabeledField("Rendered Preview") {
                Text(renderPromptExample(action.promptTemplate))
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .agentGlassCard(radius: 8)
            }
        }
        .padding(14)
        .agentInteractiveGlass(radius: 12)
    }
}

struct RunnersSettings: View {
    @EnvironmentObject private var store: AgentBoardStore
    @State private var selectedRunnerID: String?
    @State private var selectedPermissionID: String?
    @State private var pendingDelete: RunnerConfiguration?

    var selectedRunnerIndex: Int? {
        guard let selectedRunnerID else { return store.appConfiguration.runners.indices.first }
        return store.appConfiguration.runners.firstIndex { $0.id == selectedRunnerID } ?? store.appConfiguration.runners.indices.first
    }

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    SettingsHeader(title: "Runners", subtitle: "\(store.detectedRunnerIDs.count)/\(store.appConfiguration.runners.count) detected")
                    Spacer()
                    Button {
                        store.addRunner()
                        selectedRunnerID = store.appConfiguration.runners.last?.id
                    } label: {
                        Image(systemName: "plus")
                    }
                }
                ForEach(store.appConfiguration.runners) { runner in
                    SettingsListButton(
                        title: runner.label,
                        subtitle: runner.command,
                        trailing: store.detectedRunnerIDs.contains(runner.id) ? "Detected" : "Missing",
                        isSelected: runner.id == normalizedRunnerID
                    ) {
                        selectedRunnerID = runner.id
                        selectedPermissionID = runner.defaultPermissionMode
                    }
                }
                Spacer()
            }
            .padding(16)
            .frame(width: 300)
            .background(.bar)

            Divider()

            if let runnerIndex = selectedRunnerIndex {
                RunnerDetail(
                    runner: $store.appConfiguration.runners[runnerIndex],
                    isDetected: store.detectedRunnerIDs.contains(store.appConfiguration.runners[runnerIndex].id),
                    selectedPermissionID: $selectedPermissionID
                ) {
                    pendingDelete = store.appConfiguration.runners[runnerIndex]
                }
            } else {
                ContentUnavailableView("No runner selected", systemImage: "terminal")
            }
        }
        .onAppear(perform: normalizeSelection)
        .onChange(of: store.appConfiguration.runners.map(\.id)) { _, _ in normalizeSelection() }
        .alert("Delete runner?", isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } })) {
            Button("Delete", role: .destructive) {
                if let pendingDelete {
                    store.removeRunner(id: pendingDelete.id)
                }
                pendingDelete = nil
                normalizeSelection()
            }
            Button("Cancel", role: .cancel) { pendingDelete = nil }
        } message: {
            Text(pendingDelete?.label ?? "")
        }
    }

    private var normalizedRunnerID: String? {
        guard let selectedRunnerIndex else { return nil }
        return store.appConfiguration.runners[selectedRunnerIndex].id
    }

    private func normalizeSelection() {
        if selectedRunnerID == nil || !store.appConfiguration.runners.contains(where: { $0.id == selectedRunnerID }) {
            selectedRunnerID = store.appConfiguration.runners.first?.id
        }
        guard let runnerIndex = selectedRunnerIndex else {
            selectedPermissionID = nil
            return
        }
        let runner = store.appConfiguration.runners[runnerIndex]
        if selectedPermissionID == nil || !runner.permissionModes.contains(where: { $0.id == selectedPermissionID }) {
            selectedPermissionID = runner.defaultPermissionMode
        }
    }
}

struct RunnerDetail: View {
    @Binding var runner: RunnerConfiguration
    var isDetected: Bool
    @Binding var selectedPermissionID: String?
    var onDelete: () -> Void

    var selectedPermissionIndex: Int? {
        guard let selectedPermissionID else { return runner.permissionModes.indices.first }
        return runner.permissionModes.firstIndex { $0.id == selectedPermissionID } ?? runner.permissionModes.indices.first
    }

    var cliPreview: String {
        let mode = selectedPermissionIndex.map { runner.permissionModes[$0] }
        let args = ((mode?.arguments ?? []) + runner.arguments)
            .map { $0.replacingOccurrences(of: "{{prompt}}", with: "<prompt>").shellQuoted }
        return ([runner.command.shellQuoted] + args).joined(separator: " ")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    SettingsHeader(title: runner.label, subtitle: runner.id)
                    Spacer()
                    StatusBadge(text: isDetected ? "Detected" : "Missing", color: isDetected ? .green : .orange)
                }

                SettingsCard(title: "Command") {
                    TwoColumnFields {
                        LabeledField("Runner ID") {
                            TextField("runner-id", text: $runner.id)
                                .textFieldStyle(.roundedBorder)
                        }
                        LabeledField("Label") {
                            TextField("Label", text: $runner.label)
                                .textFieldStyle(.roundedBorder)
                        }
                    }
                    LabeledField("Executable") {
                        TextField("Command", text: $runner.command)
                            .font(.system(.body, design: .monospaced))
                            .textFieldStyle(.roundedBorder)
                    }
                    LabelTokenField(title: "Arguments", text: argsBinding($runner.arguments), placeholder: "{{prompt}}")
                    Picker("Default Permission", selection: $runner.defaultPermissionMode) {
                        ForEach(runner.permissionModes) { mode in
                            Text(mode.label).tag(mode.id)
                        }
                    }
                }

                if !validationWarnings.isEmpty {
                    ValidationPanel(warnings: validationWarnings)
                }

                SettingsCard(title: "Permission Modes") {
                    Picker("Permission", selection: Binding(
                        get: { selectedPermissionID ?? runner.defaultPermissionMode },
                        set: { selectedPermissionID = $0 }
                    )) {
                        ForEach(runner.permissionModes) { mode in
                            Text(mode.label).tag(mode.id)
                        }
                    }
                    .pickerStyle(.segmented)

                    if let index = selectedPermissionIndex {
                        PermissionModeEditor(mode: $runner.permissionModes[index], runner: runner)
                    }
                }

                SettingsCard(title: "CLI Preview") {
                    Text(cliPreview)
                        .font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .agentGlassCard(radius: 8)
                }

                SettingsCard(title: "Danger Zone") {
                    DangerRow(title: "Delete Runner", detail: "Deletes this runner configuration. Existing run records are kept.") {
                        onDelete()
                    }
                }
            }
            .padding(24)
        }
        .onAppear {
            if selectedPermissionID == nil {
                selectedPermissionID = runner.defaultPermissionMode
            }
        }
    }

    private var validationWarnings: [String] {
        var warnings: [String] = []
        if !isDetected {
            warnings.append("Runner command is not detected on this machine.")
        }
        if !runner.arguments.contains(where: { $0.contains("{{prompt}}") }) {
            warnings.append("Runner arguments do not contain {{prompt}}, so the rendered prompt may not be passed to the CLI.")
        }
        if !runner.permissionModes.contains(where: { $0.id == runner.defaultPermissionMode }) {
            warnings.append("Default permission mode does not exist.")
        }
        return warnings
    }
}

struct PermissionModeEditor: View {
    @Binding var mode: PermissionMode
    var runner: RunnerConfiguration

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TwoColumnFields {
                LabeledField("Mode ID") {
                    TextField("mode-id", text: $mode.id)
                        .textFieldStyle(.roundedBorder)
                }
                LabeledField("Label") {
                    TextField("Label", text: $mode.label)
                        .textFieldStyle(.roundedBorder)
                }
            }
            LabelTokenField(title: "Mode Arguments", text: argsBinding($mode.arguments), placeholder: "--flag value")
            LabeledField("Safety Note") {
                TextField("Description", text: $mode.detail, axis: .vertical)
                    .lineLimit(2...4)
                    .textFieldStyle(.roundedBorder)
            }
            if mode.id == "full-access" {
                Label("Bypasses permission checks. Use only in an isolated workspace.", systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.orange)
                    .font(.caption.weight(.semibold))
            }
        }
        .padding(14)
        .agentInteractiveGlass(radius: 12)
    }
}

struct TerminalSettings: View {
    @EnvironmentObject private var store: AgentBoardStore
    private var presets: [TerminalPreset] { TerminalPreset.detectAll() }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SettingsHeader(title: "Terminal", subtitle: "Choose how interactive TUI runners are launched.")
                SettingsCard(title: "Launch") {
                    Picker("Terminal", selection: $store.appConfiguration.terminal.appIdentifier) {
                        ForEach(presets) { preset in
                            Text("\(preset.label)\(preset.detected ? "" : " · missing")").tag(preset.bundleID)
                        }
                    }
                    Picker("Open mode", selection: $store.appConfiguration.terminal.openMode) {
                        ForEach(TerminalOpenMode.allCases) { mode in
                            Text(mode.rawValue.capitalized).tag(mode)
                        }
                    }
                    TextField("Terminal bundle ID", text: $store.appConfiguration.terminal.appIdentifier)
                        .font(.system(.body, design: .monospaced))
                        .textFieldStyle(.roundedBorder)
                }
            }
            .padding(24)
        }
    }
}

struct SettingsHeader: View {
    var title: String
    var subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.headline)
            Text(subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
    }
}

struct SettingsNavButton: View {
    var title: String
    var icon: String
    var isSelected: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(isSelected ? Color.accentColor.opacity(0.18) : Color.clear, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct SettingsListButton: View {
    var title: String
    var subtitle: String
    var trailing: String?
    var isSelected: Bool
    var action: () -> Void

    init(title: String, subtitle: String, trailing: String? = nil, isSelected: Bool, action: @escaping () -> Void) {
        self.title = title
        self.subtitle = subtitle
        self.trailing = trailing
        self.isSelected = isSelected
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                if let trailing {
                    StatusBadge(text: trailing, color: trailing == "Detected" ? .green : .orange)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isSelected ? Color.accentColor.opacity(0.22) : Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(isSelected ? Color.accentColor.opacity(0.65) : Color.secondary.opacity(0.25), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }
}

struct LaneSummaryCard: View {
    var lane: LaneConfiguration
    var itemCount: Int
    var missingLabels: [String]
    var isSelected: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 9) {
                HStack {
                    Text(lane.title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Spacer()
                    Text("\(itemCount)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                FlowLayout(spacing: 5) {
                    ForEach(queryLabels.prefix(4), id: \.self) { label in
                        TokenText(label)
                    }
                }
                HStack {
                    Label("\(lane.actions.count)", systemImage: "bolt")
                    Spacer()
                    if !missingLabels.isEmpty {
                        Label("\(missingLabels.count) missing", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isSelected ? Color.accentColor.opacity(0.22) : Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(isSelected ? Color.accentColor.opacity(0.65) : Color.secondary.opacity(0.25), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }

    private var queryLabels: [String] {
        (lane.query.labelsAll ?? []) + (lane.query.labelsAny ?? []) + (lane.query.labelsNone ?? [])
    }
}

struct SettingsCard<Content: View>: View {
    var title: String?
    @ViewBuilder var content: Content

    init(title: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title {
                Text(title)
                    .font(.headline)
            }
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .agentGlassCard(radius: 14)
    }
}

struct LabeledField<Content: View>: View {
    var title: String
    @ViewBuilder var content: Content

    init(_ title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased())
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            content
        }
    }
}

struct TwoColumnFields<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 12) {
            GridRow {
                content
            }
        }
    }
}

struct LabelTokenField: View {
    var title: String
    @Binding var text: String
    var placeholder: String = "label-a, label-b"

    init(title: String, text: Binding<String>, placeholder: String = "label-a, label-b") {
        self.title = title
        self._text = text
        self.placeholder = placeholder
    }

    var tokens: [String] {
        text.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }

    var body: some View {
        LabeledField(title) {
            VStack(alignment: .leading, spacing: 8) {
                TextField(placeholder, text: $text)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(.body, design: .monospaced))
                if !tokens.isEmpty {
                    FlowLayout(spacing: 6) {
                        ForEach(tokens, id: \.self) { token in
                            TokenText(token)
                        }
                    }
                }
            }
        }
    }
}

struct TokenText: View {
    var text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.caption.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(.quaternary, in: Capsule())
    }
}

struct StatusBadge: View {
    var text: String
    var color: Color

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.14), in: Capsule())
    }
}

struct DangerRow: View {
    var title: String
    var detail: String
    var action: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button(role: .destructive, action: action) {
                Label("Delete", systemImage: "trash")
            }
        }
        .padding(12)
        .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

struct ValidationPanel: View {
    var warnings: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Validation", systemImage: "exclamationmark.triangle")
                .font(.headline)
                .foregroundStyle(.orange)
            ForEach(warnings, id: \.self) { warning in
                Text(warning)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

struct PromptVariablesHelp: View {
    private let variables: [(String, String)] = [
        ("{{refs}}", "all selected refs"),
        ("{{ref}}", "first selected ref"),
        ("{{count}}", "selected count"),
        ("{{itemsJson}}", "refs as JSON")
    ]

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(variables, id: \.0) { variable, detail in
                HStack(spacing: 6) {
                    Text(variable)
                        .font(.system(.caption, design: .monospaced).weight(.semibold))
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 9)
                .padding(.vertical, 6)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
    }
}

struct WorkflowDeletion {
    enum Kind {
        case lane
        case action

        var title: String {
            switch self {
            case .lane: "lane"
            case .action: "action"
            }
        }
    }

    var kind: Kind
    var boardID: String
    var laneID: String
    var actionID: String?
    var title: String
}

func csvBinding(_ value: Binding<[String]?>) -> Binding<String> {
    Binding {
        value.wrappedValue?.joined(separator: ", ") ?? ""
    } set: { next in
        let parsed = next.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        value.wrappedValue = parsed.isEmpty ? nil : parsed
    }
}

func argsBinding(_ value: Binding<[String]>) -> Binding<String> {
    Binding {
        value.wrappedValue.joined(separator: " ")
    } set: { next in
        value.wrappedValue = next.split(separator: " ").map(String.init)
    }
}

func boolBinding(_ value: Binding<Bool?>) -> Binding<Bool> {
    Binding {
        value.wrappedValue == true
    } set: { next in
        value.wrappedValue = next ? true : nil
    }
}

func optionalStringBinding(_ value: Binding<String?>) -> Binding<String> {
    Binding {
        value.wrappedValue ?? ""
    } set: { next in
        let trimmed = next.trimmingCharacters(in: .whitespacesAndNewlines)
        value.wrappedValue = trimmed.isEmpty ? nil : trimmed
    }
}

func renderPromptExample(_ template: String) -> String {
    template
        .replacingOccurrences(of: "{{refs}}", with: "#24 #23")
        .replacingOccurrences(of: "{{ref}}", with: "#24")
        .replacingOccurrences(of: "{{count}}", with: "2")
        .replacingOccurrences(of: "{{itemsJson}}", with: "[\"#24\",\"#23\"]")
}

func unknownPromptVariables(in template: String) -> [String] {
    let known = Set(["{{refs}}", "{{ref}}", "{{count}}", "{{itemsJson}}"])
    var variables: [String] = []
    var remainder = template[...]
    while let start = remainder.range(of: "{{"), let end = remainder[start.upperBound...].range(of: "}}") {
        let variable = String(remainder[start.lowerBound..<end.upperBound])
        if !known.contains(variable) {
            variables.append(variable)
        }
        remainder = remainder[end.upperBound...]
    }
    return Array(Set(variables)).sorted()
}
