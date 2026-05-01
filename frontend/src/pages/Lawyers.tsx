import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Search, SlidersHorizontal, Star, Video, CheckCircle2 } from "lucide-react";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { StickyHeader } from "@/components/layout/StickyHeader";
import { Button } from "@/components/common/Button";
import { useLanguage } from "@/contexts/LanguageContext";
import { LAWYERS, type Lawyer } from "@/data/lawyers";
import { VideoCallModal } from "@/components/lawyer/VideoCallModal";
import { cn } from "@/lib/utils";

const CATEGORIES = ["catAll", "catProperty", "catCriminal", "catFamily", "catLabour", "catConsumer", "catStartup"] as const;

const Lawyers = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [active, setActive] = useState<string>("catAll");
  const [videoLawyer, setVideoLawyer] = useState<Lawyer | null>(null);

  const filtered = LAWYERS;

  return (
    <ScreenShell>
      <StickyHeader title={t("findLawyer")} showLanguagePill />
      <div className="px-6 pt-4 pb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="ls-chip bg-primary/5 text-primary border-primary/20">
            <MapPin size={12} /> Bengaluru, KA
          </span>
        </div>

        <div className="flex items-center gap-2 ls-card h-12 px-3">
          <Search size={16} className="text-muted-foreground" />
          <input className="flex-1 bg-transparent text-sm outline-none" placeholder={t("searchLawyers")} />
          <button className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center" aria-label="Filter">
            <SlidersHorizontal size={16} />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-6 px-6 mt-3 pb-2">
          {CATEGORIES.map((k) => (
            <button
              key={k}
              onClick={() => setActive(k)}
              className={cn(
                "ls-chip whitespace-nowrap tap",
                active === k ? "bg-primary text-primary-foreground border-primary" : ""
              )}
            >
              {t(k as never)}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {filtered.map((l) => (
            <article key={l.id} className="ls-card p-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0">
                  {l.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <button onClick={() => navigate(`/lawyers/${l.id}`)} className="text-left">
                    <h3 className="font-display font-semibold text-[15px] leading-tight">{l.name}</h3>
                  </button>
                  <p className="inline-flex items-center gap-1 text-[11px] text-success font-medium mt-0.5">
                    <CheckCircle2 size={12} /> {t("barCouncilVerified")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-accent font-bold text-sm whitespace-nowrap">₹{l.fee}<span className="text-[10px] font-normal text-muted-foreground">/30min</span></p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {l.specialisations.map((s) => (
                  <span key={s} className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-foreground font-medium">{s}</span>
                ))}
              </div>

              <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Star size={12} className="text-accent fill-accent" /> {l.rating} ({l.reviews})</span>
                <span>·</span>
                <span>{l.area ? `${l.area}, ` : ""}{l.city}</span>
              </div>

              <p className="text-[11px] mt-1.5 font-native text-foreground/80">
                {l.languages.join(" · ")}
              </p>

              <p className="text-[11px] inline-flex items-center gap-1.5 mt-1.5 text-success">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                {l.availability === "today" ? t("availableToday") : t("availableTomorrow")}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button className="h-10 text-xs" onClick={() => navigate(`/lawyers/${l.id}`)}>
                  {t("bookConsultation")}
                </Button>
                <Button variant="secondary" className="h-10 text-xs" leftIcon={<Video size={14} />} onClick={() => setVideoLawyer(l)}>
                  {t("videoCall")}
                </Button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <VideoCallModal lawyer={videoLawyer} onClose={() => setVideoLawyer(null)} />
    </ScreenShell>
  );
};

export default Lawyers;
