"""
CrossEncoder Re-Ranking Service
Model: cross-encoder/ms-marco-MiniLM-L-6-v2 (23MB, CPU-only)
Lazy-loaded on first call — does not block FastAPI startup.

Usage:
    reranker = RerankerService()
    reranked = reranker.rerank(query, chunks, top_k=5)
"""

from typing import List, Dict, Optional

MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"

_cross_encoder = None
_load_attempted = False


def _get_model():
    global _cross_encoder, _load_attempted
    if _load_attempted:
        return _cross_encoder
    _load_attempted = True
    try:
        from sentence_transformers import CrossEncoder
        print(f"[RERANK] Loading CrossEncoder: {MODEL_NAME} (~23MB)...")
        _cross_encoder = CrossEncoder(MODEL_NAME, max_length=512)
        print("[RERANK] CrossEncoder ready.")
    except Exception as e:
        print(f"[RERANK] Could not load CrossEncoder: {e}. Falling back to retrieval order.")
        _cross_encoder = None
    return _cross_encoder


class RerankerService:
    def rerank(
        self,
        query: str,
        chunks: List[Dict],
        top_k: int = 5,
    ) -> List[Dict]:
        """
        Score (query, chunk_text) pairs with CrossEncoder.
        Returns top_k chunks sorted by re-ranking score descending.
        Falls back to original order if model unavailable.
        """
        if not chunks:
            return chunks

        model = _get_model()
        if model is None or len(chunks) <= 1:
            return chunks[:top_k]

        try:
            pairs = [(query, c.get("text", "")[:512]) for c in chunks]
            scores = model.predict(pairs)

            # Attach rerank score and sort
            for chunk, score in zip(chunks, scores):
                chunk["rerank_score"] = float(score)

            reranked = sorted(chunks, key=lambda x: x.get("rerank_score", 0.0), reverse=True)
            top = reranked[:top_k]
            print(
                f"[RERANK] {len(chunks)} → {len(top)} chunks. "
                f"Top score: {top[0].get('rerank_score', 0):.3f} | "
                f"section: {top[0].get('section_ref', '?')}"
            )
            return top

        except Exception as e:
            print(f"[RERANK] Error during reranking: {e}. Returning original order.")
            return chunks[:top_k]
