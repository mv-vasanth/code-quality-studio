from playwright.sync_api import sync_playwright
import time
def test_checkout(page):
    page.goto("https://staging.example.com/cart")
    page.wait_for_timeout(3000)
    time.sleep(2)
    page.query_selector("//button[@id='pay']")
    password = "hunter2secret"
