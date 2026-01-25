#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

struct IllnessDef {
  std::string illnessId;
  std::string displayName;

  // Onset
  double baseMonthlyProbability = 0.0;
  int ageYearsMin = 0;
  int ageYearsMax = 100;
  double perCareMistake = 0.0;

  // Progression (acute-style)
  double severityIncreasePerDayUntreated = 0.0;
  double severityDecreasePerDayTreated = 0.0;
  int symptomaticStartsAtSeverity = 20;

  int terminalStartsAtSeverity = 95;
  int deathAfterDaysAtOrAbove = 2;
  int warningDaysMin = 2;
  int warningDaysMax = 4;

  // Treatment
  int medicineDoseSeverityDelta = -35;
  int medicineCooldownSeconds = 30;
  double successChanceAtLowSeverity = 0.7;
  double successChanceAtHighSeverity = 0.4;
  bool managesButRarelyCures = false;
};

struct IllnessDB {
  std::vector<IllnessDef> illnesses;

  const IllnessDef* findById(const std::string& id) const;
};

struct IllnessDBLoadResult {
  IllnessDB db;
  bool loadedFromFile = false;
  std::string error;
};

IllnessDBLoadResult loadIllnessDBFromFile(const std::string& path);
IllnessDBLoadResult loadIllnessDBFromJsonString(const std::string& jsonText);
