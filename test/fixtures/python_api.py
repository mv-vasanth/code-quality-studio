import pickle, subprocess, yaml, requests
DEBUG = True
ALLOWED_HOSTS = ['*']
SECRET_KEY = "django-insecure-abc123def456"
def handler(req, items=[]):
    obj = pickle.loads(req.body)
    eval(req.GET['expr'])
    subprocess.run(req.GET['cmd'], shell=True)
    cfg = yaml.load(open('c.yml'))
    r = requests.get("https://api.example.com", verify=False)
    assert req.user.is_admin
    try: pass
    except: pass
    for o in Order.objects.all(): print(o.customer.name)
    return items
