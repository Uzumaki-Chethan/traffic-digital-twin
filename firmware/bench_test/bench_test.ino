// TRINETRA physical rig — bench test sketch (BOM v1.1 Section 8, adapted for
// the 4-lens-per-head design and 4 independent chains, Section 36).
//
// Purpose: prove each head's pixel chain works and is wired in the right
// order BEFORE any acrylic is cut. Does not talk to the backend yet — that
// is a separate sketch, once this one passes on every head you've wired.
//
// Design (Section 36, confirmed with the owner):
//   - 4 lenses per head: [0] red circle, [1] amber circle,
//     [2] combined left+ahead arrow, [3] right arrow.
//   - 4 heads, each its OWN chain on its OWN GPIO pin (fault isolation: a
//     loose wire on one head cannot take the others dark with it) —
//     GPIO13 / GPIO4 / GPIO16 / GPIO17, matching the BOM's 4 (not 1) 470ohm
//     resistors, one per data line.
//
// Wiring per head (bench only, per doc Section 5):
//   ESP32 <head's GPIO> -> 470ohm resistor -> that head's pixel chain DIN
//   Pixel chain 5V -> external 5V supply once testing more than a couple of
//     pixels at once (not the ESP32 5V pin) -- Section 5.3
//   Pixel chain GND -> shared with ESP32 GND -- must be common, or colors
//     glitch
//
// Only wire up as many heads as you've actually got pixels for right now —
// HEADS_WIRED below controls how many chains this sketch actually drives.
//
// If colors are wrong/flickery once wired: try the 1N4001 diode level-shift
// fallback in Section 5.4 before suspecting the code.

#include <Adafruit_NeoPixel.h>

#define LENSES_PER_HEAD 4
#define NUM_HEADS 4
// How many of the 4 heads are physically wired up right now. Start at 1
// while bench-testing a single cut segment; raise to 4 once all heads are
// wired. Never higher than NUM_HEADS.
#define HEADS_WIRED 1

const uint8_t HEAD_PIN[NUM_HEADS] = {13, 4, 16, 17};

Adafruit_NeoPixel heads[NUM_HEADS] = {
  Adafruit_NeoPixel(LENSES_PER_HEAD, HEAD_PIN[0], NEO_GRB + NEO_KHZ800),
  Adafruit_NeoPixel(LENSES_PER_HEAD, HEAD_PIN[1], NEO_GRB + NEO_KHZ800),
  Adafruit_NeoPixel(LENSES_PER_HEAD, HEAD_PIN[2], NEO_GRB + NEO_KHZ800),
  Adafruit_NeoPixel(LENSES_PER_HEAD, HEAD_PIN[3], NEO_GRB + NEO_KHZ800),
};

// Cap brightness per Section 9's brownout mitigation (~60%).
#define BRIGHTNESS 153  // 60% of 255

void showAllOff() {
  for (int h = 0; h < HEADS_WIRED; h++) {
    heads[h].clear();
    heads[h].show();
  }
}

void setup() {
  Serial.begin(115200);
  for (int h = 0; h < HEADS_WIRED; h++) {
    heads[h].begin();
    heads[h].setBrightness(BRIGHTNESS);
  }
  showAllOff();
  Serial.print("TRINETRA bench test starting, heads wired: ");
  Serial.println(HEADS_WIRED);
}

// Cycles every lens on every wired head through red, amber, green, off — one
// lens at a time. Watch for aperture bleed once heads are assembled behind
// acrylic (Section 3's baffle note); on the open bench there is nothing to
// bleed into yet, this just proves addressing and color are both correct.
void loop() {
  for (int h = 0; h < HEADS_WIRED; h++) {
    for (int i = 0; i < LENSES_PER_HEAD; i++) {
      showAllOff();
      Serial.print("Head ");
      Serial.print(h);
      Serial.print(" lens ");
      Serial.print(i);
      Serial.println(": RED");
      heads[h].setPixelColor(i, heads[h].Color(255, 0, 0));
      heads[h].show();
      delay(600);

      Serial.print("Head ");
      Serial.print(h);
      Serial.print(" lens ");
      Serial.print(i);
      Serial.println(": AMBER");
      heads[h].setPixelColor(i, heads[h].Color(255, 120, 0));
      heads[h].show();
      delay(600);

      Serial.print("Head ");
      Serial.print(h);
      Serial.print(" lens ");
      Serial.print(i);
      Serial.println(": GREEN");
      heads[h].setPixelColor(i, heads[h].Color(0, 255, 0));
      heads[h].show();
      delay(600);
    }
  }

  // All-on white pulse only if you're deliberately checking the worst-case
  // current draw from Section 5.6 with a multimeter in line. Comment out
  // otherwise -- it's the highest-risk moment for a brownout on USB power.
  // for (int h = 0; h < HEADS_WIRED; h++) {
  //   heads[h].fill(heads[h].Color(255, 255, 255));
  //   heads[h].show();
  // }
  // delay(1000);
  // showAllOff();
}
