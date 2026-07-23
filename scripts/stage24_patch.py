from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"Expected block not found in {path}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


curriculum_path = Path("src/features/curriculum/services/curriculumService.ts")
curriculum = curriculum_path.read_text(encoding="utf-8")
start = curriculum.index("  if (lesson.graduation) {")
end_marker = "\n  }\n}\n\nfunction assertModulePackage"
end = curriculum.index(end_marker, start) + len("\n  }")
new_graduation = '''  if (lesson.graduation) {
    if (
      !["data-transformation", "file-processing"].includes(mode) ||
      typeof lesson.graduation.badgeName !== "string" ||
      typeof lesson.graduation.nextLevel !== "string" ||
      !Array.isArray(lesson.graduation.topics) ||
      lesson.graduation.topics.length < 6 ||
      lesson.graduation.topics.some((topic) => typeof topic !== "string") ||
      !Array.isArray(lesson.graduation.criteria) ||
      lesson.graduation.criteria.length < 3 ||
      lesson.graduation.criteria.some((criterion) => typeof criterion !== "string")
    ) {
      throw new Error(`${lesson.id} mezuniyet sınavı rehberi eksik.`);
    }

    const capstoneChecks = validation.checks.filter(
      (check) => check.kind === "capstone_project",
    );
    if (capstoneChecks.length > 0) {
      const workspacePaths = new Set(lesson.editor.files?.map((file) => file.path) ?? []);
      if (mode !== "file-processing" || capstoneChecks.length !== 1) {
        throw new Error(`${lesson.id} bitirme projesi file-processing modunda tek kalite kapısı taşımalıdır.`);
      }
      for (const check of capstoneChecks) {
        if (
          check.requiredFiles.length < 6 ||
          check.requiredFiles.some((path) => !workspacePaths.has(path)) ||
          check.testFiles.length < 2 ||
          check.testFiles.some(
            (path) => !workspacePaths.has(path) || !path.split("/").at(-1)?.startsWith("test_"),
          ) ||
          check.minTests < 4 ||
          check.minAssertions < 4
        ) {
          throw new Error(`${lesson.id} bitirme projesi kalite kapısı geçersiz.`);
        }
      }
    } else {
      const hasFunctionDefinitionCheck = validation.checks.some(
        (check) => check.kind === "function_definition",
      );
      const hasFunctionCasesCheck = validation.checks.some(
        (check) => check.kind === "function_cases",
      );
      const requiredNodeNames = ["For", "If", "Dict"];
      const hasRequiredNodes = requiredNodeNames.every((nodeName) =>
        validation.checks.some(
          (check) => check.kind === "node_count" && check.nodeName === nodeName,
        ),
      );
      const hasSetCheck = validation.checks.some(
        (check) =>
          (check.kind === "node_count" && ["Set", "SetComp"].includes(check.nodeName)) ||
          (check.kind === "call" && ["set", "add"].includes(check.name)),
      );

      if (!hasFunctionDefinitionCheck || !hasFunctionCasesCheck || !hasRequiredNodes || !hasSetCheck) {
        throw new Error(`${lesson.id} mezuniyet sınavı kapsamlı yapısal testleri içermiyor.`);
      }
    }
  }'''
curriculum_path.write_text(curriculum[:start] + new_graduation + curriculum[end:], encoding="utf-8")

home_path = Path("src/pages/HomePage/HomePage.tsx")
home = home_path.read_text(encoding="utf-8")

home = home.replace(
'''import {
  beginnerGraduationLessonId,
  getBeginnerGraduationLesson,
  getBeginnerGraduationSnapshot,
} from "../../features/mastery/beginnerGraduation";
''',
'''import {
  beginnerGraduationLessonId,
  getBeginnerGraduationLesson,
  getBeginnerGraduationSnapshot,
} from "../../features/mastery/beginnerGraduation";
import {
  getIntermediateGraduationLesson,
  getIntermediateGraduationSnapshot,
  intermediateGraduationLessonId,
} from "../../features/mastery/intermediateGraduation";
''',
1,
)

home = home.replace(
'''  const graduation = useMemo(
    () => getBeginnerGraduationSnapshot(catalog, completedLessonIds),
    [catalog, completedLessonIds],
  );
  const graduationLesson = getBeginnerGraduationLesson(catalog);
''',
'''  const beginnerGraduation = useMemo(
    () => getBeginnerGraduationSnapshot(catalog, completedLessonIds),
    [catalog, completedLessonIds],
  );
  const intermediateGraduation = useMemo(
    () => getIntermediateGraduationSnapshot(catalog, completedLessonIds),
    [catalog, completedLessonIds],
  );
  const beginnerGraduationLesson = getBeginnerGraduationLesson(catalog);
  const intermediateGraduationLesson = getIntermediateGraduationLesson(catalog);
''',
1,
)

home = home.replace(
"  const completedBeginnerModules = graduation.completedCoreModules;\n",
"  const completedBeginnerModules = beginnerGraduation.completedCoreModules;\n",
1,
)

old_level_rows = '''  const levelRows = roadmapLevels.map((level) => {
    const isBeginner = level.id === "beginner";
    const isIntermediate = level.id === "intermediate";
    return {
      ...level,
      completedModules: isBeginner
        ? completedBeginnerModules
        : isIntermediate
          ? completedIntermediateModules
          : 0,
      progress: isBeginner
        ? beginnerRoadmapProgress
        : isIntermediate
          ? intermediateRoadmapProgress
          : 0,
      locked: isBeginner ? false : isIntermediate ? !graduation.intermediateUnlocked : true,
      unlocked: isIntermediate && graduation.intermediateUnlocked,
    };
  });
'''
new_level_rows = '''  const levelRows = roadmapLevels.map((level) => {
    const isBeginner = level.id === "beginner";
    const isIntermediate = level.id === "intermediate";
    const isAdvanced = level.id === "advanced";
    return {
      ...level,
      completedModules: isBeginner
        ? completedBeginnerModules
        : isIntermediate
          ? completedIntermediateModules
          : 0,
      progress: isBeginner
        ? beginnerRoadmapProgress
        : isIntermediate
          ? intermediateRoadmapProgress
          : 0,
      locked: isBeginner
        ? false
        : isIntermediate
          ? !beginnerGraduation.intermediateUnlocked
          : isAdvanced
            ? !intermediateGraduation.advancedUnlocked
            : true,
      unlocked:
        (isIntermediate && beginnerGraduation.intermediateUnlocked) ||
        (isAdvanced && intermediateGraduation.advancedUnlocked),
    };
  });
'''
if old_level_rows not in home:
    raise RuntimeError("Home levelRows block not found")
home = home.replace(old_level_rows, new_level_rows, 1)

home = home.replace(
'''  const currentLevelLabel =
    resumeModule.id === "beginner-graduation"
      ? "Sınav"
      : resumeLevel?.id === "intermediate"
        ? "Orta Seviye"
        : "Başlangıç";

  return (
''',
'''  const currentLevelLabel =
    resumeModule.id === "beginner-graduation"
      ? "Sınav"
      : resumeModule.id === "intermediate-project"
        ? "Bitirme Projesi"
        : resumeLevel?.id === "intermediate"
          ? "Orta Seviye"
          : "Başlangıç";

  const showingIntermediateGraduation = beginnerGraduation.graduated;
  const graduationView = showingIntermediateGraduation
    ? {
        graduated: intermediateGraduation.graduated,
        unlocked: intermediateGraduation.projectUnlocked,
        masteryScore: intermediateGraduation.masteryScore,
        badgeName: intermediateGraduation.badgeName,
        completedCoreLessons: intermediateGraduation.completedCoreLessons,
        totalCoreLessons: intermediateGraduation.totalCoreLessons,
        completedCoreModules: intermediateGraduation.completedCoreModules,
        totalCoreModules: intermediateGraduation.totalCoreModules,
        weakTopics: intermediateGraduation.weakTopics,
        lesson: intermediateGraduationLesson,
        lessonId: intermediateGraduationLessonId,
        levelName: "Orta Seviye",
        nextLevel: "İleri Seviye",
        readyTitle: "Dokuz modülü üretim kalitesinde tek projede kanıtla",
        readyDescription:
          "Sipariş Yönetim Sistemi bitirme projesini tamamlayarak Orta Seviye rozetini kazan ve İleri Seviye yolunu aç.",
      }
    : {
        graduated: beginnerGraduation.graduated,
        unlocked: beginnerGraduation.examUnlocked,
        masteryScore: beginnerGraduation.masteryScore,
        badgeName: beginnerGraduation.badgeName,
        completedCoreLessons: beginnerGraduation.completedCoreLessons,
        totalCoreLessons: beginnerGraduation.totalCoreLessons,
        completedCoreModules: beginnerGraduation.completedCoreModules,
        totalCoreModules: beginnerGraduation.totalCoreModules,
        weakTopics: beginnerGraduation.weakTopics,
        lesson: beginnerGraduationLesson,
        lessonId: beginnerGraduationLessonId,
        levelName: "Başlangıç",
        nextLevel: "Orta Seviye",
        readyTitle: "Sekiz modülü tek projede kanıtla",
        readyDescription:
          "Kapsamlı Mağaza Analizörü projesini tamamlayarak rozetini kazan ve Orta Seviye kilidini kaldır.",
      };

  return (
''',
1,
)

panel_start = home.index('          <article className={`${styles.panel} ${styles.graduationPanel}`}')
panel_end_marker = '          </article>\n\n          <div className={styles.twoColumns}>'
panel_end = home.index(panel_end_marker, panel_start) + len('          </article>')
new_panel = '''          <article
            className={`${styles.panel} ${styles.graduationPanel}`}
            data-graduated={graduationView.graduated || undefined}
          >
            <div className={styles.graduationScore}>
              <span>Ustalık puanı</span>
              <strong>{graduationView.masteryScore}</strong>
              <small>/ 100</small>
            </div>
            <div className={styles.graduationBody}>
              <span className={styles.eyebrow}>
                {graduationView.graduated
                  ? `${graduationView.levelName} mezuniyeti`
                  : graduationView.unlocked
                    ? "Bitirme projesi hazır"
                    : `${graduationView.levelName} mezuniyetine giden yol`}
              </span>
              <h2>
                {graduationView.graduated
                  ? graduationView.badgeName
                  : graduationView.unlocked
                    ? graduationView.readyTitle
                    : `${graduationView.completedCoreLessons} / ${graduationView.totalCoreLessons} ders tamamlandı`}
              </h2>
              <p>
                {graduationView.graduated
                  ? `Mezuniyet rozeti kazanıldı ve ${graduationView.nextLevel} öğrenim yolu açıldı.`
                  : graduationView.unlocked
                    ? graduationView.readyDescription
                    : "En düşük tamamlanma oranına sahip modüller aşağıda gösteriliyor. Bu konular tamamlandıkça bitirme projesi otomatik açılır."}
              </p>
              {!graduationView.graduated && !graduationView.unlocked ? (
                <div className={styles.weakTopics}>
                  {graduationView.weakTopics.map((topic) => (
                    <div key={topic.id}>
                      <span>{topic.number}</span>
                      <b>{topic.title}</b>
                      <small>%{topic.percent}</small>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className={styles.graduationAction}>
              {graduationView.graduated ? (
                <div className={styles.graduationBadge}>
                  <i>◆</i>
                  <span>{graduationView.nextLevel}</span>
                  <strong>Açıldı</strong>
                </div>
              ) : graduationView.unlocked && graduationView.lesson ? (
                <Button variant="primary" onClick={() => openLesson(graduationView.lessonId)}>
                  Bitirme projesini aç →
                </Button>
              ) : (
                <div>
                  <span>Hazırlık</span>
                  <strong>
                    {graduationView.completedCoreModules} / {graduationView.totalCoreModules} modül
                  </strong>
                </div>
              )}
            </div>
          </article>'''
home = home[:panel_start] + new_panel + home[panel_end:]

if "graduation." in home:
    raise RuntimeError("Stale graduation references remain in HomePage")

home_path.write_text(home, encoding="utf-8")
