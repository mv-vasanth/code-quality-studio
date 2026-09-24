import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, countMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.appium_java.categories.map((c) => c.id);

/**
 * Local rules for Appium (Java) — heuristic, regex-based; not a substitute
 * for full review.
 */
export function analyseAppiumJavaLocally(filename, content, options = {}) {
  const disabledRuleIds = options.disabledRuleIds ?? new Set();
  const findings = [];
  const lines = content.split(/\r?\n/);
  const hasTests = /@Test\b/.test(content);

  // ── Locators ──
  const xpathLocator = lineMatches(content, /By\.xpath\s*\(|MobileBy\.xpath\s*\(/);
  if (xpathLocator.length) pushFinding(findings, {
    ruleId: "APM-J-LOC-001", category: "locators", severity: "warning",
    title: "XPath locator",
    description: "XPath is brittle; prefer By.id or By.accessibilityId for mobile elements",
    impact: "UI tree changes break XPath locators.",
    fix: `// Before\ndriver.findElement(By.xpath("//android.widget.Button[@text='Login']"));\n// After\ndriver.findElement(By.accessibilityId("login-button"));`,
    line: xpathLocator[0], reference: "https://appium.io/docs/en/about-appium/getting-started/",
  }, disabledRuleIds);

  const absoluteXpath = lineMatches(content, /By\.xpath\s*\(\s*"\/\//);
  if (absoluteXpath.length) pushFinding(findings, {
    ruleId: "APM-J-LOC-002", category: "locators", severity: "critical",
    title: "Absolute XPath",
    description: "Absolute XPath from root breaks on any UI tree change",
    impact: "Any structural change to the app layout breaks the locator.",
    fix: `// Before\ndriver.findElement(By.xpath("//hierarchy/android.widget.FrameLayout/..."));\n// After\ndriver.findElement(By.accessibilityId("submit-btn"));`,
    line: absoluteXpath[0], reference: "https://appium.io/docs/en/about-appium/getting-started/",
  }, disabledRuleIds);

  const byName = lineMatches(content, /By\.name\s*\(/);
  if (byName.length) pushFinding(findings, {
    ruleId: "APM-J-LOC-003", category: "locators", severity: "warning",
    title: "By.name (deprecated in Appium 2)",
    description: "By.name is deprecated; use By.accessibilityId or MobileBy.accessibilityId",
    impact: "Locators silently fail after upgrading to Appium 2.",
    fix: `// Before\ndriver.findElement(By.name("Login"));\n// After\ndriver.findElement(new AppiumBy.accessibilityId("login-btn"));`,
    line: byName[0], reference: "https://appium.io/docs/en/commands/element/find-elements/",
  }, disabledRuleIds);

  if (hasTests && !/accessibilityId|content-desc|label/.test(content)) {
    pushFinding(findings, {
      ruleId: "APM-J-LOC-004", category: "locators", severity: "info",
      title: "No accessibility-based locators",
      description: "No accessibilityId, content-desc, or label locators found; these are recommended for cross-platform stability",
      impact: "Tests are tied to platform-specific selectors making cross-platform reuse harder.",
      fix: `// Add accessibility IDs to app elements, then use:\ndriver.findElement(new AppiumBy.AccessibilityId("login-button"));`,
      line: null, reference: "https://appium.io/docs/en/writing-running-appium/finding-elements/",
    }, disabledRuleIds);
  }

  const resourceIdLocator = lineMatches(content, /By\.id\s*\(\s*"com\.[^"]+:\w+\//);
  if (resourceIdLocator.length) pushFinding(findings, {
    ruleId: "APM-J-LOC-005", category: "locators", severity: "warning",
    title: "Hardcoded resource-id in locator",
    description: "Resource IDs can change across builds; consider using accessibilityId instead",
    impact: "Locator breaks when the app is refactored or repackaged.",
    fix: `// Before\ndriver.findElement(By.id("com.example.app:id/loginBtn"));\n// After\ndriver.findElement(new AppiumBy.AccessibilityId("login-button"));`,
    line: resourceIdLocator[0], reference: "https://appium.io/docs/en/writing-running-appium/finding-elements/",
  }, disabledRuleIds);

  // ── Waits ──
  const threadSleep = lineMatches(content, /Thread\.sleep\s*\(/);
  if (threadSleep.length) pushFinding(findings, {
    ruleId: "APM-J-WAI-001", category: "waits", severity: "critical",
    title: "Thread.sleep in test",
    description: "Hard-coded sleep causes flakiness; use WebDriverWait or FluentWait instead",
    impact: "Flaky and slow tests; wait may be too long or too short.",
    fix: `WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));\nwait.until(ExpectedConditions.visibilityOfElementLocated(By.accessibilityId("result")));`,
    line: threadSleep[0], reference: "https://appium.io/docs/en/writing-running-appium/",
  }, disabledRuleIds);

  const implicitWait = lineMatches(content, /manage\(\)\.timeouts\(\)\.implicitlyWait/);
  if (implicitWait.length) pushFinding(findings, {
    ruleId: "APM-J-WAI-002", category: "waits", severity: "warning",
    title: "Implicit wait without explicit wait",
    description: "Implicit waits interact unpredictably with explicit waits; prefer explicit waits consistently",
    impact: "Intermittent failures and hard-to-diagnose timing issues.",
    fix: `// Remove implicit wait; use WebDriverWait for each element:\nWebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(15));\nwait.until(ExpectedConditions.elementToBeClickable(By.accessibilityId("btn")));`,
    line: implicitWait[0], reference: "https://appium.io/docs/en/writing-running-appium/",
  }, disabledRuleIds);

  if (/findElement/.test(content) && !/WebDriverWait|FluentWait/.test(content)) {
    pushFinding(findings, {
      ruleId: "APM-J-WAI-003", category: "waits", severity: "info",
      title: "No explicit wait",
      description: "findElement() present but no WebDriverWait or FluentWait detected; mobile elements render asynchronously",
      impact: "Tests fail intermittently on slow device or emulator startup.",
      fix: `WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(15));\nMobileElement el = (MobileElement) wait.until(\n  ExpectedConditions.visibilityOfElementLocated(By.accessibilityId("home-screen")));`,
      line: null, reference: "https://appium.io/docs/en/writing-running-appium/",
    }, disabledRuleIds);
  }

  const longSleep = lineMatches(content, /Thread\.sleep\s*\(\s*\d{5,}/);
  if (longSleep.length) pushFinding(findings, {
    ruleId: "APM-J-WAI-004", category: "waits", severity: "warning",
    title: "Excessive sleep (>=10 seconds)",
    description: "Sleep of 10 seconds or more is an excessive hard wait",
    impact: "Suite is artificially slowed; still flakes on slow environments.",
    fix: `// Replace with an explicit wait:\nWebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(30));\nwait.until(ExpectedConditions.visibilityOfElementLocated(By.accessibilityId("el")));`,
    line: longSleep[0], reference: "https://appium.io/docs/en/writing-running-appium/",
  }, disabledRuleIds);

  // ── Assertions ──
  if (hasTests && !/Assert\.|assertThat\s*\(|assertEquals/.test(content)) {
    pushFinding(findings, {
      ruleId: "APM-J-ASS-001", category: "assertions", severity: "warning",
      title: "No assertions found",
      description: "@Test method found but no Assert., assertThat(), or assertEquals detected",
      impact: "Tests that never fail give false confidence.",
      fix: `Assert.assertEquals("Expected screen title", "Home", driver.findElement(By.id("title")).getText());`,
      line: null, reference: "https://junit.org/junit5/docs/current/user-guide/",
    }, disabledRuleIds);
  }

  const missingAssertMsg = lineMatches(content, /Assert\.(assertTrue|assertFalse|assertEquals)\s*\([^,)]+\)/);
  if (missingAssertMsg.length) pushFinding(findings, {
    ruleId: "APM-J-ASS-002", category: "assertions", severity: "info",
    title: "Assertion without message",
    description: "Assertions without a descriptive message are hard to diagnose on failure",
    impact: "Failure reports lack context about what was expected.",
    fix: `Assert.assertEquals("Home screen title should be 'Welcome'", "Welcome", titleEl.getText());`,
    line: missingAssertMsg[0], reference: "https://junit.org/junit4/javadoc/latest/org/junit/Assert.html",
  }, disabledRuleIds);

  // CY-ASS-003: getText() used in Assert.assertEquals without surrounding wait
  let assertGetTextNoWaitLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/Assert\.assertEquals/.test(lines[i]) && /getText\s*\(\s*\)/.test(lines[i])) {
      // Check for a wait in the 5 lines before
      const start = Math.max(0, i - 5);
      const segment = lines.slice(start, i).join("\n");
      if (!/WebDriverWait|FluentWait|wait\.until/.test(segment)) {
        assertGetTextNoWaitLine = i + 1;
        break;
      }
    }
  }
  if (assertGetTextNoWaitLine !== null) pushFinding(findings, {
    ruleId: "APM-J-ASS-003", category: "assertions", severity: "warning",
    title: "Assert on getText() without explicit wait",
    description: "Asserting on getText() without a prior wait may read stale or empty text",
    impact: "Flaky tests that fail on slow device rendering.",
    fix: `WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));\nMobileElement el = (MobileElement) wait.until(\n  ExpectedConditions.visibilityOfElementLocated(By.accessibilityId("title")));\nAssert.assertEquals("Title text", "Welcome", el.getText());`,
    line: assertGetTextNoWaitLine, reference: "https://appium.io/docs/en/writing-running-appium/",
  }, disabledRuleIds);

  // ── Gestures ──
  // APM-J-GES-001: Thread.sleep after gesture within ~5 lines
  const gestureKeywords = /swipe\s*\(|scroll\s*\(|tap\s*\(|flick\s*\(/;
  let sleepAfterGestureLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (gestureKeywords.test(lines[i])) {
      const windowEnd = Math.min(i + 5, lines.length - 1);
      for (let j = i + 1; j <= windowEnd; j++) {
        if (/Thread\.sleep/.test(lines[j])) {
          sleepAfterGestureLine = j + 1;
          break;
        }
      }
      if (sleepAfterGestureLine !== null) break;
    }
  }
  if (sleepAfterGestureLine !== null) pushFinding(findings, {
    ruleId: "APM-J-GES-001", category: "gestures", severity: "warning",
    title: "Thread.sleep after gesture",
    description: "Using Thread.sleep after a gesture is unreliable; use an explicit wait for the resulting element or state",
    impact: "Flaky timing; gesture effects may not complete within the fixed sleep.",
    fix: `driver.swipe(startX, startY, endX, endY, duration);\n// Wait for the result instead of sleeping:\nwait.until(ExpectedConditions.visibilityOfElementLocated(By.accessibilityId("next-screen")));`,
    line: sleepAfterGestureLine, reference: "https://appium.io/docs/en/writing-running-appium/",
  }, disabledRuleIds);

  const hardcodedCoords = lineMatches(content, /driver\.tap\s*\(\s*\d|TouchAction.*moveTo\s*\(\s*\d/);
  if (hardcodedCoords.length) pushFinding(findings, {
    ruleId: "APM-J-GES-002", category: "gestures", severity: "info",
    title: "Hardcoded coordinates in gesture",
    description: "Hardcoded pixel coordinates break across different screen sizes and resolutions",
    impact: "Gestures miss their target on different device form factors.",
    fix: `// Use element-based interactions instead:\nMobileElement btn = driver.findElement(By.accessibilityId("submit"));\nnew TouchAction<>(driver).tap(tapOptions().withElement(element(btn))).perform();`,
    line: hardcodedCoords[0], reference: "https://appium.io/docs/en/writing-running-appium/touch-actions/",
  }, disabledRuleIds);

  const deprecatedScrollTo = lineMatches(content, /driver\.scrollTo\s*\(/);
  if (deprecatedScrollTo.length) pushFinding(findings, {
    ruleId: "APM-J-GES-003", category: "gestures", severity: "warning",
    title: "driver.scrollTo() is deprecated",
    description: "scrollTo() is deprecated; use MobileElement.scroll or UiScrollable",
    impact: "Code fails silently on Appium 2+ where deprecated commands are removed.",
    fix: `// Use UiScrollable for Android:\nnew UiScrollable(new UiSelector().scrollable(true))\n  .scrollIntoView(new UiSelector().text("Target Element"));`,
    line: deprecatedScrollTo[0], reference: "https://appium.io/docs/en/commands/mobile-command/",
  }, disabledRuleIds);

  if (hasTests && !/TouchAction|Actions|PointerInput|W3CActions/.test(content)) {
    pushFinding(findings, {
      ruleId: "APM-J-GES-004", category: "gestures", severity: "info",
      title: "No gesture library detected",
      description: "No TouchAction, Actions, PointerInput, or W3CActions found; consider using W3C Actions API",
      impact: "Missing gesture support for swipe, pinch, and complex interactions.",
      fix: `// Use W3C Actions API (Appium 2+):\nSequence sequence = new Sequence(finger, 0);\nsequence.addAction(finger.createPointerMove(Duration.ZERO, PointerInput.Origin.viewport(), x, y));\nsequence.addAction(finger.createPointerDown(PointerInput.MouseButton.LEFT.asArg()));\ndriver.perform(Collections.singletonList(sequence));`,
      line: null, reference: "https://appium.io/docs/en/commands/interactions/actions/",
    }, disabledRuleIds);
  }

  // ── Driver Management ──
  const hasDriverInit = /AppiumDriver|IOSDriver|AndroidDriver/.test(content);
  if (hasDriverInit && !(/\.quit\s*\(\s*\)/.test(content))) {
    pushFinding(findings, {
      ruleId: "APM-J-DRV-001", category: "driver_mgmt", severity: "critical",
      title: "No driver.quit()",
      description: "AppiumDriver initialised but quit() never called; device session leaks",
      impact: "Orphaned Appium sessions exhaust device pool in CI.",
      fix: `@AfterEach\nvoid tearDown() {\n  if (driver != null) driver.quit();\n}`,
      line: null, reference: "https://appium.io/docs/en/writing-running-appium/",
    }, disabledRuleIds);
  }

  const hardcodedCapabilities = lineMatches(content, /\.setCapability\s*\(\s*["']app["']\s*,\s*["'][^"']+["']/);
  if (hardcodedCapabilities.length) pushFinding(findings, {
    ruleId: "APM-J-DRV-002", category: "driver_mgmt", severity: "warning",
    title: "Hardcoded app capability",
    description: "App path or package hardcoded inline; load from a config file or environment variable",
    impact: "Tests break when app file is moved or renamed; CI paths differ from local.",
    fix: `String appPath = System.getenv("APP_PATH");\ncaps.setCapability("app", appPath);`,
    line: hardcodedCapabilities[0], reference: "https://appium.io/docs/en/writing-running-appium/caps/",
  }, disabledRuleIds);

  // APM-J-DRV-003: new AppiumDriver inside a @Test method (within 30 lines of @Test)
  let driverInTestLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/@Test\b/.test(lines[i])) {
      const windowEnd = Math.min(i + 30, lines.length - 1);
      for (let j = i + 1; j <= windowEnd; j++) {
        if (/new\s+(AppiumDriver|IOSDriver|AndroidDriver)\s*\(/.test(lines[j])) {
          driverInTestLine = j + 1;
          break;
        }
      }
      if (driverInTestLine !== null) break;
    }
  }
  if (driverInTestLine !== null) pushFinding(findings, {
    ruleId: "APM-J-DRV-003", category: "driver_mgmt", severity: "warning",
    title: "Driver created inside @Test method",
    description: "Create the driver in @Before/@BeforeEach, not inside each test method",
    impact: "Repeated driver creation is slow and may leave orphaned sessions.",
    fix: `@BeforeEach\nvoid setUp() throws MalformedURLException {\n  driver = new AppiumDriver<>(new URL(appiumServerUrl), caps);\n}`,
    line: driverInTestLine, reference: "https://appium.io/docs/en/writing-running-appium/",
  }, disabledRuleIds);

  const hardcodedAppiumUrl = lineMatches(content, /new\s+AppiumDriver\s*\(\s*new\s+URL\s*\(\s*["']http:\/\/127\.0\.0\.1/);
  if (hardcodedAppiumUrl.length) pushFinding(findings, {
    ruleId: "APM-J-DRV-004", category: "driver_mgmt", severity: "info",
    title: "Hardcoded Appium server URL (localhost)",
    description: "Appium server URL hardcoded as localhost; use an environment variable for CI flexibility",
    impact: "Tests cannot point to a remote Appium server without code changes.",
    fix: `String appiumUrl = System.getenv().getOrDefault("APPIUM_URL", "http://127.0.0.1:4723");\ndriver = new AppiumDriver<>(new URL(appiumUrl), caps);`,
    line: hardcodedAppiumUrl[0], reference: "https://appium.io/docs/en/writing-running-appium/",
  }, disabledRuleIds);

  // ── Reliability ──
  // APM-J-REL-001: findElement without try/catch in the vicinity (scan 5 lines before)
  let findElementNoCatchLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/driver\.findElement\s*\(/.test(lines[i])) {
      const start = Math.max(0, i - 5);
      const segment = lines.slice(start, i).join("\n");
      if (!/try\s*\{/.test(segment)) {
        findElementNoCatchLine = i + 1;
        break;
      }
    }
  }
  if (findElementNoCatchLine !== null) pushFinding(findings, {
    ruleId: "APM-J-REL-001", category: "reliability", severity: "warning",
    title: "findElement() without try/catch",
    description: "findElement() without exception handling; StaleElementReferenceException or NoSuchElementException will crash the test",
    impact: "Unhandled exceptions produce misleading failure messages.",
    fix: `try {\n  MobileElement el = driver.findElement(By.accessibilityId("btn"));\n  el.click();\n} catch (NoSuchElementException e) {\n  Assert.fail("Element 'btn' not found: " + e.getMessage());\n}`,
    line: findElementNoCatchLine, reference: "https://appium.io/docs/en/writing-running-appium/",
  }, disabledRuleIds);

  if (hasTests && !/TakesScreenshot|getScreenshotAs/.test(content)) {
    pushFinding(findings, {
      ruleId: "APM-J-REL-002", category: "reliability", severity: "info",
      title: "No screenshot on failure",
      description: "Add screenshot capture in @After to aid failure diagnosis on mobile",
      impact: "Mobile UI failures are very hard to diagnose without a screenshot.",
      fix: `@AfterEach\nvoid tearDown() {\n  File src = ((TakesScreenshot) driver).getScreenshotAs(OutputType.FILE);\n  FileUtils.copyFile(src, new File("screenshots/failure.png"));\n  driver.quit();\n}`,
      line: null, reference: "https://appium.io/docs/en/writing-running-appium/",
    }, disabledRuleIds);
  }

  const resetApp = lineMatches(content, /driver\.resetApp\s*\(\s*\)/);
  if (resetApp.length) pushFinding(findings, {
    ruleId: "APM-J-REL-003", category: "reliability", severity: "warning",
    title: "driver.resetApp() is deprecated",
    description: "resetApp() is deprecated in Appium 2; use terminateApp() + activateApp() instead",
    impact: "Code fails on Appium 2 where resetApp is removed.",
    fix: `// Before\ndriver.resetApp();\n// After\ndriver.terminateApp("com.example.app");\ndriver.activateApp("com.example.app");`,
    line: resetApp[0], reference: "https://appium.io/docs/en/commands/device/app/reset-app/",
  }, disabledRuleIds);

  // APM-J-REL-004: findElement inside a loop
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
    ruleId: "APM-J-REL-004", category: "reliability", severity: "critical",
    title: "findElement() inside a loop",
    description: "Calling findElement() inside a loop is a flakiness and performance hazard on mobile",
    impact: "StaleElementReferenceException and slow test execution on device.",
    fix: `// Use findElements() before the loop:\nList<MobileElement> items = driver.findElements(By.className("android.widget.TextView"));\nfor (MobileElement item : items) {\n  // process item\n}`,
    line: findInLoopLine, reference: "https://appium.io/docs/en/commands/element/find-elements/",
  }, disabledRuleIds);

  // ── Security ──
  const hardcodedSecret = lineMatches(content, /(password|secret|token|apikey)\s*=\s*"[^"]{4,}"/i);
  if (hardcodedSecret.length) pushFinding(findings, {
    ruleId: "APM-J-SEC-001", category: "security", severity: "critical",
    title: "Hardcoded credential or secret",
    description: "Password, secret, or token is hardcoded in test code",
    impact: "Credentials leak in git history and CI logs.",
    fix: `String password = System.getenv("TEST_PASSWORD");`,
    line: hardcodedSecret[0], reference: "https://owasp.org/www-project-top-ten/",
  }, disabledRuleIds);

  const hardcodedAppPath = lineMatches(content, /\.setCapability\s*\(\s*["']app["']\s*,\s*["']\//);
  if (hardcodedAppPath.length) pushFinding(findings, {
    ruleId: "APM-J-SEC-002", category: "security", severity: "warning",
    title: "Hardcoded absolute app path",
    description: "Absolute app path in capability breaks CI; use a relative path or environment variable",
    impact: "Tests fail on any machine where the path differs.",
    fix: `String appPath = System.getenv("APP_PATH");\ncaps.setCapability("app", appPath);`,
    line: hardcodedAppPath[0], reference: "https://appium.io/docs/en/writing-running-appium/caps/",
  }, disabledRuleIds);

  const autoAcceptAlerts = lineMatches(content, /autoAcceptAlerts.*true/i);
  if (autoAcceptAlerts.length) pushFinding(findings, {
    ruleId: "APM-J-SEC-003", category: "security", severity: "info",
    title: "autoAcceptAlerts: true",
    description: "Auto-accepting alerts hides real app dialog behavior from tests",
    impact: "Permission dialogs and system alerts are dismissed silently, masking issues.",
    fix: `// Handle alerts explicitly in tests:\ndriver.switchTo().alert().accept();\n// Or dismiss:\ndriver.switchTo().alert().dismiss();`,
    line: autoAcceptAlerts[0], reference: "https://appium.io/docs/en/writing-running-appium/caps/",
  }, disabledRuleIds);

  // ── Coding Standards ──
  // APM-J-STD-001: @Test followed by public void test<digits>(
  let numericTestNameLine = null;
  for (let i = 0; i < lines.length - 1; i++) {
    if (/@Test\b/.test(lines[i]) && /public\s+void\s+test\d+\s*\(/.test(lines[i + 1])) {
      numericTestNameLine = i + 2;
      break;
    }
  }
  if (numericTestNameLine !== null) pushFinding(findings, {
    ruleId: "APM-J-STD-001", category: "coding_standards", severity: "info",
    title: "Non-descriptive numeric test name",
    description: "Names like test1, test2 are not descriptive; use a clear behaviour description",
    impact: "Failures are hard to diagnose from the test name alone.",
    fix: `@Test\n@DisplayName("Should display home screen after successful login")\nvoid shouldDisplayHomeScreenAfterLogin() { ... }`,
    line: numericTestNameLine, reference: "https://junit.org/junit5/docs/current/user-guide/",
  }, disabledRuleIds);

  const sysout = lineMatches(content, /System\.out\.print/);
  if (sysout.length) pushFinding(findings, {
    ruleId: "APM-J-STD-002", category: "coding_standards", severity: "info",
    title: "System.out logging in test",
    description: "Use SLF4J or Log4j for structured logging instead of System.out",
    impact: "Console output bypasses structured logging and is not captured in reports.",
    fix: `private static final Logger log = LoggerFactory.getLogger(MyAppiumTest.class);\nlog.info("Tapping login button");`,
    line: sysout[0], reference: "Team standards",
  }, disabledRuleIds);

  const broadCatch = lineMatches(content, /catch\s*\(\s*Exception\s+/);
  if (broadCatch.length) pushFinding(findings, {
    ruleId: "APM-J-STD-003", category: "coding_standards", severity: "warning",
    title: "Broad Exception catch",
    description: "Catching bare Exception masks specific errors; catch specific exceptions",
    impact: "Swallowed exceptions hide real test failures.",
    fix: `catch (NoSuchElementException | StaleElementReferenceException e) {\n  // handle specifically\n}`,
    line: broadCatch[0], reference: "Team standards",
  }, disabledRuleIds);

  const findElementCount = countMatches(content, /driver\.findElement/g);
  if (hasTests && findElementCount > 2 && !/@FindBy|PageFactory/.test(content)) {
    pushFinding(findings, {
      ruleId: "APM-J-STD-004", category: "coding_standards", severity: "warning",
      title: "No Page Object / Screen Object pattern",
      description: "Multiple findElement calls without PageFactory; extract Screen Objects for maintainability",
      impact: "Test duplication and high maintenance cost as the app changes.",
      fix: `public class LoginScreen {\n  @FindBy(accessibility = "username-field")\n  private MobileElement usernameField;\n\n  public LoginScreen(AppiumDriver<?> driver) {\n    PageFactory.initElements(new AppiumFieldDecorator(driver), this);\n  }\n}`,
      line: null, reference: "https://appium.io/docs/en/writing-running-appium/page-object-model/",
    }, disabledRuleIds);
  }

  // ── Test tagging / grouping ──
  {
    const hasTag = /@Tag\s*\(|@Category\s*\(|groups\s*=\s*[{"']/.test(content);
    if (/@Test\b/.test(content) && !hasTag) pushFinding(findings, {
      ruleId: "APM-J-STD-005", category: "coding_standards", severity: "info",
      title: "Tests carry no @Tag or TestNG group",
      description: "No @Tag, @Category or groups= appears in this file, so its tests cannot be selected by the runner.",
      impact: "Device-lab time is expensive — without tags every run executes the full suite instead of a smoke subset.",
      fix: `@Test\n@Tag("smoke")\n@Tag("android")\nvoid launchesApp() { }`,
      line: lineMatches(content, /@Test\b/)[0] ?? null,
      reference: "https://junit.org/junit5/docs/current/user-guide/#writing-tests-tagging-and-filtering",
    }, disabledRuleIds);
  }

  const crit = findings.filter((f) => f.severity === "critical").length;
  const summary =
    crit > 0
      ? `Appium (Java) scan of ${filename}: ${findings.length} finding(s), ${crit} critical.`
      : `Appium (Java) scan of ${filename}: ${findings.length} finding(s) from standard rules.`;

  return buildAuditResult({
    filename,
    categoryIds: CATEGORY_IDS,
    findings,
    metrics: {
      totalTests: countMatches(content, /@Test\b/g),
      hardSleeps: threadSleep.length,
      xpathLocators: xpathLocator.length,
      findElementCalls: findElementCount,
      hardcodedSecrets: hardcodedSecret.length,
    },
    summary,
    positives:
      threadSleep.length === 0 && findInLoopLine === null
        ? [{ title: "No hard sleeps or loop element queries", description: "No Thread.sleep or findElement-in-loop detected." }]
        : undefined,
  });
}
