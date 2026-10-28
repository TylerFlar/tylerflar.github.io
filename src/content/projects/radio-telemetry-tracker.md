---
title: "Radio Telemetry Tracker"
summary: "Finding radio-tagged wildlife from a drone instead of on foot, for the San Diego Zoo Wildlife Alliance."
image: /assets/images/projects/radio-telemetry-tracker/cover.png
date: 2025-10-13
cv: role/e4e/rtt
category: research
role: "Led the project at Engineers for Exploration, and built its field software, radio link and ground station"
links:
    - { label: Field software, href: "https://github.com/UCSD-E4E/radio-telemetry-tracker-drone-fds" }
    - { label: Ground station, href: "https://github.com/UCSD-E4E/radio-telemetry-tracker-drone-gcs" }
---

Radio Telemetry Tracker (RTT) is a long-running [Engineers for Exploration](https://e4e.ucsd.edu/) project that helps field researchers, mainly at the [San Diego Zoo Wildlife Alliance](https://sandiegozoowildlifealliance.org/), find small animals that carry radio tags.

The usual way is to walk transects with a directional antenna and a handheld receiver, listen for the tag's beeps, and triangulate by hand. It works, but it's slow and tiring, and it gets worse with every extra animal you're tracking.

![Tracking with a handheld receiver](/assets/images/projects/radio-telemetry-tracker/terrestrial-tracking.png)

RTT puts the antenna and a software-defined radio (SDR) on a drone. The drone flies a search pattern, software on board picks out the tag pings and estimates where each animal is, and the results stream to a ground station.

> I led RTT for a little over a year, after reviving it from a dormant state. This page covers the whole system. The parts I built are the new payload hardware, the field-device software, the drone-to-ground link and the ground station. The DSP library, the drone casing and the tower power work were other students' and staff's, and I say so where they come up.

## How the system fits together

1. Plan a flight (a pre-programmed search pattern).
2. Record the radio band (SDR, directional antenna, low-noise amplifier).
3. Detect pings (signal processing).
4. Match each ping to the GPS position at that moment.
5. Update each tag's location estimate as pings come in.
6. Show and log everything in a ground station that works offline.

![RTT system diagram](/assets/images/projects/radio-telemetry-tracker/system-diagram.png)

On the drone, the field-device software reads GPS and heading, runs the ping detector on the SDR stream, matches each ping to the nearest GPS sample, and keeps both the raw pings (for replay) and a running location estimate per tag frequency. On the ground, the station sets scan parameters (gain, sample rate, target frequencies), starts and stops missions, and shows the drone's track, pings and estimates on an offline map.

## The hardware refresh

When I took over, the old build used outdated parts. I wanted something easy to assemble in the field, with enough compute for real-time signal processing, reliable logging, and parts that could be swapped out.

![Drone payload sketch](/assets/images/projects/radio-telemetry-tracker/payload-sketch.png)

- **Computer:** [UP 7000](https://up-board.org/up-7000/) (Intel N100, 8 GB RAM, 64 GB eMMC). I picked x86 because signal-processing tools are better supported there than on ARM, and the board still fits Raspberry Pi mounts.
- **GPS and compass:** [SparkFun NEO-M9N breakout](https://www.sparkfun.com/sparkfun-gps-breakout-neo-m9n-u-fl-qwiic.html), accurate and easy to integrate.
- **SDR:** [USRP B200mini-i](https://www.ettus.com/all-products/usrp-b200mini-i-2/). Expensive, but it performs well, has flexible gain control, and leaves room for FPGA acceleration later.
- **Amplifier:** [Nooelec LaNA](https://www.nooelec.com/store/lana-hf.html), to boost weak tag signals.
- **Telemetry radio:** [SiK V3](https://holybro.com/products/sik-telemetry-radio-v3). Looking back, not the best pick: it needed an aluminum enclosure to shield it from the computer and the SDR. With more budget I'd use a stronger link, or antennas for diversity.

The drone was a DJI Matrice 350 RTK, so the payload could draw power through DJI's SkyPort, which kept the wiring and the power budget simple.

## Signal processing (not my part)

![A radio-tagged lizard](/assets/images/projects/radio-telemetry-tracker/lizard-tagged.jpg)

Most wildlife tags are simple on-off beacons. So the problem is finding short bursts at known frequencies in a noisy wideband signal, quickly, and then turning many (position, signal strength) readings into a location with a path-loss model and a least-squares fit.

![SDR waterfall](/assets/images/projects/radio-telemetry-tracker/sdr-waterfall.jpg)

The ping detector and the localizer live in the lab's DSP library ([radio_collar_tracker_dsp2](https://github.com/UCSD-E4E/radio_collar_tracker_dsp2)), written and maintained by E4E staff. My field-device software configures and runs it: pulse width, SNR threshold, target frequencies, gain, sample rate and center frequency. Everything from here down is mine.

## Field-device software

The payload computer runs unattended during a flight, with no keyboard or monitor. So it starts on boot, writes detailed logs to local storage for debugging after the flight, and keeps the operator's view simple: healthy or not. We talked about a small error display, but logs plus a simple status won out.

GPS fixes drop out and sometimes come back garbled, so the software rejects any fix that jumps too far or climbs too fast:

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

Pings and estimates go to CSV files with run IDs and timestamps, which makes it easy to reproduce bugs, compare settings and rerun localization offline. The repo runs ruff and pytest in GitHub Actions.

## The drone-to-ground link

Two facts shaped the protocol. A command arriving isn't the same as the command being carried out. And field radio links drop a lot of packets.

So there are two kinds of acknowledgment. The transport layer confirms a packet arrived, and the application confirms the action finished. To start a mission, the ground station sends a `StartRequest`, the transport retries until it's delivered, and the station only changes state when the drone answers with `StartResponse(success=true)`.

Packets are Protobuf messages inside a small binary frame: a sync marker, a big-endian length, the payload, and a CRC-CCITT checksum.

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

The transport keeps a queue of packets waiting for an ack and resends them on a timeout, up to a retry limit. The package also has serial and simulated-TCP radio interfaces, so the whole stack runs with no hardware attached.

## Ground station

![Ground station UI](/assets/images/projects/radio-telemetry-tracker/gcs-ui.png)

The ground station had to work with no internet, show a map with the drone's track, pings and estimates, and be easy to install. ArcGIS and QGIS were too heavy to package and ship, so I built a PyQt6 desktop app around a React and Leaflet map. Map tiles are cached in SQLite, and in offline mode it never touches the network. A release workflow builds installable wheels for each OS.

## Results

In field trials with the San Diego Zoo Wildlife Alliance, a tracking session that took about 4 hours on foot became a single 20-minute flight, with location estimates around 1 m in good conditions. It tracked small reptiles and mammals across rough terrain in several trials.

## Next: towers and TDOA

By late 2025 there was a real risk that rules and procurement would restrict some drone platforms in the U.S. So we started looking at towers: solar-powered nodes that monitor for long periods with no battery-limited flights and relay data over a mesh network.

The hard part is localization. Signal strength works poorly across towers, because each tower's antenna, placement and surroundings differ. Time difference of arrival (TDOA) is more promising, but with simple on-off beacons and signals moving at the speed of light, timing sync and multipath make it a hard problem.

My part of that was scoping it: the tower comms package, the WES 207 and CSE 145/237D course-project proposals, and the parts list for a TDOA dataset. The tower hardware and the solar work were other students'.

## Code

Mine:

- [radio-telemetry-tracker-drone-fds](https://github.com/UCSD-E4E/radio-telemetry-tracker-drone-fds): the drone field software
- [radio-telemetry-tracker-drone-gcs](https://github.com/UCSD-E4E/radio-telemetry-tracker-drone-gcs): the ground station
- [radio-telemetry-tracker-drone-comms-package](https://github.com/UCSD-E4E/radio-telemetry-tracker-drone-comms-package): the drone-to-ground link
- [radio-telemetry-tracker-tower-comms-package](https://github.com/UCSD-E4E/radio-telemetry-tracker-tower-comms-package): the tower comms package
- [radio-telemetry-tracker-docs](https://github.com/UCSD-E4E/radio-telemetry-tracker-docs): proposals, meeting minutes and hardware specs

The rest of the team's:

- [radio_collar_tracker_dsp2](https://github.com/UCSD-E4E/radio_collar_tracker_dsp2): the DSP library (ping finder and localization)
- [radio-telemetry-tracker-drone-casing-cad](https://github.com/UCSD-E4E/radio-telemetry-tracker-drone-casing-cad): the drone casing CAD
- [radio-telemetry-tracker-tower-solar-tools](https://github.com/UCSD-E4E/radio-telemetry-tracker-tower-solar-tools): the tower solar tools
