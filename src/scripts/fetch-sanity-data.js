#!/usr/bin/env node
/**
 * Fetch car build data from Sanity CMS
 *
 * Connects to Sanity, fetches all carBuild documents,
 * transforms them to match Eleventy template format,
 * and saves to src/_data/builds.json
 *
 * Usage:
 *   node src/scripts/fetch-sanity-data.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@sanity/client');
const fs = require('fs');
const path = require('path');

// Sanity configuration
const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID || 'wa7rzamu';
const SANITY_DATASET = process.env.SANITY_DATASET || 'production';
const SANITY_API_VERSION = process.env.SANITY_API_VERSION || '2024-01-01';

// Output path - primary data source for Eleventy
const OUTPUT_FILE = path.join(__dirname, '../_data/builds.json');

// Create Sanity client (no token needed for public read)
const client = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  apiVersion: SANITY_API_VERSION,
  useCdn: true // Use CDN for faster reads
});

/**
 * Transform Sanity document to Eleventy-compatible format
 */
function transformBuild(doc) {
  // Hero image - stored as direct URL string in Sanity
  const heroImage = typeof doc.heroImage === 'string'
    ? doc.heroImage
    : (doc.heroImage?.secure_url || doc.heroImage?.url || null);

  // Gallery - images stored as direct URL strings
  const gallery = (doc.gallery || [])
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((item, index) => {
      const imageUrl = typeof item.image === 'string'
        ? item.image
        : (item.image?.secure_url || item.image?.url || '');
      return {
        image: imageUrl,
        caption: item.caption || '',
        sort_order: item.sortOrder ?? index
      };
    })
    .filter(item => item.image); // Remove items without images

  return {
    // Core fields
    title: doc.title || 'Untitled Build',
    slug: doc.slug?.current || doc._id,
    status: doc.status || 'completed',
    model: doc.model || 'Beetle',
    description: doc.description || '',
    featured: doc.featured || false,

    // Images
    hero_image: heroImage,
    gallery: gallery,

    // Computed permalink for Eleventy
    permalink: `cars/${doc.slug?.current || doc._id}.html`,

    // Metadata
    _id: doc._id,
    _updatedAt: doc._updatedAt
  };
}

/**
 * Main fetch function
 */
async function fetchSanityData() {
  console.log('='.repeat(50));
  console.log('Fetching data from Sanity CMS');
  console.log('='.repeat(50));
  console.log(`\nProject: ${SANITY_PROJECT_ID}`);
  console.log(`Dataset: ${SANITY_DATASET}`);

  try {
    // Fetch all published carBuild documents
    const query = `*[_type == "carBuild" && !(_id in path("drafts.**"))]{
      _id,
      _updatedAt,
      title,
      slug,
      status,
      model,
      description,
      featured,
      heroImage,
      gallery
    } | order(title asc)`;

    console.log('\nFetching carBuild documents...');
    const documents = await client.fetch(query);

    console.log(`\nFound ${documents.length} published carBuild documents`);

    // Transform documents
    const builds = documents.map(transformBuild);

    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save to JSON file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(builds, null, 2), 'utf8');

    console.log(`\nSaved to: ${OUTPUT_FILE}`);
    console.log(`Total builds: ${builds.length}`);

    // Show sample
    if (builds.length > 0) {
      console.log('\n--- Sample Build ---');
      const sample = builds[0];
      console.log(`  Title: ${sample.title}`);
      console.log(`  Slug: ${sample.slug}`);
      console.log(`  Status: ${sample.status}`);
      console.log(`  Gallery: ${sample.gallery.length} images`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('Fetch complete!');
    console.log('='.repeat(50));

    return builds;

  } catch (error) {
    console.error('\nError fetching from Sanity:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  fetchSanityData();
}

module.exports = { fetchSanityData };
