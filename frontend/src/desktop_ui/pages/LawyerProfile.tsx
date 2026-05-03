import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Star, Video, MapPin } from "lucide-react";
import { ScreenShell } from "@desktop/components/layout/ScreenShell";
import { StickyHeader } from "@desktop/components/layout/StickyHeader";
import { Button } from "@desktop/components/common/Button";
import { LAWYERS } from "@desktop/data/lawyers";
import { useLanguage } from "@desktop/contexts/LanguageContext";
import { VideoCallModal } from "@desktop/components/lawyer/VideoCallModal";
import { cn } from "@desktop/lib/utils";

const TABS = ["Overview", "Reviews", "Availability"] as const;

const LawyerProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const lawyer = LAWYERS.find((l) => l.id === id);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [videoOpen, setVideoOpen] = useState(false);

  if (!lawyer) {
    return (
      <ScreenShell>
        <StickyHeader title={t("findLawyer")} showBack />
        <div className="p-8 text-sm text-muted-foreground">Lawyer not found.</div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <StickyHeader title={lawyer.name} showBack showLanguagePill />
      <div className="px-8 pt-6 pb-10 max-w-5xl">
        <div className="grid grid-cols-3 gap-8">
          {/* Left: lawyer summary card */}
          <div className="col-span-1 space-y-4">
            <div className="ls-card p-6 flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-primary/10 text-primary text-2xl font-semibold flex items-center justify-center mb-4">
                {lawyer.initials}
              </div>
              <h1 className="font-display font-bold text-lg">{lawyer.name}</h1>
              <p className="text-[11px] text-success inline-flex items-center gap-1 mt-1">
                <CheckCircle2 size={12} /> {t("barCouncilVerified")}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Bar ID: {lawyer.barId}</p>
              <div className="flex items-center gap-3 mt-3 text-xs">
                <span className="inline-flex items-center gap-1"><Star size={13} className="text-accent fill-accent" /> {lawyer.rating} ({lawyer.reviews})</span>
              </div>
              <p className="text-accent font-bold text-lg mt-2">₹{lawyer.fee}<span className="text-xs font-normal text-muted-foreground">/30 min</span></p>
              <p className="text-[11px] inline-flex items-center gap-1 mt-2 text-muted-foreground">
                <MapPin size={11} /> {lawyer.area ? `${lawyer.area}, ` : ""}{lawyer.city}
              </p>
              <p className="text-[11px] font-native mt-2 text-foreground/80">{lawyer.languages.join(" · ")}</p>
              <p className="text-[11px] inline-flex items-center gap-1.5 mt-2 text-success">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                {lawyer.availability === "today" ? t("availableToday") : t("availableTomorrow")}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Button onClick={() => navigate(-1)}>{t("bookConsultation")}</Button>
              <Button variant="secondary" leftIcon={<Video size={16} />} onClick={() => setVideoOpen(true)}>{t("videoCall")}</Button>
            </div>
          </div>

          {/* Right: tabs content */}
          <div className="col-span-2">
            <div className="flex border-b border-border mb-6">
              {TABS.map((x) => (
                <button
                  key={x}
                  onClick={() => setTab(x)}
                  className={cn(
                    "px-5 py-3 text-sm font-medium",
                    tab === x ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {x}
                </button>
              ))}
            </div>

            <div>
              {tab === "Overview" && (
                <div className="space-y-4 text-sm">
                  <p className="text-foreground leading-relaxed">{lawyer.bio}</p>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {lawyer.specialisations.map((s) => (
                      <span key={s} className="text-xs px-3 py-1 rounded-lg bg-muted text-foreground font-medium">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {tab === "Reviews" && (
                <div className="grid grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="ls-card p-4">
                      <p className="text-xs font-semibold">Anonymous client</p>
                      <div className="flex gap-0.5 mt-1">
                        {[1,2,3,4,5].map(s => <Star key={s} size={11} className="text-accent fill-accent" />)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 leading-snug">Patient and clear. Helped me draft a strong reply.</p>
                    </div>
                  ))}
                </div>
              )}
              {tab === "Availability" && (
                <div>
                  <div className="grid grid-cols-7 gap-2 text-center text-xs mb-6">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
                      <button key={i} className={cn("py-2.5 rounded-xl border font-medium", i === 1 ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50")}>
                        {d}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {["10:00", "11:30", "14:00", "15:30", "17:00", "18:30", "19:00", "20:00"].map((s) => (
                      <button key={s} className="py-2.5 rounded-xl border border-border text-sm hover:border-primary tap">{s}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <VideoCallModal lawyer={videoOpen ? lawyer : null} onClose={() => setVideoOpen(false)} />
    </ScreenShell>
  );
};

export default LawyerProfile;
