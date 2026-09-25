import io.appium.java_client.AppiumDriver;
public class AppTest {
  AppiumDriver driver;
  @Test public void launches() throws Exception {
    Thread.sleep(3000);
    driver.findElement(By.xpath("//android.widget.Button[1]")).click();
    String password = "hunter2secret";
    driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(10));
  }
}
