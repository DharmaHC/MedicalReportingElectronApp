const fs = require('fs');
const path = require('path');

// Mappatura caratteri corrotti -> caratteri corretti
const replacements = [
  [/ðŸ"/g, '📋'],
  [/âœ…/g, '✅'],
  [/â­/g, '⭐'],
  [/ðŸ"¤/g, '📤'],
  [/ðŸ"¥/g, '📥'],
  [/âžœ/g, '➜'],
  [/â‡'/g, '⇒'],
  [/â€™/g, "'"],
  [/â€œ/g, '"'],
  [/â€/g, '"'],
  [/â€¦/g, '…'],
  [/âŒ/g, '❌'],
  [/â"/g, '━'],
  [/â"€/g, '─'],
  [/â•/g, '═'],
  [/âš ï¸/g, '⚠️'],
  [/ðŸ–¼ï¸/g, '🖼️'],
  [/ðŸ"‚/g, '📂'],
  [/ðŸ'¡/g, '💡'],
  [/ðŸ¤–/g, '🤖'],
  [/¦"/g, '..."'],
  [/¦/g, '...'],
];

const files = [
  'src/renderer/pages/EditorPage.tsx',
  'src/renderer/pages/Login.tsx',
  'src/renderer/pages/HomePage.tsx',
  'src/renderer/components/GestioneReferti.tsx',
];

let totalFixed = 0;

files.forEach(filepath => {
  if (!fs.existsSync(filepath)) {
    console.log(`Skipping ${filepath} - file not found`);
    return;
  }

  try {
    let content = fs.readFileSync(filepath, 'utf8');
    const originalContent = content;

    replacements.forEach(([pattern, replacement]) => {
      content = content.replace(pattern, replacement);
    });

    if (content !== originalContent) {
      fs.writeFileSync(filepath, content, 'utf8');
      console.log(`✅ Fixed: ${filepath}`);
      totalFixed++;
    } else {
      console.log(`✓ No changes needed: ${filepath}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filepath}:`, error.message);
  }
});

console.log(`\nTotal files fixed: ${totalFixed}`);
