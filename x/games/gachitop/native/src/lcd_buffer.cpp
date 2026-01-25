#include "lcd_buffer.h"

#include <algorithm>

LCDBuffer::LCDBuffer(int w, int h) : width(w), height(h), pixels(static_cast<size_t>(w * h), 0) {}

void LCDBuffer::clear(std::uint8_t value) {
  std::fill(pixels.begin(), pixels.end(), value);
}

void LCDBuffer::set(int x, int y, std::uint8_t value) {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }
  pixels[static_cast<size_t>(y * width + x)] = value;
}

std::uint8_t LCDBuffer::get(int x, int y) const {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return 0;
  }
  return pixels[static_cast<size_t>(y * width + x)];
}

void LCDBuffer::drawRect(int x, int y, int w, int h, std::uint8_t value) {
  for (int yy = 0; yy < h; ++yy) {
    for (int xx = 0; xx < w; ++xx) {
      set(x + xx, y + yy, value);
    }
  }
}

void LCDBuffer::drawChecker(int cellSize) {
  if (cellSize <= 0) {
    return;
  }
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      const int cx = x / cellSize;
      const int cy = y / cellSize;
      const bool on = ((cx + cy) % 2) == 0;
      set(x, y, on ? 1 : 0);
    }
  }
}
