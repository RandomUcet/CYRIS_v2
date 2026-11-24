ALTER TABLE "exercise_advice" ADD COLUMN "team_receipts" jsonb NOT NULL DEFAULT '[]'::jsonb;
