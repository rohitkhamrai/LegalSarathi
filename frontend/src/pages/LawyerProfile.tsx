import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Star, Video } from "lucide-react";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { StickyHeader } from "@/components/layout/StickyHeader";
import { Button } from "@/components/common/Button";
import { LAWYERS } from "@/data/lawyers";
import { useLanguage } from "@/contexts/LanguageContext";
import { VideoCallModal } from "@/components/lawyer/VideoCallModal";
import { cn } from "@/lib/utils";

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
        <div className="p-6 text-sm text-muted-foreground">Lawyer not found.</div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <StickyHeader title={lawyer.name} showBack showLanguagePill />
      <div className="px-6 pt-4 pb-32">
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-primary/10 text-primary text-xl font-semibold flex items-center justify-center">
            {lawyer.initials}
          </div>
          <div>
            <h1 className="font-display font-bold text-lg">{lawyer.name}</h1>
            <p className="text-[11px] text-success inline-flex items-center gap-1"><CheckCircle2 size={12} /> {t("barCouncilVerified")}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Bar ID: {lawyer.barId}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3 text-xs">
          <span className="inline-flex items-center gap-1"><Star size={14} className="text-accent fill-accent" /> {lawyer.rating} ({lawyer.reviews})</span>
          <span className="text-accent font-bold">₹{lawyer.fee}/30 min</span>
        </div>

        <div className="mt-5 flex border-b border-border">
          {TABS.map((x) => (
            <button
              key={x}
              onClick={() => setTab(x)}
              className={cn(
                "flex-1 py-2.5 text-sm font-medium",
                tab === x ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
              )}
            >
              {x}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === "Overview" && (
            <div className="space-y-3 text-sm">
              <p>{lawyer.bio}</p>
              <p className="font-native text-xs text-muted-foreground">{lawyer.languages.join(" · ")}</p>
            </div>
          )}
          {tab === "Reviews" && (
            <div className="space-y-3 text-sm">
              {[1, 2, 3].map((i) => (
                <div key={i} className="ls-card p-3">
                  <p className="text-xs font-semibold">Anonymous client</p>
                  <p className="text-xs text-muted-foreground mt-1">Patient and clear. Helped me draft a strong reply.</p>
                </div>
              ))}
            </div>
          )}
          {tab === "Availability" && (
            <div>
              <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] mt-2">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <button key={i} className={cn("py-2 rounded-lg border", i === 1 ? "bg-primary text-primary-foreground border-primary" : "border-border")}>
                    {d}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {["10:00", "11:30", "14:00", "15:30", "17:00", "18:30"].map((s) => (
                  <button key={s} className="py-2 rounded-lg border border-border text-xs hover:border-primary tap">{s}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-16 left-0 right-0 bg-card/95 backdrop-blur border-t border-border">
        <div className="max-w-md mx-auto px-4 py-3 grid grid-cols-2 gap-2">
          <Button onClick={() => navigate(-1)}>{t("bookConsultation")}</Button>
          <Button variant="secondary" leftIcon={<Video size={16} />} onClick={() => setVideoOpen(true)}>{t("videoCall")}</Button>
        </div>
      </div>

      <VideoCallModal lawyer={videoOpen ? lawyer : null} onClose={() => setVideoOpen(false)} />
    </ScreenShell>
  );
};

export default LawyerProfile;
