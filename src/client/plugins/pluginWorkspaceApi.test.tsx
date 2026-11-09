import { afterEach, describe, expect, test } from "vite-plus/test"
import { MemoryRouter, useLocation } from "react-router-dom"
import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { EMPTY_CHAT_ACTIVITY, type SidebarChatRow, type SidebarData, type SidebarProjectGroup } from "../../shared/types"
import { EMPTY_SIDEBAR_DATA, useKannaStateStore } from "../stores/kannaStateStore"
import { createPluginHostRegistry } from "./hostModuleRegistry"
import {
  buildWorkspaceProjects,
  projectNameFromPath,
  useKannaWorkspace,
  usePluginWorkspaceActionsStore,
  type PluginWorkspace,
} from "./pluginWorkspaceApi"

function row(chatId: string, localPath: string, lastMessageAt?: number): SidebarChatRow {
  return {
    _id: chatId,
    _creationTime: 0,
    chatId,
    title: `title-${chatId}`,
    status: "idle",
    unread: false,
    localPath,
    provider: null,
    lastMessageAt,
    activity: EMPTY_CHAT_ACTIVITY,
  }
}

function group(localPath: string, chats: SidebarChatRow[], extra: Partial<SidebarProjectGroup> = {}): SidebarProjectGroup {
  return { groupKey: localPath, localPath, chats, previewChats: [], olderChats: [], defaultCollapsed: false, ...extra }
}

describe("projectNameFromPath", () => {
  test("uses the last path segment for posix and windows paths", () => {
    expect(projectNameFromPath("/root/Kanna/chat-chi")).toBe("chat-chi")
    expect(projectNameFromPath("D:\\TOMAX\\Reports\\Reports")).toBe("Reports")
    expect(projectNameFromPath("/root/Kanna/vcc/")).toBe("vcc")
    expect(projectNameFromPath("/")).toBe("/")
  })
})

describe("buildWorkspaceProjects", () => {
  test("lists starred and regular projects with their chats, newest first and without duplicates", () => {
    const data: SidebarData = {
      starredProjectGroups: [group("/a", [row("c1", "/a", 10)], { starredAt: 1 })],
      projectGroups: [
        group("/b", [row("c2", "/b", 5)], {
          previewChats: [row("c2", "/b", 5)],
          olderChats: [row("c3", "/b", 20)],
        }),
      ],
      stacks: [],
    }

    const projects = buildWorkspaceProjects(data)

    expect(projects.map((project) => project.name)).toEqual(["a", "b"])
    expect(projects[1].chats.map((chat) => chat.chatId)).toEqual(["c3", "c2"])
    expect(projects[0].chats[0]).toMatchObject({ chatId: "c1", title: "title-c1", status: "idle", unread: false })
  })

  test("a project with no chat is still listed", () => {
    const projects = buildWorkspaceProjects({ ...EMPTY_SIDEBAR_DATA, projectGroups: [group("/empty", [])] })
    expect(projects).toEqual([{ localPath: "/empty", name: "empty", chats: [] }])
  })
})

describe("host module registry", () => {
  test("hands useKannaWorkspace to plugins through @kanna/plugin", () => {
    const loaded = createPluginHostRegistry().require("@kanna/plugin")
    expect(loaded).toMatchObject({ useKannaWorkspace })
  })
})

describe("useKannaWorkspace", () => {
  let root: Root | null = null
  let container: HTMLElement | null = null

  afterEach(() => {
    if (root) act(() => root?.unmount())
    root = null
    container?.remove()
    container = null
    useKannaStateStore.setState({ sidebarData: EMPTY_SIDEBAR_DATA, sidebarReady: false })
    usePluginWorkspaceActionsStore.getState().setStartChat(null)
  })

  function mount() {
    const captured: { workspace: PluginWorkspace | null; path: string } = { workspace: null, path: "/" }
    const record = (workspace: PluginWorkspace, path: string) => {
      captured.workspace = workspace
      captured.path = path
    }
    function Probe({ onRender }: { onRender: (workspace: PluginWorkspace, path: string) => void }) {
      const workspace = useKannaWorkspace()
      const { pathname } = useLocation()
      useEffect(() => {
        onRender(workspace, pathname)
      })
      return null
    }
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() => root?.render(<MemoryRouter><Probe onRender={record} /></MemoryRouter>))
    return captured
  }

  test("reflects the sidebar store and navigates to a chat", () => {
    useKannaStateStore.setState({
      sidebarData: { ...EMPTY_SIDEBAR_DATA, projectGroups: [group("/a", [row("c1", "/a", 1)])] },
      sidebarReady: true,
    })
    const captured = mount()

    expect(captured.workspace?.ready).toBe(true)
    expect(captured.workspace?.projects[0].chats[0].chatId).toBe("c1")

    act(() => captured.workspace?.openChat("c1"))
    expect(captured.path).toBe("/chat/c1")
  })

  test("starts a chat through the action the app registered, and refuses before that", async () => {
    const captured = mount()
    await expect(captured.workspace?.startChat("/a")).rejects.toThrow("not ready")

    const started: string[] = []
    act(() => usePluginWorkspaceActionsStore.getState().setStartChat(async (localPath) => { started.push(localPath) }))
    await captured.workspace?.startChat("/a")
    expect(started).toEqual(["/a"])
  })
})
