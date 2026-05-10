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
        NavigationSplitView {
            List(SettingsSection.allCases, selection: $selection) { section in
                Label(section.rawValue, systemImage: icon(for: section))
                    .tag(section)
            }
            .navigationTitle("Configure")
            .navigationSplitViewColumnWidth(220)
        } detail: {
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
            .toolbar {
                Button("Done") {
                    store.saveSettings()
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
            }
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

    var body: some View {
        Form {
            Section("Workspaces") {
                ForEach($store.appConfiguration.workspaces) { $workspace in
                    VStack(alignment: .leading, spacing: 8) {
                        TextField("Name", text: $workspace.name)
                        Text(workspace.repoSlug)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(workspace.gitRoot)
                            .font(.caption.monospaced())
                            .foregroundStyle(.tertiary)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Workspaces")
    }
}

struct WorkflowSettings: View {
    @EnvironmentObject private var store: AgentBoardStore

    var body: some View {
        Form {
            ForEach($store.workflow.boards) { $board in
                Section(board.title) {
                    TextField("Board title", text: $board.title)
                    ForEach($board.lanes) { $lane in
                        DisclosureGroup(lane.title) {
                            TextField("Lane title", text: $lane.title)
                            TextField("Labels all", text: csvBinding($lane.query.labelsAll))
                            TextField("Labels any", text: csvBinding($lane.query.labelsAny))
                            TextField("Labels none", text: csvBinding($lane.query.labelsNone))
                            Toggle("Include unlabeled", isOn: boolBinding($lane.query.includeUnlabeled))

                            Section("Actions") {
                                ForEach($lane.actions) { $action in
                                    TextField("Title", text: $action.title)
                                    TextField("Prompt", text: $action.promptTemplate, axis: .vertical)
                                        .font(.system(.body, design: .monospaced))
                                }
                            }
                        }
                    }
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Workflow")
    }
}

struct RunnersSettings: View {
    @EnvironmentObject private var store: AgentBoardStore

    var body: some View {
        Form {
            ForEach($store.appConfiguration.runners) { $runner in
                Section(runner.label) {
                    TextField("ID", text: $runner.id)
                    TextField("Label", text: $runner.label)
                    TextField("Command", text: $runner.command)
                    TextField("Arguments", text: argsBinding($runner.arguments))
                    Picker("Default permission", selection: $runner.defaultPermissionMode) {
                        ForEach(runner.permissionModes) { mode in
                            Text(mode.label).tag(mode.id)
                        }
                    }
                    ForEach($runner.permissionModes) { $mode in
                        DisclosureGroup(mode.label) {
                            TextField("Label", text: $mode.label)
                            TextField("Arguments", text: argsBinding($mode.arguments))
                            TextField("Description", text: $mode.detail)
                        }
                    }
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Runners")
    }
}

struct TerminalSettings: View {
    @EnvironmentObject private var store: AgentBoardStore

    var body: some View {
        Form {
            Picker("Open mode", selection: $store.appConfiguration.terminal.openMode) {
                ForEach(TerminalOpenMode.allCases) { mode in
                    Text(mode.rawValue.capitalized).tag(mode)
                }
            }
            TextField("Terminal bundle ID", text: $store.appConfiguration.terminal.appIdentifier)
        }
        .formStyle(.grouped)
        .navigationTitle("Terminal")
    }
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
