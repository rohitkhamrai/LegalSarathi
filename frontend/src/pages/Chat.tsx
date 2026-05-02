import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocation } from "react-router-dom";
import { Mic, Paperclip, Send, X, Volume2, Square, Pause, Play } from "lucide-react";
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
  ocrExtractedText?: string;
  // Structured legal fields from API
  severityLevel?: "INFO" | "CAUTION" | "DANGER";
  rights?: string[];
  actionSteps?: string[];
  doNotDo?: string[];
  evidenceRequired?: string[];
  situationSummary?: string;
  jurisdictionNote?: string;
  awareness?: string;
  ragChunksUsed?: string[];
  citationBadge?: string;
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
  const recognitionRef = useRef<any>(null);

  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  // Female voice picker
  const [femaleVoices, setFemaleVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceIdx, setSelectedVoiceIdx] = useState(0);

  // BCP-47 locale map for Web Speech API
  const LANG_TO_BCP47: Record<string, string> = {
    hi: "hi-IN", ta: "ta-IN", te: "te-IN", mr: "mr-IN",
    bn: "bn-IN", en: "en-IN", gu: "gu-IN", kn: "kn-IN",
    ml: "ml-IN", pa: "pa-IN", ur: "ur-PK", or: "or-IN", as: "as-IN",
  };

  // Load female voices — async in Chrome, fires voiceschanged
  const loadFemaleVoices = () => {
    const MALE_BLACKLIST = [
      "male","man","guy","boy","hemant","kailash","madhur","ravi","prabhat","aditi-m",
      "ganesh","mohan","arjun","aditya","amit","david","mark","george","james",
      "richard","paul","reed","eric","andrew","christopher","daniel","tom","alex",
      "fred","bruce","ralph","vijay","rohit","suresh","ramesh","mahesh","rakesh",
      "ajay","sanjay","kiran-m","raj","hari",
    ];
    const FEMALE_KEYWORDS = [
      "female","woman","girl","aditi","priya","divya","heera","kalpana","sapna",
      "zira","neerja","swara","aarohi","pallavi","samantha","victoria","karen","moira",
    ];
    const bcp47 = LANG_TO_BCP47[lang.split("-")[0]] || "hi-IN";
    const langPrefix = bcp47.split("-")[0];

    const all = window.speechSynthesis?.getVoices() ?? [];
    const isFemale = (v: SpeechSynthesisVoice) => {
      const n = v.name.toLowerCase();
      if (MALE_BLACKLIST.some((k) => n.includes(k))) return false;
      if (FEMALE_KEYWORDS.some((k) => n.includes(k))) return true;
      return !/voice\s*\d/.test(n);
    };

    // Priority: exact locale first, then same lang prefix
    const exact = all.filter((v) => v.lang === bcp47 && isFemale(v));
    const prefix = all.filter((v) => v.lang !== bcp47 && v.lang.startsWith(langPrefix) && isFemale(v));
    const top3 = [...exact, ...prefix].slice(0, 3);
    if (top3.length > 0) {
      setFemaleVoices(top3);
      setSelectedVoiceIdx(0);
    }
  };

  // Load voices on mount + when lang changes
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    loadFemaleVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadFemaleVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadFemaleVoices);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const stopRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  };

  const sendVoiceTranscript = (text: string) => {
    stopRecognition();
    setVoice(false);
    setVoiceTranscript("");
    if (text.trim()) send(text.trim());
  };

  const startVoiceRecognition = () => {
    setVoiceTranscript("");
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      // Fallback: Groq Whisper via MediaRecorder
      startGroqFallback();
      return;
    }

    // Accumulates only isFinal segments — plain object, not React state
    // so it never stales inside the closure across events
    const finalAccum = { text: "" };

    const recognition = new SpeechRecognition();
    recognition.lang = LANG_TO_BCP47[lang.split("-")[0]] || "hi-IN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsRecording(true);

    recognition.onresult = (e: any) => {
      let interimChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const segment = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          // Confirmed word(s): append once to the permanent accumulator
          finalAccum.text += segment + " ";
        } else {
          // Interim: only the LATEST partial from this event
          interimChunk = segment;
        }
      }
      // State = confirmed finals + current interim (interim replaces itself each fire)
      setVoiceTranscript(finalAccum.text + interimChunk);
    };

    recognition.onerror = (e: any) => {
      console.error("Speech recognition error:", e.error);
      if (e.error === "not-allowed") {
        alert("Microphone access denied. Please allow microphone access.");
      }
      stopRecognition();
    };

    recognition.onend = () => {
      // Lock in whatever was confirmed when mic stops
      setVoiceTranscript(finalAccum.text.trim());
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const startGroqFallback = async () => {
    // Groq Whisper fallback for Safari/Firefox
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000 },
      });
      const mimeType =
        ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) =>
          MediaRecorder.isTypeSupported(t)
        ) || "";
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        const fd = new FormData();
        fd.append("audio", blob, "audio.webm");
        fd.append("lang", lang);
        setTyping(true);
        try {
          const res = await fetch("/api/voice-query", {
            method: "POST",
            body: fd,
          });
          if (!res.ok) throw new Error("Voice query failed");
          const dataText = res.headers.get("X-Query-Result");
          const newMsgId = crypto.randomUUID();
          if (dataText) {
            const data = JSON.parse(dataText);
            setMsgs((m) => [
              ...m,
              {
                id: newMsgId,
                role: "ai",
                text: data.buddy_text || data.translated || "Audio received.",
                topic: "legal",
                lawChip: data.legal_keys?.[0] || undefined,
                followups: data.followups || [],
                severityLevel: data.severity_level,
                situationSummary: data.situation_summary,
                rights: data.rights || [],
                actionSteps: data.action_steps || [],
                doNotDo: data.do_not_do || [],
                evidenceRequired: data.evidence_required || [],
                jurisdictionNote: data.jurisdiction_note,
                awareness: data.awareness,
                ragChunksUsed: data.rag_chunks_used || [],
                citationBadge: data.citation_badge,
              },
            ]);
          }
        } catch (e) {
          console.error("Groq fallback error", e);
        } finally {
          setTyping(false);
          setVoice(false);
          setVoiceTranscript("");
        }
      };
      setIsRecording(true);
      recorder.start();
      (window as any).__legalsarthiRecorder = { recorder, stream };
    } catch (err) {
      console.error(err);
      setVoice(false);
    }
  };

  const stopGroqFallback = () => {
    const r = (window as any).__legalsarthiRecorder;
    if (r) {
      r.recorder.stop();
      r.stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      delete (window as any).__legalsarthiRecorder;
    }
    setIsRecording(false);
  };

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggleAudio = (m: Msg) => {
    if (playingId === m.id) {
      if (isPaused) {
        window.speechSynthesis?.resume();
        audioRef.current?.play();
        setIsPaused(false);
      } else {
        window.speechSynthesis?.pause();
        audioRef.current?.pause();
        setIsPaused(true);
      }
      return;
    }

    // Stop anything currently playing
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    setPlayingId(null);
    setIsPaused(false);

    // Primary: browser SpeechSynthesis — instant, no network, uses OS Neural voices
    if (typeof window !== "undefined" && "speechSynthesis" in window && femaleVoices.length > 0) {
      const bcp47 = (LANG_TO_BCP47 as Record<string, string>)[lang.split("-")[0]] || "hi-IN";

      // Exhaustive male voice blacklist — Indian TTS engines + generic
      const MALE_BLACKLIST = [
        "male", "man", "guy", "boy",
        // Google Indian male voices
        "hemant", "kailash", "madhur", "ravi", "prabhat", "aditi-m",
        // Microsoft male voices (edge/windows)
        "ganesh", "mohan", "arjun", "aditya", "amit",
        "david", "mark", "george", "james", "richard", "paul",
        "reed", "eric", "guy", "andrew", "christopher",
        // Apple male voices
        "daniel", "tom", "alex", "fred", "bruce", "ralph",
        // Common male Indian names in TTS
        "vijay", "rohit", "suresh", "ramesh", "mahesh", "rakesh",
        "ajay", "sanjay", "kiran-m", "raj", "hari",
      ];

      // Female voice keyword whitelist (positive match is stronger signal)
      const FEMALE_KEYWORDS = [
        "female", "woman", "girl",
        // Google Indian female voices
        "aditi", "priya", "divya", "heera", "kalpana", "sapna",
        // Microsoft female voices (edge/windows)
        "zira", "heera", "neerja", "swara", "aarohi", "pallavi",
        // Apple female voices
        "samantha", "victoria", "karen", "moira",
        // Generic female identifiers
        "female", "woman", "neural female",
      ];

      const isFemale = (v: SpeechSynthesisVoice): boolean => {
        const name = v.name.toLowerCase();
        // Hard reject: any male keyword present
        if (MALE_BLACKLIST.some((kw) => name.includes(kw))) return false;
        // Positive confirm: known female keyword
        if (FEMALE_KEYWORDS.some((kw) => name.includes(kw))) return true;
        // Unknown voice name — treat as potentially male, reject unless locale matches exactly
        // For unknown names, allow only if NOT containing numbers (e.g. "voice 2" = often male default)
        return !/voice\s*\d/.test(name);
      };

      const pickFemaleVoice = (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
        return (
          // 1st: exact locale + neural/google + confirmed female
          voices.find((v) =>
            v.lang === bcp47 && isFemale(v) &&
            (v.name.toLowerCase().includes("neural") || v.name.toLowerCase().includes("google"))
          ) ||
          // 2nd: exact locale + confirmed female keyword
          voices.find((v) =>
            v.lang === bcp47 &&
            FEMALE_KEYWORDS.some((kw) => v.name.toLowerCase().includes(kw))
          ) ||
          // 3rd: exact locale + passes isFemale filter
          voices.find((v) => v.lang === bcp47 && isFemale(v)) ||
          // 4th: same language prefix + confirmed female keyword
          voices.find((v) =>
            v.lang.startsWith(bcp47.split("-")[0]) &&
            FEMALE_KEYWORDS.some((kw) => v.name.toLowerCase().includes(kw))
          ) ||
          // 5th: same language prefix + passes isFemale filter
          voices.find((v) => v.lang.startsWith(bcp47.split("-")[0]) && isFemale(v)) ||
          null  // no female voice found → block speech, use backend
        );
      };

      const speakWithVoice = (_voices: SpeechSynthesisVoice[]) => {
        // Use the user-selected female voice from state
        const femaleVoice = femaleVoices[selectedVoiceIdx] ?? femaleVoices[0] ?? null;
        if (!femaleVoice) {
          console.warn("[TTS] No female browser voice found, using backend edge-tts");
          playFromBackend(m);
          return;
        }
        const utterance = new SpeechSynthesisUtterance(m.text);
        utterance.lang = bcp47;
        utterance.voice = femaleVoice;
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        utterance.onstart = () => { setPlayingId(m.id); setIsPaused(false); };
        utterance.onend = () => { setPlayingId(null); setIsPaused(false); };
        utterance.onerror = async () => {
          setPlayingId(null);
          setIsPaused(false);
          await playFromBackend(m);
        };
        window.speechSynthesis.speak(utterance);
        setPlayingId(m.id);
      };

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        speakWithVoice(voices);
      } else {
        // Voices not loaded yet (async in Chrome) — wait for voiceschanged
        const onVoicesChanged = () => {
          window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
          speakWithVoice(window.speechSynthesis.getVoices());
        };
        window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
        // Safety timeout: if voiceschanged never fires (Firefox), fall back to backend
        setTimeout(() => {
          window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
          const v = window.speechSynthesis.getVoices();
          if (v.length > 0) speakWithVoice(v);
          else playFromBackend(m);
        }, 1500);
      }
      return;
    }

    // Fallback: backend edge-tts (Microsoft Neural — always female)
    playFromBackend(m);
  };

  const handleVoiceChange = (idx: number, m: Msg) => {
    setSelectedVoiceIdx(idx);
    if (playingId === m.id) {
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
      setPlayingId(null);
      setIsPaused(false);
      // Restart speech immediately with new voice
      setTimeout(() => {
        const femaleVoice = femaleVoices[idx];
        if (!femaleVoice) return;
        const bcp47 = (LANG_TO_BCP47 as Record<string, string>)[lang.split("-")[0]] || "hi-IN";
        const utterance = new SpeechSynthesisUtterance(m.text);
        utterance.lang = bcp47;
        utterance.voice = femaleVoice;
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        utterance.onstart = () => { setPlayingId(m.id); setIsPaused(false); };
        utterance.onend = () => { setPlayingId(null); setIsPaused(false); };
        window.speechSynthesis?.speak(utterance);
        setPlayingId(m.id);
      }, 50);
    }
  };

  const playFromBackend = async (m: Msg) => {
    setLoadingAudioId(m.id);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: m.text, lang: lang }),
      });
      if (!res.ok) throw new Error("TTS failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      audioRef.current.onended = () => { setPlayingId(null); setIsPaused(false); };
      setLoadingAudioId(null);
      setPlayingId(m.id);
      setIsPaused(false);
      try { await audioRef.current.play(); } catch { setPlayingId(null); setIsPaused(false); }
    } catch (e) {
      console.error(e);
      setLoadingAudioId(null);
      setPlayingId(null);
      setIsPaused(false);
    }
  };

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
          topic: "legal",
          lawChip: data.legal_keys?.[0] || undefined,
          followups: data.followups || [],
          severityLevel: data.severity_level,
          situationSummary: data.situation_summary,
          rights: data.rights || [],
          actionSteps: data.action_steps || [],
          doNotDo: data.do_not_do || [],
          evidenceRequired: data.evidence_required || [],
          jurisdictionNote: data.jurisdiction_note,
          awareness: data.awareness,
          ragChunksUsed: data.rag_chunks_used || [],
          citationBadge: data.citation_badge,
        },
      ]);
    } catch (err) {
      setMsgs((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "ai", text: "I'm having trouble connecting right now. Please try again later." },
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
          ocrExtractedText: data.ocr_extracted_text,
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
              <div className="ls-card border-l-4 border-l-primary p-4 text-sm space-y-3">

                {/* Severity badge */}
                {m.severityLevel && (
                  <div className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                    m.severityLevel === "DANGER" && "bg-destructive/15 text-destructive",
                    m.severityLevel === "CAUTION" && "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
                    m.severityLevel === "INFO" && "bg-primary/10 text-primary",
                  )}>
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      m.severityLevel === "DANGER" && "bg-destructive animate-pulse",
                      m.severityLevel === "CAUTION" && "bg-yellow-500",
                      m.severityLevel === "INFO" && "bg-primary",
                    )} />
                    {m.severityLevel}
                  </div>
                )}

                {/* Situation summary */}
                {m.situationSummary && (
                  <p className="text-sm font-medium text-foreground leading-relaxed">{m.situationSummary}</p>
                )}

                {/* Rights with citations */}
                {m.rights && m.rights.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1.5">{t("chatYourRights")}</p>
                    <ul className="space-y-1">
                      {m.rights.map((r, i) => (
                        <li key={i} className="flex gap-2 text-xs">
                          <span className="text-primary font-bold mt-0.5 shrink-0">§</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Action steps */}
                {m.actionSteps && m.actionSteps.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-widest mb-1.5">{t("chatStepsToTake")}</p>
                    <ol className="space-y-1 list-none">
                      {m.actionSteps.map((s, i) => (
                        <li key={i} className="flex gap-2 text-xs">
                          <span className="bg-green-600/15 text-green-700 dark:text-green-400 font-bold rounded px-1.5 py-0.5 shrink-0 text-[10px]">{i + 1}</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Do not do */}
                {m.doNotDo && m.doNotDo.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-destructive uppercase tracking-widest mb-1.5">{t("chatDoNotDo")}</p>
                    <ul className="space-y-1">
                      {m.doNotDo.map((d, i) => (
                        <li key={i} className="flex gap-2 text-xs text-destructive/80">
                          <span className="shrink-0 font-bold">×</span>
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Evidence required */}
                {m.evidenceRequired && m.evidenceRequired.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-yellow-600 dark:text-yellow-400 uppercase tracking-widest mb-1.5">{t("chatCollectNow")}</p>
                    <ul className="space-y-1">
                      {m.evidenceRequired.map((e, i) => (
                        <li key={i} className="flex gap-2 text-xs">
                          <span className="shrink-0">📌</span>
                          <span>{e}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* OCR extracted text (collapsible) */}
                {m.ocrExtractedText && (
                  <details className="group">
                    <summary className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest cursor-pointer list-none flex items-center gap-1 hover:text-primary transition-colors">
                      <span className="group-open:rotate-180 transition-transform duration-200">▼</span>
                      {t("chatExtractedText")}
                    </summary>
                    <div className="mt-2 p-2 bg-muted/30 rounded-lg text-[11px] font-mono whitespace-pre-wrap border border-border/50 max-h-40 overflow-y-auto">
                      {m.ocrExtractedText}
                    </div>
                  </details>
                )}

                {/* Awareness paragraph (collapsible) */}
                {m.awareness && (
                  <details className="group">
                    <summary className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest cursor-pointer list-none flex items-center gap-1 hover:text-primary transition-colors">
                      <span className="group-open:rotate-180 transition-transform duration-200">▼</span>
                      {t("chatKnowYourLaw")}
                    </summary>
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{m.awareness}</p>
                  </details>
                )}

                {/* Citation badge + RAG sources (collapsible) */}
                {m.ragChunksUsed && m.ragChunksUsed.length > 0 && (
                  <details className="group">
                    <summary className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest cursor-pointer list-none flex items-center gap-1 hover:text-primary transition-colors">
                      <span className="group-open:rotate-180 transition-transform duration-200">▼</span>
                      {m.citationBadge || "📚"} {t("chatSources")} ({m.ragChunksUsed.length})
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.ragChunksUsed.map((ref) => (
                        <span key={ref} className="ls-chip text-[10px] font-mono bg-primary/5 text-primary border-primary/20">{ref}</span>
                      ))}
                    </div>
                  </details>
                )}

                {/* Jurisdiction note */}
                {m.jurisdictionNote && (
                  <p className="text-[10px] italic text-muted-foreground border-t border-border pt-2">{m.jurisdictionNote}</p>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border">
                  <button
                    onClick={() => toggleAudio(m)}
                    className="w-9 h-9 flex items-center justify-center rounded-button border border-border text-foreground tap shrink-0"
                    title={playingId === m.id ? (isPaused ? "Resume audio" : "Pause audio") : "Play audio"}
                    disabled={loadingAudioId === m.id}
                  >
                    {loadingAudioId === m.id ? (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                    ) : playingId === m.id ? (
                      isPaused ? <Play size={14} className="text-primary" /> : <Pause size={14} className="text-primary" />
                    ) : (
                      <Volume2 size={14} />
                    )}
                  </button>

                  {/* Inline Voice Picker */}
                  {femaleVoices.length > 0 && (
                    <div className="flex gap-1.5 ml-1">
                      {femaleVoices.map((v, i) => (
                        <button
                          key={v.name}
                          onClick={() => handleVoiceChange(i, m)}
                          title={v.name}
                          className={cn(
                            "px-2 py-1 rounded-full text-[9px] font-semibold border transition-all duration-150 tap",
                            selectedVoiceIdx === i
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                          )}
                        >
                          V{i + 1}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => navigate("/lawyers")}
                    className="ml-auto h-9 text-xs px-3 rounded-button border border-border text-foreground tap"
                  >
                    {t("chatConsultLawyer")}
                  </button>
                </div>

                <p className="text-[10px] leading-relaxed text-muted-foreground italic">
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
        <div className="fixed inset-0 z-40 bg-foreground/80 backdrop-blur-sm flex flex-col items-center justify-center text-primary-foreground" role="dialog">
          <div className="relative w-28 h-28 flex items-center justify-center mb-6">
            {isRecording && (
              <>
                <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
                <span className="absolute inset-[-8px] rounded-full border-2 border-primary/40 animate-pulse" />
              </>
            )}
            <span className={cn(
              "absolute inset-0 rounded-full transition-colors",
              isRecording ? "bg-primary" : "bg-muted/40"
            )} />
            <Mic size={32} className="relative z-10" />
          </div>

          <p className="text-sm font-medium mb-1">
            {isRecording ? t("listening") : t("chatTapToSpeak")}
          </p>

          {/* Live transcript display */}
          {voiceTranscript && (
            <div className="mx-6 mt-3 mb-4 max-w-xs w-full bg-foreground/20 rounded-2xl px-4 py-3 text-sm text-center leading-snug">
              {voiceTranscript}
            </div>
          )}

          {/* Controls */}
          <div className="flex gap-3 mt-4">
            {!isRecording ? (
              <button
                onClick={startVoiceRecognition}
                className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold tap shadow-lg"
              >
                <Mic size={16} className="inline mr-2" />{t("chatStartRecording")}
              </button>
            ) : (
              <button
                onClick={() => {
                  const hasSpeechRecognition = !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
                  hasSpeechRecognition ? stopRecognition() : stopGroqFallback();
                }}
                className="px-6 py-2.5 rounded-full bg-destructive text-destructive-foreground text-sm font-semibold tap shadow-lg"
              >
                <Square size={14} className="inline mr-2" />{t("chatStop")}
              </button>
            )}
            {voiceTranscript && !isRecording && (
              <button
                onClick={() => sendVoiceTranscript(voiceTranscript)}
                className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold tap shadow-lg"
              >
                <Send size={14} className="inline mr-2" />{t("chatSend")}
              </button>
            )}
          </div>

          <button
            onClick={() => { stopRecognition(); stopGroqFallback(); setVoice(false); setVoiceTranscript(""); }}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card/20 text-sm tap"
          >
            <X size={16} /> {t("cancel")}
          </button>
        </div>
      )}
    </ScreenShell>
  );
};

export default Chat;
