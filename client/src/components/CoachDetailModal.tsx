/*
 * CoachDetailModal - Swiss Industrial Design
 * 코치 상세 정보 모달. 티어/카테고리 표시, 다국어 지원.
 */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { User, Mail, Phone, Building2, MapPin, GraduationCap, Briefcase, Globe, Flag } from "lucide-react";
import type { Coach } from "@/types/coach";
import { TIER_LABELS, CATEGORY_LABELS } from "@/types/coach";
import { useLanguage } from "@/contexts/LanguageContext";

interface CoachDetailModalProps {
  coach: Coach | null;
  open: boolean;
  onClose: () => void;
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  if (!value || value === "nan" || value === "-" || value.trim() === "") return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block mb-0.5">
          {label}
        </span>
        <span className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap break-words">
          {value}
        </span>
      </div>
    </div>
  );
}

function TextSection({ title, content }: { title: string; content: string }) {
  if (!content || content === "nan" || content.trim() === "") return null;
  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-1 h-4 bg-primary" />
        <h4 className="text-[12px] uppercase font-bold text-foreground tracking-wider">
          {title}
        </h4>
      </div>
      <p className="text-[12px] text-muted-foreground leading-relaxed whitespace-pre-wrap pl-3 border-l border-border">
        {content}
      </p>
    </div>
  );
}

const TIER_BADGE_COLORS: Record<number, string> = {
  1: "bg-primary text-white",
  2: "bg-foreground text-white",
  3: "bg-muted-foreground text-white",
};

export default function CoachDetailModal({ coach, open, onClose }: CoachDetailModalProps) {
  const { lang, t } = useLanguage();
  if (!coach) return null;

  const tierLabel = TIER_LABELS[coach.tier]?.[lang] || `Tier ${coach.tier}`;
  const catLabel = CATEGORY_LABELS[coach.category]?.[lang] || coach.category;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 rounded-none border border-border shadow-lg">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-4">
            {/* 사진 */}
            <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0 bg-gray-100 ring-2 ring-gray-200">
              {coach.photo_url ? (
                <img
                  src={coach.photo_url}
                  alt={coach.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-200">
                  <User className="w-8 h-8 text-gray-400" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-1.5 py-[2px] text-[10px] font-mono font-semibold ${TIER_BADGE_COLORS[coach.tier]}`}>
                  T{coach.tier}
                </span>
                <span className="px-1.5 py-[2px] text-[10px] font-medium bg-muted text-foreground">
                  {catLabel}
                </span>
                {coach.country && coach.country !== "한국" && (
                  <span className="px-1.5 py-[2px] text-[10px] bg-violet-100 text-violet-600 font-mono">
                    {coach.country}
                  </span>
                )}
              </div>
              <DialogTitle className="text-[22px] font-bold text-foreground tracking-tight">
                {coach.name}
              </DialogTitle>
              <p className="text-[13px] text-muted-foreground mt-1">
                {[coach.organization, coach.position].filter(Boolean).join(" · ") || coach.main_field || ""}
              </p>
              {coach.intro && (
                <p className="text-[12px] text-primary italic mt-1.5 line-clamp-2">
                  "{coach.intro}"
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-160px)]">
          <div className="px-6 py-4">
            {/* 기본 정보 */}
            <InfoRow icon={Building2} label={t("org_label")} value={[coach.organization, coach.position].filter(Boolean).join(" / ")} />
            {(coach.career_years_raw || coach.career_years > 0) && (
              <InfoRow icon={Briefcase} label={t("career_label")} value={coach.career_years_raw || `${coach.career_years}${t("career_label") === "Career" ? " years" : "년"}`} />
            )}
            <InfoRow icon={GraduationCap} label={t("education_label")} value={coach.education} />
            <InfoRow icon={MapPin} label={t("region")} value={coach.regions.join(", ")} />
            <InfoRow icon={Globe} label={t("overseas_label")} value={coach.overseas ? (coach.overseas_detail || t("overseas_yes")) : ""} />
            {coach.country && coach.country !== "한국" && (
              <InfoRow icon={Flag} label={t("country")} value={coach.country} />
            )}
            <InfoRow icon={Mail} label={lang === "ko" ? "이메일" : "Email"} value={coach.email} />
            <InfoRow icon={Phone} label={lang === "ko" ? "연락처" : "Phone"} value={coach.phone} />

            {/* 태그 영역 */}
            <div className="mt-5 space-y-3">
              {coach.expertise.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">{t("expertise")}</span>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {coach.expertise.map((e) => (
                      <span key={e} className="px-2 py-0.5 text-[11px] bg-muted text-foreground">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {coach.industries.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">{t("industry")}</span>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {coach.industries.map((i) => (
                      <span key={i} className="px-2 py-0.5 text-[11px] border border-border text-muted-foreground">
                        {i}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {coach.roles.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">{t("role")}</span>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {coach.roles.map((r) => (
                      <span key={r} className="px-2 py-0.5 text-[11px] bg-foreground text-white font-medium">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 상세 텍스트 */}
            <TextSection title={t("career_history_label")} content={coach.career_history} />
            <TextSection title={t("current_work_label")} content={coach.current_work} />
            <TextSection title={t("underdogs_label")} content={coach.underdogs_history} />
            <TextSection title={t("tools_label")} content={coach.tools_skills} />

            <div className="h-8" />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
