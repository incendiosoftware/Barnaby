import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJsonPath = path.join(root, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
const version = String(packageJson.version || '').trim()

if (!version) {
  throw new Error('package.json version is missing.')
}

const notesFilename = `RELEASE_NOTES_${version}.md`
const notesPath = path.join(root, notesFilename)

if (fs.existsSync(notesPath)) {
  console.log(`Release notes already exist: ${notesFilename}`)
  process.exit(0)
}

const now = new Date()
const month = now.toLocaleString('en-US', { month: 'long' })
const year = now.getFullYear()

const template = `# Barnaby ${version} - Release Notes

**Released:** ${month} ${year}

## Added

- TODO

## Changed

- TODO

## Fixed

- TODO

## Notes

- Artifact: \`release/${version}/Barnaby_${version}_portable.exe\`
`

fs.writeFileSync(notesPath, template, 'utf8')
console.log(`Created ${notesFilename}`)
