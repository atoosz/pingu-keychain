// Pingu Mac agent: figures out what you're doing and sends it to the ESP32 over BLE.
import AppKit
import CoreBluetooth

// Must match State in firmware/src/main.cpp
enum State: UInt8 { case sleep, idle, coding, video, music, meeting, chill, coffee, drowsy }

let serviceUUID = CBUUID(string: "6e9b0001-5c1a-4f6e-9a3d-50494e475531")
let stateUUID = CBUUID(string: "6e9b0002-5c1a-4f6e-9a3d-50494e475531")
let otaUUID = CBUUID(string: "6e9b0003-5c1a-4f6e-9a3d-50494e475531")

let codingApps: Set<String> = [
    "com.microsoft.VSCode", "com.todesktop.230313mzl4w4u92" /* Cursor */, "com.apple.dt.Xcode",
    "com.apple.Terminal", "com.googlecode.iterm2", "dev.warp.Warp-Stable", "com.mitchellh.ghostty",
    "com.anthropic.claudefordesktop",
]
let videoApps: Set<String> = ["com.apple.QuickTimePlayerX", "com.colliderli.iina", "org.videolan.vlc", "com.apple.TV"]
let meetingApps: Set<String> = ["com.apple.FaceTime", "us.zoom.xos", "com.hnc.Discord", "com.microsoft.teams2"]
let musicApps: Set<String> = ["com.spotify.client", "com.apple.Music"]
let brave = "com.brave.Browser"
let videoHosts = ["youtube.com", "youtu.be", "netflix.com", "twitch.tv", "disneyplus.com", "primevideo.com",
                  "hulu.com", "max.com", "vimeo.com", "crunchyroll.com", "tv.apple.com"]
let codingHosts = ["claude.ai", "github.com", "localhost", "127.0.0.1", "stackoverflow.com"]
let idleAfter: Double = 5 * 60

func runScript(_ src: String) -> String? {
    var err: NSDictionary?
    return NSAppleScript(source: src)?.executeAndReturnError(&err).stringValue
}

func isRunning(_ id: String) -> Bool { !NSRunningApplication.runningApplications(withBundleIdentifier: id).isEmpty }

func host(_ url: String, matches hosts: [String]) -> Bool {
    guard let h = URL(string: url)?.host?.lowercased() else { return false }
    return hosts.contains { h == $0 || h.hasSuffix("." + $0) }
}

func screenLocked() -> Bool {
    let d = CGSessionCopyCurrentDictionary() as? [String: Any]
    return d?["CGSSessionScreenIsLocked"] as? Bool ?? false
}

func musicPlaying() -> Bool {
    // Only ask running players; `tell application` would launch them otherwise.
    musicApps.contains { id in
        isRunning(id) && runScript("tell application id \"\(id)\" to player state as string") == "playing"
    }
}

var displaysAsleep = false

// Time of day only flavors the "nothing in particular" states.
func detect() -> State {
    let s = activity()
    guard s == .chill || s == .idle else { return s }
    switch Calendar.current.component(.hour, from: Date()) {
    case 6..<10: return .coffee
    case 0..<5: return .drowsy
    default: return s
    }
}

func activity() -> State {
    if displaysAsleep || screenLocked() { return .sleep }
    let front = NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? ""
    let url = front == brave ? (runScript("tell application id \"\(brave)\" to get URL of active tab of front window") ?? "") : ""

    if meetingApps.contains(front) || host(url, matches: ["meet.google.com"]) { return .meeting }
    if videoApps.contains(front) || host(url, matches: videoHosts) { return .video }
    if codingApps.contains(front) || host(url, matches: codingHosts) { return .coding }
    if musicApps.contains(front) || musicPlaying() { return .music }
    let anyInput = CGEventType(rawValue: ~0)!
    if CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: anyInput) > idleAfter { return .idle }
    return .chill
}

final class Link: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    var central: CBCentralManager!
    var peripheral: CBPeripheral?
    var stateChar: CBCharacteristic?
    var last: State?

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
    }

    func send(_ s: State) {
        if s != last { NSLog("Pingu state: \(s)"); last = s }
        guard let p = peripheral, let c = stateChar, p.state == .connected else { return }
        p.writeValue(Data([s.rawValue]), for: c, type: .withoutResponse)
    }

    func scan() {
        guard central.state == .poweredOn else { return }
        central.scanForPeripherals(withServices: [serviceUUID])
    }

    func centralManagerDidUpdateState(_ c: CBCentralManager) {
        NSLog("Bluetooth state: \(c.state.rawValue)")
        scan()
    }

    func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral, advertisementData: [String: Any], rssi: NSNumber) {
        c.stopScan()
        peripheral = p
        p.delegate = self
        c.connect(p)
    }

    func centralManager(_ c: CBCentralManager, didConnect p: CBPeripheral) {
        NSLog("Connected to Pingu")
        p.discoverServices([serviceUUID])
    }

    func centralManager(_ c: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) { reset() }
    func centralManager(_ c: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
        NSLog("Disconnected from Pingu")
        reset()
    }

    func reset() { peripheral = nil; stateChar = nil; scan() }

    func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        p.services?.filter { $0.uuid == serviceUUID }.forEach { p.discoverCharacteristics([stateUUID], for: $0) }
    }

    func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
        stateChar = s.characteristics?.first { $0.uuid == stateUUID }
        if let st = last { send(st) }
    }
}

// Firmware update over BLE (see OtaCb in firmware/src/main.cpp for the protocol). Run via firmware/ota.sh.
final class Uploader: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    let fw: Data
    var central: CBCentralManager!
    var peripheral: CBPeripheral?
    var ch: CBCharacteristic?
    var sent = 0, acked = 0, chunk = 0, lastPct = -1
    var lastProgress = Date(), started = Date()
    var begun = false, ending = false, asked = false

    init(_ fw: Data) {
        self.fw = fw
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
        Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [unowned self] _ in
            if !self.begun && Date().timeIntervalSince(self.started) > 90 { self.fail("gave up waiting (was K4 held for 3s?)") }
            if self.begun && Date().timeIntervalSince(self.lastProgress) > 20 { self.fail("stalled") }
        }
    }

    func say(_ s: String) { print(s); fflush(stdout) }
    func fail(_ why: String) { say("OTA FAILED: \(why)"); exit(1) }

    func centralManagerDidUpdateState(_ c: CBCentralManager) {
        guard c.state == .poweredOn else { return say("waiting for Bluetooth (state \(c.state.rawValue))") }
        say("looking for Pingu...")
        c.scanForPeripherals(withServices: [serviceUUID])
    }
    func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral, advertisementData: [String: Any], rssi: NSNumber) {
        c.stopScan(); peripheral = p; p.delegate = self; c.connect(p)
    }
    func centralManager(_ c: CBCentralManager, didConnect p: CBPeripheral) { p.discoverServices([serviceUUID]) }
    func centralManager(_ c: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) { fail("disconnected") }
    func centralManager(_ c: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) { fail("couldn't connect") }

    func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        guard let s = p.services?.first(where: { $0.uuid == serviceUUID }) else { return fail("no Pingu service") }
        p.discoverCharacteristics([otaUUID], for: s)
    }
    func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
        guard let c = s.characteristics?.first(where: { $0.uuid == otaUUID }) else {
            return fail("this Pingu firmware has no update support; flash it over USB once")
        }
        ch = c
        p.setNotifyValue(true, for: c)
    }
    func peripheral(_ p: CBPeripheral, didUpdateNotificationStateFor c: CBCharacteristic, error: Error?) {
        if let error { return fail("notify: \(error.localizedDescription)") }
        sendBegin()
    }

    func sendBegin() {
        var b = Data([1]); var n = UInt32(fw.count).littleEndian
        b.append(Data(bytes: &n, count: 4))
        peripheral?.writeValue(b, for: ch!, type: .withResponse)
    }

    func peripheral(_ p: CBPeripheral, didUpdateValueFor c: CBCharacteristic, error: Error?) {
        guard let v = c.value, v.count >= 5 else { return }
        let arg = Int(v[1]) | Int(v[2]) << 8 | Int(v[3]) << 16 | Int(v[4]) << 24
        switch v[0] {
        case 1:
            begun = true; lastProgress = Date()
            chunk = p.maximumWriteValueLength(for: .withoutResponse) - 1
            say("sending \(fw.count) bytes in \(chunk)-byte chunks")
            pump()
        case 2:
            acked = arg; lastProgress = Date()
            let pct = acked * 100 / fw.count
            if pct / 10 != lastPct / 10 { say("\(pct)%"); lastPct = pct }
            pump()
        case 3:
            say("OTA OK, Pingu is rebooting"); exit(0)
        case 0xEE where arg == 1:
            if !asked { say("Hold K4 on Pingu for 3 seconds (screen shows 'update ready')..."); asked = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.sendBegin() }
        default:
            fail("device error \(arg)")
        }
    }

    // Stay at most 4KB ahead of the last ack; the ESP32 acks each 4KB once it's in flash.
    func pump() {
        guard let p = peripheral, let c = ch, begun, !ending else { return }
        while sent < fw.count && sent - acked < 4096 && p.canSendWriteWithoutResponse {
            let n = min(chunk, fw.count - sent)
            p.writeValue(Data([2]) + fw.subdata(in: sent..<sent + n), for: c, type: .withoutResponse)
            sent += n
        }
        if acked == fw.count {
            ending = true
            p.writeValue(Data([3]), for: c, type: .withResponse)
        }
    }
    func peripheralIsReady(toSendWriteWithoutResponse p: CBPeripheral) { pump() }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

if let i = CommandLine.arguments.firstIndex(of: "--ota"), i + 1 < CommandLine.arguments.count {
    let path = CommandLine.arguments[i + 1]
    guard let fw = FileManager.default.contents(atPath: path) else { print("can't read \(path)"); exit(1) }
    let up = Uploader(fw)
    withExtendedLifetime(up) { app.run() }
}

let link = Link()

let nc = NSWorkspace.shared.notificationCenter
nc.addObserver(forName: NSWorkspace.screensDidSleepNotification, object: nil, queue: .main) { _ in displaysAsleep = true; link.send(.sleep) }
nc.addObserver(forName: NSWorkspace.screensDidWakeNotification, object: nil, queue: .main) { _ in displaysAsleep = false }
nc.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { _ in link.send(.sleep) }

// Poll every 2s; every send doubles as the heartbeat the ESP32 times out on.
Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { _ in link.send(detect()) }
app.run()
