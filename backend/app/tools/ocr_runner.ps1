param(
    [Parameter(Mandatory=$true)]
    [string]$ImagePath,
    [switch]$ExtractStructure
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { 
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' 
    })[0]

    function AwaitTask($WinRtTask, $ResultType) {
        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
        $netTask = $asTask.Invoke($null, @($WinRtTask))
        $netTask.Wait(-1) | Out-Null
        return $netTask.Result
    }

    [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
    [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
    [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null

    $resolvedPath = (Resolve-Path -LiteralPath $ImagePath).Path
    $file = AwaitTask ([Windows.Storage.StorageFile]::GetFileFromPathAsync($resolvedPath)) ([Windows.Storage.StorageFile])
    $stream = AwaitTask ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = AwaitTask ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = AwaitTask ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

    # Try user profile language first, fallback to zh-Hant-TW then en-US
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if (-not $engine) {
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('zh-Hant-TW'))
    }
    if (-not $engine) {
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('en-US'))
    }

    $ocrResult = AwaitTask ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

    $linesList = [System.Collections.ArrayList]::new()
    $rawLines = @($ocrResult.Lines)
    for ($i = 0; $i -lt $rawLines.Length; $i++) {
        $lineText = $rawLines[$i].Text
        if ($lineText) {
            [void]$linesList.Add($lineText)
        }
    }

    $formattedText = $linesList -join "`n"

    $resultObj = [PSCustomObject]@{
        success = $true
        text = $formattedText
        line_count = $linesList.Count
        language = $engine.RecognizerLanguage.LanguageTag
        lines = $linesList
    }

    $resultObj | ConvertTo-Json -Depth 5 -Compress
} catch {
    $errObj = [PSCustomObject]@{
        success = $false
        error = "$($_.InvocationInfo.ScriptLineNumber): $($_.Exception.Message)"
    }
    $errObj | ConvertTo-Json -Compress
}
