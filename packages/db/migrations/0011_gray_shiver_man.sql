DROP INDEX "weapons_identifier_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "weapons_identifier_unique_idx" ON "weapons" USING btree ("identifier");