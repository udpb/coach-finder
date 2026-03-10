/*
 * FilterPanel - Swiss Industrial Design
 * 좌측 고정 필터 패널. 티어/카테고리/국적 필터 추가. 다국어 지원.
 */
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, RotateCcw, ChevronDown, ChevronUp, Globe } from "lucide-react";
import type { FilterState, TierType, LangCode } from "@/types/coach";
import {
  EXPERTISE_OPTIONS,
  INDUSTRY_OPTIONS,
  REGION_OPTIONS,
  ROLE_OPTIONS,
  CATEGORY_OPTIONS,
  COUNTRY_OPTIONS,
  TIER_LABELS,
  CATEGORY_LABELS,
} from "@/types/coach";
import { useLanguage } from "@/contexts/LanguageContext";

interface FilterPanelProps {
  filters: FilterState;
  updateFilter: (key: keyof FilterState, value: unknown) => void;
  resetFilters: () => void;
  totalCount: number;
  filteredCount: number;
  stats: {
    tierCounts: Record<number, number>;
    catCounts: Record<string, number>;
    countryCounts: Record<string, number>;
    total: number;
  };
}

function FilterSection({
  title,
  options,
  selected,
  onChange,
  defaultOpen = false,
  renderLabel,
}: {
  title: string;
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
  defaultOpen?: boolean;
  renderLabel?: (opt: string) => string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const toggle = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((s) => s !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-3 px-4 text-left hover:bg-muted/50 transition-colors"
      >
        <span className="text-[13px] font-semibold tracking-tight text-foreground">
          {title}
          {selected.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-4 h-4 text-[10px] font-mono bg-primary text-white rounded-full">
              {selected.length}
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-0.5 max-h-[240px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-start gap-2.5 py-1.5 cursor-pointer group rounded-[2px] hover:bg-muted/30 px-1 -mx-1"
            >
              <Checkbox
                checked={selected.includes(opt)}
                onCheckedChange={() => toggle(opt)}
                className="mt-0.5 rounded-[2px] border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <span className="text-[12px] leading-snug text-muted-foreground group-hover:text-foreground transition-colors">
                {renderLabel ? renderLabel(opt) : opt}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const LANG_OPTIONS: { code: LangCode; label: string; flag: string }[] = [
  { code: "ko", label: "한국어", flag: "KR" },
  { code: "en", label: "EN", flag: "EN" },
  { code: "ja", label: "日本語", flag: "JP" },
];

export default function FilterPanel({
  filters,
  updateFilter,
  resetFilters,
  totalCount,
  filteredCount,
  stats,
}: FilterPanelProps) {
  const { lang, setLang, t } = useLanguage();

  return (
    <div className="w-[300px] flex-shrink-0 border-r border-border bg-white h-screen flex flex-col sticky top-0">
      {/* 헤더 */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 bg-primary" />
            <h1 className="text-[15px] font-bold tracking-tight text-foreground">
              {t("title")}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Language switcher */}
            <div className="flex items-center gap-0.5 border border-border rounded-[3px] overflow-hidden">
              {LANG_OPTIONS.map((opt) => (
                <button
                  key={opt.code}
                  onClick={() => setLang(opt.code)}
                  className={`px-1.5 py-0.5 text-[10px] font-mono transition-all ${
                    lang === opt.code
                      ? "bg-foreground text-white"
                      : "bg-white text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {opt.flag}
                </button>
              ))}
            </div>
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              {t("reset")}
            </button>
          </div>
        </div>

        {/* 검색 */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            placeholder={t("search_placeholder")}
            className="pl-8 h-8 text-[12px] bg-muted/50 border-0 rounded-[3px] placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>

        {/* 상단 툴바/통계 */}
        <div className="mt-3 flex items-baseline justify-between gap-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[24px] font-bold text-foreground leading-none tracking-tighter">
              {filteredCount}
            </span>
            <span className="text-[11px] text-muted-foreground">
              / {totalCount}{t("total")}
            </span>
          </div>
        </div>

        {/* AI 검색 (Gemini) */}
        <div className="mt-4 p-3 bg-indigo-50/50 border border-indigo-100 rounded-[3px] space-y-2">
          <div className="flex items-center gap-1.5 text-indigo-700 font-semibold text-[11px]">
            <Globe className="w-3 h-3" />
            <span>AI 맞춤 추천 (RFP 기반)</span>
          </div>
          <p className="text-[10px] text-indigo-600/70 leading-relaxed">
            요구사항(RFP)을 입력하면 Gemini AI가 분석하여 최적의 코치를 추천합니다.
          </p>
          <button
            onClick={() => (window as any).dispatchAiModalOpen?.()}
            className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-medium rounded-[2px] transition-colors flex items-center justify-center gap-1.5"
          >
            <Search className="w-3 h-3" />
            AI 추천 받기
          </button>
        </div>

        {/* Tier 미니 통계 */}
        <div className="mt-2 flex gap-1">
          {([1, 2, 3] as TierType[]).map((tier) => (
            <div
              key={tier}
              className={`flex-1 text-center py-1 rounded-[2px] text-[10px] font-mono cursor-pointer transition-all border ${
                filters.tiers.includes(tier)
                  ? tier === 1
                    ? "bg-primary text-white border-primary"
                    : tier === 2
                    ? "bg-foreground text-white border-foreground"
                    : "bg-muted-foreground text-white border-muted-foreground"
                  : "bg-muted/50 text-muted-foreground border-transparent hover:border-border"
              }`}
              onClick={() => {
                const next = filters.tiers.includes(tier)
                  ? filters.tiers.filter((t) => t !== tier)
                  : [...filters.tiers, tier];
                updateFilter("tiers", next);
              }}
            >
              T{tier} · {stats.tierCounts[tier] || 0}
            </div>
          ))}
        </div>
      </div>

      {/* 필터 섹션 */}
      <ScrollArea className="flex-1">
        {/* 유형 필터 */}
        <FilterSection
          title={t("category")}
          options={CATEGORY_OPTIONS}
          selected={filters.categories}
          onChange={(val) => updateFilter("categories", val)}
          defaultOpen={true}
          renderLabel={(opt) => {
            const label = CATEGORY_LABELS[opt];
            const count = stats.catCounts[opt] || 0;
            return `${label ? label[lang] : opt} (${count})`;
          }}
        />

        {/* 국적 필터 */}
        <FilterSection
          title={t("country")}
          options={COUNTRY_OPTIONS}
          selected={filters.countries}
          onChange={(val) => updateFilter("countries", val)}
          renderLabel={(opt) => {
            const count = stats.countryCounts[opt] || 0;
            return `${opt} (${count})`;
          }}
        />

        <FilterSection
          title={t("expertise")}
          options={EXPERTISE_OPTIONS}
          selected={filters.expertise}
          onChange={(val) => updateFilter("expertise", val)}
        />
        <FilterSection
          title={t("industry")}
          options={INDUSTRY_OPTIONS}
          selected={filters.industries}
          onChange={(val) => updateFilter("industries", val)}
        />
        <FilterSection
          title={t("region")}
          options={REGION_OPTIONS}
          selected={filters.regions}
          onChange={(val) => updateFilter("regions", val)}
        />
        <FilterSection
          title={t("role")}
          options={ROLE_OPTIONS}
          selected={filters.roles}
          onChange={(val) => updateFilter("roles", val)}
        />

        {/* 해외 코칭 */}
        <div className="border-b border-border px-4 py-3">
          <span className="text-[13px] font-semibold tracking-tight text-foreground block mb-2">
            {t("overseas_label")}
          </span>
          <div className="flex gap-1.5">
            {[
              { labelKey: "overseas_all", value: null },
              { labelKey: "overseas_yes", value: true },
              { labelKey: "overseas_no", value: false },
            ].map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => updateFilter("overseas", opt.value)}
                className={`px-3 py-1.5 text-[11px] rounded-[2px] border transition-all ${
                  filters.overseas === opt.value
                    ? "bg-foreground text-white border-foreground"
                    : "bg-white text-muted-foreground border-border hover:border-foreground"
                }`}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* 추천 인원 수 */}
        <div className="px-4 py-3 border-b border-border">
          <span className="text-[13px] font-semibold tracking-tight text-foreground block mb-2">
            {t("rec_count")}
          </span>
          <div className="flex gap-1.5 flex-wrap">
            {[3, 5, 7, 10, 15, 20, 50].map((n) => (
              <button
                key={n}
                onClick={() => updateFilter("resultCount", n)}
                className={`w-9 h-7 text-[12px] font-mono rounded-[2px] border transition-all ${
                  filters.resultCount === n
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-muted-foreground border-border hover:border-primary"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="h-4" />
      </ScrollArea>
    </div>
  );
}
