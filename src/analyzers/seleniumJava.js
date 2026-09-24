import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, countMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.selenium_java.categories.map((c) => c.id);

/**
 * Local rules for Selenium WebDriver (Java) — heuristic, regex-based; not a substitute
 * for full review.
 */
export function analyseSeleniumJavaLocally(filename, content, options = {}) {
  const disabledRuleIds = options.disabledRuleIds ?? new Set();
  const findings = [];
  const lines = content.split(/\r?\n/);
  const hasTests = /@Test\b|@BeforeEach\b|@Before\b/.test(content);

  // ── Locators ──
  const xpath = lineMatches(content, /By\.xpath\s*\(/);
  if (xpath.length) pushFinding(findings, {
    ruleId: "SEL-J-LOC-001", category: "locators", severity: "warning",
    title: "XPath locator",
    description: "XPath couples tests to DOM structure; prefer By.cssSelector or By.id",
    impact: "Tests break when the DOM structure changes.",
    fix: `// Before\ndriver.findElement(By.xpath("//button[@id='submit']")).click();\n// After\ndriver.findElement(By.cssSelector("[data-testid='submit']")).click();`,
    line: xpath[0], reference: "https://www.selenium.dev/documentation/test_practices/encouraged/locators/",
  }, disabledRuleIds);

  const byId = lineMatches(content, /By\.id\s*\(/);
  if (byId.length) pushFinding(findings, {
    ruleId: "SEL-J-LOC-002", category: "locators", severity: "info",
    title: "By.id locator",
    description: "ID-based locators are acceptable but brittle if IDs are auto-generated; consider data-testid attribute",
    impact: "Auto-generated IDs break the locator on re-render.",
    fix: `driver.findElement(By.cssSelector("[data-testid='my-element']"));`,
    line: byId[0], reference: "https://www.selenium.dev/documentation/test_practices/encouraged/locators/",
  }, disabledRuleIds);

  const byName = lineMatches(content, /By\.name\s*\(/);
  if (byName.length) pushFinding(findings, {
    ruleId: "SEL-J-LOC-003", category: "locators", severity: "warning",
    title: "By.name locator",
    description: "name attribute is presentation-coupled; prefer By.cssSelector with a stable attribute",
    impact: "Renaming the form field breaks the test.",
    fix: `driver.findElement(By.cssSelector("[data-testid='username']"));`,
    line: byName[0], reference: "https://www.selenium.dev/documentation/test_practices/encouraged/locators/",
  }, disabledRuleIds);

  const absXpath = lineMatches(content, /By\.xpath\s*\(\s*"\/html/);
  if (absXpath.length) pushFinding(findings, {
    ruleId: "SEL-J-LOC-004", category: "locators", severity: "critical",
    title: "Absolute XPath",
    description: "Absolute XPath breaks on any DOM change",
    impact: "Any structural change to the page breaks the locator.",
    fix: `// Before\ndriver.findElement(By.xpath("/html/body/div[2]/form/input"));\n// After\ndriver.findElement(By.cssSelector("[data-testid='email']"));`,
    line: absXpath[0], reference: "https://www.selenium.dev/documentation/test_practices/encouraged/locators/",
  }, disabledRuleIds);

  if (hasTests && !/By\.id|By\.cssSelector|By\.linkText|By\.name/.test(content)) {
    pushFinding(findings, {
      ruleId: "SEL-J-LOC-005", category: "locators", severity: "info",
      title: "No semantic locators",
      description: "No standard locators found; ensure elements are located reliably",
      impact: "Tests may fail to find elements reliably.",
      fix: `driver.findElement(By.cssSelector("[data-testid='submit']"));`,
      line: null, reference: "https://www.selenium.dev/documentation/test_practices/encouraged/locators/",
    }, disabledRuleIds);
  }

  // ── Waits ──
  const threadSleep = lineMatches(content, /Thread\.sleep\s*\(/);
  if (threadSleep.length) pushFinding(findings, {
    ruleId: "SEL-J-WAI-001", category: "waits", severity: "critical",
    title: "Thread.sleep in test",
    description: "Hard coded sleep causes flakiness and slow suites; use WebDriverWait",
    impact: "Flaky and slow tests in CI.",
    fix: `WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));\nwait.until(ExpectedConditions.visibilityOfElementLocated(By.id("result")));`,
    line: threadSleep[0], reference: "https://www.selenium.dev/documentation/webdriver/waits/",
  }, disabledRuleIds);

  const implicitWait = lineMatches(content, /manage\(\)\.timeouts\(\)\.implicitlyWait/);
  if (implicitWait.length) pushFinding(findings, {
    ruleId: "SEL-J-WAI-002", category: "waits", severity: "warning",
    title: "Implicit wait used",
    description: "Implicit waits interact unpredictably with explicit waits; pick one strategy",
    impact: "Intermittent failures and hard-to-diagnose timing issues.",
    fix: `// Remove implicit wait and use WebDriverWait instead:\nWebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));\nwait.until(ExpectedConditions.elementToBeClickable(By.id("btn")));`,
    line: implicitWait[0], reference: "https://www.selenium.dev/documentation/webdriver/waits/",
  }, disabledRuleIds);

  if (/findElement/.test(content) && !/WebDriverWait/.test(content)) {
    pushFinding(findings, {
      ruleId: "SEL-J-WAI-003", category: "waits", severity: "info",
      title: "No explicit wait",
      description: "Explicit WebDriverWait not detected; tests may fail on slow pages",
      impact: "Tests may intermittently fail on slow-loading pages.",
      fix: `WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));\nwait.until(ExpectedConditions.visibilityOfElementLocated(By.id("element")));`,
      line: null, reference: "https://www.selenium.dev/documentation/webdriver/waits/",
    }, disabledRuleIds);
  }

  // FluentWait without withTimeout within 5 lines
  let fluentWaitLineWithoutTimeout = null;
  for (let i = 0; i < lines.length; i++) {
    if (/FluentWait/.test(lines[i])) {
      const windowEnd = Math.min(i + 5, lines.length - 1);
      const segment = lines.slice(i, windowEnd + 1).join("\n");
      if (!/withTimeout/.test(segment)) {
        fluentWaitLineWithoutTimeout = i + 1;
        break;
      }
    }
  }
  if (fluentWaitLineWithoutTimeout !== null) pushFinding(findings, {
    ruleId: "SEL-J-WAI-004", category: "waits", severity: "warning",
    title: "FluentWait without timeout",
    description: "FluentWait without a timeout cap can stall indefinitely",
    impact: "Tests can hang indefinitely in CI.",
    fix: `new FluentWait<>(driver)\n  .withTimeout(Duration.ofSeconds(30))\n  .pollingEvery(Duration.ofSeconds(1))\n  .until(d -> d.findElement(By.id("result")).isDisplayed());`,
    line: fluentWaitLineWithoutTimeout, reference: "https://www.selenium.dev/documentation/webdriver/waits/",
  }, disabledRuleIds);

  // ── Assertions ──
  const rawBoolAssert = lineMatches(content, /Assert\.assertTrue\s*\(\s*driver\.(getTitle|getCurrentUrl|findElement)/);
  if (rawBoolAssert.length) pushFinding(findings, {
    ruleId: "SEL-J-ASS-001", category: "assertions", severity: "warning",
    title: "Raw boolean assert on driver state",
    description: "Prefer dedicated assertion libraries (AssertJ) with descriptive messages",
    impact: "Failure messages are cryptic without a description.",
    fix: `// Before\nAssert.assertTrue(driver.getTitle().contains("Dashboard"));\n// After\nassertThat(driver.getTitle()).as("Page title").contains("Dashboard");`,
    line: rawBoolAssert[0], reference: "https://assertj.github.io/doc/",
  }, disabledRuleIds);

  const missingAssertMsg = lineMatches(content, /Assert\.(assertTrue|assertFalse|assertEquals)\s*\([^,)]+\)/);
  if (missingAssertMsg.length) pushFinding(findings, {
    ruleId: "SEL-J-ASS-002", category: "assertions", severity: "info",
    title: "Assertion without message",
    description: "Assertions without a message are hard to diagnose on failure",
    impact: "Hard to know why a test failed without context.",
    fix: `Assert.assertTrue("Expected button to be visible", button.isDisplayed());`,
    line: missingAssertMsg[0], reference: "https://junit.org/junit4/javadoc/latest/org/junit/Assert.html",
  }, disabledRuleIds);

  if (hasTests && !/Assert\.|assertThat\s*\(|assertEquals|assertNotNull/.test(content)) {
    pushFinding(findings, {
      ruleId: "SEL-J-ASS-003", category: "assertions", severity: "warning",
      title: "No assertions found",
      description: "Test method appears to have no assertion",
      impact: "Tests that never fail provide false confidence.",
      fix: `Assert.assertEquals("Expected title", "Dashboard", driver.getTitle());`,
      line: null, reference: "https://junit.org/junit5/docs/current/user-guide/",
    }, disabledRuleIds);
  }

  const sysoutVerify = lineMatches(content, /System\.out\.print/);
  if (sysoutVerify.length) pushFinding(findings, {
    ruleId: "SEL-J-ASS-004", category: "assertions", severity: "info",
    title: "System.out used for verification",
    description: "Replace System.out with a proper assertion or logger",
    impact: "Console output is not captured by test reports.",
    fix: `Assert.assertEquals("Expected value", expected, actual);`,
    line: sysoutVerify[0], reference: "Team standards",
  }, disabledRuleIds);

  // ── Page Objects ──
  const findElementCount = countMatches(content, /driver\.findElement/g);
  if (hasTests && findElementCount > 2 && !/@FindBy|PageFactory/.test(content)) {
    pushFinding(findings, {
      ruleId: "SEL-J-PO-001", category: "page_objects", severity: "warning",
      title: "No Page Object pattern",
      description: "Tests directly manipulate driver; extract Page Object classes for maintainability",
      impact: "Test duplication and high maintenance cost.",
      fix: `public class LoginPage {\n  private WebDriver driver;\n  @FindBy(id = "username") private WebElement usernameField;\n  public LoginPage(WebDriver driver) {\n    this.driver = driver;\n    PageFactory.initElements(driver, this);\n  }\n}`,
      line: null, reference: "https://www.selenium.dev/documentation/test_practices/encouraged/page_object_models/",
    }, disabledRuleIds);
  }

  if (/@FindBy/.test(content) && !/PageFactory\.initElements/.test(content)) {
    const findByLine = lineMatches(content, /@FindBy/)[0] ?? null;
    pushFinding(findings, {
      ruleId: "SEL-J-PO-002", category: "page_objects", severity: "info",
      title: "PageFactory.initElements not called",
      description: "Missing PageFactory.initElements() call; WebElement fields will be null",
      impact: "NullPointerException at runtime when accessing @FindBy elements.",
      fix: `public MyPage(WebDriver driver) {\n  PageFactory.initElements(driver, this);\n}`,
      line: findByLine, reference: "https://www.selenium.dev/selenium/docs/api/java/org/openqa/selenium/support/PageFactory.html",
    }, disabledRuleIds);
  }

  // ── Browser Management ──
  const hasDriverInit = /WebDriver|ChromeDriver|FirefoxDriver|EdgeDriver/.test(content);
  if (hasDriverInit && !(/\.quit\(\)/.test(content))) {
    pushFinding(findings, {
      ruleId: "SEL-J-BM-001", category: "browser_mgmt", severity: "critical",
      title: "No driver.quit()",
      description: "WebDriver not closed; browser process leaks between tests",
      impact: "Resource leak; CI machines run out of browser processes.",
      fix: `@AfterEach\nvoid tearDown() {\n  if (driver != null) driver.quit();\n}`,
      line: null, reference: "https://www.selenium.dev/documentation/webdriver/getting_started/",
    }, disabledRuleIds);
  }

  // Driver init inside @Test body — scan ahead up to 30 lines after @Test annotation
  let driverInTestLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/@Test\b/.test(lines[i])) {
      const windowEnd = Math.min(i + 30, lines.length - 1);
      for (let j = i + 1; j <= windowEnd; j++) {
        if (/new\s+(ChromeDriver|FirefoxDriver|EdgeDriver|WebDriver)\s*\(/.test(lines[j])) {
          driverInTestLine = j + 1;
          break;
        }
      }
      if (driverInTestLine !== null) break;
    }
  }
  if (driverInTestLine !== null) pushFinding(findings, {
    ruleId: "SEL-J-BM-002", category: "browser_mgmt", severity: "warning",
    title: "Driver initialised inside @Test method",
    description: "Instantiate driver in @Before/@BeforeEach, not inside each test",
    impact: "Repeated browser launches slow the suite and may leave orphaned processes.",
    fix: `@BeforeEach\nvoid setUp() {\n  driver = new ChromeDriver();\n}`,
    line: driverInTestLine, reference: "https://www.selenium.dev/documentation/webdriver/getting_started/",
  }, disabledRuleIds);

  const hardcodedBrowser = lineMatches(content, /new\s+(ChromeDriver|FirefoxDriver)\s*\(\s*\)/);
  if (hardcodedBrowser.length) pushFinding(findings, {
    ruleId: "SEL-J-BM-003", category: "browser_mgmt", severity: "info",
    title: "Hardcoded browser type without options",
    description: "Pass DesiredCapabilities/Options to allow grid / headless configuration",
    impact: "Cannot switch to headless or grid mode without code changes.",
    fix: `ChromeOptions options = new ChromeOptions();\noptions.addArguments("--headless");\ndriver = new ChromeDriver(options);`,
    line: hardcodedBrowser[0], reference: "https://www.selenium.dev/documentation/webdriver/browsers/",
  }, disabledRuleIds);

  // ── Reliability ──
  if (findElementCount > 3) pushFinding(findings, {
    ruleId: "SEL-J-REL-001", category: "reliability", severity: "warning",
    title: "StaleElementReferenceException risk",
    description: "Multiple findElement calls without re-fetch risk StaleElementReferenceException",
    impact: "Intermittent test failures when the DOM updates between calls.",
    fix: `// Re-fetch elements just before use, or use ExpectedConditions.refreshed:\nWebElement el = wait.until(ExpectedConditions.refreshed(\n  ExpectedConditions.elementToBeClickable(By.id("btn"))));`,
    line: null, reference: "https://www.selenium.dev/documentation/webdriver/troubleshooting/errors/",
  }, disabledRuleIds);

  if (hasTests && !/TakesScreenshot|getScreenshotAs/.test(content)) {
    pushFinding(findings, {
      ruleId: "SEL-J-REL-002", category: "reliability", severity: "info",
      title: "No screenshot on failure",
      description: "Add screenshot capture in @After to aid failure diagnosis",
      impact: "Failures are harder to diagnose without visual evidence.",
      fix: `@AfterEach\nvoid tearDown() {\n  File src = ((TakesScreenshot) driver).getScreenshotAs(OutputType.FILE);\n  FileUtils.copyFile(src, new File("screenshots/failure.png"));\n  driver.quit();\n}`,
      line: null, reference: "https://www.selenium.dev/documentation/test_practices/encouraged/take_screenshot_on_failure/",
    }, disabledRuleIds);
  }

  // driver.get() followed within 3 lines by driver.findElement without wait
  let navRaceLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/driver\.get\s*\(/.test(lines[i])) {
      const windowEnd = Math.min(i + 3, lines.length - 1);
      const segment = lines.slice(i + 1, windowEnd + 1);
      const hasWait = segment.some((l) => /WebDriverWait|wait\.until|implicitlyWait/.test(l));
      const hasFindElement = segment.some((l) => /driver\.findElement/.test(l));
      if (hasFindElement && !hasWait) {
        navRaceLine = i + 1;
        break;
      }
    }
  }
  if (navRaceLine !== null) pushFinding(findings, {
    ruleId: "SEL-J-REL-003", category: "reliability", severity: "warning",
    title: "Navigate then immediately find element",
    description: "Navigating then immediately finding an element races page load",
    impact: "NoSuchElementException on slow page loads.",
    fix: `driver.get(url);\nwait.until(ExpectedConditions.visibilityOfElementLocated(By.id("content")));\ndriver.findElement(By.id("btn")).click();`,
    line: navRaceLine, reference: "https://www.selenium.dev/documentation/webdriver/waits/",
  }, disabledRuleIds);

  // findElement inside a loop — scan up to 20 lines after loop keyword
  let findInLoopLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/for\s*\(|while\s*\(/.test(lines[i])) {
      const windowEnd = Math.min(i + 20, lines.length - 1);
      for (let j = i + 1; j <= windowEnd; j++) {
        if (/findElement/.test(lines[j])) {
          findInLoopLine = j + 1;
          break;
        }
      }
      if (findInLoopLine !== null) break;
    }
  }
  if (findInLoopLine !== null) pushFinding(findings, {
    ruleId: "SEL-J-REL-004", category: "reliability", severity: "critical",
    title: "findElement inside a loop",
    description: "findElement in a loop is a flakiness and performance hazard; use findElements or WebDriverWait",
    impact: "StaleElementReferenceException and slow test execution.",
    fix: `List<WebElement> items = driver.findElements(By.cssSelector(".item"));\nfor (WebElement item : items) {\n  // process item\n}`,
    line: findInLoopLine, reference: "https://www.selenium.dev/documentation/webdriver/elements/",
  }, disabledRuleIds);

  // ── Security ──
  const secrets = lineMatches(content, /(password|secret|token|apikey)\s*=\s*"[^"]{4,}"/i)
    .filter((ln) => !/System\.getenv|@Value|process\.env/.test(lines[ln - 1] || ""));
  if (secrets.length) pushFinding(findings, {
    ruleId: "SEL-J-SEC-001", category: "security", severity: "critical",
    title: "Hardcoded credential",
    description: "Hardcoded credentials in test code; use environment variables or a secrets vault",
    impact: "Credentials leak via git history and CI logs.",
    fix: `String password = System.getenv("TEST_PASSWORD");`,
    line: secrets[0], reference: "https://owasp.org/www-project-top-ten/",
  }, disabledRuleIds);

  const hardcodedUrl = lineMatches(content, /driver\.get\s*\(\s*"https?:\/\//);
  if (hardcodedUrl.length) pushFinding(findings, {
    ruleId: "SEL-J-SEC-002", category: "security", severity: "warning",
    title: "Hardcoded URL",
    description: "Hardcode URLs make tests environment-specific; use a config/property file",
    impact: "Tests cannot run against different environments without code changes.",
    fix: `String baseUrl = System.getenv("BASE_URL");\ndriver.get(baseUrl + "/login");`,
    line: hardcodedUrl[0], reference: "Team standards",
  }, disabledRuleIds);

  const disabledSsl = lineMatches(content, /setAcceptInsecureCerts\s*\(\s*true\s*\)/);
  if (disabledSsl.length) pushFinding(findings, {
    ruleId: "SEL-J-SEC-003", category: "security", severity: "info",
    title: "SSL verification disabled",
    description: "Disabling SSL verification hides real certificate issues",
    impact: "Tests pass against misconfigured HTTPS endpoints.",
    fix: `// Remove setAcceptInsecureCerts(true); configure proper certificates instead.`,
    line: disabledSsl[0], reference: "https://www.selenium.dev/documentation/webdriver/browsers/",
  }, disabledRuleIds);

  // ── Coding Standards ──
  // @Test on one line, method with numeric name on next
  let numericTestNameLine = null;
  for (let i = 0; i < lines.length - 1; i++) {
    if (/@Test\b/.test(lines[i]) && /public\s+void\s+test\d+\s*\(/.test(lines[i + 1])) {
      numericTestNameLine = i + 2;
      break;
    }
  }
  if (numericTestNameLine !== null) pushFinding(findings, {
    ruleId: "SEL-J-STD-001", category: "coding_standards", severity: "info",
    title: "Non-descriptive numeric test name",
    description: "Numeric test names (test1, test2) are not descriptive",
    impact: "Failures are hard to diagnose from the test name alone.",
    fix: `@Test\n@DisplayName("Should display error message on invalid login")\nvoid shouldDisplayErrorOnInvalidLogin() { ... }`,
    line: numericTestNameLine, reference: "https://junit.org/junit5/docs/current/user-guide/",
  }, disabledRuleIds);

  const consoleLogs = lineMatches(content, /System\.out\.print/);
  if (consoleLogs.length) pushFinding(findings, {
    ruleId: "SEL-J-STD-002", category: "coding_standards", severity: "info",
    title: "Console logging in test",
    description: "Use SLF4J/Log4j for logging, not System.out",
    impact: "Console output bypasses structured logging and is not captured in reports.",
    fix: `private static final Logger log = LoggerFactory.getLogger(MyTest.class);\nlog.info("Navigating to dashboard");`,
    line: consoleLogs[0], reference: "Team standards",
  }, disabledRuleIds);

  const broadCatch = lineMatches(content, /catch\s*\(\s*Exception\s+/);
  if (broadCatch.length) pushFinding(findings, {
    ruleId: "SEL-J-STD-003", category: "coding_standards", severity: "warning",
    title: "Broad Exception catch",
    description: "Catching bare Exception hides real errors; catch specific exceptions",
    impact: "Swallowed exceptions mask test failures.",
    fix: `catch (NoSuchElementException | TimeoutException e) {\n  // handle specifically\n}`,
    line: broadCatch[0], reference: "Team standards",
  }, disabledRuleIds);

  const magicTimeout = lineMatches(content, /WebDriverWait\s*\([^,]+,\s*\d{2,}/);
  if (magicTimeout.length) pushFinding(findings, {
    ruleId: "SEL-J-STD-004", category: "coding_standards", severity: "info",
    title: "Magic number timeout",
    description: "Magic number timeout; define as a named constant",
    impact: "Timeouts are hard to update consistently across the suite.",
    fix: `private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(30);\nWebDriverWait wait = new WebDriverWait(driver, DEFAULT_TIMEOUT);`,
    line: magicTimeout[0], reference: "Team standards",
  }, disabledRuleIds);

  // ── Selenium 4 migration & modern practice ────────────────────────────────

  const jsClick = lineMatches(content, /JavascriptExecutor[\s\S]{0,40}?executeScript\s*\(\s*["']arguments\[0\]\.click|executeScript\s*\(\s*["']arguments\[0\]\.click/);
  if (jsClick.length) pushFinding(findings, {
    ruleId: "SEL-J-REL-005", category: "reliability", severity: "warning",
    title: "JavascriptExecutor click instead of a native click",
    description: `Line ${jsClick[0]} clicks via executeScript rather than WebElement.click().`,
    impact: "A JS click fires even when the element is covered, disabled, or off-screen — so the test passes on a page a real user could not operate.",
    fix: `// Wait for real actionability instead of forcing the click\nnew WebDriverWait(driver, Duration.ofSeconds(10))\n    .until(ExpectedConditions.elementToBeClickable(locator))\n    .click();`,
    line: jsClick[0], reference: "https://www.selenium.dev/documentation/webdriver/elements/interactions/",
  }, disabledRuleIds);

  const actionsNoPerform = [];
  lines.forEach((line, idx) => {
    if (!/new\s+Actions\s*\(|\bactions\s*\./.test(line)) return;
    const window = lines.slice(idx, idx + 4).join(" ");
    if (!/\.perform\s*\(\s*\)|\.build\s*\(\s*\)\s*\.perform/.test(window)) actionsNoPerform.push(idx + 1);
  });
  if (actionsNoPerform.length) pushFinding(findings, {
    ruleId: "SEL-J-REL-006", category: "reliability", severity: "critical",
    title: "Actions chain never executed (missing perform())",
    description: `An Actions sequence at line ${actionsNoPerform[0]} is built but .perform() is never called on it.`,
    impact: "The interaction silently does nothing, so the assertion after it tests the un-interacted page — a test that passes while covering nothing.",
    fix: `new Actions(driver)\n    .moveToElement(menu)\n    .click(item)\n    .perform();   // <- required`,
    line: actionsNoPerform[0], reference: "https://www.selenium.dev/documentation/webdriver/actions_api/",
  }, disabledRuleIds);

  const frameIn = countMatches(content, /switchTo\s*\(\s*\)\s*\.frame\s*\(/g);
  const frameOut = countMatches(content, /switchTo\s*\(\s*\)\s*\.defaultContent\s*\(|switchTo\s*\(\s*\)\s*\.parentFrame\s*\(/g);
  if (frameIn > frameOut) pushFinding(findings, {
    ruleId: "SEL-J-REL-007", category: "reliability", severity: "warning",
    title: "Frame entered but never exited",
    description: `switchTo().frame() is called ${frameIn} time(s) but defaultContent()/parentFrame() only ${frameOut}.`,
    impact: "The driver stays scoped to the iframe, so every later findElement looks in the wrong document and fails with NoSuchElement.",
    fix: `driver.switchTo().frame("payment");\n// ... interact inside the frame ...\ndriver.switchTo().defaultContent();`,
    line: lineMatches(content, /switchTo\s*\(\s*\)\s*\.frame\s*\(/)[0] ?? null,
  }, disabledRuleIds);

  const sendKeysNoClear = lineMatches(content, /\.sendKeys\s*\(/).filter((ln) => {
    const prev = lines.slice(Math.max(0, ln - 3), ln).join(" ");
    return !/\.clear\s*\(\s*\)/.test(prev) && !/Keys\.(?:ENTER|TAB|RETURN|ESCAPE)/.test(lines[ln - 1] || "");
  });
  if (sendKeysNoClear.length) pushFinding(findings, {
    ruleId: "SEL-J-REL-008", category: "reliability", severity: "info",
    title: "sendKeys() without clear()",
    description: `Line ${sendKeysNoClear[0]} types into a field without clearing it first.`,
    impact: "Autofilled or retained values are appended rather than replaced, producing values like 'oldnew' on reruns.",
    fix: `WebElement email = driver.findElement(emailLocator);\nemail.clear();\nemail.sendKeys("user@example.com");`,
    line: sendKeysNoClear[0],
  }, disabledRuleIds);

  const pageSourceAssert = lineMatches(content, /getPageSource\s*\(\s*\)\s*\.contains\s*\(/);
  if (pageSourceAssert.length) pushFinding(findings, {
    ruleId: "SEL-J-ASS-005", category: "assertions", severity: "warning",
    title: "Assertion against getPageSource()",
    description: `Line ${pageSourceAssert[0]} asserts on raw page HTML with a substring check.`,
    impact: "Matches text in hidden nodes, script blocks and attributes, so it passes when the user can see nothing — and breaks on unrelated markup changes.",
    fix: `WebElement banner = wait.until(\n    ExpectedConditions.visibilityOfElementLocated(By.cssSelector("[data-testid='success']")));\nassertEquals("Payment complete", banner.getText());`,
    line: pageSourceAssert[0],
  }, disabledRuleIds);

  const driverProp = lineMatches(content, /System\.setProperty\s*\(\s*["']webdriver\./);
  if (driverProp.length) pushFinding(findings, {
    ruleId: "SEL-J-CFG-001", category: "browser_mgmt", severity: "warning",
    title: "Manual driver binary path (Selenium Manager makes this obsolete)",
    description: `Line ${driverProp[0]} sets a webdriver.* system property to a local binary path.`,
    impact: "The path is machine-specific, so the suite fails on CI and on any teammate's machine, and the binary drifts out of sync with the browser.",
    fix: `// Selenium 4.6+ resolves the driver automatically — delete the setProperty line\nWebDriver driver = new ChromeDriver();`,
    line: driverProp[0], reference: "https://www.selenium.dev/documentation/selenium_manager/",
  }, disabledRuleIds);

  const desiredCaps = lineMatches(content, /DesiredCapabilities|\.merge\s*\(\s*capabilities|new\s+ChromeDriver\s*\(\s*capabilities\s*\)/);
  if (desiredCaps.length) pushFinding(findings, {
    ruleId: "SEL-J-CFG-002", category: "browser_mgmt", severity: "critical",
    title: "DesiredCapabilities — removed in Selenium 4",
    description: `Line ${desiredCaps[0]} uses DesiredCapabilities, which Selenium 4 removed in favour of browser-specific Options classes.`,
    impact: "The code will not compile or run against Selenium 4, blocking the upgrade.",
    fix: `ChromeOptions options = new ChromeOptions();\noptions.addArguments("--headless=new");\noptions.setAcceptInsecureCerts(true);\nWebDriver driver = new ChromeDriver(options);`,
    line: desiredCaps[0], reference: "https://www.selenium.dev/documentation/webdriver/getting_started/upgrade_to_selenium_4/",
  }, disabledRuleIds);

  const hasImplicit = /implicitlyWait/.test(content);
  const hasExplicit = /WebDriverWait|FluentWait/.test(content);
  if (hasImplicit && hasExplicit) pushFinding(findings, {
    ruleId: "SEL-J-WAI-005", category: "waits", severity: "critical",
    title: "Implicit and explicit waits mixed",
    description: "The file configures an implicit wait and also uses WebDriverWait/FluentWait.",
    impact: "Selenium documents this combination as producing unpredictable wait times — a 10s explicit wait can block far longer, and negative conditions like invisibility become unreliable.",
    fix: `// Drop the implicit wait entirely and rely on explicit waits\n// driver.manage().timeouts().implicitlyWait(...);  <- remove\nnew WebDriverWait(driver, Duration.ofSeconds(10))\n    .until(ExpectedConditions.visibilityOfElementLocated(locator));`,
    line: lineMatches(content, /implicitlyWait/)[0] ?? null,
    reference: "https://www.selenium.dev/documentation/webdriver/waits/#implicit-wait",
  }, disabledRuleIds);

  const swallowedDisplayed = [];
  lines.forEach((line, idx) => {
    if (!/try\s*\{/.test(line)) return;
    const window = lines.slice(idx, idx + 6).join(" ");
    if (/isDisplayed\s*\(\s*\)|isEnabled\s*\(\s*\)/.test(window) && /catch\s*\(/.test(window) && /return\s+false|;\s*\}/.test(window)) {
      swallowedDisplayed.push(idx + 1);
    }
  });
  if (swallowedDisplayed.length) pushFinding(findings, {
    ruleId: "SEL-J-REL-009", category: "reliability", severity: "warning",
    title: "isDisplayed() wrapped in try/catch as an existence check",
    description: `Line ${swallowedDisplayed[0]} swallows an exception to decide whether an element is present.`,
    impact: "A genuine failure — wrong page, timeout, crashed driver — is indistinguishable from 'not present', so the test skips its real verification and still passes.",
    fix: `// Ask the driver directly instead of catching\nboolean present = !driver.findElements(locator).isEmpty();`,
    line: swallowedDisplayed[0],
  }, disabledRuleIds);

  const chainedFind = lineMatches(content, /findElement\s*\((?:[^()]|\([^()]*\))*\)\s*\.\s*findElement\s*\(/);
  if (chainedFind.length) pushFinding(findings, {
    ruleId: "SEL-J-LOC-006", category: "locators", severity: "info",
    title: "Chained findElement() calls",
    description: `Line ${chainedFind[0]} chains findElement into another findElement.`,
    impact: "Each hop is a separate round trip that can go stale mid-chain, and the locator now encodes two levels of DOM structure.",
    fix: `// One locator scoped with a CSS descendant selector\ndriver.findElement(By.cssSelector("[data-testid='cart'] .line-item__price"));`,
    line: chainedFind[0],
  }, disabledRuleIds);

  // ── Test tagging / grouping ──
  {
    const hasJUnitTag = /@Tag\s*\(|@Category\s*\(/.test(content);
    const hasTestNgGroup = /groups\s*=\s*[{"']/.test(content);
    if (hasTests && !hasJUnitTag && !hasTestNgGroup) pushFinding(findings, {
      ruleId: "SEL-J-STD-005", category: "coding_standards", severity: "info",
      title: "Tests carry no @Tag or TestNG group",
      description: "No @Tag (JUnit 5), @Category (JUnit 4) or groups= (TestNG) appears in this file, so its tests cannot be selected by the runner.",
      impact: "CI must run the whole suite every time — no smoke subset, no way to quarantine a flaky test without deleting or commenting it out.",
      fix: `@Test\n@Tag("smoke")\n@Tag("checkout")\nvoid completesCheckout() { }\n\n// then: mvn test -Dgroups=smoke`,
      line: lineMatches(content, /@Test\b/)[0] ?? null,
      reference: "https://junit.org/junit5/docs/current/user-guide/#writing-tests-tagging-and-filtering",
    }, disabledRuleIds);
  }

  const crit = findings.filter((f) => f.severity === "critical").length;
  const summary =
    crit > 0
      ? `Selenium (Java) scan of ${filename}: ${findings.length} finding(s), ${crit} critical.`
      : `Selenium (Java) scan of ${filename}: ${findings.length} finding(s) from standard rules.`;

  return buildAuditResult({
    filename,
    categoryIds: CATEGORY_IDS,
    findings,
    metrics: {
      totalTests: countMatches(content, /@Test\b/g),
      hardSleeps: threadSleep.length,
      xpathLocators: xpath.length,
      findElementCalls: findElementCount,
      hardcodedSecrets: secrets.length,
    },
    summary,
    positives:
      threadSleep.length === 0 && findInLoopLine === null
        ? [{ title: "No hard sleeps or loop element queries", description: "No Thread.sleep or findElement-in-loop detected." }]
        : undefined,
  });
}
