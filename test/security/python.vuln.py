# Deliberately vulnerable.
import hashlib
import pickle
import subprocess

API_KEY = "sk-live-abc123def456"                              # PY-SEC-002


def query(cur, uid):
    cur.execute("SELECT * FROM users WHERE id = '%s'" % uid)  # PY-SEC-001


def run(cmd):
    subprocess.call(cmd, shell=True)                          # PY-SEC-003


def weak(p):
    return hashlib.md5(p.encode()).hexdigest()                # PY-SEC-004


def load(blob):
    return pickle.loads(blob)                                 # PY-SEC-005
