#!/usr/bin/env node
/**
 * Find missing images in Cloudinary
 *
 * Scans all markdown files, extracts image URLs, and checks which ones
 * don't exist in Cloudinary. Outputs a JSON list of missing images.
 *
 * Usage:
 *   node src/scripts/find-missing-images.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Paths
const BUILDS_DIR = path.join(__dirname, '..', 'builds');
const OUTPUT_FILE = path.join(__dirname, 'missing-images.json');
const CLOUDINARY_FOLDER = 'cookersvdubs';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'ds3b5nqnd',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Extract car slug from markdown filename
 */
function getCarSlug(mdFilename) {
  return mdFilename.replace('.md', '');
}

/**
 * Extract all image filenames from a markdown file
 * Returns array of { filename, isInSubfolder }
 */
function extractImagesFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const images = [];

  // Match Cloudinary URLs
  const urlPattern = /https:\/\/res\.cloudinary\.com\/ds3b5nqnd\/image\/upload\/v\d+\/cookersvdubs\/([^"'\s\n]+)/g;

  let match;
  while ((match = urlPattern.exec(content)) !== null) {
    const fullPath = match[1];

    // Check if already in a subfolder
    if (fullPath.includes('/')) {
      // Already organized - extract just filename
      const parts = fullPath.split('/');
      images.push({
        filename: parts[parts.length - 1],
        subfolder: parts.slice(0, -1).join('/'),
        isInSubfolder: true
      });
    } else {
      images.push({
        filename: fullPath,
        subfolder: null,
        isInSubfolder: false
      });
    }
  }

  return images;
}

/**
 * Check if an image exists in Cloudinary
 */
async function checkImageExists(publicId) {
  try {
    await cloudinary.api.resource(publicId);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Build complete list of images per car
 */
function buildCarImageList() {
  const carImages = {};
  const mdFiles = fs.readdirSync(BUILDS_DIR).filter(f => f.endsWith('.md'));

  console.log(`Scanning ${mdFiles.length} markdown files...`);

  for (const file of mdFiles) {
    const slug = getCarSlug(file);
    const filePath = path.join(BUILDS_DIR, file);
    const images = extractImagesFromFile(filePath);

    if (images.length > 0) {
      // Deduplicate images for this car
      const uniqueImages = [];
      const seen = new Set();
      for (const img of images) {
        if (!seen.has(img.filename)) {
          seen.add(img.filename);
          uniqueImages.push(img);
        }
      }
      carImages[slug] = uniqueImages;
    }
  }

  return carImages;
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

  // Build car image list
  const carImages = buildCarImageList();
  const carCount = Object.keys(carImages).length;
  const totalImages = Object.values(carImages).reduce((sum, imgs) => sum + imgs.length, 0);

  console.log(`\nFound ${carCount} cars with ${totalImages} unique images`);

  // Check each image
  const missingImages = [];
  let checked = 0;
  let missing = 0;
  let found = 0;

  console.log('\nChecking images in Cloudinary...\n');

  for (const [carSlug, images] of Object.entries(carImages)) {
    const carMissing = [];

    for (const img of images) {
      checked++;

      // Build public_id to check
      const filenameWithoutExt = path.parse(img.filename).name;

      // First check if it's in the car's subfolder (new location)
      const newPublicId = `${CLOUDINARY_FOLDER}/${carSlug}/${filenameWithoutExt}`;
      let exists = await checkImageExists(newPublicId);

      // If not in subfolder, check flat folder (old location)
      if (!exists) {
        const oldPublicId = `${CLOUDINARY_FOLDER}/${filenameWithoutExt}`;
        exists = await checkImageExists(oldPublicId);
      }

      if (exists) {
        found++;
      } else {
        missing++;
        carMissing.push(img.filename);
        missingImages.push({
          car: carSlug,
          filename: img.filename
        });
      }

      // Progress update every 100 images
      if (checked % 100 === 0) {
        console.log(`Progress: ${checked}/${totalImages} checked, ${missing} missing, ${found} found`);
      }
    }

    if (carMissing.length > 0) {
      console.log(`  ${carSlug}: ${carMissing.length} missing`);
    }
  }

  // Save results
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(missingImages, null, 2), 'utf8');

  // Report
  console.log('\n' + '='.repeat(60));
  console.log('SCAN COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total images checked: ${checked}`);
  console.log(`Found in Cloudinary:  ${found}`);
  console.log(`Missing:              ${missing}`);
  console.log(`\nMissing images saved to: ${OUTPUT_FILE}`);

  // Show cars with most missing
  const carMissingCounts = {};
  for (const img of missingImages) {
    carMissingCounts[img.car] = (carMissingCounts[img.car] || 0) + 1;
  }

  const sortedCars = Object.entries(carMissingCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (sortedCars.length > 0) {
    console.log('\n--- Cars with Most Missing Images ---');
    sortedCars.forEach(([car, count]) => {
      console.log(`  ${car}: ${count} missing`);
    });
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
