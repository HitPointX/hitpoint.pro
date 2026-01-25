#pragma once

#include <string>

struct GameRules {
  // Time
  int monthlyTickHours = 24;

  // Offline catch-up
  int offlineSimMaxCatchupSeconds = 86400;

  // Care mistakes
  bool careMistakesEnabled = true;
  int careMistakeGraceMinutes = 20;

  // Neglect death thresholds (used for offline catch-up)
  int hungerCriticalRange = 5;
  int happinessCriticalRange = 5;
  int energyCriticalRange = 5;
  int hungerCriticalFatalAfterHours = 10;
  int energyCriticalFatalAfterHours = 12;

  // Needs
  float hungerDecayPerHourAwake = 6.0f;
  float happinessDecayPerHourAwake = 2.0f;
  float energyDecayPerHourAwake = 5.0f;

  // Sleep / lights-off behavior
  float hungerDecayMultiplierSleeping = 0.25f;
  float happinessDecayMultiplierSleeping = 0.25f;
  float energyDecayMultiplierSleeping = 0.0f;

  float sleepEnergyRestorePerHour = 18.0f;
  int sleepAutoWakeAtEnergy = 90;
  int sleepTiredAtEnergy = 55;

  int hungerAttentionThreshold = 25;
  int happinessAttentionThreshold = 25;
  int energyAttentionThreshold = 20;

  // Actions
  int mealHungerDelta = 35;
  int mealHappinessDelta = 2;

  int playHappinessDelta = 18;
  int playEnergyDelta = -5;

  // Offline/step safety
  int maxDeltaClampSeconds = 60;
};

struct GameRulesLoadResult {
  GameRules rules;
  bool loadedFromFile = false;
  std::string error;
};

GameRulesLoadResult loadGameRulesFromFile(const std::string& path);
GameRulesLoadResult loadGameRulesFromJsonString(const std::string& jsonText);
