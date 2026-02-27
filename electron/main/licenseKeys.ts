/**
 * License key validation via the Barnaby central server.
 *
 * Key format: BETA-XXXX-XXXX-XXXX
 *
 * This connects to https://barnaby.build/plugin/api/validate
 * to check if a key is active and logs the usage session.
 */

export interface LicenseValidationResult {
    valid: boolean
    reason?: string
    payload?: {
        email: string
        name: string
        tier: string
    }
}

/**
 * Validate a license key string against the live HTTP API.
 *
 * Returns { valid: true, payload } on success.
 * Returns { valid: false, reason } on failure.
 */
export async function validateLicenseKey(key: string, machineId: string, appVersion: string): Promise<LicenseValidationResult> {
    const trimmed = (key ?? '').trim()
    if (!trimmed) {
        return { valid: false, reason: 'License key is required' }
    }

    try {
        const res = await fetch('https://barnaby.build/plugin/api/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: trimmed, machineId, appVersion }),
        })

        const data = await res.json()

        if (res.ok && data.valid) {
            return {
                valid: true,
                payload: {
                    email: data.email,
                    name: data.name,
                    tier: data.tier,
                }
            }
        } else {
            return { valid: false, reason: data.reason || 'Invalid license key' }
        }
    } catch (err) {
        // Fallback or network error
        return { valid: false, reason: 'Could not connect to license server. Check your network.' }
    }
}

/**
 * Kept for backwards compatibility with IPC handlers.
 * Since we no longer use a local public key, this always returns true.
 */
export function isPublicKeyConfigured(): boolean {
    return true
}
