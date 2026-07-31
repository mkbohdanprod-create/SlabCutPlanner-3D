const fs = require('fs');
let content = fs.readFileSync('src/components/ui/Detail3DPreview.tsx', 'utf8');

const importStr = `import { buildDetailShape } from '../../engines/shapeBuilder';\n`;
if (!content.includes('buildDetailShape')) {
  const lastImport = content.lastIndexOf('import ');
  const insertPos = content.indexOf('\n', lastImport) + 1;
  content = content.slice(0, insertPos) + importStr + content.slice(insertPos);
}

const searchString = 'export function useDetailShape';
const fnStart = content.indexOf(searchString);
const startMatch = 'return useMemo(() => {';
const startIndex = content.indexOf(startMatch, fnStart);
let bracketCount = 1;
let endIndex = -1;
for (let i = startIndex + startMatch.length; i < content.length; i++) {
  if (content[i] === '{') bracketCount++;
  if (content[i] === '}') bracketCount--;
  if (bracketCount === 0) {
    endIndex = i;
    break;
  }
}

const newLogic = `return useMemo(() => {
    return buildDetailShape(detail, points, bounds);
  }`;

content = content.slice(0, startIndex) + newLogic + content.slice(endIndex + 1);
fs.writeFileSync('src/components/ui/Detail3DPreview.tsx', content);
console.log('Detail3DPreview updated');
