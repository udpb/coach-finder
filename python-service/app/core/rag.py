from pydantic import BaseModel, Field
from typing import List, Optional
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser

# Setup the Gemini LLM
llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.1)
parser = JsonOutputParser()


FORMAT_INSTRUCTIONS = """
Your output must be a valid JSON object with the following fields:
- "project_name": (string) The name of the project or RFP
- "required_domains": (list of strings) Key domains or industries required
- "required_skills": (list of strings) Key skills required from the coaches
- "coach_count": (integer) Number of coaches required
- "budget": (integer or null) Total budget if mentioned
- "summary": (string) 1-2 sentence summary of the project goal
"""

def extract_rfp_info(rfp_text: str) -> dict:
    """
    Extracts structured requirements from a raw RFP document text.
    """
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
    
    chain = prompt | llm | parser
    
    result = chain.invoke({"text": rfp_text})
    return result



# Type alias for extraction result (used by endpoints)
RFPExtraction = dict

def build_search_query(extraction: dict) -> str:
    """
    Converts the structured extraction into a dense vector search query.
    """
    domains = ", ".join(extraction.get("required_domains", []))
    skills = ", ".join(extraction.get("required_skills", []))
    summary = extraction.get("summary", "")
    
    query = f"전문 분야: {domains}. 핵심 역량: {skills}. 요약: {summary}"
    return query

