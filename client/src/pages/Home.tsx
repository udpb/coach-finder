/*
 * Home - Swiss Industrial Dashboard
 * 좌측 필터 + 우측 코치 카드 그리드
 * 티어 기반 UI, 다국어 지원
 */
import { useState } from "react";
import { useCoachSearch } from "@/hooks/useCoachSearch";
import FilterPanel from "@/components/FilterPanel";
import CoachCard from "@/components/CoachCard";
import CoachDetailModal from "@/components/CoachDetailModal";
import SelectionBar from "@/components/SelectionBar";
import { Button } from "@/components/ui/button";
import { CheckSquare, Users, Search } from "lucide-react";
import type { Coach } from "@/types/coach";
import { AnimatePresence } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Home() {
  const {
    filters,
    updateFilter,
    resetFilters,
    filteredCoaches,
    topCoaches,
    selectedCoaches,
    selectedCoachList,
    toggleCoach,
    selectTopCoaches,
    clearSelection,
    allCoaches,
    stats,
  } = useCoachSearch();

  const { t } = useLanguage();
  const [detailCoach, setDetailCoach] = useState<Coach | null>(null);
  const [viewMode, setViewMode] = useState<"recommended" | "all">("recommended");

  const displayCoaches =
    viewMode === "recommended"
      ? topCoaches
      : filteredCoaches.map((c) => ({ coach: c, score: 0 }));

  const hasActiveFilters =
    filters.expertise.length > 0 ||
    filters.industries.length > 0 ||
    filters.regions.length > 0 ||
    filters.roles.length > 0 ||
    filters.overseas !== null ||
    filters.search !== "" ||
    filters.tiers.length > 0 ||
    filters.categories.length > 0 ||
    filters.countries.length > 0;

  return (
    <div className="flex min-h-screen bg-white">
      {/* 좌측 필터 패널 */}
      <FilterPanel
        filters={filters}
        updateFilter={updateFilter}
        resetFilters={resetFilters}
        totalCount={allCoaches.length}
        filteredCount={filteredCoaches.length}
        stats={stats}
      />

      {/* 우측 메인 영역 */}
      <main className="flex-1 min-w-0">
        {/* 상단 툴바 */}
        <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-border px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* 뷰 모드 토글 */}
              <div className="flex border border-border">
                <button
                  onClick={() => setViewMode("recommended")}
                  className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    viewMode === "recommended"
                      ? "bg-foreground text-white"
                      : "bg-white text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t("recommended")} {filters.resultCount}
                </button>
                <button
                  onClick={() => setViewMode("all")}
                  className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    viewMode === "all"
                      ? "bg-foreground text-white"
                      : "bg-white text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t("all_results")} ({filteredCoaches.length})
                </button>
              </div>

              {/* 추천 코치 일괄 선택 */}
              {viewMode === "recommended" && topCoaches.length > 0 && (
                <Button
                  onClick={selectTopCoaches}
                  variant="outline"
                  className="h-7 px-3 text-[11px] rounded-[2px] border-border hover:bg-primary hover:text-white hover:border-primary"
                >
                  <CheckSquare className="w-3 h-3 mr-1" />
                  {t("select_all")}
                </Button>
              )}

              {/* 활성 필터 표시 */}
              {hasActiveFilters && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Search className="w-3 h-3" />
                  <span>{t("filter_active")}</span>
                </div>
              )}
            </div>

            {/* 선택 상태 */}
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              <span>
                <span className="font-mono font-semibold text-foreground">
                  {selectedCoaches.size}
                </span>
                {t("selected")}
              </span>
            </div>
          </div>
        </div>

        {/* 코치 카드 그리드 */}
        <div className="p-6 pb-28">
          {displayCoaches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Users className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-[14px] font-semibold text-foreground mb-1">
                {t("no_results")}
              </p>
              <p className="text-[12px] text-muted-foreground mb-4">
                {t("no_results_sub")}
              </p>
              <Button
                onClick={resetFilters}
                variant="outline"
                className="h-8 px-4 text-[12px] rounded-[2px]"
              >
                {t("reset_filters")}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              <AnimatePresence mode="popLayout">
                {displayCoaches.map((item, idx) => (
                  <CoachCard
                    key={item.coach.id}
                    coach={item.coach}
                    score={viewMode === "recommended" ? item.score : undefined}
                    rank={viewMode === "recommended" ? idx + 1 : undefined}
                    isSelected={selectedCoaches.has(item.coach.id)}
                    onToggle={() => toggleCoach(item.coach.id)}
                    onViewDetail={() => setDetailCoach(item.coach)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>

      {/* 코치 상세 모달 */}
      <CoachDetailModal
        coach={detailCoach}
        open={!!detailCoach}
        onClose={() => setDetailCoach(null)}
      />

      {/* 하단 선택 바 */}
      <SelectionBar
        selectedCoaches={selectedCoachList}
        onRemove={(id) => toggleCoach(id)}
        onClear={clearSelection}
      />
    </div>
  );
}
