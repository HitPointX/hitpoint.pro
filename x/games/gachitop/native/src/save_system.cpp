#include "save_system.h"

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <string_view>

#include <nlohmann/json.hpp>

namespace {

std::string tmpPathFor(const std::string& path) {
  return path + ".tmp";
}

SaveLoadResult defaultSave(std::int64_t nowUnixSeconds) {
  SaveLoadResult r;
  r.data.schemaVersion = 6;
  r.data.createdAtUnixSeconds = nowUnixSeconds;
  r.data.lastMonthlyTickAtUnixSeconds = nowUnixSeconds;
  r.data.lastSimUpdateUnixSeconds = nowUnixSeconds;
  r.data.ageMonths = 0;
  r.data.introSeen = false;
  r.data.rngState = static_cast<std::uint32_t>(nowUnixSeconds) ^ 0xA5C3F129u;
  r.data.bezelPaletteIndex = 0;
  r.data.lightsOn = true;
  r.data.sleeping = false;
  r.loaded = false;
  return r;
}

SaveLoadResult parseSaveJson(const nlohmann::json& j, std::int64_t nowUnixSeconds) {
  SaveLoadResult r;

  r.data.schemaVersion = j.value("schemaVersion", 1);

  r.data.createdAtUnixSeconds = j.value("createdAtUnixSeconds", nowUnixSeconds);
  r.data.lastMonthlyTickAtUnixSeconds = j.value("lastMonthlyTickAtUnixSeconds", nowUnixSeconds);
  r.data.lastSimUpdateUnixSeconds =
    j.value("lastSimUpdateUnixSeconds", j.value("lastMonthlyTickAtUnixSeconds", nowUnixSeconds));
  r.data.ageMonths = j.value("ageMonths", 0);

  r.data.introSeen = j.value("introSeen", true);

  r.data.careMistakesTotal = j.value("careMistakesTotal", 0);
  r.data.careMistakesThisMonth = j.value("careMistakesThisMonth", 0);

  r.data.hunger = j.value("hunger", 80.0f);
  r.data.happiness = j.value("happiness", 80.0f);
  r.data.energy = j.value("energy", 80.0f);

  r.data.rngState = j.value("rngState", static_cast<std::uint32_t>(r.data.createdAtUnixSeconds) ^ 0xA5C3F129u);

  r.data.bezelPaletteIndex = j.value("bezelPaletteIndex", 0);

  r.data.lightsOn = j.value("lightsOn", true);
  r.data.sleeping = j.value("sleeping", false);

  r.data.isDead = j.value("isDead", false);
  r.data.illnessActive = j.value("illnessActive", false);
  r.data.illnessId = j.value("illnessId", std::string{});
  r.data.illnessSeverity = j.value("illnessSeverity", 0.0f);
  r.data.illnessSymptomatic = j.value("illnessSymptomatic", false);
  r.data.illnessWarning = j.value("illnessWarning", false);
  r.data.illnessLastUpdateUnixSeconds = j.value("illnessLastUpdateUnixSeconds", static_cast<std::int64_t>(0));
  r.data.illnessTreatedUntilUnixSeconds = j.value("illnessTreatedUntilUnixSeconds", static_cast<std::int64_t>(0));
  r.data.illnessTerminalAtOrAboveStartUnixSeconds =
    j.value("illnessTerminalAtOrAboveStartUnixSeconds", static_cast<std::int64_t>(0));
  r.data.illnessDeathAtUnixSeconds = j.value("illnessDeathAtUnixSeconds", static_cast<std::int64_t>(0));
  r.data.illnessWarningStartUnixSeconds = j.value("illnessWarningStartUnixSeconds", static_cast<std::int64_t>(0));
  r.data.lastMedicineDoseUnixSeconds = j.value("lastMedicineDoseUnixSeconds", static_cast<std::int64_t>(0));

  return r;
}

nlohmann::json saveDataToJson(const SaveData& data) {
  nlohmann::json j;
  j["schemaVersion"] = data.schemaVersion;
  j["createdAtUnixSeconds"] = data.createdAtUnixSeconds;
  j["lastMonthlyTickAtUnixSeconds"] = data.lastMonthlyTickAtUnixSeconds;
  j["lastSimUpdateUnixSeconds"] = data.lastSimUpdateUnixSeconds;
  j["ageMonths"] = data.ageMonths;
  j["introSeen"] = data.introSeen;
  j["careMistakesTotal"] = data.careMistakesTotal;
  j["careMistakesThisMonth"] = data.careMistakesThisMonth;
  j["rngState"] = data.rngState;
  j["bezelPaletteIndex"] = data.bezelPaletteIndex;
  j["lightsOn"] = data.lightsOn;
  j["sleeping"] = data.sleeping;
  j["isDead"] = data.isDead;
  j["illnessActive"] = data.illnessActive;
  j["illnessId"] = data.illnessId;
  j["illnessSeverity"] = data.illnessSeverity;
  j["illnessSymptomatic"] = data.illnessSymptomatic;
  j["illnessWarning"] = data.illnessWarning;
  j["illnessLastUpdateUnixSeconds"] = data.illnessLastUpdateUnixSeconds;
  j["illnessTreatedUntilUnixSeconds"] = data.illnessTreatedUntilUnixSeconds;
  j["illnessTerminalAtOrAboveStartUnixSeconds"] = data.illnessTerminalAtOrAboveStartUnixSeconds;
  j["illnessDeathAtUnixSeconds"] = data.illnessDeathAtUnixSeconds;
  j["illnessWarningStartUnixSeconds"] = data.illnessWarningStartUnixSeconds;
  j["lastMedicineDoseUnixSeconds"] = data.lastMedicineDoseUnixSeconds;
  j["hunger"] = data.hunger;
  j["happiness"] = data.happiness;
  j["energy"] = data.energy;
  return j;
}

} // namespace

SaveLoadResult loadSaveOrCreateDefault(const std::string& path, std::int64_t nowUnixSeconds) {
  SaveLoadResult r;

  std::ifstream in(path);
  if (!in.is_open()) {
    return defaultSave(nowUnixSeconds);
  }

  try {
    nlohmann::json j;
    in >> j;
    r = parseSaveJson(j, nowUnixSeconds);
    r.loaded = true;
    return r;
  } catch (const std::exception& e) {
    r.error = std::string("Failed to parse save: ") + e.what();
    r = defaultSave(nowUnixSeconds);
    r.error = std::string("Failed to parse save: ") + e.what();
    return r;
  }
}

SaveLoadResult loadSaveFromJsonString(const std::string& jsonText, std::int64_t nowUnixSeconds) {
  if (jsonText.empty()) {
    return defaultSave(nowUnixSeconds);
  }

  try {
    const nlohmann::json j = nlohmann::json::parse(jsonText);
    auto r = parseSaveJson(j, nowUnixSeconds);
    r.loaded = true;
    return r;
  } catch (const std::exception& e) {
    auto r = defaultSave(nowUnixSeconds);
    r.error = std::string("Failed to parse save: ") + e.what();
    return r;
  }
}

std::string saveToJsonString(const SaveData& data, int indent) {
  try {
    const nlohmann::json j = saveDataToJson(data);
    return j.dump(indent) + "\n";
  } catch (...) {
    return "{}\n";
  }
}

bool writeSaveAtomic(const std::string& path, const SaveData& data) {
  try {
    std::filesystem::create_directories(std::filesystem::path(path).parent_path());

    nlohmann::json j = saveDataToJson(data);

    const std::string tmp = tmpPathFor(path);
    {
      std::ofstream out(tmp, std::ios::binary | std::ios::trunc);
      if (!out.is_open()) {
        return false;
      }
      out << j.dump(2) << "\n";
    }

    std::filesystem::rename(tmp, path);
    return true;
  } catch (...) {
    return false;
  }
}

SaveData toSaveData(const PetSim& sim, std::int64_t createdAtUnixSeconds, std::int64_t lastMonthlyTickAtUnixSeconds,
                    std::int64_t lastSimUpdateUnixSeconds, int ageMonths, int careMistakesTotal, int careMistakesThisMonth,
                    std::uint32_t rngState, int bezelPaletteIndex, bool introSeen) {
  SaveData d;
  d.schemaVersion = 6;
  d.createdAtUnixSeconds = createdAtUnixSeconds;
  d.lastMonthlyTickAtUnixSeconds = lastMonthlyTickAtUnixSeconds;
  d.lastSimUpdateUnixSeconds = lastSimUpdateUnixSeconds;
  d.ageMonths = ageMonths;
  d.introSeen = introSeen;
  d.careMistakesTotal = careMistakesTotal;
  d.careMistakesThisMonth = careMistakesThisMonth;
  d.rngState = rngState;
  d.bezelPaletteIndex = bezelPaletteIndex;
  d.lightsOn = sim.lightsOn;
  d.sleeping = sim.sleeping;
  d.isDead = sim.isDead;
  d.illnessActive = sim.illnessActive;
  d.illnessId = sim.illnessId;
  d.illnessSeverity = sim.illnessSeverity;
  d.illnessSymptomatic = sim.illnessSymptomatic;
  d.illnessWarning = sim.illnessWarning;
  d.illnessLastUpdateUnixSeconds = sim.illnessLastUpdateUnixSeconds;
  d.illnessTreatedUntilUnixSeconds = sim.illnessTreatedUntilUnixSeconds;
  d.illnessTerminalAtOrAboveStartUnixSeconds = sim.illnessTerminalAtOrAboveStartUnixSeconds;
  d.illnessDeathAtUnixSeconds = sim.illnessDeathAtUnixSeconds;
  d.illnessWarningStartUnixSeconds = sim.illnessWarningStartUnixSeconds;
  d.lastMedicineDoseUnixSeconds = sim.lastMedicineDoseUnixSeconds;
  d.hunger = sim.hunger;
  d.happiness = sim.happiness;
  d.energy = sim.energy;
  return d;
}

void applySaveData(PetSim& sim, const SaveData& data) {
  sim.hunger = data.hunger;
  sim.happiness = data.happiness;
  sim.energy = data.energy;

  sim.lightsOn = data.lightsOn;
  sim.sleeping = data.sleeping;

  sim.isDead = data.isDead;
  sim.illnessActive = data.illnessActive;
  sim.illnessId = data.illnessId;
  sim.illnessSeverity = data.illnessSeverity;
  sim.illnessSymptomatic = data.illnessSymptomatic;
  sim.illnessWarning = data.illnessWarning;
  sim.illnessLastUpdateUnixSeconds = data.illnessLastUpdateUnixSeconds;
  sim.illnessTreatedUntilUnixSeconds = data.illnessTreatedUntilUnixSeconds;
  sim.illnessTerminalAtOrAboveStartUnixSeconds = data.illnessTerminalAtOrAboveStartUnixSeconds;
  sim.illnessDeathAtUnixSeconds = data.illnessDeathAtUnixSeconds;
  sim.illnessWarningStartUnixSeconds = data.illnessWarningStartUnixSeconds;
  sim.lastMedicineDoseUnixSeconds = data.lastMedicineDoseUnixSeconds;
}
