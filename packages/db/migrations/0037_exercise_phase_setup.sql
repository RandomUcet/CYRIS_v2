ALTER TABLE "exercise_advice" ADD COLUMN "setup_receipts" jsonb NOT NULL DEFAULT '[]'::jsonb;
