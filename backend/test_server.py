import os
import tempfile
import unittest
from pathlib import Path

tmp = tempfile.TemporaryDirectory()
os.environ["FORMS_DB"] = str(Path(tmp.name) / "test.sqlite3")
from server import init_db, db, current_form, validate_form, validate_answers

class TestSurvey(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        with db() as conn: cls.form = current_form(conn)

    def test_seed(self):
        self.assertGreaterEqual(len(self.form["perguntas"]), 10)
        validate_form(self.form)

    def test_required(self):
        with self.assertRaises(ValueError): validate_answers({"valores": {}}, self.form)

    def test_invalid_option(self):
        answers = {q["id"]: (q["opcoes"][:1] if q["tipo"] == "caixas" else q["opcoes"][0] if q["opcoes"] else "Teste")
                   for q in self.form["perguntas"]}
        answers["faixa"] = "valor inexistente"
        with self.assertRaises(ValueError): validate_answers({"valores": answers}, self.form)

    def test_valid(self):
        answers = {q["id"]: (q["opcoes"][:1] if q["tipo"] == "caixas" else q["opcoes"][0] if q["opcoes"] else "Teste")
                   for q in self.form["perguntas"]}
        self.assertEqual(validate_answers({"valores": answers}, self.form), answers)

if __name__ == "__main__": unittest.main()
