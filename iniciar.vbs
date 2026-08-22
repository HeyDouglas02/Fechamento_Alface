' Inicia o sistema de fechamento de caixa sem mostrar janela de terminal.
' Duplo-clique aqui (ou num atalho para este arquivo) para abrir o sistema.

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Pasta deste arquivo — não usa o diretório atual, que num atalho pode ser outro.
pasta = fso.GetParentFolderName(WScript.ScriptFullName)

' Abre o navegador junto com o servidor.
shell.Environment("PROCESS")("ABRIR_NAVEGADOR") = "1"

shell.CurrentDirectory = pasta
shell.Run "node server/index.js", 0, False
