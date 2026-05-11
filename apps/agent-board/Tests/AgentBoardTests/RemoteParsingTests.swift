import Testing
@testable import AgentBoard

@Test func parsesGitHubSshRemote() {
    #expect(parseGitHubRemote("git@github.com:ivan-94/sharge_app_server.git") == "ivan-94/sharge_app_server")
}

@Test func parsesGitHubHttpsRemote() {
    #expect(parseGitHubRemote("https://github.com/ivan-94/sharge_app_server.git") == "ivan-94/sharge_app_server")
}

@Test func parsesRemoteLineWithTabSeparator() {
    let remote = parseGitHubRemoteLine("github\tgit@github.com:ivan-94/sharge_app_server.git (fetch)")
    #expect(remote?.name == "github")
    #expect(remote?.slug == "ivan-94/sharge_app_server")
}

@Test func ignoresNonGitHubRemoteLine() {
    let remote = parseGitHubRemoteLine("origin\tgit@codeup.aliyun.com:685a564391483e233edca392/user_service/sharge_app_server.git (fetch)")
    #expect(remote == nil)
}

@Test func defaultInboxIncludesLabeledUnassignedWork() throws {
    let issuesBoard = try #require(BoardConfiguration.defaults.first { $0.id == "issues" })
    let inbox = try #require(issuesBoard.lanes.first { $0.id == "inbox" })
    #expect(inbox.query.includeUnlabeled == nil)
    #expect(inbox.query.labelsNone == ["needs-info", "ready-for-agent", "ready-for-human", "wontfix"])
}
