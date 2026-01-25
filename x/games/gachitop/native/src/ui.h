#pragma once

#include "lcd_buffer.h"
#include "game_rules.h"
#include "pet_sim.h"

#include <cstdint>
#include <string>

enum class IconId : std::uint8_t {
  Feed = 0,
  Lights,
  Play,
  Medicine,
  Clean,
  Status,
  Discipline,
  Attention,
  Count
};

enum class UIState : std::uint8_t {
  Main,
  Status,
};

enum class UISfxCue : std::uint8_t {
  None = 0,
  UiMove,
  UiConfirm,
  UiBack,
  Feed,
  Play,
  Medicine,
};

enum class PetAnimMode : std::uint8_t {
  Idle = 0,
  ReactMeal,
  ReactPlay,
  ReactMedicine,

  // Rare idles (happy/healthy)
  RareHappyZoomies,
  RareHappyDance,
  RareHappySparkShower,
  RareHappyHearts,

  // Rare idles (hungry)
  RareHungryPace,
  RareHungrySniff,
  RareHungryExercise,

  // Rare idles (sick)
  RareSickCrawl,
  RareSickShiver,
  RareSickCollapse,
};

enum class IdleVariant : std::uint8_t {
  None = 0,
  Wiggle,
  Hop,
  Look,
  Sparkle,
};

struct UIModel {
  UIState state = UIState::Main;
  IconId selectedIcon = IconId::Feed;

  bool hoverActive = false;
  IconId hoveredIcon = IconId::Feed;

  // First-run intro dialog (one-shot per new save).
  bool introActive = false;
  std::uint8_t introMessageIndex = 0;
  int introCharIndex = 0; // index into introWrapped (includes '\n')
  std::uint32_t introNextCharTicks = 0;
  std::uint32_t introHoldUntilTicks = 0;
  std::string introWrapped;

  // Music toggle icon (top-right). When music is disabled, it is hidden unless hovered.
  bool musicHover = false;
  bool musicEnabled = false;

  // ephemeral message for main screen (debug-ish)
  std::string toast;
  std::uint32_t toastUntilTicks = 0;

  // One-shot audio cue requested by UI logic.
  UISfxCue pendingSfx = UISfxCue::None;

  // Pet animation state (UI-only; does not affect simulation)
  PetAnimMode petAnimMode = PetAnimMode::Idle;
  std::uint32_t petAnimStartTicks = 0;
  std::uint32_t petAnimUntilTicks = 0;
  std::uint32_t nextBlinkTicks = 0;
  std::uint32_t blinkUntilTicks = 0;

  // Idle cycle variety (deterministic, time-based)
  IdleVariant idleVariant = IdleVariant::None;
  std::uint32_t idleVariantUntilTicks = 0;
  std::uint32_t nextIdleVariantTicks = 0;
};

inline UISfxCue uiConsumeSfx(UIModel& ui) {
  const UISfxCue c = ui.pendingSfx;
  ui.pendingSfx = UISfxCue::None;
  return c;
}

struct UIInput {
  bool pressA = false; // cycle
  bool pressB = false; // confirm
  bool pressC = false; // back
};

void uiUpdate(UIModel& ui, const UIInput& in, PetSim& sim, std::uint32_t nowTicks);
void uiUpdate(UIModel& ui, const UIInput& in, PetSim& sim, const GameRules& rules, std::uint32_t nowTicks);
void uiRender(const UIModel& ui, const PetSim& sim, int ageMonths, int careMistakesTotal, int careMistakesThisMonth,
              LCDBuffer& lcd, std::uint32_t nowTicks);

// Hit-test the icon bar in LCD pixel coordinates.
// Returns true and sets outIcon if (lcdX,lcdY) is inside an icon.
bool uiHitTestIconBar(int lcdW, int lcdH, int lcdX, int lcdY, IconId& outIcon);

// Hit-test the top-right music toggle icon.
bool uiHitTestMusicIcon(int lcdW, int lcdH, int lcdX, int lcdY);
