import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(
  resolve(process.cwd(), "src/pages/HomePage/HomePage.tsx"),
  "utf-8",
);

describe("expert graduation home contract", () => {
  it("switches from advanced graduation to the expert mastery snapshot", () => {
    expect(homeSource).toContain("getExpertGraduationSnapshot");
    expect(homeSource).toContain("const showingExpertGraduation = advancedGraduation.graduated");
    expect(homeSource).toContain("graduated: expertGraduation.graduated");
    expect(homeSource).toContain("lessonId: expertGraduationLessonId");
  });

  it("presents the expert project as a graduation project", () => {
    expect(homeSource).toContain('resumeModule.id === "expert-project"');
    expect(homeSource).toContain("Beş uzman modülü tek güvenilir analiz platformunda kanıtla");
  });

  it("shows final curriculum completion instead of unlocking a nonexistent level", () => {
    expect(homeSource).toContain('graduatedBadgeTitle: "Tüm müfredat"');
    expect(homeSource).toContain('graduatedBadgeStatus: "Tamamlandı"');
    expect(homeSource).toContain("Python Farming öğrenim rotasının tamamı başarıyla bitirildi");
  });
});
