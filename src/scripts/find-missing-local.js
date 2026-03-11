#!/usr/bin/env node
/**
 * Find missing images by comparing markdown files against reorganized map
 * Then search the original scrape directory for recoverable images
 * NO Cloudinary API calls - works entirely from local data
 */

const fs = require('fs');
const path = require('path');

// Paths
const BUILDS_DIR = path.join(__dirname, '..', 'builds');
const REORGANIZED_MAP_FILE = path.join(__dirname, 'cloudinary-reorganized-map.json');
const OUTPUT_FILE = path.join(__dirname, 'missing-images.json');
const ORIGINAL_SCRAPE_DIR = 'C:\\Users\\thisi\\projects\\cookersvdubs-scraper\\cookersvdubs_static';

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

  // Match Cloudinary URLs
  const urlPattern = /https:\/\/res\.cloudinary\.com\/ds3b5nqnd\/image\/upload\/v\d+\/cookersvdubs\/([^"'\s\n]+)/g;

  let match;
  while ((match = urlPattern.exec(content)) !== null) {
    const fullPath = match[1];
    const url = match[0];

    // Extract just the filename
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
 * Recursively find all files matching a filename in a directory
 */
function findFileRecursive(dir, targetFilename, results = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        findFileRecursive(fullPath, targetFilename, results);
      } else if (entry.name.toLowerCase() === targetFilename.toLowerCase()) {
        results.push(fullPath);
      }
    }
  } catch (err) {
    // Skip directories we can't read
  }

  return results;
}

/**
 * Main function
 */
function main() {
  console.log('='.repeat(60));
  console.log('Find Missing Images (Local Data Only)');
  console.log('='.repeat(60));

  // Step 1: Load reorganized map
  console.log('\nStep 1: Loading reorganized map...');
  let reorganizedMap = {};
  if (fs.existsSync(REORGANIZED_MAP_FILE)) {
    reorganizedMap = JSON.parse(fs.readFileSync(REORGANIZED_MAP_FILE, 'utf8'));
    console.log(`  Loaded ${Object.keys(reorganizedMap).length} entries`);
  } else {
    console.error('  ERROR: Reorganized map not found!');
    process.exit(1);
  }

  // Build set of all URLs that are in the map (both keys and values)
  const processedUrls = new Set();
  for (const [oldUrl, newUrl] of Object.entries(reorganizedMap)) {
    processedUrls.add(oldUrl);
    processedUrls.add(newUrl);
  }

  // Step 2: Extract all images from markdown files
  console.log('\nStep 2: Scanning markdown files...');
  const mdFiles = fs.readdirSync(BUILDS_DIR).filter(f => f.endsWith('.md'));
  console.log(`  Found ${mdFiles.length} markdown files`);

  const allImages = [];
  for (const file of mdFiles) {
    const slug = getCarSlug(file);
    const filePath = path.join(BUILDS_DIR, file);
    const images = extractImagesFromFile(filePath);

    for (const img of images) {
      allImages.push({
        car: slug,
        url: img.url,
        filename: img.filename
      });
    }
  }
  console.log(`  Found ${allImages.length} total image references`);

  // Step 3: Find missing images (URLs not in the reorganized map)
  console.log('\nStep 3: Identifying missing images...');
  const missingImages = [];
  const seenMissing = new Set();

  // NOTE: Exclude 1955-ragtop - we know those exist (moved in test run, not in current map)
  const KNOWN_GOOD_CARS = new Set(['1955-ragtop']);

  for (const img of allImages) {
    // Skip cars we know are good
    if (KNOWN_GOOD_CARS.has(img.car)) {
      continue;
    }

    // Check if this URL was processed
    if (!processedUrls.has(img.url)) {
      const key = `${img.car}/${img.filename}`;
      if (!seenMissing.has(key)) {
        seenMissing.add(key);
        missingImages.push({
          car: img.car,
          filename: img.filename
        });
      }
    }
  }
  console.log(`  (Excluding ${KNOWN_GOOD_CARS.size} cars known to be in Cloudinary already)`);
  console.log(`  Found ${missingImages.length} unique missing images`);

  // Step 4: Search original scrape for missing images
  console.log('\nStep 4: Searching original scrape directory...');
  console.log(`  Searching in: ${ORIGINAL_SCRAPE_DIR}`);

  if (!fs.existsSync(ORIGINAL_SCRAPE_DIR)) {
    console.error(`  ERROR: Original scrape directory not found!`);
  } else {
    let foundCount = 0;
    let notFoundCount = 0;
    const notFoundImages = [];

    for (let i = 0; i < missingImages.length; i++) {
      const img = missingImages[i];

      // Search for the file
      const foundPaths = findFileRecursive(ORIGINAL_SCRAPE_DIR, img.filename);

      if (foundPaths.length > 0) {
        foundCount++;
        img.found_in_scrape = true;
        img.scrape_paths = foundPaths;
      } else {
        notFoundCount++;
        img.found_in_scrape = false;
        notFoundImages.push(img);
      }

      // Progress
      if ((i + 1) % 50 === 0) {
        console.log(`    Progress: ${i + 1}/${missingImages.length} | Found: ${foundCount} | Not found: ${notFoundCount}`);
      }
    }

    console.log(`  Search complete: ${foundCount} found, ${notFoundCount} not found`);
  }

  // Save results
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(missingImages, null, 2), 'utf8');
  console.log(`\nResults saved to: ${OUTPUT_FILE}`);

  // Generate report
  console.log('\n' + '='.repeat(60));
  console.log('REPORT');
  console.log('='.repeat(60));

  const foundInScrape = missingImages.filter(img => img.found_in_scrape);
  const notFoundAnywhere = missingImages.filter(img => !img.found_in_scrape);

  console.log(`\nTotal missing images:        ${missingImages.length}`);
  console.log(`Found in original scrape:    ${foundInScrape.length}`);
  console.log(`Could not be found anywhere: ${notFoundAnywhere.length}`);

  // Group by car
  const byCar = {};
  for (const img of missingImages) {
    byCar[img.car] = byCar[img.car] || { total: 0, recoverable: 0 };
    byCar[img.car].total++;
    if (img.found_in_scrape) {
      byCar[img.car].recoverable++;
    }
  }

  const sortedCars = Object.entries(byCar)
    .sort((a, b) => b[1].total - a[1].total);

  console.log('\n--- Cars Most Affected ---');
  sortedCars.slice(0, 20).forEach(([car, counts]) => {
    console.log(`  ${car}: ${counts.total} missing (${counts.recoverable} recoverable)`);
  });
  if (sortedCars.length > 20) {
    console.log(`  ... and ${sortedCars.length - 20} more cars`);
  }

  console.log(`\nTotal cars affected: ${sortedCars.length}`);

  // Show sample of unrecoverable images
  if (notFoundAnywhere.length > 0) {
    console.log('\n--- Sample Unrecoverable Images (first 15) ---');
    notFoundAnywhere.slice(0, 15).forEach(img => {
      console.log(`  ${img.car}/${img.filename}`);
    });
    if (notFoundAnywhere.length > 15) {
      console.log(`  ... and ${notFoundAnywhere.length - 15} more`);
    }
  }
}

main();
