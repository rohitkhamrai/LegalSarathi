import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocation } from "react-router-dom";
import { Mic, Paperclip, Send, X } from "lucide-react";
import { ScreenShell } from "@desktop/components/layout/ScreenShell";
import { StickyHeader } from "@desktop/components/layout/StickyHeader";
import { useLanguage } from "@desktop/contexts/LanguageContext";
import { useGuest } from "@desktop/contexts/GuestContext";
import { useSOS } from "@desktop/contexts/SOSContext";
import { Button } from "@desktop/components/common/Button";
import { useNavigate } from "react-router-dom";
import { CHAT_RESPONSES, matchTopic, type ChatTopic } from "@desktop/data/chatResponses";
import { TRANSLATIONS } from "@desktop/i18n/translations";
import { detectUrgency } from "@desktop/lib/urgency";
import { cn } from "@desktop/lib/utils";

interface Msg {
  id: string;
  role: "ai" | "user";
  text: string;
  topic?: ChatTopic;
  lawChip?: string;
  followups?: string[];
}

const Chat = () => {
  const { t, lang } = useLanguage();
  const { tryConsume } = useGuest();
  const { show: showSOS } = useSOS();
  const location = useLocation();
  const navigate = useNavigate();
  const initialState = location.state as { initialQuery?: string; startVoice?: boolean } | null;

  const [voice, setVoice] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seededRef = useRef(false);

  const replyTo = (userText: string) => {
    const topic = matchTopic(userText);
    const def = CHAT_RESPONSES[topic];
    setTyping(true);
    window.setTimeout(() => {
      const followups = def.followupKeys
        .map((k) => {
          const dict = (TRANSLATIONS as Record<string, Record<string, string>>)[k];
          return dict ? dict[lang] ?? dict.en : null;
        })
        .filter((s): s is string => !!s);
      setMsgs((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "ai",
          text: def.text[lang] ?? def.text.en,
          topic,
          lawChip: def.law,
          followups,
        },
      ]);
      setTyping(false);
    }, 700);
  };

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    if (!tryConsume()) return;
    setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "user", text }]);
    setInput("");
    if (detectUrgency(text)) {
      setUrgent(true);
      window.setTimeout(() => showSOS(), 600);
    }
    replyTo(text);
  };

  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    if (initialState?.initialQuery) {
      send(initialState.initialQuery);
    } else if (initialState?.startVoice) {
      setVoice(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [msgs, typing]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") send(input);
  };

  const suggestions = [
    { label: t("tenantRights"), q: "What are my rights as a tenant?" },
    { label: t("fileRti"), q: "How do I file an RTI application?" },
    { label: t("consumerComplaint"), q: "How do I file a consumer complaint?" },
  ];

  return (
    <ScreenShell>
      <StickyHeader title={t("chatTitle")} showBack showLanguagePill />

      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <div className="px-8 py-2 text-xs text-muted-foreground border-b border-border">{t("chatSubtitle")}</div>

        {urgent && (
          <div className="mx-8 mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 flex items-center gap-3 animate-fade-in-up">
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <span className="flex-1 text-xs font-semibold text-destructive">{t("sosUrgentBanner")}</span>
            <button
              onClick={showSOS}
              className="px-3 h-8 rounded-full bg-destructive text-destructive-foreground text-xs font-semibold tap"
            >
              {t("callNow")}
            </button>
          </div>
        )}

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-4 space-y-4">
          {msgs.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-16">
              {t("askQuestion")}
            </div>
          )}
          {msgs.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[65%] animate-scale-in")}>
                {m.role === "ai" ? (
                  <div className="ls-card border-l-4 border-l-primary p-4 text-sm">
                    <p className="whitespace-pre-line">{m.text}</p>
                    {m.lawChip && (
                      <div className="mt-3 flex flex-wrap gap-2 items-center">
                        <span className="ls-chip bg-primary/5 text-primary border-primary/20">{m.lawChip}</span>
                        <button className="text-xs text-accent font-semibold underline-offset-2 hover:underline">{t("viewFullLaw")}</button>
                      </div>
                    )}
                    {m.followups && m.followups.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{t("followUps")}</p>
                        <div className="flex flex-wrap gap-2">
                          {m.followups.map((f) => (
                            <button
                              key={f}
                              onClick={() => send(f)}
                              className="text-left text-xs px-3 py-2 rounded-xl bg-primary/5 hover:bg-primary/10 text-primary border border-primary/15 tap"
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {m.lawChip && m.topic && m.topic !== "generic" && (
                        <Button variant="primary" className="h-9 text-xs px-3">{t("generateDocFor")}</Button>
                      )}
                      <button
                        onClick={() => navigate("/lawyers")}
                        className="h-9 text-xs px-3 rounded-button border border-border text-foreground tap"
                      >
                        {t("consultLawyer")}
                      </button>
                    </div>
                    <p className="mt-3 pt-2 border-t border-border text-[10px] leading-relaxed text-muted-foreground italic">
                      ⚠️ {t("aiDisclaimer")}
                    </p>
                  </div>
                ) : (
                  <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-5 py-3 text-sm whitespace-pre-line">{m.text}</div>
                )}
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex justify-start">
              <div className="ls-card border-l-4 border-l-primary p-4 text-sm inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "120ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "240ms" }} />
              </div>
            </div>
          )}
        </div>

        {/* Input bar - pinned to bottom */}
        <div className="border-t border-border bg-background/95 backdrop-blur px-8 py-3">
          <div className="flex gap-3 mb-2 flex-wrap">
            {suggestions.map((s) => (
              <button key={s.label} onClick={() => send(s.q)} className="ls-chip whitespace-nowrap text-xs tap">
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 ls-card h-13 px-4 py-0">
            <button aria-label="Attach" className="w-9 h-9 flex items-center justify-center text-muted-foreground tap">
              <Paperclip size={18} />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              className="flex-1 bg-transparent text-sm outline-none py-3"
              placeholder={t("askQuestion")}
              aria-label={t("askQuestion")}
            />
            <button aria-label="Voice" onClick={() => setVoice(true)} className="w-9 h-9 flex items-center justify-center text-primary tap">
              <Mic size={18} />
            </button>
            <button
              aria-label="Send"
              onClick={() => send(input)}
              disabled={!input.trim()}
              className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center tap disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      {voice && (
        <div className="fixed inset-0 z-40 bg-foreground/60 flex flex-col items-center justify-center text-primary-foreground" role="dialog">
          <div className="relative w-32 h-32 flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-primary animate-pulse-ring" />
            <span className="absolute inset-0 rounded-full bg-primary opacity-90" />
            <Mic size={36} className="relative z-10" />
          </div>
          <p className="mt-6 text-sm">{t("listening")}</p>
          <button
            onClick={() => {
              setVoice(false);
              send("What are my rights as a tenant?");
            }}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm tap shadow-card"
          >
            {t("verifyOtp")}
          </button>
          <button onClick={() => setVoice(false)} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card text-foreground text-sm tap">
            <X size={16} /> {t("cancel")}
          </button>
        </div>
      )}
    </ScreenShell>
  );
};

export default Chat;
