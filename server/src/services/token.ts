import { SignJWT } from "jose";

export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
export const TOKEN_ALGORITHM = "HS256";

// The token only carries the user id (as "sub"). A JWT is signed, NOT encrypted,
// so anyone can read what's inside it: never put an email or other personal data in it.
export async function signToken(userId: number, secret: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: TOKEN_ALGORITHM })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));
}
