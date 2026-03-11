#!/usr/bin/env node
/**
 * Test Cloudinary authentication
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('=== Cloudinary Auth Test ===\n');
console.log('Config:');
console.log('  cloud_name:', process.env.CLOUDINARY_CLOUD_NAME || '(not set)');
console.log('  api_key:', process.env.CLOUDINARY_API_KEY ? process.env.CLOUDINARY_API_KEY.slice(0, 6) + '...' : '(not set)');
console.log('  api_secret:', process.env.CLOUDINARY_API_SECRET ? '***' + process.env.CLOUDINARY_API_SECRET.slice(-4) : '(not set)');
console.log('');

async function test() {
  try {
    console.log('Testing: List first 5 resources in cookersvdubs folder...\n');

    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: 'cookersvdubs',
      max_results: 5
    });

    console.log('SUCCESS! Found', result.resources.length, 'resources:\n');
    result.resources.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.public_id}`);
    });

  } catch (error) {
    console.log('ERROR!\n');
    console.log('Error type:', error.constructor.name);
    console.log('Error message:', error.message);
    if (error.error) {
      console.log('Error details:', JSON.stringify(error.error, null, 2));
    }
    if (error.http_code) {
      console.log('HTTP code:', error.http_code);
    }
  }
}

test();
