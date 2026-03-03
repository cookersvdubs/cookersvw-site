#!/usr/bin/env node
/**
 * Update markdown files with Cloudinary URLs
 *
 * Reads cloudinary-map.json and replaces local image filenames
 * with full Cloudinary URLs in all markdown files.
 *
 * Usage:
 *   node src/scripts/update-image-urls.js          # Update all files
 *   node src/scripts/update-image-urls.js --dry    # Dry run, show changes only
 */

const fs = require('fs');
const path = require('path');

// Paths
const BUILDS_DIR = path.join(__dirname, '..', 'builds');
const MAP_FILE = path.join(__dirname, 'cloudinary-map.json');

// Parse command line args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry');

/**
 * Load the Cloudinary URL mapping
 */
function loadMap() {
  if (!fs.existsSync(MAP_FILE)) {
    console.error(`Error: Map file not found: ${MAP_FILE}`);
    console.error('Run upload-to-cloudinary.js first to create the mapping.');
    process.exit(1);
  }

  try {
    return JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
  } catch (e) {
    console.error('Error: Could not parse map file:', e.message);
    process.exit(1);
  }
}

/**
 * Update a single markdown file
 */
function updateMarkdownFile(filePath, map) {
  const original = fs.readFileSync(filePath, 'utf8');
  let content = original;
  let replacements = 0;

  // Replace hero_image values
  content = content.replace(
    /(hero_image:\s*["']?)([^"'\n]+)(["']?)/g,
    (match, prefix, filename, suffix) => {
      const trimmed = filename.trim();
      if (map[trimmed]) {
        replacements++;
        return `${prefix}${map[trimmed]}${suffix}`;
      }
      return match;
    }
  );

  // Replace gallery image values
  content = content.replace(
    /(image:\s*["']?)([^"'\n]+)(["']?)/g,
    (match, prefix, filename, suffix) => {
      const trimmed = filename.trim();
      // Skip if already a URL
      if (trimmed.startsWith('http')) {
        return match;
      }
      if (map[trimmed]) {
        replacements++;
        return `${prefix}${map[trimmed]}${suffix}`;
      }
      return match;
    }
  );

  const changed = content !== original;

  if (changed && !DRY_RUN) {
    fs.writeFileSync(filePath, content, 'utf8');
  }

  return { changed, replacements };
}

/**
 * Main function
 */
function main() {
  console.log('='.repeat(60));
  console.log('Update Image URLs Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'UPDATING FILES'}`);

  // Load map
  const map = loadMap();
  const mapSize = Object.keys(map).length;
  console.log(`\nLoaded ${mapSize} URL mappings from cloudinary-map.json`);

  if (mapSize === 0) {
    console.log('\nNo mappings found. Nothing to update.');
    return;
  }

  // Get markdown files
  const mdFiles = fs.readdirSync(BUILDS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(BUILDS_DIR, f));

  console.log(`\nProcessing ${mdFiles.length} markdown files...\n`);

  // Track results
  let filesChanged = 0;
  let totalReplacements = 0;
  const changedFiles = [];

  for (const filePath of mdFiles) {
    const filename = path.basename(filePath);
    const result = updateMarkdownFile(filePath, map);

    if (result.changed) {
      filesChanged++;
      totalReplacements += result.replacements;
      changedFiles.push({ filename, replacements: result.replacements });

      if (DRY_RUN) {
        console.log(`WOULD UPDATE: ${filename} (${result.replacements} replacements)`);
      } else {
        console.log(`UPDATED: ${filename} (${result.replacements} replacements)`);
      }
    }
  }

  // Report
  console.log('\n' + '='.repeat(60));
  console.log('UPDATE COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total files:        ${mdFiles.length}`);
  console.log(`Files changed:      ${filesChanged}`);
  console.log(`Total replacements: ${totalReplacements}`);

  if (DRY_RUN && filesChanged > 0) {
    console.log('\nThis was a dry run. No files were modified.');
    console.log('Run without --dry to apply changes.');
  }

  // Show sample of changed files
  if (changedFiles.length > 0 && changedFiles.length <= 10) {
    console.log('\n--- Changed Files ---');
    changedFiles.forEach(f => {
      console.log(`  ${f.filename}: ${f.replacements} URLs updated`);
    });
  }
}

main();
