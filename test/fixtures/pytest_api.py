import requests
import time
def test_get_user():
    token = "Bearer abcdefghijklmnopqrst"
    resp = requests.get("https://staging.api.example.com/users/1", verify=False)
    assert resp.status_code == 200
    time.sleep(2)
    print(resp.text)
