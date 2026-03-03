#!/usr/bin/env node
/**
 * Upload images to Cloudinary
 *
 * Scans all markdown files in src/builds/ for image references,
 * uploads them to Cloudinary, and creates a mapping file.
 *
 * Usage:
 *   node src/scripts/upload-to-cloudinary.js          # Upload all images
 *   node src/scripts/upload-to-cloudinary.js --test   # Test with 5 images only
 *   node src/scripts/upload-to-cloudinary.js --dry    # Dry run, no uploads
 */

// Load .env from deploy/site/ directory (2 levels up from scripts)
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Paths
const BUILDS_DIR = path.join(__dirname, '..', 'builds');
const IMAGES_DIR = path.join(__dirname, '..', '..', 'optimized_images');
const MAP_FILE = path.join(__dirname, 'cloudinary-map.json');
const CLOUDINARY_FOLDER = 'cookersvdubs';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'ds3b5nqnd',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Parse command line args
const args = process.argv.slice(2);
const TEST_MODE = args.includes('--test');
const DRY_RUN = args.includes('--dry');
const TEST_LIMIT = 5;

/**
 * Extract all image filenames from markdown files
 */
function extractImagesFromMarkdown() {
  const images = new Set();
  const mdFiles = fs.readdirSync(BUILDS_DIR).filter(f => f.endsWith('.md'));

  console.log(`Scanning ${mdFiles.length} markdown files...`);

  for (const file of mdFiles) {
    const content = fs.readFileSync(path.join(BUILDS_DIR, file), 'utf8');

    // Extract hero_image
    const heroMatch = content.match(/hero_image:\s*["']?([^"'\n]+)["']?/);
    if (heroMatch && heroMatch[1]) {
      const img = heroMatch[1].trim();
      if (img && !img.startsWith('http')) {
        images.add(img);
      }
    }

    // Extract gallery images
    const galleryMatches = content.matchAll(/image:\s*["']?([^"'\n]+)["']?/g);
    for (const match of galleryMatches) {
      const img = match[1].trim();
      if (img && !img.startsWith('http')) {
        images.add(img);
      }
    }
  }

  return Array.from(images);
}

/**
 * Load existing mapping file
 */
function loadExistingMap() {
  if (fs.existsSync(MAP_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
    } catch (e) {
      console.warn('Warning: Could not parse existing map file, starting fresh');
    }
  }
  return {};
}

/**
 * Save mapping file
 */
function saveMap(map) {
  fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2), 'utf8');
}

/**
 * Upload a single image to Cloudinary
 */
async function uploadImage(filename, existingMap) {
  // Skip if already uploaded
  if (existingMap[filename]) {
    return { status: 'skipped', filename, url: existingMap[filename] };
  }

  const localPath = path.join(IMAGES_DIR, filename);

  // Check if file exists locally
  if (!fs.existsSync(localPath)) {
    return { status: 'missing', filename, error: 'File not found locally' };
  }

  if (DRY_RUN) {
    return { status: 'dry-run', filename };
  }

  try {
    // Use filename without extension as public_id
    const publicId = `${CLOUDINARY_FOLDER}/${path.parse(filename).name}`;

    const result = await cloudinary.uploader.upload(localPath, {
      public_id: publicId,
      folder: '', // Don't add extra folder since it's in public_id
      resource_type: 'image',
      overwrite: false,
      unique_filename: false,
      use_filename: true
    });

    return {
      status: 'uploaded',
      filename,
      url: result.secure_url,
      public_id: result.public_id
    };
  } catch (error) {
    return { status: 'failed', filename, error: error.message };
  }
}

/**
 * Main upload function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Cloudinary Image Upload Script');
  console.log('='.repeat(60));

  // Verify credentials
  if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error('\nError: Missing Cloudinary credentials!');
    console.error('Please create a .env file at the project root with:');
    console.error('  CLOUDINARY_CLOUD_NAME=ds3b5nqnd');
    console.error('  CLOUDINARY_API_KEY=your_api_key');
    console.error('  CLOUDINARY_API_SECRET=your_api_secret');
    process.exit(1);
  }

  console.log(`\nCloud name: ${cloudinary.config().cloud_name}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : TEST_MODE ? 'TEST (5 images)' : 'FULL UPLOAD'}`);

  // Extract images from markdown
  let images = extractImagesFromMarkdown();
  console.log(`\nFound ${images.length} unique images referenced in markdown files`);

  // In test mode, limit to 5 images
  if (TEST_MODE) {
    images = images.slice(0, TEST_LIMIT);
    console.log(`\nTest mode: Processing only ${TEST_LIMIT} images`);
  }

  // Load existing map
  const existingMap = loadExistingMap();
  const alreadyMapped = Object.keys(existingMap).length;
  if (alreadyMapped > 0) {
    console.log(`\nExisting map contains ${alreadyMapped} images`);
  }

  // Track results
  const results = {
    uploaded: [],
    skipped: [],
    failed: [],
    missing: [],
    dryRun: []
  };

  // Process images
  console.log('\nProcessing images...\n');

  for (let i = 0; i < images.length; i++) {
    const filename = images[i];
    const progress = `[${i + 1}/${images.length}]`;

    const result = await uploadImage(filename, existingMap);

    switch (result.status) {
      case 'uploaded':
        existingMap[filename] = result.url;
        results.uploaded.push(result);
        console.log(`${progress} UPLOADED: ${filename}`);
        break;
      case 'skipped':
        results.skipped.push(result);
        console.log(`${progress} SKIPPED:  ${filename} (already uploaded)`);
        break;
      case 'failed':
        results.failed.push(result);
        console.log(`${progress} FAILED:   ${filename} - ${result.error}`);
        break;
      case 'missing':
        results.missing.push(result);
        console.log(`${progress} MISSING:  ${filename}`);
        break;
      case 'dry-run':
        results.dryRun.push(result);
        console.log(`${progress} DRY-RUN:  ${filename}`);
        break;
    }

    // Save map periodically (every 50 uploads)
    if (results.uploaded.length > 0 && results.uploaded.length % 50 === 0) {
      saveMap(existingMap);
      console.log(`\n--- Saved progress (${results.uploaded.length} uploaded) ---\n`);
    }
  }

  // Save final map
  if (!DRY_RUN) {
    saveMap(existingMap);
  }

  // Report
  console.log('\n' + '='.repeat(60));
  console.log('UPLOAD COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total images:    ${images.length}`);
  console.log(`Uploaded:        ${results.uploaded.length}`);
  console.log(`Skipped:         ${results.skipped.length}`);
  console.log(`Missing locally: ${results.missing.length}`);
  console.log(`Failed:          ${results.failed.length}`);
  if (DRY_RUN) {
    console.log(`Dry run:         ${results.dryRun.length}`);
  }
  console.log(`\nMap file: ${MAP_FILE}`);
  console.log(`Total in map: ${Object.keys(existingMap).length}`);

  // Show uploaded URLs in test mode
  if (TEST_MODE && results.uploaded.length > 0) {
    console.log('\n--- Test Upload URLs ---');
    results.uploaded.forEach(r => {
      console.log(`  ${r.filename}`);
      console.log(`    ${r.url}`);
    });
  }

  // Show failed images
  if (results.failed.length > 0) {
    console.log('\n--- Failed Uploads ---');
    results.failed.forEach(r => {
      console.log(`  ${r.filename}: ${r.error}`);
    });
  }

  // Show missing images
  if (results.missing.length > 0) {
    console.log('\n--- Missing Images ---');
    results.missing.slice(0, 10).forEach(r => {
      console.log(`  ${r.filename}`);
    });
    if (results.missing.length > 10) {
      console.log(`  ... and ${results.missing.length - 10} more`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
