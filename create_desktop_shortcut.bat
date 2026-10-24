@echo off
chcp 65001 >nul
echo [AetherAI Studio 4.0] 正在為您建立桌面捷徑...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desktop = [System.Environment]::GetFolderPath('Desktop'); " ^
  "$shortcut = $ws.CreateShortcut(\"$desktop\AetherAI Studio 4.0.lnk\"); " ^
  "$shortcut.TargetPath = 'powershell.exe'; " ^
  "$shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File \"\"\"%~dp0run.ps1\"\"\" -Desktop'; " ^
  "$shortcut.WorkingDirectory = \"%~dp0\"; " ^
  "$shortcut.Description = 'AetherAI Studio 4.0 - Next-Gen Autonomous AI Agent Desktop'; " ^
  "$shortcut.Save(); " ^
  "Write-Host '[✓] AetherAI Studio 4.0 桌面捷徑已成功建立於您的桌面！' -ForegroundColor Green"

pause
