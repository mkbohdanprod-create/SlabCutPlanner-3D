const fs = require('fs');
const content = fs.readFileSync('src/components/ui/Detail3DPreview.tsx', 'utf8');
const searchString = 'const mainPoints = useMemo(() => {';
const startIndex = content.indexOf(searchString);
let bracketCount = 1;
let endIndex = -1;
for (let i = startIndex + searchString.length; i < content.length; i++) {
  if (content[i] === '{') bracketCount++;
  if (content[i] === '}') bracketCount--;
  if (bracketCount === 0) {
    endIndex = i;
    break;
  }
}
const mainPointsLogic = content.substring(startIndex, endIndex + 1);

const boundsSearch = 'const mainBounds = useMemo(() => {';
const boundsStartIndex = content.indexOf(boundsSearch, endIndex);
let boundsBracketCount = 1;
let boundsEndIndex = -1;
for (let i = boundsStartIndex + boundsSearch.length; i < content.length; i++) {
  if (content[i] === '{') boundsBracketCount++;
  if (content[i] === '}') boundsBracketCount--;
  if (boundsBracketCount === 0) {
    boundsEndIndex = i;
    break;
  }
}
const boundsLogic = content.substring(boundsStartIndex, boundsEndIndex + 1);

let pointsFuncBody = mainPointsLogic.replace('const mainPoints = useMemo(() => {', '').replace('  }, [detail]);', '');
let boundsFuncBody = boundsLogic.replace('const mainBounds = useMemo(() => {', '').replace('  }, [mainPoints]);', '').replace(/mainPoints/g, 'points');

const finalCode = `
export function getDetailPointsAndBounds(detail: DetailDraft) {
  const getPoints = () => {
${pointsFuncBody}
  };
  const points = getPoints();
  
  const getBounds = () => {
${boundsFuncBody}
  };
  const bounds = getBounds();
  
  return { points, bounds };
}
`;

const shapeBuilderContent = fs.readFileSync('src/engines/shapeBuilder.ts', 'utf8');
fs.writeFileSync('src/engines/shapeBuilder.ts', shapeBuilderContent + finalCode);
console.log('Added getDetailPointsAndBounds');
