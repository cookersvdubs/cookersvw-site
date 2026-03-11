#!/usr/bin/env node
/**
 * Reorganize Cloudinary images into per-car subfolders
 *
 * Moves images from cookersvdubs/filename to cookersvdubs/{car-slug}/filename
 * based on which car's markdown file references each image.
 *
 * Usage:
 *   node src/scripts/reorganize-cloudinary.js                    # Process all cars
 *   node src/scripts/reorganize-cloudinary.js --car=1955-ragtop  # Process one car only
 *   node src/scripts/reorganize-cloudinary.js --dry              # Dry run, no moves
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Paths
const BUILDS_DIR = path.join(__dirname, '..', 'builds');
const MAP_FILE = path.join(__dirname, 'cloudinary-map.json');
const REORGANIZED_MAP_FILE = path.join(__dirname, 'cloudinary-reorganized-map.json');
const MISSING_IMAGES_FILE = path.join(__dirname, 'missing-images.json');
const CLOUDINARY_FOLDER = 'cookersvdubs';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'ds3b5nqnd',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Parse command line args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry');
const carArg = args.find(a => a.startsWith('--car='));
const SINGLE_CAR = carArg ? carArg.split('=')[1] : null;

/**
 * Extract car slug from markdown filename
 */
function getCarSlug(mdFilename) {
  return mdFilename.replace('.md', '');
}

/**
 * Extract all Cloudinary image URLs from a markdown file
 * Returns array of { filename, url, version }
 */
function extractImagesFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const images = [];

  // Match Cloudinary URLs: https://res.cloudinary.com/ds3b5nqnd/image/upload/v{version}/cookersvdubs/{filename}
  const urlPattern = /https:\/\/res\.cloudinary\.com\/ds3b5nqnd\/image\/upload\/v(\d+)\/cookersvdubs\/([^"'\s\n]+)/g;

  let match;
  while ((match = urlPattern.exec(content)) !== null) {
    const version = match[1];
    const filename = match[2];

    // Skip if already in a subfolder (contains /)
    if (filename.includes('/')) {
      continue;
    }

    images.push({
      url: match[0],
      version,
      filename
    });
  }

  return images;
}

/**
 * Build mapping of car slugs to their images
 */
function buildCarImageMap() {
  const carImageMap = {};
  const mdFiles = fs.readdirSync(BUILDS_DIR).filter(f => f.endsWith('.md'));

  console.log(`Scanning ${mdFiles.length} markdown files...`);

  for (const file of mdFiles) {
    const slug = getCarSlug(file);
    const filePath = path.join(BUILDS_DIR, file);
    const images = extractImagesFromFile(filePath);

    if (images.length > 0) {
      carImageMap[slug] = images;
    }
  }

  return carImageMap;
}

/**
 * Move a single image to car subfolder
 */
async function moveImage(image, carSlug) {
  const { filename, version } = image;

  // Get public_id without extension
  const filenameWithoutExt = path.parse(filename).name;
  const extension = path.parse(filename).ext;

  const fromPublicId = `${CLOUDINARY_FOLDER}/${filenameWithoutExt}`;
  const toPublicId = `${CLOUDINARY_FOLDER}/${carSlug}/${filenameWithoutExt}`;

  // Build new URL
  const newUrl = `https://res.cloudinary.com/ds3b5nqnd/image/upload/v${version}/${CLOUDINARY_FOLDER}/${carSlug}/${filename}`;

  if (DRY_RUN) {
    return {
      status: 'dry-run',
      oldUrl: image.url,
      newUrl,
      fromPublicId,
      toPublicId
    };
  }

  try {
    // Use rename to move the image
    await cloudinary.uploader.rename(fromPublicId, toPublicId, {
      overwrite: false
    });

    return {
      status: 'moved',
      oldUrl: image.url,
      newUrl,
      fromPublicId,
      toPublicId
    };
  } catch (error) {
    // Check if it's already moved (doesn't exist at source)
    if (error.message && error.message.includes('not found')) {
      // Check if it exists at destination
      try {
        await cloudinary.api.resource(toPublicId);
        return {
          status: 'already-moved',
          oldUrl: image.url,
          newUrl,
          fromPublicId,
          toPublicId
        };
      } catch (destError) {
        return {
          status: 'failed',
          oldUrl: image.url,
          error: `Source not found and destination doesn't exist: ${error.message}`
        };
      }
    }

    return {
      status: 'failed',
      oldUrl: image.url,
      error: error.message
    };
  }
}

/**
 * Process a single car
 */
async function processCar(carSlug, images, urlMap, results) {
  console.log(`\n--- ${carSlug} (${images.length} images) ---`);

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const progress = `  [${i + 1}/${images.length}]`;

    const result = await moveImage(image, carSlug);

    switch (result.status) {
      case 'moved':
        urlMap[result.oldUrl] = result.newUrl;
        results.moved++;
        console.log(`${progress} MOVED: ${image.filename}`);
        break;
      case 'already-moved':
        urlMap[result.oldUrl] = result.newUrl;
        results.skipped++;
        console.log(`${progress} SKIPPED: ${image.filename} (already in subfolder)`);
        break;
      case 'dry-run':
        urlMap[result.oldUrl] = result.newUrl;
        results.dryRun++;
        console.log(`${progress} DRY-RUN: ${image.filename}`);
        console.log(`           FROM: ${result.fromPublicId}`);
        console.log(`           TO:   ${result.toPublicId}`);
        break;
      case 'failed':
        results.failed++;
        results.failures.push({ carSlug, filename: image.filename, error: result.error });
        console.log(`${progress} FAILED: ${image.filename} - ${result.error}`);
        break;
    }
  }
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Cloudinary Image Reorganization Script');
  console.log('='.repeat(60));

  // Verify credentials
  if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error('\nError: Missing Cloudinary credentials!');
    console.error('Please ensure .env file exists at deploy/site/.env with:');
    console.error('  CLOUDINARY_CLOUD_NAME=ds3b5nqnd');
    console.error('  CLOUDINARY_API_KEY=your_api_key');
    console.error('  CLOUDINARY_API_SECRET=your_api_secret');
    process.exit(1);
  }

  console.log(`\nCloud name: ${cloudinary.config().cloud_name}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : SINGLE_CAR ? `SINGLE CAR (${SINGLE_CAR})` : 'FULL MIGRATION'}`);

  // Build car to image mapping
  const carImageMap = buildCarImageMap();

  // Filter to single car if specified
  let carsToProcess = Object.keys(carImageMap);
  if (SINGLE_CAR) {
    if (!carImageMap[SINGLE_CAR]) {
      console.error(`\nError: Car '${SINGLE_CAR}' not found.`);
      console.error('Available cars:');
      carsToProcess.slice(0, 10).forEach(c => console.error(`  - ${c}`));
      if (carsToProcess.length > 10) {
        console.error(`  ... and ${carsToProcess.length - 10} more`);
      }
      process.exit(1);
    }
    carsToProcess = [SINGLE_CAR];
  }

  // Count total images
  const totalImages = carsToProcess.reduce((sum, car) => sum + carImageMap[car].length, 0);
  console.log(`\nCars to process: ${carsToProcess.length}`);
  console.log(`Total images: ${totalImages}`);

  // Track URL mapping and results
  const urlMap = {};
  const results = {
    moved: 0,
    skipped: 0,
    failed: 0,
    dryRun: 0,
    failures: []
  };

  // Process each car
  console.log('\nProcessing...');

  for (const carSlug of carsToProcess) {
    await processCar(carSlug, carImageMap[carSlug], urlMap, results);

    // Save progress periodically
    if (!DRY_RUN && (results.moved + results.skipped) % 100 === 0 && (results.moved + results.skipped) > 0) {
      fs.writeFileSync(REORGANIZED_MAP_FILE, JSON.stringify(urlMap, null, 2), 'utf8');
      console.log(`\n--- Saved progress (${results.moved + results.skipped} processed) ---`);
    }
  }

  // Save final mapping
  fs.writeFileSync(REORGANIZED_MAP_FILE, JSON.stringify(urlMap, null, 2), 'utf8');

  // Save missing images list (deduplicated)
  const uniqueFailures = [];
  const seenFilenames = new Set();
  for (const f of results.failures) {
    const key = `${f.carSlug}/${f.filename}`;
    if (!seenFilenames.has(key)) {
      seenFilenames.add(key);
      uniqueFailures.push({ car: f.carSlug, filename: f.filename });
    }
  }
  fs.writeFileSync(MISSING_IMAGES_FILE, JSON.stringify(uniqueFailures, null, 2), 'utf8');

  // Report
  console.log('\n' + '='.repeat(60));
  console.log('REORGANIZATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total images:  ${totalImages}`);
  console.log(`Moved:         ${results.moved}`);
  console.log(`Skipped:       ${results.skipped}`);
  console.log(`Failed:        ${results.failed}`);
  if (DRY_RUN) {
    console.log(`Dry run:       ${results.dryRun}`);
  }
  console.log(`\nURL mapping saved to: ${REORGANIZED_MAP_FILE}`);
  console.log(`Total mappings: ${Object.keys(urlMap).length}`);
  console.log(`\nMissing images saved to: ${MISSING_IMAGES_FILE}`);
  console.log(`Unique missing images: ${uniqueFailures.length}`);

  // Show failures
  if (results.failures.length > 0) {
    console.log('\n--- Failures ---');
    results.failures.slice(0, 10).forEach(f => {
      console.log(`  ${f.carSlug}/${f.filename}: ${f.error}`);
    });
    if (results.failures.length > 10) {
      console.log(`  ... and ${results.failures.length - 10} more`);
    }
  }

  // Show sample mappings
  const mappings = Object.entries(urlMap).slice(0, 3);
  if (mappings.length > 0) {
    console.log('\n--- Sample URL Mappings ---');
    mappings.forEach(([oldUrl, newUrl]) => {
      console.log(`  OLD: ${oldUrl}`);
      console.log(`  NEW: ${newUrl}`);
      console.log('');
    });
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
