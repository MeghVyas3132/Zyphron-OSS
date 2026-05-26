-- CreateTable: compose_groups
CREATE TABLE "compose_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repository_url" TEXT NOT NULL,
    "compose_file" TEXT NOT NULL DEFAULT 'docker-compose.yml',
    "branch" TEXT NOT NULL DEFAULT 'main',
    "manifest" JSONB,
    "user_id" TEXT NOT NULL,
    "team_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compose_groups_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add compose columns to projects
ALTER TABLE "projects"
    ADD COLUMN IF NOT EXISTS "compose_group_id" TEXT,
    ADD COLUMN IF NOT EXISTS "compose_service_name" TEXT;

-- AddForeignKey
ALTER TABLE "projects"
    ADD CONSTRAINT "projects_compose_group_id_fkey"
    FOREIGN KEY ("compose_group_id")
    REFERENCES "compose_groups"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
