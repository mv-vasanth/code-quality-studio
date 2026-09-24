import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, countMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.selenium_csharp.categories.map((c) => c.id);

/**
 * Local rules for Selenium WebDriver (C#) — heuristic, regex-based; not a substitute
 * for full review.
 */
export function analyseSeleniumCsharpLocally(filename, content, options = {}) {
  const disabledRuleIds = options.disabledRuleIds ?? new Set();
  const findings = [];
  const lines = content.split(/\r?\n/);
  const hasTests = /\[Test\]|\[Fact\]|\[TestMethod\]/.test(content);

  // ── Locators ──
  const xpath = lineMatches(content, /By\.XPath\s*\(/);
  if (xpath.length) pushFinding(findings, {
    ruleId: "SEL-CS-LOC-001", category: "locators", severity: "warning",
    title: "XPath locator",
    description: "XPath is brittle; prefer By.CssSelector or By.Id",
    impact: "Tests break when the DOM structure changes.",
    fix: `// Before\ndriver.FindElement(By.XPath("//button[@id='submit']")).Click();\n// After\ndriver.FindElement(By.CssSelector("[data-testid='submit']")).Click();`,
    line: xpath[0], reference: "https://www.selenium.dev/documentation/test_practices/encouraged/locators/",
  }, disabledRuleIds);

  const byId = lineMatches(content, /By\.Id\s*\(/);
  if (byId.length) pushFinding(findings, {
    ruleId: "SEL-CS-LOC-002", category: "locators", severity: "info",
    title: "By.Id locator",
    description: "ID locators are acceptable but brittle with auto-generated IDs",
    impact: "Auto-generated IDs break the locator on re-render.",
    fix: `driver.FindElement(By.CssSelector("[data-testid='my-element']"));`,
    line: byId[0], reference: "https://www.selenium.dev/documentation/test_practices/encouraged/locators/",
  }, disabledRuleIds);

  const byName = lineMatches(content, /By\.Name\s*\(/);
  if (byName.length) pushFinding(findings, {
    ruleId: "SEL-CS-LOC-003", category: "locators", severity: "warning",
    title: "By.Name locator",
    description: "name attribute may change; prefer By.CssSelector with data-testid",
    impact: "Renaming the form field breaks the test.",
    fix: `driver.FindElement(By.CssSelector("[data-testid='username']"));`,
    line: byName[0], reference: "https://www.selenium.dev/documentation/test_practices/encouraged/locators/",
  }, disabledRuleIds);

  const absXpath = lineMatches(content, /By\.XPath\s*\(\s*"\/html/);
  if (absXpath.length) pushFinding(findings, {
    ruleId: "SEL-CS-LOC-004", category: "locators", severity: "critical",
    title: "Absolute XPath",
    description: "Absolute XPath breaks on any DOM change",
    impact: "Any structural change to the page breaks the locator.",
    fix: `// Before\ndriver.FindElement(By.XPath("/html/body/div[2]/form/input"));\n// After\ndriver.FindElement(By.CssSelector("[data-testid='email']"));`,
    line: absXpath[0], reference: "https://www.selenium.dev/documentation/test_practices/encouraged/locators/",
  }, disabledRuleIds);

  // ── Waits ──
  const threadSleep = lineMatches(content, /Thread\.Sleep\s*\(/);
  if (threadSleep.length) pushFinding(findings, {
    ruleId: "SEL-CS-WAI-001", category: "waits", severity: "critical",
    title: "Thread.Sleep in test",
    description: "Hard sleep causes flakiness; use WebDriverWait with ExpectedConditions",
    impact: "Flaky and slow tests in CI.",
    fix: `WebDriverWait wait = new WebDriverWait(driver, TimeSpan.FromSeconds(10));\nwait.Until(ExpectedConditions.ElementIsVisible(By.Id("result")));`,
    line: threadSleep[0], reference: "https://www.selenium.dev/documentation/webdriver/waits/",
  }, disabledRuleIds);

  const implicitWait = lineMatches(content, /Manage\(\)\.Timeouts\(\)\.ImplicitWait/);
  if (implicitWait.length) pushFinding(findings, {
    ruleId: "SEL-CS-WAI-002", category: "waits", severity: "warning",
    title: "Implicit wait used",
    description: "Implicit + explicit waits interact unpredictably; choose one strategy",
    impact: "Intermittent failures and hard-to-diagnose timing issues.",
    fix: `// Remove implicit wait and use WebDriverWait instead:\nWebDriverWait wait = new WebDriverWait(driver, TimeSpan.FromSeconds(10));\nwait.Until(ExpectedConditions.ElementToBeClickable(By.Id("btn")));`,
    line: implicitWait[0], reference: "https://www.selenium.dev/documentation/webdriver/waits/",
  }, disabledRuleIds);

  if (/FindElement/.test(content) && !/WebDriverWait/.test(content)) {
    pushFinding(findings, {
      ruleId: "SEL-CS-WAI-003", category: "waits", severity: "info",
      title: "No explicit wait",
      description: "Add explicit WebDriverWait for reliable element interaction",
      impact: "Tests may intermittently fail on slow-loading pages.",
      fix: `WebDriverWait wait = new WebDriverWait(driver, TimeSpan.FromSeconds(10));\nwait.Until(ExpectedConditions.ElementIsVisible(By.Id("element")));`,
      line: null, reference: "https://www.selenium.dev/documentation/webdriver/waits/",
    }, disabledRuleIds);
  }

  const taskDelay = lineMatches(content, /await\s+Task\.Delay\s*\(/);
  if (taskDelay.length) pushFinding(findings, {
    ruleId: "SEL-CS-WAI-004", category: "waits", severity: "warning",
    title: "Task.Delay in async test",
    description: "Task.Delay is an async hard wait; use polling with ExpectedConditions",
    impact: "Flaky and slow tests; masks missing assertions.",
    fix: `WebDriverWait wait = new WebDriverWait(driver, TimeSpan.FromSeconds(10));\nwait.Until(ExpectedConditions.ElementIsVisible(By.Id("result")));`,
    line: taskDelay[0], reference: "https://www.selenium.dev/documentation/webdriver/waits/",
  }, disabledRuleIds);

  // ── Assertions ──
  const rawBoolAssert = lineMatches(content, /Assert\.IsTrue\s*\(\s*driver\.(Title|Url|FindElement)/);
  if (rawBoolAssert.length) pushFinding(findings, {
    ruleId: "SEL-CS-ASS-001", category: "assertions", severity: "warning",
    title: "Raw boolean assert on driver state",
    description: "Prefer FluentAssertions or NUnit's Assert.That for richer failure messages",
    impact: "Failure messages are cryptic without a description.",
    fix: `// Before\nAssert.IsTrue(driver.Title.Contains("Dashboard"));\n// After\ndriver.Title.Should().Contain("Dashboard", "page title should indicate dashboard");`,
    line: rawBoolAssert[0], reference: "https://fluentassertions.com/",
  }, disabledRuleIds);

  const missingAssertMsg = lineMatches(content, /Assert\.(IsTrue|IsFalse|AreEqual)\s*\([^,)]+\)/);
  if (missingAssertMsg.length) pushFinding(findings, {
    ruleId: "SEL-CS-ASS-002", category: "assertions", severity: "info",
    title: "Assertion without message",
    description: "Assertions without a message are hard to diagnose",
    impact: "Hard to know why a test failed without context.",
    fix: `Assert.IsTrue(button.Displayed, "Expected submit button to be visible");`,
    line: missingAssertMsg[0], reference: "https://docs.nunit.org/articles/nunit/writing-tests/assertions/",
  }, disabledRuleIds);

  if (hasTests && !/Assert\.|\.Should\(\)/.test(content)) {
    pushFinding(findings, {
      ruleId: "SEL-CS-ASS-003", category: "assertions", severity: "warning",
      title: "No assertions in test",
      description: "Test has no assertion",
      impact: "Tests that never fail provide false confidence.",
      fix: `Assert.AreEqual("Dashboard", driver.Title, "Page title should be Dashboard");`,
      line: null, reference: "https://docs.nunit.org/articles/nunit/writing-tests/assertions/",
    }, disabledRuleIds);
  }

  const consoleWrite = lineMatches(content, /Console\.Write/);
  if (consoleWrite.length) pushFinding(findings, {
    ruleId: "SEL-CS-ASS-004", category: "assertions", severity: "info",
    title: "Console.Write for verification",
    description: "Use a proper assertion or test logger, not Console.Write",
    impact: "Console output is not captured by test reports.",
    fix: `Assert.AreEqual(expected, actual, "Values should match");`,
    line: consoleWrite[0], reference: "Team standards",
  }, disabledRuleIds);

  // ── Page Objects ──
  const findElementCount = countMatches(content, /FindElement/g);
  if (hasTests && findElementCount > 2 && !/IWebDriver\s+\w+\s*;|private\s+IWebDriver/.test(content)) {
    pushFinding(findings, {
      ruleId: "SEL-CS-PO-001", category: "page_objects", severity: "warning",
      title: "No Page Object pattern",
      description: "Extract a Page Object class for maintainability",
      impact: "Test duplication and high maintenance cost.",
      fix: `public class LoginPage {\n  private readonly IWebDriver _driver;\n  public LoginPage(IWebDriver driver) => _driver = driver;\n  public void EnterUsername(string value) =>\n    _driver.FindElement(By.CssSelector("[data-testid='username']")).SendKeys(value);\n}`,
      line: null, reference: "https://www.selenium.dev/documentation/test_practices/encouraged/page_object_models/",
    }, disabledRuleIds);
  }

  if (/\[FindsBy/.test(content) && !/PageFactory\.InitElements/.test(content)) {
    const findsByLine = lineMatches(content, /\[FindsBy/)[0] ?? null;
    pushFinding(findings, {
      ruleId: "SEL-CS-PO-002", category: "page_objects", severity: "info",
      title: "PageFactory.InitElements not called",
      description: "Missing PageFactory.InitElements(); annotations won't be populated",
      impact: "NullReferenceException at runtime when accessing [FindsBy] elements.",
      fix: `public MyPage(IWebDriver driver) {\n  PageFactory.InitElements(driver, this);\n}`,
      line: findsByLine, reference: "https://www.selenium.dev/selenium/docs/api/dotnet/",
    }, disabledRuleIds);
  }

  // ── Browser Management ──
  const hasDriverInit = /new\s+(ChromeDriver|FirefoxDriver|EdgeDriver)/.test(content);
  if (hasDriverInit && !(/\.Quit\(\)|\.Dispose\(\)|using\s+var/.test(content))) {
    pushFinding(findings, {
      ruleId: "SEL-CS-BM-001", category: "browser_mgmt", severity: "critical",
      title: "IWebDriver not disposed",
      description: "WebDriver not disposed; browser process leaks",
      impact: "Resource leak; CI machines run out of browser processes.",
      fix: `[TearDown]\npublic void TearDown() {\n  driver?.Quit();\n  driver?.Dispose();\n}`,
      line: null, reference: "https://www.selenium.dev/documentation/webdriver/getting_started/",
    }, disabledRuleIds);
  }

  // Driver created inside [Test]/[Fact] method body
  let driverInTestLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/\[Test\]|\[Fact\]/.test(lines[i])) {
      const windowEnd = Math.min(i + 30, lines.length - 1);
      for (let j = i + 1; j <= windowEnd; j++) {
        if (/new\s+(ChromeDriver|FirefoxDriver|EdgeDriver)\s*\(/.test(lines[j])) {
          driverInTestLine = j + 1;
          break;
        }
      }
      if (driverInTestLine !== null) break;
    }
  }
  if (driverInTestLine !== null) pushFinding(findings, {
    ruleId: "SEL-CS-BM-002", category: "browser_mgmt", severity: "warning",
    title: "Driver created in test method",
    description: "Create driver in [SetUp]/[OneTimeSetUp], not inside each test",
    impact: "Repeated browser launches slow the suite and may leave orphaned processes.",
    fix: `[SetUp]\npublic void SetUp() {\n  driver = new ChromeDriver();\n}`,
    line: driverInTestLine, reference: "https://www.selenium.dev/documentation/webdriver/getting_started/",
  }, disabledRuleIds);

  // ChromeOptions/FirefoxOptions without headless
  let noHeadlessLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/new\s+(ChromeOptions|FirefoxOptions)/.test(lines[i])) {
      const windowEnd = Math.min(i + 10, lines.length - 1);
      const segment = lines.slice(i, windowEnd + 1).join("\n");
      if (!/AddArgument.*headless|headless/.test(segment)) {
        noHeadlessLine = i + 1;
        break;
      }
    }
  }
  if (noHeadlessLine !== null) pushFinding(findings, {
    ruleId: "SEL-CS-BM-003", category: "browser_mgmt", severity: "info",
    title: "No headless option configured",
    description: "Consider headless mode for CI environments",
    impact: "UI browser launches are slower and require a display in CI.",
    fix: `var options = new ChromeOptions();\noptions.AddArgument("--headless");\ndriver = new ChromeDriver(options);`,
    line: noHeadlessLine, reference: "https://www.selenium.dev/documentation/webdriver/browsers/chrome/",
  }, disabledRuleIds);

  // ── Reliability ──
  if (findElementCount > 3) pushFinding(findings, {
    ruleId: "SEL-CS-REL-001", category: "reliability", severity: "warning",
    title: "StaleElement risk",
    description: "Repeated FindElement calls without re-fetch risk StaleElementReferenceException",
    impact: "Intermittent test failures when the DOM updates between calls.",
    fix: `// Re-fetch elements just before use or wrap with WebDriverWait:\nvar el = wait.Until(ExpectedConditions.ElementToBeClickable(By.Id("btn")));`,
    line: null, reference: "https://www.selenium.dev/documentation/webdriver/troubleshooting/errors/",
  }, disabledRuleIds);

  if (hasTests && !/GetScreenshot|TakesScreenshot/.test(content)) {
    pushFinding(findings, {
      ruleId: "SEL-CS-REL-002", category: "reliability", severity: "info",
      title: "No screenshot on failure",
      description: "Capture screenshots on failure for easier debugging",
      impact: "Failures are harder to diagnose without visual evidence.",
      fix: `[TearDown]\npublic void TearDown() {\n  var screenshot = ((ITakesScreenshot)driver).GetScreenshot();\n  screenshot.SaveAsFile("failure.png");\n  driver?.Quit();\n}`,
      line: null, reference: "https://www.selenium.dev/documentation/test_practices/encouraged/take_screenshot_on_failure/",
    }, disabledRuleIds);
  }

  // Navigate().GoToUrl within 3 lines of FindElement without wait
  let navRaceLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/Navigate\(\)\.GoToUrl/.test(lines[i])) {
      const windowEnd = Math.min(i + 3, lines.length - 1);
      const segment = lines.slice(i + 1, windowEnd + 1);
      const hasWait = segment.some((l) => /WebDriverWait|wait\.Until|ImplicitWait/.test(l));
      const hasFindElement = segment.some((l) => /FindElement/.test(l));
      if (hasFindElement && !hasWait) {
        navRaceLine = i + 1;
        break;
      }
    }
  }
  if (navRaceLine !== null) pushFinding(findings, {
    ruleId: "SEL-CS-REL-003", category: "reliability", severity: "warning",
    title: "Navigate then immediately find element",
    description: "Immediate FindElement after navigation may race page load",
    impact: "NoSuchElementException on slow page loads.",
    fix: `driver.Navigate().GoToUrl(url);\nwait.Until(ExpectedConditions.ElementIsVisible(By.Id("content")));\ndriver.FindElement(By.Id("btn")).Click();`,
    line: navRaceLine, reference: "https://www.selenium.dev/documentation/webdriver/waits/",
  }, disabledRuleIds);

  // FindElement inside a loop — scan up to 20 lines after loop keyword
  let findInLoopLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/for\s*\(|while\s*\(|foreach\s*\(/.test(lines[i])) {
      const windowEnd = Math.min(i + 20, lines.length - 1);
      for (let j = i + 1; j <= windowEnd; j++) {
        if (/FindElement/.test(lines[j])) {
          findInLoopLine = j + 1;
          break;
        }
      }
      if (findInLoopLine !== null) break;
    }
  }
  if (findInLoopLine !== null) pushFinding(findings, {
    ruleId: "SEL-CS-REL-004", category: "reliability", severity: "critical",
    title: "FindElement inside a loop",
    description: "FindElement inside a loop is a flakiness and perf hazard",
    impact: "StaleElementReferenceException and slow test execution.",
    fix: `var items = driver.FindElements(By.CssSelector(".item"));\nforeach (var item in items) {\n  // process item\n}`,
    line: findInLoopLine, reference: "https://www.selenium.dev/documentation/webdriver/elements/",
  }, disabledRuleIds);

  // ── Security ──
  const secrets = lineMatches(content, /(password|secret|token|apikey)\s*=\s*"[^"]{4,}"/i)
    .filter((ln) => !/Environment\.GetEnvironmentVariable|IConfiguration|GetValue/.test(lines[ln - 1] || ""));
  if (secrets.length) pushFinding(findings, {
    ruleId: "SEL-CS-SEC-001", category: "security", severity: "critical",
    title: "Hardcoded credential",
    description: "Hardcoded credentials; use environment variables or IConfiguration",
    impact: "Credentials leak via git history and CI logs.",
    fix: `string password = Environment.GetEnvironmentVariable("TEST_PASSWORD");`,
    line: secrets[0], reference: "https://owasp.org/www-project-top-ten/",
  }, disabledRuleIds);

  const hardcodedUrl = lineMatches(content, /GoToUrl\s*\(\s*"https?:\/\//);
  if (hardcodedUrl.length) pushFinding(findings, {
    ruleId: "SEL-CS-SEC-002", category: "security", severity: "warning",
    title: "Hardcoded URL",
    description: "Hardcoded URL; load from appsettings.json or environment",
    impact: "Tests cannot run against different environments without code changes.",
    fix: `string baseUrl = Environment.GetEnvironmentVariable("BASE_URL");\ndriver.Navigate().GoToUrl(baseUrl + "/login");`,
    line: hardcodedUrl[0], reference: "Team standards",
  }, disabledRuleIds);

  const disabledSsl = lineMatches(content, /AcceptInsecureCertificates\s*=\s*true/);
  if (disabledSsl.length) pushFinding(findings, {
    ruleId: "SEL-CS-SEC-003", category: "security", severity: "info",
    title: "AcceptInsecureCertificates enabled",
    description: "Disabling SSL verification hides real certificate issues",
    impact: "Tests pass against misconfigured HTTPS endpoints.",
    fix: `// Remove AcceptInsecureCertificates = true; configure proper certificates instead.`,
    line: disabledSsl[0], reference: "https://www.selenium.dev/documentation/webdriver/browsers/",
  }, disabledRuleIds);

  // ── Coding Standards ──
  // [Test] on one line, method with numeric name on next
  let numericTestNameLine = null;
  for (let i = 0; i < lines.length - 1; i++) {
    if (/\[Test\]\s*$/.test(lines[i]) && /public\s+void\s+Test\d+\s*\(/.test(lines[i + 1])) {
      numericTestNameLine = i + 2;
      break;
    }
  }
  if (numericTestNameLine !== null) pushFinding(findings, {
    ruleId: "SEL-CS-STD-001", category: "coding_standards", severity: "info",
    title: "Non-descriptive numeric test name",
    description: "Numeric test names are not descriptive; use meaningful names",
    impact: "Failures are hard to diagnose from the test name alone.",
    fix: `[Test]\npublic void ShouldDisplayErrorOnInvalidLogin() { ... }`,
    line: numericTestNameLine, reference: "https://docs.nunit.org/articles/nunit/writing-tests/",
  }, disabledRuleIds);

  const consoleLogs = lineMatches(content, /Console\.Write/);
  if (consoleLogs.length) pushFinding(findings, {
    ruleId: "SEL-CS-STD-002", category: "coding_standards", severity: "info",
    title: "Console logging in test",
    description: "Use ITestOutputHelper or a proper logger, not Console.Write",
    impact: "Console output bypasses structured logging and is not captured in reports.",
    fix: `// Inject ITestOutputHelper in xUnit:\npublic MyTest(ITestOutputHelper output) => _output = output;\n_output.WriteLine("Navigating to dashboard");`,
    line: consoleLogs[0], reference: "Team standards",
  }, disabledRuleIds);

  const broadCatch = lineMatches(content, /catch\s*\(\s*Exception\s+/);
  if (broadCatch.length) pushFinding(findings, {
    ruleId: "SEL-CS-STD-003", category: "coding_standards", severity: "warning",
    title: "Broad Exception catch",
    description: "Catching bare Exception; catch specific exception types",
    impact: "Swallowed exceptions mask test failures.",
    fix: `catch (NoSuchElementException ex) {\n  // handle specifically\n}`,
    line: broadCatch[0], reference: "Team standards",
  }, disabledRuleIds);

  const magicTimeout = lineMatches(content, /WebDriverWait\s*\([^,]+,\s*TimeSpan\.FromSeconds\s*\(\s*\d{2,}/);
  if (magicTimeout.length) pushFinding(findings, {
    ruleId: "SEL-CS-STD-004", category: "coding_standards", severity: "info",
    title: "Magic number timeout",
    description: "Large magic number timeout; define as a named constant",
    impact: "Timeouts are hard to update consistently across the suite.",
    fix: `private static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(30);\nvar wait = new WebDriverWait(driver, DefaultTimeout);`,
    line: magicTimeout[0], reference: "Team standards",
  }, disabledRuleIds);

  // ── Selenium 4 migration & modern practice ────────────────────────────────

  const jsClick = lineMatches(content, /ExecuteScript\s*\(\s*["']arguments\[0\]\.click/i);
  if (jsClick.length) pushFinding(findings, {
    ruleId: "SEL-CS-REL-005", category: "reliability", severity: "warning",
    title: "ExecuteScript click instead of a native click",
    description: `Line ${jsClick[0]} clicks via ExecuteScript rather than IWebElement.Click().`,
    impact: "A JS click fires even when the element is covered, disabled, or off-screen — so the test passes on a page a real user could not operate.",
    fix: `var wait = new WebDriverWait(driver, TimeSpan.FromSeconds(10));\nwait.Until(ExpectedConditions.ElementToBeClickable(locator)).Click();`,
    line: jsClick[0], reference: "https://www.selenium.dev/documentation/webdriver/elements/interactions/",
  }, disabledRuleIds);

  const actionsNoPerform = [];
  lines.forEach((line, idx) => {
    if (!/new\s+Actions\s*\(|\bactions\s*\./i.test(line)) return;
    const window = lines.slice(idx, idx + 4).join(" ");
    if (!/\.Perform\s*\(\s*\)|\.Build\s*\(\s*\)\s*\.Perform/i.test(window)) actionsNoPerform.push(idx + 1);
  });
  if (actionsNoPerform.length) pushFinding(findings, {
    ruleId: "SEL-CS-REL-006", category: "reliability", severity: "critical",
    title: "Actions chain never executed (missing Perform())",
    description: `An Actions sequence at line ${actionsNoPerform[0]} is built but .Perform() is never called on it.`,
    impact: "The interaction silently does nothing, so the assertion after it tests the un-interacted page — a test that passes while covering nothing.",
    fix: `new Actions(driver)\n    .MoveToElement(menu)\n    .Click(item)\n    .Perform();   // <- required`,
    line: actionsNoPerform[0], reference: "https://www.selenium.dev/documentation/webdriver/actions_api/",
  }, disabledRuleIds);

  const frameIn = countMatches(content, /SwitchTo\s*\(\s*\)\s*\.Frame\s*\(/gi);
  const frameOut = countMatches(content, /SwitchTo\s*\(\s*\)\s*\.DefaultContent\s*\(|SwitchTo\s*\(\s*\)\s*\.ParentFrame\s*\(/gi);
  if (frameIn > frameOut) pushFinding(findings, {
    ruleId: "SEL-CS-REL-007", category: "reliability", severity: "warning",
    title: "Frame entered but never exited",
    description: `SwitchTo().Frame() is called ${frameIn} time(s) but DefaultContent()/ParentFrame() only ${frameOut}.`,
    impact: "The driver stays scoped to the iframe, so every later FindElement looks in the wrong document and fails with NoSuchElement.",
    fix: `driver.SwitchTo().Frame("payment");\n// ... interact inside the frame ...\ndriver.SwitchTo().DefaultContent();`,
    line: lineMatches(content, /SwitchTo\s*\(\s*\)\s*\.Frame\s*\(/i)[0] ?? null,
  }, disabledRuleIds);

  const sendKeysNoClear = lineMatches(content, /\.SendKeys\s*\(/i).filter((ln) => {
    const prev = lines.slice(Math.max(0, ln - 3), ln).join(" ");
    return !/\.Clear\s*\(\s*\)/i.test(prev) && !/Keys\.(?:Enter|Tab|Return|Escape)/i.test(lines[ln - 1] || "");
  });
  if (sendKeysNoClear.length) pushFinding(findings, {
    ruleId: "SEL-CS-REL-008", category: "reliability", severity: "info",
    title: "SendKeys() without Clear()",
    description: `Line ${sendKeysNoClear[0]} types into a field without clearing it first.`,
    impact: "Autofilled or retained values are appended rather than replaced, producing values like 'oldnew' on reruns.",
    fix: `var email = driver.FindElement(emailLocator);\nemail.Clear();\nemail.SendKeys("user@example.com");`,
    line: sendKeysNoClear[0],
  }, disabledRuleIds);

  const pageSourceAssert = lineMatches(content, /PageSource\s*\.\s*Contains\s*\(/i);
  if (pageSourceAssert.length) pushFinding(findings, {
    ruleId: "SEL-CS-ASS-005", category: "assertions", severity: "warning",
    title: "Assertion against PageSource",
    description: `Line ${pageSourceAssert[0]} asserts on raw page HTML with a substring check.`,
    impact: "Matches text in hidden nodes, script blocks and attributes, so it passes when the user can see nothing — and breaks on unrelated markup changes.",
    fix: `var banner = wait.Until(\n    ExpectedConditions.ElementIsVisible(By.CssSelector("[data-testid='success']")));\nAssert.AreEqual("Payment complete", banner.Text);`,
    line: pageSourceAssert[0],
  }, disabledRuleIds);

  const driverPath = lineMatches(content, /new\s+(?:Chrome|Firefox|Edge)Driver\s*\(\s*["'][A-Za-z]:[\\/]|new\s+(?:Chrome|Firefox|Edge)DriverService|DriverService\.Create/i);
  if (driverPath.length) pushFinding(findings, {
    ruleId: "SEL-CS-CFG-001", category: "browser_mgmt", severity: "warning",
    title: "Manual driver binary path (Selenium Manager makes this obsolete)",
    description: `Line ${driverPath[0]} points the driver at an explicit binary path or DriverService.`,
    impact: "The path is machine-specific, so the suite fails on CI and on any teammate's machine, and the binary drifts out of sync with the browser.",
    fix: `// Selenium 4.6+ resolves the driver automatically\nIWebDriver driver = new ChromeDriver();`,
    line: driverPath[0], reference: "https://www.selenium.dev/documentation/selenium_manager/",
  }, disabledRuleIds);

  const desiredCaps = lineMatches(content, /DesiredCapabilities/i);
  if (desiredCaps.length) pushFinding(findings, {
    ruleId: "SEL-CS-CFG-002", category: "browser_mgmt", severity: "critical",
    title: "DesiredCapabilities — removed in Selenium 4",
    description: `Line ${desiredCaps[0]} uses DesiredCapabilities, which Selenium 4 removed in favour of browser-specific Options classes.`,
    impact: "The code will not compile or run against Selenium 4, blocking the upgrade.",
    fix: `var options = new ChromeOptions();\noptions.AddArgument("--headless=new");\noptions.AcceptInsecureCertificates = true;\nIWebDriver driver = new ChromeDriver(options);`,
    line: desiredCaps[0], reference: "https://www.selenium.dev/documentation/webdriver/getting_started/upgrade_to_selenium_4/",
  }, disabledRuleIds);

  const hasImplicit = /ImplicitWait/i.test(content);
  const hasExplicit = /WebDriverWait|DefaultWait/i.test(content);
  if (hasImplicit && hasExplicit) pushFinding(findings, {
    ruleId: "SEL-CS-WAI-005", category: "waits", severity: "critical",
    title: "Implicit and explicit waits mixed",
    description: "The file configures an implicit wait and also uses WebDriverWait/DefaultWait.",
    impact: "Selenium documents this combination as producing unpredictable wait times — a 10s explicit wait can block far longer, and negative conditions like invisibility become unreliable.",
    fix: `// Drop the implicit wait entirely and rely on explicit waits\n// driver.Manage().Timeouts().ImplicitWait = ...;  <- remove\nnew WebDriverWait(driver, TimeSpan.FromSeconds(10))\n    .Until(ExpectedConditions.ElementIsVisible(locator));`,
    line: lineMatches(content, /ImplicitWait/i)[0] ?? null,
    reference: "https://www.selenium.dev/documentation/webdriver/waits/#implicit-wait",
  }, disabledRuleIds);

  const swallowedDisplayed = [];
  lines.forEach((line, idx) => {
    if (!/try\s*\{/.test(line)) return;
    const window = lines.slice(idx, idx + 6).join(" ");
    if (/Displayed|Enabled/i.test(window) && /catch\s*\(/.test(window) && /return\s+false/i.test(window)) {
      swallowedDisplayed.push(idx + 1);
    }
  });
  if (swallowedDisplayed.length) pushFinding(findings, {
    ruleId: "SEL-CS-REL-009", category: "reliability", severity: "warning",
    title: "Displayed check wrapped in try/catch as an existence test",
    description: `Line ${swallowedDisplayed[0]} swallows an exception to decide whether an element is present.`,
    impact: "A genuine failure — wrong page, timeout, crashed driver — is indistinguishable from 'not present', so the test skips its real verification and still passes.",
    fix: `// Ask the driver directly instead of catching\nbool present = driver.FindElements(locator).Count > 0;`,
    line: swallowedDisplayed[0],
  }, disabledRuleIds);

  const chainedFind = lineMatches(content, /FindElement\s*\((?:[^()]|\([^()]*\))*\)\s*\.\s*FindElement\s*\(/i);
  if (chainedFind.length) pushFinding(findings, {
    ruleId: "SEL-CS-LOC-005", category: "locators", severity: "info",
    title: "Chained FindElement() calls",
    description: `Line ${chainedFind[0]} chains FindElement into another FindElement.`,
    impact: "Each hop is a separate round trip that can go stale mid-chain, and the locator now encodes two levels of DOM structure.",
    fix: `// One locator scoped with a CSS descendant selector\ndriver.FindElement(By.CssSelector("[data-testid='cart'] .line-item__price"));`,
    line: chainedFind[0],
  }, disabledRuleIds);

  // ── Test tagging / grouping ──
  {
    const hasCategory = /\[\s*(?:Category|TestCategory|Trait)\s*\(/i.test(content);
    if (hasTests && !hasCategory) pushFinding(findings, {
      ruleId: "SEL-CS-STD-005", category: "coding_standards", severity: "info",
      title: "Tests carry no [Category] or [Trait]",
      description: "No [Category] (NUnit), [TestCategory] (MSTest) or [Trait] (xUnit) attribute appears in this file, so its tests cannot be filtered by the runner.",
      impact: "CI must run the whole suite every time — no smoke subset, no way to quarantine a flaky test without commenting it out.",
      fix: `[Test]\n[Category("Smoke")]\npublic void CompletesCheckout() { }\n\n// then: dotnet test --filter TestCategory=Smoke`,
      line: lineMatches(content, /\[\s*(?:Test|Fact|TestMethod)\s*\]/i)[0] ?? null,
      reference: "https://docs.nunit.org/articles/nunit/writing-tests/attributes/category.html",
    }, disabledRuleIds);
  }

  const crit = findings.filter((f) => f.severity === "critical").length;
  const summary =
    crit > 0
      ? `Selenium (C#) scan of ${filename}: ${findings.length} finding(s), ${crit} critical.`
      : `Selenium (C#) scan of ${filename}: ${findings.length} finding(s) from standard rules.`;

  return buildAuditResult({
    filename,
    categoryIds: CATEGORY_IDS,
    findings,
    metrics: {
      totalTests: countMatches(content, /\[Test\]|\[Fact\]/g),
      hardSleeps: threadSleep.length,
      xpathLocators: xpath.length,
      findElementCalls: findElementCount,
      hardcodedSecrets: secrets.length,
    },
    summary,
    positives:
      threadSleep.length === 0 && findInLoopLine === null
        ? [{ title: "No hard sleeps or loop element queries", description: "No Thread.Sleep or FindElement-in-loop detected." }]
        : undefined,
  });
}
