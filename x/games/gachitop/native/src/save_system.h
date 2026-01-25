#pragma once

#include "pet_sim.h"

#include <cstdint>
#include <string>

struct SaveData {
  int schemaVersion = 5;
  std::int64_t createdAtUnixSeconds = 0;
  std::int64_t lastMonthlyTickAtUnixSeconds = 0;
  // Last time we advanced meter decay / neglect outcomes using wall-clock time.
  // Used for offline catch-up on next launch.
  std::int64_t lastSimUpdateUnixSeconds = 0;
  int ageMonths = 0;

  // Intro dialog: should only show once per new pet.
  bool introSeen = true;

  int careMistakesTotal = 0;
  int careMistakesThisMonth = 0;

  std::uint32_t rngState = 0;

  // Borderless window bezel theme.
  int bezelPaletteIndex = 0;

  // Sleep/lights state.
  bool lightsOn = true;
  bool sleeping = false;

  bool isDead = false;
  bool illnessActive = false;
  std::string illnessId;
  float illnessSeverity = 0.0f;
  bool illnessSymptomatic = false;
  bool illnessWarning = false;
  std::int64_t illnessLastUpdateUnixSeconds = 0;
  std::int64_t illnessTreatedUntilUnixSeconds = 0;
  std::int64_t illnessTerminalAtOrAboveStartUnixSeconds = 0;
  std::int64_t illnessDeathAtUnixSeconds = 0;
  std::int64_t illnessWarningStartUnixSeconds = 0;
  std::int64_t lastMedicineDoseUnixSeconds = 0;

  float hunger = 80.0f;
  float happiness = 80.0f;
  float energy = 80.0f;
};

struct SaveLoadResult {
  SaveData data;
  bool loaded = false;
  std::string error;
};

SaveLoadResult loadSaveOrCreateDefault(const std::string& path, std::int64_t nowUnixSeconds);
SaveLoadResult loadSaveFromJsonString(const std::string& jsonText, std::int64_t nowUnixSeconds);
std::string saveToJsonString(const SaveData& data, int indent = 2);
bool writeSaveAtomic(const std::string& path, const SaveData& data);

SaveData toSaveData(const PetSim& sim, std::int64_t createdAtUnixSeconds, std::int64_t lastMonthlyTickAtUnixSeconds,
                    std::int64_t lastSimUpdateUnixSeconds, int ageMonths, int careMistakesTotal, int careMistakesThisMonth,
                    std::uint32_t rngState, int bezelPaletteIndex, bool introSeen);
void applySaveData(PetSim& sim, const SaveData& data);
