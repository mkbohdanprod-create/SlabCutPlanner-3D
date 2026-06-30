$lines = Get-Content 'src/utils/approvalImport.ts' -Encoding UTF8
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match 'extractDimensionsNearDrawingOcr|getOcrWorker|initializeOcrWorker|createWorker|terminateWorker|recognize') {
        Write-Host ($i + 1).ToString().PadLeft(4) + ': ' + $lines[$i]
    }
}
