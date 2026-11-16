"""API JSON para o MeuForms. Python 3.10+ sem dependências externas."""
import csv
import hmac
import io
import json
import os
import sqlite3
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
DATABASE = Path(os.environ.get("FORMS_DB", str(ROOT / "forms.sqlite3")))
ADMIN_TOKEN = os.environ.get("FORMS_ADMIN_TOKEN", "")
PORT = int(os.environ.get("FORMS_PORT", "8000"))
MAX_BODY = 150_000
TYPES = {"texto", "paragrafo", "multipla", "caixas", "lista"}
LOCK = threading.Lock()
LAST_POST = {}

def db():
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("CREATE TABLE IF NOT EXISTS forms (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)")
    conn.execute("CREATE TABLE IF NOT EXISTS responses (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, values_json TEXT NOT NULL)")
    return conn

def init_db():
    with db() as conn:
        if not conn.execute("SELECT 1 FROM forms WHERE id=1").fetchone():
            questions = (ROOT / "questions.json").read_text(encoding="utf-8")
            conn.execute("INSERT INTO forms (id,data) VALUES (1,?)", (questions,))

def current_form(conn):
    return json.loads(conn.execute("SELECT data FROM forms WHERE id=1").fetchone()[0])

def validate_form(f):
    if not isinstance(f, dict) or not isinstance(f.get("titulo"), str) or not 1 <= len(f["titulo"].strip()) <= 160:
        raise ValueError("Título inválido")
    if not isinstance(f.get("descricao"), str) or len(f["descricao"]) > 1500:
        raise ValueError("Descrição inválida")
    questions = f.get("perguntas")
    if not isinstance(questions, list) or not 1 <= len(questions) <= 100:
        raise ValueError("O formulário deve conter entre 1 e 100 perguntas")
    ids = set()
    for q in questions:
        if not isinstance(q, dict) or not isinstance(q.get("id"), str) or not 1 <= len(q["id"]) <= 80 or q["id"] in ids:
            raise ValueError("IDs de perguntas inválidos ou repetidos")
        ids.add(q["id"])
        if not isinstance(q.get("titulo"), str) or not 1 <= len(q["titulo"].strip()) <= 300:
            raise ValueError("Título da pergunta inválido")
        if q.get("tipo") not in TYPES or not isinstance(q.get("obrigatoria"), bool):
            raise ValueError("Tipo ou obrigatoriedade inválidos")
        options = q.get("opcoes")
        if not isinstance(options, list) or len(options) > 30 or any(not isinstance(o, str) or not 1 <= len(o.strip()) <= 150 for o in options):
            raise ValueError("Opções inválidas")
        if q["tipo"] in {"multipla", "caixas", "lista"} and (not options or len(options) != len(set(options))):
            raise ValueError("Perguntas de seleção exigem opções não repetidas")

def validate_answers(payload, form):
    if not isinstance(payload, dict) or not isinstance(payload.get("valores"), dict):
        raise ValueError("Respostas inválidas")
    answers = payload["valores"]
    by_id = {q["id"]: q for q in form["perguntas"]}
    if any(k not in by_id for k in answers):
        raise ValueError("Pergunta desconhecida")
    result = {}
    for key, q in by_id.items():
        val = answers.get(key, [] if q["tipo"] == "caixas" else "")
        if q["tipo"] == "caixas":
            if not isinstance(val, list) or len(val) > len(q["opcoes"]) or any(not isinstance(x, str) or x not in q["opcoes"] for x in val) or len(val) != len(set(val)):
                raise ValueError("Opções inválidas: " + key)
            empty = not val
        else:
            if not isinstance(val, str) or len(val) > 3000:
                raise ValueError("Resposta de texto inválida: " + key)
            if q["tipo"] in {"multipla", "lista"} and val and val not in q["opcoes"]:
                raise ValueError("Opção inválida: " + key)
            empty = not val.strip()
        if q["obrigatoria"] and empty:
            raise ValueError("Resposta obrigatória: " + key)
        result[key] = val
    return result

class Handler(BaseHTTPRequestHandler):
    def respond(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        provided = self.headers.get("Authorization", "")
        if not ADMIN_TOKEN or not hmac.compare_digest(provided, "Bearer " + ADMIN_TOKEN):
            self.respond(401, {"error": "Token administrativo inválido"})
            return False
        return True

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("Content-Length inválido")
        if not 0 < length <= MAX_BODY:
            raise ValueError("Corpo da requisição vazio ou muito grande")
        try:
            return json.loads(self.rfile.read(length))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValueError("JSON inválido")

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/health":
            return self.respond(200, {"status": "ok"})
        if path == "/api/form":
            with db() as conn:
                return self.respond(200, current_form(conn))
        if path in ("/api/responses", "/api/responses.csv"):
            if not self.authorized(): return
            with db() as conn:
                form = current_form(conn)
                records = [{"id": row[0], "data": row[1], "valores": json.loads(row[2])}
                           for row in conn.execute("SELECT id,date,values_json FROM responses ORDER BY id DESC")]
            if path == "/api/responses":
                return self.respond(200, {"respostas": records})
            output = io.StringIO()
            writer = csv.writer(output, delimiter=";")
            writer.writerow(["Data"] + [q["titulo"] for q in form["perguntas"]])
            for item in records:
                writer.writerow([item["data"]] + [", ".join(v) if isinstance(v, list) else v
                               for q in form["perguntas"] for v in [item["valores"].get(q["id"], "")]])
            data = ("\ufeff" + output.getvalue()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="respostas.csv"')
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            return self.wfile.write(data)
        return self.respond(404, {"error": "Rota não encontrada"})

    def do_POST(self):
        if urlsplit(self.path).path != "/api/responses":
            return self.respond(404, {"error": "Rota não encontrada"})
        now = time.monotonic()
        client = self.client_address[0]
        with LOCK:
            if now - LAST_POST.get(client, -1e9) < 2:
                return self.respond(429, {"error": "Aguarde antes de enviar outra resposta"})
            LAST_POST[client] = now
            if len(LAST_POST) > 5000:
                LAST_POST.clear()
        try:
            payload = self.read_json()
            with db() as conn:
                values = validate_answers(payload, current_form(conn))
                cur = conn.execute("INSERT INTO responses(date,values_json) VALUES (?,?)",
                                   (datetime.now(timezone.utc).isoformat(), json.dumps(values, ensure_ascii=False)))
                response_id = cur.lastrowid
            return self.respond(201, {"id": response_id, "message": "Resposta salva"})
        except ValueError as e:
            return self.respond(400, {"error": str(e)})

    def do_PUT(self):
        if urlsplit(self.path).path != "/api/form":
            return self.respond(404, {"error": "Rota não encontrada"})
        if not self.authorized(): return
        try:
            payload = self.read_json()
            validate_form(payload)
            with db() as conn:
                conn.execute("UPDATE forms SET data=? WHERE id=1", (json.dumps(payload, ensure_ascii=False),))
            return self.respond(200, {"message": "Formulário salvo"})
        except ValueError as e:
            return self.respond(400, {"error": str(e)})

    def do_DELETE(self):
        if urlsplit(self.path).path != "/api/responses":
            return self.respond(404, {"error": "Rota não encontrada"})
        if not self.authorized(): return
        with db() as conn: conn.execute("DELETE FROM responses")
        return self.respond(200, {"message": "Respostas removidas"})

if __name__ == "__main__":
    if len(ADMIN_TOKEN) < 16:
        raise SystemExit("Configure FORMS_ADMIN_TOKEN com pelo menos 16 caracteres.")
    init_db()
    print(f"API MeuForms em http://127.0.0.1:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
