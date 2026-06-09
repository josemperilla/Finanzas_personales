const CRED_KEY = (userId: string) => `fm_webauthn_cred_${userId}`;

export function isBiometricSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}

export function hasBiometric(userId: string): boolean {
  return !!localStorage.getItem(CRED_KEY(userId));
}

export async function registerBiometric(userId: string): Promise<boolean> {
  if (!isBiometricSupported()) return false;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userBytes = new TextEncoder().encode(userId);
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Finanzas Familiar', id: window.location.hostname },
        user: { id: userBytes, name: userId, displayName: userId },
        pubKeyCredParams: [
          { alg: -7,   type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          requireResidentKey: false,
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    const raw = new Uint8Array(cred.rawId);
    localStorage.setItem(CRED_KEY(userId), btoa(String.fromCharCode(...raw)));
    return true;
  } catch {
    return false;
  }
}

export async function authenticateBiometric(userId: string): Promise<boolean> {
  if (!isBiometricSupported()) return false;
  const stored = localStorage.getItem(CRED_KEY(userId));
  if (!stored) return false;
  try {
    const rawId = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: rawId, type: 'public-key' }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}

export function clearBiometric(userId: string): void {
  localStorage.removeItem(CRED_KEY(userId));
}
