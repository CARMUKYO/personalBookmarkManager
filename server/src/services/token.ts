import { jwtVerify, SignJWT } from "jose";

export const AUTH_COOKIE = "token";
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

// Returns the user id from a valid token. Throws if the token is invalid in any way.
export async function verifyToken(token: string, secret: string) {
  // Pinning the algorithm stops an attacker from choosing a weaker one (e.g. "none") in the token header.
  // jwtVerify also checks the signature and the expiry (exp) for us.
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: [TOKEN_ALGORITHM],
    requiredClaims: ["sub", "exp"],
  });

  const userId = Number(payload.sub);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("Token subject is not a valid user id");
  }
  return userId;
}
