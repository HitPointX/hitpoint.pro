#include "ui.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstring>
#include <string_view>
#include <vector>

namespace {

constexpr int kIconSize = 10;  // pixels
constexpr int kIconPad = 2;
constexpr int kBarHeight = kIconSize + kIconPad * 2;

constexpr int kMusicIconSize = 10;
constexpr int kMusicIconMargin = 2;

// Very tiny 8x8 icon bitmaps (1=on). We scale to kIconSize via nearest.
struct Icon8 {
  std::uint8_t rows[8];
};

constexpr Icon8 kIcons[] = {
    // Feed (fish)
    {{0b00000000,
      0b00011000,
      0b00111100,
      0b11111110,
      0b01110110,
      0b11111110,
      0b00111100,
      0b00000000}},
    // Lights (lightbulb)
    {{0b00011000,
      0b00111100,
      0b01111110,
      0b01111110,
      0b01111110,
      0b00011000,
      0b00111100,
      0b01111110}},
    // Play (little mouse)
    {{0b00110000,
      0b01111000,
      0b11111100,
      0b11111110,
      0b11101110,
      0b01111100,
      0b00111010,
      0b00000100}},
    // Medicine (plus)
    {{0b00011000,
      0b00011000,
      0b00011000,
      0b01111110,
      0b01111110,
      0b00011000,
      0b00011000,
      0b00011000}},
    // Clean (sponge)
    {{0b00000000,
      0b01111110,
      0b01111110,
      0b01101110,
      0b01111010,
      0b01101110,
      0b01111110,
      0b00000000}},
    // Status (bars)
    {{0b01111110,
      0b01000010,
      0b01011010,
      0b01011010,
      0b01011010,
      0b01000010,
      0b01111110,
      0b00000000}},
    // Discipline (exclamation)
    {{0b00011000,
      0b00011000,
      0b00011000,
      0b00011000,
      0b00011000,
      0b00000000,
      0b00011000,
      0b00000000}},
    // Attention (symmetrical face)
    {{0b00111100,
      0b01000010,
      0b01011010,
      0b01000010,
      0b01000010,
      0b01001110,
      0b01000010,
      0b00111100}},
};

// Speaker/music note (8x8), scaled to kMusicIconSize.
constexpr Icon8 kMusicIcon = {{0b00011000,
                               0b00111000,
                               0b01111000,
                               0b01111011,
                               0b01111011,
                               0b00111000,
                               0b00011000,
                               0b00000000}};

// Heart sprite (8x8): used for rare happy hearts animation.
constexpr Icon8 kHeartIcon = {{0b00000000,
                               0b01100110,
                               0b11111111,
                               0b11111111,
                               0b01111110,
                               0b00111100,
                               0b00011000,
                               0b00000000}};

static_assert(static_cast<int>(IconId::Count) == (sizeof(kIcons) / sizeof(kIcons[0])));

void drawIconScaled(const Icon8& icon, LCDBuffer& lcd, int x, int y, int size, std::uint8_t value) {
  // scale 8x8 -> size x size
  for (int yy = 0; yy < size; ++yy) {
    int sy = (yy * 8 + size / 2) / size;
    if (sy > 7) sy = 7;
    const std::uint8_t row = icon.rows[sy];
    for (int xx = 0; xx < size; ++xx) {
      int sx = (xx * 8 + size / 2) / size;
      if (sx > 7) sx = 7;
      const bool on = ((row >> (7 - sx)) & 1u) != 0;
      if (on) {
        lcd.set(x + xx, y + yy, value);
      }
    }
  }
}

int clampInt(int v, int lo, int hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

void drawIconScaledSpin3D(const Icon8& icon,
                          LCDBuffer& lcd,
                          int x,
                          int y,
                          int size,
                          std::uint8_t value,
                          std::uint32_t nowTicks) {
  // Fake a 3D spin around the vertical axis:
  // - horizontally squash by |cos(theta)|
  // - mirror on backface
  // - add a dithered 1px side face for volume
  constexpr float kTwoPi = 6.28318530718f;
  const float theta = (static_cast<float>(nowTicks % 1200u) / 1200.0f) * kTwoPi;
  const float c = std::cos(theta);
  const float s = std::sin(theta);

  const bool backface = c < 0.0f;
  float widthFactor = std::fabs(c);
  if (widthFactor < 0.22f) widthFactor = 0.22f;  // keep readable at edge-on.

  const bool drawSide = std::fabs(s) > 0.35f;
  const int sideDir = (s >= 0.0f) ? 1 : -1;

  for (int yy = 0; yy < size; ++yy) {
    int sy = (yy * 8 + size / 2) / size;
    if (sy > 7) sy = 7;

    for (int xx = 0; xx < size; ++xx) {
      // Normalized x in [-0.5, 0.5]
      const float nx = (static_cast<float>(xx) + 0.5f) / static_cast<float>(size) - 0.5f;
      if (std::fabs(nx) > 0.5f * widthFactor) {
        continue;
      }

      // Map back to [0,1] while undoing squash.
      float u = (nx / widthFactor) + 0.5f;
      int srcX = clampInt(static_cast<int>(u * 8.0f), 0, 7);
      if (backface) {
        srcX = 7 - srcX;
      }

      const std::uint8_t row = icon.rows[sy];
      const bool on = ((row >> (7 - srcX)) & 1u) != 0;
      if (!on) {
        continue;
      }

      lcd.set(x + xx, y + yy, value);

      if (drawSide) {
        const int sx = x + xx + sideDir;
        if (((xx + yy) & 1) == 0) {
          lcd.set(sx, y + yy, value);
        }
      }
    }
  }
}

void drawHollowRect(LCDBuffer& lcd, int x, int y, int w, int h, std::uint8_t v) {
  for (int xx = 0; xx < w; ++xx) {
    lcd.set(x + xx, y, v);
    lcd.set(x + xx, y + h - 1, v);
  }
  for (int yy = 0; yy < h; ++yy) {
    lcd.set(x, y + yy, v);
    lcd.set(x + w - 1, y + yy, v);
  }
}

void drawCornerTicks(LCDBuffer& lcd, int x, int y, int w, int h, std::uint8_t v) {
  // Small corner markers to differentiate hover vs selected.
  lcd.drawRect(x, y, 3, 1, v);
  lcd.drawRect(x, y, 1, 3, v);

  lcd.drawRect(x + w - 3, y, 3, 1, v);
  lcd.drawRect(x + w - 1, y, 1, 3, v);

  lcd.drawRect(x, y + h - 1, 3, 1, v);
  lcd.drawRect(x, y + h - 3, 1, 3, v);

  lcd.drawRect(x + w - 3, y + h - 1, 3, 1, v);
  lcd.drawRect(x + w - 1, y + h - 3, 1, 3, v);
}

void drawMeterBar(LCDBuffer& lcd, int x, int y, int w, int h, int value0to100) {
  const int fill = std::clamp((value0to100 * w) / 100, 0, w);
  drawHollowRect(lcd, x, y, w, h, 1);
  for (int yy = 1; yy < h - 1; ++yy) {
    for (int xx = 1; xx < w - 1; ++xx) {
      lcd.set(x + xx, y + yy, (xx < fill) ? 1 : 0);
    }
  }
}

// Tiny 5x7 blocky font for LCD text (uppercase A-Z, 0-9, space, '-', '/').
// Each glyph is 5 bits wide, stored as 7 rows.
struct Font5x7Glyph {
  char c;
  std::uint8_t rows[7];
};

constexpr Font5x7Glyph kFont5x7[] = {
  {' ', {0, 0, 0, 0, 0, 0, 0}},
  {'!', {0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100}},
  {'\'', {0b00100, 0b00100, 0, 0, 0, 0, 0}},
  {'.', {0, 0, 0, 0, 0, 0, 0b00100}},
  {':', {0, 0b00100, 0, 0, 0b00100, 0, 0}},
  {'-', {0, 0, 0, 0b11111, 0, 0, 0}},
  {'/', {0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0, 0}},
  {'<', {0b00010, 0b00100, 0b01000, 0b00100, 0b00010, 0, 0}},
  {'>', {0b01000, 0b00100, 0b00010, 0b00100, 0b01000, 0, 0}},
  {'?', {0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b00000, 0b00100}},

  {'0', {0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110}},
  {'1', {0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110}},
  {'2', {0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111}},
  {'3', {0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110}},
  {'4', {0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010}},
  {'5', {0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110}},
  {'6', {0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110}},
  {'7', {0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000}},
  {'8', {0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110}},
  {'9', {0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110}},

  {'A', {0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001}},
  {'B', {0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110}},
  {'C', {0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110}},
  {'D', {0b11100, 0b10010, 0b10001, 0b10001, 0b10001, 0b10010, 0b11100}},
  {'E', {0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111}},
  {'F', {0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000}},
  {'G', {0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110}},
  {'H', {0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001}},
  {'I', {0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110}},
  {'J', {0b00111, 0b00010, 0b00010, 0b00010, 0b10010, 0b10010, 0b01100}},
  {'K', {0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001}},
  {'L', {0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111}},
  {'M', {0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001}},
  {'N', {0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001}},
  {'O', {0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110}},
  {'P', {0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000}},
  {'Q', {0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101}},
  {'R', {0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001}},
  {'S', {0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110}},
  {'T', {0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100}},
  {'U', {0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110}},
  {'V', {0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100}},
  {'W', {0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010}},
  {'X', {0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001}},
  {'Y', {0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100}},
  {'Z', {0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111}},
};

const Font5x7Glyph* findGlyph5x7(char c) {
  for (const auto& g : kFont5x7) {
    if (g.c == c) {
      return &g;
    }
  }
  return nullptr;
}

void drawText5x7(LCDBuffer& lcd, int x, int y, const char* text, std::uint8_t v) {
  if (text == nullptr) {
    return;
  }
  int penX = x;
  for (size_t i = 0; text[i] != '\0'; ++i) {
    char c = text[i];
    // Force ASCII lowercase to uppercase for convenience.
    if (c >= 'a' && c <= 'z') {
      c = static_cast<char>(c - 'a' + 'A');
    }
    const Font5x7Glyph* g = findGlyph5x7(c);
    if (g == nullptr) {
      penX += 6;
      continue;
    }
    for (int row = 0; row < 7; ++row) {
      const std::uint8_t bits = g->rows[row];
      for (int col = 0; col < 5; ++col) {
        const bool on = ((bits >> (4 - col)) & 1u) != 0;
        if (on) {
          lcd.set(penX + col, y + row, v);
        }
      }
    }
    penX += 6; // 5px glyph + 1px spacing
  }
}

int measureText5x7Px(const char* text) {
  if (text == nullptr) {
    return 0;
  }
  const int n = static_cast<int>(std::strlen(text));
  if (n <= 0) return 0;
  return n * 6 - 1;
}

const char* iconLabel(IconId id) {
  switch (id) {
    case IconId::Feed:
      return "FEED";
    case IconId::Lights:
      return "LIGHTS";
    case IconId::Play:
      return "PLAY";
    case IconId::Medicine:
      return "MEDICINE";
    case IconId::Clean:
      return "CLEAN";
    case IconId::Status:
      return "STATUS";
    case IconId::Discipline:
      return "DISCIPLINE";
    case IconId::Attention:
      return "ATTENTION";
    default:
      return "";
  }
}

void drawTooltip5x7(LCDBuffer& lcd, int anchorCenterX, int bottomY, const char* text) {
  if (text == nullptr || text[0] == '\0') {
    return;
  }

  const int textW = measureText5x7Px(text);
  const int textH = 7;

  const int padX = 3;
  const int padY = 2;

  const int boxW = textW + padX * 2;
  const int boxH = textH + padY * 2;

  int x = anchorCenterX - boxW / 2;
  int y = bottomY - boxH;

  if (x < 1) x = 1;
  if (x + boxW > lcd.width - 1) x = lcd.width - 1 - boxW;
  if (y < 1) y = 1;

  // Clear interior and draw outline.
  lcd.drawRect(x, y, boxW, boxH, 0);
  drawHollowRect(lcd, x, y, boxW, boxH, 1);
  drawText5x7(lcd, x + padX, y + padY, text, 1);
}

constexpr const char* kIntroMessages[] = {
  "H-hello?",
  "It's been lonely here.",
  "Would you mind checking up on me once a day?",
  "It would really mean a lot.",
  ":D <3",
};

std::string wrapForSpeechBubble(std::string_view text, int maxCharsPerLine) {
  if (maxCharsPerLine <= 1) {
    maxCharsPerLine = 1;
  }

  std::vector<std::string_view> words;
  words.reserve(32);

  size_t i = 0;
  while (i < text.size()) {
    while (i < text.size() && std::isspace(static_cast<unsigned char>(text[i]))) {
      ++i;
    }
    const size_t start = i;
    while (i < text.size() && !std::isspace(static_cast<unsigned char>(text[i]))) {
      ++i;
    }
    if (i > start) {
      words.push_back(text.substr(start, i - start));
    }
  }

  std::string out;
  out.reserve(text.size() + 8);

  int lineLen = 0;
  auto startNewLine = [&]() {
    if (!out.empty() && out.back() != '\n') {
      out.push_back('\n');
    }
    lineLen = 0;
  };

  for (size_t wi = 0; wi < words.size(); ++wi) {
    std::string_view w = words[wi];
    if (w.empty()) {
      continue;
    }

    auto emitWordOrChunk = [&](std::string_view chunk) {
      if (lineLen == 0) {
        out.append(chunk.data(), chunk.size());
        lineLen = static_cast<int>(chunk.size());
      } else if (lineLen + 1 + static_cast<int>(chunk.size()) <= maxCharsPerLine) {
        out.push_back(' ');
        out.append(chunk.data(), chunk.size());
        lineLen += 1 + static_cast<int>(chunk.size());
      } else {
        startNewLine();
        out.append(chunk.data(), chunk.size());
        lineLen = static_cast<int>(chunk.size());
      }
    };

    // Hard-break very long "words" (URLs, etc).
    while (!w.empty()) {
      if (static_cast<int>(w.size()) <= maxCharsPerLine) {
        emitWordOrChunk(w);
        w = {};
      } else {
        std::string_view chunk = w.substr(0, static_cast<size_t>(maxCharsPerLine));
        if (lineLen != 0) {
          startNewLine();
        }
        out.append(chunk.data(), chunk.size());
        w.remove_prefix(chunk.size());
        startNewLine();
      }
    }
  }

  return out;
}

void ensureIntroWrapped(UIModel& ui) {
  constexpr int kBubbleMaxWidthPx = 128; // roughly centered above pet on a 160px LCD
  constexpr int kMaxCharsPerLine = (kBubbleMaxWidthPx + 1) / 6;
  const int msgCount = static_cast<int>(sizeof(kIntroMessages) / sizeof(kIntroMessages[0]));
  const int idx = std::clamp(static_cast<int>(ui.introMessageIndex), 0, msgCount - 1);
  ui.introMessageIndex = static_cast<std::uint8_t>(idx);
  ui.introWrapped = wrapForSpeechBubble(kIntroMessages[idx], kMaxCharsPerLine);
}

void introAdvanceMessage(UIModel& ui, std::uint32_t nowTicks) {
  const int msgCount = static_cast<int>(sizeof(kIntroMessages) / sizeof(kIntroMessages[0]));
  int next = static_cast<int>(ui.introMessageIndex) + 1;
  if (next >= msgCount) {
    ui.introActive = false;
    ui.introMessageIndex = 0;
    ui.introCharIndex = 0;
    ui.introNextCharTicks = 0;
    ui.introHoldUntilTicks = 0;
    ui.introWrapped.clear();
    return;
  }

  ui.introMessageIndex = static_cast<std::uint8_t>(next);
  ui.introCharIndex = 0;
  ui.introNextCharTicks = nowTicks + 350u;
  ui.introHoldUntilTicks = 0;
  ensureIntroWrapped(ui);
}

void introStartIfNeeded(UIModel& ui, std::uint32_t nowTicks) {
  if (!ui.introActive) {
    return;
  }
  if (ui.introWrapped.empty()) {
    ui.introCharIndex = 0;
    ui.introNextCharTicks = (ui.introNextCharTicks == 0) ? (nowTicks + 400u) : ui.introNextCharTicks;
    ui.introHoldUntilTicks = 0;
    ensureIntroWrapped(ui);
  }
}

void drawSpeechBubbleTypewriter5x7(LCDBuffer& lcd,
                                  int anchorCenterX,
                                  int bottomY,
                                  const std::string& wrapped,
                                  int visibleChars,
                                  std::uint8_t v) {
  if (wrapped.empty()) {
    return;
  }

  std::vector<std::string_view> lines;
  lines.reserve(8);
  size_t start = 0;
  for (size_t i = 0; i <= wrapped.size(); ++i) {
    if (i == wrapped.size() || wrapped[i] == '\n') {
      lines.push_back(std::string_view(wrapped).substr(start, i - start));
      start = i + 1;
    }
  }
  if (lines.empty()) {
    return;
  }

  int maxLineChars = 0;
  for (const auto& line : lines) {
    const int n = static_cast<int>(line.size());
    if (n > maxLineChars) maxLineChars = n;
  }

  const int textW = (maxLineChars > 0) ? (maxLineChars * 6 - 1) : 0;
  const int textH = static_cast<int>(lines.size()) * 8 - 1; // 7px glyph + 1px leading per line

  const int padX = 4;
  const int padY = 3;

  const int boxW = textW + padX * 2;
  const int boxH = textH + padY * 2;

  int x = anchorCenterX - boxW / 2;
  int y = bottomY - boxH;

  if (x < 1) x = 1;
  if (x + boxW > lcd.width - 1) x = lcd.width - 1 - boxW;
  if (y < 1) y = 1;

  lcd.drawRect(x, y, boxW, boxH, 0);
  drawHollowRect(lcd, x, y, boxW, boxH, v);

  // Tail (simple little notch pointing down to the pet).
  int tx = anchorCenterX;
  if (tx < x + 2) tx = x + 2;
  if (tx > x + boxW - 3) tx = x + boxW - 3;
  lcd.set(tx, y + boxH, v);
  lcd.set(tx, y + boxH + 1, v);
  lcd.set(tx - 1, y + boxH, v);
  lcd.set(tx + 1, y + boxH, v);

  // Typewriter: reveal characters across wrapped lines (counting '\n' as 1 char).
  int remaining = std::clamp(visibleChars, 0, static_cast<int>(wrapped.size()));
  for (size_t li = 0; li < lines.size(); ++li) {
    const auto& full = lines[li];
    const int n = static_cast<int>(full.size());
    const int show = std::clamp(remaining, 0, n);
    if (show > 0) {
      const std::string s(full.substr(0, static_cast<size_t>(show)));
      drawText5x7(lcd, x + padX, y + padY + static_cast<int>(li) * 8, s.c_str(), v);
    }
    remaining -= n;
    if (li + 1 < lines.size() && remaining > 0) {
      // Consume the '\n' between lines.
      remaining -= 1;
    }
    if (remaining <= 0) {
      break;
    }
  }
}

IconId nextIcon(IconId cur) {
  const int n = static_cast<int>(IconId::Count);
  int i = static_cast<int>(cur);
  i = (i + 1) % n;
  return static_cast<IconId>(i);
}

void updatePetAnim(UIModel& ui, const PetSim& sim, std::uint32_t nowTicks) {
  // Clear expired transient animation.
  if (ui.petAnimMode != PetAnimMode::Idle && nowTicks >= ui.petAnimUntilTicks) {
    ui.petAnimMode = PetAnimMode::Idle;
    ui.petAnimStartTicks = 0;
    ui.petAnimUntilTicks = 0;
  }

  // Deterministic blink scheduling (no RNG): blink briefly every ~2-3 seconds.
  if (!sim.isDead) {
    if (ui.nextBlinkTicks == 0) {
      ui.nextBlinkTicks = nowTicks + 1400u;
    }

    if (ui.blinkUntilTicks != 0 && nowTicks >= ui.blinkUntilTicks) {
      ui.blinkUntilTicks = 0;
    }

    if (ui.blinkUntilTicks == 0 && nowTicks >= ui.nextBlinkTicks) {
      ui.blinkUntilTicks = nowTicks + 120u;
      // A small time-varying offset keeps it from feeling perfectly metronomic.
      ui.nextBlinkTicks = nowTicks + 2100u + (nowTicks % 700u);
    }

    // Idle variant scheduling: small micro-gestures when not calling attention.
    // Deterministic (no RNG) but varied over time.
    if (!sim.attentionCall && ui.petAnimMode == PetAnimMode::Idle) {
      if (ui.nextIdleVariantTicks == 0) {
        ui.nextIdleVariantTicks = nowTicks + 2600u;
      }
      if (ui.idleVariant != IdleVariant::None && nowTicks >= ui.idleVariantUntilTicks) {
        ui.idleVariant = IdleVariant::None;
        ui.idleVariantUntilTicks = 0;
      }
      if (ui.idleVariant == IdleVariant::None && nowTicks >= ui.nextIdleVariantTicks) {
        // Pick one of a few variants based on time.
        const std::uint32_t k = (nowTicks / 137u) % 4u;
        ui.idleVariant = (k == 0)   ? IdleVariant::Wiggle
                         : (k == 1) ? IdleVariant::Hop
                         : (k == 2) ? IdleVariant::Look
                                    : IdleVariant::Sparkle;
        ui.idleVariantUntilTicks = nowTicks + 550u;
        ui.nextIdleVariantTicks = nowTicks + 3200u + (nowTicks % 2800u);
      }
    } else {
      // If we're calling attention or reacting, don't do idle variants.
      ui.idleVariant = IdleVariant::None;
      ui.idleVariantUntilTicks = 0;
      ui.nextIdleVariantTicks = 0;
    }
  } else {
    ui.petAnimMode = PetAnimMode::Idle;
    ui.petAnimStartTicks = 0;
    ui.petAnimUntilTicks = 0;
    ui.nextBlinkTicks = 0;
    ui.blinkUntilTicks = 0;
    ui.idleVariant = IdleVariant::None;
    ui.idleVariantUntilTicks = 0;
    ui.nextIdleVariantTicks = 0;
  }
}
void startPetReaction(UIModel& ui, PetAnimMode mode, std::uint32_t nowTicks, std::uint32_t durationTicks) {
  ui.petAnimMode = mode;
  ui.petAnimStartTicks = nowTicks;
  ui.petAnimUntilTicks = nowTicks + durationTicks;
}

} // namespace

bool uiHitTestMusicIcon(int lcdW, int lcdH, int lcdX, int lcdY) {
  (void)lcdH;
  const int x = lcdW - kMusicIconMargin - kMusicIconSize;
  const int y = kMusicIconMargin;
  return (lcdX >= x && lcdX < (x + kMusicIconSize) && lcdY >= y && lcdY < (y + kMusicIconSize));
}

bool uiHitTestIconBar(int lcdW, int lcdH, int lcdX, int lcdY, IconId& outIcon) {
  const int barY = lcdH - kBarHeight;
  if (lcdY < barY || lcdY >= lcdH) {
    return false;
  }

  const int iconCount = static_cast<int>(IconId::Count);
  const int totalIconsW = iconCount * kIconSize + (iconCount - 1) * kIconPad;
  // Center inside the bar interior (exclude the 1px border).
  const int innerX = 1;
  const int innerW = lcdW - 2;
  const int startX = innerX + (innerW - totalIconsW) / 2;
  const int iconY = barY + 1 + kIconPad;

  if (lcdY < iconY || lcdY >= (iconY + kIconSize)) {
    return false;
  }

  for (int i = 0; i < iconCount; ++i) {
    const int iconX = startX + i * (kIconSize + kIconPad);
    if (lcdX >= iconX && lcdX < (iconX + kIconSize)) {
      outIcon = static_cast<IconId>(i);
      return true;
    }
  }

  return false;
}

void uiUpdate(UIModel& ui, const UIInput& in, PetSim& sim, const GameRules& rules, std::uint32_t nowTicks) {
  // Toast timeout
  if (!ui.toast.empty() && nowTicks > ui.toastUntilTicks) {
    ui.toast.clear();
  }

  updatePetAnim(ui, sim, nowTicks);

  // Intro dialog takes over input/UI for a moment on first run.
  if (ui.introActive) {
    introStartIfNeeded(ui, nowTicks);

    if (in.pressC) {
      ui.introActive = false;
      ui.introWrapped.clear();
      ui.introCharIndex = 0;
      ui.introNextCharTicks = 0;
      ui.introHoldUntilTicks = 0;
      return;
    }

    const int maxChars = static_cast<int>(ui.introWrapped.size());
    const int shown = std::clamp(ui.introCharIndex, 0, maxChars);

    if (in.pressB) {
      if (shown < maxChars) {
        ui.introCharIndex = maxChars;
        ui.introHoldUntilTicks = nowTicks + 900u;
      } else {
        introAdvanceMessage(ui, nowTicks);
      }
      return;
    }

    if (shown < maxChars) {
      if (ui.introNextCharTicks == 0) {
        ui.introNextCharTicks = nowTicks + 400u;
      }
      if (nowTicks >= ui.introNextCharTicks) {
        ui.introCharIndex = shown + 1;
        const char c = ui.introWrapped[static_cast<size_t>(shown)];
        const std::uint32_t delay = (c == '\n') ? 0u : 35u;
        ui.introNextCharTicks = nowTicks + delay;
      }
    } else {
      if (ui.introHoldUntilTicks == 0) {
        ui.introHoldUntilTicks = nowTicks + 1400u;
      } else if (nowTicks >= ui.introHoldUntilTicks) {
        introAdvanceMessage(ui, nowTicks);
      }
    }
    return;
  }

  if (ui.state == UIState::Status) {
    if (in.pressC || in.pressB) {
      ui.state = UIState::Main;
      ui.pendingSfx = UISfxCue::UiBack;
    }
    return;
  }

  // Main state
  if (in.pressA) {
    ui.selectedIcon = nextIcon(ui.selectedIcon);
    ui.pendingSfx = UISfxCue::UiMove;
  }

  if (in.pressB) {
    switch (ui.selectedIcon) {
      case IconId::Feed:
        sim.feedMeal(rules);
        ui.toast = "Meal";
        ui.toastUntilTicks = nowTicks + 900;
        startPetReaction(ui, PetAnimMode::ReactMeal, nowTicks, 700);
        ui.pendingSfx = UISfxCue::Feed;
        break;
      case IconId::Play:
        sim.play(rules);
        ui.toast = "Play";
        ui.toastUntilTicks = nowTicks + 900;
        startPetReaction(ui, PetAnimMode::ReactPlay, nowTicks, 700);
        ui.pendingSfx = UISfxCue::Play;
        break;
      case IconId::Medicine:
        sim.medicineRequested = true;
        ui.toast = "Med";
        ui.toastUntilTicks = nowTicks + 700;
        startPetReaction(ui, PetAnimMode::ReactMedicine, nowTicks, 600);
        ui.pendingSfx = UISfxCue::Medicine;
        break;
      case IconId::Status:
        ui.state = UIState::Status;
        ui.pendingSfx = UISfxCue::UiConfirm;
        break;
      case IconId::Lights:
        sim.lightsOn = !sim.lightsOn;
        if (sim.lightsOn) {
          sim.sleeping = false;
          ui.toast = "Light On";
        } else {
          // If tired, go to sleep; otherwise, complain for attention.
          sim.sleeping = (sim.energy <= static_cast<float>(rules.sleepTiredAtEnergy));
          ui.toast = sim.sleeping ? "Sleep" : "Light Off";
        }
        ui.toastUntilTicks = nowTicks + 900;
        ui.pendingSfx = UISfxCue::UiConfirm;
        // Recompute attention immediately so the complaint reason is reflected this frame.
        sim.recomputeAttention(rules);
        break;
      default:
        ui.toast = "Stub";
        ui.toastUntilTicks = nowTicks + 700;
        ui.pendingSfx = UISfxCue::UiConfirm;
        break;
    }
  }
}

void uiRender(const UIModel& ui, const PetSim& sim, int ageMonths, int careMistakesTotal, int careMistakesThisMonth,
              LCDBuffer& lcd, std::uint32_t nowTicks) {
  (void)careMistakesThisMonth;
  // Background
  lcd.clear(0);

  // Top-right music toggle icon: hidden when off unless hovered.
  if (ui.musicEnabled || ui.musicHover) {
    const int mx = lcd.width - kMusicIconMargin - kMusicIconSize;
    const int my = kMusicIconMargin;
    drawIconScaled(kMusicIcon, lcd, mx, my, kMusicIconSize, 1);
    if (ui.musicHover) {
      drawCornerTicks(lcd, mx - 1, my - 1, kMusicIconSize + 2, kMusicIconSize + 2, 1);
    }
    if (ui.musicEnabled) {
      drawHollowRect(lcd, mx - 1, my - 1, kMusicIconSize + 2, kMusicIconSize + 2, 1);
    }
  }

  // Illness warning sign (terminal warning window): obvious blinking frame.
  // This is meant to be noticeable days before passing.
  if (!sim.isDead && sim.illnessWarning) {
    const bool warnBlink = ((nowTicks / 200u) % 2u) == 0u;
    if (warnBlink) {
      drawHollowRect(lcd, 2, 2, lcd.width - 4, lcd.height - kBarHeight - 4, 1);
      // Corner ticks
      lcd.drawRect(2, 2, 5, 2, 1);
      lcd.drawRect(2, 2, 2, 5, 1);
      lcd.drawRect(lcd.width - 7, 2, 5, 2, 1);
      lcd.drawRect(lcd.width - 4, 2, 2, 5, 1);
    }
  }

  // Fake pet blob at center
  const int cx = lcd.width / 2;
  const int cy = (lcd.height - kBarHeight) / 2;
  if (!sim.isDead) {
    // Simple animations: blink + reaction motions; sickness adds a subtle wobble.
    int xOff = 0;
    int yOff = 0;

    if (sim.illnessActive && sim.illnessSymptomatic) {
      // Mild left/right wobble when sick.
      xOff += (((nowTicks / 180u) % 2u) == 0u) ? -1 : 1;
    }

    if (ui.petAnimMode != PetAnimMode::Idle && nowTicks < ui.petAnimUntilTicks) {
      const std::uint32_t phase = (ui.petAnimUntilTicks - nowTicks);
      switch (ui.petAnimMode) {
        case PetAnimMode::ReactMeal:
          // Small bob while eating.
          yOff += ((phase / 120u) % 2u) == 0u ? -1 : 0;
          break;
        case PetAnimMode::ReactPlay:
          // Bouncier bob.
          yOff += ((phase / 90u) % 2u) == 0u ? -1 : 1;
          break;
        case PetAnimMode::ReactMedicine:
          // Tiny shake.
          xOff += ((phase / 80u) % 2u) == 0u ? -1 : 1;
          break;
        case PetAnimMode::RareHappyDance:
          xOff += ((phase / 70u) % 2u) == 0u ? -1 : 1;
          yOff += ((phase / 140u) % 2u) == 0u ? 0 : -1;
          break;
        case PetAnimMode::RareHappySparkShower:
          yOff += ((phase / 160u) % 2u) == 0u ? -1 : 0;
          break;
        case PetAnimMode::RareHappyHearts:
          // Excited jitter (random happiness event).
          xOff += ((nowTicks / 45u) % 2u) == 0u ? -1 : 1;
          yOff += ((nowTicks / 70u) % 2u) == 0u ? 0 : -1;
          break;
        case PetAnimMode::RareHungrySniff:
          xOff += ((phase / 160u) % 2u) == 0u ? 0 : 1;
          break;
        case PetAnimMode::RareSickCrawl:
          // Slow crawl downward.
          yOff += 1;
          break;
        case PetAnimMode::RareSickShiver:
          xOff += ((phase / 50u) % 2u) == 0u ? -1 : 1;
          break;
        case PetAnimMode::RareSickCollapse:
          // Drop down and stay.
          yOff += 3;
          break;
        default:
          break;
      }
    }

    // Rare animations that move across the screen need a stable progress.
    if (ui.petAnimMode == PetAnimMode::RareHappyZoomies || ui.petAnimMode == PetAnimMode::RareHungryPace ||
        ui.petAnimMode == PetAnimMode::RareHungryExercise) {
      const std::uint32_t start = ui.petAnimStartTicks;
      const std::uint32_t end = ui.petAnimUntilTicks;
      const std::uint32_t denom = (end > start) ? (end - start) : 1u;
      const float p01 = std::clamp(static_cast<float>(nowTicks - start) / static_cast<float>(denom), 0.0f, 1.0f);

      // Ping-pong across the screen.
      const float u = (p01 < 0.5f) ? (p01 * 2.0f) : ((1.0f - p01) * 2.0f);
      const int span = (lcd.width / 2) - 14; // keep inside frame
      const int run = static_cast<int>(-span + (2.0f * span) * u);
      xOff += run;

      if (ui.petAnimMode == PetAnimMode::RareHappyZoomies) {
        yOff += ((nowTicks / 80u) % 2u) == 0u ? -1 : 1;
      } else if (ui.petAnimMode == PetAnimMode::RareHungryExercise) {
        // More vertical bounce.
        yOff += ((nowTicks / 60u) % 2u) == 0u ? -2 : 0;
      } else {
        yOff += ((nowTicks / 120u) % 2u) == 0u ? -1 : 0;
      }
    }

    // Idle micro-gestures (when not calling attention).
    if (ui.petAnimMode == PetAnimMode::Idle && !sim.attentionCall && ui.idleVariant != IdleVariant::None &&
        nowTicks < ui.idleVariantUntilTicks) {
      const std::uint32_t phase = ui.idleVariantUntilTicks - nowTicks;
      switch (ui.idleVariant) {
        case IdleVariant::Wiggle:
          xOff += ((phase / 90u) % 2u) == 0u ? -1 : 1;
          break;
        case IdleVariant::Hop:
          yOff += ((phase / 120u) % 2u) == 0u ? -1 : 0;
          break;
        case IdleVariant::Look:
          xOff += ((phase / 180u) % 2u) == 0u ? 0 : 1;
          break;
        case IdleVariant::Sparkle:
          // rendered below as sparkles; keep position stable
          break;
        default:
          break;
      }
    }

    const int px = cx - 5 + xOff;
    const int py = cy - 3 + yOff;
    lcd.drawRect(px, py, 10, 8, 1);

    const bool blinking = ui.blinkUntilTicks != 0 && nowTicks < ui.blinkUntilTicks;
    if (!blinking) {
      lcd.set(px + 3, py + 2, 0);
      lcd.set(px + 6, py + 2, 0);
    } else {
      // Blink: short eyelids.
      lcd.set(px + 3, py + 3, 0);
      lcd.set(px + 6, py + 3, 0);
    }

    // Tiny action glyphs near the pet.
    if (ui.petAnimMode == PetAnimMode::ReactMeal && nowTicks < ui.petAnimUntilTicks) {
      // A little "crumb" below.
      lcd.drawRect(px + 4, py + 7, 2, 1, 1);
    } else if (ui.petAnimMode == PetAnimMode::ReactPlay && nowTicks < ui.petAnimUntilTicks) {
      // Two sparkles above.
      const bool s = ((nowTicks / 100u) % 2u) == 0u;
      if (s) {
        lcd.drawRect(px - 2, py - 2, 2, 2, 1);
        lcd.drawRect(px + 10, py - 1, 2, 2, 1);
      }
    } else if (ui.petAnimMode == PetAnimMode::ReactMedicine && nowTicks < ui.petAnimUntilTicks) {
      // Plus symbol on the right.
      lcd.set(px + 11, py + 3, 1);
      lcd.set(px + 11, py + 4, 1);
      lcd.set(px + 10, py + 4, 1);
      lcd.set(px + 12, py + 4, 1);
    }

    // Rare animation glyphs.
    if (ui.petAnimMode == PetAnimMode::RareHappyDance && nowTicks < ui.petAnimUntilTicks) {
      const bool s = ((nowTicks / 110u) % 2u) == 0u;
      if (s) {
        lcd.drawRect(px - 3, py + 2, 2, 2, 1);
        lcd.drawRect(px + 11, py + 2, 2, 2, 1);
      }
    } else if (ui.petAnimMode == PetAnimMode::RareHappySparkShower && nowTicks < ui.petAnimUntilTicks) {
      const bool s = ((nowTicks / 90u) % 2u) == 0u;
      if (s) {
        lcd.drawRect(px - 2, py - 3, 2, 2, 1);
        lcd.drawRect(px + 10, py - 4, 2, 2, 1);
        lcd.drawRect(px + 4, py - 6, 2, 2, 1);
      }
    } else if (ui.petAnimMode == PetAnimMode::RareHappyHearts && nowTicks < ui.petAnimUntilTicks) {
      // Hearts flutter/spin above the pet's head.
      const int baseX = px + 1;
      const int baseY = py - 14;
      const int heartSize = 8;

      for (int i = 0; i < 3; ++i) {
        const std::uint32_t t = nowTicks + static_cast<std::uint32_t>(i * 170u);
        const int bob = ((t / 120u) % 4u) == 0u ? -2 : (((t / 120u) % 4u) == 1u ? -1 : 0);
        const int drift = ((t / 180u) % 2u) == 0u ? -1 : 1;

        const int hx = baseX + (i - 1) * 9 + drift;
        const int hy = baseY + bob - i;
        drawIconScaledSpin3D(kHeartIcon, lcd, hx, hy, heartSize, 1, t);
      }
    } else if (ui.petAnimMode == PetAnimMode::RareHungrySniff && nowTicks < ui.petAnimUntilTicks) {
      // "sniff" dots in front.
      const bool s = ((nowTicks / 120u) % 2u) == 0u;
      if (s) {
        lcd.set(px + 11, py + 4, 1);
        lcd.set(px + 13, py + 3, 1);
      }
    } else if (ui.petAnimMode == PetAnimMode::RareSickCrawl && nowTicks < ui.petAnimUntilTicks) {
      // droop mouth line
      lcd.drawRect(px + 3, py + 6, 4, 1, 0);
    } else if (ui.petAnimMode == PetAnimMode::RareSickCollapse && nowTicks < ui.petAnimUntilTicks) {
      // X eyes
      lcd.set(px + 3, py + 2, 1);
      lcd.set(px + 6, py + 2, 1);
    }

    // Idle sparkle glyph (only during idle sparkle variant).
    if (ui.petAnimMode == PetAnimMode::Idle && !sim.attentionCall && ui.idleVariant == IdleVariant::Sparkle &&
        nowTicks < ui.idleVariantUntilTicks) {
      const bool s = ((nowTicks / 110u) % 2u) == 0u;
      if (s) {
        lcd.drawRect(px - 2, py - 2, 2, 2, 1);
        lcd.drawRect(px + 10, py - 1, 2, 2, 1);
      }
    }

    // Intro speech bubble (first run): render above the pet.
    if (ui.introActive && !ui.introWrapped.empty()) {
      drawSpeechBubbleTypewriter5x7(lcd, px + 5, py - 3, ui.introWrapped, ui.introCharIndex, 1);
    }

    // Callout bubble: when calling attention, show what it wants (food/play/lights/medicine).
    if (!ui.introActive && sim.attentionCall) {
      const bool bubbleBlink = ((nowTicks / 450u) % 2u) == 0u;
      if (bubbleBlink) {
        IconId want = IconId::Attention;
        if (any(sim.attentionReasons & AttentionReason::Illness)) {
          want = IconId::Medicine;
        } else if (any(sim.attentionReasons & AttentionReason::HungerLow)) {
          want = IconId::Feed;
        } else if (any(sim.attentionReasons & AttentionReason::HappinessLow)) {
          want = IconId::Play;
        } else if (any(sim.attentionReasons & AttentionReason::Lights)) {
          want = IconId::Lights;
        } else if (any(sim.attentionReasons & AttentionReason::EnergyLow)) {
          want = IconId::Lights;
        }

        const int bx = px + 6;
        const int by = py - 12;
        drawHollowRect(lcd, bx - 1, by - 1, 12, 12, 1);
        lcd.set(bx + 2, by + 10, 1); // tiny tail hint
        drawIconScaled(kIcons[static_cast<int>(want)], lcd, bx, by, 10, 1);
      }
    }

    // Mild symptom hint (non-terminal sickness): small pulsing dot near the pet.
    if (sim.illnessActive && sim.illnessSymptomatic && !sim.illnessWarning) {
      const bool symBlink = ((nowTicks / 500u) % 2u) == 0u;
      if (symBlink) {
        lcd.drawRect(cx + 8, cy - 6, 2, 2, 1);
      }
    }

    // Lights/sleep visuals.
    if (sim.sleeping) {
      const bool zBlink = ((nowTicks / 400u) % 2u) == 0u;
      if (zBlink) {
        drawText5x7(lcd, cx - 2, cy - 24, "Z", 1);
      }
    } else if (!sim.lightsOn) {
      const bool exBlink = ((nowTicks / 250u) % 2u) == 0u;
      if (exBlink) {
        drawText5x7(lcd, cx - 2, cy - 24, "!", 1);
      }
    }
  } else {
    // Simple "dead" marker
    lcd.drawRect(cx - 6, cy - 4, 12, 10, 1);
    for (int i = 0; i < 10; ++i) {
      lcd.set(cx - 5 + i, cy - 3 + i / 1, 1);
      lcd.set(cx + 4 - i, cy - 3 + i / 1, 1);
    }
  }

  // Attention call indicator: blink the attention icon in the bar
  const bool blinkOn = ((nowTicks / 300u) % 2u) == 0u;

  // Icon bar
  const int barY = lcd.height - kBarHeight;
  drawHollowRect(lcd, 0, barY, lcd.width, kBarHeight, 1);

  const int iconCount = static_cast<int>(IconId::Count);
  const int totalIconsW = iconCount * kIconSize + (iconCount - 1) * kIconPad;
  // Center inside the bar interior (exclude the 1px border).
  const int innerX = 1;
  const int innerW = lcd.width - 2;
  const int startX = innerX + (innerW - totalIconsW) / 2;
  const int iconY = barY + 1 + kIconPad;

  for (int i = 0; i < iconCount; ++i) {
    const int iconX = startX + i * (kIconSize + kIconPad);
    const IconId id = static_cast<IconId>(i);

    if (id == IconId::Attention && sim.attentionCall && !blinkOn) {
      continue;
    }

    const bool isHovered = ui.hoverActive && id == ui.hoveredIcon;
    const bool isSelected = id == ui.selectedIcon;

    // Animate only on highlight (hover). Selecting the icon stops the animation.
    if (isHovered && !isSelected) {
      const int bob = (((nowTicks / 220u) % 2u) == 0u) ? 0 : -1;
      drawIconScaledSpin3D(kIcons[i], lcd, iconX, iconY + bob, kIconSize, 1, nowTicks);
    } else {
      drawIconScaled(kIcons[i], lcd, iconX, iconY, kIconSize, 1);
    }

    if (isHovered && !isSelected) {
      drawCornerTicks(lcd, iconX - 1, iconY - 1, kIconSize + 2, kIconSize + 2, 1);
    }

    if (id == ui.selectedIcon) {
      drawHollowRect(lcd, iconX - 1, iconY - 1, kIconSize + 2, kIconSize + 2, 1);
    }
  }

  // Hover tooltip (icon label) for the main screen.
  if (ui.state == UIState::Main && ui.hoverActive) {
    const int i = static_cast<int>(ui.hoveredIcon);
    if (i >= 0 && i < iconCount) {
      const int iconX = startX + i * (kIconSize + kIconPad);
      const int centerX = iconX + kIconSize / 2;
      // Position just above the icon bar border.
      const int tooltipBottomY = barY - 2;
      drawTooltip5x7(lcd, centerX, tooltipBottomY, iconLabel(ui.hoveredIcon));
    }
  }

  // Status screen overlay
  if (ui.state == UIState::Status) {
    drawHollowRect(lcd, 8, 8, lcd.width - 16, lcd.height - kBarHeight - 16, 1);

    // Bars
    const int barW = lcd.width - 32;
    const int statsX = 16;

    constexpr int kStdBarH = 10;
    constexpr int kAgeBarH = 8;
    constexpr int kMistakesBarH = kStdBarH;
    constexpr int kLabelH = 7;
    constexpr int kLabelGap = 1;    // empty pixels between label and bar
    constexpr int kSectionGap = 3;  // empty pixels between bar and next label
    constexpr int kLabelOffset = kLabelH + kLabelGap;

    auto drawLabeledMeter = [&](int barY, int barH, const char* label, int value0to100) {
      drawText5x7(lcd, statsX, barY - kLabelOffset, label, 1);
      drawMeterBar(lcd, statsX, barY, barW, barH, value0to100);
    };
    auto advanceBarY = [&](int barY, int barH) {
      return barY + barH + kSectionGap + kLabelOffset;
    };

    int cursorBarY = 18;

    const int hungerBarY = cursorBarY;
    drawLabeledMeter(hungerBarY, kStdBarH, "HUNGER", static_cast<int>(sim.hunger));
    cursorBarY = advanceBarY(cursorBarY, kStdBarH);

    const int happyBarY = cursorBarY;
    drawLabeledMeter(happyBarY, kStdBarH, "HAPPY", static_cast<int>(sim.happiness));
    cursorBarY = advanceBarY(cursorBarY, kStdBarH);

    const int energyBarY = cursorBarY;
    drawLabeledMeter(energyBarY, kStdBarH, "ENERGY", static_cast<int>(sim.energy));
    cursorBarY = advanceBarY(cursorBarY, kStdBarH);

    int illnessBarY = -1;
    if (sim.illnessActive) {
      illnessBarY = cursorBarY;
      drawLabeledMeter(illnessBarY, kStdBarH, "ILLNESS", static_cast<int>(sim.illnessSeverity));
      if (sim.illnessWarning) {
        // small warning dot at the left of the illness bar
        lcd.drawRect(12, illnessBarY + 2, 2, 2, 1);
      }
      cursorBarY = advanceBarY(cursorBarY, kStdBarH);
    }

    // Attention reason markers (small ! dots at the right of each bar)
    const int markerX = statsX + barW + 2;
    if (any(sim.attentionReasons & AttentionReason::HungerLow)) {
      lcd.drawRect(markerX, hungerBarY + 2, 3, 3, 1);
      lcd.drawRect(markerX, hungerBarY + 6, 1, 4, 1);
    }
    if (any(sim.attentionReasons & AttentionReason::HappinessLow)) {
      lcd.drawRect(markerX, happyBarY + 2, 3, 3, 1);
      lcd.drawRect(markerX, happyBarY + 6, 1, 4, 1);
    }
    if (any(sim.attentionReasons & AttentionReason::EnergyLow)) {
      lcd.drawRect(markerX, energyBarY + 2, 3, 3, 1);
      lcd.drawRect(markerX, energyBarY + 6, 1, 4, 1);
    }
    if (illnessBarY >= 0 && any(sim.attentionReasons & AttentionReason::Illness)) {
      lcd.drawRect(markerX, illnessBarY + 2, 3, 3, 1);
      lcd.drawRect(markerX, illnessBarY + 6, 1, 4, 1);
    }

    // Age progress bar (0..1200 months => up to 100 years cap)
    const int maxMonths = 1200;
    const int age = std::clamp(ageMonths, 0, maxMonths);
    const int agePct = (maxMonths <= 0) ? 0 : (age * 100) / maxMonths;
    const int ageY = cursorBarY;
    drawLabeledMeter(ageY, kAgeBarH, "AGE", agePct);
    cursorBarY = advanceBarY(cursorBarY, kAgeBarH);

    // Care mistakes (visual-only): total bar (scaled 0..200 for now; we can retune later)
    const int totalMax = 200;
    const int total = std::clamp(careMistakesTotal, 0, totalMax);
    const int mistakesPct = (totalMax <= 0) ? 0 : (total * 100) / totalMax;
    const int mistakesY = cursorBarY;
    drawLabeledMeter(mistakesY, kMistakesBarH, "MISTAKES", mistakesPct);
  }

  // Toast indicator: a small dot at top-left (minimal text substitute)
  if (!ui.toast.empty()) {
    lcd.drawRect(3, 3, 4, 4, 1);
  }
}
