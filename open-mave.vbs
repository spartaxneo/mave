Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\ryzen\Documents\antigravity\dazzling-archimedes"
WshShell.Run """C:\Users\ryzen\Documents\antigravity\dazzling-archimedes\node_modules\electron\dist\electron.exe"" .", 1, False
