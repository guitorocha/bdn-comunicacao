import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// Hashing com scrypt do próprio Node — sem dependência nativa, o que
// mantém o bundle da Lambda leve (esbuild não precisa empacotar nada).
const KEY_LENGTH = 64;
const PREFIX = "scrypt";

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plain, salt, KEY_LENGTH).toString("hex");
  return `${PREFIX}:${salt}:${derived}`;
}

export function isHashed(stored: string): boolean {
  return stored.startsWith(`${PREFIX}:`);
}

// Usuários criados antes do hashing têm a senha em texto puro no banco;
// nesse caso comparamos direto e o login cuida de regravar o hash.
export function verifyPassword(plain: string, stored: string): boolean {
  if (!isHashed(stored)) {
    return stored.length > 0 && plain === stored;
  }
  const [, salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(plain, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
