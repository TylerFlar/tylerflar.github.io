---
title: Software Project for Computer Architecture 
code: CSE 142L
date: 2023-06-25  
term:  Summer 2023  
level: undergraduate  
---

Lab-based companion to CSE 142 focused on *measuring* and *optimizing* real code using hardware performance counters, microbenchmarks, and parallel implementations.   All labs were done in C/C++ via Jupyter on UCSD’s DSMLP and dedicated bare-metal servers
using `perfstats`, `make`, `cse142 job run`, and Gradescope autograding.

---

## Project 1 – Performance Microbenchmarks & the Performance Equation

**Goal:** Understand and apply the performance equation  
$$\text{ET} = \text{IC} \times \text{CPI} \times \text{CT}$$
by designing and running controlled microbenchmarks.

### What I did
- Implemented and analyzed several “baseline” kernels in `microbench.cpp`:
  - `baseline_int`, `baseline_double`, `baseline_float`, `baseline_char`
  - Optimized variants such as `baseline_int_O4` using `__attribute__((optimize(4)))`.
- Used `microbench.exe` + `perfstats` to collect:
  - Dynamic instruction count (IC)
  - Cycles, CPI, ET, and effective MHz
- Systematically varied:
  - **Repetitions** (`-r`) to scale instruction count
  - **Array sizes** (`--size`) over multiple orders of magnitude
  - **Clock frequency** (`-M`) to test CT vs ET relationships
- Computed speedups by hand (using CSV exports) and compared them with predictions from
  the performance equation and Amdahl’s Law.

### Representative kernel

```cpp
for (unsigned j = 0; j < 3; ++j) {
    for (unsigned i = 1; i < size; ++i) {
        array[i] += i / (1 + j) + array[i - 1];
    }
}
```

This simple loop was used with different data types and optimization levels to see how IC and CPI change even when the algorithm stays the same.

---

## Project 2 – Branch Prediction, Cache Behavior & Threshold Counting
Goal: Explore how data layout and sorting affect branch prediction and cache behavior.

What I did

Implemented a threshold-counting kernel:

```cpp
long long calculate_sum(int* data, unsigned size, int threshold) {
    long long sum = 0;
    for (unsigned i = 0; i < size; ++i) {
        if (data[i] >= threshold) {
            sum++;
        }
    }
    return sum;
}
```

- In `array_sort.cpp`:
  - Generated large random integer arrays.
  - Optionally sorted the array with `std::sort` depending on a command-line flag.
  - Called `calculate_sum` repeatedly and instrumented the run with `perfstats`.

### Measurements & analysis
- Collected:
  - IC, cycles, CPI, ET
  - L1 data-cache accesses and misses
  - Branches and branch misses
- Compared:
  - **Unsorted data** (unpredictable branches, “random” thresholds)
  - **Sorted data** (more predictable branch behavior and potential prefetch benefits)
- Analyzed how:
  - Sorting improves branch prediction and sometimes cache locality—but adds its own cost.
  - The “best” configuration depends on array size, number of iterations, and tolerance for preprocessing time vs. query time.

---

## Project 3 – Memory Hierarchy: TLBs & Pointer-Chasing Miss Machines

**Goal**: Stress and characterize TLB behavior and memory-level parallelism using synthetic pointer-chasing workloads.

### TLB microbenchmarks

- Built a templated memory layout:
```cpp
template <size_t BYTES>
struct Node {
    Node* next;
    uint64_t payload[BYTES / 8 - 1];  // force full cache line / page footprint
};
```
- Allocated large aligned arrays of these nodes using `posix_memalign` and disabled huge pages with `madvise(..., MADV_NOHUGEPAGE)`.
- Randomized the `next` pointers to create a single large cycle of nodes, then walked it:
```cpp
template <class Node>
Node* traverse(Node* start, uint64_t count) {
    for (uint64_t i = 0; i < count; ++i) {
        start = start->next;
    }
    return start; // return to keep the compiler from optimizing away the loop
}
```
### MissMachine & memory-level parallelism
- Used MissMachine to create multiple independent pointer-chasing “machines”:

```cpp
// Pseudocode: follow N independent pointer chains per iteration
for (unsigned i = 0; i < iterations; ++i) {
    a = a->next;
    b = b->next;
    c = c->next;
    // ...
}
```

- Parameterized:
  - Number of independent chains (1, 2, …, 13)
  - Total number of pointer traversals
  - Stride and alignment of underlying memory
- Measured how increasing the number of independent chains increases memory-level parallelism (MLP) and reduces ET despite similar IC.

---

## Project 4 – Loop Tiling & Convolution Optimization

**Goal**: Optimize a 1D convolution kernel using loop tiling, loop splitting, and unrolling, and then measure the impact on IC, CPI, and ET.

### Baseline implementation
```cpp
void do_convolution(const tensor_t<uint32_t>& src,
                    const tensor_t<uint32_t>& kernel,
                    tensor_t<uint32_t>& dst) {
    for (int i = 0; i < dst.size.x; ++i) {
        for (int j = 0; j < kernel.size.x; ++j) {
            dst(i) += src(i + j) * kernel(j);
        }
    }
}
```

### Optimizations implemented

- **Loop splitting & manual tiling**:
  - Introduced an outer loop over jj stepping by tile_size, then processed inner tiles.
- **Tiled version (out-of-order loop)**:
```cpp
for (int jj = 0; jj < kernel.size.x; jj += tile_size) {
    for (int i = 0; i < dst.size.x; ++i) {
        for (int j = jj; j < kernel.size.x && j < jj + tile_size; ++j) {
            dst(i) += src(i + j) * kernel(j);
        }
    }
}
```

- **Further variants**:
  - Fixed tile sizes (`convolution_tiled_fixed_tile`)
  - Unrolling via `__attribute__((optimize("unroll-loops")))`
  - Edge-handling split loops (`convolution_tiled_split`)

### Measurement & analysis
- Used the existing benchmarking harness to:
  - Sweep over different tile_size values.
  - Compare naïve vs. tiled vs. tiled+unrolled implementations.
- Tracked:
  - Changes in IC (extra loop overhead vs. better locality),
  - CPI (better cache behavior vs. more complex control),
  - Overall ET and speedup over baseline

---

## Project 5 – Parallel Histograms, OpenMP & Hyperthreading

**Goal**: Explore different ways to parallelize a shared histogram and study ILP/MLP and hyperthreading effects.

### Histogram variants

All variants build a 256-bin histogram over 64-bit values by counting every byte:

```cpp
for (uint64_t i = 0; i < size; ++i) {
    for (int k = 0; k < 64; k += 8) {
        uint8_t b = (data[i] >> k) & 0xff;
        // different implementations update histogram[b] in different ways
    }
}
```

I implemented and measured:

1. Single-threaded baseline (run_unthreaded_histogram)
2. Coarse-grain lock (one global std::mutex)
3. Fine-grain locks (one std::mutex per bucket)
4. Private per-thread histograms (merge at the end)
5. OpenMP with #pragma omp critical
6. OpenMP with chunked private histograms (local reduction, then global merge)

Example of the OpenMP + private-histogram variant:

```cpp
#pragma omp parallel for
for (uint64_t chunk = 0; chunk < size; chunk += block) {
    uint64_t local_hist[256] = {0};
    for (uint64_t i = chunk; i < size && i < chunk + block; ++i) {
        for (int k = 0; k < 64; k += 8) {
            uint8_t b = (data[i] >> k) & 0xff;
            local_hist[b]++;
        }
    }
    #pragma omp critical
    for (int b = 0; b < 256; ++b) {
        histogram[b] += local_hist[b];
    }
}
```

### ILP/MLP & hyperthreading

- In `hyperthread.cpp`, compared:
  - **High ILP** vs. **low ILP** integer compute kernels (different numbers of independent accumulators).
  - **High MLP** vs. **low MLP** pointer-chasing workloads (via `MissMachine` with different numbers of concurrent chains).
- Measured the effect of enabling more threads (including hyperthreads) on:
  - CPI, ET, and throughput.
  - How well the additional hardware contexts hide latency vs. causing more contention.

### Matrix exponent “canary”
- Implemented `_canary` in `matexp_main.cpp` as a heavy OpenMP histogram over a very
large array (hundreds of millions of elements) to:
  - Sanity-check measurement infrastructure under a realistic long-running workload.
  - Exercise memory bandwidth and parallel reduction patterns.