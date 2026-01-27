const fs = require('fs');
const path = require('path');

// Mappatura caratteri corrotti -> caratteri corretti
const replacements = [
  // Box drawing characters (linee) - pattern specifici trovati nel file
  [/â"\x81/g, '━'],  // Heavy horizontal (e2 201d 81)
  [/â"€/g, '─'],     // Light horizontal (e2 201d 20ac)
  [/â•/g, '═'],      // Double horizontal
  [/â"/g, '━'],      // Fallback per heavy horizontal

  // Warning emoji - pattern specifico trovato
  [/âš\s*ï¸\x8F/g, '⚠️'],  // Warning sign con spazio e varianti
  [/âš ï¸/g, '⚠️'],        // Warning sign standard
  [/âš\s+ï¸/g, '⚠️'],      // Warning sign con spazio

  // Altri emoji
  [/ðŸ"/g, '📋'],     // Clipboard
  [/ðŸ"¤/g, '📤'],     // Outbox
  [/ðŸ"¥/g, '📥'],     // Inbox
  [/ðŸ–¼ï¸/g, '🖼️'],   // Framed picture
  [/ðŸ"‚/g, '📂'],     // Open folder
  [/ðŸ'¡/g, '💡'],     // Light bulb
  [/ðŸ¤–/g, '🤖'],     // Robot
  [/âœ…/g, '✅'],     // Check mark
  [/âŒ/g, '❌'],      // Cross mark
  [/â­/g, '⭐'],      // Star

  // Frecce e simboli
  [/âžœ/g, '➜'],     // Right arrow
  [/â‡'/g, '⇒'],     // Right double arrow

  // Punteggiatura
  [/â€™/g, "'"],     // Right single quote
  [/â€œ/g, '"'],     // Left double quote
  [/â€/g, '"'],      // Right double quote
  [/â€¦/g, '…'],     // Ellipsis
  [/¦"/g, '..."'],   // Corrupted ellipsis with quote
  [/¦/g, '...'],     // Corrupted ellipsis
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
    let changeCount = 0;

    replacements.forEach(([pattern, replacement]) => {
      const before = content;
      content = content.replace(pattern, replacement);
      if (content !== before) {
        changeCount++;
      }
    });

    if (content !== originalContent) {
      fs.writeFileSync(filepath, content, 'utf8');
      console.log(`✅ Fixed: ${filepath} (${changeCount} patterns matched)`);
      totalFixed++;
    } else {
      console.log(`✓ No changes needed: ${filepath}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filepath}:`, error.message);
  }
});

console.log(`\nTotal files fixed: ${totalFixed}`);
