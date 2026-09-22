const ALGORITHM = 'PBKDF2'
const HASH = 'SHA-256'
const ITERATIONS = 310_000
const KEY_LENGTH = 256
const SALT_BYTES = 16
const FORMAT = 'pbkdf2-sha256'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

async function derivePasswordKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    ALGORITHM,
    false,
    ['deriveBits'],
  )

  const bits = await crypto.subtle.deriveBits(
    {
      name: ALGORITHM,
      hash: HASH,
      salt,
      iterations,
    },
    passwordKey,
    KEY_LENGTH,
  )

  return new Uint8Array(bits)
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false
  }

  let difference = 0

  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!
  }

  return difference === 0
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters')
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derivePasswordKey(password, salt, ITERATIONS)

  return [
    FORMAT,
    ITERATIONS.toString(),
    bytesToBase64(salt),
    bytesToBase64(hash),
  ].join('$')
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [format, iterationsValue, saltValue, hashValue] = storedHash.split('$')
  const iterations = Number(iterationsValue)

  if (
    format !== FORMAT ||
    !Number.isInteger(iterations) ||
    iterations <= 0 ||
    !saltValue ||
    !hashValue
  ) {
    return false
  }

  try {
    const salt = base64ToBytes(saltValue)
    const expectedHash = base64ToBytes(hashValue)
    const actualHash = await derivePasswordKey(password, salt, iterations)

    return timingSafeEqual(actualHash, expectedHash)
  } catch {
    return false
  }
}
