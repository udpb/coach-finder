import json
import os
import sys
from pathlib import Path

# Add python-service to sys.path to import app modules
sys.path.append(str(Path(__file__).parent / "python-service"))

from app.core.database import vector_db
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / "python-service" / ".env")

def ingest_coaches():
    json_path = Path(__file__).parent / "client" / "src" / "data" / "coaches_db.json"
    
    if not json_path.exists():
        print(f"Error: {json_path} not found.")
        return

    print(f"Loading data from {json_path}...")
    with open(json_path, "r", encoding="utf-8") as f:
        coaches = json.load(f)

    print(f"Preparing {len(coaches)} coaches for ingestion...")
    
    coaches_data = []
    for coach in coaches:
        # Create a comprehensive text representation for embedding
        # Combine name, intro, expertise, career history, etc.
        text_parts = [
            f"이름: {coach.get('name', '')}",
            f"소개: {coach.get('intro', '')}",
            f"전문 분야: {', '.join(coach.get('expertise', []))}",
            f"주요 산업: {', '.join(coach.get('industries', []))}",
            f"경력 사항: {coach.get('career_history', '')}",
            f"현재 업무: {coach.get('current_work', '')}",
            f"언더독스 활동: {coach.get('underdogs_history', '')}",
            f"교육 배경: {coach.get('education', '')}",
            f"보유 역량: {coach.get('tools_skills', '')}"
        ]
        full_text = "\n".join([p for p in text_parts if p.split(": ")[1]])
        
        # Prepare metadata for filtering and display
        metadata = {
            "id": coach.get("id"),
            "name": coach.get("name"),
            "tier": coach.get("tier"),
            "category": coach.get("category"),
            "country": coach.get("country"),
            "expertise": coach.get("expertise", []),
            "industries": coach.get("industries", []),
            "intro": coach.get("intro", ""),
            "organization": coach.get("organization", ""),
            "position": coach.get("position", ""),
            "photo_url": coach.get("photo_url", "")
        }
        
        coaches_data.append({
            "text": full_text,
            "metadata": metadata
        })

    print("Clearing old index (if exists) and adding new documents...")
    # Note: Our CoachVectorStore._load_or_create_index already handles basic initialization.
    # We add documents to the existing (or newly created) store.
    
    # Process in batches to avoid API limits or memory issues
    batch_size = 50
    for i in range(0, len(coaches_data), batch_size):
        batch = coaches_data[i:i + batch_size]
        print(f"Ingesting batch {i//batch_size + 1}/{(len(coaches_data)-1)//batch_size + 1}...")
        vector_db.add_coaches(batch)

    print("Ingestion complete. FAISS index updated.")

if __name__ == "__main__":
    ingest_coaches()
