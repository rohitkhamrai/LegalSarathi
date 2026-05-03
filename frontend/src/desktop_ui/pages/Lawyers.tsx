import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Search, SlidersHorizontal, Star, Video, CheckCircle2 } from "lucide-react";
import { ScreenShell } from "@desktop/components/layout/ScreenShell";
import { StickyHeader } from "@desktop/components/layout/StickyHeader";
import { Button } from "@desktop/components/common/Button";
import { useLanguage } from "@desktop/contexts/LanguageContext";
import { LAWYERS, type Lawyer } from "@desktop/data/lawyers";
import { VideoCallModal } from "@desktop/components/lawyer/VideoCallModal";
import { cn } from "@desktop/lib/utils";

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
      <div className="px-8 pt-6 pb-10 max-w-6xl">
        {/* Search + location row */}
        <div className="flex items-center gap-4 mb-5">
          <span className="ls-chip bg-primary/5 text-primary border-primary/20 shrink-0">
            <MapPin size={13} /> Bengaluru, KA
          </span>
          <div className="flex-1 flex items-center gap-2 ls-card h-11 px-4">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <input className="flex-1 bg-transparent text-sm outline-none" placeholder={t("searchLawyers")} />
            <button className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center" aria-label="Filter">
              <SlidersHorizontal size={15} />
            </button>
          </div>
        </div>

        {/* Category chips */}
        <div className="flex gap-2 flex-wrap mb-6">
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

        {/* Lawyer cards grid */}
        <div className="grid grid-cols-2 gap-4">
          {filtered.map((l) => (
            <article key={l.id} className="ls-card p-5">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 text-primary font-semibold text-lg flex items-center justify-center shrink-0">
                  {l.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <button onClick={() => navigate(`/lawyers/${l.id}`)} className="text-left">
                    <h3 className="font-display font-semibold text-base leading-tight">{l.name}</h3>
                  </button>
                  <p className="inline-flex items-center gap-1 text-[11px] text-success font-medium mt-0.5">
                    <CheckCircle2 size={12} /> {t("barCouncilVerified")}
                  </p>
                  <p className="text-accent font-bold text-sm mt-1">₹{l.fee}<span className="text-[10px] font-normal text-muted-foreground">/30min</span></p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3">
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

              <div className="mt-4 grid grid-cols-2 gap-2">
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
