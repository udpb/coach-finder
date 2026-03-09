export interface Coach {
  id: number;
  name: string;
  organization: string;
  position: string;
  email: string;
  phone: string;
  intro: string;
  expertise: string[];
  industries: string[];
  regions: string[];
  roles: string[];
  career_years: number;
  career_years_raw: string;
  career_history: string;
  current_work: string;
  underdogs_history: string;
  education: string;
  overseas: boolean;
  overseas_detail: string;
  tools_skills: string;
  photo_url: string;
  photo?: string;
  location?: string;
  gender?: string;
  business_type?: string;
  // Integrated DB fields
  tier: 1 | 2 | 3;
  category: string;
  country: string;
  language: string;
  main_field?: string;
  has_startup?: boolean;
  batch?: string;
  is_active?: boolean;
}

export type TierType = 1 | 2 | 3;
export type CategoryType = "파트너코치" | "코치" | "컨설턴트" | "투자사" | "글로벌코치" | "로컬크리에이터" | "특강연사";
export type LangCode = "ko" | "en" | "ja";

export interface FilterState {
  search: string;
  expertise: string[];
  industries: string[];
  regions: string[];
  roles: string[];
  overseas: boolean | null;
  resultCount: number;
  tiers: TierType[];
  categories: string[];
  countries: string[];
}

export const TIER_LABELS: Record<number, Record<LangCode, string>> = {
  1: { ko: "Tier 1 · 핵심 파트너", en: "Tier 1 · Core Partners", ja: "Tier 1 · コアパートナー" },
  2: { ko: "Tier 2 · 확장 코치", en: "Tier 2 · Extended Coaches", ja: "Tier 2 · 拡張コーチ" },
  3: { ko: "Tier 3 · 전문 영역", en: "Tier 3 · Specialists", ja: "Tier 3 · 専門領域" },
};

export const CATEGORY_LABELS: Record<string, Record<LangCode, string>> = {
  "파트너코치": { ko: "파트너코치", en: "Partner Coach", ja: "パートナーコーチ" },
  "코치": { ko: "코치", en: "Coach", ja: "コーチ" },
  "컨설턴트": { ko: "컨설턴트", en: "Consultant", ja: "コンサルタント" },
  "투자사": { ko: "투자사", en: "Investor", ja: "投資家" },
  "글로벌코치": { ko: "글로벌코치", en: "Global Coach", ja: "グローバルコーチ" },
  "로컬크리에이터": { ko: "로컬크리에이터", en: "Local Creator", ja: "ローカルクリエイター" },
  "특강연사": { ko: "특강연사", en: "Guest Speaker", ja: "特別講師" },
};

export const COUNTRY_OPTIONS = ["한국", "일본", "인도", "인도네시아"];

export const CATEGORY_OPTIONS: string[] = [
  "파트너코치", "코치", "컨설턴트", "투자사", "글로벌코치", "로컬크리에이터", "특강연사"
];

export const EXPERTISE_OPTIONS = [
  "창업 일반 (기업가정신/팀빌딩)",
  "비즈니스 모델 (BM/가설검증)",
  "사업계획서/IR (투자유치/피칭)",
  "마케팅/브랜딩 (시장조사/퍼포먼스)",
  "AI/DX (생성형 AI 활용/노코드)",
  "기술/R&D (제조/특허)",
  "ESG/소셜임팩트",
  "조직문화/HR",
  "로컬 비즈니스 (지역자원/크리에이터)",
  "기업인증",
  "세무개론",
  "지식재산권개론",
  "스타트업을 위한 재무분석",
  "직원 인건비 계산(노무일반)",
  "조직 문화중 멘탈케어",
  "힐링 프로그램",
  "문화예술 프로그램을 통한 소통강화",
  "화장품 / 에스테틱 서비스 / 뷰티",
  "창업지원",
  "전략기획",
  "마케팅/브랜딩",
  "세일즈/비즈니스 개발",
  "자금/재무관리",
  "기술개발(R&D)",
  "HR/조직관리",
  "제조/운영",
  "IT/디지털 인프라",
  "회계/세무",
  "로컬/라이프스타일",
  "투자/심사",
  "글로벌코칭",
];

export const INDUSTRY_OPTIONS = [
  "교육",
  "IT/소프트웨어",
  "식품/농업",
  "콘텐츠/미디어",
  "문화/예술",
  "사회/복지",
  "리테일/커머스",
  "헬스케어/바이오",
  "환경/에너지",
  "제조/하드웨어",
  "모빌리티/교통",
  "핀테크/금융서비스",
  "엔터테인먼트/게임",
  "부동산/건설",
  "HR테크/리걸테크",
  "여행/레저",
  "물류/유통",
  "소셜/지속가능성",
  "광고/마케팅",
  "홀리빙/펫",
  "푸드/농업",
];

export const REGION_OPTIONS = [
  "서울", "경기", "인천", "부산", "대구", "대전", "광주",
  "울산", "세종", "강원", "충북", "충남", "전북", "전남",
  "경북", "경남", "제주", "일본", "인도", "인도네시아",
];

export const ROLE_OPTIONS = [
  "코칭", "강의", "운영/PM", "멘토링", "심사/평가",
  "VC", "AC", "컨설팅", "글로벌코치",
];

export const UI_LABELS: Record<string, Record<LangCode, string>> = {
  title: { ko: "코치 검색", en: "Coach Finder", ja: "コーチ検索" },
  reset: { ko: "초기화", en: "Reset", ja: "リセット" },
  search_placeholder: { ko: "이름, 소속, 키워드 검색", en: "Search name, org, keyword", ja: "名前・所属・キーワード検索" },
  total: { ko: "명", en: "", ja: "名" },
  expertise: { ko: "전문분야", en: "Expertise", ja: "専門分野" },
  industry: { ko: "경험 업종", en: "Industry", ja: "業種" },
  region: { ko: "코칭 가능 지역", en: "Region", ja: "地域" },
  role: { ko: "역할", en: "Role", ja: "役割" },
  overseas_label: { ko: "해외 코칭", en: "Overseas", ja: "海外コーチング" },
  overseas_all: { ko: "전체", en: "All", ja: "全て" },
  overseas_yes: { ko: "가능", en: "Yes", ja: "可能" },
  overseas_no: { ko: "불가", en: "No", ja: "不可" },
  rec_count: { ko: "추천 인원 수", en: "Results Count", ja: "推薦人数" },
  tier: { ko: "티어", en: "Tier", ja: "ティア" },
  category: { ko: "유형", en: "Category", ja: "カテゴリ" },
  country: { ko: "국적", en: "Country", ja: "国籍" },
  recommended: { ko: "추천 TOP", en: "TOP", ja: "推薦TOP" },
  all_results: { ko: "전체", en: "All", ja: "全体" },
  select_all: { ko: "전체 선택", en: "Select All", ja: "全選択" },
  filter_active: { ko: "필터 적용 중", en: "Filters active", ja: "フィルター適用中" },
  selected: { ko: "명 선택됨", en: "selected", ja: "名選択" },
  no_results: { ko: "조건에 맞는 인력이 없습니다", en: "No matches found", ja: "条件に合う人材がいません" },
  no_results_sub: { ko: "필터 조건을 변경하거나 검색어를 수정해 보세요", en: "Try changing filters or search terms", ja: "フィルター条件を変更してください" },
  reset_filters: { ko: "필터 초기화", en: "Reset Filters", ja: "フィルターリセット" },
  export_btn: { ko: "내보내기", en: "Export", ja: "エクスポート" },
  export_title: { ko: "제안서 내보내기", en: "Export Proposal", ja: "提案書エクスポート" },
  project_name: { ko: "프로젝트명 (선택)", en: "Project Name (optional)", ja: "プロジェクト名（任意）" },
  project_placeholder: { ko: "예: 2026 소셜벤처 육성 프로그램", en: "e.g. 2026 Social Venture Program", ja: "例：2026ソーシャルベンチャー育成" },
  selected_coaches: { ko: "선택된 인력", en: "Selected", ja: "選択された人材" },
  clear_all: { ko: "전체 해제", en: "Clear All", ja: "全解除" },
  career_label: { ko: "경력", en: "Career", ja: "経歴" },
  education_label: { ko: "학력", en: "Education", ja: "学歴" },
  org_label: { ko: "소속", en: "Organization", ja: "所属" },
  career_history_label: { ko: "주요 이력", en: "Career History", ja: "主要経歴" },
  current_work_label: { ko: "현재 업무", en: "Current Work", ja: "現在の業務" },
  underdogs_label: { ko: "언더독스 수행 이력", en: "Underdogs History", ja: "アンダードッグス実績" },
  tools_label: { ko: "Tool / Skill-Set", en: "Tools / Skills", ja: "ツール/スキル" },
  partner_coach: { ko: "파트너코치", en: "Partner Coach", ja: "パートナーコーチ" },
  coach: { ko: "코치", en: "Coach", ja: "コーチ" },
  consultant: { ko: "컨설턴트", en: "Consultant", ja: "コンサルタント" },
  investor: { ko: "투자사", en: "Investor", ja: "投資家" },
  global_coach: { ko: "글로벌코치", en: "Global Coach", ja: "グローバルコーチ" },
};
