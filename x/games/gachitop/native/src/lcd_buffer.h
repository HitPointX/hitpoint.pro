#pragma once

#include <cstdint>
#include <vector>

struct LCDBuffer {
  int width = 0;
  int height = 0;
  // 0 = background, 1 = lit pixel (for Milestone 0)
  std::vector<std::uint8_t> pixels;

  LCDBuffer() = default;
  LCDBuffer(int w, int h);

  void clear(std::uint8_t value = 0);
  void set(int x, int y, std::uint8_t value);
  std::uint8_t get(int x, int y) const;

  // Convenience drawing
  void drawRect(int x, int y, int w, int h, std::uint8_t value);
  void drawChecker(int cellSize);
};
