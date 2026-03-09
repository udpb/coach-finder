import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
  VerticalAlign,
  TableLayoutType,
} from "docx";
import { saveAs } from "file-saver";
import PptxGenJS from "pptxgenjs";
import type { Coach } from "@/types/coach";
import { TIER_LABELS, CATEGORY_LABELS } from "@/types/coach";

async function fetchImageAsBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function getTierLabel(tier: number): string {
  return TIER_LABELS[tier]?.ko || `Tier ${tier}`;
}

function getCatLabel(cat: string): string {
  return CATEGORY_LABELS[cat]?.ko || cat;
}

// ============ DOCX 내보내기 ============
export async function exportToDocx(coaches: Coach[], projectTitle?: string) {
  const title = projectTitle || "언더독스 코치 프로필";
  const children: (Paragraph | Table)[] = [];

  // 표지
  children.push(
    new Paragraph({ spacing: { after: 800 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: title, bold: true, size: 52, font: "맑은 고딕", color: "1A1A1A" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: "코치 프로필", size: 32, font: "맑은 고딕", color: "666666" }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `총 ${coaches.length}명  |  ${new Date().toLocaleDateString("ko-KR")} 기준`,
          size: 20, font: "맑은 고딕", color: "999999",
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 100 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "E53935" } },
      children: [],
    }),
    new Paragraph({ spacing: { after: 600 }, children: [] })
  );

  // 각 코치 프로필
  for (const coach of coaches) {
    let imageBuffer: ArrayBuffer | null = null;
    if (coach.photo_url) {
      imageBuffer = await fetchImageAsBuffer(coach.photo_url);
    }

    // 티어 + 카테고리 + 코치 이름
    children.push(
      new Paragraph({
        spacing: { before: 400, after: 60 },
        children: [
          new TextRun({ text: `[T${coach.tier}] `, bold: true, size: 18, font: "맑은 고딕", color: "E53935" }),
          new TextRun({ text: getCatLabel(coach.category), size: 18, font: "맑은 고딕", color: "888888" }),
          ...(coach.country && coach.country !== "한국" ? [
            new TextRun({ text: `  |  ${coach.country}`, size: 18, font: "맑은 고딕", color: "7C3AED" }),
          ] : []),
        ],
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({ text: coach.name, bold: true, size: 34, font: "맑은 고딕", color: "1A1A1A" }),
          new TextRun({ text: `   ${[coach.organization, coach.position].filter(Boolean).join("  |  ")}`, size: 20, font: "맑은 고딕", color: "888888" }),
        ],
      })
    );

    // 사진
    if (imageBuffer) {
      children.push(
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new ImageRun({ data: imageBuffer, transformation: { width: 100, height: 100 }, type: "jpg" }),
          ],
        })
      );
    }

    // 한줄 소개
    if (coach.intro) {
      children.push(
        new Paragraph({
          spacing: { after: 160 },
          children: [
            new TextRun({ text: `"${coach.intro}"`, italics: true, size: 20, font: "맑은 고딕", color: "E53935" }),
          ],
        })
      );
    }

    // 정보 테이블
    const infoLines = [
      { label: "전문분야", value: coach.expertise.join(", ") },
      { label: "경험업종", value: coach.industries.join(", ") },
      { label: "코칭지역", value: coach.regions.join(", ") },
      { label: "역할", value: coach.roles.join(", ") },
      { label: "경력", value: coach.career_years_raw || (coach.career_years > 0 ? `${coach.career_years}년` : "-") },
      { label: "학력", value: coach.education },
      { label: "해외코칭", value: coach.overseas ? (coach.overseas_detail || "가능") : "" },
      { label: "국적", value: coach.country !== "한국" ? coach.country : "" },
    ].filter(info => info.value && info.value.trim() !== "" && info.value !== "-");

    const rows = infoLines.map(
      (info) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 1600, type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, fill: "F5F5F5" },
              verticalAlign: VerticalAlign.CENTER,
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
              },
              children: [
                new Paragraph({
                  spacing: { before: 50, after: 50 },
                  indent: { left: 100 },
                  children: [
                    new TextRun({ text: info.label, bold: true, size: 18, font: "맑은 고딕", color: "555555" }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 7400, type: WidthType.DXA },
              verticalAlign: VerticalAlign.CENTER,
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
              },
              children: [
                new Paragraph({
                  spacing: { before: 50, after: 50 },
                  indent: { left: 100 },
                  children: [
                    new TextRun({ text: info.value || "-", size: 18, font: "맑은 고딕", color: "333333" }),
                  ],
                }),
              ],
            }),
          ],
        })
    );

    if (rows.length > 0) {
      children.push(
        new Table({
          width: { size: 9000, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          rows,
        })
      );
    }

    // 주요 이력
    if (coach.career_history) {
      children.push(
        new Paragraph({
          spacing: { before: 240, after: 80 },
          children: [
            new TextRun({ text: "주요 이력", bold: true, size: 22, font: "맑은 고딕", color: "1A1A1A" }),
          ],
        }),
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: coach.career_history.slice(0, 1200), size: 17, font: "맑은 고딕", color: "444444" }),
          ],
        })
      );
    }

    // 언더독스 수행 이력
    if (coach.underdogs_history) {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 80 },
          children: [
            new TextRun({ text: "언더독스 수행 이력", bold: true, size: 22, font: "맑은 고딕", color: "1A1A1A" }),
          ],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({ text: coach.underdogs_history.slice(0, 800), size: 17, font: "맑은 고딕", color: "444444" }),
          ],
        })
      );
    }

    // 구분선
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 300 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" } },
        children: [],
      })
    );
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${title}_${new Date().toISOString().slice(0, 10)}.docx`);
}

// ============ PPTX 내보내기 ============
export async function exportToPptx(coaches: Coach[], projectTitle?: string) {
  const title = projectTitle || "언더독스 코치 프로필";
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";

  // 표지 슬라이드
  const cover = pptx.addSlide();
  cover.background = { color: "FFFFFF" };
  cover.addShape("rect", { x: 0, y: 0, w: 0.12, h: "100%", fill: { color: "E53935" } });
  cover.addText(title, {
    x: 0.8, y: 1.8, w: 10, h: 1,
    fontSize: 36, bold: true, color: "1A1A1A", fontFace: "맑은 고딕",
  });
  cover.addText("코치 프로필", {
    x: 0.8, y: 2.9, w: 10, h: 0.5,
    fontSize: 18, color: "888888", fontFace: "맑은 고딕",
  });
  cover.addText(`총 ${coaches.length}명  |  ${new Date().toLocaleDateString("ko-KR")} 기준`, {
    x: 0.8, y: 3.5, w: 10, h: 0.4,
    fontSize: 13, color: "AAAAAA", fontFace: "맑은 고딕",
  });
  cover.addShape("rect", { x: 0.8, y: 4.2, w: 3.5, h: 0.025, fill: { color: "E53935" } });

  // 코치별 슬라이드 (2명씩)
  for (let i = 0; i < coaches.length; i += 2) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addShape("rect", { x: 0, y: 0, w: "100%", h: 0.04, fill: { color: "E53935" } });

    slide.addText(`${Math.floor(i / 2) + 1} / ${Math.ceil(coaches.length / 2)}`, {
      x: 11.5, y: 7.1, w: 1.5, h: 0.3,
      fontSize: 9, color: "BBBBBB", fontFace: "맑은 고딕", align: "right",
    });

    for (let j = 0; j < 2 && i + j < coaches.length; j++) {
      const coach = coaches[i + j];
      const xBase = j === 0 ? 0.4 : 6.9;

      // 사진
      if (coach.photo_url) {
        try {
          const imgBuf = await fetchImageAsBuffer(coach.photo_url);
          if (imgBuf) {
            const b64 = arrayBufferToBase64(imgBuf);
            slide.addImage({
              data: `image/jpeg;base64,${b64}`,
              x: xBase, y: 0.35, w: 1.2, h: 1.2, rounding: true,
            });
          }
        } catch {
          slide.addShape("ellipse", { x: xBase, y: 0.35, w: 1.2, h: 1.2, fill: { color: "EEEEEE" } });
        }
      } else {
        slide.addShape("ellipse", { x: xBase, y: 0.35, w: 1.2, h: 1.2, fill: { color: "EEEEEE" } });
      }

      // 티어 + 카테고리 뱃지
      slide.addText(`T${coach.tier} | ${getCatLabel(coach.category)}${coach.country !== "한국" ? ` | ${coach.country}` : ""}`, {
        x: xBase + 1.5, y: 0.2, w: 4, h: 0.22,
        fontSize: 8, color: "E53935", fontFace: "맑은 고딕",
      });

      // 이름
      slide.addText(coach.name, {
        x: xBase + 1.5, y: 0.42, w: 4, h: 0.45,
        fontSize: 20, bold: true, color: "1A1A1A", fontFace: "맑은 고딕",
      });

      // 소속/직책
      slide.addText([coach.organization, coach.position].filter(Boolean).join("  |  ") || coach.main_field || "", {
        x: xBase + 1.5, y: 0.87, w: 4, h: 0.3,
        fontSize: 10, color: "888888", fontFace: "맑은 고딕",
      });

      // 한줄 소개
      if (coach.intro) {
        slide.addText(`"${coach.intro}"`, {
          x: xBase + 1.5, y: 1.17, w: 4, h: 0.35,
          fontSize: 9, italic: true, color: "E53935", fontFace: "맑은 고딕",
        });
      }

      // 정보 테이블
      const tblData: { label: string; value: string }[] = [
        { label: "전문분야", value: coach.expertise.slice(0, 4).join(", ") },
        { label: "경험업종", value: coach.industries.join(", ") },
        { label: "코칭지역", value: coach.regions.slice(0, 5).join(", ") },
        { label: "역할", value: coach.roles.join(", ") },
        { label: "경력", value: coach.career_years_raw || (coach.career_years > 0 ? `${coach.career_years}년` : "-") },
        { label: "학력", value: coach.education || "-" },
      ].filter(d => d.value && d.value !== "-");

      const tblRows: PptxGenJS.TableRow[] = tblData.map(d => [
        { text: d.label, options: { fontSize: 8, bold: true, color: "555555", fill: { color: "F5F5F5" }, fontFace: "맑은 고딕" } },
        { text: d.value, options: { fontSize: 8, color: "333333", fontFace: "맑은 고딕" } },
      ]);

      if (tblRows.length > 0) {
        slide.addTable(tblRows, {
          x: xBase, y: 1.8, w: 5.8, colW: [0.9, 4.9],
          border: { type: "solid", pt: 0.5, color: "EEEEEE" },
          rowH: Array(tblRows.length).fill(0.28),
        });
      }

      // 주요 이력
      const careerText = coach.career_history
        ? coach.career_history.slice(0, 400) + (coach.career_history.length > 400 ? "..." : "")
        : "";

      if (careerText) {
        const tblEndY = 1.8 + tblRows.length * 0.28 + 0.15;
        slide.addText("주요 이력", {
          x: xBase, y: tblEndY, w: 5.8, h: 0.28,
          fontSize: 9, bold: true, color: "1A1A1A", fontFace: "맑은 고딕",
        });

        slide.addText(careerText, {
          x: xBase, y: tblEndY + 0.3, w: 5.8, h: 7 - tblEndY - 0.5,
          fontSize: 7.5, color: "555555", fontFace: "맑은 고딕", valign: "top",
          lineSpacingMultiple: 1.3,
        });
      }
    }
  }

  pptx.writeFile({ fileName: `${title}_${new Date().toISOString().slice(0, 10)}.pptx` });
}
