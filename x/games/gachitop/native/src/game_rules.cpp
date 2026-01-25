#include "game_rules.h"

#include <fstream>
#include <sstream>

#include <nlohmann/json.hpp>

namespace {

template <typename T>
void maybeAssign(const nlohmann::json& j, const char* key, T& out) {
  auto it = j.find(key);
  if (it == j.end() || it->is_null()) {
    return;
  }
  out = it->get<T>();
}

void parseGameRulesJson(const nlohmann::json& j, GameRules& rules) {
  // time.monthlyTickHours
  if (j.contains("time")) {
    const auto& t = j["time"];
    maybeAssign(t, "monthlyTickHours", rules.monthlyTickHours);
  }

  // careMistakes
  if (j.contains("careMistakes")) {
    const auto& c = j["careMistakes"];
    maybeAssign(c, "enabled", rules.careMistakesEnabled);
    maybeAssign(c, "graceMinutes", rules.careMistakeGraceMinutes);

    if (c.contains("criticalRanges")) {
      const auto& r = c["criticalRanges"];
      maybeAssign(r, "hunger", rules.hungerCriticalRange);
      maybeAssign(r, "happiness", rules.happinessCriticalRange);
      maybeAssign(r, "energy", rules.energyCriticalRange);
    }

    if (c.contains("criticalFatalAfterHours")) {
      const auto& f = c["criticalFatalAfterHours"];
      maybeAssign(f, "hunger", rules.hungerCriticalFatalAfterHours);
      maybeAssign(f, "energy", rules.energyCriticalFatalAfterHours);
    }
  }

  // meters.decayPerHourAwake
  if (j.contains("meters") && j["meters"].contains("decayPerHourAwake")) {
    const auto& d = j["meters"]["decayPerHourAwake"];
    maybeAssign(d, "hunger", rules.hungerDecayPerHourAwake);
    maybeAssign(d, "happiness", rules.happinessDecayPerHourAwake);
    maybeAssign(d, "energy", rules.energyDecayPerHourAwake);
  }

  // meters.decayMultiplierSleeping
  if (j.contains("meters") && j["meters"].contains("decayMultiplierSleeping")) {
    const auto& m = j["meters"]["decayMultiplierSleeping"];
    maybeAssign(m, "hunger", rules.hungerDecayMultiplierSleeping);
    maybeAssign(m, "happiness", rules.happinessDecayMultiplierSleeping);
    maybeAssign(m, "energy", rules.energyDecayMultiplierSleeping);
  }

  // meters.sleep
  if (j.contains("meters") && j["meters"].contains("sleep")) {
    const auto& s = j["meters"]["sleep"];
    maybeAssign(s, "energyRestorePerHour", rules.sleepEnergyRestorePerHour);
    maybeAssign(s, "autoWakeAtEnergy", rules.sleepAutoWakeAtEnergy);
    maybeAssign(s, "tiredAtEnergy", rules.sleepTiredAtEnergy);
  }

  // meters.attentionThresholds
  if (j.contains("meters") && j["meters"].contains("attentionThresholds")) {
    const auto& t = j["meters"]["attentionThresholds"];
    maybeAssign(t, "hunger", rules.hungerAttentionThreshold);
    maybeAssign(t, "happiness", rules.happinessAttentionThreshold);
    maybeAssign(t, "energy", rules.energyAttentionThreshold);
  }

  // actions.food.meal
  if (j.contains("actions") && j["actions"].contains("food") && j["actions"]["food"].contains("meal")) {
    const auto& m = j["actions"]["food"]["meal"];
    maybeAssign(m, "hungerDelta", rules.mealHungerDelta);
    maybeAssign(m, "happinessDelta", rules.mealHappinessDelta);
  }

  // actions.play
  if (j.contains("actions") && j["actions"].contains("play")) {
    const auto& p = j["actions"]["play"];
    maybeAssign(p, "happinessDelta", rules.playHappinessDelta);
    maybeAssign(p, "energyDelta", rules.playEnergyDelta);
  }

  // time.offlineSim.maxDeltaClampSeconds
  if (j.contains("time") && j["time"].contains("offlineSim")) {
    const auto& o = j["time"]["offlineSim"];
    maybeAssign(o, "maxCatchupSeconds", rules.offlineSimMaxCatchupSeconds);
    maybeAssign(o, "maxDeltaClampSeconds", rules.maxDeltaClampSeconds);
  }
}

} // namespace

GameRulesLoadResult loadGameRulesFromFile(const std::string& path) {
  GameRulesLoadResult result;

  std::ifstream in(path);
  if (!in.is_open()) {
    result.error = "Could not open: " + path;
    return result;
  }

  nlohmann::json j;
  try {
    in >> j;
  } catch (const std::exception& e) {
    result.error = std::string("JSON parse error: ") + e.what();
    return result;
  }

  try {
    parseGameRulesJson(j, result.rules);

    result.loadedFromFile = true;
    return result;
  } catch (const std::exception& e) {
    result.error = std::string("JSON schema mismatch: ") + e.what();
    return result;
  }
}

GameRulesLoadResult loadGameRulesFromJsonString(const std::string& jsonText) {
  GameRulesLoadResult result;
  if (jsonText.empty()) {
    return result;
  }

  nlohmann::json j;
  try {
    j = nlohmann::json::parse(jsonText);
  } catch (const std::exception& e) {
    result.error = std::string("JSON parse error: ") + e.what();
    return result;
  }

  try {
    parseGameRulesJson(j, result.rules);
    result.loadedFromFile = true;
    return result;
  } catch (const std::exception& e) {
    result.error = std::string("JSON schema mismatch: ") + e.what();
    return result;
  }
}
