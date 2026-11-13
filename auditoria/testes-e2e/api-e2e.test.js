// Testes E2E de API / regressao contra o servidor de auditoria (sem dependencias).
// Requer: node auditoria/harness/start-audit-server.js rodando em 127.0.0.1:3999.
// Executar: node --test auditoria/testes-e2e/
//
// Observacao: o controle de tentativas de senha e por IP e todos os testes
// partem de 127.0.0.1. Por isso tudo roda em UM arquivo, em serie, e um hook
// afterEach faz login correto para zerar o contador de falhas entre os testes.
const { test, describe, before, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const BASE = process.env.AUDIT_BASE || "http://127.0.0.1:3999";
const SENHA = process.env.AUDIT_SENHA || "senha-de-auditoria-forte-123";
const TIMEOUT = 20_000;
const SUF = Date.now().toString(36); // evita colisao entre repeticoes
const mail = (n) => `e2e-${n}-${SUF}@example.test`;

async function chamar(metodo, caminho, { json, corpoBruto, headers = {}, timeout = TIMEOUT } = {}) {
  const h = { ...headers };
  let body;
  if (json !== undefined) { h["content-type"] = "application/json"; body = JSON.stringify(json); }
  if (corpoBruto !== undefined) { h["content-type"] = h["content-type"] || "application/json"; body = corpoBruto; }
  const t0 = Date.now();
  const r = await fetch(BASE + caminho, { method: metodo, headers: h, body, signal: AbortSignal.timeout(timeout) });
  const texto = await r.text();
  let corpo; try { corpo = JSON.parse(texto); } catch { corpo = undefined; }
  return { status: r.status, headers: r.headers, texto, corpo, ms: Date.now() - t0 };
}
const comSenha = (obj = {}) => ({ senha: SENHA, ...obj });
const login = () => chamar("POST", "/api/verificar-senha", { json: { senha: SENHA }, timeout: 60_000 });
const semVazamento = (r) => {
  assert.ok(!/at .*\(.*:\d+:\d+\)|node_modules|C:\\|SyntaxError|ENOENT/.test(r.texto), `resposta vaza detalhe interno: ${r.texto.slice(0, 200)}`);
};
// requisicao crua (sem normalizacao de URL do fetch) para path traversal
function crua(caminho, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE);
    const rq = http.request({ host: u.hostname, port: u.port, path: caminho, method: "GET", headers }, (res) => {
      let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, texto: d }));
    });
    rq.on("error", reject); rq.setTimeout(TIMEOUT, () => rq.destroy(new Error("timeout"))); rq.end();
  });
}

before(async () => {
  const r = await chamar("GET", "/api/cidades").catch((e) => { throw new Error(`Servidor de auditoria inacessivel em ${BASE}: ${e.message}`); });
  assert.equal(r.status, 200);
  await login();
});
afterEach(async () => { await login(); });

describe("Login / verificar-senha", () => {
  test("senha correta retorna 200 e ok:true", async () => {
    const r = await chamar("POST", "/api/verificar-senha", { json: { senha: SENHA } });
    assert.equal(r.status, 200); assert.deepEqual(r.corpo, { ok: true });
  });
  test("senha incorreta retorna 401 com mensagem fixa", async () => {
    const r = await chamar("POST", "/api/verificar-senha", { json: { senha: "errada-errada-123" } });
    assert.equal(r.status, 401); assert.equal(r.corpo.ok, false); assert.equal(r.corpo.erro, "Senha incorreta.");
  });
  test("senha ausente (campo omitido) retorna 401", async () => {
    const r = await chamar("POST", "/api/verificar-senha", { json: {} });
    assert.equal(r.status, 401);
  });
  test("senha com tipo errado (numero/objeto/array) retorna 401", async () => {
    const r1 = await chamar("POST", "/api/verificar-senha", { json: { senha: 123456789012 } });
    assert.equal(r1.status, 401);
    const r2 = await chamar("POST", "/api/verificar-senha", { json: { senha: { $ne: "" } } });
    assert.equal(r2.status, 401);
  });
  test("senha gigante (> 1024 caracteres) e recusada com 401, sem erro 500", async () => {
    const r = await chamar("POST", "/api/verificar-senha", { json: { senha: "x".repeat(5000) } });
    assert.equal(r.status, 401);
  });
  test("requisicao sem corpo nem content-type retorna 401 (nao 500)", async () => {
    const r = await chamar("POST", "/api/verificar-senha");
    assert.equal(r.status, 401); semVazamento(r);
  });
  test("senha enviada na query string NAO e aceita", async () => {
    const r = await chamar("POST", `/api/verificar-senha?senha=${encodeURIComponent(SENHA)}`, { json: {} });
    assert.equal(r.status, 401);
  });
  test("atraso progressivo: a partir da 4a tentativa errada o servidor demora 0,5 s, 1 s...; senha correta tambem espera e zera o contador", { timeout: 60_000 }, async () => {
    const t = [];
    for (let i = 0; i < 5; i++) {
      const r = await chamar("POST", "/api/verificar-senha", { json: { senha: `errada-${i}-xxxxxx` }, timeout: 30_000 });
      assert.equal(r.status, 401); t.push(r.ms);
    }
    // falhas 1..3 nao tem atraso (a 3a tentativa avalia com 2 falhas registradas)
    assert.ok(t[0] < 400 && t[1] < 400 && t[2] < 400, `tentativas 1-3 deveriam ser rapidas: ${t}`);
    assert.ok(t[3] >= 450, `4a tentativa deveria esperar ~500ms: ${t}`);
    assert.ok(t[4] >= 900, `5a tentativa deveria esperar ~1000ms: ${t}`);
    const ok = await chamar("POST", "/api/verificar-senha", { json: { senha: SENHA }, timeout: 30_000 });
    assert.equal(ok.status, 200, "senha correta nunca deve ser bloqueada (sem 429)");
    assert.ok(ok.ms >= 1800, `senha correta tambem deve esperar o atraso (~2s): ${ok.ms}ms`);
    const depois = await chamar("POST", "/api/verificar-senha", { json: { senha: SENHA } });
    assert.equal(depois.status, 200); assert.ok(depois.ms < 400, `contador deveria ter zerado: ${depois.ms}ms`);
  });
});

describe("Rotas protegidas sem senha / com senha errada", () => {
  const SEM = { 401: 401 };
  const casos = [
    ["POST /api/responsaveis", "POST", "/api/responsaveis", { nome: "Fulano", email: mail("sem1") }],
    ["PUT /api/responsaveis", "PUT", "/api/responsaveis", { email: mail("sem1"), bases: ["macae"] }],
    ["DELETE /api/responsaveis", "DELETE", "/api/responsaveis", { email: mail("sem1") }],
    ["POST /api/responsaveis/consultar", "POST", "/api/responsaveis/consultar", {}],
    ["POST /api/gerar-relatorio", "POST", "/api/gerar-relatorio", {}],
  ];
  for (const [nome, m, p, corpo] of casos) {
    test(`${nome} sem senha retorna 401 e nao executa a acao`, async () => {
      const r = await chamar(m, p, { json: corpo });
      assert.equal(r.status, 401); assert.equal(r.corpo.ok, false);
      assert.ok(!r.texto.includes("@example.test"), "nao pode vazar e-mails");
    });
    test(`${nome} com senha errada retorna 401`, async () => {
      const r = await chamar(m, p, { json: { ...corpo, senha: "senha-errada-xyz" } });
      assert.equal(r.status, 401);
    });
  }
  test("cadastro sem senha nao cria registro (verificado via consulta autenticada)", async () => {
    await chamar("POST", "/api/responsaveis", { json: { nome: "Intruso", email: mail("intruso") } });
    const c = await chamar("POST", "/api/responsaveis/consultar", { json: comSenha() });
    assert.equal(c.status, 200);
    assert.ok(!c.texto.includes(mail("intruso")));
  });
  test("gerar-relatorio sem senha nao dispara o pipeline (resposta 401 com stage=authorization)", async () => {
    const r = await chamar("POST", "/api/gerar-relatorio", { json: {} });
    assert.equal(r.status, 401); assert.equal(r.corpo.stage, "authorization");
  });
  test("GET /relatorios/<pdf> sem credencial retorna 401 com WWW-Authenticate Basic", async () => {
    const r = await chamar("GET", "/relatorios/qualquer.pdf");
    assert.equal(r.status, 401);
    assert.match(r.headers.get("www-authenticate") || "", /^Basic/);
  });
  test("GET /relatorios/<pdf>?token=invalido retorna 401", async () => {
    const r = await chamar("GET", "/relatorios/qualquer.pdf?token=abc123");
    assert.equal(r.status, 401);
  });
  test("GET /relatorios/<pdf> com Basic errado retorna 401", async () => {
    const r = await chamar("GET", "/relatorios/qualquer.pdf", { headers: { authorization: "Basic " + Buffer.from("u:errada-errada").toString("base64") } });
    assert.equal(r.status, 401);
  });
  test("GET /relatorios/<pdf> com Basic correto mas arquivo nao gerado pelo servidor retorna 404", async () => {
    const r = await chamar("GET", "/relatorios/qualquer.pdf", { headers: { authorization: "Basic " + Buffer.from("u:" + SENHA).toString("base64") } });
    assert.equal(r.status, 404);
  });
  test("GET /relatorios com nome invalido / path traversal retorna 404 sem vazar arquivo", async () => {
    for (const p of ["/relatorios/..%2Fserver.js", "/relatorios/%2e%2e%2fpackage.json", "/relatorios/arquivo.txt", "/relatorios/a%00.pdf", "/relatorios/..%5C..%5Cserver.js"]) {
      const r = await crua(p);
      assert.ok([400, 404].includes(r.status), `${p} -> ${r.status}`);
      assert.ok(!/require\(|"dependencies"/.test(r.texto), `${p} vazou conteudo`);
    }
  });
});

describe("CRUD de responsaveis (cadastro descartavel)", () => {
  const post = (corpo) => chamar("POST", "/api/responsaveis", { json: comSenha(corpo) });

  test("cadastra responsavel valido: normaliza e-mail para minusculas e espacos do nome", async () => {
    const r = await post({ nome: "  Maria   da   Silva ", email: ` ${mail("valido").toUpperCase()} ` });
    assert.equal(r.status, 200); assert.equal(r.corpo.ok, true);
    assert.equal(r.corpo.responsavel.nome, "Maria da Silva");
    assert.equal(r.corpo.responsavel.email, mail("valido"));
    assert.deepEqual(r.corpo.responsavel.bases, []);
  });
  test("cadastro duplicado (mesmo e-mail, caixa diferente) retorna 400", async () => {
    const r = await post({ nome: "Outro", email: mail("valido").toUpperCase() });
    assert.equal(r.status, 400); assert.match(r.corpo.erro, /já está cadastrado/);
  });
  test("nome obrigatorio: ausente, vazio, so espacos e tipo errado retornam 400", async () => {
    for (const nome of [undefined, "", "     ", 42, null, ["a"], {}]) {
      const r = await post({ nome, email: mail("n") });
      assert.equal(r.status, 400, `nome=${JSON.stringify(nome)} -> ${r.status}`);
    }
  });
  test("e-mail obrigatorio: ausente, vazio e tipo errado retornam 400", async () => {
    for (const email of [undefined, "", "   ", 7, null, ["a@b.com"]]) {
      const r = await post({ nome: "Fulano", email });
      assert.equal(r.status, 400, `email=${JSON.stringify(email)} -> ${r.status}`);
    }
  });
  test("e-mail invalido e rejeitado com 400 (varios formatos)", async () => {
    for (const email of ["abc", "a@b", "a@b.c", "a b@x.com", "<a>@x.com", "a@x..com", "a,b@x.com", "a@-x.com", '"a"@x.com', "a@x.com\n", "@x.com", "a@", ".a@x.com", "a@x.com.", "a'b@x.com"]) {
      const r = await post({ nome: "Fulano", email });
      assert.equal(r.status, 400, `email=${JSON.stringify(email)} -> ${r.status}`);
    }
  });
  test("nome com exatamente 100 caracteres e aceito; 101 e rejeitado", async () => {
    const ok = await post({ nome: "N".repeat(100), email: mail("n100") });
    assert.equal(ok.status, 200);
    const ruim = await post({ nome: "N".repeat(101), email: mail("n101") });
    assert.equal(ruim.status, 400); assert.match(ruim.corpo.erro, /100/);
  });
  test("e-mail com exatamente 254 caracteres e aceito; 255 e rejeitado; parte local de 65 e rejeitada", async () => {
    const local = "a".repeat(64);
    // dominio de 189 caracteres: 63 + . + 63 + . + 57 + . + com
    const dom = (n) => ["b".repeat(63), "c".repeat(63), "d".repeat(n), "com"].join(".");
    const e254 = `${local}@${dom(57)}`; assert.equal(e254.length, 254);
    const e255 = `${local}@${dom(58)}`; assert.equal(e255.length, 255);
    const ok = await post({ nome: "Limite", email: e254 });
    assert.equal(ok.status, 200, ok.texto);
    const ruim = await post({ nome: "Limite", email: e255 });
    assert.equal(ruim.status, 400);
    const local65 = await post({ nome: "Limite", email: `${"a".repeat(65)}@x.com` });
    assert.equal(local65.status, 400);
    // limpeza
    const del = await chamar("DELETE", "/api/responsaveis", { json: comSenha({ email: e254 }) });
    assert.equal(del.status, 200);
  });
  test("nome com caracteres proibidos (< > \" ' e controle) retorna 400", async () => {
    for (const nome of ["<script>alert(1)</script>", 'Jo"ao', "O'Brien", "a>b", "a\u0001b", "a\u007fb", "a\u0000b"]) {
      const r = await post({ nome, email: mail("p") });
      assert.equal(r.status, 400, `nome=${JSON.stringify(nome)} -> ${r.status}`);
    }
  });
  test("JSON malformado retorna 400 generico, sem stack nem eco do corpo", async () => {
    const r = await chamar("POST", "/api/responsaveis", { corpoBruto: '{"senha":"x","nome":' });
    assert.equal(r.status, 400); assert.equal(r.corpo.ok, false); semVazamento(r);
    assert.ok(!r.texto.includes('"nome"'));
  });
  test("corpo maior que 100 KB retorna 413 generico", async () => {
    const r = await chamar("POST", "/api/responsaveis", { json: comSenha({ nome: "x".repeat(150_000), email: mail("big") }) });
    assert.equal(r.status, 413); semVazamento(r);
  });
  test("corpo > 100 KB tambem e barrado em /api/verificar-senha (413)", async () => {
    const r = await chamar("POST", "/api/verificar-senha", { json: { senha: "x".repeat(150_000) } });
    assert.equal(r.status, 413);
  });
  test("corpo text/plain (nao JSON) e ignorado: tratado como sem senha (401), nunca 500", async () => {
    const r = await chamar("POST", "/api/responsaveis", { corpoBruto: JSON.stringify(comSenha({ nome: "A", email: mail("tp") })), headers: { "content-type": "text/plain" } });
    assert.equal(r.status, 401); semVazamento(r);
  });
  test("corpo JSON nao-objeto (array/primitivo) nao causa 500", async () => {
    for (const corpoBruto of ["[]", "123", "null", '"texto"']) {
      const r = await chamar("POST", "/api/responsaveis", { corpoBruto });
      assert.ok(r.status >= 400 && r.status < 500, `corpo ${corpoBruto} -> ${r.status} ${r.texto}`);
    }
  });
  test("vincular bases (PUT): valido, base inexistente, bases nao-array, e-mail nao cadastrado, base __proto__", async () => {
    const put = (c) => chamar("PUT", "/api/responsaveis", { json: comSenha(c) });
    const ok = await put({ email: mail("valido"), bases: ["macae", "santos", "macae"] });
    assert.equal(ok.status, 200); assert.deepEqual(ok.corpo.responsavel.bases.sort(), ["macae", "santos"]);
    assert.equal((await put({ email: mail("valido"), bases: ["nao_existe"] })).status, 400);
    assert.equal((await put({ email: mail("valido"), bases: "macae" })).status, 400);
    assert.equal((await put({ email: mail("valido") })).status, 400);
    assert.equal((await put({ email: mail("naoexiste"), bases: ["macae"] })).status, 400);
    assert.equal((await put({ email: mail("valido"), bases: ["__proto__"] })).status, 400);
    assert.equal((await put({ email: mail("valido"), bases: [{}] })).status, 400);
    const limpa = await put({ email: mail("valido"), bases: [] });
    assert.equal(limpa.status, 200); assert.deepEqual(limpa.corpo.responsavel.bases, []);
  });
  test("cadastro por base (POST com cidade): adiciona, repetido da 400, base invalida da 400; DELETE por base remove e repetir da 400", async () => {
    const email = mail("porbase");
    const a = await post({ cidade: "macae", nome: "Por Base", email });
    assert.equal(a.status, 200); assert.ok(a.corpo.responsaveis.some((x) => x.email === email));
    assert.equal((await post({ cidade: "macae", nome: "Por Base", email })).status, 400);
    assert.equal((await post({ cidade: "inexistente", nome: "Por Base", email })).status, 400);
    const d = await chamar("DELETE", "/api/responsaveis", { json: comSenha({ cidade: "macae", email }) });
    assert.equal(d.status, 200); assert.ok(!d.corpo.responsaveis.some((x) => x.email === email));
    const d2 = await chamar("DELETE", "/api/responsaveis", { json: comSenha({ cidade: "macae", email }) });
    assert.equal(d2.status, 400);
    assert.equal((await chamar("DELETE", "/api/responsaveis", { json: comSenha({ cidade: "macae" }) })).status, 400);
    await chamar("DELETE", "/api/responsaveis", { json: comSenha({ email }) });
  });
  test("DELETE de responsavel inexistente retorna 400; remocao global remove e segunda tentativa retorna 400", async () => {
    const email = mail("del");
    assert.equal((await post({ nome: "Del", email })).status, 200);
    const d = await chamar("DELETE", "/api/responsaveis", { json: comSenha({ email }) });
    assert.equal(d.status, 200);
    assert.equal((await chamar("DELETE", "/api/responsaveis", { json: comSenha({ email }) })).status, 400);
    assert.equal((await chamar("DELETE", "/api/responsaveis", { json: comSenha({ email: mail("nunca") }) })).status, 400);
  });
  test("consulta autenticada devolve e-mails, responsaveis e basesDisponiveis", async () => {
    const email = mail("cons");
    await post({ cidade: "santos", nome: "Consulta", email });
    const r = await chamar("POST", "/api/responsaveis/consultar", { json: comSenha({ cidade: "santos" }) });
    assert.equal(r.status, 200);
    assert.ok(r.corpo.bases[0].responsaveis.some((x) => x.email === email));
    assert.ok(Array.isArray(r.corpo.basesDisponiveis) && r.corpo.basesDisponiveis.length > 5);
    assert.ok(r.corpo.responsaveis.some((x) => x.email === email));
    await chamar("DELETE", "/api/responsaveis", { json: comSenha({ email }) });
  });
  test("consulta autenticada com base invalida retorna 400 (nao 500)", async () => {
    const r = await chamar("POST", "/api/responsaveis/consultar", { json: comSenha({ cidade: "nao_existe" }) });
    assert.equal(r.status, 400); semVazamento(r);
  });
});

describe("Listagem publica nao expoe e-mails", () => {
  const email = mail("pub");
  test("GET /api/responsaveis (todas as bases) devolve apenas nomes", async () => {
    await chamar("POST", "/api/responsaveis", { json: comSenha({ cidade: "macae", nome: "Publico Visivel", email }) });
    const r = await chamar("GET", "/api/responsaveis");
    assert.equal(r.status, 200);
    assert.ok(!r.texto.includes("@"), "resposta publica contem '@'");
    assert.ok(!r.texto.includes(email));
    assert.ok(r.texto.includes("Publico Visivel"));
    for (const b of r.corpo.bases) for (const p of b.responsaveis) assert.deepEqual(Object.keys(p), ["nome"]);
  });
  test("GET /api/responsaveis?cidade=macae devolve apenas nomes", async () => {
    const r = await chamar("GET", "/api/responsaveis?cidade=macae");
    assert.equal(r.status, 200); assert.equal(r.corpo.bases.length, 1);
    assert.ok(!r.texto.includes("@"));
    assert.ok(r.corpo.bases[0].responsaveis.some((p) => p.nome === "Publico Visivel"));
  });
  test("GET /api/responsaveis?cidade=<invalida> retorna 400 sem stack", async () => {
    for (const c of ["nao_existe", "__proto__", "constructor", "a".repeat(500)]) {
      const r = await chamar("GET", `/api/responsaveis?cidade=${encodeURIComponent(c)}`);
      assert.equal(r.status, 400, `cidade=${c.slice(0, 20)} -> ${r.status} ${r.texto.slice(0, 120)}`); semVazamento(r);
    }
  });
  test("GET /api/responsaveis?cidade[]=a&cidade[]=b (parametro duplicado) nao causa 500", async () => {
    const r = await chamar("GET", "/api/responsaveis?cidade[]=macae&cidade[]=santos");
    assert.ok(r.status < 500, `status ${r.status}: ${r.texto.slice(0, 150)}`); semVazamento(r);
  });
  test("limpeza do responsavel publico", async () => {
    const d = await chamar("DELETE", "/api/responsaveis", { json: comSenha({ email }) });
    assert.equal(d.status, 200);
  });
});

describe("Rotas inexistentes e base invalida", () => {
  test("rota GET inexistente retorna 404 JSON", async () => {
    const r = await chamar("GET", "/api/nao-existe");
    assert.equal(r.status, 404); assert.match(r.headers.get("content-type"), /json/); assert.equal(r.corpo.ok, false); semVazamento(r);
  });
  test("metodos errados em rotas existentes (GET gerar-relatorio, DELETE verificar-senha, PATCH responsaveis) retornam 404 JSON", async () => {
    for (const [m, p] of [["GET", "/api/gerar-relatorio"], ["DELETE", "/api/verificar-senha"], ["PATCH", "/api/responsaveis"], ["GET", "/api/verificar-senha"]]) {
      const r = await chamar(m, p);
      assert.equal(r.status, 404, `${m} ${p} -> ${r.status}`); assert.equal(r.corpo?.ok, false);
    }
  });
  test("URL malformada (%E0%A4%A) retorna 400 sem stack", async () => {
    const r = await crua("/%E0%A4%A");
    assert.ok([400, 404].includes(r.status), `status ${r.status}`); semVazamento({ texto: r.texto });
  });
  test("rotas da integracao desativada nao existem (404)", async () => {
    for (const p of ["/api/oceanop", "/api/debug", "/api/admin", "/metrics", "/__audit/chamadas-inexistente"]) {
      const r = await chamar("GET", p); assert.equal(r.status, 404, p);
    }
  });
  test("arquivos sensiveis nao sao servidos estaticamente (.env, server.js, package.json, data/, src/, tests/)", async () => {
    for (const p of ["/.env", "/server.js", "/package.json", "/data/responsaveis.json", "/src/security/senha.js", "/tests/controleAcesso.test.js", "/node_modules/express/package.json", "/.git/config"]) {
      const r = await chamar("GET", p);
      assert.notEqual(r.status, 200, `${p} respondeu 200`);
      assert.ok(!/DASHBOARD_PASSWORD=|"dependencies"|require\(/.test(r.texto), `${p} vazou conteudo`);
    }
  });
  test("path traversal em estaticos (/..%2f, /%2e%2e/) nao devolve arquivos fora de public/", async () => {
    for (const p of ["/..%2fserver.js", "/%2e%2e/server.js", "/..%2f..%2f.env", "/logo/..%2f..%2fserver.js", "/logo/%2e%2e/server.js", "/..%5cserver.js"]) {
      const r = await crua(p);
      assert.notEqual(r.status, 200, `${p} -> 200`);
      assert.ok(!/require\(|DASHBOARD_PASSWORD/.test(r.texto), `${p} vazou conteudo`);
    }
  });
  test("/api/preview com base invalida retorna 400 'Base invalida.' (inclusive __proto__, constructor, tipo array, 500 chars)", async () => {
    for (const c of ["xxx", "__proto__", "constructor", "toString", "RIO_DE_JANEIRO", "a".repeat(500), "rio de janeiro", "../x"]) {
      const r = await chamar("GET", `/api/preview?cidade=${encodeURIComponent(c)}`);
      assert.equal(r.status, 400, `cidade=${c.slice(0, 20)} -> ${r.status}`); assert.equal(r.corpo.erro, "Base inválida.");
    }
    // parametro repetido vira array no Express; (cidade[]= nao vira: cai na base padrao)
    const arr = await chamar("GET", "/api/preview?cidade=a&cidade=b");
    assert.equal(arr.status, 400);
  });
  test("/api/cor-rio com base invalida retorna 400", async () => {
    const r = await chamar("GET", "/api/cor-rio?cidade=xxx");
    assert.equal(r.status, 400); assert.equal(r.corpo.erro, "Base inválida.");
  });
  test("/api/cor-rio em base sem integracao (macae) retorna aplicavel:false sem consultar fonte externa", async () => {
    const r = await chamar("GET", "/api/cor-rio?cidade=macae");
    assert.equal(r.status, 200); assert.deepEqual(r.corpo, { ok: true, aplicavel: false });
    assert.equal(r.headers.get("cache-control"), "no-store");
  });
  test("/api/gerar-relatorio com base invalida (senha correta) retorna 400 sem disparar pipeline", async () => {
    const r = await chamar("POST", "/api/gerar-relatorio", { json: comSenha({ cidade: "xxx" }) });
    assert.equal(r.status, 400); assert.equal(r.corpo.erro, "Base inválida.");
  });
  test("/api/cidades lista bases com chave/nome/uf e marca o Rio com corRio", async () => {
    const r = await chamar("GET", "/api/cidades");
    assert.equal(r.status, 200); assert.ok(r.corpo.disponiveis.length >= 20);
    assert.ok(r.corpo.disponiveis.every((c) => c.chave && c.nome && c.uf));
    assert.equal(r.corpo.disponiveis.find((c) => c.chave === "rio_de_janeiro").corRio, true);
    assert.ok(r.corpo.disponiveis.some((c) => c.chave === r.corpo.ativa));
  });
  test("/api/monitoramento/saude responde 200 com monitor e registroGeografico, sem dados sensiveis", async () => {
    const r = await chamar("GET", "/api/monitoramento/saude", { timeout: 30_000 });
    assert.equal(r.status, 200); assert.equal(r.corpo.ok, true);
    assert.ok(r.corpo.monitor && r.corpo.registroGeografico); semVazamento(r);
  });
  test("/api/preview de base valida (macae) responde 200 ou 502 controlado (fonte externa; skip se timeout)", { timeout: 90_000 }, async (t) => {
    let r;
    try { r = await chamar("GET", "/api/preview?cidade=macae", { timeout: 80_000 }); }
    catch (e) { return t.skip(`AMBIENTE: sem resposta da fonte externa (${e.message})`); }
    if (r.status === 502) { assert.equal(r.corpo.ok, false); semVazamento(r); return t.skip("AMBIENTE: fontes externas indisponiveis (502 controlado)"); }
    assert.equal(r.status, 200); assert.equal(r.corpo.ok, true); assert.ok(r.corpo.report);
    assert.equal(r.headers.get("cache-control"), "no-store");
  });
});

describe("Cabecalhos de seguranca", () => {
  const checar = (r, rotulo) => {
    const csp = r.headers.get("content-security-policy") || "";
    assert.match(csp, /default-src 'self'/, `${rotulo}: CSP`);
    assert.match(csp, /frame-ancestors 'none'/, `${rotulo}: frame-ancestors`);
    assert.match(csp, /object-src 'none'/, `${rotulo}: object-src`);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff", `${rotulo}: nosniff`);
    assert.equal(r.headers.get("x-frame-options"), "DENY", `${rotulo}: XFO`);
    assert.equal(r.headers.get("referrer-policy"), "no-referrer", `${rotulo}: referrer`);
    assert.equal(r.headers.get("x-powered-by"), null, `${rotulo}: x-powered-by exposto`);
    assert.equal(r.headers.get("strict-transport-security"), null, `${rotulo}: HSTS nao deve ir por HTTP`);
  };
  test("pagina inicial (/), estaticos e API trazem os cabecalhos de seguranca", async () => {
    for (const p of ["/", "/dashboard.js", "/dashboard.css", "/api/cidades", "/api/responsaveis", "/logo/"]) {
      checar(await chamar("GET", p), p);
    }
  });
  test("respostas de erro (404, 401, 400 JSON malformado, 413) tambem trazem os cabecalhos", async () => {
    checar(await chamar("GET", "/nada"), "404");
    checar(await chamar("POST", "/api/verificar-senha", { json: { senha: "x" } }), "401");
    checar(await chamar("POST", "/api/responsaveis", { corpoBruto: "{" }), "400");
    checar(await chamar("POST", "/api/responsaveis", { json: { x: "y".repeat(150_000) } }), "413");
    checar(await chamar("GET", "/relatorios/a.pdf"), "relatorios 401");
  });
  test("CSP nao permite 'unsafe-inline' nem 'unsafe-eval' nem origens externas", async () => {
    const csp = (await chamar("GET", "/")).headers.get("content-security-policy");
    assert.ok(!/unsafe-inline|unsafe-eval|https?:\/\//.test(csp), csp);
  });
  test("pagina inicial serve o HTML do painel (200, text/html)", async () => {
    const r = await chamar("GET", "/");
    assert.equal(r.status, 200); assert.match(r.headers.get("content-type"), /text\/html/);
    assert.match(r.texto, /<html/i);
  });
  test("HTML do painel nao contem script/estilo inline nem recurso externo (compatibilidade com a CSP)", async () => {
    const { texto } = await chamar("GET", "/");
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(texto), "script inline");
    assert.ok(!/<style[\s>]/i.test(texto), "style inline");
    assert.ok(!/\sstyle="/i.test(texto), "atributo style");
    assert.ok(!/(src|href)="https?:\/\//i.test(texto), "recurso externo");
  });
});

describe("Concorrencia em /api/gerar-relatorio (executar por ultimo)", () => {
  test("duas chamadas simultaneas: exatamente uma e aceita e a outra recebe 409", { timeout: 60_000 }, async () => {
    const corpo = comSenha({ tipoEnvio: "cor_rio" });
    const [a, b] = await Promise.all([
      chamar("POST", "/api/gerar-relatorio", { json: corpo, timeout: 40_000 }),
      chamar("POST", "/api/gerar-relatorio", { json: corpo, timeout: 40_000 }),
    ]);
    const status = [a.status, b.status].sort();
    const n409 = status.filter((s) => s === 409).length;
    assert.equal(n409, 1, `status recebidos: ${status} / ${a.texto} / ${b.texto}`);
    const r409 = a.status === 409 ? a : b;
    assert.equal(r409.corpo.stage, "processing"); assert.match(r409.corpo.erro, /em andamento/);
    const outra = a.status === 409 ? b : a;
    // O stub do harness devolve relatorio sem registro de procedencia; o app o rejeita
    // (validarDocumentoOperacional) e a rota responde 500 generico: limitacao do harness.
    assert.ok([200, 500].includes(outra.status), `chamada aceita: ${outra.status} ${outra.texto}`); semVazamento(outra);
  });
  test("apos a conclusao o bloqueio e liberado: nova chamada nao recebe 409", { timeout: 40_000 }, async () => {
    const r = await chamar("POST", "/api/gerar-relatorio", { json: comSenha({ tipoEnvio: "cor_rio" }), timeout: 30_000 });
    assert.notEqual(r.status, 409, "bloqueio nao liberado apos o fim da geracao anterior");
    assert.ok([200, 500].includes(r.status), r.texto); semVazamento(r);
  });
  test("tres chamadas simultaneas: no maximo uma executa; as demais recebem 409", { timeout: 60_000 }, async () => {
    const corpo = comSenha({ tipoEnvio: "cor_rio" });
    const rs = await Promise.all([1, 2, 3].map(() => chamar("POST", "/api/gerar-relatorio", { json: corpo, timeout: 40_000 })));
    const s = rs.map((r) => r.status);
    assert.equal(s.filter((x) => x === 409).length, 2, `status: ${s}`);
    assert.equal(s.filter((x) => x !== 409).length, 1, `exatamente uma deve ser aceita; status: ${s}`);
  });
  test("gerar-relatorio com senha correta: erro interno nao vaza detalhes; caminho 200 BLOQUEADO pelo stub do harness", { timeout: 40_000 }, async (t) => {
    const r = await chamar("POST", "/api/gerar-relatorio", { json: comSenha({ cidade: "macae" }), timeout: 30_000 });
    assert.ok([200, 500].includes(r.status), `${r.status} ${r.texto}`); semVazamento(r);
    if (r.status === 500) return t.skip("BLOQUEADO: stub do harness nao gera documento registrado (validarDocumentoOperacional); sucesso 200/urlArquivo nao verificavel");
    assert.equal(r.corpo.ok, true);
  });
});

describe("Normalizacao de e-mail (regressao)", () => {
  test("e-mail com espaco/quebra de linha nas pontas e aparado (trim) e aceito", async () => {
    const e = mail("trim");
    const r = await chamar("POST", "/api/responsaveis", { json: comSenha({ nome: "Trim", email: ` ${e}\n` }) });
    assert.equal(r.status, 200); assert.equal(r.corpo.responsavel.email, e);
    await chamar("DELETE", "/api/responsaveis", { json: comSenha({ email: e }) });
  });
});
