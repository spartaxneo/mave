Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "c:\Users\ryzen\Documents\antigravity\dazzling-archimedes"

' 1. Start PinchTab Bridge independently in the background
WshShell.Run "cmd /c ""D:\Bigfoot\pinchtab\pinchtab.exe bridge --port 9867""", 0, False

' 2. Start Mave Electron independently in the background
WshShell.Run "cmd /c ""npm start""", 0, False
