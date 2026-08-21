' Inicia o sistema de fechamento de caixa sem mostrar janela de terminal
' Duplo-clique neste arquivo para abrir o sistema

Set objShell = CreateObject("WScript.Shell")
strScriptPath = objShell.CurrentDirectory
objShell.Run "cmd /c cd """ & strScriptPath & """ && node server/index.js", 0, False
