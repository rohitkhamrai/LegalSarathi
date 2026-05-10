# ⚖️ Legal Sarathi 2.0

Legal Sarathi 2.0 is an AI-powered legal assistance platform designed to democratize legal intelligence in India. By combining high-speed Large Language Models (via Groq), advanced Retrieval-Augmented Generation (RAG), and a modern, multilingual frontend, Legal Sarathi makes understanding basic rights, drafting legal documents, and finding verified local advocates effortless and accessible to every citizen.

---

## ✨ Core Features

- **🧠 Multilingual AI Legal Assistant:** Ask complex legal questions in English, Hindi, Kannada, and more. The system executes context-aware RAG to fetch accurate Indian legal statutes and provide structured, non-jargonistic advice.
- **👨‍⚖️ Verified Multi-City Lawyer Directory:** Comprehensive database of verified advocates across Bengaluru and 10+ major Karnataka cities (Mysuru, Hubballi, Mangaluru, etc.), filterable by practice area, with integrated maps and contact portals.
- **📄 Instant Legal Document Wizard:** Generate fully-formatted, legally sound drafts in seconds—including Anticipatory Bail Applications, Lease Agreements, and Consumer Complaint notices.
- **📋 Digital Government Portals & RTI:** A centralized dashboard linking directly to verified government filing sites (Consumer Helpline, CyberCrime) along with a dedicated step-by-step Right to Information (RTI) generator.
- **🔍 OCR & Document Intelligence:** Securely upload physical legal notices or FIRs. The backend extracts text utilizing **PaddleOCR** and contextualizes complex legalese into plain summaries.
- **🎙️ Voice-Native Engagement:** Supports native speech inputs powered by Groq Whisper for hands-free legal querying.
- **⚡ Resource-Efficient Architecture:** Specifically tuned to run efficiently on commodity local hardware (16GB RAM) by utilizing local FAISS indices and asynchronous task-group management via FastAPI.

---

## 🎨 Design Philosophy: "Sarkari-Modern"

We implemented a premium custom design system called **Sarkari-Modern** that balances official visual gravity with cutting-edge app responsiveness:
- **Calibrated Palette:** Utilizes deep Forest Teal (`#0F6E56`) and Warm Amber (`#BA7517`) to convey governmental trustworthiness paired with modern accessibility.
- **Tactile & Reactive:** Fully built with Tailwind CSS featuring subtle micro-interactions (Hover-Lift Physics), fluid `glassmorphism` backdrop utilities, and staggered loading reveals (`animate-fade-in-up`).
- **Localized Typography:** Multi-script font stacks automatically scaling `Plus Jakarta Sans` for dynamic displays alongside `Noto Sans Devanagari/Kannada` for seamless vernacular readability.

---

## 🛠️ Technology Stack

### **Frontend Interface**
- **Core:** React 18 + Vite (Optimized for sub-100ms HMR and rapid load cycles)
- **Logic:** TypeScript, React Router DOM 6
- **Styling:** Vanilla Tailwind CSS, Lucide React Iconography, Custom Utility Animations
- **State:** Specialized Context Providers (`AuthContext`, `LanguageContext`, `GuestContext`)

### **Backend & AI Intelligence Pipeline**
- **Framework:** High-performance FastAPI (Python 3.9+)
- **Inference Core:** Groq API utilizing ultra-low-latency Llama-3-70B pipelines.
- **Vector Database:** Dual-mode capability supporting **Neon Postgres (pgvector)** for cloud caching and optimized **FAISS CPU** for persistent local fallback.
- **Embeddings & Retrieval:** `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` with high-precision CrossEncoder semantic re-ranking.
- **Processing Pipelines:** Asynchronous `asyncio` task parallelism, `PaddleOCR` engine, and dynamic web search retrievers.

---

## 🚀 Installation & Local Deployment

Legal Sarathi architecture runs a parallel service layer. You must launch both instances.

### Prerequisites
- **Node.js v18+**
- **Python 3.9 - 3.11**
- **Poppler Binaries:** (Required specifically for PDF-based analysis. Install via `conda install -c conda-forge poppler` or binary extraction added to system variables).

### Step 1: Config Configuration
Create a `.env` file in the project root mirroring `.env.example`:
```env
GROQ_API_KEY="your_groq_key"
NEON_DATABASE_URL="your_optional_pgvector_uri"
```

### Step 2: Launch Intelligence Backend
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium

# Boot standard uvicorn worker
uvicorn app.main:app --reload --port 8000
```

### Step 3: Launch Application Frontend
Open a dedicated terminal instance:
```powershell
cd frontend
npm install
npm run dev
```
Application will immediately launch locally, typically at **http://localhost:8080** or **http://localhost:5173**.

---

## 🏗️ Flow Architecture

1. **User Input:** Receives localized prompt via Text, Mic, or PDF Upload.
2. **Orchestration Layer:** API normalizes query embedding and manages parallel downstream retrievers.
3. **Semantic Search:** Simultaneously executes Hybrid Search (BM25 matching + Vector distance search).
4. **Verification & Reranking:** CrossEncoder evaluates cross-attention scores and feeds top K relevant context nodes to Synthesis.
5. **Final Audit:** The Groq LLM assembles structured markdown responses ensuring source citation linkage before transmission back to the client UI.

---

## 📂 Project Skeleton

```text
Root/
├── backend/                  # Python-driven FastAPI Services
│   ├── app/                  # Core logic: routes, agent chains, retrieval services
│   ├── knowledge_base/       # Source raw PDF/JSON documents utilized for RAG seeding
│   └── requirements.txt      # Backend package manifest
├── frontend/                 # React Client codebase
│   ├── src/
│   │   ├── components/       # Modular UI bricks (layout, buttons, shell)
│   │   ├── data/             # Curated JSON sets (lawyer lists, document templates)
│   │   ├── pages/            # High-level route views (Chat, Lawyers, Dashboard)
│   │   ├── index.css         # Custom "Sarkari-Modern" style definitions
│   └── vite.config.ts        # Build engine config
├── LOCAL_SETUP.md            # In-depth OS specific debug tips
├── ARCHITECTURE.md           # Complete breakdown of async task flow
└── README.md                 # Technical Documentation
```

---

## 🔮 Future Roadmap & Scaling

- **⚖️ Automated Case Scraping:** Direct scraper injection pipelines fetching public High Court listings by application sequence IDs.
- **🔐 Blockchain Attestations:** Utilizing L2 smart contracts to store hash signatures of generated affidavits for tampering-proof credentialing.
- **📱 Progressive Web App (PWA):** Offline cached service workers enabling legal database querying without stable 4G/5G cellular connections.
- **🤝 Pro-Bono Matching:** Algorithmically connecting low-income users to legal clinics directly based on state-verified identification.
