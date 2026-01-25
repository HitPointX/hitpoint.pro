#pragma once

#include "game_rules.h"

#include <cstdint>
#include <string>

struct IllnessDef;
struct Rng32;

enum class AttentionReason : std::uint8_t {
  None = 0,
  HungerLow = 1 << 0,
  HappinessLow = 1 << 1,
  EnergyLow = 1 << 2,
  Illness = 1 << 3,
  Lights = 1 << 4,
};

inline AttentionReason operator|(AttentionReason a, AttentionReason b) {
  return static_cast<AttentionReason>(static_cast<std::uint8_t>(a) | static_cast<std::uint8_t>(b));
}

inline AttentionReason operator&(AttentionReason a, AttentionReason b) {
  return static_cast<AttentionReason>(static_cast<std::uint8_t>(a) & static_cast<std::uint8_t>(b));
}

inline bool any(AttentionReason r) {
  return static_cast<std::uint8_t>(r) != 0;
}

struct PetSim {
  float hunger = 80.0f;
  float happiness = 80.0f;
  float energy = 80.0f;

  // Lights / sleep
  bool lightsOn = true;
  bool sleeping = false;

  // Life / illness
  bool isDead = false;

  bool illnessActive = false;
  std::string illnessId;
  float illnessSeverity = 0.0f; // 0..100
  bool illnessSymptomatic = false;
  bool illnessWarning = false;

  std::int64_t illnessLastUpdateUnixSeconds = 0;
  std::int64_t illnessTreatedUntilUnixSeconds = 0;
  std::int64_t illnessTerminalAtOrAboveStartUnixSeconds = 0;
  std::int64_t illnessDeathAtUnixSeconds = 0;
  std::int64_t illnessWarningStartUnixSeconds = 0;
  std::int64_t lastMedicineDoseUnixSeconds = 0;

  bool medicineRequested = false;

  bool attentionCall = false;
  AttentionReason attentionReasons = AttentionReason::None;

  // Transition flags set during update(); clear after consumption.
  bool attentionJustRaised = false;
  bool attentionJustCleared = false;
  AttentionReason attentionReasonsAdded = AttentionReason::None;

  void update(float dtSeconds, const GameRules& rules);
  void recomputeAttention(const GameRules& rules);

  void startIllness(const IllnessDef& def, std::int64_t nowUnixSeconds, float initialSeverity);
  void clearIllness();
  void updateIllness(std::int64_t nowUnixSeconds, const IllnessDef& def, Rng32& rng);

  enum class MedicineResult : std::uint8_t {
    NotSick,
    Cooldown,
    Failed,
    Succeeded,
    Managed,
  };

  MedicineResult giveMedicine(std::int64_t nowUnixSeconds, const IllnessDef& def, Rng32& rng);
  bool consumeMedicineRequest();

  void clearAttentionTransitions();

  // Actions
  void feedMeal(const GameRules& rules);
  void play(const GameRules& rules);
};
