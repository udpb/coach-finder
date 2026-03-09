import os
import time
import asyncio
from dotenv import load_dotenv
from app.core.rag import extract_rfp_info, build_search_query
from app.core.database import vector_db

load_dotenv()

RFP_TEXT = """
[제안요청서] 2026 소셜벤처 육성 프로그램 액셀러레이팅 위탁 운영
1. 사업목적: 사회문제를 해결하는 소셜벤처의 성장을 독려하고 시장 안착을 지원
2. 주요 요구사항:
- 임팩트 투자 및 자금 조달 전문가 3인 이상 확보
- ESG 경영 컨설팅 및 로컬 크리에이터 협업 경험자 우대
- 비즈니스 모델(BM) 고도화 및 시장 검증 멘토링
3. 대상: 창업 3년 이내의 소셜벤처 20개 팀
"""

async def benchmark():
    print("=== Phase 1: RFP Extraction (LLM) ===")
    start_time = time.time()
    extraction = extract_rfp_info(RFP_TEXT)
    llm_time = time.time() - start_time
    print(f"LLM Extraction Time: {llm_time:.2f}s")
    print(f"Extracted Domains: {extraction.get('required_domains', [])}")
    print(f"Extracted Skills: {extraction.get('required_skills', [])}")
    
    print("\n=== Phase 2: Vector Search (FAISS) ===")
    query = build_search_query(extraction)
    start_time = time.time()
    results = vector_db.search_coaches(query, top_k=5)
    search_time = time.time() - start_time
    print(f"FAISS Search Time: {search_time:.2f}s")
    
    print(f"\nTotal Pipeline Time: {llm_time + search_time:.2f}s")
    
    print("\n=== Search Results ===")
    for i, (doc, score) in enumerate(results):
        print(f"{i+1}. {doc.metadata.get('name', 'N/A')} (Score: {score:.4f})")
        print(f"   Expertise: {doc.metadata.get('expertise', [])}")

if __name__ == "__main__":
    asyncio.run(benchmark())
