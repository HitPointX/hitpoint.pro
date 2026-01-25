#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include <emscripten/emscripten.h>

#include "game_rules.h"
#include "illness_db.h"
#include "lcd_buffer.h"
#include "pet_sim.h"
#include "rng.h"
#include "save_system.h"
#include "ui.h"

namespace {

constexpr int kLcdW = 160;
constexpr int kLcdH = 160;

constexpr std::uint8_t kBgR = 0xC7;
constexpr std::uint8_t kBgG = 0xD9;
constexpr std::uint8_t kBgB = 0xB7;
constexpr std::uint8_t kFgR = 0x2A;
constexpr std::uint8_t kFgG = 0x3D;
constexpr std::uint8_t kFgB = 0x2A;

float clamp01(float v) {
  if (v < 0.0f) return 0.0f;
  if (v > 1.0f) return 1.0f;
  return v;
}

std::uint8_t clampU8(int v) {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return static_cast<std::uint8_t>(v);
}

std::uint8_t applyMul(std::uint8_t c, float m) {
  return clampU8(static_cast<int>(static_cast<float>(c) * m));
}

struct OfflineCatchupResult {
  std::int64_t appliedSeconds = 0;
  int careMistakesAdded = 0;
  bool diedFromNeglect = false;
};

OfflineCatchupResult applyOfflineCatchup(PetSim& sim, const GameRules& rules, std::int64_t nowUnixSeconds,
                                        std::int64_t lastSimUpdateUnixSeconds, int& careMistakesThisMonth) {
  OfflineCatchupResult out;
  if (sim.isDead) {
    return out;
  }
  if (lastSimUpdateUnixSeconds <= 0) {
    return out;
  }

  std::int64_t elapsedSec = nowUnixSeconds - lastSimUpdateUnixSeconds;
  if (elapsedSec <= 0) {
    return out;
  }

  const std::int64_t maxCatchup = (rules.offlineSimMaxCatchupSeconds > 0)
                                   ? static_cast<std::int64_t>(rules.offlineSimMaxCatchupSeconds)
                                   : elapsedSec;
  if (elapsedSec > maxCatchup) {
    elapsedSec = maxCatchup;
  }
  out.appliedSeconds = elapsedSec;

  const double elapsedHours = static_cast<double>(elapsedSec) / 3600.0;

  const double hungerStart = sim.hunger;
  const double happinessStart = sim.happiness;
  const double energyStart = sim.energy;

  auto belowCriticalHours = [](double initial, double decayPerHour, double critical, double hours) -> double {
    if (hours <= 0.0) return 0.0;
    if (decayPerHour <= 0.0) {
      return (initial <= critical) ? hours : 0.0;
    }
    if (initial <= critical) {
      return hours;
    }
    const double timeToCritical = (initial - critical) / decayPerHour;
    const double below = hours - timeToCritical;
    return (below > 0.0) ? below : 0.0;
  };

  auto timeToThresholdHours = [](double initial, double decayPerHour, double threshold) -> double {
    if (decayPerHour <= 0.0) {
      return (initial <= threshold) ? 0.0 : 1e30;
    }
    if (initial <= threshold) {
      return 0.0;
    }
    return (initial - threshold) / decayPerHour;
  };

  double hungerBelowCritical = 0.0;
  double energyBelowCritical = 0.0;

  auto clampMeter = [](float v) -> float {
    if (v < 0.0f) return 0.0f;
    if (v > 100.0f) return 100.0f;
    return v;
  };

  auto applySegment = [&](double dtHours, double hungerDecayPerHour, double happinessDecayPerHour,
                          double energyDecayPerHour, double energyRestorePerHour) {
    if (dtHours <= 0.0) {
      return;
    }

    const double hunger0 = sim.hunger;
    const double energy0 = sim.energy;

    sim.hunger = clampMeter(sim.hunger - static_cast<float>(hungerDecayPerHour * dtHours));
    sim.happiness = clampMeter(sim.happiness - static_cast<float>(happinessDecayPerHour * dtHours));
    sim.energy = clampMeter(sim.energy - static_cast<float>(energyDecayPerHour * dtHours) +
                            static_cast<float>(energyRestorePerHour * dtHours));

    if (rules.hungerCriticalFatalAfterHours > 0) {
      hungerBelowCritical += belowCriticalHours(hunger0, hungerDecayPerHour, rules.hungerCriticalRange, dtHours);
    }
    if (rules.energyCriticalFatalAfterHours > 0 && energyDecayPerHour > 0.0) {
      energyBelowCritical += belowCriticalHours(energy0, energyDecayPerHour, rules.energyCriticalRange, dtHours);
    }
  };

  double remainingHours = elapsedHours;

  if (!sim.lightsOn && !sim.isDead) {
    if (!sim.sleeping && sim.energy <= static_cast<float>(rules.sleepTiredAtEnergy)) {
      sim.sleeping = true;
    }

    while (remainingHours > 0.0 && !sim.isDead) {
      if (sim.sleeping) {
        const double hDecay = rules.hungerDecayPerHourAwake * rules.hungerDecayMultiplierSleeping;
        const double haDecay = rules.happinessDecayPerHourAwake * rules.happinessDecayMultiplierSleeping;
        const double eDecay = rules.energyDecayPerHourAwake * rules.energyDecayMultiplierSleeping;
        const double restore = rules.sleepEnergyRestorePerHour;
        const double netRestore = restore - eDecay;

        double dt = remainingHours;
        if (netRestore > 0.0) {
          const double need = static_cast<double>(rules.sleepAutoWakeAtEnergy) - static_cast<double>(sim.energy);
          const double tWake = (need <= 0.0) ? 0.0 : (need / netRestore);
          if (tWake <= 0.0) {
            sim.sleeping = false;
            continue;
          }
          if (tWake < dt) {
            dt = tWake;
          }
        }

        applySegment(dt, hDecay, haDecay, eDecay, restore);
        remainingHours -= dt;

        if (netRestore > 0.0 && sim.energy >= static_cast<float>(rules.sleepAutoWakeAtEnergy)) {
          sim.sleeping = false;
        }
      } else {
        const double hDecay = rules.hungerDecayPerHourAwake;
        const double haDecay = rules.happinessDecayPerHourAwake;
        const double eDecay = rules.energyDecayPerHourAwake;

        double dt = remainingHours;
        if (eDecay > 0.0) {
          const double need = static_cast<double>(sim.energy) - static_cast<double>(rules.sleepTiredAtEnergy);
          const double tSleep = (need <= 0.0) ? 0.0 : (need / eDecay);
          if (tSleep <= 0.0) {
            sim.sleeping = true;
            continue;
          }
          if (tSleep < dt) {
            dt = tSleep;
          }
        }

        applySegment(dt, hDecay, haDecay, eDecay, 0.0);
        remainingHours -= dt;

        if (sim.energy <= static_cast<float>(rules.sleepTiredAtEnergy)) {
          sim.sleeping = true;
        }
      }
    }
  } else {
    applySegment(remainingHours, rules.hungerDecayPerHourAwake, rules.happinessDecayPerHourAwake,
                 rules.energyDecayPerHourAwake, 0.0);
    remainingHours = 0.0;
    sim.sleeping = false;
  }

  if (!sim.isDead && rules.hungerCriticalFatalAfterHours > 0) {
    if (hungerBelowCritical >= static_cast<double>(rules.hungerCriticalFatalAfterHours)) {
      sim.isDead = true;
      out.diedFromNeglect = true;
    }
  }
  if (!sim.isDead && rules.energyCriticalFatalAfterHours > 0) {
    if (energyBelowCritical >= static_cast<double>(rules.energyCriticalFatalAfterHours)) {
      sim.isDead = true;
      out.diedFromNeglect = true;
    }
  }

  sim.recomputeAttention(rules);

  if (!sim.isDead && rules.careMistakesEnabled && sim.lightsOn) {
    const std::int64_t graceSec = static_cast<std::int64_t>(rules.careMistakeGraceMinutes) * 60;
    if (graceSec > 0) {
      const double tHunger =
        timeToThresholdHours(hungerStart, rules.hungerDecayPerHourAwake, rules.hungerAttentionThreshold);
      const double tHappy =
        timeToThresholdHours(happinessStart, rules.happinessDecayPerHourAwake, rules.happinessAttentionThreshold);
      const double tEnergy =
        timeToThresholdHours(energyStart, rules.energyDecayPerHourAwake, rules.energyAttentionThreshold);
      double tStart = tHunger;
      if (tHappy < tStart) tStart = tHappy;
      if (tEnergy < tStart) tStart = tEnergy;

      const double attentionHours = elapsedHours - tStart;
      if (tStart <= elapsedHours && attentionHours > 0.0) {
        const double attentionSec = attentionHours * 3600.0;
        if (attentionSec >= static_cast<double>(graceSec)) {
          careMistakesThisMonth += 1;
          out.careMistakesAdded = 1;
        }
      }
    }
  }

  return out;
}

struct WebState {
  bool initialized = false;

  GameRules rules;
  IllnessDB illnessDb;

  PetSim sim;
  UIModel ui;
  LCDBuffer lcd = LCDBuffer(kLcdW, kLcdH);
  std::vector<std::uint8_t> rgba;

  int pendingInputMask = 0;

  std::int64_t createdAtUnixSeconds = 0;
  std::int64_t lastMonthlyTickAtUnixSeconds = 0;
  std::int64_t lastSimUpdateUnixSeconds = 0;
  int ageMonths = 0;
  bool introSeen = true;
  int careMistakesTotal = 0;
  int careMistakesThisMonth = 0;

  std::int64_t attentionEpisodeStartUnixSeconds = 0;
  bool careMistakeCountedThisEpisode = false;

  Rng32 rng;
  Rng32 uiRng;

  std::string saveJsonScratch;
};

WebState g;

void renderToRgba(std::uint32_t /*nowTicks*/) {
  g.rgba.resize(static_cast<size_t>(kLcdW * kLcdH * 4));
  const float dim = g.sim.lightsOn ? 1.0f : 0.25f;

  for (int y = 0; y < g.lcd.height; ++y) {
    for (int x = 0; x < g.lcd.width; ++x) {
      const std::uint8_t v = g.lcd.get(x, y);
      std::uint8_t r = (v == 0) ? kBgR : kFgR;
      std::uint8_t gg = (v == 0) ? kBgG : kFgG;
      std::uint8_t b = (v == 0) ? kBgB : kFgB;

      r = applyMul(r, dim);
      gg = applyMul(gg, dim);
      b = applyMul(b, dim);

      const size_t idx = static_cast<size_t>((y * g.lcd.width + x) * 4);
      g.rgba[idx + 0] = r;
      g.rgba[idx + 1] = gg;
      g.rgba[idx + 2] = b;
      g.rgba[idx + 3] = 0xFF;
    }
  }
}

void applyMonthlyTicks(std::int64_t nowSec, std::uint32_t nowTicks) {
  const std::int64_t tickSeconds = static_cast<std::int64_t>(g.rules.monthlyTickHours) * 60 * 60;
  if (tickSeconds <= 0) return;

  while ((nowSec - g.lastMonthlyTickAtUnixSeconds) >= tickSeconds) {
    g.lastMonthlyTickAtUnixSeconds += tickSeconds;
    g.ageMonths += 1;

    // Illness onset roll (simple acute onset). Uses the just-finished month's care mistakes.
    if (!g.sim.isDead && !g.sim.illnessActive && !g.illnessDb.illnesses.empty()) {
      const int ageYears = g.ageMonths / 12;
      for (const auto& def : g.illnessDb.illnesses) {
        if (ageYears < def.ageYearsMin || ageYears > def.ageYearsMax) {
          continue;
        }
        double p = def.baseMonthlyProbability + static_cast<double>(g.careMistakesThisMonth) * def.perCareMistake;
        if (p < 0.0) p = 0.0;
        if (p > 1.0) p = 1.0;
        if (g.rng.nextFloat01() < static_cast<float>(p)) {
          g.sim.startIllness(def, nowSec, 5.0f);
          g.sim.recomputeAttention(g.rules);
          g.ui.toast = "Sick";
          g.ui.toastUntilTicks = nowTicks + 900u;
          break;
        }
      }
    }

    g.careMistakesTotal += g.careMistakesThisMonth;
    g.careMistakesThisMonth = 0;

    g.ui.toast = "Month+";
    g.ui.toastUntilTicks = nowTicks + 900u;
  }
}

void updateCareMistakes(std::int64_t nowSec, std::uint32_t nowTicks) {
  if (!g.rules.careMistakesEnabled) return;
  const std::int64_t graceSec = static_cast<std::int64_t>(g.rules.careMistakeGraceMinutes) * 60;

  if (g.sim.attentionCall) {
    if (g.attentionEpisodeStartUnixSeconds == 0) {
      g.attentionEpisodeStartUnixSeconds = nowSec;
      g.careMistakeCountedThisEpisode = false;
    }
    if (!g.careMistakeCountedThisEpisode && graceSec > 0 &&
        (nowSec - g.attentionEpisodeStartUnixSeconds) >= graceSec) {
      g.careMistakesThisMonth += 1;
      g.careMistakeCountedThisEpisode = true;
      g.ui.toast = "CM";
      g.ui.toastUntilTicks = nowTicks + 900u;
    }
  } else {
    g.attentionEpisodeStartUnixSeconds = 0;
    g.careMistakeCountedThisEpisode = false;
  }
}

void processMedicine(std::int64_t nowSec, std::uint32_t nowTicks) {
  if (!g.sim.consumeMedicineRequest()) return;

  if (g.sim.isDead) {
    g.ui.toast = "RIP";
    g.ui.toastUntilTicks = nowTicks + 900u;
    return;
  }
  if (!g.sim.illnessActive) {
    g.ui.toast = "OK";
    g.ui.toastUntilTicks = nowTicks + 700u;
    return;
  }

  const IllnessDef* def = g.illnessDb.findById(g.sim.illnessId);
  if (def == nullptr) {
    g.ui.toast = "?";
    g.ui.toastUntilTicks = nowTicks + 700u;
    return;
  }

  const auto res = g.sim.giveMedicine(nowSec, *def, g.rng);
  switch (res) {
    case PetSim::MedicineResult::NotSick:
      g.ui.toast = "OK";
      g.ui.toastUntilTicks = nowTicks + 700u;
      break;
    case PetSim::MedicineResult::Cooldown:
      g.ui.toast = "CD";
      g.ui.toastUntilTicks = nowTicks + 700u;
      break;
    case PetSim::MedicineResult::Failed:
      g.ui.toast = "NO";
      g.ui.toastUntilTicks = nowTicks + 900u;
      break;
    case PetSim::MedicineResult::Managed:
      g.ui.toast = "MG";
      g.ui.toastUntilTicks = nowTicks + 900u;
      break;
    case PetSim::MedicineResult::Succeeded:
      g.ui.toast = "CURE";
      g.ui.toastUntilTicks = nowTicks + 900u;
      break;
  }
}

void updateIllness(std::int64_t nowSec) {
  if (g.sim.isDead || !g.sim.illnessActive || g.illnessDb.illnesses.empty()) return;
  const IllnessDef* def = g.illnessDb.findById(g.sim.illnessId);
  if (def == nullptr) {
    g.sim.clearIllness();
  } else {
    g.sim.updateIllness(nowSec, *def, g.rng);
  }
  g.sim.recomputeAttention(g.rules);
}

SaveLoadResult loadSaveFromJsonOrDefault(const char* saveJson, int saveLen, std::int64_t nowUnixSeconds) {
  if (saveJson == nullptr || saveLen <= 0) {
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

  const std::string s(saveJson, saveJson + saveLen);
  return loadSaveFromJsonString(s, nowUnixSeconds);
}

} // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE int gch_init(const char* rulesJson, int rulesLen, const char* illnessJson, int illnessLen,
                                 const char* saveJson, int saveLen, double nowUnixSecondsF,
                                 std::uint32_t nowTicks) {
  try {
    const std::int64_t nowUnixSeconds = static_cast<std::int64_t>(nowUnixSecondsF);
    const std::string rulesText = (rulesJson && rulesLen > 0) ? std::string(rulesJson, rulesJson + rulesLen) : "";
    const std::string illnessText = (illnessJson && illnessLen > 0) ? std::string(illnessJson, illnessJson + illnessLen) : "";

    const auto rulesRes = loadGameRulesFromJsonString(rulesText);
    g.rules = rulesRes.rules;

    const auto illRes = loadIllnessDBFromJsonString(illnessText);
    g.illnessDb = illRes.db;

    g.sim = PetSim{};
    g.ui = UIModel{};
    g.lcd = LCDBuffer(kLcdW, kLcdH);
    g.lcd.clear(0);
    g.rgba.clear();
    g.attentionEpisodeStartUnixSeconds = 0;
    g.careMistakeCountedThisEpisode = false;
    g.saveJsonScratch.clear();

    const auto load = loadSaveFromJsonOrDefault(saveJson, saveLen, nowUnixSeconds);

    g.createdAtUnixSeconds = load.data.createdAtUnixSeconds;
    g.lastMonthlyTickAtUnixSeconds = load.data.lastMonthlyTickAtUnixSeconds;
    g.lastSimUpdateUnixSeconds = load.data.lastSimUpdateUnixSeconds;
    g.ageMonths = load.data.ageMonths;
    g.introSeen = load.data.introSeen;
    g.careMistakesTotal = load.data.careMistakesTotal;
    g.careMistakesThisMonth = load.data.careMistakesThisMonth;
    g.rng.state = load.data.rngState;
    g.uiRng.state = (load.data.rngState ^ 0x9E3779B9u) ? (load.data.rngState ^ 0x9E3779B9u) : 0xA5A5A5A5u;

    applySaveData(g.sim, load.data);

    if (!g.introSeen) {
      g.introSeen = true;
      g.ui.introActive = true;
      g.ui.introMessageIndex = 0;
      g.ui.introCharIndex = 0;
      g.ui.introNextCharTicks = nowTicks + 400u;
      g.ui.introHoldUntilTicks = 0;
      g.ui.introWrapped.clear();
    }

    // Offline catch-up
    {
      const auto r = applyOfflineCatchup(g.sim, g.rules, nowUnixSeconds, g.lastSimUpdateUnixSeconds, g.careMistakesThisMonth);
      if (r.appliedSeconds > 0) {
        g.lastSimUpdateUnixSeconds = nowUnixSeconds;
        if (r.careMistakesAdded > 0 && g.sim.attentionCall) {
          g.attentionEpisodeStartUnixSeconds = nowUnixSeconds;
          g.careMistakeCountedThisEpisode = true;
        }
      }
      g.lastSimUpdateUnixSeconds = nowUnixSeconds;
    }

    uiRender(g.ui, g.sim, g.ageMonths, g.careMistakesTotal, g.careMistakesThisMonth, g.lcd, nowTicks);
    renderToRgba(nowTicks);

    g.initialized = true;
    return 1;
  } catch (const std::exception& e) {
    std::fprintf(stderr, "[gachitop:web] init failed: %s\n", e.what());
    return 0;
  } catch (...) {
    std::fprintf(stderr, "[gachitop:web] init failed: unknown\n");
    return 0;
  }
}

EMSCRIPTEN_KEEPALIVE void gch_step(float dtSeconds, std::uint32_t nowTicks, double nowUnixSecondsF, int inputMask) {
  if (!g.initialized) return;
  const std::int64_t nowUnixSeconds = static_cast<std::int64_t>(nowUnixSecondsF);

  inputMask |= g.pendingInputMask;
  g.pendingInputMask = 0;

  UIInput in;
  in.pressA = (inputMask & 1) != 0;
  in.pressB = (inputMask & 2) != 0;
  in.pressC = (inputMask & 4) != 0;

  // UI first (can set actions/requests).
  uiUpdate(g.ui, in, g.sim, g.rules, nowTicks);

  // Medicine is applied outside UI (depends on illness DB + wall-clock).
  processMedicine(nowUnixSeconds, nowTicks);

  // Simulation step.
  g.sim.update(dtSeconds, g.rules);
  updateIllness(nowUnixSeconds);

  applyMonthlyTicks(nowUnixSeconds, nowTicks);
  updateCareMistakes(nowUnixSeconds, nowTicks);

  g.lastSimUpdateUnixSeconds = nowUnixSeconds;

  // Render.
  uiRender(g.ui, g.sim, g.ageMonths, g.careMistakesTotal, g.careMistakesThisMonth, g.lcd, nowTicks);
  renderToRgba(nowTicks);
}

EMSCRIPTEN_KEEPALIVE void gch_pointer_move(int lcdX, int lcdY) {
  if (!g.initialized) return;

  if (lcdX < 0 || lcdY < 0 || lcdX >= g.lcd.width || lcdY >= g.lcd.height) {
    g.ui.musicHover = false;
    g.ui.hoverActive = false;
    return;
  }

  g.ui.musicHover = uiHitTestMusicIcon(g.lcd.width, g.lcd.height, lcdX, lcdY);

  IconId hit = IconId::Feed;
  if (uiHitTestIconBar(g.lcd.width, g.lcd.height, lcdX, lcdY, hit)) {
    g.ui.hoverActive = true;
    g.ui.hoveredIcon = hit;
  } else {
    g.ui.hoverActive = false;
  }
}

EMSCRIPTEN_KEEPALIVE void gch_pointer_click(int lcdX, int lcdY, int button) {
  if (!g.initialized) return;

  if (lcdX < 0 || lcdY < 0 || lcdX >= g.lcd.width || lcdY >= g.lcd.height) {
    return;
  }

  // Toggle music icon with left click (UI-only; actual audio is handled elsewhere).
  if (button == 0 && uiHitTestMusicIcon(g.lcd.width, g.lcd.height, lcdX, lcdY)) {
    g.ui.musicEnabled = !g.ui.musicEnabled;
    return;
  }

  IconId hit = IconId::Feed;
  const bool onIcon = uiHitTestIconBar(g.lcd.width, g.lcd.height, lcdX, lcdY, hit);

  if (onIcon) {
    g.ui.selectedIcon = hit;
    // Web behavior: left OR right click activates, middle click backs out.
    if (button == 0 || button == 2) {
      g.pendingInputMask |= 2; // pressB
    } else if (button == 1) {
      g.pendingInputMask |= 4; // pressC
    }
  } else {
    if (button == 1) {
      g.pendingInputMask |= 4; // pressC
    }
  }
}

EMSCRIPTEN_KEEPALIVE const std::uint8_t* gch_rgba_ptr() {
  if (!g.initialized) return nullptr;
  return g.rgba.data();
}

EMSCRIPTEN_KEEPALIVE int gch_rgba_len() {
  return kLcdW * kLcdH * 4;
}

EMSCRIPTEN_KEEPALIVE void gch_reset(double nowUnixSecondsF, std::uint32_t nowTicks) {
  if (!g.initialized) return;
  const std::int64_t nowUnixSeconds = static_cast<std::int64_t>(nowUnixSecondsF);
  const auto load = loadSaveFromJsonOrDefault(nullptr, 0, nowUnixSeconds);

  g.sim = PetSim{};
  g.ui = UIModel{};
  g.lcd.clear(0);
  g.attentionEpisodeStartUnixSeconds = 0;
  g.careMistakeCountedThisEpisode = false;
  g.saveJsonScratch.clear();

  g.createdAtUnixSeconds = load.data.createdAtUnixSeconds;
  g.lastMonthlyTickAtUnixSeconds = load.data.lastMonthlyTickAtUnixSeconds;
  g.lastSimUpdateUnixSeconds = load.data.lastSimUpdateUnixSeconds;
  g.ageMonths = load.data.ageMonths;
  g.introSeen = load.data.introSeen;
  g.careMistakesTotal = load.data.careMistakesTotal;
  g.careMistakesThisMonth = load.data.careMistakesThisMonth;
  g.rng.state = load.data.rngState;
  g.uiRng.state = (load.data.rngState ^ 0x9E3779B9u) ? (load.data.rngState ^ 0x9E3779B9u) : 0xA5A5A5A5u;

  applySaveData(g.sim, load.data);

  if (!g.introSeen) {
    g.introSeen = true;
    g.ui.introActive = true;
    g.ui.introMessageIndex = 0;
    g.ui.introCharIndex = 0;
    g.ui.introNextCharTicks = nowTicks + 400u;
    g.ui.introHoldUntilTicks = 0;
    g.ui.introWrapped.clear();
  }

  uiRender(g.ui, g.sim, g.ageMonths, g.careMistakesTotal, g.careMistakesThisMonth, g.lcd, nowTicks);
  renderToRgba(nowTicks);
  g.initialized = true;
}

EMSCRIPTEN_KEEPALIVE int gch_load_save_json(const char* saveJson, int saveLen, double nowUnixSecondsF,
                                           std::uint32_t nowTicks) {
  if (!g.initialized) return 0;
  const std::int64_t nowUnixSeconds = static_cast<std::int64_t>(nowUnixSecondsF);
  // Keep rules/illness DB, just reload save-related state.
  const auto load = loadSaveFromJsonOrDefault(saveJson, saveLen, nowUnixSeconds);

  g.sim = PetSim{};
  g.ui = UIModel{};
  g.lcd.clear(0);
  g.attentionEpisodeStartUnixSeconds = 0;
  g.careMistakeCountedThisEpisode = false;
  g.saveJsonScratch.clear();

  g.createdAtUnixSeconds = load.data.createdAtUnixSeconds;
  g.lastMonthlyTickAtUnixSeconds = load.data.lastMonthlyTickAtUnixSeconds;
  g.lastSimUpdateUnixSeconds = load.data.lastSimUpdateUnixSeconds;
  g.ageMonths = load.data.ageMonths;
  g.introSeen = load.data.introSeen;
  g.careMistakesTotal = load.data.careMistakesTotal;
  g.careMistakesThisMonth = load.data.careMistakesThisMonth;
  g.rng.state = load.data.rngState;
  g.uiRng.state = (load.data.rngState ^ 0x9E3779B9u) ? (load.data.rngState ^ 0x9E3779B9u) : 0xA5A5A5A5u;

  applySaveData(g.sim, load.data);

  if (!g.introSeen) {
    g.introSeen = true;
    g.ui.introActive = true;
    g.ui.introMessageIndex = 0;
    g.ui.introCharIndex = 0;
    g.ui.introNextCharTicks = nowTicks + 400u;
    g.ui.introHoldUntilTicks = 0;
    g.ui.introWrapped.clear();
  }

  uiRender(g.ui, g.sim, g.ageMonths, g.careMistakesTotal, g.careMistakesThisMonth, g.lcd, nowTicks);
  renderToRgba(nowTicks);
  g.initialized = true;
  return 1;
}

EMSCRIPTEN_KEEPALIVE const char* gch_save_json_ptr() {
  if (!g.initialized) return "";
  const SaveData d = toSaveData(g.sim, g.createdAtUnixSeconds, g.lastMonthlyTickAtUnixSeconds, g.lastSimUpdateUnixSeconds,
                                g.ageMonths, g.careMistakesTotal, g.careMistakesThisMonth, g.rng.state, 0, g.introSeen);
  g.saveJsonScratch = saveToJsonString(d);
  return g.saveJsonScratch.c_str();
}

EMSCRIPTEN_KEEPALIVE int gch_save_json_len() {
  if (!g.initialized) return 0;
  return static_cast<int>(g.saveJsonScratch.size());
}

} // extern "C"
