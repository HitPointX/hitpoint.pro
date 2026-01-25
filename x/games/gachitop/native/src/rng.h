#pragma once

#include <cstdint>

struct Rng32 {
  std::uint32_t state = 0x12345678u;

  explicit Rng32(std::uint32_t seed = 0x12345678u) : state(seed ? seed : 0x12345678u) {}

  std::uint32_t nextU32() {
    // xorshift32
    std::uint32_t x = state;
    x ^= x << 13u;
    x ^= x >> 17u;
    x ^= x << 5u;
    state = x;
    return x;
  }

  float nextFloat01() {
    // 24-bit mantissa uniform in [0,1)
    const std::uint32_t v = nextU32();
    return static_cast<float>(v & 0x00FFFFFFu) / static_cast<float>(0x01000000u);
  }

  int rangeIntInclusive(int lo, int hi) {
    if (hi <= lo) {
      return lo;
    }
    const std::uint32_t span = static_cast<std::uint32_t>(hi - lo + 1);
    return lo + static_cast<int>(nextU32() % span);
  }
};
