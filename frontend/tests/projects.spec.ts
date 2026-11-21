import { test, expect } from "./fixtures";
test("save failure preserves entries, retry and reopen survive refresh", async ({
  page,
}) => {
  let saved: any = null;
  let attempts: any[] = [];
  let updates = 0;
  await page.route("**/api/projects**", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      updates++;
      if (updates === 1) return route.fulfill({status:503,json:{detail:"Update unavailable"}});
      expect(request.postDataJSON().expected_updated_at).toBe(saved.updated_at);
      saved={...saved,...request.postDataJSON(),updated_at:"2026-11-16T11:00:00Z"};
      return route.fulfill({json:saved});
    }
    if (request.method() === "POST") {
      attempts.push(request.postDataJSON());
      if (attempts.length === 1)
        return route.fulfill({
          status: 503,
          json: { detail: "Storage unavailable. Please try again." },
        });

      saved = {
        ...attempts[1],
        name: attempts[1].name,
        reference: "PRJ-000001",
        status: "Draft",
        updated_at: "2026-11-16T10:00:00Z",
      };
      return route.fulfill({ status: 201, json: saved });
    }
    return route.fulfill({
      json: request.url().includes("/api/projects/")
        ? saved
        : saved
          ? [saved]
          : [],
    });
  });
  await page.goto("/");
  await expect(page.getByText("No purchasing projects yet")).toBeVisible();
  await page.getByRole("button", { name: "Create Project" }).first().click();
  await expect(page.getByLabel("Project Name")).toBeVisible();
  await page.locator("form").getByRole("button", { name: "Create Project", exact: true }).click();
  expect(attempts).toHaveLength(0);
  await page.getByLabel("Project Name").fill("Laptop fleet renewal");
  await page.getByLabel("Purchasing Category").selectOption("IT & Hardware");
  await page.getByLabel("Estimated Budget").fill("140000.25");
  await page.getByLabel("Target Completion Date").fill("2027-01-20");
  await page
    .getByLabel("Project Description")
    .fill("Compare quality and delivery.");
  await page.screenshot({ path: "test-results/create.png", fullPage: true });
  await page
    .getByRole("button", { name: "Create Project", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Storage unavailable");
  await expect(page.getByLabel("Project Name")).toHaveValue(
    "Laptop fleet renewal",
  );
  await page
    .getByRole("button", { name: "Create Project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Purchasing Project Details" }),
  ).toBeVisible();
  await expect(page.getByLabel("Project Name")).toBeDisabled();
  expect(attempts[0].id).toBe(attempts[1].id);
  await page.reload();
  await expect(page.getByLabel("Estimated Budget")).toHaveValue("140000.25");
  await page.getByRole("button", { name: "Back to Projects" }).click();
  await expect(
    page.getByText("Laptop fleet renewal", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/list.png", fullPage: true });
  await page.getByLabel("Search projects").fill("nomatch");
  await expect(page.getByText("No matching projects")).toBeVisible();
  await page.getByLabel("Search projects").fill("PRJ-000001");
  await page.getByRole("button", { name: "Open Project" }).click();
  await expect(page.getByLabel("Project Description")).toHaveValue(
    "Compare quality and delivery.",
  );
  await page.getByRole("button", {name:"Edit Project",exact:true}).click();
  await page.getByLabel("Project Name").fill("Discard this change");
  await page.getByRole("button", {name:"Cancel Editing"}).click();
  await expect(page.getByLabel("Project Name")).toHaveValue("Laptop fleet renewal");
  expect(updates).toBe(0);
  await page.getByRole("button", {name:"Edit Project",exact:true}).click();
  await page.getByLabel("Currency").selectOption("RUB");
  await expect(page.getByText("Currency changed.", {exact:false})).toBeVisible();
  await expect(page.getByLabel("Estimated Budget")).toHaveValue("140000.25");
  await page.getByLabel("Estimated Budget").fill("500000.00");
  await page.getByRole("button", {name:"Save Changes"}).click();
  await expect(page.getByRole("alert")).toContainText("Update unavailable");
  await expect(page.getByLabel("Currency")).toHaveValue("RUB");
  await page.getByRole("button", {name:"Save Changes"}).click();
  await expect(page.getByLabel("Currency")).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("Currency")).toHaveValue("RUB");
  await expect(page.getByLabel("Estimated Budget")).toHaveValue("500000.00");
  await expect.poll(() => page.locator("img").evaluateAll((images) =>
    images.every((img) => img.complete && img.naturalWidth > 0),
  )).toBe(true);
});

for (const width of [1440, 768, 375, 320]) {
  test(`project list keeps names visible and actions reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const project = {
      id: "p1", reference: "PRJ-LONG-REFERENCE", name: `Synthetic ${"LongName".repeat(24)}`,
      currency: "USD", category: "IT & Hardware", status: "Draft", workflow_status: "In progress",
      workflow_stage: "Supplier setup", supplier_count: 2, updated_at: "2026-11-18T10:00:00Z",
      resume_path: "/projects/p1/suppliers",
    };
    await page.route("**/api/projects", route => route.fulfill({ json: [project] }));
    await page.goto("/#/");
    const region = page.getByRole("region", { name: "Purchasing projects table" });
    const header = region.getByRole("columnheader", { name: "Project Name & Reference" });
    const cell = region.locator("tbody tr td:first-child");
    const name = cell.locator("strong");
    await expect(name).toHaveText(project.name);
    await expect(cell.getByText(project.reference)).toBeVisible();
    expect(await name.evaluate(el => el.getClientRects().length)).toBeGreaterThan(1);
    expect(await cell.evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await cell.scrollIntoViewIfNeeded();
    const initial = (await cell.boundingBox())!;
    if (width < 1440) {
      await region.evaluate(el => { el.scrollLeft = el.scrollWidth; });
      expect(await region.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      expect(Math.abs((await cell.boundingBox())!.x - initial.x)).toBeLessThanOrEqual(1);
      expect(Math.abs((await header.boundingBox())!.x - initial.x)).toBeLessThanOrEqual(1);
      expect(await cell.evaluate(el => {
        const r = el.getBoundingClientRect();
        const y = Math.max(1, Math.min(innerHeight - 1, r.top + r.height / 2));
        return document.elementFromPoint(r.left + r.width / 2, y)?.closest("td") === el;
      })).toBe(true);
    }
    await region.evaluate(el => { el.scrollLeft = 0; });
    await region.focus();
    for (const [key, label] of [["Tab", "Open Project"], ["Tab", "Continue Workflow"], ["Shift+Tab", "Open Project"]]) {
      await page.keyboard.press(key);
      const button = region.getByRole("button", { name: label, exact: true });
      await expect(button).toBeFocused();
      expect(await button.evaluate(el => {
        const button = el.getBoundingClientRect();
        const table = el.closest(".table-scroll")!.getBoundingClientRect();
        const sticky = el.closest("tr")!.querySelector("td")!.getBoundingClientRect();
        return button.left - 6 >= sticky.right && button.right + 6 <= table.right && getComputedStyle(el).outlineStyle !== "none";
      })).toBe(true);
    }
    const scrollBefore = await region.evaluate(el => el.scrollLeft);
    await page.getByLabel("Search projects").fill("Synthetic");
    expect(await region.evaluate(el => el.scrollLeft)).toBe(scrollBefore);
    await expect(name).toHaveText(project.name);
  });
}

for (const width of [1440, 768, 375, 320]) {
  test(`project status and stage stay separate and unclipped at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const projects = [
      { workflow_status: "Draft", workflow_stage: "Suppliers" },
      { workflow_status: "Approved", workflow_stage: "Decision" },
      { workflow_status: "Needs review", workflow_stage: "Recalculate supplier rankings" },
    ].map((item, index) => ({
      ...item, id: `p${index}`, reference: `PRJ-${index}`, name: `Project ${index}`,
      category: "", status: "Draft", updated_at: "2026-11-18T10:00:00Z",
    }));
    await page.route("**/api/projects", route => route.fulfill({ json: projects }));
    await page.goto("/#/");
    const region = page.getByRole("region", { name: "Purchasing projects table" });
    for (const [index, project] of projects.entries()) {
      const cell = region.locator("tbody tr").nth(index).locator("td").nth(3);
      const badge = cell.locator(".chip"), stage = cell.locator(".supplier-note");
      await expect(badge).toHaveText(project.workflow_status);
      await expect(stage).toHaveText(project.workflow_stage);
      expect(await cell.evaluate(el => {
        const badge = el.querySelector(".chip")!, stage = el.querySelector(".supplier-note")!;
        const cellBox = el.getBoundingClientRect(), badgeBox = badge.getBoundingClientRect(), stageBox = stage.getBoundingClientRect();
        const textFits = (node: Element, box: DOMRect) => {
          const range = document.createRange(); range.selectNodeContents(node);
          return Array.from(range.getClientRects()).every(r => r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1);
        };
        return badge.getClientRects().length === 1 && stageBox.top >= badgeBox.bottom + 4
          && badgeBox.left >= cellBox.left && badgeBox.right <= cellBox.right
          && stageBox.left >= cellBox.left && stageBox.right <= cellBox.right
          && stageBox.bottom <= cellBox.bottom && textFits(badge, badgeBox) && textFits(stage, stageBox);
      })).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
