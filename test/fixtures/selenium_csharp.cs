using OpenQA.Selenium;
using OpenQA.Selenium.Remote;
public class LoginTest {
  IWebDriver driver;
  [Test] public void Login() {
    var caps = new DesiredCapabilities();
    driver.Manage().Timeouts().ImplicitWait = TimeSpan.FromSeconds(10);
    var wait = new WebDriverWait(driver, TimeSpan.FromSeconds(10));
    Thread.Sleep(2000);
    driver.FindElement(By.XPath("/html/body/div[2]/input")).SendKeys("admin");
    Assert.IsTrue(driver.PageSource.Contains("Welcome"));
  }
}
