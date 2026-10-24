"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";

import {
  Conversation,
  ConversationList as ConversationListComp,
  ChannelSidebar,
  MessageList,
  MessageInput,
  ChatHeader,
  KnowledgeBrowser,
  KnowledgeArticleDetail,
  CANewsFeed,
  NotificationPanel,
  Tab,
  type KnowledgeArticle,
} from "@/components/MessagingComponents";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/ui";
import { api, buildQuery, ApiError } from "@/lib/api";
import { cn } from "@/lib/format";
import { useSession } from "@/lib/session";

export default function CommunicationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("conversations");
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKBArticle, setSelectedKBArticle] = useState<KnowledgeArticle | null>(null);
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "conversations", label: "Messages", icon: "messages-square" },
    { id: "channels", label: "Channels", icon: "messages-square" },
    { id: "knowledge", label: "Knowledge Base", icon: "file-text" },
    { id: "notifications", label: "Notifications", icon: "bell" },
  ];

  // ── Conversations query ──
  const {
    data: conversationsData,
    isLoading: conversationsLoading,
    error: conversationsError,
    refetch: refetchConversations,
  } = useQuery({
    queryKey: ["messaging", "conversations", searchQuery],
    queryFn: () =>
      api.get<any>(
        `/messaging/conversations${buildQuery({ search: searchQuery || undefined, limit: 50 })}`,
      ),
    staleTime: 15000,
  });

  // ── Messages query ──
  const {
    data: messagesData,
    isLoading: messagesLoading,
    error: messagesError,
  } = useQuery({
    queryKey: ["messaging", "messages", activeConversation],
    queryFn: () =>
      activeConversation
        ? api.get<any>(`/messaging/conversations/${activeConversation}/messages?limit=50`)
        : Promise.resolve({ items: [], meta: {} }),
    staleTime: 5000,
    enabled: !!activeConversation,
  });

  // ── Channels query ──
  const {
    data: channelsData,
    isLoading: channelsLoading,
  } = useQuery({
    queryKey: ["messaging", "channels"],
    queryFn: () => api.get<any>(`/messaging/conversations?limit=100`),
    staleTime: 30000,
  });

  // ── Knowledge articles query ──
  const {
    data: knowledgeData,
    isLoading: knowledgeLoading,
   } = useQuery({
    queryKey: ["messaging", "knowledge", searchQuery],
    queryFn: () =>
      api.get<any>(
        `/messaging/knowledge?search=${encodeURIComponent(searchQuery)}&limit=100`,
      ),
    staleTime: 60000,
  });

  // ── CA News feed (regulatory/GST/tax updates) ──
  const {
    data: caNewsData,
    isLoading: caNewsLoading,
  } = useQuery({
    queryKey: ["messaging", "knowledge", "ca-news"],
    queryFn: () =>
      api.get<any>(`/messaging/knowledge?category=${encodeURIComponent("CA News")}&limit=50`),
    staleTime: 10 * 60 * 1000,
  });

  // ── Notifications query ──
  const {
    data: notificationsData,
    isLoading: notificationsLoading,
    refetch: refetchNotifications,
  } = useQuery({
    queryKey: ["messaging", "notifications"],
    queryFn: () => api.get<any>("/messaging/notifications?limit=50"),
    staleTime: 10000,
  });

  // ── Mutations ──
  const sendMessageMutation = useMutation({
    mutationFn: ({ convId, body }: { convId: string; body: string }) =>
      api.post(`/messaging/conversations/${convId}/messages`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messaging", "messages", activeConversation] });
      queryClient.invalidateQueries({ queryKey: ["messaging", "conversations"] });
    },
  });

  const reactionMutation = useMutation({
    mutationFn: ({ msgId, emoji }: { msgId: string; emoji: string }) =>
      api.post(`/messaging/messages/${msgId}/reactions`, { emoji }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messaging", "messages", activeConversation] });
    },
  });

  const saveMessageMutation = useMutation({
    mutationFn: (msgId: string) => api.post(`/messaging/messages/${msgId}/save`, {}),
  });

  const createConversationMutation = useMutation({
    mutationFn: (payload: {
      type: string;
      name?: string;
      description?: string;
      channel_type?: string;
      is_private?: boolean;
      participant_ids?: string[];
    }) => api.post<any>("/messaging/conversations", payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["messaging", "conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messaging", "channels"] });
      if (created?.id) {
        setActiveConversation(created.id);
        setActiveTab("conversations");
      }
    },
  });

  const suggestedRepliesMutation = useMutation({
    mutationFn: (convId: string) =>
      api.post(`/messaging/ai/suggested-replies`, { conversation_id: convId }),
    onSuccess: (data: any) => {
      console.log("Suggested replies:", data);
    },
  });

  // ── Handlers ──
  const handleSendMessage = useCallback(
    (body: string) => {
      if (!activeConversation) return;
      sendMessageMutation.mutate({ convId: activeConversation, body });
    },
    [activeConversation, sendMessageMutation],
  );

  const handleReaction = useCallback(
    (messageId: string, emoji: string) => {
      reactionMutation.mutate({ msgId: messageId, emoji });
    },
    [reactionMutation],
  );

  const handleReply = useCallback((messageId: string) => {
    console.log("Reply to message:", messageId);
  }, []);

  const handleSave = useCallback(
    (messageId: string) => {
      saveMessageMutation.mutate(messageId);
    },
    [saveMessageMutation],
  );

  const handleNewChannel = useCallback(() => {
    const name = window.prompt("Channel name")?.trim();
    if (!name) {
      return;
    }
    createConversationMutation.mutate({
      type: "channel",
      name,
      channel_type: "public",
      is_private: false,
    });
  }, [createConversationMutation]);

  // ── New direct message: pick a teammate ─────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dmSearch, setDmSearch] = useState("");
  const contactsQuery = useQuery({
    queryKey: ["users", "directory"],
    queryFn: () => api.get<{ items: Array<{ id: string; full_name: string; email: string }> }>(
      `/users${buildQuery({ status: "active", limit: 100 })}`
    ),
    staleTime: 60_000,
  });
  const handleOpenPicker = useCallback(() => {
    contactsQuery.refetch();
    setPickerOpen(true);
  }, [contactsQuery]);
  const handleStartDM = useCallback(
    (userId: string) => {
      createConversationMutation.mutate(
        { type: "direct", participant_ids: [userId] },
        {
          onSuccess: (created: any) => {
            queryClient.invalidateQueries({ queryKey: ["messaging", "conversations"] });
            queryClient.invalidateQueries({ queryKey: ["messaging", "channels"] });
            if (created?.id) {
              setActiveConversation(created.id);
              setActiveTab("conversations");
            }
          },
        },
      );
      setPickerOpen(false);
    },
    [createConversationMutation, queryClient],
  );

  const handleSelectConversation = useCallback((conv: Conversation) => {
    setActiveConversation(conv.id);
    setActiveTab("conversations");
    // Mark notifications as read
    const unreadIds = notificationsData?.items
      ?.filter((n: any) => !n.is_read && n.conversation_id === conv.id)
      .map((n: any) => n.id) || [];
    if (unreadIds.length > 0) {
      api.post("/messaging/notifications/mark-read", unreadIds).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["messaging", "notifications"] });
    }
  }, [notificationsData, queryClient]);

  const conversations = conversationsData?.items || [];
  const channels = channelsData?.items?.filter((c: any) => c.is_channel && c.type === "channel") || [];
  const articles = knowledgeData?.items || [];
  const notifications = notificationsData?.items || [];
  const unreadCount = notificationsData?.unread_count || 0;

  const handleAIConversation = async (conversationId: string, question: string) => {
    try {
      const res = await api.post(`/messaging/ai/analyze`, {
        conversation_id: conversationId,
        question,
      });
      return res;
    } catch (e) {
      console.error("AI error:", e);
      return null;
    }
  };

  const conversationsErrorObj = conversationsError instanceof ApiError ? conversationsError : null;
  const messagesErrorObj = messagesError instanceof ApiError ? messagesError : null;

  // Determine if we're in "chat" view (conversation active)
  const inChatView = activeConversation && activeTab === "conversations";

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <PageHeader
        title="Communications"
        subtitle="Internal conversations, channels, and knowledge base powered by Kilo AI."
      />
      <div className="mb-3 flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-sm font-medium">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setActiveTab(t.id); setActiveConversation(null); }}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition",
              activeTab === t.id
                ? "bg-white text-sky-900 shadow-sm ring-1 ring-sky-200"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <Icon name={t.icon as any} className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="w-80 max-w-[90vw] rounded-lg bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-sm font-semibold">Start a conversation</h3>
            <input
              className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-sm outline-none ring-slate-400"
              placeholder="Search team members..."
              value={dmSearch}
              onChange={(e) => setDmSearch(e.target.value)}
              autoFocus
            />
            {contactsQuery.isLoading && <p className="text-xs text-slate-500">Loading…</p>}
            <div className="max-h-60 overflow-y-auto">
              {(contactsQuery.data?.items || []).map((u) =>
                u.full_name.toLowerCase().includes(dmSearch.toLowerCase()) ? (
                  <button
                    key={u.id}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                    onClick={() => handleStartDM(u.id)}
                  >
                    <span>{u.full_name}</span>
                    <span className="text-xs text-slate-500">{u.email}</span>
                  </button>
                ) : null,
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex h-full">
          {/* Left sidebar depends on tab */}
          {activeTab === "conversations" && (
            <ConversationListComp
              conversations={conversations}
              isLoading={conversationsLoading}
              error={conversationsErrorObj}
              onSelect={handleSelectConversation}
              selectedId={activeConversation}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onNewConversation={handleOpenPicker}
              unreadCount={unreadCount}
            />
          )}

          {activeTab === "channels" && (
            <ChannelSidebar
              channels={channels}
              isLoading={channelsLoading}
              onSelectChannel={(conv) => { setActiveConversation(conv.id); setActiveTab("channels"); }}
              selectedChannel={activeConversation}
              onNewChannel={handleNewChannel}
            />
          )}

          {activeTab === "knowledge" && (
            <div className="flex w-80 flex-col">
              <CANewsFeed
                articles={caNewsData?.items || []}
                isLoading={caNewsLoading}
                onArticleClick={setSelectedKBArticle}
              />
              <KnowledgeBrowser
                articles={articles}
                isLoading={knowledgeLoading}
                onSearch={setSearchQuery}
                onArticleClick={setSelectedKBArticle}
                searchQuery={searchQuery}
              />
            </div>
          )}

          {activeTab === "notifications" && (
            <NotificationPanel
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkRead={async (ids) => {
                await api.post("/messaging/notifications/mark-read", ids);
                queryClient.invalidateQueries({ queryKey: ["messaging", "notifications"] });
              }}
              onSelect={() => {}}
            />
          )}

          {/* Main content area */}
          <div className="flex flex-1 flex-col">
            {(inChatView || (activeTab === "channels" && activeConversation)) ? (
              <>
                <ChatHeader
                  conversation={
                    conversations.find((c: Conversation) => c.id === activeConversation) ||
                    channels.find((c: Conversation) => c.id === activeConversation) ||
                    conversations[0]!
                  }
                  participants={[]}
                  onInfo={() => {}}
                  onSettings={() => {}}
                />
                {messagesLoading ? (
                  <div className="flex-1 overflow-y-auto p-4">
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-8 animate-pulse rounded-lg bg-slate-200/50" />
                      ))}
                    </div>
                  </div>
                ) : (
                  <MessageList
                    messages={messagesData?.items || []}
                    conversation={
                      conversations.find((c: Conversation) => c.id === activeConversation) ||
                      channels.find((c: Conversation) => c.id === activeConversation) ||
                      conversations[0]!
                    }
                    currentUserId={session?.user?.id}
                    onReaction={handleReaction}
                    onReply={handleReply}
                    onSave={handleSave}
                  />
                )}
                <MessageInput
                  onSend={handleSendMessage}
                  aiSuggestions={undefined}
                  onSuggestionClick={undefined}
                  isLoading={sendMessageMutation.isPending}
                />
              </>
             ) : activeTab === "knowledge" && selectedKBArticle ? (
               <KnowledgeArticleDetail
                 article={selectedKBArticle}
                 onBack={() => setSelectedKBArticle(null)}
               />
             ) : activeTab === "knowledge" && articles.length > 0 ? (
               <KnowledgeArticleDetail
                 article={articles[0]}
                 onBack={() => {}}
               />
            ) : (
              <div className="flex-1 overflow-y-auto p-6">
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 rounded-full bg-sky-100 p-4">
                    <Icon name="messages-square" className="h-8 w-8 text-sky-600" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-900 mb-2">
                    {activeTab === "conversations"
                      ? "Select a conversation"
                      : activeTab === "channels"
                      ? "Select a channel"
                      : "Select a knowledge article"}
                  </h3>
                  <p className="max-w-md text-sm text-slate-500">
                    {activeTab === "conversations"
                      ? "Choose a conversation from the list to start messaging. You can search, react with emojis, and get AI-suggested replies."
                      : activeTab === "channels"
                      ? "Browse channels for team-wide announcements and discussions."
                      : "Browse the knowledge base for firm policies, procedures, and articles."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



