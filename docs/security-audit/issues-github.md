# ISSUES PARA O GITHUB

Textos preparados; nenhuma issue foi publicada. Linhas referem-se aos commits auditados.

--- ISSUE 1 — A01 ---
# [Segurança] Listagens globais expõem dados e hashes de senha

Labels sugeridas: security, alta

## Descrição
As seis listagens de dados privados não recebem identidade autenticada e executam consultas sem filtro de dono. GET /usuarios devolve SELECT * diretamente, incluindo a coluna senha. Os IDs expostos também facilitam as referências diretas dos demais achados.

## Condições de explorabilidade
Acesso de rede à API e linhas existentes nas tabelas; não depende de login ou feature flag. Hashes não equivalem automaticamente a senhas recuperadas.

## Evidência
src/controllers/userController.js:3–6

```text
3: async function index(req, res, next) {
4:   try {
5:     const users = await userService.listUsers()
6:     return res.status(200).json(users)
```

src/repositories/userRepository.js:4–9

```text
4: async function findAll() {
5:   const [rows] = await db.execute(
6:     'SELECT * FROM usuario ORDER BY id_usuario ASC'
7:   )
8: 
9:   return rows
```

Demais locais afetados (trechos completos na análise A01 do relatório):
src/repositories/registroGlicoseRepository.js:5–9; src/repositories/registroInsulinaRepository.js:4–7; src/repositories/alarmeRepository.js:14–17; src/repositories/configuracaoRepository.js:4–7; src/repositories/exportacaoRepository.js:4–7; src/services/passwordService.js:42–47.

## Impacto
Leitura em massa de contas, hashes scrypt, medições, doses, alarmes, preferências e metadados de exportação. Se houver contas legadas em texto puro, a senha também é retornada; a existência delas em produção não foi aferida.

## Sugestão de correção
Exigir identidade validada, filtrar cada coleção pelo dono autorizado ou vínculo médico-paciente verificado e retornar DTOs com lista explícita de campos. Nunca serializar senha/hash. Migrar senhas legadas caso existam.

## Critérios de aceite
- [ ] Anônimo recebe 401 nas seis coleções privadas.
- [ ] Usuário A não recebe nenhuma linha de B, inclusive nas junções de insulina.
- [ ] Respostas de usuários nunca contêm senha, hash ou salt.
- [ ] Vínculo médico-paciente é validado no servidor antes de permitir leitura.
--- FIM ISSUE 1 ---

--- ISSUE 2 — A02 ---
# [Segurança] Conta de terceiros pode ser alterada, inclusive a senha

Labels sugeridas: security, crítica

## Descrição
GET, PUT e DELETE /usuarios/:id confiam apenas no ID. A atualização aceita uma nova senha, gera o hash e atualiza a conta sem sessão, senha atual ou fluxo de recuperação. A reprodução local mudou a senha de uma conta fictícia e realizou login com a nova senha.

## Condições de explorabilidade
API acessível e ID existente. Para atualização, enviar os campos obrigatórios; nenhuma credencial prévia é exigida. DELETE pode ser impedido por integridade referencial, sem corrigir a falha de autorização.

## Evidência
src/services/userService.js:78–91

```text
78: async function updateUser(id, data) {
79:   const { nome, email, senha, tipo_login, tipo_usuario, id_medico, crm } = data
80: 
81:   if (!nome || !email || !senha || !tipo_login || !tipo_usuario) {
82:     const error = new Error('Todos os campos sao obrigatorios')
83:     error.statusCode = 400
84:     throw error
85:   }
86: 
87:   const senhaCriptografada = passwordService.hashPassword(senha)
88: 
89:   return await userRepository.update(
90:     id,
91:     { nome, email, senha: senhaCriptografada, tipo_login, tipo_usuario, id_medico, crm }
```

src/repositories/userRepository.js:134–136

```text
134:     await conn.execute(
135:       'UPDATE usuario SET nome = ?, email = ?, senha = ?, tipo_login = ?, tipo_usuario = ? WHERE id_usuario = ?',
136:       [nome, email, senha, tipo_login, tipo_usuario, id]
```

Demais locais afetados (trechos completos na análise A02 do relatório):
src/routes/userRoutes.js:8–14; src/controllers/userController.js:53–57; src/repositories/userRepository.js:42–45; src/repositories/userRepository.js:18–30.

## Impacto
Tomada de conta e alteração de nome, e-mail e tipo de usuário; leitura de perfil. Exclusão também alcança SQL sem autorização, podendo depender das foreign keys e dos registros vinculados.

## Sugestão de correção
Autenticar as rotas, vincular o perfil à identidade do servidor e exigir autorização específica para terceiros. Separar troca de senha de edição comum, com reautenticação ou token de recuperação de uso único; limitar exclusão.

## Critérios de aceite
- [ ] Anônimo não consulta, altera nem exclui contas.
- [ ] Usuário A não altera nem remove B ao trocar o ID.
- [ ] Troca de senha exige prova adicional e revoga sessões conforme a política.
- [ ] Senha/e-mail de B permanecem intactos após tentativa não autorizada.
--- FIM ISSUE 2 ---

--- ISSUE 3 — A03 ---
# [Segurança] Registros clínicos e objetos vinculados não validam posse

Labels sugeridas: security, crítica

## Descrição
Os handlers de glicose, insulina, alarmes, configurações e metadados de exportação usam IDs de path/body/query sem comparar com dono autenticado. Verificar existência com findById não valida posse. POST aceita id_usuario ou id_registro de terceiros; PUT pode mudar esses vínculos. Dashboard e histórico também aceitam o paciente escolhido pelo chamador.

## Condições de explorabilidade
API alcançável e IDs/referências válidos. Constraints podem rejeitar IDs inexistentes, mas não isolam donos existentes. Sem feature flag ou sessão necessária.

## Evidência
src/services/registroGlicoseService.js:125–130

```text
125: function montarRegistroCompleto(data, registroAtual = {}) {
126:   const id_usuario = data.id_usuario ?? registroAtual.id_usuario
127:   const nivel_glicose = data.nivel_glicose ?? registroAtual.nivel_glicose
128:   const id_periodo = data.id_periodo ?? registroAtual.id_periodo
129:   const data_hora = data.data_hora ?? registroAtual.data_hora ?? formatarDataHoraAtual()
130:   const observacao = data.observacao ?? registroAtual.observacao ?? null
```

src/repositories/registroGlicoseRepository.js:197–205

```text
197:     await conn.execute(
198:       'UPDATE registroglicose SET id_usuario = ?, nivel_glicose = ?, data_hora = ?, id_periodo = ?, observacao = ? WHERE id_registro = ?',
199:       [
200:         glicose.id_usuario,
201:         glicose.nivel_glicose,
202:         glicose.data_hora,
203:         glicose.id_periodo,
204:         glicose.observacao ?? null,
205:         id
```

src/repositories/registroInsulinaRepository.js:51–54

```text
51:     const [result] = await conn.execute(
52:       'INSERT INTO registroinsulina (id_registro, id_tipo_insulina, unidade_insulina) VALUES (?, ?, ?)',
53:       [id_registro, id_tipo_insulina, unidade_insulina]
54:     )
```

Demais locais afetados (trechos completos na análise A03 do relatório):
src/controllers/registroGlicoseController.js:44–48; src/services/registroGlicoseService.js:356–365; src/repositories/registroGlicoseRepository.js:51–54; src/repositories/registroGlicoseRepository.js:277–290; src/repositories/registroGlicoseRepository.js:304–310; src/repositories/registroInsulinaRepository.js:12–15; src/repositories/registroInsulinaRepository.js:79–81; src/repositories/registroInsulinaRepository.js:100–104; src/repositories/alarmeRepository.js:22–25; src/repositories/alarmeRepository.js:30–33; src/repositories/alarmeRepository.js:46–48; src/repositories/alarmeRepository.js:79–81; src/repositories/alarmeRepository.js:105–108; src/repositories/configuracaoRepository.js:12–15; src/repositories/configuracaoRepository.js:28–30; src/repositories/configuracaoRepository.js:57–59; src/repositories/configuracaoRepository.js:79–82; src/repositories/exportacaoRepository.js:12–15; src/repositories/exportacaoRepository.js:28–30; src/repositories/exportacaoRepository.js:56–58; src/repositories/exportacaoRepository.js:77–80.

## Impacto
Leitura, criação, adulteração e exclusão de medições e doses de terceiros; alteração de alarmes e preferências. O impacto crítico decorre da integridade dos registros clínicos, não de um comando demonstrado a dispositivo de administração de insulina.

## Sugestão de correção
Exigir sessão e aplicar predicados de dono em leitura e escrita. Para insulina, validar o dono pela junção com registroglicose. Derivar id_usuario da sessão, verificar referências cruzadas e impedir transferência arbitrária de dono; manter verificação e mutação na mesma transação quando necessário.

## Critérios de aceite
- [ ] Todos os handlers privados da matriz rejeitam anônimos.
- [ ] IDs de B em path, query e body de A são rejeitados sem alteração de estado.
- [ ] POST de insulina/alarme não permite referência a registro de outro paciente.
- [ ] Dashboard, histórico e buscas por usuário não revelam dados de B.
- [ ] Operações legítimas do dono continuam funcionando.
--- FIM ISSUE 3 ---

--- ISSUE 4 — A04 ---
# [Segurança] Relatório clínico pode ser exportado para qualquer paciente

Labels sugeridas: security, alta

## Descrição
GET /exportacoes/relatorio recebe id_usuario da query e repassa ao repository. A query filtra esse ID, mas nenhuma etapa verifica a identidade do solicitante ou o vínculo com o paciente. A validação de formato/data não é autorização.

## Condições de explorabilidade
ID existente, intervalo válido e registros no período. Sem token/cookie necessário; download de PDF confirmado com banco simulado. Não foi acessado banco real.

## Evidência
src/controllers/exportacaoController.js:54–60

```text
54:     const { id_usuario, dataInicio, dataFim, formato } = req.query
55:     const arquivo = await exportacaoService.gerarRelatorio({
56:       idUsuario: id_usuario,
57:       dataInicio,
58:       dataFim,
59:       formato
60:     })
```

src/repositories/exportacaoRepository.js:104–111

```text
104:     FROM registroglicose rg
105:     LEFT JOIN periodo p ON p.id_periodo = rg.id_periodo
106:     LEFT JOIN registroinsulina ri ON ri.id_registro = rg.id_registro
107:     LEFT JOIN tipoinsulina ti ON ti.id_tipo_insulina = ri.id_tipo_insulina
108:     WHERE rg.id_usuario = ? AND rg.data_hora >= ?
109:       AND rg.data_hora < DATE_ADD(?, INTERVAL 1 DAY)
110:     ORDER BY rg.data_hora ASC, ri.id_registro_insulina ASC`,
111:     [idUsuario, dataInicio, dataFim]
```

Demais locais afetados (trechos completos na análise A04 do relatório):
src/routes/exportacaoRoutes.js:6–9; src/services/exportacaoService.js:114–118; src/repositories/exportacaoRepository.js:84–87; ../insulog-mobile-front-clone/lib/services/api/report_export_service.dart:58–70.

## Impacto
Extração de identidade e histórico clínico consolidado em PDF/XLSX de terceiros, com observações e aplicações de insulina.

## Sugestão de correção
Autenticar antes de gerar o relatório, usar o próprio ID da sessão ou validar explicitamente o vínculo com outro paciente. Reutilizar a mesma política para os dois formatos.

## Critérios de aceite
- [ ] Sem sessão: 401 para PDF e XLSX.
- [ ] Usuário A não exporta B alterando id_usuario.
- [ ] Médico sem vínculo é rejeitado; vínculo autorizado é aceito.
- [ ] Cache-Control no-store e validação dos parâmetros continuam presentes.
--- FIM ISSUE 4 ---

--- ISSUE 5 — A05 ---
# [Segurança] Catálogos compartilhados aceitam escrita anônima

Labels sugeridas: security, alta

## Descrição
POST, PUT e DELETE de períodos e tipos de insulina não verificam privilégio. São catálogos globais sem dono individual; portanto a falha é de autorização funcional, e não IDOR de tenant. Não há gate de papel correspondente no frontend: os endpoints podem ser chamados diretamente.

## Condições de explorabilidade
API acessível; campos descricao/nome preenchidos. PUT/DELETE exigem ID existente. Não foi presumido um papel admin que não existe no projeto.

## Evidência
src/routes/periodoRoutes.js:8–10

```text
8: router.post('/', periodoController.create)
9: router.put('/:id', periodoController.update)
10: router.delete('/:id', periodoController.deleteById)
```

src/routes/typeInsuRoutes.js:8–10

```text
8: router.post('/', typeInsuController.create)
9: router.put('/:id', typeInsuController.update)
10: router.delete('/:id', typeInsuController.deleteById)
```

src/repositories/periodoRepository.js:54–56

```text
54:     await conn.execute(
55:       'UPDATE periodo SET descricao = ? WHERE id_periodo = ?',
56:       [descricao, id]
```

Demais locais afetados (trechos completos na análise A05 do relatório):
src/services/periodoService.js:40–46; src/repositories/periodoRepository.js:28–30; src/repositories/periodoRepository.js:73–76; src/repositories/typeInsuRepository.js:21–24; src/repositories/typeInsuRepository.js:36–38; src/repositories/typeInsuRepository.js:63–65.

## Impacto
Qualquer chamador pode inserir/alterar rótulos compartilhados usados nos registros e relatórios. Exclusões de entradas vinculadas podem ser bloqueadas por foreign keys; inserção e edição continuam sem autorização.

## Sugestão de correção
Definir política de manutenção dos catálogos e aplicá-la no servidor às seis operações de escrita. Se não forem gerenciáveis pela API, remover as rotas de mutação.

## Critérios de aceite
- [ ] As seis operações rejeitam anônimo e usuário sem privilégio.
- [ ] Somente principal explicitamente autorizado altera catálogos.
- [ ] Testes cobrem POST, PUT e DELETE dos dois routers.
--- FIM ISSUE 5 ---

--- ISSUE 6 — A06 ---
# [Segurança] Tipo de usuário é aceito do cliente sem aprovação

Labels sugeridas: security, média

## Descrição
O formulário cadastra paciente, mas o backend permite criar medico com qualquer CRM não vazio. PUT aceita tipo_usuario sem a lista de valores aplicada no cadastro. A manipulação do atributo é comprovada; nenhum privilégio médico adicional foi encontrado no código atual, portanto não se afirma escalada a administrador.

## Condições de explorabilidade
POST exige e-mail ainda não cadastrado, campos obrigatórios e CRM não vazio para medico. PUT exige campos obrigatórios, mas não autorização. Um esquema de banco com restrição de domínio pode recusar valores fora da lista; medico continua permitido.

## Evidência
../insulog-mobile-front-clone/lib/services/api/auth_service.dart:89–95

```text
89:       await _apiService.post('usuarios', {
90:         'nome': fullName,
91:         'email': email,
92:         'senha': password,
93:         'tipo_login': 'email',
94:         'tipo_usuario': 'paciente',
95:         'id_medico': 16
```

src/services/userService.js:48–58

```text
48:   const tipoNormalizado = tipo_usuario.toLowerCase()
49: 
50:   if (!['medico', 'paciente'].includes(tipoNormalizado)) {
51:     const error = new Error('tipo_usuario invalido')
52:     error.statusCode = 400
53:     throw error
54:   }
55: 
56:   if (tipoNormalizado === 'medico' && !crm) {
57:     const error = new Error('crm e obrigatorio para usuarios do tipo medico')
58:     error.statusCode = 400
```

src/repositories/userRepository.js:134–136

```text
134:     await conn.execute(
135:       'UPDATE usuario SET nome = ?, email = ?, senha = ?, tipo_login = ?, tipo_usuario = ? WHERE id_usuario = ?',
136:       [nome, email, senha, tipo_login, tipo_usuario, id]
```

Demais locais afetados (trechos completos na análise A06 do relatório):
src/services/userService.js:70–74; src/services/userService.js:78–91; src/repositories/userRepository.js:97–100.

## Impacto
Falsificação do tipo de conta e da identidade profissional registrada; inconsistência de papéis. A tomada de conta pelo PUT é contada separadamente em A02.

## Sugestão de correção
Fixar o tipo permitido no cadastro público e criar processo autorizado de validação/aprovação para profissional, conforme regra do produto. Remover tipo_usuario do DTO de autoedição e validar domínio de valores no backend.

## Critérios de aceite
- [ ] Cadastro público não atribui papel profissional sem o processo definido.
- [ ] Autoedição não altera tipo_usuario.
- [ ] Tipo inválido é rejeitado no servidor.
- [ ] Testes documentam a política de cadastro de profissionais.
--- FIM ISSUE 6 ---

--- ISSUE 7 — A07 ---
# [Segurança] Credenciais MySQL permanecem recuperáveis no Git

Labels sugeridas: security, alta

## Descrição
O arquivo .env foi versionado com DB_USER=root e DB_PASSWORD em texto claro. Foram identificados dois valores distintos em blobs históricos, apesar de o arquivo não existir no HEAD. O commit inicial já continha uma credencial; uma revisão posterior contém a segunda. Valores foram ocultados neste relatório para evitar nova distribuição.

## Condições de explorabilidade
Exposição histórica confirmada; uso atual, validade e alcance de rede não aferidos. DB_HOST era localhost, o que limita acesso direto remoto e não elimina risco de reutilização ou acesso ao host. Severidade alta condicionada à credencial ainda utilizável.

## Evidência
.env:1–5 @ 147015e9442d

```text
1: DB_HOST=localhost
2: DB_PORT=3306
3: DB_USER=root
4: DB_PASSWORD=[VALOR OCULTADO]
5: DB_NAME=insulog
```

.env:1–5 @ 9ec3cabca65b

```text
1: DB_HOST=localhost
2: DB_PORT=3306
3: DB_USER=root
4: DB_PASSWORD=[VALOR OCULTADO]
5: DB_NAME=insulog
```

Demais locais afetados (trechos completos na análise A07 do relatório):
src/config/database.js:8–13; .gitignore:1–5.

## Impacto
Leitores do histórico obtêm credenciais de banco. Se ainda válidas ou reutilizadas em serviço alcançável, permitem acesso com os privilégios configurados para essa conta. Não foram testadas contra nenhum serviço.

## Sugestão de correção
Rotacionar as duas credenciais expostas e qualquer reutilização; adotar conta de aplicação com privilégio mínimo. Só depois tratar histórico e cópias sob controle da equipe, com coordenação dos clones. Manter segredos fora do Git e adicionar detector no CI.

## Critérios de aceite
- [ ] As duas credenciais antigas foram invalidadas, com confirmação do responsável pelo banco.
- [ ] Aplicação usa segredo externo e conta com privilégio mínimo.
- [ ] Varredura de segredos cobre commits no CI.
- [ ] Plano de tratamento do histórico/cópias foi executado ou documentado; remoção de HEAD não é aceita como rotação.
--- FIM ISSUE 7 ---

--- ISSUE 8 — A08 ---
# [Segurança] Senhas e respostas sensíveis são gravadas nos logs

Labels sugeridas: security, alta

## Descrição
O middleware registra req.body integralmente antes dos handlers, incluindo password do login e senha do cadastro/edição. Cadastro duplica o log no controller e no serviço. O interceptor também registra respostas completas, incluindo hashes da listagem e dados clínicos.

## Condições de explorabilidade
Requer requisição com dados sensíveis e acesso posterior à saída de logs; não depende de modo debug ou feature flag. Não foi verificada a retenção ou ACL de um provedor de logs.

## Evidência
src/app.js:39–48

```text
39:     const retorno = Buffer.isBuffer(body)
40:       ? body.toString('utf8')
41:       : body
42: 
43:     console.log('<retorno>', {
44:       metodo: req.method,
45:       rota: req.originalUrl,
46:       status: res.statusCode,
47:       body: retorno
48:     })
```

src/app.js:78–85

```text
78: app.use((req, res, next) => {
79:   if (Object.keys(req.query).length > 0) {
80:     console.log('Query:', req.query)
81:   }
82: 
83:   if (req.body && Object.keys(req.body).length > 0) {
84:     console.log('Body:', req.body)
85:   }
```

Demais locais afetados (trechos completos na análise A08 do relatório):
src/app.js:51–58; src/controllers/userController.js:43–46; src/services/userService.js:37–40.

## Impacto
Operadores ou terceiros com acesso aos logs obtêm senhas utilizáveis e dados pessoais/clínicos. A reprodução com valores fictícios confirmou senha e hash nos logs.

## Sugestão de correção
Substituir dumps de body/resposta por metadados permitidos e redigir campos sensíveis recursivamente quando necessário. Retirar logs duplicados e tratar acesso/retencão dos logs existentes; avaliar troca das senhas expostas.

## Critérios de aceite
- [ ] Login, cadastro e edição não deixam senha/password/hash nos logs.
- [ ] Respostas clínicas não são registradas integralmente.
- [ ] Testes capturam saída de log e validam ausência de valores sentinela.
- [ ] Logs preexistentes têm acesso e retenção revisados.
--- FIM ISSUE 8 ---

--- ISSUE 9 — A09 ---
# [Segurança] App persiste senha em preferências locais

Labels sugeridas: security, média

## Descrição
Após login bem-sucedido, o app grava a senha original em SharedPreferences e a recupera para novo login automático. O código não utiliza armazenamento protegido para esse valor. O bundle local também contém a gravação da chave saved_password, sem uma senha literal embutida.

## Condições de explorabilidade
Login bem-sucedido e acesso ao armazenamento local, perfil do navegador ou contexto comprometido. Não se afirma que um outro app Android sem privilégios possa ler o sandbox.

## Evidência
../insulog-mobile-front-clone/lib/services/local/saved_login_service.dart:20–28

```text
20:   Future<void> saveCredentials({
21:     required int userId,
22:     required String username,
23:     required String password,
24:   }) async {
25:     final prefs = await SharedPreferences.getInstance();
26:     await prefs.setInt(_userIdKey, userId);
27:     await prefs.setString(_usernameKey, username);
28:     await prefs.setString(_passwordKey, password);
```

../insulog-mobile-front-clone/lib/states/login_form_state.dart:54–59

```text
54:       final loginData = await AuthService().login(username, password);
55:       await _savedLoginService.saveCredentials(
56:         userId: loginData.userId,
57:         username: username,
58:         password: password,
59:       );
```

Demais locais afetados (trechos completos na análise A09 do relatório):
../insulog-mobile-front-clone/lib/services/local/saved_login_service.dart:31–35; ../insulog-mobile-front-clone/lib/states/login_form_state.dart:111–115.

## Impacto
Quem obtiver acesso ao armazenamento da aplicação pode recuperar a senha reutilizável. No artefato web, as preferências usam armazenamento do navegador; não foi demonstrado um XSS para acessá-lo.

## Sugestão de correção
Eliminar persistência de senha. Usar sessão revogável/expirável, com armazenamento apropriado à plataforma: Keychain/Keystore no app nativo e cookie HttpOnly/Secure quando a arquitetura web permitir. Limpar a chave antiga na migração.

## Critérios de aceite
- [ ] Não existe senha original nas preferências após login.
- [ ] A migração remove saved_password de instalações existentes.
- [ ] Logout/revogação invalidam a sessão e limpam o armazenamento.
- [ ] Autologin funciona com credencial de sessão revogável, sem guardar senha.
--- FIM ISSUE 9 ---

--- ISSUE 10 — A10 ---
# [Segurança] App envia login e dados clínicos por HTTP

Labels sugeridas: security, alta

## Descrição
A URL base é construída exclusivamente com http://, e o manifesto Android principal permite tráfego sem TLS. A senha é enviada em JSON para /login por essa mesma URL. O relatório também usa a URL base sem HTTPS.

## Condições de explorabilidade
Atacante com visibilidade/controle do caminho de rede e uso da URL HTTP produzida pelo app. Um túnel externo pode mitigar o transporte, mas não foi encontrado no escopo. Não houve interceptação de tráfego real.

## Evidência
../insulog-mobile-front-clone/lib/services/local/api_ip_service.dart:18–26

```text
18:   Future<String> getBaseUrl() async {
19:     final savedIp = await getApiIpDigits();
20:     final ip =
21:         (isValidIp(savedIp) ? savedIp : null) ??
22:         formatDigitsAsIp(savedIp) ??
23:         formatDigitsAsIp(_defaultApiIpDigits) ??
24:         '10.173.57.47';
25: 
26:     return 'http://$ip:$_apiPort';
```

../insulog-mobile-front-clone/lib/services/api/auth_service.dart:12–17

```text
12:   Future<LoginData> login(String username, String password) async {
13:     try {
14:       final response = await _apiService.post('login', {
15:         'username': username,
16:         'password': password,
17:       });
```

../insulog-mobile-front-clone/android/app/src/main/AndroidManifest.xml:10–15

```text
10:     <application
11:         android:label="insulog"
12:         android:name="${applicationName}"
13:         android:icon="@mipmap/ic_launcher"
14:         android:enableOnBackInvokedCallback="true"
15:         android:usesCleartextTraffic="true">
```

Demais locais afetados (trechos completos na análise A10 do relatório):
../insulog-mobile-front-clone/lib/services/api/api_service.dart:28–32; ../insulog-mobile-front-clone/lib/services/api/report_export_service.dart:58–70.

## Impacto
Observador ou intermediário no caminho de rede pode ler credenciais e dados clínicos; um intermediário ativo pode alterar respostas. Isto independe de CORS e do hash da senha no banco.

## Sugestão de correção
Disponibilizar API com HTTPS e certificado válido, permitir URL segura no cliente e bloquear tráfego HTTP nas configurações de produção. Se HTTP for necessário no desenvolvimento, restringi-lo a configuração específica de debug.

## Critérios de aceite
- [ ] Build de produção só envia credenciais e registros por HTTPS.
- [ ] HTTP e certificado inválido são rejeitados em produção.
- [ ] Manifesto de release não permite tráfego em claro.
- [ ] Download PDF/XLSX usa a mesma política TLS.
--- FIM ISSUE 10 ---
