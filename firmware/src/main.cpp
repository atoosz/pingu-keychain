// Pingu: a penguin on a portrait 64x128 OLED that mirrors what the Mac is doing (state arrives over BLE).
#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <Preferences.h>
#include <Update.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include "sprites.h"

// If the image is garbled or shifted, swap to: U8G2_SH1106_128X64_NONAME_F_HW_I2C
// If Pingu is upside down, swap U8G2_R3 <-> U8G2_R1.
U8G2_SSD1306_128X64_NONAME_F_HW_I2C oled(U8G2_R1, U8X8_PIN_NONE, /*SCL*/ 22, /*SDA*/ 21);

#define SERVICE_UUID "6e9b0001-5c1a-4f6e-9a3d-50494e475531"
#define STATE_UUID   "6e9b0002-5c1a-4f6e-9a3d-50494e475531"
#define OTA_UUID     "6e9b0003-5c1a-4f6e-9a3d-50494e475531"
#define TEXT_UUID    "6e9b0004-5c1a-4f6e-9a3d-50494e475531"

// Must match State in mac/Pingu.swift
enum State : uint8_t { SLEEP, IDLE, CODING, VIDEO, MUSIC, MEETING, CHILL, COFFEE, DROWSY, STATE_COUNT };
static const Anim* ANIMS[STATE_COUNT] = {&ANIM_SLEEP, &ANIM_IDLE, &ANIM_CODING, &ANIM_VIDEO, &ANIM_MUSIC,
                                         &ANIM_MEETING, &ANIM_CHILL, &ANIM_COFFEE, &ANIM_DROWSY};
static const char* LABELS[STATE_COUNT] = {"zzz", "idle", "coding", "video", "music", "meeting", "chill", "coffee", "sleepy"};

const uint8_t PINS[4] = {32, 33, 25, 26};  // K1 bright+, K2 bright-, K3 BLE icon, K4 poke (hold = arm update)
const uint8_t CONTRAST[] = {0, 1, 60, 255};  // level 0 = screen off
const uint32_t HEARTBEAT_TIMEOUT_MS = 15000;  // Mac writes every 2s
const uint32_t POKE_MS = 1500;
const uint32_t NAP_DARK_MS = 30UL * 60 * 1000;  // burn-in: screen off after 30 min of napping
const uint32_t SHIFT_MS = 3UL * 60 * 1000;      // burn-in: nudge everything 1px every 3 min
const uint32_t ARM_HOLD_MS = 3000, ARM_WINDOW_MS = 120000;
const uint32_t OTA_ACK_EVERY = 4096;  // Mac waits for an ack per 4KB so the BLE stack can't overflow
const uint32_t LONG_PRESS_MS = 1000;  // K3 long press: switch text <-> Pingu
const uint32_t BOB_MS = 1500;         // text bob period
// Text rules, same as `pingu text` on the Mac: printable ASCII, <= 20 chars, no word longer than 9.
const size_t TEXT_MAX = 20, WORD_MAX = 9;

Preferences prefs;
uint8_t level, lastOnLevel;
bool showIcon;
volatile uint8_t macState = SLEEP;
volatile uint32_t lastMsgMs = 0;
volatile bool connected = false;
uint32_t pokeUntil = 0, sleepSince = 0, otaArmedUntil = 0;
bool btnDown[4];
uint32_t btnDownSince[4];

// Custom text: written by the BLE task into pendingText, adopted (and saved) by loop().
char text[TEXT_MAX + 1] = "";
bool textHidden = false;  // K3 long press shows Pingu without deleting the text
char pendingText[TEXT_MAX + 1];
volatile bool textPending = false;
portMUX_TYPE textMux = portMUX_INITIALIZER_UNLOCKED;
// Current layout of `text`: largest font where it fits, wrapped at spaces.
const uint8_t* textFont;
char textLines[4][TEXT_MAX + 1];
uint8_t textLineCount = 0;
int textLineH = 0;

// OTA state, written from the BLE task
volatile bool otaActive = false, otaReboot = false;
volatile uint32_t otaSize = 0, otaGot = 0, otaNextAck = 0;
BLECharacteristic* otaChar;

enum : uint8_t { OTA_BEGIN = 1, OTA_DATA = 2, OTA_END = 3, OTA_ERR = 0xEE };

void otaReply(uint8_t op, uint32_t v) {
  uint8_t b[5] = {op, (uint8_t)v, (uint8_t)(v >> 8), (uint8_t)(v >> 16), (uint8_t)(v >> 24)};
  otaChar->setValue(b, 5);
  otaChar->notify();
}

void otaFail(uint32_t code) {
  if (otaActive) Update.abort();
  otaActive = false;
  otaReply(OTA_ERR, code);
}

struct StateCb : BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    String v = c->getValue();
    if (v.length() >= 1 && (uint8_t)v[0] < STATE_COUNT) {  // ignore junk from other BLE clients
      macState = v[0];
      lastMsgMs = millis();
    }
  }
};

// Protocol: [1, size u32] begin -> [1, 0] ok / ERR; [2, bytes...] data -> [2, received u32] every 4KB and at the end;
// [3] end -> [3, 0] ok then reboot. Begin only works within 2 min of holding K4 (physical presence = authorization).
struct OtaCb : BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    uint8_t* d = c->getData();
    size_t n = c->getLength();
    if (n < 1) return;
    lastMsgMs = millis();  // keep the link "alive" while the agent is replaced by the uploader
    switch (d[0]) {
      case OTA_BEGIN: {
        if (n < 5) return otaFail(4);
        if (millis() > otaArmedUntil) return otaFail(1);  // not armed: hold K4 for 3s
        uint32_t size = d[1] | d[2] << 8 | d[3] << 16 | (uint32_t)d[4] << 24;
        if (otaActive) Update.abort();
        if (!Update.begin(size)) return otaFail(2);
        otaSize = size; otaGot = 0; otaNextAck = OTA_ACK_EVERY; otaActive = true;
        Serial.printf("OTA begin %lu bytes\n", (unsigned long)size);
        return otaReply(OTA_BEGIN, 0);
      }
      case OTA_DATA:
        if (!otaActive) return otaFail(5);
        if (Update.write(d + 1, n - 1) != n - 1) return otaFail(3);
        otaGot += n - 1;
        if (otaGot >= otaNextAck || otaGot >= otaSize) {
          otaNextAck = (otaGot / OTA_ACK_EVERY + 1) * OTA_ACK_EVERY;
          otaReply(OTA_DATA, otaGot);
        }
        return;
      case OTA_END:
        if (!otaActive || otaGot != otaSize || !Update.end(true)) return otaFail(6);  // end() verifies the image hash
        otaActive = false;
        Serial.println("OTA done, rebooting");
        otaReply(OTA_END, 0);
        otaReboot = true;
        return;
    }
  }
};

bool validText(const uint8_t* d, size_t n) {
  if (n > TEXT_MAX) return false;
  size_t word = 0;
  for (size_t i = 0; i < n; i++) {
    if (d[i] < 0x20 || d[i] > 0x7E) return false;
    word = d[i] == ' ' ? 0 : word + 1;
    if (word > WORD_MAX) return false;
  }
  return true;
}

// Write: the text bytes (empty = clear). Invalid text from other BLE clients is ignored.
struct TextCb : BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    uint8_t* d = c->getData();
    size_t n = c->getLength();
    if (!validText(d, n)) return;
    portENTER_CRITICAL(&textMux);
    memcpy(pendingText, d, n);
    pendingText[n] = 0;
    textPending = true;
    portEXIT_CRITICAL(&textMux);
  }
};

// Pick the largest font where every line fits in 62px and all lines fit in 100px; wrap greedily at spaces.
void layoutText() {
  static const uint8_t* const FONTS[] = {u8g2_font_logisoso24_tr, u8g2_font_helvB18_tr, u8g2_font_helvB14_tr,
                                         u8g2_font_helvB10_tr, u8g2_font_6x13B_tr};
  for (const uint8_t* font : FONTS) {
    oled.setFont(font);
    int lineH = oled.getAscent() - oled.getDescent() + 3;
    uint8_t count = 0;
    bool fits = true;
    char line[TEXT_MAX + 1] = "";
    char buf[TEXT_MAX + 1];
    strcpy(buf, text);
    for (char* w = strtok(buf, " "); w && fits; w = strtok(nullptr, " ")) {
      char tryLine[2 * TEXT_MAX + 2];
      snprintf(tryLine, sizeof tryLine, line[0] ? "%s %s" : "%s%s", line, w);
      if (oled.getStrWidth(tryLine) <= 62) { strcpy(line, tryLine); continue; }
      if (!line[0] || oled.getStrWidth(w) > 62 || count == 3) { fits = false; break; }
      strcpy(textLines[count++], line);
      strcpy(line, w);
    }
    if (line[0] && fits) strcpy(textLines[count++], line);
    if (fits && count * lineH <= 100) { textFont = font; textLineCount = count; textLineH = lineH; break; }
  }
  oled.setFont(u8g2_font_6x10_tf);
}

void drawText(int ox, int oy, uint32_t now) {
  int bob = lroundf(2 * sinf(now * 2 * PI / BOB_MS));
  oled.setFont(textFont);
  int top = 64 - (textLineCount * textLineH - 3) / 2 + bob + oy;
  for (uint8_t i = 0; i < textLineCount; i++) {
    int w = oled.getStrWidth(textLines[i]);
    oled.drawStr((64 - w) / 2 + ox, top + oled.getAscent() + i * textLineH, textLines[i]);
  }
  oled.setFont(u8g2_font_6x10_tf);
}

struct ServerCb : BLEServerCallbacks {
  void onConnect(BLEServer*) override { connected = true; lastMsgMs = millis(); }
  void onDisconnect(BLEServer*) override {
    connected = false;
    if (otaActive) { Update.abort(); otaActive = false; }
    BLEDevice::startAdvertising();
  }
};

void applyLevel() {
  if (level) { oled.setContrast(CONTRAST[level]); lastOnLevel = level; }
  prefs.putUChar("level", level);
}

// 1 on press, -1 on release, 0 otherwise (active-low with pull-up, 30ms debounce); tracks held state in btnDown.
int8_t edge(uint8_t i) {
  static bool last[4] = {true, true, true, true};
  static uint32_t changed[4];
  bool now = digitalRead(PINS[i]);
  if (now != last[i] && millis() - changed[i] > 30) {
    changed[i] = millis();
    last[i] = now;
    btnDown[i] = !now;
    if (!now) btnDownSince[i] = millis();
    return now ? -1 : 1;
  }
  return 0;
}
bool pressed(uint8_t i) { return edge(i) == 1; }

void drawBleIcon(int x, int y) {  // 6x10 bluetooth rune
  oled.drawLine(x + 2, y, x + 2, y + 9);
  oled.drawLine(x + 2, y, x + 5, y + 3);
  oled.drawLine(x + 5, y + 3, x, y + 7);
  oled.drawLine(x, y + 2, x + 5, y + 6);
  oled.drawLine(x + 5, y + 6, x + 2, y + 9);
}

void drawCentered(const char* s, int y, int ox) { oled.drawStr((64 - oled.getStrWidth(s)) / 2 + ox, y, s); }

void setup() {
  Serial.begin(115200);
  for (uint8_t p : PINS) pinMode(p, INPUT_PULLUP);

  prefs.begin("pingu");
  level = prefs.getUChar("level", 3);
  showIcon = prefs.getBool("icon", true);
  lastOnLevel = level ? level : 3;
  prefs.getString("text", text, sizeof text);
  if (!validText((const uint8_t*)text, strlen(text))) text[0] = 0;
  textHidden = prefs.getBool("thide", false);

  oled.begin();
  applyLevel();
  oled.setFont(u8g2_font_6x10_tf);
  layoutText();

  BLEDevice::init("Pingu");
  BLEDevice::setMTU(517);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCb());
  BLEService* svc = server->createService(SERVICE_UUID);
  BLECharacteristic* ch = svc->createCharacteristic(
      STATE_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  ch->setCallbacks(new StateCb());
  otaChar = svc->createCharacteristic(OTA_UUID, BLECharacteristic::PROPERTY_WRITE |
                                                    BLECharacteristic::PROPERTY_WRITE_NR |
                                                    BLECharacteristic::PROPERTY_NOTIFY);
  otaChar->addDescriptor(new BLE2902());
  otaChar->setCallbacks(new OtaCb());
  svc->createCharacteristic(TEXT_UUID, BLECharacteristic::PROPERTY_WRITE)->setCallbacks(new TextCb());
  svc->start();
  BLEDevice::getAdvertising()->addServiceUUID(SERVICE_UUID);
  BLEDevice::startAdvertising();
  Serial.println("Pingu advertising");
}

void loop() {
  uint32_t now = millis();
  if (otaReboot) { delay(500); ESP.restart(); }

  bool any = false;
  if (pressed(0)) { any = true; if (level < 3) { level++; applyLevel(); } }
  if (pressed(1)) { any = true; if (level > 0) { level--; applyLevel(); } }
  // K3: short press = BLE icon, long press = switch text <-> Pingu (once per hold)
  static bool k3Long = false;
  int8_t k3 = edge(2);
  if (k3 == 1) { any = true; k3Long = false; }
  if (btnDown[2] && !k3Long && now - btnDownSince[2] > LONG_PRESS_MS) {
    k3Long = true;
    if (text[0]) { textHidden = !textHidden; prefs.putBool("thide", textHidden); }
  }
  if (k3 == -1 && !k3Long) { showIcon = !showIcon; prefs.putBool("icon", showIcon); }
  if (pressed(3)) {
    any = true;
    pokeUntil = now + POKE_MS;
    if (level == 0) { level = lastOnLevel; applyLevel(); }
  }
  if (btnDown[3] && now - btnDownSince[3] > ARM_HOLD_MS && now > otaArmedUntil) {
    otaArmedUntil = now + ARM_WINDOW_MS;
    Serial.println("OTA armed for 2 min");
  }

  if (textPending) {
    portENTER_CRITICAL(&textMux);
    strcpy(text, pendingText);
    textPending = false;
    portEXIT_CRITICAL(&textMux);
    prefs.putString("text", text);
    textHidden = false;
    prefs.putBool("thide", false);
    layoutText();
    any = true;
    Serial.printf("text \"%s\"\n", text);
  }
  bool textMode = text[0] && !textHidden;

  bool alive = connected && now - lastMsgMs < HEARTBEAT_TIMEOUT_MS;
  uint8_t st = alive ? macState : (uint8_t)SLEEP;
  static uint8_t printed = 255;
  if (st != printed) { Serial.printf("state %s\n", LABELS[st]); printed = st; }

  if (st != SLEEP || any) sleepSince = now;
  bool updating = otaActive || now < otaArmedUntil;
  bool dark = level == 0 || (now - sleepSince > NAP_DARK_MS && !updating && !textMode);  // text never auto-offs
  static bool wasDark = false;
  if (dark != wasDark) { oled.setPowerSave(dark); wasDark = dark; }
  if (dark) { delay(20); return; }

  uint8_t shift = (now / SHIFT_MS) % 4;
  int ox = shift == 1 || shift == 2, oy = shift >= 2;

  oled.clearBuffer();
  if (updating) {
    char pct[8];
    snprintf(pct, sizeof pct, "%u%%", otaSize ? (unsigned)(100ULL * otaGot / otaSize) : 0);
    drawCentered("update", 56 + oy, ox);
    drawCentered(otaActive ? pct : "ready", 70 + oy, ox);
  } else if (textMode && now >= pokeUntil) {
    drawText(ox, oy, now);
  } else {
    bool poking = now < pokeUntil;
    const Anim* a = poking ? &ANIM_POKE : ANIMS[st];
    uint8_t f = (now / a->ms) % a->count;
    oled.drawXBMP(ox, 14 + oy, SPRITE_W, SPRITE_H, a->frames[f]);
    drawCentered(poking ? "hey!" : LABELS[st], 124 + oy, ox);
  }
  if (showIcon && (connected || (now / 500) % 2)) drawBleIcon(57 - ox, 1 + oy);  // blinks while disconnected
  oled.sendBuffer();
  delay(20);
}
