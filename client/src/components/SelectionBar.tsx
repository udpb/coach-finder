/*
 * SelectionBar - Swiss Industrial Design
 * 하단 고정 바. 선택된 코치 목록 + 내보내기 버튼. 다국어 지원.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FileText, Presentation, X, Download, User, Loader2 } from "lucide-react";
import type { Coach } from "@/types/coach";
import { CATEGORY_LABELS } from "@/types/coach";
import { exportToDocx, exportToPptx } from "@/lib/exportUtils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";

interface SelectionBarProps {
  selectedCoaches: Coach[];
  onRemove: (id: number) => void;
  onClear: () => void;
}

export default function SelectionBar({
  selectedCoaches,
  onRemove,
  onClear,
}: SelectionBarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [exporting, setExporting] = useState(false);
  const { lang, t } = useLanguage();

  if (selectedCoaches.length === 0) return null;

  const handleExport = async (type: "docx" | "pptx") => {
    setExporting(true);
    try {
      const defaultTitle = lang === "en" ? "Underdogs Coach Profile" : lang === "ja" ? "アンダードッグス コーチプロフィール" : "언더독스 코치 프로필";
      const title = projectTitle.trim() || defaultTitle;
      if (type === "docx") {
        await exportToDocx(selectedCoaches, title);
      } else {
        await exportToPptx(selectedCoaches, title);
      }
      toast.success(
        lang === "en" ? `${type.toUpperCase()} file downloading.` :
        lang === "ja" ? `${type.toUpperCase()}ファイルをダウンロードします。` :
        `${type.toUpperCase()} 파일이 다운로드됩니다.`
      );
      setExportOpen(false);
    } catch (err) {
      toast.error(
        lang === "en" ? "Export error. Please try again." :
        lang === "ja" ? "エクスポートエラー。もう一度お試しください。" :
        "내보내기 중 오류가 발생했습니다. 다시 시도해 주세요."
      );
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          exit={{ y: 80 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-[300px] right-0 bg-white border-t-2 border-foreground z-50"
        >
          <div className="px-6 py-3 flex items-center gap-4">
            {/* 선택 카운트 */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="font-mono text-[20px] font-bold text-primary leading-none">
                {selectedCoaches.length}
              </span>
              <span className="text-[12px] text-muted-foreground">{t("selected")}</span>
            </div>

            <div className="w-px h-8 bg-border" />

            {/* 선택된 코치 미니 아바타 */}
            <div className="flex-1 flex items-center gap-1.5 overflow-x-auto py-1" style={{ scrollbarWidth: "none" }}>
              <AnimatePresence mode="popLayout">
                {selectedCoaches.map((coach) => (
                  <motion.div
                    key={coach.id}
                    layout
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-1.5 bg-muted px-2 py-1 flex-shrink-0 group"
                  >
                    <div className="w-5 h-5 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                      {coach.photo_url ? (
                        <img src={coach.photo_url} alt={coach.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User className="w-3 h-3 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-foreground whitespace-nowrap">
                      {coach.name}
                    </span>
                    <button
                      onClick={() => onRemove(coach.id)}
                      className="w-3.5 h-3.5 flex items-center justify-center text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* 액션 버튼 */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={onClear}
                className="text-[11px] text-muted-foreground hover:text-primary transition-colors px-2 whitespace-nowrap"
              >
                {t("clear_all")}
              </button>
              <Button
                onClick={() => setExportOpen(true)}
                className="h-8 px-4 text-[12px] font-semibold bg-primary hover:bg-primary/90 text-white rounded-[2px]"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                {t("export_btn")}
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* 내보내기 모달 */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-md rounded-none border border-border">
          <DialogHeader>
            <DialogTitle className="text-[16px] font-bold">
              {t("export_title")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-[11px] uppercase font-semibold text-muted-foreground tracking-wider block mb-1.5">
                {t("project_name")}
              </label>
              <Input
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                placeholder={t("project_placeholder")}
                className="h-9 text-[13px] rounded-[2px]"
              />
            </div>

            <div>
              <span className="text-[11px] uppercase font-semibold text-muted-foreground tracking-wider block mb-2">
                {t("selected_coaches")} ({selectedCoaches.length})
              </span>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {selectedCoaches.map((c) => {
                  const catLabel = CATEGORY_LABELS[c.category]?.[lang] || c.category;
                  return (
                    <span key={c.id} className="px-2 py-0.5 text-[11px] bg-muted text-foreground">
                      {c.name}
                      <span className="text-muted-foreground ml-1 text-[9px]">{catLabel}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              onClick={() => handleExport("docx")}
              disabled={exporting}
              variant="outline"
              className="flex-1 h-10 text-[13px] font-semibold rounded-[2px] border-foreground text-foreground hover:bg-foreground hover:text-white"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileText className="w-4 h-4 mr-2" />
              )}
              Word (DOCX)
            </Button>
            <Button
              onClick={() => handleExport("pptx")}
              disabled={exporting}
              className="flex-1 h-10 text-[13px] font-semibold rounded-[2px] bg-primary hover:bg-primary/90"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Presentation className="w-4 h-4 mr-2" />
              )}
              PPT (PPTX)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
