import groq
import json
from app.core.config import settings

# Language names for prompting Groq to respond in target lang
LANG_NAMES = {
    "hi": "Hindi",
    "ta": "Tamil",
    "te": "Telugu",
    "mr": "Marathi",
    "bn": "Bengali",
    "en": "English",
    "gu": "Gujarati",
    "kn": "Kannada",
    "ml": "Malayalam",
    "pa": "Punjabi",
    "ur": "Urdu",
    "or": "Odia",
    "as": "Assamese",
}

class GroqService:
    def __init__(self):
        self.client = groq.Groq(api_key=settings.GROQ_API_KEY)
        self.model = "llama-3.1-8b-instant"

    async def extract_legal_keys(self, text: str) -> list:
        system_prompt = """
You are a Legal Concept Extractor for Indian Law (BNS/BNSS). 
Your task is to identify ONLY the most critical legal keys for a given situation.

STRICT RULES:
1. OUTPUT LIMIT: Extract a maximum of 5 keys.
2. NO EXHAUSTIVE LISTS: Do not list every possible section number.
3. FORMAT: Output ONLY a comma-separated list. No preamble, no explanation.
4. PRIORITIZATION: Prioritize broad legal concepts (e.g., "Warrantless Arrest") over specific section numbers unless the section is 100% certain.
5. NO HALLUCINATION: If the situation is vague, provide fewer than 5 keys.

Example:
Input: "Neighbor arrested for petty theft without warrant."
Output: Warrantless Arrest, BNS Section 303, Right to be informed, Petty Theft, BNSS Section 35
"""
        try:
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text}
                ],
                temperature=0.1,
            )
            content = completion.choices[0].message.content
            keys = content.strip().split(",")
            return [k.strip() for k in keys if len(k) < 50][:7]
        except Exception as e:
            print(f"Groq Error: {e}")
            return []

    async def synthesize_buddy_response(
        self,
        english_text: str,
        legal_keys: list,
        web_context: str,
        target_lang: str = "hi",
        specialist_opinion: str = "",
        rag_context: str = ""
    ) -> dict:
        """
        Core buddy synthesis. Returns structured JSON with situation summary,
        rights, action steps, awareness, and a full buddy_text for TTS.
        ALL text fields are in target_lang.
        """
        lang_name = LANG_NAMES.get(target_lang, "Hindi")
        keys_str = ", ".join(legal_keys) if legal_keys else "general legal situation"
        web_ctx_short = web_context[:600] if web_context else "No additional context."
        
        # Build grounding blocks — RAG chunks are highest authority
        rag_block = ""
        if rag_context and rag_context.strip():
            rag_block = f"\n\n{rag_context[:1200]}"  # statute chunks with [section_ref] IDs

        specialist_block = ""
        if specialist_opinion and "unavailable" not in specialist_opinion.lower() and len(specialist_opinion) > 30:
            specialist_block = f"\n\nGGUF SPECIALIST (BNS/BNSS trained):\n{specialist_opinion[:600]}"

        system_prompt = f"""You are "Legal Sarathi", a friendly legal buddy helping ordinary Indian citizens understand their rights.
You speak like a trusted friend, not a lawyer. You are warm, clear, and empowering.

TASK: Analyze the user's situation and respond ENTIRELY in {lang_name}.

LEGAL GROUNDING (priority order — use 1 first, then 2, then 3):
1. RETRIEVED STATUTES (most authoritative):{rag_block}
2. GGUF SPECIALIST:{specialist_block}
3. Web context: {web_ctx_short}

CRITICAL CITATION RULE: When citing a retrieved statute, write its exact [section_ref] ID (e.g. [BNSS_50], [CONST_22], [IPC_498A]). This enables source verification. Never cite section numbers you have not seen in the retrieved statutes above.

RESPOND WITH VALID JSON ONLY. No markdown, no explanation outside JSON:
{{
  "situation_summary": "2 sentences: what happened, in simple {lang_name}",
  "severity_level": "one of: INFO | CAUTION | DANGER",
  "rights": ["right 1 citing BNS/BNSS section in {lang_name}", "right 2 in {lang_name}", "right 3 in {lang_name}"],
  "action_steps": ["step 1 with specific helpline in {lang_name}", "step 2 in {lang_name}", "step 3 in {lang_name}"],
  "do_not_do": ["critical thing to NOT do in {lang_name}", "another thing to avoid"],
  "evidence_required": ["doc/item to collect right now in {lang_name}", "another item"],
  "jurisdiction_note": "1 sentence: state vs central law note in {lang_name} if relevant, else empty string",
  "awareness": "1 empowering paragraph in {lang_name} about this law most people don't know",
  "buddy_text": "Warm 4-5 sentence response in {lang_name}: situation + key right (cite BNS/BNSS section) + main step + encouragement. This will be spoken aloud.",
  "help_channels": [
    {{"name": "NALSA", "phone": "15100", "url": "https://nalsa.gov.in", "label_in_lang": "राष्ट्रीय विधिक सेवाएं"}}
  ]
}}

RULES:
- ALL text values MUST be in {lang_name}
- severity_level: DANGER if arrest/violence/immediate rights violation, CAUTION if dispute/non-payment, INFO if general query
- buddy_text must sound like a real friend talking, not a government notice
- cite actual BNS/BNSS sections from specialist analysis in rights[]
- action_steps must name specific helplines (NALSA 15100, Women 1091, Police 100)
- do_not_do must have 2-3 concrete negative constraints (e.g., don't sign blank papers)
- evidence_required must list physical docs to gather immediately"""

        try:
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Situation: {english_text}"}
                ],
                temperature=0.3,
                max_tokens=1500,
            )
            content = completion.choices[0].message.content.strip()
            # Strip markdown code fences if present
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            return json.loads(content)
        except json.JSONDecodeError as e:
            print(f"Groq JSON parse error: {e}")
            return self._fallback_response(target_lang)
        except Exception as e:
            print(f"Groq Buddy Synthesis Error: {e}")
            return self._fallback_response(target_lang)

    def _fallback_response(self, lang: str) -> dict:
        fallbacks = {
            "hi": {
                "situation_summary": "आपकी स्थिति की जानकारी मिली।",
                "rights": ["आपको कानूनी सहायता का अधिकार है", "आप निःशुल्क वकील मांग सकते हैं", "आपको सूचित किए जाने का अधिकार है"],
                "action_steps": ["NALSA हेल्पलाइन 15100 पर कॉल करें", "स्थानीय जिला विधिक सेवा प्राधिकरण से संपर्क करें", "परिवार को सूचित करें"],
                "awareness": "भारत में हर नागरिक को निःशुल्क कानूनी सहायता का अधिकार है।",
                "buddy_text": "घबराइए नहीं। आपके पास कानूनी अधिकार हैं। NALSA की हेल्पलाइन 15100 पर अभी कॉल करें।",
                "help_channels": [{"name": "NALSA", "phone": "15100", "url": "https://nalsa.gov.in", "label_in_lang": "राष्ट्रीय कानूनी सेवाएं"}]
            },
            "en": {
                "situation_summary": "Your situation has been noted.",
                "rights": ["You have the right to free legal aid", "You can demand a lawyer", "You have the right to be informed"],
                "action_steps": ["Call NALSA helpline 15100", "Contact your District Legal Services Authority", "Inform your family"],
                "awareness": "Every Indian citizen has the right to free legal aid under the Legal Services Authorities Act.",
                "buddy_text": "Don't worry. You have legal rights. Call NALSA at 15100 right now for free help.",
                "help_channels": [{"name": "NALSA", "phone": "15100", "url": "https://nalsa.gov.in", "label_in_lang": "National Legal Services"}]
            }
        }
        return fallbacks.get(lang, fallbacks["en"])
