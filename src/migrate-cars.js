#!/usr/bin/env node
/**
 * Migration Script: Convert static HTML car pages to Eleventy markdown
 *
 * Reads existing HTML files from deploy/site/cars/ and creates
 * corresponding markdown files in src/builds/ with proper front matter.
 */

const fs = require('fs');
const path = require('path');

// Paths
const HTML_DIR = path.join(__dirname, '..', 'cars');
const OUTPUT_DIR = path.join(__dirname, 'builds');
const SKIP_FILES = ['1955-ragtop.md']; // Already migrated

// Status mapping from HTML class to markdown value
const STATUS_MAP = {
  'status-complete': 'completed',
  'status-progress': 'in-progress',
  'status-personal': 'personal-ride',
  'status-new': 'completed' // Treat "newly saved" as completed
};

// Category extraction mapping
const CATEGORY_TO_MODEL = {
  'Beetle': 'Beetle',
  'Bus': 'Bus-Transporter',
  'Bus / Transporter': 'Bus-Transporter',
  'Karmann Ghia': 'Karmann-Ghia',
  'Type 3': 'Type-3',
  'Single Cab': 'Single-Cab',
  'Double Cab': 'Double-Cab',
  'Thing': 'Thing',
  'Custom / Hot Rod': 'Custom-Hot-Rod',
  'Porsche 356': 'Porsche-356',
  'Panel': 'Panel-Van',
  'Panel Van': 'Panel-Van'
};

/**
 * Extract data from HTML content
 */
function extractCarData(html, filename) {
  const data = {
    title: '',
    status: 'completed',
    model: 'Beetle',
    description: '',
    hero_image: '',
    gallery: []
  };

  // Extract title from <title> tag
  const titleMatch = html.match(/<title>([^—<]+)/);
  if (titleMatch) {
    data.title = titleMatch[1].trim();
  }

  // Extract title from h1 if not found
  if (!data.title) {
    const h1Match = html.match(/<h1[^>]*>([^<]+)</);
    if (h1Match) {
      data.title = h1Match[1].trim();
    }
  }

  // Extract status from card-status class
  const statusMatch = html.match(/class="card-status\s+(status-\w+)"/);
  if (statusMatch) {
    data.status = STATUS_MAP[statusMatch[1]] || 'completed';
  }

  // Check breadcrumb for status hint (more specific - look in breadcrumb div only)
  const breadcrumbMatch = html.match(/<div class="car-breadcrumb">[\s\S]*?<\/div>/);
  if (breadcrumbMatch) {
    const breadcrumb = breadcrumbMatch[0];
    if (breadcrumb.includes('>In Progress<') || breadcrumb.includes('the-cars.html">In Progress')) {
      data.status = 'in-progress';
    } else if (breadcrumb.includes('>Personal<') || breadcrumb.includes('#personal">Personal')) {
      data.status = 'personal-ride';
    } else if (breadcrumb.includes('>Our Work<') || breadcrumb.includes('our-work.html">Our Work')) {
      data.status = 'completed';
    }
  }

  // Extract category from the hero section
  // Look for the category label near the status badge
  const categoryMatch = html.match(/letter-spacing:3px;text-transform:uppercase;color:rgba\(245,240,232,\.5\);">([^<]+)</);
  if (categoryMatch) {
    const cat = categoryMatch[1].trim();
    data.model = CATEGORY_TO_MODEL[cat] || 'Beetle';
  }

  // Alternative category extraction from breadcrumb
  if (!categoryMatch) {
    const breadcrumbCatMatch = html.match(/our-work\.html\?cat=([^#"]+)/);
    if (breadcrumbCatMatch) {
      const cat = decodeURIComponent(breadcrumbCatMatch[1]).replace(/\+/g, ' ');
      data.model = CATEGORY_TO_MODEL[cat] || 'Beetle';
    }
  }

  // Extract hero image
  const heroMatch = html.match(/<div class="car-hero">[\s\S]*?<img src="\.\.\/optimized_images\/([^"]+)"/);
  if (heroMatch) {
    data.hero_image = heroMatch[1];
  }

  // Extract all gallery images from thumb-item elements
  const thumbRegex = /data-src="\.\.\/optimized_images\/([^"]+)"/g;
  let match;
  let sortOrder = 0;
  while ((match = thumbRegex.exec(html)) !== null) {
    data.gallery.push({
      image: match[1],
      caption: '',
      sort_order: sortOrder++
    });
  }

  // If no hero image but we have gallery, use first gallery image
  if (!data.hero_image && data.gallery.length > 0) {
    data.hero_image = data.gallery[0].image;
  }

  return data;
}

/**
 * Generate markdown front matter
 */
function generateMarkdown(data, slug) {
  let md = '---\n';
  md += 'layout: layouts/car.njk\n';
  md += `title: "${data.title.replace(/"/g, '\\"')}"\n`;
  md += `status: "${data.status}"\n`;
  md += `model: "${data.model}"\n`;
  md += `description: "${data.description}"\n`;
  md += `hero_image: "${data.hero_image}"\n`;
  md += 'featured: false\n';
  md += `permalink: "cars/${slug}.html"\n`;
  md += 'gallery:\n';

  for (const photo of data.gallery) {
    md += `  - image: "${photo.image}"\n`;
    md += `    caption: ""\n`;
    md += `    sort_order: ${photo.sort_order}\n`;
  }

  md += '---\n';

  return md;
}

/**
 * Main migration function
 */
function migrate() {
  console.log('Starting car page migration...\n');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Get all HTML files
  const htmlFiles = fs.readdirSync(HTML_DIR)
    .filter(f => f.endsWith('.html'));

  console.log(`Found ${htmlFiles.length} HTML files to process\n`);

  let migrated = 0;
  let skipped = 0;
  let errors = [];

  for (const htmlFile of htmlFiles) {
    const slug = htmlFile.replace('.html', '');
    const mdFile = `${slug}.md`;

    // Skip already migrated files
    if (SKIP_FILES.includes(mdFile)) {
      console.log(`SKIP: ${mdFile} (already exists)`);
      skipped++;
      continue;
    }

    // Check if markdown already exists
    const outputPath = path.join(OUTPUT_DIR, mdFile);
    if (fs.existsSync(outputPath)) {
      console.log(`SKIP: ${mdFile} (file exists)`);
      skipped++;
      continue;
    }

    try {
      // Read HTML file
      const htmlPath = path.join(HTML_DIR, htmlFile);
      const html = fs.readFileSync(htmlPath, 'utf8');

      // Extract data
      const data = extractCarData(html, htmlFile);

      // Validate extraction
      if (!data.title) {
        throw new Error('Could not extract title');
      }
      if (data.gallery.length === 0) {
        throw new Error('Could not extract gallery images');
      }

      // Generate markdown
      const markdown = generateMarkdown(data, slug);

      // Write markdown file
      fs.writeFileSync(outputPath, markdown, 'utf8');

      console.log(`OK: ${mdFile} (${data.gallery.length} photos, ${data.status}, ${data.model})`);
      migrated++;

    } catch (err) {
      console.log(`ERROR: ${htmlFile} - ${err.message}`);
      errors.push({ file: htmlFile, error: err.message });
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('MIGRATION COMPLETE');
  console.log('========================================');
  console.log(`Total HTML files: ${htmlFiles.length}`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\nFiles with errors:');
    errors.forEach(e => console.log(`  - ${e.file}: ${e.error}`));
  }

  return { migrated, skipped, errors };
}

// Run migration
migrate();
