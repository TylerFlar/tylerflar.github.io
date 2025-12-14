---
title: Digital Systems Laboratory
code: CSE 140L
date: 2023-06-23  
term:  Summer 2023  
level: undergraduate  
---

This is the hardware lab companion to CSE 140. Instead of just doing logic on paper, I actually built and simulated digital systems in SystemVerilog, starting from small combinational blocks up to a microcoded multiplier and a simple stream-cipher–style encryptor/decryptor.

---

## Project 1 – Microcoded Signed Multiplier (Robertson’s Algorithm)

I implemented a signed Robertson’s multiplier as a microcoded datapath + control-unit system in SystemVerilog.

**What I did**

- Designed reusable combinational and sequential modules:
  - Parameterized adder/subtractor, multiplexers, counters, and registers
  - Arithmetic/logical right-shift register for sign-preserving shifts
- Built a **datapath** that:
  - Holds the multiplicand, multiplier, partial product, and iteration count
  - Uses shifting and conditional add/sub operations to implement Robertson’s algorithm
- Implemented a microcoded control unit:
  - Micro-PC (`upcreg`) that sequences through microinstructions
  - A ROM containing control words that drive the datapath
  - Condition-select mux that branches based on datapath flags (e.g., zq, zr, zy)
- Verified correctness with a self-checking testbench that:
  - Applies many signed operand pairs
  - Waits for a done signal and compares hardware output to the expected product

---

## Project 2 – Multi-Feature Digital Alarm Clock & Calendar

I built a structural **digital clock/alarm** system, then extended it to track weekday and calendar date, all driven by modular counters and displayed on 7-segment outputs.

### Part 1 – Basic HH:MM:SS Alarm Clock

**What I did**
- Created generalized **mod-N counters** (`ct_mod_N`) for seconds, minutes, and hours:
  - Seconds, minutes: mod 60
  - Hours: mod 24
- Used an `alarm` module to raise a `buzz` signal when current time matches the alarm time.
- Drove three 7-segment displays using a binary-to-7-segment converter (`lcd_int`).
- Wrote a testbench that:
  - Pulses a simulated clock, advances time, and logs display state as ASCII art.

### Part 2 – Weekday-Aware Alarm (No Weekend Buzz)

**What I did**

- Added a **day-of-week counter** (mod 7) driven when hours roll over from 23→0.
- Modified the alarm logic to **skip alarms on days 5 and 6** (Saturday & Sunday).
- Extended the structural diagram (`struct_diag`) to handle weekday selection and display.

### Part 3 – Full Calendar: Date & Month Handling

**What I did**

- Designed a **date counter** (`ct_mod_date`) that adjusts its modulus based on the month:
  - 31-day months, 30-day months, and February (28 days)
- Added a **month counter** (mod 12) that increments when the date wraps.
- Implemented logic to choose the appropriate modulus using a 2-bit encoding for month type.
- Extended display logic to show:
  - Day of week
  - Month (MM)
  - Date (DD)
  - Time (HH:MM:SS)
- Validated:
  - Month boundaries (e.g., 02-28 → 03-01, 04-30 → 05-01)
  - Correct weekday progression and weekend alarm suppression

---

## Project 3 – Traffic Light Controllers with Timed FSMs

I implemented sensor-driven traffic light controllers using parameterized finite state machines and timing counters.

### Part 1 – Three-Direction Intersection

**What I did**

- Used an enum type for light colors:
```systemverilog
package light_package;
  typedef enum logic [1:0] { red, yellow, green } colors;
endpackage
```
- Designed `traffic_light_controller1` to control:
  - East–West straight light
  - East–West left-turn arrow
  - North–South (combined movement)
- Implemented:
  - A state machine with phases like GRR, YRR, RGR, RRG, etc.
  - Two counters to enforce:
    - Minimum green time (5 cycles)
    - Maximum green time with conflicting requests (10 cycles)
- Wrote a detailed testbench that:
  - Stimulates sensors in various sequences
  - Checks that phases occur in the correct order and no unsafe overlap occurs

---

### Part 2 – Multi-Lane / Four-Way Controller (Stretch)

**What I did**

- Extended the controller to handle:
  - East left + East straight
  - West left + West straight
  - North–South movements
- Combined sensor signals into higher-level “demand” flags (e.g., s, e, w, l, n) for the FSM.
- Implemented a more complex state machine that:
  - Cycles through green/yellow phases for each direction and lane type
  - Avoids any conflicting greens across crossing paths
  - Enforces fairness and minimum green times
- Verified behavior with a larger testbench that:
  - Checks sequences where all sensors activate together
  - Tests intermittent traffic and idle periods
  - Asserts that impossible/unsafe combinations never occur
 
---

## Project 4 – LFSR-Based Message Encryption (Stream Cipher Style)

I implemented a **programmable message encryption** engine that uses a 6-bit LFSR as a key stream generator and XOR encryption.

**What I did**

- Built a parameterized **data memory** (`dat_mem`) used as both input and output storage.
- Implemented a 6-bit **LFSR** (`lfsr6`) with:
  - Programmable tap pattern (`taps`) stored in memory
  - Configurable initial state (`start`) also read from memory
- Designed a top-level controller (`top_level`) that:
  - Reads preamble length, tap pattern, and initial state from specific memory locations
  - Initializes the LFSR and then steps through the message bytes
  - XORs each plaintext byte with the LFSR state and writes ciphertext back to memory
  - Raises `done` when the full 64-byte block is processed
- Worked with a detailed testbench that:
  - Generates the expected ciphertext in SystemVerilog
  - Compares each DUT output byte against the reference value

---

## Project 5 – LFSR-Based Decryption & Parameter Recovery

I extended the LFSR work to implement hardware that can decrypt an encrypted stream and recover unknown parameters like tap pattern and preamble length.

**What I did**

- Reused the data memory as:
  - Input buffer for ciphertext (written by the testbench)
  - Output buffer for recovered plaintext
- Implemented multiple candidate LFSRs (lfsr6b) in parallel:
  - Each with a different tap pattern from a small allowed set
  - All initialized with a seed derived from the first ciphertext bytes
- Added match logic that:
  - Compares LFSR behavior against expected structure in the encrypted stream
  - Selects the correct tap pattern (`foundit`) once a match is detected
- Implemented preamble detection:
  - Identified leading underscore characters (`_`) in decrypted data
  - Used this to infer the actual message start and preamble length
- Wrote control logic in `top_level_5b` that:
  - Manages LFSR initialization and stepping
  - Conditionally writes decrypted bytes back to memory starting at the correct offset
  - Signals done when decryption completes
- Verified functionality with testbenches that:
  - First encrypt a message using a known pattern/seed
  - Then run the decryption top level and check if the original message is recovered