#include "illness_db.h"

#include <fstream>
#include <stdexcept>

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

void parseIllnessDbJson(const nlohmann::json& j, IllnessDB& outDb) {
  if (!j.contains("illnesses") || !j["illnesses"].is_array()) {
    throw std::runtime_error("Missing illnesses[]");
  }

  for (const auto& it : j["illnesses"]) {
    IllnessDef def;
    maybeAssign(it, "illnessId", def.illnessId);
    maybeAssign(it, "displayName", def.displayName);

    if (it.contains("onset")) {
      const auto& onset = it["onset"];
      maybeAssign(onset, "baseMonthlyProbability", def.baseMonthlyProbability);
      maybeAssign(onset, "ageYearsMin", def.ageYearsMin);
      maybeAssign(onset, "ageYearsMax", def.ageYearsMax);
      if (onset.contains("careModifiers")) {
        const auto& cm = onset["careModifiers"];
        maybeAssign(cm, "perCareMistake", def.perCareMistake);
      }
    }

    if (it.contains("progression")) {
      const auto& prog = it["progression"];
      maybeAssign(prog, "severityIncreasePerDayUntreated", def.severityIncreasePerDayUntreated);
      maybeAssign(prog, "severityDecreasePerDayTreated", def.severityDecreasePerDayTreated);

      if (prog.contains("symptomatic")) {
        const auto& sym = prog["symptomatic"];
        maybeAssign(sym, "startsAtSeverity", def.symptomaticStartsAtSeverity);
      }

      if (prog.contains("terminal")) {
        const auto& term = prog["terminal"];
        maybeAssign(term, "startsAtSeverity", def.terminalStartsAtSeverity);
        maybeAssign(term, "deathAfterDaysAtOrAbove", def.deathAfterDaysAtOrAbove);
        if (term.contains("warningDaysRange") && term["warningDaysRange"].is_array() && term["warningDaysRange"].size() == 2) {
          def.warningDaysMin = term["warningDaysRange"][0].get<int>();
          def.warningDaysMax = term["warningDaysRange"][1].get<int>();
        }
      }
    }

    if (it.contains("treatment")) {
      const auto& tr = it["treatment"];
      maybeAssign(tr, "medicineDoseSeverityDelta", def.medicineDoseSeverityDelta);
      maybeAssign(tr, "cooldownSeconds", def.medicineCooldownSeconds);
      maybeAssign(tr, "successChanceAtLowSeverity", def.successChanceAtLowSeverity);
      maybeAssign(tr, "successChanceAtHighSeverity", def.successChanceAtHighSeverity);
      maybeAssign(tr, "managesButRarelyCures", def.managesButRarelyCures);
    }

    if (!def.illnessId.empty()) {
      outDb.illnesses.push_back(def);
    }
  }
}

} // namespace

const IllnessDef* IllnessDB::findById(const std::string& id) const {
  for (const auto& ill : illnesses) {
    if (ill.illnessId == id) {
      return &ill;
    }
  }
  return nullptr;
}

IllnessDBLoadResult loadIllnessDBFromFile(const std::string& path) {
  IllnessDBLoadResult result;

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
    parseIllnessDbJson(j, result.db);

    result.loadedFromFile = true;
    return result;
  } catch (const std::exception& e) {
    result.error = std::string("JSON schema mismatch: ") + e.what();
    return result;
  }
}

IllnessDBLoadResult loadIllnessDBFromJsonString(const std::string& jsonText) {
  IllnessDBLoadResult result;
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
    parseIllnessDbJson(j, result.db);
    result.loadedFromFile = true;
    return result;
  } catch (const std::exception& e) {
    result.error = std::string("JSON schema mismatch: ") + e.what();
    return result;
  }
}
