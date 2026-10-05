// TRINETRA physical rig — live signal link (the production sketch).
//
// Lights the 4 signal heads exactly as the AI's simulation shows them, from
// lines the backend sends over USB serial (backend/hardware/serial_link.py,
// PROJECT_ARCHITECTURE_REPORT.md Section 43). Flash this AFTER every head
// has passed firmware/bench_test with the same wiring.
//
// Wiring (unchanged from the bench test / handoff doc):
//   4 heads, each its OWN 4-pixel chain on its OWN pin, via a 470 ohm resistor:
//     Head 1 = SOUTH  -> GPIO 13
//     Head 2 = EAST   -> GPIO 4
//     Head 3 = NORTH  -> GPIO 16
//     Head 4 = WEST   -> GPIO 17
//   Lenses per head, in chain order: [0] red circle, [1] amber circle,
//   [2] combined left+ahead arrow, [3] right arrow.
//   Pixel GND must be shared with the ESP32 GND.
//
// Protocol (115200 baud, one line each, '\n'-terminated):
//   L<16 chars>  all 16 lenses, 4 per head in the order above; each char is
//                R (red), A (amber), G (green) or 0 (off)
//   I            no simulation running: idle pattern (every head's red circle)
//   ?            the board answers "TRINETRA signal link 1"
// The backend repeats the current line every second as a heartbeat.
//
// What you will see:
//   power-on      a quick sweep of every lens (red, amber, green) — wiring check
//   waiting       all amber circles blink slowly — no backend talking yet
//   idle          all red circles steady — console up, no simulation running
//   live          the heads follow the simulation
//   link lost     amber circles blink again if no line arrives for 3 s
//                 (cable pulled, console closed) — the safe "signal fault" look
// The board's own blue LED (GPIO 2) flickers on every line received.

#include <Adafruit_NeoPixel.h>

// Colour order of the pixels. If the power-on sweep shows red and green
// swapped (red lens lights green), change NEO_GRB to NEO_RGB and re-upload.
#define PIXEL_ORDER NEO_GRB
// Most WS2811/WS2812 run at 800 kHz; if lights flicker or stay dark with
// good wiring, try NEO_KHZ400.
#define PIXEL_SPEED NEO_KHZ800

#define LENSES_PER_HEAD 4
#define NUM_HEADS 4
// Raise to 4 once all heads are wired (the same as the bench test).
#define HEADS_WIRED 4

const uint8_t HEAD_PIN[NUM_HEADS] = {13, 4, 16, 17};

Adafruit_NeoPixel heads[NUM_HEADS] = {
  Adafruit_NeoPixel(LENSES_PER_HEAD, HEAD_PIN[0], PIXEL_ORDER + PIXEL_SPEED),
  Adafruit_NeoPixel(LENSES_PER_HEAD, HEAD_PIN[1], PIXEL_ORDER + PIXEL_SPEED),
  Adafruit_NeoPixel(LENSES_PER_HEAD, HEAD_PIN[2], PIXEL_ORDER + PIXEL_SPEED),
  Adafruit_NeoPixel(LENSES_PER_HEAD, HEAD_PIN[3], PIXEL_ORDER + PIXEL_SPEED),
};

#define BRIGHTNESS 153              // 60%: the brownout cap from the handoff doc
#define LINK_LED 2
#define LINK_TIMEOUT_MS 3000
#define BLINK_MS 600

char line[32];
uint8_t len = 0;
unsigned long lastLineMs = 0;
bool linked = false;                // a valid line arrived within LINK_TIMEOUT_MS
int8_t blinkShown = -1;             // last blink phase drawn while waiting / lost

uint32_t colourOf(char c) {
  switch (c) {
    case 'R': return Adafruit_NeoPixel::Color(255, 0, 0);
    case 'A': return Adafruit_NeoPixel::Color(255, 120, 0);
    case 'G': return Adafruit_NeoPixel::Color(0, 255, 0);
    default:  return 0;
  }
}

bool validLens(char c) {
  return c == 'R' || c == 'A' || c == 'G' || c == '0';
}

void showAll() {
  for (int h = 0; h < HEADS_WIRED; h++) heads[h].show();
}

void clearAll() {
  for (int h = 0; h < HEADS_WIRED; h++) heads[h].clear();
}

// Every head shows the same thing on one lens (idle red, fault amber).
void oneLensEverywhere(uint8_t lens, uint32_t colour) {
  clearAll();
  for (int h = 0; h < HEADS_WIRED; h++) heads[h].setPixelColor(lens, colour);
  showAll();
}

void applyFrame(const char* f) {
  for (int h = 0; h < HEADS_WIRED; h++) {
    for (int i = 0; i < LENSES_PER_HEAD; i++) {
      heads[h].setPixelColor(i, colourOf(f[h * LENSES_PER_HEAD + i]));
    }
  }
  showAll();
}

void selfTest() {
  const uint32_t colours[3] = {colourOf('R'), colourOf('A'), colourOf('G')};
  for (int h = 0; h < HEADS_WIRED; h++) {
    for (int i = 0; i < LENSES_PER_HEAD; i++) {
      for (int c = 0; c < 3; c++) {
        heads[h].clear();
        heads[h].setPixelColor(i, colours[c]);
        heads[h].show();
        delay(70);
      }
    }
    heads[h].clear();
    heads[h].show();
  }
}

void handleLine() {
  line[len] = '\0';
  if (line[0] == 'L' && len == 1 + NUM_HEADS * LENSES_PER_HEAD) {
    for (int k = 1; k < len; k++) {
      if (!validLens(line[k])) return;  // a garbled line: ignore it entirely
    }
    applyFrame(line + 1);
  } else if (line[0] == 'I' && len == 1) {
    oneLensEverywhere(0, colourOf('R'));
  } else if (line[0] == '?') {
    Serial.println("TRINETRA signal link 1");
    return;
  } else {
    return;  // unknown: ignore
  }
  lastLineMs = millis();
  linked = true;
  blinkShown = -1;
  digitalWrite(LINK_LED, !digitalRead(LINK_LED));
}

void setup() {
  Serial.begin(115200);
  pinMode(LINK_LED, OUTPUT);
  for (int h = 0; h < HEADS_WIRED; h++) {
    heads[h].begin();
    heads[h].setBrightness(BRIGHTNESS);
  }
  clearAll();
  showAll();
  selfTest();
  Serial.print("TRINETRA signal link ready, heads wired: ");
  Serial.println(HEADS_WIRED);
}

void loop() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (len > 0) handleLine();
      len = 0;
    } else if (len < sizeof(line) - 1) {
      line[len++] = c;
    } else {
      len = 0;  // overlong line: drop it
    }
  }

  // No line for a while (or none yet): blink the amber circles — a real
  // signal's fault mode, so a dead link never shows a stale green.
  if (linked && millis() - lastLineMs > LINK_TIMEOUT_MS) {
    linked = false;
    digitalWrite(LINK_LED, LOW);
  }
  if (!linked) {
    int8_t phase = (millis() / BLINK_MS) % 2;
    if (phase != blinkShown) {
      blinkShown = phase;
      oneLensEverywhere(1, phase ? colourOf('A') : 0);
    }
  }
}
