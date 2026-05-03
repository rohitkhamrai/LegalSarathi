"""
FastAPI dependency — verifies Supabase JWT tokens.
Usage:
    user = Depends(get_current_user)          # Required auth
    user = Depends(get_optional_user)         # Optional auth (guests allowed)
"""
import os
from fastapi import Request, HTTPException
from jose import jwt, JWTError

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")


async def get_current_user(request: Request) -> dict:
    """Require a valid Supabase JWT. Raises 401 if missing/invalid."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization token")
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return {
            "user_id": payload.get("sub"),
            "phone": payload.get("phone"),
            "role": payload.get("role"),
        }
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


async def get_optional_user(request: Request) -> dict | None:
    """Return user dict if valid JWT present, else None (allows guests)."""
    try:
        return await get_current_user(request)
    except HTTPException:
        return None
