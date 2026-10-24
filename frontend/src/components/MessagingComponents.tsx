"use client"

import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import { Badge, EmptyState } from "@/components/ui";
import { cn } from "@/lib/format";

export interface Conversation {
  id: string;
  type: "direct" | "group" | "channel";
  name: string | null;
  avatar_url: string | null;
  description: string | null;
  is_channel: boolean;
  channel_type: string | null;
  is_private: boolean;
  is_readonly: boolean;
  is_confidential: boolean;
  unread_count?: number;
  updated_at: string;
  last_message?: MessageBrief;
  participant_count: number;
}

export interface MessageBrief {
  id: string;
  sender_name: string | null;
  body: string | null;
  created_at: string;
  reaction_counts?: Record<string, number>;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_name: string | null;
  sender_avatar_url: string | null;
  parent_message_id: string | null;
  body: string | null;
  message_type: string;
  is_edited: boolean;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
  ai_summary: string | null;
  ai_suggested_reply: string | null;
  reaction_counts: Record<string, number>;
  current_user_reactions: string[];
  reply_count: number;
  attachments: Attachment[];
}

export interface Attachment {
  id: string;
  document_id: string;
  document_name: string | null;
  document_size: number | null;
  document_content_type: string | null;
  created_at: string;
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  category: string | null;
  tags: string[];
  is_published: boolean;
  version_number: number;
  external_id: string | null;
  source_url: string | null;
  published_at: string | null;
  created_by_id: string | null;
  updated_at: string;
}

export interface Notification {
  id: string;
  sender_name: string | null;
  conversation_id: string | null;
  message_id: string | null;
  event_type: string;
  title: string | null;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

export type Tab = "conversations" | "channels" | "knowledge" | "notifications";

const REACTION_PICK: string[] = ["👍", "❤️", "😄", "🤔", "👏", "🎉", "🚀", "👎"];

/**
 * Conversation list sidebar - the left-most panel.
 * Shows recent conversations, channels, and provides a search box.
 */
export function ConversationList({
  conversations,
  isLoading,
  error,
  onSelect,
  selectedId,
  searchQuery,
  onSearchChange,
  onNewConversation,
  unreadCount,
}: {
  conversations: Conversation[];
  isLoading: boolean;
  error: Error | null;
  onSelect: (conversation: Conversation) => void;
  selectedId: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onNewConversation: () => void;
  unreadCount?: number;
}) {
  if (error) {
    return (
      <div className="flex h-full flex-col overflow-y-auto border-r border-slate-200 bg-slate-50/50 p-3">
        <div className="px-3 text-xs font-medium uppercase text-slate-400">
          Conversations
        </div>
        <p className="p-4 text-center text-sm text-rose-600">
          {error.message || "Failed to load conversations"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto border-r border-slate-200 bg-slate-50/50">
      <div className="border-b border-slate-200 px-3 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="relative flex-1">
            <Icon name="search" className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="search"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-100"
            />
          </div>
          <button
            type="button"
            onClick={onNewConversation}
            className="ml-2 rounded-lg bg-sky-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-sky-600"
          >
            <Icon name="plus" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-200/50" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No conversations"
              message={searchQuery ? "No matches found. Try a different search." : "Start a new conversation to get going."}
            />
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationRow
              key={conv.id}
              conv={conv}
              selected={conv.id === selectedId}
              onSelect={() => onSelect(conv)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ConversationRow({
  conv,
  selected,
  onSelect,
}: {
  conv: Conversation;
  selected: boolean;
  onSelect: () => void;
}) {
  const displayName = conv.name || "Unnamed conversation";
  const isUnread = (conv.unread_count || 0) > 0;
  const lastMsg = conv.last_message;
  const timeLabel = lastMsg
    ? new Date(lastMsg.created_at).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition-colors hover:bg-slate-100/50",
        selected ? "bg-sky-50/50" : "",
      )}
    >
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-white">
        {conv.is_channel ? (
          <Icon name="messages-square" className="h-5 w-5" />
        ) : (
          <span className="text-sm font-medium">
            {displayName.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <span
              className={cn(
                "text-sm font-medium",
                isUnread ? "text-slate-900" : "text-slate-600",
              )}
            >
              {displayName}
            </span>
            {conv.is_confidential && (
              <Icon name="shield-check" className="h-3 w-3 text-amber-500" />
            )}
          </div>
          {timeLabel && (
            <span
              className={cn(
                "text-xs",
                isUnread ? "text-sky-600 font-medium" : "text-slate-400",
              )}
            >
              {timeLabel}
            </span>
          )}
        </div>
        {lastMsg && (
          <div
            className={cn(
              "mt-0.5 line-clamp-1 text-xs",
              isUnread ? "text-slate-700 font-medium" : "text-slate-500",
            )}
          >
            {lastMsg.sender_name && (
              <span className="font-medium">{lastMsg.sender_name}:</span>
            )}{" "}
            {lastMsg.body || "Attachment"}
          </div>
        )}
        {isUnread && (
          <div className="mt-0.5">
            <Badge tone="info" className="px-1.5 py-0 text-xs">
              {conv.unread_count}
            </Badge>
          </div>
        )}
      </div>
    </button>
  );
}
/**
 * Message list - the central panel content area.
 */
export function MessageList({
  messages,
  conversation,
  currentUserId,
  onReaction,
  onReply,
  onSave,
}: {
  messages: Message[];
  conversation: Conversation;
  currentUserId?: string;
  onReaction: (messageId: string, emoji: string) => void;
  onReply: (messageId: string) => void;
  onSave: (messageId: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-50 to-slate-100/30">
      <div className="space-y-4 px-4 py-4">
        {messages.map((msg, idx) => {
          const isOwn = msg.sender_id === currentUserId;
          const isFirst = idx === 0 || messages[idx - 1]?.sender_id !== msg.sender_id;

          return (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isOwn={isOwn}
              isFirst={isFirst}
              onReaction={onReaction}
              onReply={onReply}
              onSave={onSave}
            />
          );
        })}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}

interface MessageBubbleProps {
  msg: Message;
  isOwn: boolean;
  isFirst: boolean;
  onReaction: (messageId: string, emoji: string) => void;
  onReply: (messageId: string) => void;
  onSave: (messageId: string) => void;
}

﻿function MessageBubble({
  msg,
  isOwn,
  isFirst,
  onReaction,
  onReply,
  onSave,
}: MessageBubbleProps) {
  const [showReactions, setShowReactions] = useState(false);

  const timeLabel = new Date(msg.created_at).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div
      className={cn(
        "group relative flex gap-2.5 px-1",
        isOwn ? "justify-end" : "justify-start",
      )}
    >
      {!isOwn && isFirst && (
        <div className="mt-4 h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 text-white flex items-center justify-center text-xs font-medium">
          {msg.sender_name?.[0] || "?"}
        </div>
      )}
      {!isFirst && !isOwn && <div className="w-8 shrink-0" />}

      <div
        className={cn(
          "relative max-w-[70%] rounded-2xl px-3.5 py-2 text-sm",
          isOwn
            ? "rounded-br-md bg-sky-500 text-white"
            : "rounded-bl-md bg-white shadow-sm ring-1 ring-slate-100",
          !isFirst && isOwn && "rounded-tr-md",
          !isFirst && !isOwn && "rounded-tl-md",
        )}
      >
        {!isOwn && isFirst && msg.sender_name && (
          <div className="mb-1 text-xs font-semibold text-slate-500">
            {msg.sender_name}
          </div>
        )}
        {msg.body && (
          <div className="whitespace-pre-wrap break-words">{msg.body}</div>
        )}
        {msg.attachments && msg.attachments.map((att) => (
          <AttachmentPreview key={att.id} attachment={att} isOwn={isOwn} />
        ))}

        {msg.reaction_counts && Object.keys(msg.reaction_counts).length > 0 && (
          <div className={cn("mt-1 flex flex-wrap items-center gap-0.5 text-xs", isOwn ? "text-sky-100" : "text-slate-400")}>
            {Object.entries(msg.reaction_counts).map(([emoji, count]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReaction(msg.id, emoji)}
                className="flex items-center gap-0.5 rounded-full px-1.5 py-0.25 bg-black/10 text-slate-700 hover:bg-black/20"
              >
                <span>{emoji}</span>
                <span>{count}</span>
              </button>
            ))}
          </div>
        )}

        <div className={cn("mt-1 flex items-center gap-1 text-xs", isOwn ? "text-sky-100" : "text-slate-400")}>
          {msg.is_edited && <span>edited</span>}
          <span>{timeLabel}</span>
        </div>

        <div className="absolute top-full mt-1 flex items-center gap-0.5 rounded-lg bg-white p-0.5 text-xs shadow-lg ring-1 ring-slate-200 opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" onClick={() => onReply(msg.id)} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Reply">
            <Icon name="copy" className="h-3 w-3" />
          </button>
          <button type="button" onClick={() => setShowReactions(true)} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Add reaction">
            <Icon name="smile" className="h-3 w-3" />
          </button>
          <button type="button" onClick={() => onSave(msg.id)} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Save">
            <Icon name="bookmark" className="h-3 w-3" />
          </button>
        </div>

        {showReactions && (
          <>
            <button type="button" aria-label="Close" tabIndex={-1} className="fixed inset-0 cursor-default" onClick={() => setShowReactions(false)} />
            <div className="absolute top-full mt-1 z-20 flex flex-wrap items-center gap-0.5 rounded-full bg-white p-1 text-xs shadow-lg ring-1 ring-slate-200">
              {REACTION_PICK.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => { onReaction(msg.id, emoji); setShowReactions(false); }}
                  className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AttachmentPreview({ attachment, isOwn }: { attachment: Attachment; isOwn: boolean }) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-md bg-black/10 px-2 py-1.5 text-xs">
      <Icon name="file-text" className="h-4 w-4" />
      <div className="min-w-0">
        <div className="font-medium">{attachment.document_name || "Attachment"}</div>
        {attachment.document_size && (
          <div className="text-[10px] opacity-75">
            {(attachment.document_size / 1024).toFixed(1)} KB
          </div>
        )}
      </div>
    </div>
  );
}
/**
 * Message input bar with AI suggestions.
 */

export function MessageInput({
  onSend,
  aiSuggestions,
  onSuggestionClick,
  isLoading = false,
}: {
  onSend: (body: string) => void;
  aiSuggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
  isLoading?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const handleSend = () => {
    if (draft.trim() && !isLoading) {
      onSend(draft.trim());
      setDraft("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-slate-200 bg-white p-3">
      {aiSuggestions && aiSuggestions.length > 0 && onSuggestionClick && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {aiSuggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSuggestionClick(s)}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Shift+Enter for new line)"
          className="flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-100"
          rows={1}
          maxLength={4000}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!draft.trim() || isLoading}
          className={cn(
            "flex items-center justify-center rounded-lg bg-sky-500 px-3 py-2 text-sm font-medium text-white transition-colors",
            draft.trim() && !isLoading
              ? "hover:bg-sky-600"
              : "cursor-not-allowed opacity-50",
          )}
        >
          <Icon name="send" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
/**
 * Channel sidebar - shows available channels.
 */
export function ChannelSidebar({
  channels,
  selectedChannel,
  isLoading = false,
  onSelectChannel,
  onNewChannel,
}: {
  channels: Conversation[];
  selectedChannel: string | null;
  isLoading?: boolean;
  onSelectChannel: (channel: Conversation) => void;
  onNewChannel: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto border-r border-slate-200 bg-slate-50/50">
      <div className="border-b border-slate-200 px-3 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium uppercase text-slate-400">
            Channels
          </div>
          <button
            type="button"
            onClick={onNewChannel}
            className="rounded-lg bg-sky-500 px-2 py-1 text-xs font-medium text-white hover:bg-sky-600"
          >
            <Icon name="plus" className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {channels.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400">
            No channels yet
          </div>
        ) : (
          channels.map((channel) => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              selected={channel.id === selectedChannel}
              onSelect={() => onSelectChannel(channel)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ChannelRow({
  channel,
  selected,
  onSelect,
}: {
  channel: Conversation;
  selected: boolean;
  onSelect: () => void;
}) {
  const unread = channel.unread_count || 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100/50",
        selected && "bg-sky-50/50 font-medium text-sky-700",
      )}
    >
      <Icon
        name={channel.channel_type === "announce" ? "bell" : "messages-square"}
        className="h-4 w-4 text-slate-500"
      />
      <span className="flex-1 truncate">{channel.name || "Unnamed"}</span>
      {unread > 0 && (
        <Badge tone="info" className="px-1.5 py-0 text-xs">
          {unread}
        </Badge>
      )}
    </button>
  );
}
/**
 * Knowledge article browser.
 */
export function KnowledgeBrowser({
  articles,
  isLoading,
  onSearch,
  onArticleClick,
  searchQuery,
}: {
  articles: KnowledgeArticle[];
  isLoading: boolean;
  onSearch: (query: string) => void;
  onArticleClick: (article: KnowledgeArticle) => void;
  searchQuery: string;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto border-r border-slate-200 bg-slate-50/50">
      <div className="border-b border-slate-200 px-3 pt-3 pb-2">
        <div className="relative">
          <Icon name="search" className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="search"
            placeholder="Search knowledge base..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-100"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-200/50" />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No articles found"
              message={searchQuery ? "Try a different search term." : "No knowledge articles published yet."}
            />
          </div>
        ) : (
          articles.map((article) => (
            <KnowledgeArticleRow
              key={article.id}
              article={article}
              onClick={() => onArticleClick(article)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function KnowledgeArticleRow({
  article,
  onClick,
}: {
  article: KnowledgeArticle;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-1 border-b border-slate-100 px-3 py-2.5 text-left transition-colors hover:bg-slate-100/50"
    >
      <div className="flex items-center gap-2">
        <div className="rounded-md bg-indigo-50 p-1.5">
          <Icon name="file-text" className="h-4 w-4 text-indigo-600" />
        </div>
        <span className="font-medium text-slate-900">{article.title}</span>
      </div>
      {article.summary && (
        <p className="line-clamp-2 text-xs text-slate-500 pl-7">
          {article.summary}
        </p>
      )}
      <div className="flex items-center gap-1 pl-7">
        {article.category && (
          <Badge tone="neutral" className="px-1.5 py-0 text-[10px]">
            {article.category}
          </Badge>
        )}
        {article.tags?.slice(0, 2).map((tag) => (
          <Badge key={tag} tone="neutral" className="px-1.5 py-0 text-[10px]">
            {tag}
          </Badge>
        ))}
      </div>
    </button>
  );
}

/**
 * CA News feed — a vertically scrolling list of the latest regulatory/GST/tax
 * updates ingested by the CA-news agent. Rendered inside the Knowledge tab.
 */
export function CANewsFeed({
  articles,
  isLoading,
  onArticleClick,
}: {
  articles: KnowledgeArticle[];
  isLoading: boolean;
  onArticleClick: (article: KnowledgeArticle) => void;
}) {
  const published = articles
    .slice()
    .sort(
      (a, b) =>
        new Date(b.published_at ?? b.updated_at).valueOf() -
        new Date(a.published_at ?? a.updated_at).valueOf(),
    );

  const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7) return `${diff}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div className="flex flex-col border-b border-slate-200 bg-amber-50/30">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon name="file-text" className="h-4 w-4 text-amber-600" />
          <span className="text-xs font-semibold text-amber-900">CA News</span>
          <Badge tone="neutral" className="px-1.5 py-0 text-[10px]">
            Today's important updates
          </Badge>
        </div>
        <Icon name="clock-3" className="h-3.5 w-3.5 text-slate-400" />
      </div>

      <div className="max-h-72 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3.5 w-5/6 animate-pulse rounded bg-slate-200/50" />
                <div className="h-3 w-4/6 animate-pulse rounded bg-slate-200/50" />
                <div className="h-3 w-full animate-pulse rounded bg-slate-200/50" />
              </div>
            ))}
          </div>
        ) : published.length === 0 ? (
          <div className="p-3 text-xs text-slate-500">No important CA updates yet. Check back daily.</div>
        ) : (
          published.map((article) => (
            <button
              key={article.id}
              type="button"
              onClick={() => onArticleClick(article)}
              className="flex flex-col items-start gap-1 border-b border-slate-100 px-3 py-2 text-left transition-colors hover:bg-slate-100/50"
            >
              <div className="flex items-center gap-1.5">
                <Badge tone="neutral" className="px-1 py-0 text-[9px]">
                  Important
                </Badge>
                <span className="text-[10px] text-slate-500">
                  {fmtDate(article.published_at)}
                </span>
              </div>
              <span className="text-sm font-medium text-slate-900">{article.title}</span>
              {article.summary && (
                <p className="line-clamp-2 text-xs text-slate-500">
                  {article.summary}
                </p>
              )}
              {article.source_url && (
                <span className="text-[10px] text-sky-600/80 truncate">
                  {article.source_url}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
/**
 * Notification list panel.
 */
export function NotificationPanel({
  notifications,
  unreadCount,
  onMarkRead,
  onSelect,
}: {
  notifications: Notification[];
  unreadCount: number;
  onMarkRead: (ids: string[]) => void;
  onSelect: (notification: Notification) => void;
}) {
  const unreadIds = notifications
    .filter((n) => !n.is_read)
    .map((n) => n.id);

  return (
    <div className="flex h-full flex-col overflow-y-auto border-r border-slate-200 bg-slate-50/50">
      <div className="border-b border-slate-200 px-3 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium uppercase text-slate-400">
            Notifications
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => onMarkRead(unreadIds)}
              className="text-xs text-sky-600 hover:text-sky-700"
            >
              Mark all read
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400">
            No notifications yet
          </div>
        ) : (
          notifications.map((notif) => (
            <NotificationRow
              key={notif.id}
              notification={notif}
              onClick={() => onSelect(notif)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function NotificationRow({
  notification,
  onClick,
}: {
  notification: Notification;
  onClick: () => void;
}) {
  const isUnread = !notification.is_read;
  const timeLabel = new Date(notification.created_at).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition-colors hover:bg-slate-100/50",
        isUnread ? "bg-sky-50/30" : "",
      )}
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <Icon name="bell" className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "text-sm font-medium",
              isUnread ? "text-slate-900" : "text-slate-600",
            )}
          >
            {notification.title || notification.event_type}
          </span>
          <span className="text-xs text-slate-400">{timeLabel}</span>
        </div>
        {notification.body && (
          <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
            {notification.body}
          </p>
        )}
      </div>
    </button>
  );
}

/**
 * Chat header - shows conversation info, participants, and actions.
 */
export function ChatHeader({
  conversation,
  participants,
  onInfo,
  onSettings,
}: {
  conversation: Conversation;
  participants: ParticipantInfo[];
  onInfo: () => void;
  onSettings: () => void;
}) {
  const displayName = conversation.name || "Unnamed conversation";

  return (
    <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-white">
          {conversation.is_channel ? (
            <Icon name="messages-square" className="h-5 w-5" />
          ) : (
            <span className="text-sm font-medium">
              {displayName.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">{displayName}</h2>
            {conversation.is_confidential && (
              <Icon name="shield-check" className="h-3 w-3 text-amber-500" />
            )}
            {conversation.is_readonly && (
              <Badge tone="warning" className="px-1.5 py-0 text-xs">
                Read-only
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-400">
            {participants.slice(0, 3).map((p, i) => (
              <span key={p.user_id}>{p.name || "Unknown"}</span>
            ))}
            {participants.length > 3 && (
              <span>+{participants.length - 3} more</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onInfo}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          <Icon name="info" className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onSettings}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          <Icon name="more-vertical" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export interface ParticipantInfo {
  user_id: string;
  name: string | null;
  avatar_url?: string | null;
  role: string;
}

/**
 * Knowledge article detail view.
 */
export function KnowledgeArticleDetail({
  article,
  onBack,
  onEdit,
}: {
  article: KnowledgeArticle;
  onBack: () => void;
  onEdit?: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
          >
            <Icon name="chevron-left" className="h-4 w-4" />
          </button>
          <h2 className="text-sm font-semibold text-slate-900">Knowledge Base</h2>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 flex items-center gap-2">
            {article.category && (
              <Badge tone="neutral" className="px-2 py-0.5 text-xs">
                {article.category}
              </Badge>
            )}
            <Badge tone="success" className="px-2 py-0.5 text-xs">
              v{article.version_number}
            </Badge>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-slate-900">{article.title}</h1>
          <p className="mb-4 text-sm text-slate-500">{article.summary}</p>
          <div
            className="prose prose-sm max-w-none text-slate-700"
            dangerouslySetInnerHTML={{ __html: article.content.replace(/\n/g, "<br/>") }}
          />
          {article.tags && article.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-1.5">
              {article.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


