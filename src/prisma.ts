import { PrismaClient } from "@prisma/client";

/**
 * Prisma Client Singleton
 * 
 * This ensures only one instance of PrismaClient is created across the application.
 * In development, this prevents exhausting database connections during hot reloading.
 */

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
