# Exportação de relatórios

O aplicativo solicita o arquivo e a API gera a resposta em memória a partir do MySQL. Não é necessário executar o Report Studio. O layout PDF foi incorporado da versão beta do Studio; a API mantém sua própria cópia dos renderizadores em `src/reports`.

## Requisição

```http
GET /exportacoes/relatorio?id_usuario=19&dataInicio=2026-08-01&dataFim=2026-08-31&formato=pdf
```

- `id_usuario`: inteiro positivo.
- `dataInicio` e `dataFim`: datas válidas `YYYY-MM-DD`, em ordem crescente ou iguais.
- `formato`: `pdf` (padrão) ou `xlsx`.
- O período inclui todo o último dia. A consulta usa início inclusivo e o começo do dia seguinte como limite exclusivo.

## Resposta

Status `200` com os bytes do arquivo e os cabeçalhos:

- `Content-Type`: `application/pdf` ou `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- `Content-Disposition`: `attachment; filename="relatorio-insulog-19-2026-08-01-2026-08-31.pdf"`.
- `Content-Length`: tamanho em bytes.
- `Cache-Control: no-store`.

Erros retornam JSON `{ "error": "mensagem" }`: `400` para parâmetros inválidos; `404` para usuário inexistente ou período sem registros; `500` para falhas internas.

```bash
curl --fail-with-body 'http://localhost:3000/exportacoes/relatorio?id_usuario=19&dataInicio=2026-08-01&dataFim=2026-08-31&formato=pdf' --output relatorio.pdf
```

## Dados e apresentação

- PDF: capa com logo, indicadores consolidados e registros completos com paginação.
- Excel: abas `Resumo` e `Registros`, com os mesmos dados consolidados.
- Cada medição conta uma vez, mesmo quando possui várias aplicações de insulina.
- Dias analisados e médias diárias consideram os dias com registros, não todos os dias do intervalo.
- Percentuais representam a proporção de medições, não tempo contínuo em faixa.
- Horários MySQL sem fuso são interpretados como horários locais de `America/Araguaina` (UTC−03:00); o servidor mantém `dateStrings: true`.
- Tipo de diabetes aparece como “Não informado” enquanto esse campo não for fornecido pelo repository.
- A exportação não cria automaticamente entradas na tabela `exportacao`; o CRUD dessa tabela é independente.

## Aplicativo

Na tela Relatório, selecionar o mês (ou um dia) e tocar em **Exportar**, depois **PDF** ou **Planilha Excel**. O app usa o usuário da sessão local, recebe bytes e abre o menu nativo de compartilhamento. As opções de salvar ou abrir dependem dos aplicativos instalados. O serviço trata erros JSON e usa timeout de 60 segundos.

O compartilhamento usa `share_plus` 11.1, compatível com a configuração Android existente: [documentação do pacote](https://pub.dev/packages/share_plus/versions/11.1.0).

## Validação

`npm test` verifica consolidação, faixas, conteúdo Excel, paginação básica PDF, downloads HTTP e parâmetros inválidos. Os testes substituem as consultas MySQL por dados determinísticos em `test/fixtures`; não acessam nem alteram dados reais.

No APP: `flutter test test/report_export_service_test.dart` verifica os bytes, parâmetros, nomes e erros de download. A validação final em dispositivo deve confirmar o arquivo com dados reais e o menu de compartilhamento.

Na integração foram verificados: 21 testes da API, 6 testes do APP, análise estática dos arquivos Dart alterados, compilação do APK de depuração e geração dos dois formatos com o MySQL configurado (somente leitura). O PDF de exemplo foi conferido visualmente; um caso com 80 registros e observação extensa preservou todos os registros em 11 páginas, com cabeçalhos e rodapés. O APK está em `APP/build/app/outputs/flutter-apk/app-debug.apk`; o compartilhamento ainda precisa ser conferido em dispositivo físico.

## Limite atual de acesso

A API existente não valida token ou sessão nas rotas. A exportação ainda recebe `id_usuario` do cliente; o ID salvo no app não autentica a requisição. Para uso com dados reais em produção, vincular esse acesso a uma identidade validada no servidor e verificar a autorização sobre o paciente. A integração de relatórios não implementa um novo sistema de autenticação.
