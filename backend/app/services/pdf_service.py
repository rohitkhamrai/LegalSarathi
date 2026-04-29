import io
import datetime
import random
import re
from pathlib import Path
from jinja2 import Environment, FileSystemLoader
from playwright.async_api import async_playwright

BASE_DIR = Path(__file__).resolve().parent.parent

class PDFService:
    @staticmethod
    async def generate_draft(guidance_text: str, query: str = "") -> io.BytesIO:
        """
        Generates a professionally formatted PDF using Playwright + Jinja2 HTML templates.
        This provides native support for complex CSS and all 13 Indian writing systems.
        """
        # Parse inputs
        paragraphs = [p.strip() for p in guidance_text.split('\n') if p.strip()]
        
        # Extract fake document type or default
        doc_type = "LEGAL GUIDANCE"
        if "FIR" in query.upper(): doc_type = "FIR DRAFT"
        elif "RTI" in query.upper(): doc_type = "RTI APPLICATION"
        elif "BAIL" in query.upper(): doc_type = "BAIL APPLICATION"
        
        # Make a quick title
        title = doc_type.title()
        if query:
            title = query[:50] + ("..." if len(query) > 50 else "")
            
        # Extract citations
        citations = []
        for p in paragraphs:
            if "§" in p or "Section" in p or "Act" in p:
                parts = re.findall(r'\[(.*?)\]', p)
                citations.extend(parts)
        citations = list(set(citations))[:5]  # Top unique citations

        # Render HTML
        template_dir = BASE_DIR / "templates"
        env = Environment(loader=FileSystemLoader(str(template_dir)))
        template = env.get_template("legal_draft.html")
        
        html_content = template.render(
            lang="hi",
            title=title.title(),
            doc_type=doc_type,
            ref_id=f"{random.randint(1000, 9999)}",
            generated_date=datetime.datetime.now().strftime("%d %b %Y, %I:%M %p"),
            lang_name="English/Indic",
            situation=query,
            citations=citations,
            body_paragraphs=paragraphs
        )

        buffer = io.BytesIO()

        # Fire up Playwright to print PDF
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # Load HTML content
            await page.set_content(html_content, wait_until="networkidle")
            
            # Print to PDF array
            pdf_bytes = await page.pdf(
                format="A4",
                print_background=True,
                margin={"top": "22mm", "bottom": "28mm", "left": "20mm", "right": "20mm"},
                display_header_footer=False # we built it into the CSS @page
            )
            
            await browser.close()

        buffer.write(pdf_bytes)
        buffer.seek(0)
        return buffer
