/**
 * Migration script to migrate from old schema (users with direct relationships)
 * to new schema (workspaces and profiles)
 *
 * This script handles data migration in two scenarios:
 * 1. BEFORE schema migration: Creates new tables and migrates data
 * 2. AFTER schema migration: Migrates data if tables exist but are empty
 *
 * Usage: npx ts-node scripts/migrate-to-workspaces.ts
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

interface OldUser {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
}

interface OldProject {
  id: number;
}

async function tableExists(tableName: string): Promise<boolean> {
  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = ${tableName}
    );
  `;
  return result[0]?.exists || false;
}

async function columnExists(
  tableName: string,
  columnName: string
): Promise<boolean> {
  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = ${tableName}
      AND column_name = ${columnName}
    );
  `;
  return result[0]?.exists || false;
}

async function createWorkspacesTableIfNeeded() {
  const exists = await tableExists("workspaces");
  if (!exists) {
    console.log("Creating workspaces table...");
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "workspaces" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "ownerId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
      );
    `;
  }
}

async function createProfilesTableIfNeeded() {
  const exists = await tableExists("profiles");
  if (!exists) {
    console.log("Creating profiles table...");
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "profiles" (
        "id" TEXT NOT NULL,
        "workspaceId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "role" "Role" NOT NULL DEFAULT 'USER',
        "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "isVerified" BOOLEAN NOT NULL DEFAULT false,
        "isDefault" BOOLEAN NOT NULL DEFAULT false,
        CONSTRAINT "profiles_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "profiles_workspaceId_userId_key" UNIQUE ("workspaceId", "userId")
      );
    `;

    // Add foreign keys if they don't exist
    await prisma.$executeRaw`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'profiles_workspaceId_fkey'
        ) THEN
          ALTER TABLE "profiles" 
          ADD CONSTRAINT "profiles_workspaceId_fkey" 
          FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'profiles_userId_fkey'
        ) THEN
          ALTER TABLE "profiles" 
          ADD CONSTRAINT "profiles_userId_fkey" 
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `;
  }
}

async function addProfileIdColumnsIfNeeded() {
  // Add profileId to activities if it doesn't exist
  const activitiesHasProfileId = await columnExists("activities", "profileId");
  if (!activitiesHasProfileId) {
    console.log("Adding profileId column to activities...");
    await prisma.$executeRaw`
      ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "profileId" TEXT;
    `;
  }

  // Add profileId to daily_insights if it doesn't exist
  const insightsHasProfileId = await columnExists(
    "daily_insights",
    "profileId"
  );
  if (!insightsHasProfileId) {
    console.log("Adding profileId column to daily_insights...");
    await prisma.$executeRaw`
      ALTER TABLE "daily_insights" ADD COLUMN IF NOT EXISTS "profileId" TEXT;
    `;
  }

  // Add profileId to project_users if it doesn't exist
  const projectUsersHasProfileId = await columnExists(
    "project_users",
    "profileId"
  );
  if (!projectUsersHasProfileId) {
    console.log("Adding profileId column to project_users...");
    await prisma.$executeRaw`
      ALTER TABLE "project_users" ADD COLUMN IF NOT EXISTS "profileId" TEXT;
    `;
  }

  // Add workspaceId to projects if it doesn't exist
  const projectsHasWorkspaceId = await columnExists("projects", "workspaceId");
  if (!projectsHasWorkspaceId) {
    console.log("Adding workspaceId column to projects...");
    await prisma.$executeRaw`
      ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
    `;
  }
}

async function migrateToWorkspaces() {
  console.log("Starting migration to workspaces schema...\n");

  try {
    // Step 1: Check if we have old schema (userId columns)
    const activitiesHasUserId = await columnExists("activities", "userId");
    const insightsHasUserId = await columnExists("daily_insights", "userId");
    const projectUsersHasUserId = await columnExists("project_users", "userId");
    const usersHasRole = await columnExists("users", "role");

    if (!activitiesHasUserId && !insightsHasUserId && !projectUsersHasUserId) {
      console.log("✅ Schema already migrated. No old userId columns found.");
      console.log("Checking if data migration is needed...");
    }

    // Step 2: Create new tables if they don't exist
    await createWorkspacesTableIfNeeded();
    await createProfilesTableIfNeeded();
    await addProfileIdColumnsIfNeeded();

    // Step 3: Get all users
    const users = await prisma.$queryRaw<OldUser[]>`
      SELECT id, email, name, role FROM users;
    `;

    console.log(`Found ${users.length} users to migrate\n`);

    if (users.length === 0) {
      console.log("No users found. Migration complete.");
      return;
    }

    // Step 4: Create workspaces and profiles for each user
    console.log("Creating workspaces and profiles...");
    let createdCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      // Check if profile already exists for this user
      const existingProfile = await prisma.$queryRaw<
        Array<{ id: string; workspaceId: string }>
      >`
        SELECT id, "workspaceId" FROM profiles WHERE "userId" = ${user.id} LIMIT 1;
      `;

      if (existingProfile.length > 0) {
        console.log(
          `Profile already exists for user: ${user.email} (skipping)`
        );
        skippedCount++;
        continue;
      }

      const workspaceName =
        user.name || user.email.split("@")[0] || "My Workspace";
      const workspaceId = generateCuid();
      const profileId = generateCuid();

      // Create workspace
      await prisma.$executeRaw`
        INSERT INTO workspaces (id, name, "ownerId", "createdAt", "updatedAt")
        VALUES (${workspaceId}, ${workspaceName}, ${user.id}, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
      `;

      // Create profile - need to cast role to enum type
      const roleValue = user.role; // "USER" | "ADMIN"
      await prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO profiles (id, "workspaceId", "userId", name, role, "joinedAt", "isVerified", "isDefault")
          VALUES (${profileId}, ${workspaceId}, ${user.id}, ${
          user.name || user.email
        }, ${Prisma.raw(`'${roleValue}'::"Role"`)}, NOW(), false, true)
          ON CONFLICT ("workspaceId", "userId") DO NOTHING;
        `
      );

      console.log(`✓ Created workspace and profile for user: ${user.email}`);
      createdCount++;
    }

    console.log(
      `\nCreated ${createdCount} workspaces/profiles, skipped ${skippedCount} existing\n`
    );

    // Step 5: Migrate activities from userId to profileId (bulk update)
    if (activitiesHasUserId) {
      console.log("Migrating activities...");

      // Get count before migration
      const beforeCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM activities
        WHERE "profileId" IS NULL AND "userId" IS NOT NULL;
      `;
      const before = Number(beforeCount[0]?.count || 0);

      // Bulk update
      await prisma.$executeRaw`
        UPDATE activities a
        SET "profileId" = p.id
        FROM profiles p
        WHERE a."userId" = p."userId"
          AND a."profileId" IS NULL;
      `;

      console.log(`✓ Migrated ${before} activities\n`);
    } else {
      console.log("Activities already migrated (no userId column found)\n");
    }

    // Step 6: Migrate daily_insights from userId to profileId (bulk update)
    if (insightsHasUserId) {
      console.log("Migrating daily insights...");

      // Get count before migration
      const beforeCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM daily_insights
        WHERE "profileId" IS NULL AND "userId" IS NOT NULL;
      `;
      const before = Number(beforeCount[0]?.count || 0);

      // Bulk update
      await prisma.$executeRaw`
        UPDATE daily_insights di
        SET "profileId" = p.id
        FROM profiles p
        WHERE di."userId" = p."userId"
          AND di."profileId" IS NULL;
      `;

      console.log(`✓ Migrated ${before} daily insights\n`);
    } else {
      console.log("Daily insights already migrated (no userId column found)\n");
    }

    // Step 7: Migrate project_users from userId to profileId (bulk update)
    if (projectUsersHasUserId) {
      console.log("Migrating project users...");

      // Get count before migration
      const beforeCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM project_users
        WHERE "profileId" IS NULL AND "userId" IS NOT NULL;
      `;
      const before = Number(beforeCount[0]?.count || 0);

      // Bulk update
      await prisma.$executeRaw`
        UPDATE project_users pu
        SET "profileId" = p.id
        FROM profiles p
        WHERE pu."userId" = p."userId"
          AND pu."profileId" IS NULL;
      `;

      console.log(`✓ Migrated ${before} project users\n`);
    } else {
      console.log("Project users already migrated (no userId column found)\n");
    }

    // Step 8: Assign workspaceId to projects
    console.log("Assigning workspaces to projects...");
    const projects = await prisma.$queryRaw<OldProject[]>`
      SELECT id FROM projects WHERE "workspaceId" IS NULL;
    `;

    let assignedCount = 0;
    for (const project of projects) {
      // Get the first project user's profile to find their workspace
      const projectWorkspace = await prisma.$queryRaw<
        Array<{ workspaceId: string }>
      >`
        SELECT p."workspaceId"
        FROM project_users pu
        JOIN profiles p ON pu."profileId" = p.id
        WHERE pu."projectId" = ${project.id}
        LIMIT 1;
      `;

      if (projectWorkspace.length > 0) {
        await prisma.$executeRaw`
          UPDATE projects SET "workspaceId" = ${projectWorkspace[0].workspaceId} WHERE id = ${project.id};
        `;
        assignedCount++;
      } else {
        // If project has no users, assign to first user's workspace as fallback
        const firstWorkspace = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM workspaces ORDER BY "createdAt" LIMIT 1;
        `;
        if (firstWorkspace.length > 0) {
          await prisma.$executeRaw`
            UPDATE projects SET "workspaceId" = ${firstWorkspace[0].id} WHERE id = ${project.id};
          `;
          console.warn(
            `⚠️  Project ${project.id} has no users, assigned to first workspace`
          );
          assignedCount++;
        }
      }
    }

    console.log(`✓ Assigned workspaces to ${assignedCount} projects\n`);

    // Step 9: Cleanup - Drop old userId columns and constraints
    if (
      activitiesHasUserId ||
      insightsHasUserId ||
      projectUsersHasUserId ||
      usersHasRole
    ) {
      console.log(
        "Cleaning up old schema (dropping userId columns and constraints)...\n"
      );

      // Drop foreign key constraints
      try {
        await prisma.$executeRaw`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = 'activities_userId_fkey'
            ) THEN
              ALTER TABLE "activities" DROP CONSTRAINT "activities_userId_fkey";
            END IF;
          END $$;
        `;
        console.log("✓ Dropped activities_userId_fkey constraint");
      } catch (error) {
        console.warn("⚠️  Could not drop activities_userId_fkey:", error);
      }

      try {
        await prisma.$executeRaw`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = 'daily_insights_userId_fkey'
            ) THEN
              ALTER TABLE "daily_insights" DROP CONSTRAINT "daily_insights_userId_fkey";
            END IF;
          END $$;
        `;
        console.log("✓ Dropped daily_insights_userId_fkey constraint");
      } catch (error) {
        console.warn("⚠️  Could not drop daily_insights_userId_fkey:", error);
      }

      try {
        await prisma.$executeRaw`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = 'project_users_userId_fkey'
            ) THEN
              ALTER TABLE "project_users" DROP CONSTRAINT "project_users_userId_fkey";
            END IF;
          END $$;
        `;
        console.log("✓ Dropped project_users_userId_fkey constraint");
      } catch (error) {
        console.warn("⚠️  Could not drop project_users_userId_fkey:", error);
      }

      // Drop indexes related to userId
      try {
        await prisma.$executeRaw`
          DROP INDEX IF EXISTS "daily_insights_userId_date_idx";
        `;
        console.log("✓ Dropped daily_insights_userId_date_idx index");
      } catch (error) {
        console.warn(
          "⚠️  Could not drop daily_insights_userId_date_idx:",
          error
        );
      }

      try {
        await prisma.$executeRaw`
          DROP INDEX IF EXISTS "daily_insights_userId_date_key";
        `;
        console.log("✓ Dropped daily_insights_userId_date_key index");
      } catch (error) {
        console.warn(
          "⚠️  Could not drop daily_insights_userId_date_key:",
          error
        );
      }

      // Drop userId columns
      if (activitiesHasUserId) {
        try {
          await prisma.$executeRaw`
            ALTER TABLE "activities" DROP COLUMN IF EXISTS "userId";
          `;
          console.log("✓ Dropped userId column from activities");
        } catch (error) {
          console.warn("⚠️  Could not drop userId from activities:", error);
        }
      }

      if (insightsHasUserId) {
        try {
          await prisma.$executeRaw`
            ALTER TABLE "daily_insights" DROP COLUMN IF EXISTS "userId";
          `;
          console.log("✓ Dropped userId column from daily_insights");
        } catch (error) {
          console.warn("⚠️  Could not drop userId from daily_insights:", error);
        }
      }

      if (projectUsersHasUserId) {
        try {
          await prisma.$executeRaw`
            ALTER TABLE "project_users" DROP COLUMN IF EXISTS "userId";
          `;
          console.log("✓ Dropped userId column from project_users");
        } catch (error) {
          console.warn("⚠️  Could not drop userId from project_users:", error);
        }
      }

      // Drop role column from users
      if (usersHasRole) {
        try {
          await prisma.$executeRaw`
            ALTER TABLE "users" DROP COLUMN IF EXISTS "role";
          `;
          console.log("✓ Dropped role column from users");
        } catch (error) {
          console.warn("⚠️  Could not drop role from users:", error);
        }
      }

      // Drop sessions table if it exists
      const sessionsExists = await tableExists("sessions");
      if (sessionsExists) {
        try {
          await prisma.$executeRaw`
            DROP TABLE IF EXISTS "sessions" CASCADE;
          `;
          console.log("✓ Dropped sessions table");
        } catch (error) {
          console.warn("⚠️  Could not drop sessions table:", error);
        }
      }

      console.log("\n✅ Cleanup completed!\n");
    }

    console.log("✅ Migration completed successfully!");
    console.log("\nNext steps:");
    if (
      activitiesHasUserId ||
      insightsHasUserId ||
      projectUsersHasUserId ||
      usersHasRole
    ) {
      console.log("1. Review the migrated data");
      console.log(
        "2. Run Prisma generate to update the client: npx prisma generate"
      );
      console.log(
        "3. The old schema has been cleaned up - you're ready to go!"
      );
    } else {
      console.log(
        "1. Data migration complete - schema appears to already be migrated"
      );
      console.log("2. Verify the data looks correct");
    }
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Generate CUID-like ID
function generateCuid(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = randomBytes(8).toString("hex");
  return `c${timestamp}${randomPart}`;
}

// Run the migration
migrateToWorkspaces()
  .then(() => {
    console.log("Migration script finished");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration script failed:", error);
    process.exit(1);
  });
