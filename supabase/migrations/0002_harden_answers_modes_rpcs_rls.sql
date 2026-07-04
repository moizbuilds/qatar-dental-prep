-- Hardening pass addressing the Fable code review (C5, H1, M5, L4).
-- Apply to the Supabase project alongside deploying the matching app code —
-- the app's createAttempt (mode), recordAnswer (upsert), and randomMock (RPC)
-- depend on this migration.

-- 1. Dedupe answers, keeping the latest per (attempt_id, question_id), so the
--    UNIQUE constraint below can be added. (The reload bug left duplicates.)
DELETE FROM public.answers a USING (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY attempt_id, question_id ORDER BY answered_at DESC, id DESC
  ) AS rn
  FROM public.answers
) d
WHERE a.id = d.id AND d.rn > 1;

-- 2. One answer per (attempt, question). Enables upsert-on-reanswer, so an
--    accidental reload can't double-count answers. (C1)
ALTER TABLE public.answers
  ADD CONSTRAINT answers_attempt_question_uniq UNIQUE (attempt_id, question_id);

-- 3. Record how each attempt was started. Only graded modes feed the dashboard;
--    'completed' (pure re-reading) is excluded. Existing rows default to 'full'. (M5)
ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'full';

-- 4. missed_questions: latest-answer semantics, so answering a question
--    correctly in review removes it (the list shrinks as you improve). (H1)
CREATE OR REPLACE FUNCTION public.missed_questions()
RETURNS SETOF public.questions LANGUAGE sql STABLE AS $$
  SELECT q.* FROM public.questions q
  JOIN (
    SELECT DISTINCT ON (a.question_id) a.question_id, a.is_correct
    FROM public.answers a
    ORDER BY a.question_id, a.answered_at DESC, a.id DESC
  ) latest ON latest.question_id = q.id
  WHERE latest.is_correct = false
$$;

-- 5. attempt_stats: exclude pure re-reading ('completed') attempts. (M5)
CREATE OR REPLACE FUNCTION public.attempt_stats()
RETURNS TABLE(category text, attempted bigint, correct bigint) LANGUAGE sql STABLE AS $$
  SELECT q.category, count(*)::bigint, coalesce(sum(a.is_correct::int),0)::bigint
  FROM public.answers a
  JOIN public.questions q ON q.id = a.question_id
  JOIN public.quiz_attempts qa ON qa.id = a.attempt_id
  WHERE qa.mode IN ('full','topic','review')
  GROUP BY q.category
$$;

-- 6. attempt_history: only graded, completed attempts feed the trend line, so
--    review click-throughs and abandoned mocks stop polluting it. (M5)
CREATE OR REPLACE FUNCTION public.attempt_history()
RETURNS TABLE(attempt_id bigint, completed_at timestamptz, total bigint, correct bigint)
LANGUAGE sql STABLE AS $$
  SELECT qa.id, qa.completed_at, count(a.id)::bigint,
         coalesce(sum(a.is_correct::int),0)::bigint
  FROM public.quiz_attempts qa
  JOIN public.answers a ON a.attempt_id = qa.id
  WHERE qa.mode IN ('full','topic','review') AND qa.completed_at IS NOT NULL
  GROUP BY qa.id ORDER BY qa.id ASC
$$;

-- 7. random_mock: build the whole 150-question blueprint-weighted mock in ONE
--    round-trip instead of 14 sequential category RPCs. (L4)
CREATE OR REPLACE FUNCTION public.random_mock()
RETURNS SETOF public.questions LANGUAGE sql STABLE AS $$
  WITH blueprint(category, n) AS (
    VALUES
      ('scientific_knowledge',35),('patient_assessment',10),('treatment_planning',6),
      ('health_safety',6),('emergencies',6),('prevention_population',6),
      ('pain_anxiety',5),('periodontics',10),('pediatric',10),
      ('orthodontics',5),('restorative_endodontics',16),('prosthodontics',10),
      ('oral_surgery_medicine',10),('affective_skills',15)
  )
  SELECT q.* FROM blueprint b
  CROSS JOIN LATERAL (
    SELECT * FROM public.questions qq
    WHERE qq.category = b.category
    ORDER BY random() LIMIT b.n
  ) q
$$;

-- 8. Harden RLS: replace the blanket "anon can do ANYTHING (incl. DELETE)"
--    policies with least-privilege per-command policies. The app never deletes
--    at runtime, and the corpus tables (chunks/questions) are read-only to it,
--    so a leaked anon key can no longer wipe or tamper with the database. (C5)
DROP POLICY IF EXISTS anon_all_answers ON public.answers;
DROP POLICY IF EXISTS anon_all_chat ON public.chat_messages;
DROP POLICY IF EXISTS anon_all_chunks ON public.chunks;
DROP POLICY IF EXISTS anon_all_questions ON public.questions;
DROP POLICY IF EXISTS anon_all_attempts ON public.quiz_attempts;

-- Read-only corpus.
CREATE POLICY anon_select_chunks ON public.chunks FOR SELECT TO anon USING (true);
CREATE POLICY anon_select_questions ON public.questions FOR SELECT TO anon USING (true);

-- Attempts: read + create + complete (no delete).
CREATE POLICY anon_select_attempts ON public.quiz_attempts FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert_attempts ON public.quiz_attempts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_update_attempts ON public.quiz_attempts FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Answers: read + insert + update (upsert on reanswer); no delete.
CREATE POLICY anon_select_answers ON public.answers FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert_answers ON public.answers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_update_answers ON public.answers FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Chat: read + insert; no delete.
CREATE POLICY anon_select_chat ON public.chat_messages FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert_chat ON public.chat_messages FOR INSERT TO anon WITH CHECK (true);
