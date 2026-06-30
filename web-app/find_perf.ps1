$lines = Get-Content 'src/utils/approvalImport.ts' -Encoding UTF8
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match 'async function|export async|getWorker|initWorker|tesseract|Tesseract|recognize|OCR|ocr|Worker|canvas|render|getPage|getOperator|raster|scale|viewport|setTimeout|Promise|await') {
        Write-Host ($i + 1).ToString().PadLeft(4) + ': ' + $lines[$i]
    }
}
