import com.microsoft.playwright.*;
public class CheckoutTest {
  @Test void checkout() {
    Playwright playwright = Playwright.create();
    Page page = playwright.chromium().launch().newPage();
    page.navigate("https://staging.example.com");
    page.waitForTimeout(3000);
    page.querySelector("//button[@id='pay']");
    String password = "hunter2secret";
  }
}
