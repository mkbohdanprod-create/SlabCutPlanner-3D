$lines = Get-Content 'src/utils/approvalImport.ts' -Encoding UTF8
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match 'function approvalStructural|APPROVAL_OCR_LANG|langPath|cdn\.|jsdelivr|cdnjs|npmcdn|network|fetch') {
        Write-Host ($i + 1).ToString().PadLeft(4) + ': ' + $lines[$i]
    }
}
