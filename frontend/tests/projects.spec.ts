import { test, expect } from "@playwright/test";
test("save failure preserves entries, retry and reopen survive refresh", async ({
  page,
}) => {
  let saved: any = null;
  let attempts: any[] = [];
  await page.route("**/api/projects**", async (route) => {
    const request = route.request();
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
  await page
    .getByRole("button", { name: "Create Project", exact: true })
    .click();
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
  expect(
    await page
      .locator("img")
      .evaluateAll((images) =>
        images.every((img) => img.complete && img.naturalWidth > 0),
      ),
  ).toBe(true);
});
