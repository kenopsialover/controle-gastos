// Simula o banco no navegador (localStorage), com as mesmas respostas do Banco.java.
// Serve para testar a interface fora do celular. No APK ele não é usado.
const Mock = (() => {
  const ler = () => JSON.parse(localStorage.getItem('cg') || '{"us":[],"gs":[],"n":1,"sessao":0}');
  const gravar = (d) => localStorage.setItem('cg', JSON.stringify(d));
  const E = (erro, login) => JSON.stringify({ erro, login: !!login });
  const OK = JSON.stringify({ ok: true });
  async function hash(senha, sal) {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
    const b = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(sal), iterations: 120000 }, k, 256);
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  function validarGasto(d) {
    const g = { descricao: String(d.descricao || '').trim(), valor_centavos: Number(d.valor_centavos) || 0, categoria: String(d.categoria || '').trim(), data: String(d.data || '').trim() };
    if (!g.descricao || g.descricao.length > 100) return 'Informe a descrição (até 100 caracteres).';
    if (g.valor_centavos < 1) return 'Informe um valor maior que zero.';
    if (!g.categoria) return 'Escolha uma categoria.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g.data)) return 'Informe uma data válida.';
    return g;
  }
  async function chamar(m, d) {
    const db = ler(), uid = db.sessao;
    if (m === 'registro') {
      const nome = String(d.nome || '').trim(), email = String(d.email || '').trim().toLowerCase(), senha = String(d.senha || '');
      if (!nome) return E('Informe seu nome (até 100 caracteres).');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return E('Informe um e-mail válido.');
      if (senha.length < 6) return E('A senha deve ter de 6 a 100 caracteres.');
      if (db.us.some((u) => u.email === email)) return E('Já existe uma conta com esse e-mail.');
      const sal = Math.random().toString(36).slice(2), id = db.n++;
      db.us.push({ id, nome, email, sal, hash: await hash(senha, sal), criado_em: new Date().toISOString().slice(0, 10) });
      db.sessao = id; gravar(db); return OK;
    }
    if (m === 'login') {
      const u = db.us.find((x) => x.email === String(d.email || '').trim().toLowerCase());
      if (!u || u.hash !== await hash(String(d.senha || ''), u.sal)) return E('E-mail ou senha incorretos.');
      db.sessao = u.id; gravar(db); return OK;
    }
    if (m === 'logout') { db.sessao = 0; gravar(db); return OK; }
    const u = db.us.find((x) => x.id === uid);
    if (!u) return E('Faça login para continuar.', true);
    if (m === 'eu') return JSON.stringify({ nome: u.nome, email: u.email, criado_em: u.criado_em });
    if (m === 'gasto_criar' || m === 'gasto_atualizar') {
      const g = validarGasto(d);
      if (typeof g === 'string') return E(g);
      if (m === 'gasto_criar') db.gs.push({ ...g, id: db.n++, uid });
      else { const i = db.gs.findIndex((x) => x.id === d.id && x.uid === uid); if (i < 0) return E('Gasto não encontrado.'); db.gs[i] = { ...db.gs[i], ...g }; }
      gravar(db); return OK;
    }
    if (m === 'gasto_excluir') {
      const antes = db.gs.length; db.gs = db.gs.filter((x) => !(x.id === d.id && x.uid === uid));
      if (db.gs.length === antes) return E('Gasto não encontrado.');
      gravar(db); return OK;
    }
    if (m === 'relatorio') {
      const rs = db.gs.filter((x) => x.uid === uid && x.data.slice(0, 7) === d.mes).sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);
      const por = {};
      rs.forEach((x) => { por[x.categoria] = por[x.categoria] || { total: 0, quantidade: 0 }; por[x.categoria].total += x.valor_centavos; por[x.categoria].quantidade++; });
      return JSON.stringify({
        quantidade: rs.length, total: rs.reduce((s, x) => s + x.valor_centavos, 0), maior: Math.max(0, ...rs.map((x) => x.valor_centavos)),
        categorias: Object.entries(por).map(([categoria, v]) => ({ categoria, ...v })).sort((a, b) => b.total - a.total),
        registros: rs.map(({ id, descricao, valor_centavos, categoria, data }) => ({ id, descricao, valor_centavos, categoria, data })),
      });
    }
    return E('Operação desconhecida.');
  }
  return { chamar };
})();
