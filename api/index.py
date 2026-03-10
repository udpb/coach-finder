from fastapi import FastAPI, HTTPException, APIRouter
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import os
import tempfile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.documents import Document
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Underdogs Coach Finder AI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Core RAG Logic ---

class RFPExtraction(BaseModel):
    project_name: str
    required_domains: List[str]
    required_skills: List[str]
    coach_count: int
    budget: Optional[int] = None
    summary: str

FORMAT_INSTRUCTIONS = """
Your output must be a valid JSON object with the following fields:
- "project_name": (string) The name of the project or RFP
- "required_domains": (list of strings) Key domains or industries required
- "required_skills": (list of strings) Key skills required from the coaches
- "coach_count": (integer) Number of coaches required
- "budget": (integer or null) Total budget if mentioned
- "summary": (string) 1-2 sentence summary of the project goal
"""

# Lazy loaded components
_llm = None
_embeddings = None
_vectorstore = None
_parser = JsonOutputParser()

def get_llm():
    global _llm
    if _llm is None:
        _llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.1)
    return _llm

def get_embeddings():
    global _embeddings
    if _embeddings is None:
        _embeddings = GoogleGenerativeAIEmbeddings(
            model="models/embedding-001",
            google_api_key=os.getenv("GOOGLE_API_KEY")
        )
    return _embeddings

def get_vectorstore():
    global _vectorstore
    index_path = os.path.join(os.getcwd(), "coach_faiss_index")
    if _vectorstore is None:
        if os.path.exists(index_path):
            _vectorstore = FAISS.load_local(
                index_path, get_embeddings(), allow_dangerous_deserialization=True
            )
        else:
            # Fallback for empty/missing index in dev
            _vectorstore = FAISS.from_documents(
                [Document(page_content="INITIALIZATION", metadata={"id": "init"})],
                get_embeddings()
            )
    return _vectorstore

def extract_rfp_info(rfp_text: str) -> dict:
    prompt = PromptTemplate(
        template="""You are an expert project manager analyzing an RFP (Request for Proposal).
        Extract the key requirements from the following RFP text.
        
        {format_instructions}
        
        RFP TEXT:
        {text}
        """,
        input_variables=["text"],
        partial_variables={"format_instructions": FORMAT_INSTRUCTIONS},
    )
    chain = prompt | get_llm() | _parser
    return chain.invoke({"text": rfp_text})

def build_search_query(extraction: dict) -> str:
    domains = ", ".join(extraction.get("required_domains", []))
    skills = ", ".join(extraction.get("required_skills", []))
    summary = extraction.get("summary", "")
    return f"전문 분야: {domains}. 핵심 역량: {skills}. 요약: {summary}"

# --- API Endpoints ---

class RecommendRequest(BaseModel):
    rfp_text: str
    top_k: int = 5

class RecommendResponse(BaseModel):
    extraction: RFPExtraction
    recommendations: List[Dict[str, Any]]

@app.post("/api/v1/recommend", response_model=RecommendResponse)
async def recommend_coaches(req: RecommendRequest):
    try:
        extraction = extract_rfp_info(req.rfp_text)
        query = build_search_query(extraction)
        results = get_vectorstore().similarity_search_with_score(query, k=req.top_k)
        
        recommendations = []
        for doc, score in results:
            recommendations.append({
                "score": float(score),
                "content": doc.page_content,
                "metadata": doc.metadata
            })
            
        return RecommendResponse(
            extraction=extraction,
            recommendations=recommendations
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
