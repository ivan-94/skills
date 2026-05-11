import AppKit
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: AgentBoardStore
    @State private var selectedBoardID: String = "issues"
    @State private var showingAddWorkspace = false
    @State private var showingSettings = false
    @State private var toastDismissTask: Task<Void, Never>?

    var activeBoard: RenderedBoard? {
        store.renderedBoards.first { $0.id == selectedBoardID } ?? store.renderedBoards.first
    }

    var body: some View {
        NavigationSplitView {
            SidebarView(showingAddWorkspace: $showingAddWorkspace)
                .navigationSplitViewColumnWidth(min: 240, ideal: 280, max: 360)
        } detail: {
            ZStack {
                if store.activeWorkspace == nil {
                    EmptyWorkspaceView(showingAddWorkspace: $showingAddWorkspace)
                } else {
                    BoardDetailView(selectedBoardID: $selectedBoardID, activeBoard: activeBoard)
                }
            }
            .toolbar {
                if store.activeWorkspace != nil, !store.renderedBoards.isEmpty {
                    ToolbarItem(placement: .principal) {
                        BoardToolbarPicker(selectedBoardID: $selectedBoardID)
                            .environmentObject(store)
                    }
                }
                ToolbarItemGroup {
                    MissingLabelsButton()
                    MessageCenterButton()
                    RunnerStatusButton()
                    Button {
                        if let rawURL = store.activeWorkspace?.repoURL, let url = URL(string: rawURL) {
                            NSWorkspace.shared.open(url)
                        }
                    } label: {
                        Label("GitHub", systemImage: "chevron.left.forwardslash.chevron.right")
                    }
                    .disabled(store.activeWorkspace?.repoURL == nil)
                    WorkspaceToolbarMenu()
                    Button {
                        Task { await store.refresh() }
                    } label: {
                        Label(store.isRefreshingInBackground ? "Refreshing" : refreshTitle, systemImage: "arrow.clockwise")
                    }
                    .disabled(store.activeWorkspace == nil || store.isLoading)

                    Button {
                        showingSettings = true
                    } label: {
                        Label("Configure", systemImage: "gearshape")
                    }
                }
            }
        }
        .task {
            store.startAutoRefreshIfNeeded()
        }
        .sheet(isPresented: $showingAddWorkspace) {
            AddWorkspaceView()
                .environmentObject(store)
                .frame(width: 620)
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView()
                .environmentObject(store)
                .frame(minWidth: 1180, minHeight: 780)
        }
        .sheet(item: $store.runDraft) { draft in
            RunActionView(draft: draft)
                .environmentObject(store)
                .frame(width: 920, height: 760)
        }
        .overlay(alignment: .bottomTrailing) {
            if let latest = store.messages.first {
                ToastMessageView(message: latest) {
                    store.removeMessage(latest.id)
                }
                .padding(18)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .onChange(of: store.messages.first?.id) { _, messageID in
            toastDismissTask?.cancel()
            guard let messageID else { return }
            toastDismissTask = Task {
                try? await Task.sleep(for: .seconds(5))
                await MainActor.run {
                    store.removeMessage(messageID)
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .agentBoardAddWorkspace)) { _ in
            showingAddWorkspace = true
        }
        .onChange(of: store.renderedBoards.map(\.id)) { _, boardIDs in
            if !boardIDs.contains(selectedBoardID) {
                selectedBoardID = boardIDs.first ?? "issues"
            }
        }
    }

    private var refreshTitle: String {
        guard let refreshedAt = store.lastRefreshedAt else { return store.isLoading ? "Refreshing" : "Refresh" }
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return "Refresh \(formatter.string(from: refreshedAt))"
    }
}

struct MissingLabelsButton: View {
    @EnvironmentObject private var store: AgentBoardStore
    @State private var showingLabels = false

    var body: some View {
        Button {
            showingLabels.toggle()
        } label: {
            Label("Missing Labels", systemImage: store.missingWorkflowLabels.isEmpty ? "checkmark.seal" : "exclamationmark.triangle")
        }
        .disabled(store.activeWorkspace == nil)
        .popover(isPresented: $showingLabels, arrowEdge: .bottom) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Missing Labels")
                    .font(.headline)
                if store.missingWorkflowLabels.isEmpty {
                    Text("All configured workflow labels exist in GitHub.")
                        .foregroundStyle(.secondary)
                } else {
                    Text("Label creation is not automatic from this warning. Add labels from cards or GitHub as needed.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    ForEach(store.missingWorkflowLabels, id: \.self) { label in
                        Text(label)
                            .font(.system(.caption, design: .monospaced))
                    }
                }
            }
            .padding()
            .frame(width: 320, alignment: .leading)
        }
    }
}

struct RunnerStatusButton: View {
    @EnvironmentObject private var store: AgentBoardStore
    @State private var showingRunners = false

    var body: some View {
        Button {
            showingRunners.toggle()
        } label: {
            Text("Runners \(store.detectedRunnerIDs.count)/\(store.appConfiguration.runners.count)")
        }
        .disabled(store.appConfiguration.runners.isEmpty)
        .popover(isPresented: $showingRunners, arrowEdge: .bottom) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Runners")
                    .font(.headline)
                ForEach(store.appConfiguration.runners) { runner in
                    HStack {
                        Image(systemName: store.detectedRunnerIDs.contains(runner.id) ? "checkmark.circle.fill" : "xmark.circle")
                            .foregroundStyle(store.detectedRunnerIDs.contains(runner.id) ? .green : .secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(runner.label)
                            Text(runner.command)
                                .font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .padding()
            .frame(width: 300, alignment: .leading)
        }
    }
}

struct MessageCenterButton: View {
    @EnvironmentObject private var store: AgentBoardStore
    @State private var showingMessages = false

    var body: some View {
        Button {
            showingMessages.toggle()
        } label: {
            Label("Messages", systemImage: store.messages.isEmpty ? "bell" : "bell.badge")
        }
        .popover(isPresented: $showingMessages, arrowEdge: .bottom) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Messages")
                        .font(.headline)
                    Spacer()
                    Button("Clear") {
                        store.clearMessages()
                    }
                    .disabled(store.messages.isEmpty)
                }

                if store.messages.isEmpty {
                    ContentUnavailableView("No messages", systemImage: "bell")
                        .frame(width: 320, height: 180)
                } else {
                    List {
                        ForEach(store.messages) { message in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(message.title)
                                        .font(.headline)
                                    Spacer()
                                    Button {
                                        store.removeMessage(message.id)
                                    } label: {
                                        Image(systemName: "xmark")
                                    }
                                    .buttonStyle(.plain)
                                }
                                Text(message.detail)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    .frame(width: 360, height: 260)
                }
            }
            .padding()
        }
    }
}

struct ToastMessageView: View {
    var message: BoardMessage
    var dismiss: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "info.circle")
                    .foregroundStyle(Color.accentColor)
                    .padding(.top, 1)
                VStack(alignment: .leading, spacing: 4) {
                    Text(message.title)
                        .font(.headline)
                    Text(message.detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.trailing, 30)

            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.body.weight(.medium))
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(width: 340, alignment: .leading)
        .agentGlassCard(radius: 14)
        .shadow(radius: 14, y: 6)
    }
}

struct BoardToolbarPicker: View {
    @EnvironmentObject private var store: AgentBoardStore
    @Binding var selectedBoardID: String

    var body: some View {
        Picker("Board", selection: $selectedBoardID) {
            ForEach(store.renderedBoards) { board in
                Text(board.configuration.title).tag(board.id)
            }
        }
        .pickerStyle(.segmented)
        .frame(width: 360)
    }
}

struct SidebarView: View {
    @EnvironmentObject private var store: AgentBoardStore
    @Binding var showingAddWorkspace: Bool

    var body: some View {
        List(selection: Binding(
            get: { store.activeWorkspace?.id },
            set: { id in
                guard let id, let workspace = store.appConfiguration.workspaces.first(where: { $0.id == id }) else { return }
                store.selectWorkspace(workspace)
            }
        )) {
            Section("Workspaces") {
                ForEach(store.appConfiguration.workspaces) { workspace in
                    WorkspaceRow(workspace: workspace)
                        .tag(workspace.id)
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button {
                showingAddWorkspace = true
            } label: {
                Label("Add Workspace", systemImage: "plus")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding()
        }
        .navigationTitle("Agent Board")
    }
}

struct WorkspaceRow: View {
    var workspace: Workspace

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(workspace.name)
                .font(.headline)
            Text(workspace.repoSlug)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(.vertical, 4)
    }
}

struct WorkspaceToolbarMenu: View {
    @EnvironmentObject private var store: AgentBoardStore

    var body: some View {
        Menu {
            ForEach(store.appConfiguration.workspaces) { workspace in
                Button {
                    store.selectWorkspace(workspace)
                } label: {
                    Label(workspace.name, systemImage: workspace.id == store.activeWorkspace?.id ? "checkmark" : "folder")
                }
            }
        } label: {
            Label(store.activeWorkspace?.name ?? "Workspace", systemImage: "folder")
        }
        .disabled(store.appConfiguration.workspaces.isEmpty)
    }
}

struct EmptyWorkspaceView: View {
    @Binding var showingAddWorkspace: Bool

    var body: some View {
        ContentUnavailableView {
            Label("Add a Workspace", systemImage: "rectangle.stack.badge.plus")
        } description: {
            Text("Choose a local Git repository with a GitHub remote. Agent Board stores state under ~/.agent-board.")
        } actions: {
            Button("Add Workspace") {
                showingAddWorkspace = true
            }
            .buttonStyle(.borderedProminent)
        }
    }
}

struct BoardDetailView: View {
    @EnvironmentObject private var store: AgentBoardStore
    @Binding var selectedBoardID: String
    var activeBoard: RenderedBoard?

    var body: some View {
        VStack(spacing: 0) {
            if let activeBoard {
                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: AgentMetric.spacing) {
                        ForEach(activeBoard.lanes) { lane in
                            LaneView(board: activeBoard.configuration, lane: lane)
                        }
                    }
                    .padding()
                }
                .background(.background)
            } else if store.isLoading {
                ProgressView("Loading GitHub state...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView("No Board", systemImage: "square.grid.3x3")
            }
        }
    }
}

struct LaneView: View {
    @EnvironmentObject private var store: AgentBoardStore
    var board: BoardConfiguration
    var lane: RenderedLane

    var selectedItems: [BoardItem] {
        lane.items.filter { store.selectedIDs.contains($0.id) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(lane.configuration.title)
                        .font(.headline)
                    Text(selectedItems.isEmpty ? "\(lane.items.count) items" : "\(selectedItems.count) selected")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if !selectedItems.isEmpty {
                    Menu {
                        ForEach(lane.configuration.actions) { action in
                            Button(action.title) {
                                store.openRunDraft(board: board, lane: lane.configuration, action: action, items: selectedItems)
                            }
                        }
                        if lane.configuration.actions.isEmpty {
                            Text("No actions")
                        }
                    } label: {
                        Label("Actions", systemImage: "bolt")
                    }
                    .menuStyle(.borderlessButton)
                }
            }
            .padding()

            Divider()

            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(lane.items) { item in
                        ItemCard(item: item)
                    }
                    if lane.items.isEmpty {
                        ContentUnavailableView("No items here", systemImage: "tray")
                            .frame(height: 180)
                    }
                }
                .padding()
            }
        }
        .frame(width: AgentMetric.laneWidth)
        .agentGlassCard()
    }
}

struct ItemCard: View {
    @EnvironmentObject private var store: AgentBoardStore
    var item: BoardItem
    @State private var showingLabelPicker = false

    var isSelected: Bool { store.selectedIDs.contains(item.id) }
    var isRunning: Bool { store.runningItemIDs.contains(item.id) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Toggle("", isOn: Binding(
                    get: { isSelected },
                    set: { selected in
                        if selected { store.selectedIDs.insert(item.id) }
                        else { store.selectedIDs.remove(item.id) }
                    }
                ))
                .toggleStyle(.checkbox)
                Text(item.ref)
                    .font(.headline.monospacedDigit())
                if isRunning {
                    ProgressView()
                        .controlSize(.small)
                }
                Spacer()
                Button {
                    if let url = URL(string: item.url) {
                        NSWorkspace.shared.open(url)
                    }
                } label: {
                    Image(systemName: "arrow.up.right.square")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            }

            Text(item.title)
                .font(.headline)
                .lineLimit(3)

            Text(itemSubtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)

            FlowLayout(spacing: 6) {
                if item.labels.isEmpty {
                    Text("no labels")
                        .font(.caption.weight(.medium))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(.quaternary, in: Capsule())
                } else {
                    ForEach(item.labels, id: \.self) { label in
                        LabelChip(item: item, label: label)
                    }
                }
                Button {
                    showingLabelPicker.toggle()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                        Text("Label")
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                .font(.caption.weight(.medium))
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(.quaternary, in: Capsule())
                .popover(isPresented: $showingLabelPicker, arrowEdge: .bottom) {
                    LabelPickerPopover(item: item) {
                        showingLabelPicker = false
                    }
                }
            }
        }
        .padding(12)
        .agentInteractiveGlass(radius: AgentMetric.cardRadius)
        .overlay {
            RoundedRectangle(cornerRadius: AgentMetric.cardRadius, style: .continuous)
                .stroke(isSelected ? Color.accentColor : Color.clear, lineWidth: 2)
        }
    }

    var itemSubtitle: String {
        if item.itemType == .issue {
            "by \(item.author) · assignee: \(item.assignees.isEmpty ? "none" : item.assignees.joined(separator: ", "))"
        } else {
            "\(item.isDraft ? "draft" : "ready") · \(item.headRefName ?? "?") → \(item.baseRefName ?? "?")"
        }
    }
}

struct LabelChip: View {
    @EnvironmentObject private var store: AgentBoardStore
    var item: BoardItem
    var label: String

    var mutationID: String {
        store.labelMutationID(itemID: item.id, action: .remove, label: label)
    }

    var isMutating: Bool {
        store.labelMutationIDs.contains(mutationID)
    }

    var body: some View {
        HStack(spacing: 4) {
            Text(label)
                .lineLimit(1)
            Button {
                Task { await store.updateLabel(item: item, action: .remove, label: label) }
            } label: {
                if isMutating {
                    ProgressView()
                        .controlSize(.mini)
                } else {
                    Image(systemName: "xmark")
                        .font(.caption2)
                }
            }
            .buttonStyle(.plain)
            .disabled(isMutating)
            .help("Remove label")
        }
        .font(.caption.weight(.medium))
        .padding(.leading, 8)
        .padding(.trailing, 6)
        .padding(.vertical, 4)
        .background(.quaternary, in: Capsule())
    }
}

struct LabelPickerPopover: View {
    @EnvironmentObject private var store: AgentBoardStore
    var item: BoardItem
    var dismiss: () -> Void
    @State private var query = ""

    var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var availableLabels: [String] {
        store.repositoryLabels
            .filter { !item.labels.contains($0) }
            .filter { trimmedQuery.isEmpty || $0.localizedCaseInsensitiveContains(trimmedQuery) }
            .sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    var isAddingQuery: Bool {
        guard !trimmedQuery.isEmpty else { return false }
        let mutationID = store.labelMutationID(itemID: item.id, action: .add, label: trimmedQuery)
        return store.labelMutationIDs.contains(mutationID)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Add Label")
                .font(.headline)

            TextField("Search or create label", text: $query)
                .textFieldStyle(.roundedBorder)
                .onSubmit(addQueryLabel)

            if !trimmedQuery.isEmpty && !store.repositoryLabels.contains(where: { $0.caseInsensitiveCompare(trimmedQuery) == .orderedSame }) {
                Button(action: addQueryLabel) {
                    HStack {
                        Label("Create and add", systemImage: "plus.circle")
                        Spacer()
                        Text(trimmedQuery)
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                    }
                }
                .disabled(isAddingQuery)
            }

            Divider()

            if availableLabels.isEmpty {
                ContentUnavailableView("No matching labels", systemImage: "tag")
                    .frame(width: 320, height: 120)
            } else {
                ScrollView {
                    LazyVStack(spacing: 6) {
                        ForEach(availableLabels.prefix(80), id: \.self) { label in
                            let mutationID = store.labelMutationID(itemID: item.id, action: .add, label: label)
                            let isMutating = store.labelMutationIDs.contains(mutationID)
                            Button {
                                Task {
                                    await store.updateLabel(item: item, action: .add, label: label)
                                    dismiss()
                                }
                            } label: {
                                HStack {
                                    Text(label)
                                        .font(.caption.weight(.medium))
                                    Spacer()
                                    if isMutating {
                                        ProgressView()
                                            .controlSize(.mini)
                                    } else {
                                        Image(systemName: "plus")
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 7)
                                .background(.quaternary, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .disabled(isMutating)
                        }
                    }
                }
                .frame(width: 320, height: 220)
            }
        }
        .padding(14)
        .frame(width: 348)
    }

    private func addQueryLabel() {
        guard !trimmedQuery.isEmpty else { return }
        let label = trimmedQuery
        Task {
            await store.updateLabel(item: item, action: .add, label: label)
            dismiss()
        }
    }
}

struct AddWorkspaceView: View {
    @EnvironmentObject private var store: AgentBoardStore
    @Environment(\.dismiss) private var dismiss
    @State private var path = ""
    @State private var name = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Add Workspace")
                    .font(.title2.bold())
                Text("Choose a local Git repository with a GitHub remote. The first GitHub remote is used.")
                    .foregroundStyle(.secondary)
            }

            Form {
                TextField("Repository path", text: $path)
                TextField("Display name", text: $name)
            }

            HStack {
                Button("Browse...") {
                    let panel = NSOpenPanel()
                    panel.canChooseDirectories = true
                    panel.canChooseFiles = false
                    if panel.runModal() == .OK, let url = panel.url {
                        path = url.path
                    }
                }
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Add") {
                    Task {
                        await store.addWorkspace(path: path, displayName: name)
                        if store.activeWorkspace != nil { dismiss() }
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(path.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(24)
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 260
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
