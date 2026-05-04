import { useEffect, useRef, useState } from "react";
import type { ChatMsg, Player } from "../../../shared/types";
import { MAX_CHAT_LEN } from "../../../shared/types";
import type { AppSocket } from "../socket";

export function ChatPanel({
  messages,
  socket,
  players,
  emptyPlaceholder,
  inputPlaceholder = "Say something…",
  className,
  listClassName,
  hideHeader,
}: {
  messages: ChatMsg[];
  socket: AppSocket;
  players: Player[];
  emptyPlaceholder?: string;
  inputPlaceholder?: string;
  className?: string;
  listClassName?: string;
  hideHeader?: boolean;
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  function send() {
    const t = text.trim();
    if (!t) return;
    socket.emit("chat:send", { text: t });
    setText("");
  }

  const nameById = Object.fromEntries(players.map((p) => [p.id, p.name]));

  return (
    <div className={["flex flex-col gap-2", className ?? ""].join(" ")}>
      {!hideHeader && (
        <div className="text-xs font-medium text-ink/60">Chat</div>
      )}
      <div
        ref={listRef}
        className={[
          "min-h-[3rem] flex-1 overflow-y-auto rounded-xl bg-ink/5 p-2",
          listClassName ?? "max-h-40",
        ].join(" ")}
      >
        {messages.length === 0 ? (
          <div className="px-1 py-2 text-center text-xs text-ink/40">
            {emptyPlaceholder ?? "Say something…"}
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {messages.map((m) => (
              <li key={m.id} className="text-sm">
                <span className="font-semibold">
                  {nameById[m.playerId] ?? m.playerName}:
                </span>{" "}
                <span>{m.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder={inputPlaceholder}
          maxLength={MAX_CHAT_LEN}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="btn-secondary" onClick={send}>
          Send
        </button>
      </div>
    </div>
  );
}
