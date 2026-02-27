#!/usr/bin/env node
/**
 * One-time script: Generate an ed25519 keypair for license key signing.
 *
 * Run: node scripts/license-keypair-init.mjs
 *
 * Output:
 *   - Prints the PUBLIC key PEM (embed in licenseKeys.ts)
 *   - Saves the PRIVATE key to ~/.barnaby/license-private-key.pem
 *
 * IMPORTANT: The private key file must NEVER be committed to version control.
 *            Back it up securely — if you lose it, you can't generate new keys.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const PRIVATE_KEY_PATH = path.join(os.homedir(), '.barnaby', 'license-private-key.pem')

// Check if keypair already exists
if (fs.existsSync(PRIVATE_KEY_PATH)) {
    console.log('⚠️  Private key already exists at:', PRIVATE_KEY_PATH)
    console.log('   Delete it first if you want to generate a new keypair.')
    console.log()

    // Show the existing public key for reference
    const existingPrivate = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8')
    const privateKey = crypto.createPrivateKey(existingPrivate)
    const publicKeyPem = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' })
    console.log('Existing PUBLIC key (already in licenseKeys.ts):')
    console.log(publicKeyPem)
    process.exit(0)
}

// Generate new ed25519 keypair
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')

const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' })
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' })

// Save private key
const dir = path.dirname(PRIVATE_KEY_PATH)
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(PRIVATE_KEY_PATH, privateKeyPem, { mode: 0o600 })

console.log('✅ Ed25519 keypair generated successfully!')
console.log()
console.log('PRIVATE key saved to:', PRIVATE_KEY_PATH)
console.log('⚠️  NEVER commit this file. Back it up securely.')
console.log()
console.log('PUBLIC key — copy this into electron/main/licenseKeys.ts:')
console.log('─'.repeat(60))
console.log(publicKeyPem)
console.log('─'.repeat(60))
