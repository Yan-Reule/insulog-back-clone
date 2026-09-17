// Regera PDF, relatório Markdown e issues a partir do snapshot dados-auditoria.json.
// Dependência: PDFKit, já declarada no package.json da API. Nenhuma instalação global.
const fs = require('node:fs')
const path = require('node:path')
const PDFDocument = require('pdfkit')
const dir = __dirname
const data = JSON.parse(fs.readFileSync(path.join(dir, 'dados-auditoria.json')))
const colors = { crítica: '#B91C1C', alta: '#EA580C', média: '#D97706', baixa: '#2563EB', informativa: '#64748B', forte: '#059669' }
const ink = '#172C3D', muted = '#526777', pale = '#EFF4F7'
const counts = Object.fromEntries(['crítica', 'alta', 'média', 'baixa', 'informativa'].map(s => [s, data.findings.filter(f => f.severity === s).length]))
const ref = e => `${e.file}:${e.start}${e.end !== e.start ? '–' + e.end : ''}${e.revision ? ' @ ' + e.revision.slice(0, 12) : ''}`
function issue(f, i) {
  const indexes = { A01: [0, 1], A02: [2, 4], A03: [1, 4, 8], A04: [1, 4], A05: [0, 1, 4], A06: [0, 1, 5], A07: [0, 1], A08: [0, 2], A09: [0, 2], A10: [0, 1, 3] }[f.id]
  const excerpts = indexes.map(index => f.evidence[index])
  const other = f.evidence.filter((_, index) => !indexes.includes(index))
  return `--- ISSUE ${i + 1} — ${f.id} ---\n# [Segurança] ${f.title}\n\nLabels sugeridas: security, ${f.severity}\n\n## Descrição\n${f.description}\n\n## Condições de explorabilidade\n${f.condition}\n\n## Evidência\n${excerpts.map(e => `${ref(e)}\n\n\`\`\`text\n${e.code}\n\`\`\``).join('\n\n')}${other.length ? '\n\nDemais locais afetados (trechos completos na análise ' + f.id + ' do relatório):\n' + other.map(ref).join('; ') + '.' : ''}\n\n## Impacto\n${f.impact}\n\n## Sugestão de correção\n${f.fix}\n\n## Critérios de aceite\n${f.accept.map(a => '- [ ] ' + a).join('\n')}\n--- FIM ISSUE ${i + 1} ---`
}
const issues = data.findings.map(issue)
fs.writeFileSync(path.join(dir, 'issues-github.md'), '# ISSUES PARA O GITHUB\n\nTextos preparados; nenhuma issue foi publicada. Linhas referem-se aos commits auditados.\n\n' + issues.join('\n\n') + '\n')
let md = `# Relatório de Auditoria de Segurança — ${data.project}\n\nData: ${data.date}\n\nAPI: ${data.backend_head}\n\nApp: ${data.frontend_head}\n\n${data.scope}\n\n## Stack\n${data.stack}\n\n## Resumo executivo\n${data.findings.length} achados: ${Object.entries(counts).map(([s, n]) => `${n} ${s}`).join('; ')}.\n\nSete achados nas cinco categorias pedidas e três adicionais. Categorias 1–3 compartilham ausência de autenticação; contabilizadas por superfície/correção e sem duplicar uma mesma rota entre A01 e A02–A04.\n\n## Metodologia\n`
for (const c of data.categories) md += `\n### ${c.name}\n${c.mapping}\n\n${c.result}\n`
md += '\n## Pontos fortes\n'
for (const s of data.strengths) md += `\n### ${s.title}\n${s.text}\n\nEvidência: ${s.refs.join('; ')}.\n`
md += '\n## Achados\n'
for (const f of data.findings) md += `\n### ${f.id} — ${f.title} (${f.severity})\nCategoria: ${f.category}\n\n${f.description}\n\nImpacto: ${f.impact}\n\nCondições: ${f.condition}\n\n${f.evidence.map(e => `**${ref(e)}**\n\n\`\`\`text\n${e.code}\n\`\`\``).join('\n\n')}\n\nCorreção: ${f.fix}\n`
md += '\n## Recomendações\n' + data.recommendations.map(([p, title, body]) => `\n- **${p} — ${title}:** ${body}`).join('\n')
md += '\n\n## Limitações e validação\n' + data.limitations.map(x => '\n- ' + x).join('\n')
md += '\n\n## Cobertura de todos os handlers\n\n'
for (const r of data.coverage) md += `### ${r.method} ${r.route}\n${r.result}\n\nRota: ${r.route_file}\n\nController: ${r.controller}\n\nServiço: ${r.service}\n\nRepository: ${r.repository}\n\n`
md += '\n## ISSUES PARA O GITHUB\n\n' + issues.join('\n\n') + '\n'
fs.writeFileSync(path.join(dir, 'relatorio-auditoria-seguranca.md'), md)

const doc = new PDFDocument({ autoFirstPage: false, size: 'A4', margin: 57, bufferPages: true, info: { Title: 'Relatório de Auditoria de Segurança — Insulog', Author: 'Auditoria de código', Subject: 'Revisão estática e reproduções locais — 17/09/2026' } })
const output = fs.createWriteStream(path.join(dir, 'relatorio-auditoria-seguranca.pdf'))
doc.pipe(output)
const fontDir = process.env.AUDIT_FONT_DIR || '/usr/share/fonts/truetype/dejavu'
const useFont = (name, file, fallback) => doc.registerFont(name, fs.existsSync(path.join(fontDir, file)) ? path.join(fontDir, file) : fallback)
useFont('body', 'DejaVuSans.ttf', 'Helvetica')
useFont('bold', 'DejaVuSans-Bold.ttf', 'Helvetica-Bold')
useFont('mono', 'DejaVuSansMono.ttf', 'Courier')
const M = 57, W = 481.28, BOTTOM = 777
let y = 85, section = '', page = 0
const layout = []
function font(name = 'body', size = 9.1, color = ink) { doc.font(name).fontSize(size).fillColor(color) }
function pageNew(title = section) {
  section = title; doc.addPage(); page++; y = 82
  doc.rect(0, 0, 595.28, 7).fill('#0F766E')
  font('bold', 8, muted)
  doc.text('INSULOG  /  AUDITORIA DE SEGURANÇA', M, 32, { width: W, lineBreak: false })
  doc.strokeColor('#D7E2E8').lineWidth(0.6).moveTo(M, 53).lineTo(M + W, 53).stroke()
  if (title) { font('bold', 16); doc.text(title, M, y, { width: W }); y = doc.y + 17 }
}
function ensure(h) { if (y + h > BOTTOM) pageNew(section + (section.endsWith(' · continuação') ? '' : ' · continuação')) }
function para(text, options = {}) {
  const size = options.size || 9.1, color = options.color || ink, name = options.bold ? 'bold' : 'body'
  font(name, size, color)
  const h = doc.heightOfString(text, { width: W, lineGap: 2 })
  ensure(h + 6); font(name, size, color)
  doc.text(text, M, y, { width: W, lineGap: 2 }); y = doc.y + 6
  layout.push({ page, type: 'paragraph', bottom: y })
}
function heading(text) { ensure(78); para(text, { size: 11.2, bold: true }) }
function chip(severity, x, yy, width = 68) {
  doc.roundedRect(x, yy, width, 19, 4).fill(colors[severity])
  font('bold', 8, '#FFFFFF'); doc.text(severity.toUpperCase(), x + 4, yy + 4, { width: width - 8, align: 'center', lineBreak: false })
}
function wrapCode(line, width = W - 20) {
  font('mono', 7.4)
  const lines = []
  let rest = line
  while (doc.widthOfString(rest) > width) {
    let n = 1
    while (n < rest.length && doc.widthOfString(rest.slice(0, n + 1)) <= width) n++
    lines.push(rest.slice(0, n)); rest = '    ' + rest.slice(n)
  }
  lines.push(rest || ' '); return lines
}
function code(text) {
  for (const logical of text.split('\n')) {
    for (const line of wrapCode(logical)) {
      ensure(13)
      doc.rect(M, y - 2, W, 13).fill(pale)
      font('mono', 7.4); doc.text(line, M + 10, y, { width: W - 20, lineBreak: false })
      y += 12
    }
  }
  y += 10
}
function evidence(e) { ensure(68); para(ref(e), { size: 8.1, bold: true, color: '#1D4ED8' }); code(e.code) }
function table(headers, rows, widths) {
  const head = () => {
    ensure(35); doc.rect(M, y, W, 26).fill(ink)
    let x = M
    headers.forEach((h, i) => { font('bold', 8, '#FFFFFF'); doc.text(h, x + 6, y + 8, { width: widths[i] - 12, lineBreak: false }); x += widths[i] })
    y += 26
  }
  head()
  for (const row of rows) {
    font('body', 8.1)
    const h = Math.max(36, ...row.map((c, i) => doc.heightOfString(c, { width: widths[i] - 12, lineGap: 2 }) + 15))
    if (y + h > BOTTOM) { pageNew(); head() }
    const yy = y; let x = M
    row.forEach((c, i) => {
      doc.rect(x, yy, widths[i], h).fill('#F4F7F9')
      if (i === 0 && colors[c]) chip(c, x + 5, yy + 8, widths[i] - 10)
      else { font('body', 8.1); doc.text(c, x + 6, yy + 7, { width: widths[i] - 12, lineGap: 2 }) }
      x += widths[i]
    })
    doc.strokeColor('#D7E2E8').moveTo(M, yy + h).lineTo(M + W, yy + h).stroke()
    y = yy + h
    layout.push({ page, type: 'table-row', bottom: y })
  }
  y += 14
}

pageNew('')
y = 127
para('RELATÓRIO DE AUDITORIA\nDE SEGURANÇA', { bold: true, size: 26 })
para('Insulog', { bold: true, size: 24, color: '#0F766E' })
para('API api-insulog + aplicativo Flutter', { size: 13, color: muted })
y += 12
para(data.date + '  •  Revisão de código e validação local', { bold: true })
para(data.scope)
heading('Nota metodológica')
para('As cinco categorias foram adaptadas a Express/MySQL e Flutter: isolamento por dono nas queries, autorização no servidor, referências diretas em todas as rotas, segredos no código/histórico/bundle e sinks de HTML/JavaScript. Achados adicionais de credenciais foram identificados à parte. Só riscos sustentados no código são reportados; ausência de contexto de produção é explicitada.')
para('API: ' + data.backend_head + '\nApp: ' + data.frontend_head, { size: 8, color: muted })
para('10 achados  •  49 registros de rota  •  36 commits locais', { size: 12, bold: true })

pageNew('Resumo executivo')
para('A API expõe dados privados e aceita alterações por IDs controlados pelo chamador. O login confere senha, mas não estabelece uma identidade exigida pelas demais rotas. As prioridades são autenticação com posse, rotação das credenciais históricas e proteção das senhas em trânsito e logs.')
table(['Crítica', 'Alta', 'Média', 'Baixa', 'Informativa'], [[...Object.values(counts).map(String)]], [96, 96, 96, 96, 97.28])
const chartY = y + 10, cx = M + 87, cy = chartY + 88, radius = 63
let angle = -Math.PI / 2
for (const [s, n] of Object.entries(counts)) {
  if (!n) continue
  const end = angle + Math.PI * 2 * n / data.findings.length
  doc.moveTo(cx, cy).lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle))
  for (let a = angle; a <= end; a += 0.018) doc.lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a))
  doc.lineTo(cx + radius * Math.cos(end), cy + radius * Math.sin(end)).closePath().fill(colors[s]); angle = end
}
doc.circle(cx, cy, 39).fill('#FFFFFF')
font('bold', 22); doc.text('10', cx - 30, cy - 17, { width: 60, align: 'center', lineBreak: false })
font('body', 8, muted); doc.text('achados', cx - 30, cy + 12, { width: 60, align: 'center', lineBreak: false })
let ly = chartY + 25
for (const [s, n] of Object.entries(counts)) { doc.circle(M + 211, ly + 5, 4).fill(colors[s]); font('body', 9); doc.text(`${s}: ${n}`, M + 224, ly, { lineBreak: false }); ly += 24 }
y = chartY + 183
heading('Achados por categoria')
for (const c of data.categories) {
  const n = data.findings.filter(f => f.category === c.name).length
  font('body', 8.5); doc.text(c.name, M, y + 3, { width: 142, lineBreak: false })
  doc.rect(M + 149, y, 285, 17).fill(pale)
  if (n) doc.rect(M + 149, y, 285 * n / 3, 17).fill('#0F766E')
  font('bold', 9); doc.text(String(n), M + 444, y + 3, { width: 20, lineBreak: false }); y += 29
}
y += 10
para('Sete achados no escopo principal e três adicionais. Contagem por achado, sem multiplicar pelo número de rotas. Ausência de XSS verificado não significa aprovação geral de segurança.', { size: 8.3, color: muted })

pageNew('Stack, escopo e método')
para(data.stack)
for (const c of data.categories) { heading(c.name); para(c.mapping); para(c.result, { color: muted }) }
pageNew('Pontos fortes e pontos fracos')
for (const s of data.strengths) { heading(s.title); para(s.text); para(s.refs.join('  |  '), { size: 7.8, color: colors.forte }) }
heading('Pontos fracos centrais')
para('Não há router de dados privados com posse integralmente protegida. As validações encontradas verificam formato ou existência. Os filtros id_usuario não isolam usuários quando o próprio solicitante escolhe esse ID. CORS não é autenticação. Credenciais históricas e senhas em logs/armazenamento/tráfego agravam a exposição.')

pageNew('Achados por categoria')
for (const c of data.categories) {
  heading(c.name)
  const fs = data.findings.filter(f => f.category === c.name)
  if (!fs.length) para('Nenhum achado verificado. ' + c.result)
  else table(['Severidade', 'Arquivo:linha (entrada)', 'Descrição'], fs.map(f => [f.severity, ref(f.evidence[0]), `${f.id} — ${f.title}`]), [75, 193, 213.28])
}
for (const f of data.findings) {
  pageNew(`${f.id} · Evidências e análise`)
  chip(f.severity, M, y); y += 30
  heading(f.title); para(f.category, { color: muted, size: 8.5 })
  para(f.description)
  heading('Impacto'); para(f.impact)
  heading('Condições de explorabilidade'); para(f.condition)
  heading('Arquivo por arquivo, linha por linha')
  for (const e of f.evidence) evidence(e)
  heading('Correção recomendada'); para(f.fix)
}

pageNew('Recomendações priorizadas')
for (const [p, title, body] of data.recommendations) { heading(`${p} — ${title}`); para(body) }
pageNew('Validação e limites da auditoria')
for (const l of data.limitations) para('• ' + l)
para('Artefatos reproduzíveis: verificar-auditoria.cjs; validacao-http.json; cobertura-rotas.csv; inventario-e-varredura.json; verificacao-bundle.json. O script de reprodução afirma o comportamento vulnerável atual; seus resultados positivos não significam que a aplicação esteja segura.', { bold: true })

pageNew('Cobertura de todos os handlers')
para('49 registros Express: 48 alcançáveis e 1 sombreado. A matriz CSV contém o encadeamento completo até funções dos repositories. Abaixo, cada registro com resultado da revisão. As leituras de catálogos e o endpoint de saúde/login têm exposição intencional compatível com o código; demais rotas não têm identidade/posse validada.')
table(['Método / rota', 'Rota / controller', 'Resultado da revisão'], data.coverage.map(r => [r.method + ' ' + r.route, r.route_file + '\n' + r.controller, r.result]), [134, 181, 166.28])

pageNew('ISSUES PARA O GITHUB')
para('Textos completos em Markdown, delimitados para cópia. Dez issues propostas; nenhuma foi publicada. Também disponíveis sem quebras de paginação em issues-github.md. A01–A04 devem compartilhar a implementação de autenticação, preservando testes específicos por superfície. Valores históricos permanecem ocultados.')
for (let i = 0; i < issues.length; i++) {
  if (i) pageNew(`ISSUES PARA O GITHUB · ${i + 1}`)
  const lines = issues[i].split('\n')
  let inCode = false
  for (const line of lines) {
    if (line.startsWith('```')) { inCode = !inCode; code(line); continue }
    if (inCode) { code(line); y -= 10; continue }
    if (!line) { y += 5; continue }
    if (line.startsWith('# ') || line.startsWith('## ')) { ensure(42); para(line, { bold: true, size: line.startsWith('# ') ? 10.2 : 9.3 }) }
    else if (line.startsWith('--- ')) para(line, { bold: true, color: '#0F766E', size: 9 })
    else para(line, { size: 8.3 })
  }
}
const range = doc.bufferedPageRange()
for (let i = 0; i < range.count; i++) {
  doc.switchToPage(i)
  const bottom = doc.page.margins.bottom; doc.page.margins.bottom = 0
  doc.strokeColor('#D7E2E8').lineWidth(0.6).moveTo(M, 791).lineTo(M + W, 791).stroke()
  font('body', 7, muted)
  doc.text('Relatório de Auditoria de Segurança — Insulog', M, 802, { width: 365, lineBreak: false })
  doc.text(`${i + 1} / ${range.count}`, M + 389, 802, { width: 92, align: 'right', lineBreak: false })
  doc.page.margins.bottom = bottom
}
doc.end()
output.on('finish', () => {
  const validation = { pages: range.count, size: 'A4', margins_pt: 57, findings: data.findings.length, severity: counts, max_content_bottom: Math.max(...layout.map(x => x.bottom)), note: 'Layout vetorial. Rasterizar e inspecionar antes de entregar.' }
  fs.writeFileSync(path.join(dir, 'validacao-layout.json'), JSON.stringify(validation, null, 2) + '\n')
  console.log(JSON.stringify(validation, null, 2))
})
