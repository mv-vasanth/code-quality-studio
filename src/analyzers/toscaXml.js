import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, countMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.tosca_xml.categories.map((c) => c.id);

/**
 * Local rules for TOSCA XML exports — heuristic, regex-based; not a substitute
 * for full review.
 */
export function analyseToscaXmlLocally(filename, content, options = {}) {
  const disabledRuleIds = options.disabledRuleIds ?? new Set();
  const findings = [];
  const lines = content.split(/\r?\n/);

  // TOSCA detection guard — all rules only fire on TOSCA XML files
  const isTosca = /<(TestCase|Module|TestSheet|TestConfiguration|ScratchBook|ToscaObject|ExecutionList)\b/.test(content);

  if (!isTosca) {
    return buildAuditResult({
      filename,
      categoryIds: CATEGORY_IDS,
      findings,
      metrics: { testCases: 0, modules: 0, hardcodedSecrets: 0, emptyDescriptions: 0 },
      summary: `${filename}: Not recognised as a TOSCA XML export — no TOSCA elements found.`,
    });
  }

  // ── Structure (TCA-STR-) ──

  // TCA-STR-001: Generic TestCase name
  const genericNameLines = lineMatches(content, /<Name>(TestCase\s*\d+|Test\s*\d+|Unnamed)<\/Name>/i);
  if (genericNameLines.length) pushFinding(findings, {
    ruleId: "TCA-STR-001", category: "structure", severity: "warning",
    title: "Generic TestCase name",
    description: "Use a descriptive name that explains what the test validates",
    impact: "Hard to identify test purpose in reports and TOSCA Commander",
    fix: `<Name>Login_ValidCredentials_NavigatesToDashboard</Name>`,
    line: genericNameLines[0],
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/test_case_design.htm",
  }, disabledRuleIds);

  // TCA-STR-002: Empty or missing Description on TestCase — scan forward up to 10 lines
  let missingDescLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/<TestCase\b/.test(lines[i])) {
      const windowEnd = Math.min(i + 10, lines.length - 1);
      let hasNonEmptyDesc = false;
      for (let j = i; j <= windowEnd; j++) {
        // stop if we hit the next TestCase or the close tag
        if (j > i && (/<TestCase\b/.test(lines[j]) || /<\/TestCase>/.test(lines[j]))) break;
        if (/<Description>[^<\s][^<]*<\/Description>/.test(lines[j])) {
          hasNonEmptyDesc = true;
          break;
        }
      }
      if (!hasNonEmptyDesc) {
        missingDescLine = i + 1;
        break;
      }
    }
  }
  if (missingDescLine !== null) pushFinding(findings, {
    ruleId: "TCA-STR-002", category: "structure", severity: "warning",
    title: "Empty or missing Description on TestCase",
    description: "Every TestCase should have a Description explaining its purpose and scope",
    impact: "Undocumented tests are hard to maintain and review",
    fix: `<Description>Verifies that a registered user can log in with valid credentials and is redirected to the dashboard.</Description>`,
    line: missingDescLine,
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/test_case_design.htm",
  }, disabledRuleIds);

  // TCA-STR-003: No Precondition defined — TestCase blocks without Precondition nearby
  let missingPrecondLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/<TestCase\b/.test(lines[i])) {
      const windowEnd = Math.min(i + 10, lines.length - 1);
      let hasPrecond = false;
      for (let j = i; j <= windowEnd; j++) {
        if (j > i && (/<TestCase\b/.test(lines[j]) || /<\/TestCase>/.test(lines[j]))) break;
        if (/<Precondition/.test(lines[j])) { hasPrecond = true; break; }
      }
      if (!hasPrecond) {
        missingPrecondLine = i + 1;
        break;
      }
    }
  }
  if (missingPrecondLine !== null) pushFinding(findings, {
    ruleId: "TCA-STR-003", category: "structure", severity: "info",
    title: "No Precondition defined",
    description: "Document what state the system must be in before this test runs",
    impact: "Tests may run in an undefined system state leading to false results",
    fix: `<Precondition>Application is running. Test user 'testuser@example.com' exists in the system.</Precondition>`,
    line: missingPrecondLine,
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/test_case_design.htm",
  }, disabledRuleIds);

  // TCA-STR-004: ScratchBook usage
  const scratchBookLines = lineMatches(content, /ScratchBook/);
  if (scratchBookLines.length) pushFinding(findings, {
    ruleId: "TCA-STR-004", category: "structure", severity: "warning",
    title: "ScratchBook usage detected",
    description: "ScratchBook is for temporary work; move test objects to the organised library",
    impact: "Tests in ScratchBook are not tracked, versioned, or linked to requirements",
    fix: "Move to the structured test library under the appropriate TestFolder",
    line: scratchBookLines[0],
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/scratchbook.htm",
  }, disabledRuleIds);

  // TCA-STR-005: Oversized TestCase — more than 25 TestStep/Iteration elements
  let oversizedLine = null;
  let inTestCase = false;
  let stepCount = 0;
  let testCaseStartLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/<TestCase\b/.test(lines[i])) {
      inTestCase = true;
      stepCount = 0;
      testCaseStartLine = i + 1;
    }
    if (inTestCase && (/<TestStep\b/.test(lines[i]) || /<Iteration\b/.test(lines[i]))) {
      stepCount++;
    }
    if (inTestCase && /<\/TestCase>/.test(lines[i])) {
      if (stepCount > 25 && oversizedLine === null) {
        oversizedLine = testCaseStartLine;
      }
      inTestCase = false;
      stepCount = 0;
    }
  }
  if (oversizedLine !== null) pushFinding(findings, {
    ruleId: "TCA-STR-005", category: "structure", severity: "warning",
    title: "Oversized TestCase (>25 steps)",
    description: "Break long test cases into smaller, focused cases or extract reusable modules",
    impact: "Long test cases are hard to debug and maintain",
    fix: "Split into setup/action/verify phases or extract repeated sequences as Modules",
    line: oversizedLine,
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/test_case_design.htm",
  }, disabledRuleIds);

  // TCA-STR-006: Missing Postcondition
  let missingPostcondLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/<TestCase\b/.test(lines[i])) {
      const windowEnd = Math.min(i + 15, lines.length - 1);
      let hasPostcond = false;
      for (let j = i; j <= windowEnd; j++) {
        if (j > i && /<TestCase\b/.test(lines[j])) break;
        if (/<\/TestCase>/.test(lines[j])) break;
        if (/<Postcondition/.test(lines[j])) { hasPostcond = true; break; }
      }
      if (!hasPostcond) {
        missingPostcondLine = i + 1;
        break;
      }
    }
  }
  if (missingPostcondLine !== null) pushFinding(findings, {
    ruleId: "TCA-STR-006", category: "structure", severity: "info",
    title: "Missing Postcondition",
    description: "Define teardown/cleanup steps to leave the system in a known state",
    impact: "System may be left in a dirty state affecting subsequent tests",
    fix: `<Postcondition>User is logged out. Test data created during the test is cleaned up.</Postcondition>`,
    line: missingPostcondLine,
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/test_case_design.htm",
  }, disabledRuleIds);

  // ── Test Data (TCA-DAT-) ──

  // TCA-DAT-001: Hardcoded secret/credential in Value elements
  const credentialValueLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (/<Value>[^<]*(password|secret|token|apikey|api_key|pwd)[^<]*<\/Value>/i.test(lines[i])) {
      credentialValueLines.push(i + 1);
    } else if (/<Value>[^<]{4,}<\/Value>/.test(lines[i])) {
      // Check surrounding lines for credential parameter names
      const start = Math.max(0, i - 3);
      const end = Math.min(lines.length - 1, i + 3);
      const surrounding = lines.slice(start, end + 1).join("\n");
      if (/Name="[^"']*(password|secret|token|apikey|api_key|pwd|credential)[^"']*"/i.test(surrounding)) {
        credentialValueLines.push(i + 1);
      }
    }
  }
  if (credentialValueLines.length) pushFinding(findings, {
    ruleId: "TCA-DAT-001", category: "test_data", severity: "critical",
    title: "Hardcoded credential in Value element",
    description: "Hardcoded sensitive data in XML; use TOSCA TDM (Test Data Management) or encrypted parameters",
    impact: "Credentials exposed in version control and test exports",
    fix: `<Value>{B[EncryptedPassword]}</Value>  <!-- or use TOSCA parameter masking -->`,
    line: credentialValueLines[0],
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_tdm/tdm_overview.htm",
  }, disabledRuleIds);

  // TCA-DAT-002: Hardcoded environment URL
  const envUrlLines = lineMatches(content, /<Value>https?:\/\/(dev|test|staging|uat|prod|qa)\.[^<]+<\/Value>/i);
  const ipUrlLines = lineMatches(content, /<Value>https?:\/\/\d{1,3}\.\d{1,3}/);
  const hardcodedUrlLine = [...new Set([...envUrlLines, ...ipUrlLines])].sort((a, b) => a - b)[0] ?? null;
  if (hardcodedUrlLine !== null) pushFinding(findings, {
    ruleId: "TCA-DAT-002", category: "test_data", severity: "warning",
    title: "Hardcoded environment URL",
    description: "Hardcoded environment URL; use a configuration parameter or TOSCA workspace variable",
    impact: "Tests are environment-specific and cannot be promoted without code changes",
    fix: `<Value>{B[BaseUrl]}</Value>  <!-- Define BaseUrl in TestConfiguration -->`,
    line: hardcodedUrlLine,
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/workspace_parameters.htm",
  }, disabledRuleIds);

  // TCA-DAT-003: No buffer references — literal values without TOSCA buffer syntax
  const literalValueCount = countMatches(content, /<Value>[^{<][^<]*<\/Value>/g);
  const bufferRefCount = countMatches(content, /\{B\[/g);
  const paramCount = countMatches(content, /<Parameter\b/g);
  if (literalValueCount > 3 && bufferRefCount === 0 && paramCount === 0) {
    pushFinding(findings, {
      ruleId: "TCA-DAT-003", category: "test_data", severity: "warning",
      title: "No buffer references — values not parametrised",
      description: "Values are not parametrised; use TOSCA buffers or Business Parameters for reusable test data",
      impact: "Test data is duplicated across test cases making maintenance expensive",
      fix: `<Value>{B[Username]}</Value>  <!-- Define buffers in TestConfiguration or TDM -->`,
      line: lineMatches(content, /<Value>[^{<][^<]*<\/Value>/)[0] ?? null,
      reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/buffer_variables.htm",
    }, disabledRuleIds);
  }

  // TCA-DAT-004: Hardcoded date/time
  const hardcodedDateLines = lineMatches(content, /<Value>\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}<\/Value>/);
  if (hardcodedDateLines.length) pushFinding(findings, {
    ruleId: "TCA-DAT-004", category: "test_data", severity: "warning",
    title: "Hardcoded date/time value",
    description: "Hardcoded date will fail when the date passes; use dynamic date calculation",
    impact: "Tests fail silently when the hardcoded date is in the past",
    fix: `<Value>{Date:dd/MM/yyyy+1}</Value>  <!-- TOSCA dynamic date syntax -->`,
    line: hardcodedDateLines[0],
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/dynamic_dates.htm",
  }, disabledRuleIds);

  // TCA-DAT-005: Unmasked sensitive parameter name
  let unmaskedSensitiveParamLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/<(Parameter|Attribute)[^>]*Name="[^"']*(Password|Secret|Token|ApiKey|Pin|Credential)[^"']*"[^>]*>/i.test(lines[i])) {
      if (!/Masked="true"/.test(lines[i])) {
        unmaskedSensitiveParamLine = i + 1;
        break;
      }
    }
  }
  if (unmaskedSensitiveParamLine !== null) pushFinding(findings, {
    ruleId: "TCA-DAT-005", category: "test_data", severity: "info",
    title: "Unmasked sensitive parameter name",
    description: "Sensitive parameters should have Masked='true' to prevent display in logs",
    impact: "Sensitive values appear in plaintext in TOSCA execution logs and reports",
    fix: `<Parameter Name="Password" Masked="true"><Value>{B[UserPassword]}</Value></Parameter>`,
    line: unmaskedSensitiveParamLine,
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/parameter_masking.htm",
  }, disabledRuleIds);

  // ── Modules & Reuse (TCA-MOD-) ──

  // TCA-MOD-001: No Module references — TestCase with TestSteps but no Module reference
  const hasTestCases = /<TestCase\b/.test(content);
  const hasTestSteps = /<TestStep\b/.test(content);
  const hasModuleRef = /<Module\b/.test(content) || /LibraryModule/.test(content);
  if (hasTestCases && hasTestSteps && !hasModuleRef) {
    pushFinding(findings, {
      ruleId: "TCA-MOD-001", category: "modules", severity: "warning",
      title: "No Module references — reusable Modules not used",
      description: "Test steps are not using reusable Modules from the Business Library; extract common actions",
      impact: "Duplicated logic across test cases; changes must be made in many places",
      fix: `<Module Name="LoginAction"/>  <!-- Create in Business Library and reference here -->`,
      line: lineMatches(content, /<TestStep\b/)[0] ?? null,
      reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/modules.htm",
    }, disabledRuleIds);
  }

  // TCA-MOD-002: Missing Module Description — Module without Description in next 5 lines
  let missingModuleDescLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/<Module\b[^>]*>/.test(lines[i]) && !/>.*<\/Module>/.test(lines[i])) {
      const windowEnd = Math.min(i + 5, lines.length - 1);
      let hasDesc = false;
      for (let j = i; j <= windowEnd; j++) {
        if (/<Description>[^<\s]/.test(lines[j])) { hasDesc = true; break; }
        if (j > i && /<\/Module>/.test(lines[j])) break;
      }
      if (!hasDesc) {
        missingModuleDescLine = i + 1;
        break;
      }
    }
  }
  if (missingModuleDescLine !== null) pushFinding(findings, {
    ruleId: "TCA-MOD-002", category: "modules", severity: "info",
    title: "Missing Module Description",
    description: "Document Module purpose so it can be discovered and reused by other teams",
    impact: "Undiscoverable modules get duplicated instead of reused",
    fix: `<Description>Performs login with provided username and password and verifies successful authentication.</Description>`,
    line: missingModuleDescLine,
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/modules.htm",
  }, disabledRuleIds);

  // TCA-MOD-003: Deep nesting — 3+ levels of Module nesting by indentation
  let deepNestingLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/<Module\b/.test(lines[i])) {
      const leading = lines[i].match(/^(\s*)/)[1].length;
      // Assume 2-space or 4-space indent per level; check for 3+ levels (6+ spaces or 12+ spaces)
      if (leading >= 6) {
        deepNestingLine = i + 1;
        break;
      }
    }
  }
  if (deepNestingLine !== null) pushFinding(findings, {
    ruleId: "TCA-MOD-003", category: "modules", severity: "warning",
    title: "Deeply nested Module structure",
    description: "Deeply nested module structures are hard to navigate and maintain; aim for max 2 levels",
    impact: "Nested modules are difficult to reuse independently and hard to debug",
    fix: "Flatten the module hierarchy; extract deeply-nested steps into top-level Modules",
    line: deepNestingLine,
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/modules.htm",
  }, disabledRuleIds);

  // TCA-MOD-004: Module with single use — Name appears fewer than 2 times
  const moduleNameMatches = content.match(/<Module[^>]+Name="([^"]+)"/g) ?? [];
  let singleUseModuleLine = null;
  for (const match of moduleNameMatches) {
    const nameMatch = match.match(/Name="([^"]+)"/);
    if (nameMatch) {
      const name = nameMatch[1];
      const occurrences = countMatches(content, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"));
      if (occurrences < 2) {
        singleUseModuleLine = lineMatches(content, new RegExp(`Name="${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`))[ 0] ?? null;
        break;
      }
    }
  }
  if (singleUseModuleLine !== null) pushFinding(findings, {
    ruleId: "TCA-MOD-004", category: "modules", severity: "info",
    title: "Module used only once",
    description: "Module used only once; consider inlining or expanding usage across test cases",
    impact: "Single-use modules add indirection without reuse benefit",
    fix: "Either inline the module steps into the test case or promote the module for wider reuse",
    line: singleUseModuleLine,
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/modules.htm",
  }, disabledRuleIds);

  // ── Documentation (TCA-DOC-) ──

  // TCA-DOC-001: Empty Description element
  const emptyDescLines = lineMatches(content, /<Description>\s*<\/Description>|<Description\s*\/>/);
  if (emptyDescLines.length) pushFinding(findings, {
    ruleId: "TCA-DOC-001", category: "descriptions", severity: "warning",
    title: "Empty Description element",
    description: "Replace empty Description with meaningful content",
    impact: "Empty descriptions make the test unreadable in reports and TOSCA Commander",
    fix: `<Description>Verifies the checkout workflow completes successfully for a guest user.</Description>`,
    line: emptyDescLines[0],
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/test_case_design.htm",
  }, disabledRuleIds);

  // TCA-DOC-002: TODO/placeholder description
  const placeholderDescLines = lineMatches(content, /<Description>[^<]*(TODO|FIXME|TBD|placeholder|update this|add description)[^<]*<\/Description>/i);
  if (placeholderDescLines.length) pushFinding(findings, {
    ruleId: "TCA-DOC-002", category: "descriptions", severity: "info",
    title: "TODO/placeholder description",
    description: "Replace placeholder text with a real description",
    impact: "Placeholder descriptions are worse than no descriptions — they look complete but are not",
    fix: `<Description>Verifies that the search function returns relevant results for a valid query.</Description>`,
    line: placeholderDescLines[0],
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/test_case_design.htm",
  }, disabledRuleIds);

  // TCA-DOC-003: No Owner attribute on TestCase
  const testCaseLines = lineMatches(content, /<TestCase\b/);
  const testCasesWithoutOwner = testCaseLines.filter((ln) => {
    const line = lines[ln - 1] ?? "";
    return !(/Owner="|CreatedBy="/.test(line));
  });
  if (testCasesWithoutOwner.length) pushFinding(findings, {
    ruleId: "TCA-DOC-003", category: "descriptions", severity: "warning",
    title: "No Owner attribute on TestCase",
    description: "Assign an owner for accountability and maintenance responsibility",
    impact: "No clear owner means test maintenance requests have no obvious recipient",
    fix: `<TestCase Name="Login_ValidCredentials" Owner="qa-team@example.com">`,
    line: testCasesWithoutOwner[0],
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/test_case_design.htm",
  }, disabledRuleIds);

  // TCA-DOC-004: No requirement/ticket linked
  const hasRequirementLink = /Requirement="|RequirementId="|Jira="|<Requirement\b/.test(content) ||
    /<Attribute[^>]*Name="[^"']*(Requirement|RequirementId|Jira|UserStory)[^"']*"/.test(content);
  if (hasTestCases && !hasRequirementLink) {
    pushFinding(findings, {
      ruleId: "TCA-DOC-004", category: "descriptions", severity: "info",
      title: "No requirement or ticket linked",
      description: "Link test cases to requirements for traceability and impact analysis",
      impact: "Cannot determine which tests cover which requirements or user stories",
      fix: `<Attribute Name="RequirementId"><Value>PROJ-1234</Value></Attribute>`,
      line: testCaseLines[0] ?? null,
      reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/requirements_coverage.htm",
    }, disabledRuleIds);
  }

  // ── Reliability (TCA-REL-) ──

  // TCA-REL-001: No verification steps
  const hasVerifyStep = /ActionMode="Verify"|ActionMode="Check"|<Verify\b/.test(content);
  if (hasTestCases && hasTestSteps && !hasVerifyStep) {
    pushFinding(findings, {
      ruleId: "TCA-REL-001", category: "reliability", severity: "warning",
      title: "No verification steps found",
      description: "Test has no verification steps; it executes actions but never asserts the expected outcome",
      impact: "Test will pass even when the application is broken",
      fix: `<TestStep ActionMode="Verify"><!-- Add assertion on expected result --></TestStep>`,
      line: lineMatches(content, /<TestStep\b/)[0] ?? null,
      reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/test_case_design.htm",
    }, disabledRuleIds);
  }

  // TCA-REL-002: Hardcoded wait
  let hardcodedWaitLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/<ActionMode>Wait<\/ActionMode>/.test(lines[i])) {
      // Check nearby lines for a long numeric value (ms wait)
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length - 1, i + 5);
      for (let j = start; j <= end; j++) {
        if (/<Value>\d{3,}<\/Value>/.test(lines[j])) {
          hardcodedWaitLine = i + 1;
          break;
        }
      }
      if (hardcodedWaitLine !== null) break;
    }
  }
  if (hardcodedWaitLine !== null) pushFinding(findings, {
    ruleId: "TCA-REL-002", category: "reliability", severity: "warning",
    title: "Hardcoded wait/sleep step",
    description: "Fixed waits cause slow or flaky tests; use TOSCA synchronisation (WaitForObject, TBox Synchronisation)",
    impact: "Tests are slower than needed on fast systems and still flaky on slow ones",
    fix: `<Module Name="WaitForPageLoad"/>  <!-- or use TOSCA built-in synchronisation ActionMode -->`,
    line: hardcodedWaitLine,
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/synchronisation.htm",
  }, disabledRuleIds);

  // TCA-REL-003: No error handling / recovery
  const hasRecovery = /Recovery="|ErrorHandler="|OnError="|RecoveryScenario="|<Recovery\b/.test(content);
  if (hasTestCases && !hasRecovery) {
    pushFinding(findings, {
      ruleId: "TCA-REL-003", category: "reliability", severity: "info",
      title: "No error handling or recovery scenario",
      description: "Define what happens when a test step fails; add a Recovery Scenario",
      impact: "Failed steps may leave the application in an inconsistent state affecting subsequent tests",
      fix: `<!-- Set RecoveryScenario attribute on TestCase or add a global recovery in TestConfiguration -->\n<TestCase Name="Login_Test" RecoveryScenario="CloseAllBrowsers">`,
      line: testCaseLines[0] ?? null,
      reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/recovery_scenarios.htm",
    }, disabledRuleIds);
  }

  // TCA-REL-004: Single data iteration — TestCase with data but no Iteration/DataSet
  const hasIterations = /<Iteration\b/.test(content) || /DataSet/.test(content);
  const hasTestData = countMatches(content, /<Value>[^<]{2,}<\/Value>/g) > 2;
  if (hasTestCases && hasTestData && !hasIterations) {
    pushFinding(findings, {
      ruleId: "TCA-REL-004", category: "reliability", severity: "warning",
      title: "Single data iteration — not data-driven",
      description: "Test only runs with one data set; use TOSCA's data-driven execution with multiple iterations",
      impact: "Boundary conditions and edge cases are not tested without multiple data sets",
      fix: `<!-- Add multiple Iteration elements to run the test with different data sets -->`,
      line: testCaseLines[0] ?? null,
      reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/data_driven_testing.htm",
    }, disabledRuleIds);
  }

  // ── Maintenance (TCA-MNT-) ──

  // TCA-MNT-001: Disabled TestSteps
  const disabledStepLines = lineMatches(content, /IsActive="false"|Enabled="false"/);
  if (disabledStepLines.length) pushFinding(findings, {
    ruleId: "TCA-MNT-001", category: "maintenance", severity: "warning",
    title: "Disabled TestSteps detected",
    description: "Disabled steps accumulate; either remove them or document why they are disabled",
    impact: "Dead code obscures test intent and bloats exports",
    fix: `<!-- Remove the disabled step or add a comment explaining why it is disabled -->`,
    line: disabledStepLines[0],
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/test_case_design.htm",
  }, disabledRuleIds);

  // TCA-MNT-002: Deprecated ActionMode
  const deprecatedActionLines = lineMatches(content, /<ActionMode>(Navigate|Invoke)<\/ActionMode>/);
  if (deprecatedActionLines.length) pushFinding(findings, {
    ruleId: "TCA-MNT-002", category: "maintenance", severity: "info",
    title: "Potentially deprecated ActionMode",
    description: "Some ActionModes are deprecated in newer TOSCA versions; review and update",
    impact: "Tests may fail after TOSCA upgrades if deprecated ActionModes are removed",
    fix: "Review ActionMode usage against your TOSCA version's supported modes",
    line: deprecatedActionLines[0],
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/actionmodes.htm",
  }, disabledRuleIds);

  // TCA-MNT-003: Very large file — more than 500 lines
  if (lines.length > 500) pushFinding(findings, {
    ruleId: "TCA-MNT-003", category: "maintenance", severity: "warning",
    title: "Very large XML export file",
    description: "Large XML exports are hard to review; consider exporting smaller subsets (individual TestFolders)",
    impact: "Large files are slow to load, diff, and review in version control",
    fix: "Export individual TestFolders or test suites rather than the entire project",
    line: 1,
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/export_import.htm",
  }, disabledRuleIds);

  // TCA-MNT-004: Commented-out steps
  const commentedStepLines = lineMatches(content, /<!--.*<(TestStep|Module)/);
  if (commentedStepLines.length) pushFinding(findings, {
    ruleId: "TCA-MNT-004", category: "maintenance", severity: "info",
    title: "Commented-out test steps or modules",
    description: "Commented-out test steps should be removed, not left in exports",
    impact: "Commented-out steps clutter the XML and confuse reviewers",
    fix: "Remove commented-out steps; use version control history to recover them if needed",
    line: commentedStepLines[0],
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/test_case_design.htm",
  }, disabledRuleIds);

  // ── Execution Config (TCA-CFG-) ──

  // TCA-CFG-001: No TestConfiguration
  const hasExecutionList = /<ExecutionList\b/.test(content);
  const hasTestConfig = /<TestConfiguration\b/.test(content);
  if ((hasTestCases || hasExecutionList) && !hasTestConfig) {
    pushFinding(findings, {
      ruleId: "TCA-CFG-001", category: "config", severity: "info",
      title: "No TestConfiguration found",
      description: "Define a TestConfiguration to control execution settings, agent assignment, and environment",
      impact: "Tests run with default settings; agent, environment, and timeout are not controlled",
      fix: `<TestConfiguration Name="CI_Configuration" AgentGroup="Jenkins_Agents" Timeout="3600"/>`,
      line: 1,
      reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/testconfiguration.htm",
    }, disabledRuleIds);
  }

  // TCA-CFG-002: Hardcoded agent/host
  const hardcodedAgentLines = lineMatches(content, /AgentName="[A-Z][A-Z0-9\-]+[0-9]"|ExecutionHost="[^"]+"/);
  if (hardcodedAgentLines.length) pushFinding(findings, {
    ruleId: "TCA-CFG-002", category: "config", severity: "warning",
    title: "Hardcoded agent or execution host",
    description: "Hardcoded agent prevents CI execution; use dynamic agent assignment or agent groups",
    impact: "Tests cannot run on CI if the specific agent is unavailable or renamed",
    fix: `<!-- Use an Agent Group instead of a specific machine name -->\n<TestConfiguration AgentGroup="QA_Agents"/>`,
    line: hardcodedAgentLines[0],
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/agent_groups.htm",
  }, disabledRuleIds);

  // TCA-CFG-003: No parallel execution config
  const hasParallelConfig = /ParallelExecution="true"|MaxParallel/.test(content);
  if (hasExecutionList && !hasParallelConfig) {
    pushFinding(findings, {
      ruleId: "TCA-CFG-003", category: "config", severity: "info",
      title: "No parallel execution configuration",
      description: "Consider enabling parallel execution to reduce total test run time",
      impact: "Sequential execution increases CI pipeline duration unnecessarily",
      fix: `<ExecutionList ParallelExecution="true" MaxParallel="4">`,
      line: lineMatches(content, /<ExecutionList\b/)[0] ?? null,
      reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/parallel_execution.htm",
    }, disabledRuleIds);
  }

  // TCA-CFG-004: Missing timeout configuration
  const hasTimeout = /Timeout="|StepTimeout=/.test(content);
  if (hasTestConfig && !hasTimeout) {
    pushFinding(findings, {
      ruleId: "TCA-CFG-004", category: "config", severity: "warning",
      title: "Missing timeout configuration",
      description: "Set execution timeouts to prevent runaway tests in CI",
      impact: "Tests without timeouts can stall CI pipelines indefinitely",
      fix: `<TestConfiguration Timeout="3600" StepTimeout="120"/>`,
      line: lineMatches(content, /<TestConfiguration\b/)[0] ?? null,
      reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/testconfiguration.htm",
    }, disabledRuleIds);
  }

  // ── Security (TCA-SEC-) ──

  // TCA-SEC-001: Plaintext credential value near a sensitive parameter name
  let plaintextCredLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/<Value>[^<]{4,}<\/Value>/.test(lines[i]) && !/{B\[/.test(lines[i])) {
      const start = Math.max(0, i - 3);
      const end = Math.min(lines.length - 1, i + 3);
      const surrounding = lines.slice(start, end + 1).join("\n");
      if (/Name="[^"']*(password|secret|token|apikey|pwd|credential)[^"']*"/i.test(surrounding)) {
        plaintextCredLine = i + 1;
        break;
      }
    }
  }
  if (plaintextCredLine !== null) pushFinding(findings, {
    ruleId: "TCA-SEC-001", category: "security", severity: "critical",
    title: "Plaintext credential value detected",
    description: "Sensitive data stored in plaintext; use TOSCA encrypted parameters or TDM vault",
    impact: "Credentials exposed to anyone with access to the XML export",
    fix: `<!-- Encrypt the parameter in TOSCA Commander or reference via TDM -->\n<Value>{B[EncryptedToken]}</Value>`,
    line: plaintextCredLine,
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/parameter_masking.htm",
  }, disabledRuleIds);

  // TCA-SEC-002: Unmasked sensitive field attribute
  const unmaskedFieldLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (/Name="[^"']*(Password|Secret|Token|Credential|ApiKey)[^"']*"/i.test(lines[i])) {
      if (!/Masked="true"/.test(lines[i])) {
        unmaskedFieldLines.push(i + 1);
      }
    }
  }
  if (unmaskedFieldLines.length) pushFinding(findings, {
    ruleId: "TCA-SEC-002", category: "security", severity: "warning",
    title: "Unmasked sensitive field",
    description: "Mark sensitive parameters as Masked to prevent them from appearing in logs and reports",
    impact: "Sensitive values appear in plaintext in execution logs and TOSCA reports",
    fix: `<Parameter Name="UserPassword" Masked="true"><Value>{B[Pwd]}</Value></Parameter>`,
    line: unmaskedFieldLines[0],
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_commander/parameter_masking.htm",
  }, disabledRuleIds);

  // TCA-SEC-003: Test data contains real (non-example.com) email addresses
  const realEmailLines = lineMatches(content, /<Value>[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}<\/Value>/)
    .filter((ln) => !/@example\.com|@test\.com|@dummy\.com/.test(lines[ln - 1] ?? ""));
  if (realEmailLines.length) pushFinding(findings, {
    ruleId: "TCA-SEC-003", category: "security", severity: "info",
    title: "Real email address in test data",
    description: "Use test-specific email addresses (e.g., testuser@example.com) not real user emails in test data",
    impact: "Real email addresses in test data may violate GDPR and privacy policies",
    fix: `<Value>testuser@example.com</Value>`,
    line: realEmailLines[0],
    reference: "https://documentation.tricentis.com/tosca/1500/en/content/tosca_tdm/tdm_overview.htm",
  }, disabledRuleIds);

  // ── Build result ──
  const totalTestCases = countMatches(content, /<TestCase\b/g);
  const totalModules = countMatches(content, /<Module\b/g);
  const totalSecretFindings = findings.filter((f) => f.category === "security" && f.severity === "critical").length;
  const totalEmptyDescs = emptyDescLines.length;

  const crit = findings.filter((f) => f.severity === "critical").length;
  const summary = crit > 0
    ? `TOSCA XML scan of ${filename}: ${findings.length} finding(s), ${crit} critical — review credentials and sensitive data immediately.`
    : `TOSCA XML scan of ${filename}: ${findings.length} finding(s) from ${totalTestCases} TestCase(s) and ${totalModules} Module(s).`;

  return buildAuditResult({
    filename,
    categoryIds: CATEGORY_IDS,
    findings,
    metrics: {
      testCases: totalTestCases,
      modules: totalModules,
      fileLines: lines.length,
      bufferRefs: bufferRefCount,
      hardcodedSecrets: totalSecretFindings,
      emptyDescriptions: totalEmptyDescs,
    },
    summary,
    positives:
      totalSecretFindings === 0 && !disabledStepLines.length
        ? [{ title: "No critical credential exposures or disabled steps", description: "No plaintext credentials or orphaned disabled steps detected." }]
        : undefined,
  });
}
