#!/usr/bin/env node

/**
 * Generate PWA icons from SVG source
 * Requires: sharp (npm install sharp)
 */

import fs from 'node:fs';
import path from 'node:path';

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, '..', 'public', 'icons');
const svgPath = path.join(iconsDir, 'icon.svg');

async function generateIcons() {
  try {
    // Try to use sharp if available
    const { default: sharp } = await import('sharp');
    
    if (!fs.existsSync(svgPath)) {
      console.error('SVG icon not found at:', svgPath);
      process.exit(1);
    }

    console.log('Generating icons from SVG...');
    
    for (const size of sizes) {
      const outputPath = path.join(iconsDir, `icon-${size}x${size}.png`);
      await sharp(svgPath)
        .resize(size, size)
        .png()
        .toFile(outputPath);
      console.log(`✓ Generated ${size}x${size}`);
    }
    
    console.log('All icons generated successfully!');
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log('sharp not installed. Creating placeholder icons...');
      console.log('To generate proper icons, run: npm install sharp');
      createPlaceholderIcons();
    } else {
      console.error('Error generating icons:', error);
      process.exit(1);
    }
  }
}

function createPlaceholderIcons() {
  // Create a simple script that can be run with Node.js Canvas or similar
  // For now, we'll create a note in the directory
  const readmePath = path.join(iconsDir, 'README.txt');
  const readme = `PWA Icons Directory

To generate icons:
1. Install sharp: npm install sharp
2. Run: node scripts/generate-icons.js

Or manually create PNG files with these sizes:
${sizes.map(s => `- icon-${s}x${s}.png`).join('\n')}

The source SVG is at: icon.svg
`;
  fs.writeFileSync(readmePath, readme);
  console.log('Created README.txt with instructions');
}

if (require.main === module) {
  generateIcons();
}

module.exports = { generateIcons };
