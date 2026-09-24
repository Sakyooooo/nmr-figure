' nmrfig-chemdraw: link -> helper.ps1 without a console window
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
If WScript.Arguments.Count < 1 Then WScript.Quit 1
url = WScript.Arguments(0)
' only the characters the app puts in the link (letters, digits, - _ : / ? = & % .)
Set re = New RegExp
re.Pattern = "^nmrfig-chemdraw:[A-Za-z0-9\-_:/?=&%.]+$"
If Not re.Test(url) Then WScript.Quit 1
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File """ & dir & "\helper.ps1"" """ & url & """", 0, False
