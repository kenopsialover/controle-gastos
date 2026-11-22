package com.controlegastos;

import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.regex.Pattern;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.json.JSONArray;
import org.json.JSONObject;

/** Banco SQLite + regras do app. A tela chama Android.chamar(metodo, json) e recebe JSON. */
public class Banco extends SQLiteOpenHelper {
    private static class Erro extends Exception {
        final boolean semLogin;
        Erro(String msg, boolean semLogin) { super(msg); this.semLogin = semLogin; }
        Erro(String msg) { this(msg, false); }
    }

    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final Pattern DATA = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");
    private static final Pattern MES = Pattern.compile("^\\d{4}-\\d{2}$");
    private final SharedPreferences sessao;

    Banco(Context ctx) {
        super(ctx, "gastos.db", null, 1);
        sessao = ctx.getSharedPreferences("sessao", Context.MODE_PRIVATE);
    }

    @Override public void onConfigure(SQLiteDatabase db) { db.setForeignKeyConstraintsEnabled(true); }

    @Override public void onCreate(SQLiteDatabase db) {
        // A senha de login é guardada como hash PBKDF2 com sal, nunca em texto puro.
        db.execSQL("CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, "
            + "email TEXT NOT NULL UNIQUE, senha_hash TEXT NOT NULL, criado_em TEXT NOT NULL DEFAULT (datetime('now')))");
        // O valor é guardado em centavos (inteiro) para não ter erro de arredondamento.
        db.execSQL("CREATE TABLE gastos (id INTEGER PRIMARY KEY AUTOINCREMENT, "
            + "usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, "
            + "descricao TEXT NOT NULL, valor_centavos INTEGER NOT NULL, categoria TEXT NOT NULL, "
            + "data TEXT NOT NULL, criado_em TEXT NOT NULL DEFAULT (datetime('now')))");
        db.execSQL("CREATE INDEX idx_gastos_usuario_data ON gastos (usuario_id, data)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int antiga, int nova) { }

    @JavascriptInterface
    public String chamar(String metodo, String corpo) {
        try {
            JSONObject d = new JSONObject(corpo);
            switch (metodo) {
                case "registro": return registro(d);
                case "login": return login(d);
                case "logout": sessao.edit().remove("uid").apply(); return "{\"ok\":true}";
                case "eu": return eu();
                case "relatorio": return relatorio(d);
                case "gasto_criar": return criar(d);
                case "gasto_atualizar": return atualizar(d);
                case "gasto_excluir": return excluir(d);
                default: return erro("Operação desconhecida.", false);
            }
        } catch (Erro e) {
            return erro(e.getMessage(), e.semLogin);
        } catch (Exception e) {
            return erro("Erro interno do aplicativo.", false);
        }
    }

    private static String erro(String msg, boolean semLogin) {
        try { return new JSONObject().put("erro", msg).put("login", semLogin).toString(); }
        catch (Exception e) { return "{\"erro\":\"Erro interno.\"}"; }
    }

    // ---------- Conta ----------
    private String registro(JSONObject d) throws Exception {
        String nome = d.optString("nome").trim();
        String email = d.optString("email").trim().toLowerCase();
        String senha = d.optString("senha");
        if (nome.isEmpty() || nome.length() > 100) throw new Erro("Informe seu nome (até 100 caracteres).");
        if (!EMAIL.matcher(email).matches() || email.length() > 150) throw new Erro("Informe um e-mail válido.");
        if (senha.length() < 6 || senha.length() > 100) throw new Erro("A senha deve ter de 6 a 100 caracteres.");
        ContentValues v = new ContentValues();
        v.put("nome", nome); v.put("email", email); v.put("senha_hash", gerarHash(senha));
        long id = getWritableDatabase().insert("usuarios", null, v);
        if (id < 0) throw new Erro("Já existe uma conta com esse e-mail.");
        sessao.edit().putLong("uid", id).apply(); // já entra logado
        return "{\"ok\":true}";
    }

    private String login(JSONObject d) throws Exception {
        String email = d.optString("email").trim().toLowerCase(), senha = d.optString("senha");
        if (email.isEmpty() || senha.isEmpty()) throw new Erro("Informe e-mail e senha.");
        JSONArray a = linhas(getReadableDatabase().rawQuery(
            "SELECT id, senha_hash FROM usuarios WHERE email = ?", new String[]{email}));
        // Mesma mensagem para e-mail ou senha errados.
        if (a.length() == 0 || !conferir(senha, a.getJSONObject(0).getString("senha_hash")))
            throw new Erro("E-mail ou senha incorretos.");
        sessao.edit().putLong("uid", a.getJSONObject(0).getLong("id")).apply();
        return "{\"ok\":true}";
    }

    private long usuarioLogado() throws Erro {
        long id = sessao.getLong("uid", 0);
        if (id == 0) throw new Erro("Faça login para continuar.", true);
        return id;
    }

    private String eu() throws Exception {
        long id = usuarioLogado();
        JSONArray a = linhas(getReadableDatabase().rawQuery(
            "SELECT nome, email, criado_em FROM usuarios WHERE id = ?", new String[]{String.valueOf(id)}));
        if (a.length() == 0) { sessao.edit().remove("uid").apply(); throw new Erro("Faça login para continuar.", true); }
        return a.getJSONObject(0).toString();
    }

    private static String derivar(String senha, byte[] sal) throws Exception {
        byte[] h = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
            .generateSecret(new PBEKeySpec(senha.toCharArray(), sal, 120000, 256)).getEncoded();
        return Base64.encodeToString(h, Base64.NO_WRAP);
    }

    private static String gerarHash(String senha) throws Exception {
        byte[] sal = new byte[16];
        new SecureRandom().nextBytes(sal);
        return Base64.encodeToString(sal, Base64.NO_WRAP) + ":" + derivar(senha, sal);
    }

    private static boolean conferir(String senha, String guardado) throws Exception {
        String[] p = guardado.split(":");
        byte[] novo = derivar(senha, Base64.decode(p[0], Base64.NO_WRAP)).getBytes("UTF-8");
        return MessageDigest.isEqual(novo, p[1].getBytes("UTF-8"));
    }

    // ---------- CRUD de gastos (cada usuário só mexe nos próprios) ----------
    private ContentValues gasto(JSONObject d) throws Erro {
        String desc = d.optString("descricao").trim(), cat = d.optString("categoria").trim();
        String data = d.optString("data").trim();
        long cent = d.optLong("valor_centavos", 0);
        if (desc.isEmpty() || desc.length() > 100) throw new Erro("Informe a descrição (até 100 caracteres).");
        if (cent < 1 || cent > 99999999999L) throw new Erro("Informe um valor maior que zero.");
        if (cat.isEmpty() || cat.length() > 30) throw new Erro("Escolha uma categoria.");
        if (!DATA.matcher(data).matches()) throw new Erro("Informe uma data válida.");
        ContentValues v = new ContentValues();
        v.put("descricao", desc); v.put("valor_centavos", cent); v.put("categoria", cat); v.put("data", data);
        return v;
    }

    private String criar(JSONObject d) throws Exception {
        long uid = usuarioLogado();
        ContentValues v = gasto(d);
        v.put("usuario_id", uid);
        return new JSONObject().put("id", getWritableDatabase().insert("gastos", null, v)).toString();
    }

    private String atualizar(JSONObject d) throws Exception {
        long uid = usuarioLogado();
        int n = getWritableDatabase().update("gastos", gasto(d), "id = ? AND usuario_id = ?",
            new String[]{String.valueOf(d.optLong("id")), String.valueOf(uid)});
        if (n == 0) throw new Erro("Gasto não encontrado.");
        return "{\"ok\":true}";
    }

    private String excluir(JSONObject d) throws Exception {
        long uid = usuarioLogado();
        int n = getWritableDatabase().delete("gastos", "id = ? AND usuario_id = ?",
            new String[]{String.valueOf(d.optLong("id")), String.valueOf(uid)});
        if (n == 0) throw new Erro("Gasto não encontrado.");
        return "{\"ok\":true}";
    }

    // ---------- Relatório do mês (READ): tudo calculado na hora com SQL ----------
    private String relatorio(JSONObject d) throws Exception {
        long uid = usuarioLogado();
        String mes = d.optString("mes");
        if (!MES.matcher(mes).matches()) throw new Erro("Mês inválido.");
        SQLiteDatabase db = getReadableDatabase();
        String[] a = {String.valueOf(uid), mes};
        String de = " FROM gastos WHERE usuario_id = ? AND substr(data, 1, 7) = ?";
        JSONObject r = linhas(db.rawQuery("SELECT COUNT(*) AS quantidade, COALESCE(SUM(valor_centavos), 0) AS total, "
            + "COALESCE(MAX(valor_centavos), 0) AS maior" + de, a)).getJSONObject(0);
        r.put("categorias", linhas(db.rawQuery("SELECT categoria, SUM(valor_centavos) AS total, COUNT(*) AS quantidade"
            + de + " GROUP BY categoria ORDER BY total DESC", a)));
        r.put("registros", linhas(db.rawQuery("SELECT id, descricao, valor_centavos, categoria, data"
            + de + " ORDER BY data DESC, id DESC", a)));
        return r.toString();
    }

    private static JSONArray linhas(Cursor c) throws Exception {
        JSONArray lista = new JSONArray();
        while (c.moveToNext()) {
            JSONObject o = new JSONObject();
            for (int i = 0; i < c.getColumnCount(); i++) {
                if (c.getType(i) == Cursor.FIELD_TYPE_INTEGER) o.put(c.getColumnName(i), c.getLong(i));
                else o.put(c.getColumnName(i), c.getString(i));
            }
            lista.put(o);
        }
        c.close();
        return lista;
    }
}
