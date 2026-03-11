#!/usr/bin/env node
/**
 * Build missing images list by comparing markdown files against reorganized map
 *
 * This is faster than checking Cloudinary API for each image.
 * Images in markdown that are NOT in the reorganized map are considered missing.
 *
 * Usage:
 *   node src/scripts/build-missing-list.js
 */

const fs = require('fs');
const path = require('path');

// Paths
const BUILDS_DIR = path.join(__dirname, '..', 'builds');
const REORGANIZED_MAP_FILE = path.join(__dirname, 'cloudinary-reorganized-map.json');
const MISSING_IMAGES_FILE = path.join(__dirname, 'missing-images.json');

/**
 * Extract car slug from markdown filename
 */
function getCarSlug(mdFilename) {
  return mdFilename.replace('.md', '');
}

/**
 * Extract all Cloudinary image URLs from a markdown file
 */
function extractImagesFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const images = [];

  // Match Cloudinary URLs (both flat and subfolder formats)
  const urlPattern = /https:\/\/res\.cloudinary\.com\/ds3b5nqnd\/image\/upload\/v\d+\/cookersvdubs\/([^"'\s\n]+)/g;

  let match;
  while ((match = urlPattern.exec(content)) !== null) {
    const fullPath = match[1];
    const url = match[0];

    // Extract just the filename (handle both flat and subfolder)
    let filename;
    if (fullPath.includes('/')) {
      const parts = fullPath.split('/');
      filename = parts[parts.length - 1];
    } else {
      filename = fullPath;
    }

    images.push({ url, filename });
  }

  return images;
}

/**
 * Main function
 */
function main() {
  console.log('='.repeat(60));
  console.log('Build Missing Images List');
  console.log('='.repeat(60));

  // Load reorganized map (contains successfully processed images)
  let reorganizedMap = {};
  if (fs.existsSync(REORGANIZED_MAP_FILE)) {
    reorganizedMap = JSON.parse(fs.readFileSync(REORGANIZED_MAP_FILE, 'utf8'));
    console.log(`\nLoaded ${Object.keys(reorganizedMap).length} entries from reorganized map`);
  } else {
    console.log('\nNo reorganized map found - treating all images as potentially missing');
  }

  // Create a set of all successfully processed URLs (both old and new)
  const processedUrls = new Set();
  for (const [oldUrl, newUrl] of Object.entries(reorganizedMap)) {
    processedUrls.add(oldUrl);
    processedUrls.add(newUrl);
  }

  // Also create a set of processed filenames for fallback checking
  const processedFilenames = new Set();
  for (const [oldUrl, newUrl] of Object.entries(reorganizedMap)) {
    // Extract filename from URL
    const match = oldUrl.match(/cookersvdubs\/([^"'\s\n\/]+)$/);
    if (match) {
      processedFilenames.add(match[1]);
    }
    const newMatch = newUrl.match(/cookersvdubs\/[^\/]+\/([^"'\s\n]+)$/);
    if (newMatch) {
      processedFilenames.add(newMatch[1]);
    }
  }

  console.log(`Processed filenames in map: ${processedFilenames.size}`);

  // Scan all markdown files
  const mdFiles = fs.readdirSync(BUILDS_DIR).filter(f => f.endsWith('.md'));
  console.log(`\nScanning ${mdFiles.length} markdown files...`);

  const missingImages = [];
  const seenMissing = new Set();
  let totalImages = 0;

  for (const file of mdFiles) {
    const slug = getCarSlug(file);
    const filePath = path.join(BUILDS_DIR, file);
    const images = extractImagesFromFile(filePath);

    for (const img of images) {
      totalImages++;

      // Check if this URL was processed OR if the filename is in processed set
      const isProcessed = processedUrls.has(img.url) || processedFilenames.has(img.filename);

      if (!isProcessed) {
        const key = `${slug}/${img.filename}`;
        if (!seenMissing.has(key)) {
          seenMissing.add(key);
          missingImages.push({
            car: slug,
            filename: img.filename
          });
        }
      }
    }
  }

  // Save missing images list
  fs.writeFileSync(MISSING_IMAGES_FILE, JSON.stringify(missingImages, null, 2), 'utf8');

  // Group by car for reporting
  const byCar = {};
  for (const img of missingImages) {
    byCar[img.car] = (byCar[img.car] || 0) + 1;
  }

  // Report
  console.log('\n' + '='.repeat(60));
  console.log('SCAN COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total image references in markdown: ${totalImages}`);
  console.log(`Successfully processed (in map):    ${processedFilenames.size}`);
  console.log(`Unique missing images:              ${missingImages.length}`);
  console.log(`\nMissing images saved to: ${MISSING_IMAGES_FILE}`);

  // Show cars with most missing
  const sortedCars = Object.entries(byCar)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  if (sortedCars.length > 0) {
    console.log('\n--- Cars with Most Missing Images ---');
    sortedCars.forEach(([car, count]) => {
      console.log(`  ${car}: ${count} missing`);
    });
    if (Object.keys(byCar).length > 15) {
      console.log(`  ... and ${Object.keys(byCar).length - 15} more cars with missing images`);
    }
  }

  // Show sample missing images
  if (missingImages.length > 0) {
    console.log('\n--- Sample Missing Images ---');
    missingImages.slice(0, 10).forEach(img => {
      console.log(`  ${img.car}/${img.filename}`);
    });
    if (missingImages.length > 10) {
      console.log(`  ... and ${missingImages.length - 10} more`);
    }
  }
}

main();
