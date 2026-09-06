-- Telegram interface: link Matriq accounts to Telegram identities.
-- telegram_id is unique — one Telegram account can hold at most one Matriq
-- account link. Null = not linked.

ALTER TABLE "users"
  ADD COLUMN "telegram_id"        TEXT,
  ADD COLUMN "telegram_linked_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");
