import SwiftUI

struct RunActionView: View {
    @EnvironmentObject private var store: AgentBoardStore
    @Environment(\.dismiss) private var dismiss
    @State var draft: RunDraft

    var runner: RunnerConfiguration? {
        store.appConfiguration.runners.first { $0.id == draft.runnerID }
    }

    var permissionModes: [PermissionMode] {
        runner?.permissionModes ?? []
    }

    var selectedPermission: PermissionMode? {
        permissionModes.first { $0.id == draft.permissionModeID }
    }

    var runnerDetected: Bool {
        store.detectedRunnerIDs.contains(draft.runnerID)
    }

    var terminalCount: Int {
        draft.splitRuns ? draft.items.count : 1
    }

    var cliPreview: String {
        guard let runner else { return "" }
        if draft.splitRuns {
            return draft.items
                .map { item in
                    cliPreview(runner: runner, mode: selectedPermission, prompt: store.renderPrompt(draft.action.promptTemplate, items: [item]))
                }
                .joined(separator: "\n")
        }
        return cliPreview(runner: runner, mode: selectedPermission, prompt: draft.prompt)
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Run Action")
                        .font(.title2.bold())
                    Text("\(draft.action.title) · \(draft.items.map(\.ref).joined(separator: " "))")
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
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

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    SettingsCard(title: "Runner") {
                        HStack(spacing: 10) {
                            ForEach(store.appConfiguration.runners) { candidate in
                                RunnerChoiceCard(
                                    runner: candidate,
                                    isDetected: store.detectedRunnerIDs.contains(candidate.id),
                                    isSelected: candidate.id == draft.runnerID
                                ) {
                                    draft.runnerID = candidate.id
                                    draft.permissionModeID = candidate.defaultPermissionMode
                                }
                            }
                        }
                    }

                    if !permissionModes.isEmpty {
                        SettingsCard(title: "Permission Mode") {
                            HStack(spacing: 10) {
                                ForEach(permissionModes) { mode in
                                    PermissionChoiceCard(
                                        mode: mode,
                                        isSelected: mode.id == draft.permissionModeID
                                    ) {
                                        draft.permissionModeID = mode.id
                                    }
                                }
                            }
                            if selectedPermission?.id == "full-access" {
                                Label("All permissions bypasses runner safety checks. Use only in an isolated workspace.", systemImage: "exclamationmark.triangle")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.orange)
                            }
                        }
                    }

                    SettingsCard(title: "Execution") {
                        Picker("Execution", selection: $draft.splitRuns) {
                            Text("Aggregate").tag(false)
                            Text("Separate").tag(true)
                        }
                        .pickerStyle(.segmented)
                        .disabled(draft.items.count < 2)
                        HStack {
                            Text(draft.splitRuns ? "Each Issue or PR opens in a separate terminal." : "All selected refs run in one terminal.")
                            Spacer()
                            Label("\(terminalCount) terminal\(terminalCount == 1 ? "" : "s")", systemImage: "terminal")
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }

                    SettingsCard(title: "Prompt") {
                        TextEditor(text: $draft.prompt)
                            .font(.system(.body, design: .monospaced))
                            .frame(minHeight: 170)
                            .scrollContentBackground(.hidden)
                            .padding(8)
                            .agentGlassCard(radius: 10)
                        PromptVariablesHelp()
                    }

                    if draft.items.count > 1 {
                        SettingsCard(title: "Per-Ref Preview") {
                            VStack(spacing: 8) {
                                ForEach(draft.items) { item in
                                    HStack(alignment: .top, spacing: 12) {
                                        Text(item.ref)
                                            .font(.caption.monospacedDigit().weight(.semibold))
                                            .frame(width: 48, alignment: .leading)
                                        Text(store.renderPrompt(draft.action.promptTemplate, items: [item]))
                                            .font(.system(.caption, design: .monospaced))
                                            .textSelection(.enabled)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                    .padding(10)
                                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                                }
                            }
                        }
                    }

                    SettingsCard(title: "CLI Preview") {
                        Text(cliPreview)
                            .font(.system(.caption, design: .monospaced))
                            .textSelection(.enabled)
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .agentGlassCard(radius: 10)
                        if draft.splitRuns && draft.items.count > 1 {
                            Text("Separate execution renders each item prompt before building its terminal command.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if !runnerDetected {
                        Label("Selected runner is missing on this machine. Configure the runner command before running.", systemImage: "xmark.circle")
                            .foregroundStyle(.orange)
                    }
                }
                .padding(22)
            }

            Divider()

            HStack {
                Text(runner?.label ?? "No runner")
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Cancel") { dismiss() }
                Button {
                    Task { await store.run(draft) }
                } label: {
                    Label(draft.splitRuns ? "Run \(draft.items.count)" : "Run", systemImage: "play.fill")
                }
                .buttonStyle(.borderedProminent)
                .disabled(!runnerDetected)
            }
            .padding(16)
        }
    }

    private func cliPreview(runner: RunnerConfiguration, mode: PermissionMode?, prompt: String) -> String {
        let args = ((mode?.arguments ?? []) + runner.arguments)
            .map { $0.replacingOccurrences(of: "{{prompt}}", with: prompt).shellQuoted }
        return ([runner.command.shellQuoted] + args).joined(separator: " ")
    }
}

struct RunnerChoiceCard: View {
    var runner: RunnerConfiguration
    var isDetected: Bool
    var isSelected: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: isSelected ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(isSelected ? Color.accentColor : Color.secondary)
                VStack(alignment: .leading, spacing: 4) {
                    Text(runner.label)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(runner.command)
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                StatusBadge(text: isDetected ? "Detected" : "Missing", color: isDetected ? .green : .orange)
            }
            .padding(12)
            .frame(maxWidth: .infinity)
            .background(isSelected ? Color.accentColor.opacity(0.18) : Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(isSelected ? Color.accentColor.opacity(0.7) : Color.secondary.opacity(0.18), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }
}

struct PermissionChoiceCard: View {
    var mode: PermissionMode
    var isSelected: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: isSelected ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(isSelected ? Color.accentColor : Color.secondary)
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(mode.label)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                        if mode.id == "full-access" {
                            Image(systemName: "exclamationmark.triangle")
                                .foregroundStyle(.orange)
                        }
                    }
                    Text(mode.detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
            }
            .padding(12)
            .frame(maxWidth: .infinity)
            .background(isSelected ? Color.accentColor.opacity(0.18) : Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(isSelected ? Color.accentColor.opacity(0.7) : Color.secondary.opacity(0.18), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }
}
