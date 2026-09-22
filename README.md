# Minhas Demandas — instrutores e contratos

## Abrir o sistema

Na pasta do projeto, execute `node server.cjs` e abra `http://127.0.0.1:8765`.
O menu **Instrutores e contratos** abre o novo módulo. O servidor atende somente este computador.

Requer Node.js 24. Os registros ficam no banco SQLite local `data/sistema.sqlite`, neste computador. Mantenha o servidor aberto durante o uso.

## Acessos

No primeiro acesso, defina e confirme as senhas dos três usuários (mínimo de 10 caracteres). Não há cadastro de outras contas.

| Perfil | E-mail | Acesso |
| --- | --- | --- |
| Gestora | secretaria03.grautecnico@gmail.com | Demandas privadas e todos os instrutores, contratos e orçamentos |
| Coordenação de Exatas | pedagogico04.grautecnico@gmail.com | ADM, ELT, STB, DSI, ELP e BCV |
| Coordenação de Saúde | pedagogico05.grautecnico@gmail.com | RAD, ENF, EIC e FLB |

As restrições são verificadas no servidor, inclusive para gravações e backups. Cada usuário pode alterar sua própria senha. As senhas são armazenadas como hashes com salt; a sessão expira em oito horas.

A configuração inicial entra como gestora. Faça esse primeiro acesso no mesmo navegador e endereço usados anteriormente: os registros antigos são importados automaticamente, e a cópia do navegador só é removida após a confirmação do banco. Instrutores compartilhados são separados por coordenação conforme os cursos de seus contratos; os sem classificação ficam disponíveis apenas para a gestora atribuir a uma coordenação. Se houver conflito na importação, o sistema preserva os dados antigos e mostra um aviso.

Após a migração, outros navegadores neste computador podem acessar o mesmo banco pelo servidor local. O sistema não está publicado para acesso de outros computadores.

## Fluxo de trabalho

1. Em **Instrutores**, cadastre nome, documento, endereço, chave Pix e checklist. Informe o solicitante padrão para reutilizá-lo.
2. Clique em **Novo contrato**. Selecione o instrutor e preencha disciplina, modalidade, carga horária, valor da hora-aula, curso, turma, turno e datas.
3. Salve e clique em **Ver PDF**. A solicitação e o canhoto são gerados juntos em uma página A4. **Baixar PDF** permite salvar e imprimir o documento.
4. Use **Reutilizar** para iniciar outra solicitação com os dados pedagógicos anteriores. O novo registro usa os dados atuais do instrutor.
5. Em **Orçamento mensal**, selecione o mês inicial do ciclo: setembro corresponde a **07/09 a 06/10**, incluindo ambas as datas. Filtre por curso e/ou número de turma ou mantenha todos para o relatório geral. **Baixar relatório CSV** exporta detalhes, totais e resumo por curso para planilhas.

O orçamento considera **carga horária × valor hora-aula**, integralmente no ciclo que contém a **data de término da disciplina**. Não há divisão do valor entre os meses. O relatório representa previsão orçamentária, não comprovação de pagamento.

Os cursos disponíveis são ADM, STB, ELT, DSI, ELP, BCV, ENF, RAD, EIC e FLB. Turma e turno compõem identificações como `ADM10-M`.

## Preservação dos registros

- Editar o cadastro de um instrutor não altera os dados pessoais ou Pix já usados em solicitações anteriores.
- **Desativar** mantém o histórico do instrutor e impede novas contratações até sua reativação.
- **Cancelar registro** retira o contrato do orçamento sem apagá-lo. Marque **Mostrar cancelados** para reativar.
- O modelo é uma **solicitação de contrato**, conforme o PDF fornecido. Os campos de assinatura, administrativo e financeiro permanecem em branco. A página extra praticamente vazia do original não é reproduzida.
- O checklist registra conferência documental; o sistema não armazena anexos dos documentos.

## Backup

**Exportar backup** salva cadastros, contratos e preferências em JSON. **Restaurar backup** valida o arquivo e solicita confirmação antes de substituir o módulo. A versão anterior fica disponível em **Baixar cópia anterior**. Os backups contêm os dados pessoais e de pagamento cadastrados; guarde-os em local apropriado.

Os backups de coordenação incluem apenas seus próprios registros; a gestora exporta o conjunto completo. Restaurações de coordenação preservam os registros da outra coordenação. Para uma cópia completa, incluindo demandas e contas, pare o servidor e copie toda a pasta data. Após a migração, limpar os dados do navegador não apaga o banco SQLite.

## Verificação

Execute `node --test app.test.cjs contracts.test.cjs access.test.cjs`.
Os testes cobrem recorrências das demandas, persistência, cálculos, períodos, filtros, cancelamentos, validação de backup e geração do PDF A4 de uma página.
`output/pdf/contrato-exemplo.pdf` contém apenas dados fictícios e serve para conferir o modelo.

As bibliotecas PDF-Lib e PDF.js estão incluídas localmente, com suas licenças em `assets/vendor`, sem dependência de serviços externos para gerar os documentos.


## Aprovação e relatório mensal

Contratos novos e registros antigos sem aprovação ficam pendentes. Na conta da gestora, abra **Contratos**, filtre **Pendentes de aprovação**, confira o registro e use **Aprovar contrato**. Só aprovados e não cancelados entram no orçamento. A aprovação registra usuário e data no banco. Editar ou reativar um contrato exige nova aprovação; restaurar um backup não concede aprovação. A gestora pode retirar uma aprovação.

A lista de contratos tem filtro por mês do ciclo de 7 a 6, usando a data de término. O filtro mensal das demandas usa o mês de calendário da data da tarefa. Ambos permitem voltar a todos os meses.

O relatório de despesas segue as nove colunas do modelo institucional, com exportação **Excel (.xlsx)** e CSV. Inclui curso, turma, disciplina, datas inicial e final, valor hora/aula, quantidade de aulas, horas totais e valor do instrutor. Informe a quantidade de aulas ao elaborar ou editar o contrato; registros antigos sem essa informação deixam a célula vazia no Excel. O valor permanece baseado nas horas totais × valor hora/aula, sem presumir duração fixa para cada aula.

Verificação completa: `node --test app.test.cjs contracts.test.cjs access.test.cjs cost-report.test.cjs`.

## Índice necessário no Firestore

A consulta do backup mais recente por perfil requer o índice composto definido em `firestore.indexes.json`: coleção `backups`, campo `role` crescente e campo `created` decrescente, com escopo de coleção. Crie esse índice no console do projeto Firebase e aguarde o estado habilitado antes de usar a consulta de backups. O deploy da Vercel não cria índices do Firestore automaticamente.
