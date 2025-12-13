/*
  Warnings:

  - You are about to drop the column `userId` on the `activities` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `daily_insights` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `project_users` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `sessions` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[profileId,date]` on the table `daily_insights` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `profileId` to the `activities` table without a default value. This is not possible if the table is not empty.
  - Added the required column `profileId` to the `daily_insights` table without a default value. This is not possible if the table is not empty.
  - Added the required column `profileId` to the `project_users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `workspaceId` to the `projects` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."activities" DROP CONSTRAINT "activities_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."daily_insights" DROP CONSTRAINT "daily_insights_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."project_users" DROP CONSTRAINT "project_users_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."sessions" DROP CONSTRAINT "sessions_userId_fkey";

-- DropIndex
DROP INDEX "public"."daily_insights_userId_date_idx";

-- DropIndex
DROP INDEX "public"."daily_insights_userId_date_key";

-- AlterTable
ALTER TABLE "public"."activities" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."daily_insights" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."project_users" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."projects" ADD COLUMN     "workspaceId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."users" DROP COLUMN "role",
ALTER COLUMN "name" DROP NOT NULL;

-- DropTable
DROP TABLE "public"."sessions";

-- CreateTable
CREATE TABLE "public"."workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'USER',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "inviterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."profiles" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'USER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "public"."invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_email_workspaceId_key" ON "public"."invitations"("email", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_workspaceId_userId_key" ON "public"."profiles"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "daily_insights_profileId_date_idx" ON "public"."daily_insights"("profileId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_insights_profileId_date_key" ON "public"."daily_insights"("profileId", "date");

-- AddForeignKey
ALTER TABLE "public"."invitations" ADD CONSTRAINT "invitations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invitations" ADD CONSTRAINT "invitations_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_insights" ADD CONSTRAINT "daily_insights_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."activities" ADD CONSTRAINT "activities_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."projects" ADD CONSTRAINT "projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_users" ADD CONSTRAINT "project_users_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
