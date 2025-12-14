---
title: "Radio Telemetry Tracker"
summary: "Tracking small wildlife using radio telemetry."
image: /assets/images/projects/radio-telemetry-tracker/cover.png
date: 2025-10-12
date_range: "Dec 2024 – Oct 2025"
---

Radio Telemetry Tracker (RTT) is a long-running project under [Engineers for Exploration](https://e4e.ucsd.edu/) that supports field researchers—most notably the [San Diego Zoo Wildlife Alliance](https://sandiegozoowildlifealliance.org/)—in tracking small wildlife using radio telemetry.

Traditionally, researchers locate animals by walking transects with a directional antenna and handheld receiver, listening for beacon “beeps” and manually triangulating positions. This works, but it’s slow, physically demanding, and doesn’t scale when multiple animals are tagged.

![Handing a radio telemetry receiver](/assets/images/projects/radio-telemetry-tracker/terrestrial-tracking.png)

RTT automates this workflow by mounting a directional antenna and software-defined radio (SDR) on a drone (and later, tower prototypes), enabling rapid aerial surveys. The SDR captures tag signals; onboard software detects pings and estimates locations in (near) real time, streaming telemetry to a ground station UI.

> I led RTT for a little over a year. Most work described here was done during my lead period, after reviving a dormant system and updating it for new hardware/software. For granular contributions and implementation details, see the repositories listed at the end.

---

## System overview

At a high level, RTT is a closed loop:

1. **Plan a flight** (pre-programmed search pattern).
2. **Collect RF** (SDR + directional antenna + LNA).
3. **Detect pings** (digital signal processing).
4. **Fuse with GPS** (timestamp alignment).
5. **Estimate location** (incremental localization per frequency).
6. **Visualize + log** (offline-capable ground control UI).

![RTT System Diagram](/assets/images/projects/radio-telemetry-tracker/system-diagram.png)

### Data flow (bird’s-eye view)

- **Drone payload (Field Device Software / FDS)**  
  - Reads GPS + heading
  - Streams SDR IQ → detects pings (frequency + amplitude + time)
  - Associates pings with nearest GPS sample
  - Produces:
    - raw ping events (for replay + auditing)
    - rolling location estimate(s) per transmitter frequency

- **Ground Control Station (GCS)**  
  - Configures scan parameters (gain, sample rate, target freqs, etc.)
  - Starts/stops missions
  - Displays live GPS track + pings + estimates on an offline map
  - Logs everything for post-flight review

---

## Hardware refresh

When I took over, the project had been dormant and the prior build targeted outdated hardware. Our goals for the refresh:

- **Easy to assemble** (field-friendly)
- **Enough compute for real-time DSP**
- **Reliable comms + logging**
- **Modular interfaces** (so we can swap radios/SDRs/GPS)

![Drone payload hardware](/assets/images/projects/radio-telemetry-tracker/payload-sketch.png)

### Selected parts

- **Single Board Computer (SBC):** [UP 7000](https://up-board.org/up-7000/) (Intel N100, 8GB RAM, 64GB eMMC)  
  Chosen for x86 library compatibility (DSP tooling tends to be better supported on x86 than ARM), while still fitting Raspberry Pi–style mounts/cases.

- **GPS + Compass:** [SparkFun NEO-M9N Breakout](https://www.sparkfun.com/sparkfun-gps-breakout-neo-m9n-u-fl-qwiic.html)  
  Standard, accurate, and easy to integrate.

- **SDR:** [USRP B200mini-i](https://www.ettus.com/all-products/usrp-b200mini-i-2/)  
  Expensive, but excellent performance, flexible gain control, and a path toward FPGA acceleration later.

- **LNA:** [Nooelec LaNA](https://www.nooelec.com/store/lana-hf.html?srsltid=AfmBOoqwLbh6hxC3xmvELjncdXAc9Wetn3pHsgLRJXrScxdSBU05qGAo)  
  Boosts weak tag signals.

- **Telemetry radio:** [SiK V3](https://holybro.com/products/sik-telemetry-radio-v3?srsltid=AfmBOoo95aOtVEpdWJP9iJNevzTO8xftlk6cM11lsCG-CIGM2XQxL0Sw)  
  In hindsight, not the best choice: we ended up needing an aluminum enclosure for EMI shielding near the SBC/SDR. If cost weren’t a constraint, we’d likely use a more robust link (and/or diversity antennas).

Because we used a **DJI Matrice 350 RTK**, we were able to power the payload via **DJI SkyPort + Extension**, simplifying wiring and power budgeting.

---

## Signal processing (DSP): “find pings in the air”

![Lizard with radio tag](/assets/images/projects/radio-telemetry-tracker/lizard-tagged.jpg)

Most wildlife tags in this domain are simple OOK-style beacons (on-off keyed carriers), so the core DSP problem is:

> Given a noisy wideband signal, detect short bursts at known (or partially known) carrier frequencies, robustly and fast.

![SDR IQ Waterfall](/assets/images/projects/radio-telemetry-tracker/sdr-waterfall.jpg)

The system samples IQ data from the SDR, then runs a ping detector tuned to:

- expected pulse width (ms)
- SNR threshold
- frequency list (or swept band)
- gain + sampling rate + center frequency

### High-level detector concept

A typical approach looks like:

1. **Channelize / band-limit** around target frequencies  
2. **Compute energy envelope** over short windows  
3. **Threshold + duration filtering** to decide “ping” vs noise  
4. Emit `(timestamp, frequency, amplitude)` events

Even when the DSP is “naive,” real-time wideband processing is still compute-heavy, which is why the x86 SBC helped.

### Interesting (but still high-level) localization math

A pragmatic first-pass localization uses a path-loss-ish model:

$$
P_r(d) = K - 10n\log_{10}(d)
$$

Where:

- $P_r$ is received power (or a proxy, like amplitude)
- $d$ is distance from transmitter to receiver
- $K$ is an effective intercept term (tx power + gains)
- $n$ is the path loss exponent (environment-dependent)

Then we solve for the best transmitter position by minimizing residuals over many ping observations:

$$
\min_{\mathbf{x},K,n}\sum_i \left(P_{r,i}-\left[K-10n\log_{10}(\|\mathbf{x}-\mathbf{x}_i\|)\right]\right)^2
$$

In practice, we keep this bounded and incremental so it behaves in the field.

Here’s the core idea as implemented in the DSP library’s `LocationEstimator` (least-squares residuals on distance-to-power):

```python
# rct_dsp2/localization.py (excerpt)
def __residuals(self, params: np.ndarray, data: np.ndarray) -> np.ndarray:
    estimated_transmitter_x = params[0]
    estimated_transmitter_y = params[1]
    estimated_transmitter_location = np.array([estimated_transmitter_x, estimated_transmitter_y, 0])

    estimated_transmitter_power = params[2]
    estimated_model_order = params[3]  # ~ n

    received_power = data[:, 3]
    received_locations = data[:, 0:3]

    distances = np.linalg.norm(received_locations - estimated_transmitter_location, axis=1)
    return received_power - (estimated_transmitter_power - 10 * estimated_model_order * np.log10(distances))
  ```

---

## Field Device Software (FDS): robust “headless” deployment

The payload computer runs unattended during flights. That meant:

- **autostart on boot**
- **no keyboard/monitor assumptions**
- **safe logging + crash evidence**
- **simple “operator mental model”**

We configured Ubuntu to auto-login and launch RTT software on startup. We considered more elaborate physical UX (e.g., a 7-segment error display), but ultimately we prioritized:

- a simple “healthy/unhealthy” indicator concept
- detailed logs written to local storage (or USB) for post-flight debugging

### GPS ingestion with safety checks 

GPS dropouts and corrupted readings happen. The FDS includes validation and safety logic to reject nonsense jumps.

Example: position/altitude jump checks and quality thresholds:

```python
# radio_telemetry_tracker_drone_fds/gps/gps_module.py (excerpt)
MAX_POSITION_JUMP = 1000  # meters
MAX_ALTITUDE_JUMP = 100   # meters per second

def _validate_data_safety(self, gps_data: GPSData) -> bool:
    if not gps_data.validate():
        return False
    if not gps_data.check_quality():
        return False

    # reject sudden teleports
    if self._last_valid_position is not None and gps_data.latitude and gps_data.longitude:
        distance = self._calculate_distance(self._last_valid_position[0], self._last_valid_position[1],
                                            gps_data.latitude, gps_data.longitude)
        if distance > self.MAX_POSITION_JUMP:
            return False

    # reject impossible climb rates
    if self._last_valid_altitude is not None and gps_data.altitude is not None:
        altitude_rate = abs(gps_data.altitude - self._last_valid_altitude) / max(gps_data.timestamp - self._last_valid_time, 1e-3)
        if altitude_rate > self.MAX_ALTITUDE_JUMP:
            return False

    gps_data.is_valid = True
    return True
```

### Ping logging + replay

Ping detections and estimates are logged to CSV with run identifiers and timestamps. This makes it easier to:

- reproduce bugs
- compare parameter changes
- re-run localization offline

---

## Drone ↔ Ground communications: reliability first

We designed comms around two realities:

1. **A command being received is not the same as the action being executed.**
2. **Field links drop packets. A lot.**

So we used both:

- **Implicit acknowledgments** at the transport layer (packet delivery)
- **Explicit acknowledgments** at the application layer (operation completed)

Example: start sequence

1. GCS → FDS: `StartRequest`
2. Transport ensures delivery (retries/ACK)
3. FDS begins processing and replies with `StartResponse(success=true)`
4. GCS UI transitions state only after explicit response

### Packet framing + CRC + Protobuf

To keep messages compact and structured, packets are Protobuf messages wrapped in a simple binary frame:

- sync marker
- big-endian length
- protobuf payload
- CRC-CCITT

```python
# radio_telemetry_tracker_drone_comms_package/codec.py (excerpt)
SYNC_MARKER = b"\xAA\x55"
LENGTH_FIELD_SIZE = 4
CHECKSUM_SIZE = 2

class RadioCodec:
    @staticmethod
    def encode_packet(packet: RadioPacket) -> bytes:
        message_data = packet.SerializeToString()
        header = SYNC_MARKER + len(message_data).to_bytes(LENGTH_FIELD_SIZE, "big")
        data_without_checksum = header + message_data

        checksum_val = _calculate_crc16_ccitt(data_without_checksum)
        return data_without_checksum + checksum_val.to_bytes(CHECKSUM_SIZE, "big")
```

### Retries + outstanding ACK tracking

The transport layer maintains a queue and retries packets that require ACKs:

```python
# radio_telemetry_tracker_drone_comms_package/transceiver.py (excerpt)
def _retry_outstanding_packets(self) -> None:
    now = time.time()
    to_remove = []
    for pid, info in self.outstanding_acks.items():
        if (now - info["send_time"]) >= self.ack_timeout:
            if info["retries"] < self.max_retries:
                info["retries"] += 1
                info["send_time"] = now
                self.radio_interface.send_packet(info["packet"])
            else:
                to_remove.append(pid)

    for pid in to_remove:
        del self.outstanding_acks[pid]
        if self.on_ack_timeout:
            self.on_ack_timeout(pid)
```

---

## Ground Control Station (GCS): offline maps + real-time telemetry

![GCS UI screenshot](/assets/images/projects/radio-telemetry-tracker/gcs-ui.png)

The GCS needed to:

- work **without internet** in the field
- display a **map** + moving drone track
- show **ping detections** and **location estimates**
- keep install friction low

We experimented with ArcGIS/QGIS, but packaging and runtime weight were a pain. We ultimately built:

- **PyQt6** desktop shell
- **QWebEngine** embedding a **Leaflet.js** frontend
- a local tile cache so maps can run offline

### Offline tile caching (DB-first, then network)

The tile service checks a local SQLite cache first; if offline mode is enabled, it never fetches from the network.

```python
# radio_telemetry_tracker_drone_gcs/services/tile_service.py (excerpt)
def get_tile(self, z: int, x: int, y: int, source_id: str, *, offline: bool) -> bytes | None:
    tile_data = get_tile_db(z, x, y, source_id)
    if tile_data is not None:
        return tile_data

    if offline:
        return None

    tile_data = self._fetch_tile(z, x, y, source_id)
    if tile_data:
        store_tile_db(z, x, y, source_id, tile_data)
    return tile_data
```

---

## Results

In field deployments, the system reduced **multi-hour manual tracking sessions** (e.g., ~4 hours) into a **single short drone flight** (e.g., ~20 minutes), while producing location estimates on the order of **~1 m** in favorable conditions.

The system was used successfully in multiple field trials with the San Diego Zoo Wildlife Alliance, tracking small reptiles and mammals in difficult terrain.

---

## Future direction: tower-based tracking + TDOA

As of late 2025, there is a non-trivial risk that regulatory and procurement constraints could restrict certain drone platforms in the U.S. Rather than betting everything on drone payloads, we explored a **tower-based** approach:

- solar-powered nodes
- long-duration monitoring (no battery-limited flights)
- mesh networking for data relay

A key technical bottleneck is localization. RSSI-based approaches struggle because each tower’s true gain/antenna placement/environment differ. A more robust direction is **time difference of arrival (TDOA)**, but with OOK beacons and RF propagation at ~speed of light, timing synchronization and multipath make this a hard problem.

---

### Repositories

- Docs: https://github.com/UCSD-E4E/radio-telemetry-tracker-docs
- Drone casing CAD: https://github.com/UCSD-E4E/radio-telemetry-tracker-drone-casing-cad
- Drone comms package: https://github.com/UCSD-E4E/radio-telemetry-tracker-drone-comms-package
- Drone FDS: https://github.com/UCSD-E4E/radio-telemetry-tracker-drone-fds
- Drone GCS: https://github.com/UCSD-E4E/radio-telemetry-tracker-drone-gcs
- Tower comms package: https://github.com/UCSD-E4E/radio-telemetry-tracker-tower-comms-package
- Tower solar tools: https://github.com/UCSD-E4E/radio-telemetry-tracker-tower-solar-tools
- DSP library (PingFinder + localization): https://github.com/UCSD-E4E/radio_collar_tracker_dsp2