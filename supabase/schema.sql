-- ============================================================
-- LegalSarathi — Supabase Schema
-- Run this ENTIRE script in the Supabase SQL Editor once.
-- ============================================================

-- ── 1. Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
    id                 uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    phone              text        UNIQUE NOT NULL,
    name               text,
    state              text,
    preferred_language text        DEFAULT 'hi',
    interests          text[]      DEFAULT '{}',
    is_premium         boolean     DEFAULT false,
    created_at         timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid        REFERENCES profiles ON DELETE CASCADE NOT NULL,
    title             text        NOT NULL,
    language          text        DEFAULT 'hi',
    is_pinned         boolean     DEFAULT false,
    pinned_at         timestamptz,
    pinned_session_id uuid        REFERENCES chat_sessions ON DELETE SET NULL,
    created_at        timestamptz DEFAULT now(),
    expires_at        timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id     uuid        REFERENCES chat_sessions ON DELETE CASCADE NOT NULL,
    user_id        uuid        REFERENCES profiles ON DELETE CASCADE NOT NULL,
    role           text        CHECK (role IN ('user','ai')) NOT NULL,
    content        text        NOT NULL,
    legal_keys     text[]      DEFAULT '{}',
    severity_level text,
    rights         jsonb       DEFAULT '[]',
    action_steps   jsonb       DEFAULT '[]',
    citation_badge text,
    created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid        REFERENCES profiles ON DELETE CASCADE NOT NULL,
    doc_type            text        NOT NULL,         -- UPLOADED | RTI | FIR | BAIL | NOTICE
    title               text        NOT NULL,
    extracted_text      text,
    pdf_url             text,
    storage_path        text,
    language            text        DEFAULT 'hi',
    doc_chat_session_id uuid        REFERENCES chat_sessions ON DELETE SET NULL,
    created_at          timestamptz DEFAULT now(),
    expires_at          timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS doc_chat_messages (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id     uuid        REFERENCES documents ON DELETE CASCADE NOT NULL,
    user_id    uuid        REFERENCES profiles ON DELETE CASCADE NOT NULL,
    role       text        CHECK (role IN ('user','ai')) NOT NULL,
    content    text        NOT NULL,
    mode       text,                                  -- summary|qa|clause_extract|translate|draft_reply
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_events (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        REFERENCES profiles ON DELETE CASCADE NOT NULL,
    event_type text        NOT NULL,                  -- query|doc_generated|voice_used|ocr_used|doc_chat
    metadata   jsonb       DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

-- ── 2. Auto-create profile on signup (trigger) ────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, phone)
    VALUES (
        NEW.id,
        COALESCE(NEW.phone, NEW.email, '')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 3. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_events       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own profile"    ON profiles          FOR ALL USING (auth.uid() = id);
CREATE POLICY "Own sessions"   ON chat_sessions     FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own messages"   ON chat_messages     FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own documents"  ON documents         FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own doc chats"  ON doc_chat_messages FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own events"     ON user_events       FOR ALL USING (auth.uid() = user_id);

-- ── 4. pg_cron — 11-day data purge (runs at 2AM daily) ───────────────────────
-- NOTE: Enable the pg_cron extension first via Supabase Dashboard → Extensions

-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- SELECT cron.schedule('purge-expired-data', '0 2 * * *', $$
--     DELETE FROM doc_chat_messages
--         WHERE doc_id IN (SELECT id FROM documents WHERE expires_at < now());
--     DELETE FROM documents WHERE expires_at < now();
--     DELETE FROM chat_messages
--         WHERE session_id IN (SELECT id FROM chat_sessions WHERE expires_at < now());
--     UPDATE chat_sessions
--         SET is_pinned = false, pinned_at = NULL
--         WHERE is_pinned = true AND expires_at < now();
--     DELETE FROM chat_sessions WHERE expires_at < now();
-- $$);

-- ── 5. Storage bucket for legal-documents ────────────────────────────────────
-- Create this manually in Supabase Dashboard → Storage → New Bucket
-- Name: legal-documents | Public: OFF (use signed URLs)
