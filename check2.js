const fs = require('fs');
const code = fs.readFileSync('web/app.js', 'utf8');

// Try parsing with a syntax error reporter
try {
  // Check for common patterns that break parsing
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // Check for async function expression
    if (lines[i].includes('async function') && i < 5) {
      console.log('Line', i+1, ': async function found');
    }
  }
  new Function(code);
} catch(e) {
  // Find the line number from error
  const m = e.stack.match(/at eval:(\d+):(\d+)/) || e.stack.match(/(\d+):(\d+)/);
  console.log('Error:', e.message);
  
  // Try to find problem by binary search
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    try {
      new Function(lines.slice(0, i+1).join('\n'));
    } catch(e2) {
      console.log('Failed at line', i+1, ':', lines[i].trim());
      console.log('Error:', e2.message);
      break;
    }
  }
}
