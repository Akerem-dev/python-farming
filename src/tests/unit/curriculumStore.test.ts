import { beforeEach, describe, expect, it } from "vitest";
import { useCurriculumStore } from "../../features/curriculum/store/curriculumStore";
import type { CurriculumCatalog } from "../../features/curriculum/types";
import { useProgressStore } from "../../features/progress/store/progressStore";

const catalog: CurriculumCatalog = {
  version: 1,
  levels: [
    {
      id: "beginner",
      title: "Başlangıç",
      modules: [
        {
          id: "module",
          number: "01",
          title: "Test modülü",
          lessonIds: ["lesson-1", "lesson-2"],
        },
      ],
    },
  ],
  lessons: [
    {
      id: "lesson-1",
      moduleId: "module",
      order: 1,
      title: "Bir",
      summary: "",
      levelLabel: "Beginner",
      task: {
        title: "Bir",
        instructions: [],
        requirements: [],
        sampleOutput: "",
        stdinEnabled: false,
        stdinPlaceholder: "",
        defaultStdin: "",
      },
      editor: { filename: "main.py", starterCode: "" },
      hints: [],
      validation: { id: "lesson-1", title: "Bir", xpReward: 10, timeoutMs: 1000, checks: [] },
    },
    {
      id: "lesson-2",
      moduleId: "module",
      order: 2,
      title: "İki",
      summary: "",
      levelLabel: "Beginner",
      task: {
        title: "İki",
        instructions: [],
        requirements: [],
        sampleOutput: "",
        stdinEnabled: false,
        stdinPlaceholder: "",
        defaultStdin: "",
      },
      editor: { filename: "main.py", starterCode: "" },
      hints: [],
      validation: { id: "lesson-2", title: "İki", xpReward: 10, timeoutMs: 1000, checks: [] },
    },
  ],
};

describe("curriculumStore", () => {
  beforeEach(() => {
    useProgressStore.setState({
      completedLessonIds: [],
      totalXp: 0,
      lastLessonId: null,
      status: "ready",
      errorMessage: null,
    });
    useCurriculumStore.setState({
      status: "ready",
      catalog,
      currentLessonId: "lesson-1",
      errorMessage: null,
    });
  });

  it("keeps the next lesson locked until the current lesson is complete", () => {
    useCurriculumStore.getState().selectNextLesson();
    expect(useCurriculumStore.getState().currentLessonId).toBe("lesson-1");
  });

  it("moves to the next lesson after the prerequisite is complete", () => {
    useProgressStore.setState({ completedLessonIds: ["lesson-1"] });
    useCurriculumStore.getState().selectNextLesson();
    expect(useCurriculumStore.getState().currentLessonId).toBe("lesson-2");
  });

  it("moves back to the previous lesson", () => {
    useProgressStore.setState({ completedLessonIds: ["lesson-1"] });
    useCurriculumStore.setState({ currentLessonId: "lesson-2" });
    useCurriculumStore.getState().selectPreviousLesson();
    expect(useCurriculumStore.getState().currentLessonId).toBe("lesson-1");
  });

  it("ignores unknown lesson ids", () => {
    useCurriculumStore.getState().selectLesson("missing");
    expect(useCurriculumStore.getState().currentLessonId).toBe("lesson-1");
  });
});
