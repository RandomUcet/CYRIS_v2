ALTER TABLE "exercise_advice" ADD COLUMN "handoffs" jsonb NOT NULL DEFAULT '[]'::jsonb;
