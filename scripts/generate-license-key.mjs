#!/usr/bin/env node
/**
 * Generate a license key for a customer.
 *
 * Usage:
 *   node scripts/generate-license-key.mjs --email customer@example.com
 *   node scripts/generate-license-key.mjs --email customer@example.com --tier pro
 *   node scripts/generate-license-key.mjs --email customer@example.com --exp 2027-01-01
 *
 * Options:
 *   --email    Customer email (required)
 *   --tier     License tier: pro, enterprise (default: pro)
 *   --exp      Expiry date in YYYY-MM-DD format (optional, omit for perpetual)
 *
 * Reads the private key from: ~/.barnaby/license-private-key.pem
 * Run license-keypair-init.mjs first if you haven't generated a keypair.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const PRIVATE_KEY_PATH = path.join(os.homedir(), '.barnaby', 'license-private-key.pem')

// Parse args
const args = process.argv.slice(2)
function getArg(name) {
    const idx = args.indexOf(`--${name}`)
    if (idx === -1 || idx + 1 >= args.length) return undefined
    return args[idx + 1]
}

const email = getArg('email')
const tier = getArg('tier') || 'pro'
const expStr = getArg('exp')

if (!email) {
    console.error('❌ Missing --email argument')
    console.error('Usage: node scripts/generate-license-key.mjs --email customer@example.com')
    process.exit(1)
}

// Read private key
if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error('❌ Private key not found at:', PRIVATE_KEY_PATH)
    console.error('   Run: node scripts/license-keypair-init.mjs')
    process.exit(1)
}

const privateKeyPem = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8')
const privateKey = crypto.createPrivateKey(privateKeyPem)

// Build payload
const payload = {
    email: email.toLowerCase().trim(),
    product: 'orchestrator',
    tier,
    iat: Date.now(),
}

if (expStr) {
    const expDate = new Date(expStr)
    if (isNaN(expDate.getTime())) {
        console.error('❌ Invalid --exp date format. Use YYYY-MM-DD.')
        process.exit(1)
    }
    payload.exp = expDate.getTime()
}

// Encode payload
const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8')

// Sign
const signature = crypto.sign(null, payloadBuf, privateKey)

// Base64url encode (no padding)
function base64urlEncode(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const key = `ORCH-${base64urlEncode(payloadBuf)}.${base64urlEncode(signature)}`

console.log()
console.log('✅ License key generated for:', email)
console.log()
console.log('Details:')
console.log('  Email:', payload.email)
console.log('  Tier:', payload.tier)
console.log('  Issued:', new Date(payload.iat).toISOString())
console.log('  Expires:', payload.exp ? new Date(payload.exp).toISOString() : 'Never (perpetual)')
console.log()
console.log('License Key:')
console.log('─'.repeat(60))
console.log(key)
console.log('─'.repeat(60))
console.log()
console.log('Send this key to the customer. They paste it into')
console.log('Settings → Orchestrator → License Key.')
