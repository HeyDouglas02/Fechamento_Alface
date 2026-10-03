' Inicia o sistema de fechamento de caixa sem mostrar janela de terminal.
' Duplo-clique aqui (ou num atalho para este arquivo) para abrir o sistema.

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Pasta deste arquivo — não usa o diretório atual, que num atalho pode ser outro.
pasta = fso.GetParentFolderName(WScript.ScriptFullName)

' Quem abre o navegador é a tela de carregamento abaixo, não o servidor.
shell.Environment("PROCESS")("ABRIR_NAVEGADOR") = "0"

shell.CurrentDirectory = pasta
shell.Run "node server/index.js", 0, False

' Abre na hora a tela de carregamento, que entra no sistema quando o servidor
' responder. Se ele já estava rodando, o node acima falha (porta ocupada) e a
' tela entra direto no que já está de pé.
shell.Run """" & fso.BuildPath(pasta, "carregando.html") & """", 1, False
