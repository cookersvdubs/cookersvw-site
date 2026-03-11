#!/usr/bin/env node
/**
 * Find missing images by checking Cloudinary API directly
 *
 * Reads all markdown files, extracts image URLs, and checks each one
 * against the Cloudinary API to find which images don't exist.
 *
 * Usage:
 *   node src/scripts/find-missing.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Paths
const BUILDS_DIR = path.join(__dirname, '..', 'builds');
const OUTPUT_FILE = path.join(__dirname, 'missing-images.json');

// Rate limiting settings
const DELAY_BETWEEN_CHECKS_MS = 100;
const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES_MS = 1000;
const PROGRESS_INTERVAL = 50;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'ds3b5nqnd',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract car slug from markdown filename
 */
function getCarSlug(mdFilename) {
  return mdFilename.replace('.md', '');
}

/**
 * Extract all Cloudinary image info from a markdown file
 */
function extractImagesFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const images = [];

  // Match Cloudinary URLs
  const urlPattern = /https:\/\/res\.cloudinary\.com\/ds3b5nqnd\/image\/upload\/v\d+\/cookersvdubs\/([^"'\s\n]+)/g;

  let match;
  while ((match = urlPattern.exec(content)) !== null) {
    const fullPath = match[1];
    const url = match[0];

    // Extract filename and build public_id
    let filename, publicId;
    if (fullPath.includes('/')) {
      // Already in subfolder: cookersvdubs/carslug/filename.jpg
      const parts = fullPath.split('/');
      filename = parts[parts.length - 1];
      const filenameWithoutExt = path.parse(filename).name;
      publicId = `cookersvdubs/${parts.slice(0, -1).join('/')}/${filenameWithoutExt}`;
    } else {
      // Flat structure: cookersvdubs/filename.jpg
      filename = fullPath;
      const filenameWithoutExt = path.parse(filename).name;
      publicId = `cookersvdubs/${filenameWithoutExt}`;
    }

    images.push({ url, filename, publicId });
  }

  return images;
}

/**
 * Check if an image exists in Cloudinary using cloudinary.api.resource()
 * Returns: { exists: boolean, error?: string }
 */
async function checkImageExists(publicId) {
  try {
    const result = await cloudinary.api.resource(publicId);
    // If we get here, the resource exists
    return { exists: true };
  } catch (error) {
    // Check for "not found" error
    if (error && error.error && error.error.http_code === 404) {
      return { exists: false };
    }
    if (error && error.http_code === 404) {
      return { exists: false };
    }
    if (error && error.message && error.message.includes('not found')) {
      return { exists: false };
    }
    if (error && error.message && error.message.includes('Resource not found')) {
      return { exists: false };
    }
    // Other errors - log and treat as not found
    return { exists: false, error: error.message || String(error) };
  }
}

/**
 * Process a batch of images
 */
async function processBatch(batch, missingImages, stats) {
  for (const img of batch) {
    const result = await checkImageExists(img.publicId);

    if (result.exists) {
      stats.found++;
    } else {
      stats.missing++;
      missingImages.push({
        car: img.car,
        filename: img.filename,
        expected_url: img.url
      });
      if (result.error) {
        stats.errors++;
      }
    }

    stats.checked++;

    // Progress update
    if (stats.checked % PROGRESS_INTERVAL === 0) {
      console.log(`[${stats.checked}/${stats.total}] Found: ${stats.found} | Missing: ${stats.missing} | Errors: ${stats.errors}`);
    }

    // Delay between individual checks
    await sleep(DELAY_BETWEEN_CHECKS_MS);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Find Missing Cloudinary Images');
  console.log('='.repeat(60));

  // Verify credentials
  if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error('\nError: Missing Cloudinary credentials!');
    process.exit(1);
  }

  console.log(`\nCloud name: ${cloudinary.config().cloud_name}`);
  console.log(`Rate limiting: ${DELAY_BETWEEN_CHECKS_MS}ms between checks, ${DELAY_BETWEEN_BATCHES_MS}ms between batches of ${BATCH_SIZE}`);

  // Build list of all images per car
  const mdFiles = fs.readdirSync(BUILDS_DIR).filter(f => f.endsWith('.md'));
  console.log(`\nScanning ${mdFiles.length} markdown files...`);

  const allImages = [];
  for (const file of mdFiles) {
    const slug = getCarSlug(file);
    const filePath = path.join(BUILDS_DIR, file);
    const images = extractImagesFromFile(filePath);

    for (const img of images) {
      allImages.push({
        car: slug,
        ...img
      });
    }
  }

  // Deduplicate by publicId
  const uniqueImages = [];
  const seenPublicIds = new Set();
  for (const img of allImages) {
    if (!seenPublicIds.has(img.publicId)) {
      seenPublicIds.add(img.publicId);
      uniqueImages.push(img);
    }
  }

  console.log(`Total image references: ${allImages.length}`);
  console.log(`Unique images to check: ${uniqueImages.length}`);

  const estimatedMinutes = Math.ceil((uniqueImages.length * (DELAY_BETWEEN_CHECKS_MS + 50) +
    Math.ceil(uniqueImages.length / BATCH_SIZE) * DELAY_BETWEEN_BATCHES_MS) / 60000);
  console.log(`Estimated time: ~${estimatedMinutes} minutes`);
  console.log('\nStarting Cloudinary checks...\n');

  // Process in batches
  const missingImages = [];
  const stats = { checked: 0, found: 0, missing: 0, errors: 0, total: uniqueImages.length };

  for (let i = 0; i < uniqueImages.length; i += BATCH_SIZE) {
    const batch = uniqueImages.slice(i, i + BATCH_SIZE);
    await processBatch(batch, missingImages, stats);

    // Delay between batches (except for last batch)
    if (i + BATCH_SIZE < uniqueImages.length) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  // Final progress
  console.log(`\n[${stats.checked}/${stats.total}] COMPLETE | Found: ${stats.found} | Missing: ${stats.missing}`);

  // Save results
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(missingImages, null, 2), 'utf8');

  // Group by car for reporting
  const byCar = {};
  for (const img of missingImages) {
    byCar[img.car] = (byCar[img.car] || 0) + 1;
  }

  // Report
  console.log('\n' + '='.repeat(60));
  console.log('SCAN COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total images checked: ${stats.checked}`);
  console.log(`Found in Cloudinary:  ${stats.found}`);
  console.log(`Missing:              ${stats.missing}`);
  if (stats.errors > 0) {
    console.log(`API errors:           ${stats.errors}`);
  }
  console.log(`\nResults saved to: ${OUTPUT_FILE}`);

  // Show cars with most missing
  const sortedCars = Object.entries(byCar)
    .sort((a, b) => b[1] - a[1]);

  if (sortedCars.length > 0) {
    console.log('\n--- Cars with Missing Images ---');
    sortedCars.forEach(([car, count]) => {
      console.log(`  ${car}: ${count}`);
    });
    console.log(`\nTotal cars affected: ${sortedCars.length}`);
  } else {
    console.log('\nNo missing images found!');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
