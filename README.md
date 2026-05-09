# ⚖️ Legal Sarathi 2.0

Legal Sarathi 2.0 is an AI-powered legal assistance platform designed to democratize legal intelligence. By combining high-speed LLMs (via Groq), advanced Retrieval-Augmented Generation (RAG), and a modern, multilingual frontend, Legal Sarathi makes understanding rights, drafting documents, and finding lawyers effortless and accessible.

---

## ✨ Features

- **🧠 Multilingual AI Legal Assistant:** Ask complex legal questions in English, Hindi, and other languages. The system uses translation and context-aware RAG to fetch accurate legal statutes and provide structured, actionable advice.
- **👨‍⚖️ Verified Lawyer Directory:** Browse over 100+ verified lawyers across major Indian cities (with rich data for Bengaluru). Includes direct integrations with external directories like Lawrato and VakilSearch.
- **📄 Legal Document Wizard:** Generate properly formatted legal drafts in seconds—including Anticipatory Bail Applications, FIR Drafts, and Labour Agreements.
- **📋 RTI Application Wizard:** A guided flow to help users draft Right to Information (RTI) requests tailored to specific government departments.
- **🔍 OCR & PDF Analysis:** Upload legal documents (like notices or FIRs). The backend uses **PaddleOCR** to extract text and the AI agent explains the document's implications in simple terms.
- **⚡ High-Performance Architecture:** Built to run efficiently even on local hardware (16GB RAM) by leveraging local FAISS vector stores and CrossEncoder re-ranking, orchestrated asynchronously via FastAPI.

---

## 🛠️ Technology Stack

### **Frontend**
- **Framework:** React 18 + Vite
- **Styling:** Tailwind CSS (custom "Sarkari-Modern" design system)
- **Icons:** Lucide React
- **Routing:** React Router DOM

### **Backend & Intelligence Pipeline**
- **Framework:** FastAPI (Python 3.9+)
- **LLM Engine:** Groq API (Llama-3 models) for ultra-fast synthesis.
- **Vector Search:** Neon `pgvector` (Cloud) or `FAISS` (Local CPU fallback).
- **Embeddings & Re-ranking:** `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` and `CrossEncoder`.
- **OCR:** `PaddleOCR`
- **Speech-to-Text:** Groq Whisper STT

---

## 🚀 Local Installation & Setup

Legal Sarathi requires both the backend and frontend to be run simultaneously.

### Prerequisites
- **Python 3.9+**
- **Node.js 18+**
- **Poppler** (Required for PDF OCR: `conda install -c conda-forge poppler` or add binaries to PATH)

### 1. Environment Variables
Copy `.env.example` to `.env` in the root directory:
```env
GROQ_API_KEY="your_groq_api_key_here"
NEON_DATABASE_URL="your_pgvector_url_here" # Optional: Defaults to local FAISS if omitted
```

### 2. Start the Backend
Open a terminal and navigate to the `backend/` folder:
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium

# Start the FastAPI server
uvicorn app.main:app --reload --port 8000
```

### 3. Start the Frontend
Open a second terminal and navigate to the `frontend/` folder:
```powershell
cd frontend
npm install

# Start the Vite development server
npm run dev
```

The application will be accessible at **http://localhost:8080** (or whichever port Vite assigns).

---

## 🏗️ Architecture Overview

The system operates on an orchestrated asynchronous pipeline to minimize latency:
1. **Multimodal Input:** The React frontend captures text, voice, or documents.
2. **Translation & Caching:** The FastAPI Orchestrator normalizes the query to English and checks the LRU cache.
3. **Parallel Execution:** It dispatches tasks simultaneously:
   - BM25 & Vector FAISS Retrieval (`RAGService`)
   - Web Search context gathering
   - Key Entity Extraction
4. **Re-ranking:** Retrieved chunks are scored using a localized CrossEncoder (`RerankerService`).
5. **Synthesis & Audit:** The Groq LLM synthesizes a structured JSON response, which is then audited against source documents for factual accuracy.

*(For detailed flow diagrams and LLD, see [ARCHITECTURE.md](./ARCHITECTURE.md))*

---

## 📂 Project Structure

```text
/
├── backend/                  # FastAPI Application Core
│   ├── app/                  # Main app logic, routers, and orchestrator
│   ├── requirements.txt      # Python dependencies
│   └── ...
├── frontend/                 # Vite + React Frontend
│   ├── src/                  # UI Components, Pages, Data Hooks
│   ├── package.json          # Node dependencies
│   └── ...
├── ARCHITECTURE.md           # Deep dive into system design
├── LOCAL_SETUP.md            # Hardware constraints & setup guides
├── .env.example              # Template for API keys
└── README.md                 # You are here
```

---

## 🤝 Contribution
Ensure all branches stem from `version2` or `main`. Keep commits modular and follow the existing "Sarkari-Modern" design principles for UI changes.
