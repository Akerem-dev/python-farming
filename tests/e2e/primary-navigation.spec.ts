import { expect, test } from "@playwright/test";

const pageJourneys = [
  {
    label: "Görevler",
    hash: "#/tasks",
    heading: "Yapılabilir bütün görevler tek yerde",
  },
  {
    label: "Projeler",
    hash: "#/projects",
    heading: "Müfredattaki gerçek projeler",
  },
  {
    label: "İlerleme",
    hash: "#/progress",
    heading: "Öğrenim yolunun tamamı",
  },
  {
    label: "Ayarlar",
    hash: "#/settings",
    heading: "Python ortamını ve uygulama sağlığını kontrol et",
  },
] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Ana navigasyon" })).toBeVisible();
});

test("primary rail opens every product page with a real pointer click", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "Ana navigasyon" });

  for (const journey of pageJourneys) {
    const link = navigation.getByRole("link", { name: journey.label, exact: true });
    await link.click();

    await expect(page).toHaveURL(new RegExp(`${journey.hash.replace("/", "\\/")}$`));
    await expect(page.getByRole("heading", { level: 1, name: journey.heading })).toBeVisible();
    await expect(link).toHaveAttribute("aria-current", "page");
  }
});

test("browser history restores the previous primary page", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "Ana navigasyon" });

  await navigation.getByRole("link", { name: "Görevler", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: pageJourneys[0].heading })).toBeVisible();

  await navigation.getByRole("link", { name: "Projeler", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: pageJourneys[1].heading })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#\/tasks$/);
  await expect(page.getByRole("heading", { level: 1, name: pageJourneys[0].heading })).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Görevler", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("an available task opens the actual workspace", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "Ana navigasyon" });

  await navigation.getByRole("link", { name: "Görevler", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: pageJourneys[0].heading })).toBeVisible();

  const openTask = page.getByRole("button", { name: "İlk görevi aç →" });
  await expect(openTask).toBeEnabled();
  await openTask.click();

  await expect(page).toHaveURL(/#\/workspace$/);
  await expect(
    page.getByRole("navigation", { name: "Ana navigasyon" }).getByRole("link", {
      name: "Kod Alanı",
      exact: true,
    }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Çalıştır", exact: true })).toBeVisible();
});
