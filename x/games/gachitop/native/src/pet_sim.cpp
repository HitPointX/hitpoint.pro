#include "pet_sim.h"

#include "illness_db.h"
#include "rng.h"

#include <algorithm>

namespace {

float clampMeter(float v) {
  return std::clamp(v, 0.0f, 100.0f);
}

double clamp01d(double v) {
  if (v < 0.0) return 0.0;
  if (v > 1.0) return 1.0;
  return v;
}

double lerp(double a, double b, double t) {
  return a + (b - a) * t;
}

} // namespace

void PetSim::update(float dtSeconds, const GameRules& rules) {
  clearAttentionTransitions();

  if (isDead) {
    sleeping = false;
    attentionCall = false;
    attentionReasons = AttentionReason::None;
    return;
  }

  // Lights + sleep state machine.
  // - lightsOn=true -> awake
  // - lightsOn=false -> if tired, sleep; if not tired, complain (attention reason)
  if (lightsOn) {
    sleeping = false;
  } else {
    if (!sleeping && energy <= static_cast<float>(rules.sleepTiredAtEnergy)) {
      sleeping = true;
    }
  }

  const float dtHours = dtSeconds / 3600.0f;

  if (sleeping) {
    // Slower decay while sleeping; energy restores.
    const float hMul = rules.hungerDecayMultiplierSleeping;
    const float haMul = rules.happinessDecayMultiplierSleeping;
    const float eMul = rules.energyDecayMultiplierSleeping;

    hunger = clampMeter(hunger - (rules.hungerDecayPerHourAwake * hMul * dtHours));
    happiness = clampMeter(happiness - (rules.happinessDecayPerHourAwake * haMul * dtHours));
    energy = clampMeter(energy - (rules.energyDecayPerHourAwake * eMul * dtHours));
    energy = clampMeter(energy + (rules.sleepEnergyRestorePerHour * dtHours));

    if (energy >= static_cast<float>(rules.sleepAutoWakeAtEnergy)) {
      sleeping = false;
      // Note: lights remain off; the pet will complain until turned on.
    }
  } else {
    hunger = clampMeter(hunger - (rules.hungerDecayPerHourAwake * dtHours));
    happiness = clampMeter(happiness - (rules.happinessDecayPerHourAwake * dtHours));
    energy = clampMeter(energy - (rules.energyDecayPerHourAwake * dtHours));
  }

  recomputeAttention(rules);
}

void PetSim::recomputeAttention(const GameRules& rules) {
  const bool prevCall = attentionCall;
  const AttentionReason prevReasons = attentionReasons;

  AttentionReason reasons = AttentionReason::None;
  if (hunger <= static_cast<float>(rules.hungerAttentionThreshold)) {
    reasons = reasons | AttentionReason::HungerLow;
  }
  if (happiness <= static_cast<float>(rules.happinessAttentionThreshold)) {
    reasons = reasons | AttentionReason::HappinessLow;
  }
  if (energy <= static_cast<float>(rules.energyAttentionThreshold)) {
    reasons = reasons | AttentionReason::EnergyLow;
  }

  if (illnessSymptomatic || illnessWarning) {
    reasons = reasons | AttentionReason::Illness;
  }

  // Lights complaint: if the light is off and we're not sleeping, we want attention.
  if (!lightsOn && !sleeping) {
    reasons = reasons | AttentionReason::Lights;
  }

  attentionReasons = reasons;
  attentionCall = any(reasons);

  if (!prevCall && attentionCall) {
    attentionJustRaised = true;
    attentionReasonsAdded = reasons;
  } else if (prevCall && !attentionCall) {
    attentionJustCleared = true;
  } else if (prevCall && attentionCall) {
    // Reasons changed while still calling attention.
    const std::uint8_t added = static_cast<std::uint8_t>(reasons) & ~static_cast<std::uint8_t>(prevReasons);
    attentionReasonsAdded = static_cast<AttentionReason>(added);
  }
}

void PetSim::startIllness(const IllnessDef& def, std::int64_t nowUnixSeconds, float initialSeverity) {
  if (isDead) {
    return;
  }
  illnessActive = true;
  illnessId = def.illnessId;
  illnessSeverity = clampMeter(initialSeverity);
  illnessLastUpdateUnixSeconds = nowUnixSeconds;
  illnessTreatedUntilUnixSeconds = 0;
  illnessTerminalAtOrAboveStartUnixSeconds = 0;
  illnessDeathAtUnixSeconds = 0;
  illnessWarningStartUnixSeconds = 0;
  illnessSymptomatic = (illnessSeverity >= static_cast<float>(def.symptomaticStartsAtSeverity));
  illnessWarning = false;
}

void PetSim::clearIllness() {
  illnessActive = false;
  illnessId.clear();
  illnessSeverity = 0.0f;
  illnessSymptomatic = false;
  illnessWarning = false;
  illnessLastUpdateUnixSeconds = 0;
  illnessTreatedUntilUnixSeconds = 0;
  illnessTerminalAtOrAboveStartUnixSeconds = 0;
  illnessDeathAtUnixSeconds = 0;
  illnessWarningStartUnixSeconds = 0;
  lastMedicineDoseUnixSeconds = 0;
}

void PetSim::updateIllness(std::int64_t nowUnixSeconds, const IllnessDef& def, Rng32& rng) {
  if (isDead || !illnessActive) {
    return;
  }

  if (illnessLastUpdateUnixSeconds == 0) {
    illnessLastUpdateUnixSeconds = nowUnixSeconds;
  }

  const std::int64_t elapsedSec = nowUnixSeconds - illnessLastUpdateUnixSeconds;
  if (elapsedSec <= 0) {
    // Still update warning/death gates with current time.
  } else {
    const double days = static_cast<double>(elapsedSec) / 86400.0;
    const bool treated = (illnessTreatedUntilUnixSeconds != 0) && (nowUnixSeconds <= illnessTreatedUntilUnixSeconds);

    if (treated) {
      illnessSeverity = clampMeter(illnessSeverity - static_cast<float>(def.severityDecreasePerDayTreated * days));
    } else {
      illnessSeverity = clampMeter(illnessSeverity + static_cast<float>(def.severityIncreasePerDayUntreated * days));
    }

    illnessLastUpdateUnixSeconds = nowUnixSeconds;
  }

  illnessSymptomatic = (illnessSeverity >= static_cast<float>(def.symptomaticStartsAtSeverity));

  // Terminal scheduling: only while severity stays at/above the terminal threshold.
  if (illnessSeverity >= static_cast<float>(def.terminalStartsAtSeverity)) {
    if (illnessTerminalAtOrAboveStartUnixSeconds == 0) {
      illnessTerminalAtOrAboveStartUnixSeconds = nowUnixSeconds;
      illnessDeathAtUnixSeconds = illnessTerminalAtOrAboveStartUnixSeconds +
                                 static_cast<std::int64_t>(def.deathAfterDaysAtOrAbove) * 86400;

      const int warningDays = rng.rangeIntInclusive(def.warningDaysMin, def.warningDaysMax);
      illnessWarningStartUnixSeconds = illnessDeathAtUnixSeconds - static_cast<std::int64_t>(warningDays) * 86400;
      if (illnessWarningStartUnixSeconds < illnessTerminalAtOrAboveStartUnixSeconds) {
        illnessWarningStartUnixSeconds = illnessTerminalAtOrAboveStartUnixSeconds;
      }
    }
  } else {
    illnessTerminalAtOrAboveStartUnixSeconds = 0;
    illnessDeathAtUnixSeconds = 0;
    illnessWarningStartUnixSeconds = 0;
    illnessWarning = false;
  }

  if (illnessWarningStartUnixSeconds != 0 && nowUnixSeconds >= illnessWarningStartUnixSeconds) {
    illnessWarning = true;
  }

  if (illnessDeathAtUnixSeconds != 0 && nowUnixSeconds >= illnessDeathAtUnixSeconds) {
    isDead = true;
    attentionCall = false;
    attentionReasons = AttentionReason::None;
    return;
  }

  // Cured if severity bottoms out (unless this illness is meant to be chronic-managed).
  if (!def.managesButRarelyCures && illnessSeverity <= 0.01f) {
    clearIllness();
  }
}

PetSim::MedicineResult PetSim::giveMedicine(std::int64_t nowUnixSeconds, const IllnessDef& def, Rng32& rng) {
  if (isDead || !illnessActive) {
    return MedicineResult::NotSick;
  }

  if (lastMedicineDoseUnixSeconds != 0) {
    const std::int64_t cd = static_cast<std::int64_t>(def.medicineCooldownSeconds);
    if (cd > 0 && (nowUnixSeconds - lastMedicineDoseUnixSeconds) < cd) {
      return MedicineResult::Cooldown;
    }
  }

  lastMedicineDoseUnixSeconds = nowUnixSeconds;

  const double sev01 = clamp01d(static_cast<double>(illnessSeverity) / 100.0);
  const double chance = lerp(def.successChanceAtLowSeverity, def.successChanceAtHighSeverity, sev01);
  const bool ok = rng.nextFloat01() < static_cast<float>(clamp01d(chance));

  if (!ok) {
    return MedicineResult::Failed;
  }

  illnessSeverity = clampMeter(illnessSeverity + static_cast<float>(def.medicineDoseSeverityDelta));
  illnessTreatedUntilUnixSeconds = nowUnixSeconds + 86400; // one day of "treated" decay

  illnessSymptomatic = (illnessSeverity >= static_cast<float>(def.symptomaticStartsAtSeverity));
  if (illnessSeverity < static_cast<float>(def.terminalStartsAtSeverity)) {
    illnessTerminalAtOrAboveStartUnixSeconds = 0;
    illnessDeathAtUnixSeconds = 0;
    illnessWarningStartUnixSeconds = 0;
    illnessWarning = false;
  }

  // If this is chronic-managed, avoid full cure.
  if (def.managesButRarelyCures && illnessSeverity <= 0.01f) {
    illnessSeverity = 5.0f;
    return MedicineResult::Managed;
  }

  if (illnessSeverity <= 0.01f) {
    clearIllness();
    return MedicineResult::Succeeded;
  }

  return MedicineResult::Succeeded;
}

bool PetSim::consumeMedicineRequest() {
  if (!medicineRequested) {
    return false;
  }
  medicineRequested = false;
  return true;
}

void PetSim::clearAttentionTransitions() {
  attentionJustRaised = false;
  attentionJustCleared = false;
  attentionReasonsAdded = AttentionReason::None;
}

void PetSim::feedMeal(const GameRules& rules) {
  hunger = clampMeter(hunger + rules.mealHungerDelta);
  happiness = clampMeter(happiness + rules.mealHappinessDelta);
  recomputeAttention(rules);
}

void PetSim::play(const GameRules& rules) {
  happiness = clampMeter(happiness + rules.playHappinessDelta);
  energy = clampMeter(energy + rules.playEnergyDelta);
  recomputeAttention(rules);
}
