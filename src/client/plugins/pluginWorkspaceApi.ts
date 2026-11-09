import { useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { create } from "zustand"
import { allProjectGroups } from "../../shared/sidebar-data"
import type { KannaStatus, SidebarChatRow, SidebarData } from "../../shared/types"
import { chatPath } from "../lib/paneTree"
import { useKannaStateStore } from "../stores/kannaStateStore"

export interface PluginWorkspaceChat {
  readonly chatId: string
  readonly title: string
  readonly status: KannaStatus
  readonly unread: boolean
  readonly lastMessageAt: number | null
}

export interface PluginWorkspaceProject {
  readonly localPath: string
  readonly name: string
  readonly chats: readonly PluginWorkspaceChat[]
}

export interface PluginWorkspace {
  readonly projects: readonly PluginWorkspaceProject[]
  readonly ready: boolean
  openChat(chatId: string): void
  startChat(localPath: string): Promise<void>
}

type StartChatFn = (localPath: string) => Promise<void>

interface PluginWorkspaceActionsState {
  startChat: StartChatFn | null
  setStartChat: (startChat: StartChatFn | null) => void
}

export const usePluginWorkspaceActionsStore = create<PluginWorkspaceActionsState>()((set) => ({
  startChat: null,
  setStartChat: (startChat) => set({ startChat }),
}))

const PATH_SEPARATORS = /[\\/]+/

export function projectNameFromPath(localPath: string): string {
  const parts = localPath.split(PATH_SEPARATORS).filter((part) => part.length > 0)
  return parts.at(-1) ?? localPath
}

function toWorkspaceChat(row: SidebarChatRow): PluginWorkspaceChat {
  return {
    chatId: row.chatId,
    title: row.title,
    status: row.status,
    unread: row.unread,
    lastMessageAt: row.lastMessageAt ?? null,
  }
}

function recency(chat: PluginWorkspaceChat): number {
  return chat.lastMessageAt ?? 0
}

export function buildWorkspaceProjects(data: SidebarData): PluginWorkspaceProject[] {
  const byPath = new Map<string, Map<string, PluginWorkspaceChat>>()
  for (const group of allProjectGroups(data)) {
    const chats = byPath.get(group.localPath) ?? new Map<string, PluginWorkspaceChat>()
    for (const row of [...group.chats, ...group.previewChats, ...group.olderChats]) {
      if (!chats.has(row.chatId)) chats.set(row.chatId, toWorkspaceChat(row))
    }
    byPath.set(group.localPath, chats)
  }
  return [...byPath.entries()].map(([localPath, chats]) => ({
    localPath,
    name: projectNameFromPath(localPath),
    chats: [...chats.values()].sort((left, right) => recency(right) - recency(left)),
  }))
}

export function useKannaWorkspace(): PluginWorkspace {
  const sidebarData = useKannaStateStore((state) => state.sidebarData)
  const ready = useKannaStateStore((state) => state.sidebarReady)
  const startChatAction = usePluginWorkspaceActionsStore((state) => state.startChat)
  const navigate = useNavigate()

  const projects = useMemo(() => buildWorkspaceProjects(sidebarData), [sidebarData])
  const openChat = useCallback((chatId: string) => navigate(chatPath(chatId)), [navigate])
  const startChat = useCallback(
    async (localPath: string) => {
      if (!startChatAction) throw new Error("Kanna is not ready to start a chat yet.")
      await startChatAction(localPath)
    },
    [startChatAction],
  )

  return useMemo(() => ({ projects, ready, openChat, startChat }), [projects, ready, openChat, startChat])
}
