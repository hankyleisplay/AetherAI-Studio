@echo off
chcp 65001 >nul
echo [AetherAI Studio 3.0] 正在為您建立桌面捷徑...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desktop = [System.Environment]::GetFolderPath('Desktop'); " ^
  "$shortcut = $ws.CreateShortcut(\"$desktop\AetherAI Studio 3.0.lnk\"); " ^
  "$shortcut.TargetPath = 'node.exe'; " ^
  "$shortcut.Arguments = \"\"\"%~dp0cli.js\"\"\" --desktop; " ^
  "$shortcut.WorkingDirectory = \"%~dp0\"; " ^
  "$shortcut.Description = 'AetherAI Studio 3.0 - Next-Gen Autonomous AI Agent Desktop'; " ^
  "$shortcut.Save(); " ^
  "Write-Host '[✓] AetherAI Studio 3.0 桌面捷徑已成功建立於您的桌面！' -ForegroundColor Green"

pause
