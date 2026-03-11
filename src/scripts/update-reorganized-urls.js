#!/usr/bin/env node
/**
 * Update markdown files with reorganized Cloudinary URLs
 *
 * Reads the cloudinary-reorganized-map.json and updates all markdown files
 * in src/builds/ to use the new subfolder URLs.
 *
 * Usage:
 *   node src/scripts/update-reorganized-urls.js          # Update all files
 *   node src/scripts/update-reorganized-urls.js --dry    # Dry run, no writes
 */

const fs = require('fs');
const path = require('path');

// Paths
const BUILDS_DIR = path.join(__dirname, '..', 'builds');
const REORGANIZED_MAP_FILE = path.join(__dirname, 'cloudinary-reorganized-map.json');

// Parse command line args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry');

/**
 * Load the URL mapping
 */
function loadUrlMap() {
  if (!fs.existsSync(REORGANIZED_MAP_FILE)) {
    console.error(`Error: Mapping file not found: ${REORGANIZED_MAP_FILE}`);
    console.error('Run reorganize-cloudinary.js first to generate the mapping.');
    process.exit(1);
  }

  try {
    return JSON.parse(fs.readFileSync(REORGANIZED_MAP_FILE, 'utf8'));
  } catch (e) {
    console.error(`Error: Could not parse mapping file: ${e.message}`);
    process.exit(1);
  }
}

/**
 * Update URLs in a single file
 */
function updateFile(filePath, urlMap) {
  const originalContent = fs.readFileSync(filePath, 'utf8');
  let content = originalContent;
  let replacements = 0;

  // Replace each old URL with new URL
  for (const [oldUrl, newUrl] of Object.entries(urlMap)) {
    // Count occurrences before replacing
    const regex = new RegExp(escapeRegExp(oldUrl), 'g');
    const matches = content.match(regex);
    if (matches) {
      replacements += matches.length;
      content = content.replace(regex, newUrl);
    }
  }

  // Only write if changes were made
  if (content !== originalContent) {
    if (!DRY_RUN) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
    return { modified: true, replacements };
  }

  return { modified: false, replacements: 0 };
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Main function
 */
function main() {
  console.log('='.repeat(60));
  console.log('Update Markdown URLs Script');
  console.log('='.repeat(60));
  console.log(`\nMode: ${DRY_RUN ? 'DRY RUN' : 'LIVE UPDATE'}`);

  // Load URL mapping
  const urlMap = loadUrlMap();
  const mappingCount = Object.keys(urlMap).length;
  console.log(`\nLoaded ${mappingCount} URL mappings from:`);
  console.log(`  ${REORGANIZED_MAP_FILE}`);

  if (mappingCount === 0) {
    console.log('\nNo mappings found. Nothing to update.');
    process.exit(0);
  }

  // Get all markdown files
  const mdFiles = fs.readdirSync(BUILDS_DIR).filter(f => f.endsWith('.md'));
  console.log(`\nProcessing ${mdFiles.length} markdown files...`);

  // Track results
  let filesModified = 0;
  let totalReplacements = 0;
  const modifiedFiles = [];

  // Process each file
  for (const file of mdFiles) {
    const filePath = path.join(BUILDS_DIR, file);
    const result = updateFile(filePath, urlMap);

    if (result.modified) {
      filesModified++;
      totalReplacements += result.replacements;
      modifiedFiles.push({ file, replacements: result.replacements });
      console.log(`  ${DRY_RUN ? '[DRY]' : ''} Updated: ${file} (${result.replacements} URLs)`);
    }
  }

  // Report
  console.log('\n' + '='.repeat(60));
  console.log('UPDATE COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total files scanned:    ${mdFiles.length}`);
  console.log(`Files modified:         ${filesModified}`);
  console.log(`Total URLs replaced:    ${totalReplacements}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN - No files were actually modified]');
    console.log('Run without --dry to apply changes.');
  }

  // Show sample of modified files
  if (modifiedFiles.length > 0 && modifiedFiles.length <= 10) {
    console.log('\n--- Modified Files ---');
    modifiedFiles.forEach(({ file, replacements }) => {
      console.log(`  ${file}: ${replacements} URLs updated`);
    });
  } else if (modifiedFiles.length > 10) {
    console.log('\n--- Modified Files (first 10) ---');
    modifiedFiles.slice(0, 10).forEach(({ file, replacements }) => {
      console.log(`  ${file}: ${replacements} URLs updated`);
    });
    console.log(`  ... and ${modifiedFiles.length - 10} more`);
  }
}

main();
