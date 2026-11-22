'use strict';
// Telas do app. No celular fala com o SQLite (Android.chamar); no navegador usa o Mock (localStorage).
const $ = (s) => document.querySelector(s);
const CATS = ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Estudos', 'Outros'];
const LOGADAS = ['resumo', 'novo', 'gastos', 'relatorio'];
const nativo = !!(window.Android && window.Android.chamar);
const dois = (n) => String(n).padStart(2, '0');
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`; };
const somaMes = (m, n) => { const [a, b] = m.split('-').map(Number); const d = new Date(a, b - 1 + n, 1); return `${d.getFullYear()}-${dois(d.getMonth() + 1)}`; };
const rotuloMes = (m) => { const [a, b] = m.split('-').map(Number); return new Date(a, b - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); };
const dataBR = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);
let mes = hoje().slice(0, 7), user = null, editando = null, tela = '';

async function api(metodo, dados = {}) {
  const txt = nativo ? window.Android.chamar(metodo, JSON.stringify(dados)) : await Mock.chamar(metodo, dados);
  const r = JSON.parse(txt);
  if (r.erro) { if (r.login) ir('login'); throw new Error(r.erro); }
  return r;
}

function h(tag, cls, texto) { // textContent evita injeção de HTML
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto != null) e.textContent = texto;
  return e;
}
function aviso(texto, tipo = 'erro') { const e = $('#msg'); e.textContent = texto || ''; e.className = 'aviso aviso--' + tipo; e.hidden = !texto; }

function parseValor(s) { // "12,50" -> 1250 (centavos); "1.250,00" também funciona
  s = s.trim().replace(/[^\d.,]/g, '');
  if (s.includes(',') || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  const n = Math.round(parseFloat(s) * 100);
  return isNaN(n) ? 0 : n;
}

function comparar(atual, anterior, mesAnt) {
  if (!anterior) return 'Sem gastos em ' + rotuloMes(mesAnt) + ' para comparar.';
  const dif = atual - anterior;
  if (!dif) return 'Igual a ' + rotuloMes(mesAnt) + '.';
  return brl(Math.abs(dif)) + (dif > 0 ? ' a mais' : ' a menos') + ' que em ' + rotuloMes(mesAnt) + '.';
}

// ---------- Navegação ----------
async function ir(nome) {
  tela = nome; aviso('');
  document.querySelectorAll('.tela').forEach((t) => { t.hidden = t.id !== 'v-' + nome; });
  const logada = LOGADAS.includes(nome);
  $('#topo').hidden = $('#abas').hidden = !logada;
  $('#mesbar').hidden = !['gastos', 'relatorio'].includes(nome);
  document.querySelectorAll('#abas button').forEach((b) => b.classList.toggle('ativa', b.dataset.ir === nome));
  window.scrollTo(0, 0);
  if (nome === 'novo') return preencherForm();
  if (!logada) return;
  $('#mes-nome').textContent = rotuloMes(mes);
  try { await ({ resumo, gastos, relatorio })[nome](); } catch (e) { aviso(e.message); }
}

window.voltar = () => { // chamado pelo botão voltar do Android
  if (tela === 'registro') { ir('login'); return true; }
  if (['novo', 'gastos', 'relatorio'].includes(tela)) { editando = null; ir('resumo'); return true; }
  return false;
};

// ---------- Telas ----------
async function resumo() {
  const atual = hoje().slice(0, 7), ant = somaMes(atual, -1);
  const [r, p] = await Promise.all([api('relatorio', { mes: atual }), api('relatorio', { mes: ant })]);
  $('#ola').textContent = 'Olá, ' + user.nome.split(' ')[0];
  $('#r-rotulo').textContent = 'Gasto em ' + rotuloMes(atual);
  $('#r-total').textContent = brl(r.total);
  $('#r-comp').textContent = comparar(r.total, p.total, ant);
  lista($('#r-recentes'), r.registros.slice(0, 5), false);
}

async function gastos() { lista($('#lista'), (await api('relatorio', { mes })).registros, true); }

async function relatorio() {
  const ant = somaMes(mes, -1);
  const [r, p] = await Promise.all([api('relatorio', { mes }), api('relatorio', { mes: ant })]);
  $('#rel-nome').textContent = user.nome;
  $('#rel-email').textContent = user.email;
  $('#rel-desde').textContent = 'Conta criada em ' + user.criado_em.slice(0, 10).split('-').reverse().join('/');
  $('#rel-total').textContent = brl(r.total);
  $('#rel-comp').textContent = comparar(r.total, p.total, ant);
  $('#rel-qtd').textContent = r.quantidade;
  $('#rel-maior').textContent = brl(r.maior);
  $('#rel-media').textContent = brl(r.quantidade ? Math.round(r.total / r.quantidade) : 0);
  const box = $('#rel-cats');
  box.replaceChildren();
  if (!r.categorias.length) box.append(h('p', 'vazio', 'Nenhum gasto neste mês.'));
  r.categorias.forEach((c) => {
    const pct = Math.round(c.total * 100 / r.total);
    const topo = h('div', 'barra__topo');
    topo.append(h('span', null, c.categoria), h('span', 'valor', `${brl(c.total)} (${pct}%)`));
    const cheia = h('div', 'barra__cheia');
    cheia.style.width = pct + '%';
    const trilho = h('div', 'barra__trilho');
    trilho.append(cheia);
    const barra = h('div', 'barra');
    barra.append(topo, trilho);
    box.append(barra);
  });
  lista($('#rel-regs'), r.registros, false);
}

function lista(box, regs, acoes) {
  box.replaceChildren();
  if (!regs.length) { box.append(h('p', 'vazio', 'Nenhum gasto neste mês. Toque em Novo para cadastrar.')); return; }
  regs.forEach((g) => {
    const c = h('article', 'item'), topo = h('div', 'item__linha'), meta = h('div', 'item__meta');
    topo.append(h('strong', null, g.descricao), h('span', 'valor', brl(g.valor_centavos)));
    meta.append(h('span', 'pill', g.categoria), h('span', null, dataBR(g.data)));
    c.append(topo, meta);
    if (acoes) {
      const ed = h('button', 'btn btn--sec', 'Editar'), ex = h('button', 'btn btn--perigo', 'Excluir'), a = h('div', 'acoes');
      ed.type = ex.type = 'button';
      ed.onclick = () => { editando = g; ir('novo'); };
      ex.onclick = async () => { // confirmação em dois toques (sem confirm(), que não é confiável no WebView)
        if (!ex.dataset.certo) {
          ex.dataset.certo = 1; ex.textContent = 'Toque de novo';
          setTimeout(() => { delete ex.dataset.certo; ex.textContent = 'Excluir'; }, 3000);
          return;
        }
        try { await api('gasto_excluir', { id: g.id }); await ir('gastos'); aviso('Gasto excluído.', 'ok'); } catch (e) { aviso(e.message); }
      };
      a.append(ed, ex);
      c.append(a);
    }
    box.append(c);
  });
}

function preencherForm() {
  const g = editando;
  $('#f-titulo').textContent = g ? 'Editar gasto' : 'Novo gasto';
  $('#f-desc').value = g ? g.descricao : '';
  $('#f-valor').value = g ? (g.valor_centavos / 100).toFixed(2).replace('.', ',') : '';
  $('#f-cat').value = g ? g.categoria : CATS[0];
  $('#f-data').value = g ? g.data : hoje();
  $('#f-salvar').textContent = g ? 'Salvar alterações' : 'Salvar gasto';
  $('#f-cancelar').hidden = !g;
}

// ---------- Eventos ----------
document.querySelectorAll('[data-ir]').forEach((b) => { b.onclick = () => { editando = null; ir(b.dataset.ir); }; });
$('#mes-ant').onclick = () => { mes = somaMes(mes, -1); ir(tela); };
$('#mes-prox').onclick = () => { mes = somaMes(mes, 1); ir(tela); };
$('#f-cancelar').onclick = () => { editando = null; ir('gastos'); };

async function entrar() {
  user = await api('eu');
  mes = hoje().slice(0, 7);
  document.querySelectorAll('form').forEach((f) => f.reset());
  ir('resumo');
}

$('#form-login').onsubmit = async (ev) => {
  ev.preventDefault();
  try { await api('login', { email: $('#l-email').value, senha: $('#l-senha').value }); await entrar(); } catch (e) { aviso(e.message); }
};

$('#form-registro').onsubmit = async (ev) => {
  ev.preventDefault();
  if ($('#r-senha').value !== $('#r-conf').value) return aviso('As senhas não conferem.');
  try {
    await api('registro', { nome: $('#r-nome').value, email: $('#r-email').value, senha: $('#r-senha').value });
    await entrar();
  } catch (e) { aviso(e.message); }
};

$('#sair').onclick = async () => { try { await api('logout'); } catch (e) { /* segue para o login */ } user = null; ir('login'); };

$('#form-gasto').onsubmit = async (ev) => {
  ev.preventDefault();
  const dados = { descricao: $('#f-desc').value, valor_centavos: parseValor($('#f-valor').value), categoria: $('#f-cat').value, data: $('#f-data').value };
  try {
    const edicao = !!editando;
    if (edicao) await api('gasto_atualizar', { ...dados, id: editando.id }); else await api('gasto_criar', dados);
    editando = null; mes = dados.data.slice(0, 7); // mostra o mês do gasto salvo
    await ir('gastos');
    aviso(edicao ? 'Alterações salvas.' : 'Gasto salvo.', 'ok');
  } catch (e) { aviso(e.message); }
};

CATS.forEach((c) => $('#f-cat').append(new Option(c, c)));
entrar().catch(() => ir('login'));
