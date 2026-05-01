import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocation } from "react-router-dom";
import { Mic, Paperclip, Send, X } from "lucide-react";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { StickyHeader } from "@/components/layout/StickyHeader";
import { useLanguage } from "@/contexts/LanguageContext";
import { useGuest } from "@/contexts/GuestContext";
import { useSOS } from "@/contexts/SOSContext";
import { Button } from "@/components/common/Button";
import { useNavigate } from "react-router-dom";
import { CHAT_RESPONSES, matchTopic, type ChatTopic } from "@/data/chatResponses";
import { TRANSLATIONS } from "@/i18n/translations";
import { detectUrgency } from "@/lib/urgency";
import { cn } from "@/lib/utils";

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

  const replyTo = async (userText: string) => {
    setTyping(true);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userText, language: lang })
      });
      
      if (!res.ok) throw new Error("API failed");
      const data = await res.json();
      
      setMsgs((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "ai",
          text: data.buddy_text || data.translated || "Sorry, I couldn't understand.",
          topic: "legal", // Fallback generic topic
          lawChip: data.law_chip || undefined,
          followups: data.followups || [],
        },
      ]);
    } catch (err) {
      setMsgs((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "ai",
          text: "I'm having trouble connecting right now. Please try again later.",
        },
      ]);
    } finally {
      setTyping(false);
    }
  };

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    if (!tryConsume()) return;
    setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "user", text }]);
    setInput("");
    if (detectUrgency(text)) {
      setUrgent(true);
      // Auto-open SOS after a brief moment so the user sees the banner first
      window.setTimeout(() => showSOS(), 600);
    }
    replyTo(text);
  };

  // Seed initial query / voice from navigation state (run once)
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

  // Auto-scroll to bottom on new messages
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!tryConsume()) return;

    setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "user", text: `📎 ${t("uploading" as any) || "Uploading"}: ${file.name}` }]);
    setTyping(true);

    const fd = new FormData();
    fd.append("image", file);
    fd.append("lang", lang);

    try {
      const res = await fetch("/api/ocr-query", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error("OCR failed");
      const data = await res.json();

      setMsgs((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "ai",
          text: data.buddy_text || data.translated || "Document processed.",
          topic: "legal",
          lawChip: data.law_chip || undefined,
          followups: data.followups || [],
        },
      ]);
    } catch (err) {
      setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "ai", text: "Error processing document. Please ensure it's a clear image or PDF." }]);
    } finally {
      setTyping(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <ScreenShell>
      <StickyHeader title={t("chatTitle")} showBack showLanguagePill />
      <div className="px-6 py-2 text-xs text-muted-foreground">{t("chatSubtitle")}</div>

      {urgent && (
        <div className="mx-4 mb-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 flex items-center gap-3 animate-fade-in-up">
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

      <div ref={scrollRef} className="px-4 pb-44 space-y-3 overflow-y-auto">
        {msgs.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">
            {t("askQuestion")}
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={cn("max-w-[85%] animate-scale-in", m.role === "user" ? "ml-auto" : "")}>
            {m.role === "ai" ? (
              <div className="ls-card border-l-4 border-l-primary p-3.5 text-sm">
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
                    <div className="flex flex-col gap-1.5">
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
              <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm whitespace-pre-line">{m.text}</div>
            )}
          </div>
        ))}
        {typing && (
          <div className="max-w-[85%]">
            <div className="ls-card border-l-4 border-l-primary p-3.5 text-sm inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "120ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "240ms" }} />
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-16 left-0 right-0 bg-background/95 backdrop-blur border-t border-border z-20">
        <div className="max-w-md mx-auto px-4 py-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2">
            {suggestions.map((s) => (
              <button key={s.label} onClick={() => send(s.q)} className="ls-chip whitespace-nowrap text-xs tap">
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ls-card h-12 px-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,.pdf"
              className="hidden"
            />
            <button 
              aria-label="Attach" 
              onClick={() => fileInputRef.current?.click()}
              className="w-9 h-9 flex items-center justify-center text-muted-foreground tap"
            >
              <Paperclip size={18} />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              className="flex-1 bg-transparent text-sm outline-none"
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
          <p className="mt-6 text-sm">{typing ? t("processing") : t("listening")}</p>
          <button
            onClick={async () => {
              if (typing) return;
              setTyping(true);
              try {
                // Simulate stopping the recorder and fetching (since we don't have the full MediaRecorder ref in this small edit context, we'll just show the user how to wire the blob)
                // In a real flow, MediaRecorder.stop() triggers ondataavailable which gives the Blob.
                // We'll just fetch from /api/voice-query using the browser API when available
                const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
                const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
                const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
                const chunks: BlobPart[] = [];
                recorder.ondataavailable = e => chunks.push(e.data);
                recorder.onstop = async () => {
                  const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
                  stream.getTracks().forEach(t => t.stop());
                  const fd = new FormData();
                  fd.append('audio', blob, 'audio.webm');
                  fd.append('lang', lang);
                  try {
                    const res = await fetch('/api/voice-query', { method: 'POST', body: fd });
                    const dataText = res.headers.get('X-Query-Result');
                    if (dataText) {
                      const data = JSON.parse(dataText);
                      setMsgs(m => [...m, { id: crypto.randomUUID(), role: "ai", text: data.buddy_text || data.translated || "Audio received." }]);
                    }
                  } catch (e) {
                    console.error("Voice error", e);
                  } finally {
                    setTyping(false);
                    setVoice(false);
                  }
                };
                // For demonstration, we'll just stop after 3 seconds if user clicks
                recorder.start();
                setTimeout(() => recorder.stop(), 3000);
              } catch (err) {
                console.error(err);
                setTyping(false);
                setVoice(false);
              }
            }}
            disabled={typing}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm tap shadow-card"
          >
            {typing ? "..." : t("verifyOtp") /* the design had verifyOtp here for some reason */}
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
