import org.openqa.selenium.*;
import org.openqa.selenium.remote.DesiredCapabilities;
public class LoginTest {
  WebDriver driver;
  @Test public void login() throws Exception {
    System.setProperty("webdriver.chrome.driver", "C:/drivers/chromedriver.exe");
    DesiredCapabilities caps = new DesiredCapabilities();
    driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(10));
    WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    Thread.sleep(2000);
    driver.findElement(By.xpath("/html/body/div[2]/input")).sendKeys("admin");
    Actions actions = new Actions(driver);
    actions.moveToElement(menu).click(item);
    assertTrue(driver.getPageSource().contains("Welcome"));
  }
}
