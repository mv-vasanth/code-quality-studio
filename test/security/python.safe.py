# The correct form of every defect in python.vuln.py.
import hashlib
import json
import os
import subprocess

API_KEY = os.environ["API_KEY"]


def query(cur, uid):
    cur.execute("SELECT * FROM users WHERE id = %s", (uid,))


def run(args):
    subprocess.run(args, shell=False, check=True)


def strong(p):
    return hashlib.sha256(p.encode()).hexdigest()


def load(blob):
    return json.loads(blob)
