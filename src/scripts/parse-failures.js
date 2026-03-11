#!/usr/bin/env node
/**
 * Parse reorganization output to extract failures
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, 'reorg-output.txt');
const OUTPUT_FILE = path.join(__dirname, 'missing-images.json');

const content = fs.readFileSync(INPUT_FILE, 'utf8');
const lines = content.split('\n');

let currentCar = null;
const failures = [];
const seen = new Set();

for (const line of lines) {
  // Match car header: --- carname (N images) ---
  const carMatch = line.match(/^--- ([^\s]+) \(\d+ images\) ---$/);
  if (carMatch) {
    currentCar = carMatch[1];
    continue;
  }

  // Match failure line: [N/M] FAILED: filename.jpg - ...
  const failMatch = line.match(/FAILED: ([^\s]+) -/);
  if (failMatch && currentCar) {
    const filename = failMatch[1];
    const key = `${currentCar}/${filename}`;

    // Deduplicate
    if (!seen.has(key)) {
      seen.add(key);
      failures.push({
        car: currentCar,
        filename: filename
      });
    }
  }
}

// Save to JSON
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(failures, null, 2), 'utf8');

console.log(`Extracted ${failures.length} unique missing images`);
console.log(`Saved to: ${OUTPUT_FILE}`);

// Show first 10
console.log('\nFirst 10 entries:');
failures.slice(0, 10).forEach((f, i) => {
  console.log(`  ${i + 1}. ${JSON.stringify(f)}`);
});
