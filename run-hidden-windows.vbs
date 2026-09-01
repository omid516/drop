Option Explicit
Dim shell, fso, root, nodePath, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
nodePath = shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
If Not fso.FileExists(nodePath) Then nodePath = "node"
command = Chr(34) & nodePath & Chr(34) & " " & Chr(34) & root & "\server.mjs" & Chr(34)
shell.CurrentDirectory = root
shell.Run command, 0, False
