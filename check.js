const fs = require('fs');
const code = fs.readFileSync('web/app.js', 'utf8');
const lines = code.split('\n');
let depth = 0;
for (let i = 0; i < lines.length; i++) {
  for (let c of lines[i]) {
    if (c === '{') depth++;
    if (c === '}') depth--;
  }
  if (depth < 0) {
    console.log('EXTRA } at line', i+1, ':', lines[i]);
    depth = 0;
  }
}
console.log('Final depth:', depth);
if (depth > 0) {
  // find lines with highest depth
  let d = 0;
  for (let i = 0; i < lines.length; i++) {
    for (let c of lines[i]) {
      if (c === '{') d++;
      if (c === '}') d--;
    }
    if (d === depth) {
      console.log('Still open at line', i+1, ':', lines[i].substring(0,80));
      break;
    }
  }
}
