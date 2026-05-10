import { useEffect, useState } from "react";
import type { ChatMsg, Player } from "../../../shared/types";
import type { AppSocket } from "../socket";
import { ChatPanel } from "./ChatPanel";

export function ChatDrawer({
  messages,
  socket,
  players,
  emptyPlaceholder,
}: {
  messages: ChatMsg[];
  socket: AppSocket;
  players: Player[];
  emptyPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [seenCount, setSeenCount] = useState(messages.length);

  // Mark messages as seen whenever the drawer is open and new ones arrive.
  useEffect(() => {
    if (open) setSeenCount(messages.length);
  }, [open, messages.length]);

  const unread = Math.max(0, messages.length - seenCount);

  return (
    <>
      {/* Slim tab pinned to the bottom — small footprint when not chatting. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md items-center justify-center gap-2 border-t border-ink/10 bg-paper/95 px-3 py-2 text-xs font-medium text-ink/70 backdrop-blur"
        aria-label="Open chat"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Chat
        {unread > 0 && (
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop — tap to dismiss. */}
          <div
            className="fixed inset-0 z-20 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Drawer panel — covers ~60% of viewport height, anchored to bottom. */}
          <div className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md flex-col rounded-t-2xl border border-ink/10 bg-paper p-3 shadow-2xl"
               style={{ height: "60vh" }}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-ink/50">
                Chat
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="rounded-full p-1 text-ink/50 hover:text-ink"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ChatPanel
              className="flex flex-1 flex-col"
              listClassName="flex-1"
              hideHeader
              messages={messages}
              socket={socket}
              players={players}
              emptyPlaceholder={emptyPlaceholder}
            />
          </div>
        </>
      )}
    </>
  );
}
