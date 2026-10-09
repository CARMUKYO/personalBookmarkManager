import bcrypt from "bcryptjs";
import type { PrismaClient } from "../generated/prisma/client.js";
import { HttpError } from "../errors.js";

const BCRYPT_ROUNDS = 10;

// Only these fields ever leave the service. Never return the whole user row (it has passwordHash).
const publicUserSelect = { id: true, email: true, createdAt: true } as const;

export async function registerUser(prisma: PrismaClient, email: string, password: string) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    return await prisma.user.create({
      data: { email, passwordHash },
      select: publicUserSelect,
    });
  } catch (err) {
    // Rely on the database's unique constraint instead of "check, then insert",
    // which would let two simultaneous sign-ups both pass the check.
    // Note: this reveals that an email is registered (user enumeration). Accepted
    // trade-off for this app; fixing it would need email verification.
    if ((err as { code?: string }).code === "P2002") {
      throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }
    throw err;
  }
}
