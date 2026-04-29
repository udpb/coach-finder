/*
 * Home - Swiss Industrial Dashboard
 * 좌측 필터 + 우측 코치 카드 그리드
 * 티어 기반 UI, 다국어 지원, 신규 등록/수정 기능
 */
import { useState, useCallback } from "react";
import { useCoachSearch } from "@/hooks/useCoachSearch";
import { useCoachData } from "@/contexts/CoachDataContext";
import FilterPanel from "@/components/FilterPanel";
import CoachCard from "@/components/CoachCard";
import CoachDetailModal from "@/components/CoachDetailModal";
import CoachFormModal from "@/components/CoachFormModal";
import AiRecommendModal from "@/components/AiRecommendModal";
import SelectionBar from "@/components/SelectionBar";
import { Button } from "@/components/ui/button";
import { CheckSquare, Users, Search, Plus, Settings2, Sparkles, LogOut, ChevronDown, ClipboardList } from "lucide-react";
import type { Coach } from "@/types/coach";
import { AnimatePresence } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

const ALL_PAGE_SIZE = 50;

export default function Home() {
  const {
    filters,
    updateFilter,
    resetFilters,
    filteredCoaches,
    rankedCoaches,
    topCoaches,
    selectedCoaches,
    selectedCoachList,
    toggleCoach,
    selectTopCoaches,
    clearSelection,
    allCoaches,
    stats,
    setAiRecommendations,
    aiRecommendedCoaches,
    coachAvailability,
  } = useCoachSearch();

  const { addCoach, updateCoach, deleteCoach, customDataStats } = useCoachData();
  const { t } = useLanguage();
  const { logout, user, isAdmin } = useAuth();
  const [detailCoach, setDetailCoach] = useState<Coach | null>(null);
  const [viewMode, setViewMode] = useState<"recommended" | "all">("recommended");
  const [formOpen, setFormOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [editCoach, setEditCoach] = useState<Coach | null>(null);
  const [allPage, setAllPage] = useState(1);
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiExtraction, setAiExtraction] = useState<Record<string, any> | null>(null);
  
  // Expose modal open function for FilterPanel
  (window as any).dispatchAiModalOpen = () => setAiModalOpen(true);

  const allFiltered = filteredCoaches.map((c) => ({ coach: c, score: 0 }));
  const displayCoaches =
    viewMode === "recommended"
      ? topCoaches
      : allFiltered.slice(0, allPage * ALL_PAGE_SIZE);

  const hasMoreAll =
    viewMode === "all" && allPage * ALL_PAGE_SIZE < filteredCoaches.length;

  const maxTopScore = topCoaches.length > 0
    ? Math.max(...topCoaches.map((c) => c.score), 1)
    : 1;

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

  const handleOpenNew = () => {
    setEditCoach(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (coach: Coach) => {
    setEditCoach(coach);
    setFormOpen(true);
  };

  const handleSave = (data: Omit<Coach, "id"> | Partial<Coach>, isNew: boolean) => {
    if (isNew) {
      addCoach(data as Omit<Coach, "id">);
    } else if (editCoach) {
      updateCoach(editCoach.id, data as Partial<Coach>);
    }
  };

  const handleDelete = (id: number) => {
    deleteCoach(id);
  };

  // AI 추천: 스트리밍 우선 → 폴백 non-streaming → 폴백 클라이언트 키워드
  const handleAiRecommend = useCallback(async (text: string) => {
    const filterParams = {
      industries: filters.industries,
      expertise: filters.expertise,
      regions: filters.regions,
      roles: filters.roles,
      tiers: filters.tiers,
      categories: filters.categories,
    };

    // 1단계: 스트리밍 시도
    try {
      const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
      const res = await fetch(`${apiBase}/api/v1/recommend/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfp_text: text, filters: filterParams, top_k: filters.resultCount }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok || !res.body) throw new Error('stream_error');

      setAiRecommendations([]);
      setAiExtraction(null);
      setViewMode("recommended");
      setAiStreaming(true);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const accumulated: any[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'extraction') {
              setAiExtraction(event.data);
            } else if (event.type === 'coach') {
              accumulated.push(event.data);
              setAiRecommendations([...accumulated]);
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch { /* skip malformed lines */ }
        }
      }
      setAiStreaming(false);
      return;
    } catch {
      setAiStreaming(false); // 스트리밍 도중 오류 시 인디케이터 리셋
    }

    // 2단계: non-streaming 시도
    try {
      const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
      const res = await fetch(`${apiBase}/api/v1/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfp_text: text, filters: filterParams, top_k: filters.resultCount }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error('server_error');
      const data = await res.json();
      if (data.extraction) setAiExtraction(data.extraction);
      if (data.recommendations) setAiRecommendations(data.recommendations);
      setViewMode("recommended");
      return;
    } catch {
      // 서버 미응답 시 클라이언트 키워드 기반 검색으로 폴백
      const keywords = text
        .split(/[\s,./\n]+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 1);

      const scored = rankedCoaches.map(({ coach, score }) => {
        let boost = 0;
        const haystack = [
          coach.name,
          coach.intro,
          coach.career_history,
          coach.current_work,
          coach.underdogs_history,
          coach.main_field || "",
          ...coach.expertise,
          ...coach.industries,
          ...coach.roles,
        ]
          .join(" ")
          .toLowerCase();
        keywords.forEach((kw) => {
          if (haystack.includes(kw.toLowerCase())) boost += 2;
        });
        return { coach, score: score + boost };
      });

      scored.sort((a, b) => b.score - a.score);
      // rankedCoaches 형식으로 변환해서 AI 추천 목록에 등록
      setAiRecommendations(
        scored.slice(0, filters.resultCount).map(({ coach, score }) => ({
          score,
          metadata: { id: coach.id, name: coach.name },
        }))
      );
      setViewMode("recommended");
    }
  }, [rankedCoaches, filters, setAiRecommendations]);

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
                  onClick={() => { setViewMode("all"); setAllPage(1); }}
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

              {/* 스트리밍 인디케이터 */}
              {aiStreaming && (
                <div className="flex items-center gap-1.5 text-[10px] text-indigo-600 animate-pulse">
                  <Sparkles className="w-3 h-3" />
                  <span>AI 분석 중...</span>
                </div>
              )}

              {/* 활성 필터 표시 */}
              {hasActiveFilters && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Search className="w-3 h-3" />
                  <span>{t("filter_active")}</span>
                </div>
              )}
            </div>

            {/* 우측: 신규 등록 + 선택 상태 */}
            <div className="flex items-center gap-4">
              {/* 커스텀 데이터 인디케이터 */}
              {(customDataStats.added > 0 || customDataStats.edited > 0) && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted px-2 py-1">
                  <Settings2 className="w-3 h-3" />
                  <span>
                    {customDataStats.added > 0 && `+${customDataStats.added}`}
                    {customDataStats.added > 0 && customDataStats.edited > 0 && " / "}
                    {customDataStats.edited > 0 && `${customDataStats.edited} 수정`}
                  </span>
                </div>
              )}

              {/* AI 추천 버튼 */}
              <Button
                onClick={() => setAiModalOpen(true)}
                variant="outline"
                className="h-7 px-3 text-[11px] rounded-[2px] border-indigo-400 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
              >
                <Sparkles className="w-3 h-3 mr-1" />
                {t("ai_recommend") || "AI 추천"}
              </Button>

              {/* 사업 관리 버튼 */}
              <a
                href="/projects"
                className="inline-flex items-center h-7 px-3 text-[11px] font-medium rounded-[2px] border border-border text-muted-foreground hover:bg-muted transition-colors"
              >
                <ClipboardList className="w-3 h-3 mr-1" />
                사업 관리
              </a>

              {/* 신규 등록 버튼 */}
              <Button
                onClick={handleOpenNew}
                variant="outline"
                className="h-7 px-3 text-[11px] rounded-[2px] border-primary text-primary hover:bg-primary hover:text-white"
              >
                <Plus className="w-3 h-3 mr-1" />
                {t("add_new") || "신규 등록"}
              </Button>

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

              {/* Hub return link (Phase H2) */}
              <a
                href="https://underdogs-hub.vercel.app/"
                title="허브로 돌아가기"
                className="text-[11px] text-muted-foreground hover:text-primary border border-border rounded px-2 py-1 ml-2 transition-colors"
              >
                ↩ Hub
              </a>

              {/* 사용자 / 로그아웃 */}
              <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
                {user && (
                  <span className="text-[10px] text-muted-foreground">{user}</span>
                )}
                <Button
                  onClick={logout}
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                  title="로그아웃"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* AI 분석 결과 배너 */}
        {aiExtraction && viewMode === "recommended" && aiRecommendedCoaches.length > 0 && (
          <div className="mx-6 mt-4 p-3 bg-indigo-50 border border-indigo-200 flex items-start gap-2.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              {aiExtraction.project_name && (
                <p className="text-[12px] font-semibold text-indigo-900 mb-0.5">{aiExtraction.project_name}</p>
              )}
              {aiExtraction.summary && (
                <p className="text-[11px] text-indigo-700 mb-1.5 leading-relaxed">{aiExtraction.summary}</p>
              )}
              <div className="flex flex-wrap gap-1">
                {aiExtraction.required_domains?.map((d: string) => (
                  <span key={d} className="px-1.5 py-0.5 text-[10px] bg-indigo-100 text-indigo-700 border border-indigo-200">{d}</span>
                ))}
                {aiExtraction.required_skills?.slice(0, 6).map((s: string) => (
                  <span key={s} className="px-1.5 py-0.5 text-[10px] bg-white text-indigo-600 border border-indigo-200">{s}</span>
                ))}
                {aiExtraction.coach_count > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] bg-indigo-600 text-white ml-1">코치 {aiExtraction.coach_count}명</span>
                )}
              </div>
            </div>
            <button
              onClick={() => { setAiExtraction(null); resetFilters(); }}
              className="ml-auto text-indigo-400 hover:text-indigo-700 flex-shrink-0 text-[10px]"
            >
              ✕
            </button>
          </div>
        )}

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
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                <AnimatePresence mode="popLayout">
                  {displayCoaches.map((item, idx) => (
                    <CoachCard
                      key={item.coach.id}
                      coach={item.coach}
                      matchPercent={viewMode === "recommended" && item.score > 0
                        ? Math.round((item.score / maxTopScore) * 100)
                        : undefined}
                      rank={viewMode === "recommended" ? idx + 1 : undefined}
                      isSelected={selectedCoaches.has(item.coach.id)}
                      onToggle={() => toggleCoach(item.coach.id)}
                      onViewDetail={() => setDetailCoach(item.coach)}
                      onEdit={isAdmin ? () => handleOpenEdit(item.coach) : undefined}
                      activeProjects={coachAvailability[item.coach.id]}
                    />
                  ))}
                </AnimatePresence>
              </div>

              {/* 더 보기 버튼 (전체 뷰) */}
              {hasMoreAll && (
                <div className="flex justify-center mt-8">
                  <Button
                    onClick={() => setAllPage((p) => p + 1)}
                    variant="outline"
                    className="h-9 px-6 text-[12px] rounded-[2px] border-border"
                  >
                    <ChevronDown className="w-3.5 h-3.5 mr-1.5" />
                    더 보기 ({displayCoaches.length} / {filteredCoaches.length})
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* 코치 상세 모달 */}
      <CoachDetailModal
        coach={detailCoach}
        open={!!detailCoach}
        onClose={() => setDetailCoach(null)}
        onEdit={isAdmin ? (coach) => {
          setDetailCoach(null);
          handleOpenEdit(coach);
        } : undefined}
      />

      {/* 코치 등록/수정 모달 */}
      <CoachFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditCoach(null);
        }}
        coach={editCoach}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      {/* AI 추천 모달 */}
      <AiRecommendModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onRecommend={handleAiRecommend}
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
