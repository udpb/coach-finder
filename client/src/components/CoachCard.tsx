/*
 * CoachCard - Swiss Industrial Design
 * 얇은 1px 구분선, 원형 흑백 사진, 티어 뱃지, 카테고리 표시
 */
import { Check, User, Globe } from "lucide-react";
import type { Coach } from "@/types/coach";
import { TIER_LABELS, CATEGORY_LABELS } from "@/types/coach";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";

interface CoachCardProps {
  coach: Coach;
  score?: number;
  rank?: number;
  isSelected: boolean;
  onToggle: () => void;
  onViewDetail: () => void;
}

function formatCareer(raw: string, years: number): string {
  if (raw && raw !== "nan") return raw;
  if (years > 0) return `${years}년`;
  return "";
}

const TIER_COLORS: Record<number, string> = {
  1: "bg-primary text-white",
  2: "bg-foreground text-white",
  3: "bg-muted-foreground text-white",
};

const CATEGORY_COLORS: Record<string, string> = {
  "파트너코치": "bg-primary/10 text-primary border-primary/20",
  "코치": "bg-blue-50 text-blue-700 border-blue-200",
  "컨설턴트": "bg-amber-50 text-amber-700 border-amber-200",
  "투자사": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "글로벌코치": "bg-violet-50 text-violet-700 border-violet-200",
  "로컬크리에이터": "bg-orange-50 text-orange-700 border-orange-200",
  "특강연사": "bg-cyan-50 text-cyan-700 border-cyan-200",
};

export default function CoachCard({
  coach,
  score,
  rank,
  isSelected,
  onToggle,
  onViewDetail,
}: CoachCardProps) {
  const { lang, t } = useLanguage();
  const catLabel = CATEGORY_LABELS[coach.category]?.[lang] || coach.category;
  const catColor = CATEGORY_COLORS[coach.category] || "bg-gray-50 text-gray-600 border-gray-200";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: rank ? rank * 0.03 : 0 }}
      className={`group relative border transition-all duration-150 ${
        isSelected
          ? "border-primary bg-red-50/40 shadow-[inset_3px_0_0_0_#E53935]"
          : "border-border bg-white hover:border-gray-300"
      }`}
    >
      {/* 랭크 번호 */}
      {rank !== undefined && (
        <div className="absolute top-0 left-0 w-6 h-6 flex items-center justify-center bg-foreground text-white text-[10px] font-mono font-semibold">
          {rank}
        </div>
      )}

      {/* 티어 뱃지 */}
      <div className={`absolute top-0 right-8 px-1.5 py-[1px] text-[9px] font-mono font-semibold ${TIER_COLORS[coach.tier]}`}>
        T{coach.tier}
      </div>

      {/* 선택 체크 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`absolute top-2.5 right-2.5 w-5 h-5 flex items-center justify-center border rounded-[2px] transition-all z-10 ${
          isSelected
            ? "bg-primary border-primary"
            : "border-gray-300 hover:border-primary bg-white"
        }`}
      >
        {isSelected && <Check className="w-3 h-3 text-white" />}
      </button>

      <div className="p-4 cursor-pointer" onClick={onViewDetail}>
        {/* 상단: 사진 + 이름 */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-[52px] h-[52px] rounded-full overflow-hidden flex-shrink-0 bg-gray-100 ring-1 ring-gray-200">
            {coach.photo_url ? (
              <img
                src={coach.photo_url}
                alt={coach.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-200">
                <User className="w-5 h-5 text-gray-400" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-1.5">
              <h3 className="text-[15px] font-bold text-foreground leading-tight tracking-tight">
                {coach.name}
              </h3>
              {coach.country && coach.country !== "한국" && (
                <span className="text-[9px] px-1 py-[1px] bg-violet-100 text-violet-600 font-mono rounded-[1px]">
                  {coach.country}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {[coach.organization, coach.position].filter(Boolean).join(" · ") || coach.main_field || "-"}
            </p>
            {score !== undefined && score > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <div className="w-12 h-[3px] bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${Math.min(score * 5, 100)}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {score.toFixed(1)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 카테고리 + 한줄 소개 */}
        <div className="flex items-center gap-1.5 mb-2">
          <span className={`px-1.5 py-[2px] text-[10px] font-medium border leading-tight ${catColor}`}>
            {catLabel}
          </span>
          {coach.main_field && coach.main_field !== coach.category && (
            <span className="px-1.5 py-[2px] text-[10px] text-muted-foreground border border-border leading-tight truncate max-w-[140px]">
              {coach.main_field}
            </span>
          )}
        </div>

        {coach.intro && (
          <p className="text-[11px] text-primary/80 italic mb-2.5 line-clamp-1 leading-relaxed">
            "{coach.intro}"
          </p>
        )}

        {/* 태그들 */}
        <div className="flex flex-wrap gap-1 mb-2.5">
          {coach.roles.slice(0, 3).map((role) => (
            <span
              key={role}
              className="px-1.5 py-[2px] text-[10px] font-medium bg-foreground text-white leading-tight"
            >
              {role}
            </span>
          ))}
          {coach.expertise.slice(0, 2).map((exp) => (
            <span
              key={exp}
              className="px-1.5 py-[2px] text-[10px] text-muted-foreground border border-border leading-tight"
            >
              {exp.length > 16 ? exp.slice(0, 16) + "..." : exp}
            </span>
          ))}
        </div>

        {/* 하단 정보 */}
        <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground border-t border-border pt-2.5">
          {formatCareer(coach.career_years_raw, coach.career_years) && (
            <>
              <span className="font-mono font-medium text-foreground/70">
                {formatCareer(coach.career_years_raw, coach.career_years)}
              </span>
              <span className="w-px h-3 bg-border" />
            </>
          )}
          <span className="truncate flex-1">
            {coach.industries.length > 0
              ? coach.industries.slice(0, 2).join(", ")
              : coach.expertise.slice(0, 2).join(", ") || "-"}
          </span>
          {coach.overseas && (
            <>
              <span className="w-px h-3 bg-border" />
              <Globe className="w-3 h-3 text-primary" />
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
