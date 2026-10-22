---
title: "Parallel Computing"
summary: "Making matrix multiply fast on one CPU core and on a GPU, then spreading a wave simulation across hundreds of cores."
image: /assets/images/projects/parallel-computing/dgemm-results.png
date: 2025-12-12
cv: project/parallel-computing
category: software
role: "Class projects for CSE 260, UC San Diego's graduate parallel computing course"
---

These were the three projects in CSE 260 (Parallel Computation). Each one started from a slow, correct program and made it fast on a different kind of hardware: one CPU core, one GPU, and a cluster.

## Matrix multiply on one Graviton3 core

We started from a naive double-precision matrix multiply and had to make it fast on a single core of an AWS Graviton3 (c7g.medium), close to [OpenBLAS](https://github.com/OpenMathLib/OpenBLAS) or better, without changing the basic $O(n^3)$ algorithm.

The trick is to never multiply whole matrices at once. You split them into tiles sized for each level of the memory hierarchy:

![Packing A and B into panels for the microkernel](/assets/images/projects/parallel-computing/dgemm-packing.png)

We wrote packing routines that copy tiles of A and B into contiguous panels, so the innermost kernel reads memory in order instead of striding across it. On those panels, a fixed-size microkernel written with Arm SVE computes one small tile of C at a time, with unrolled loops and fused multiply-adds:

```cpp
// Macrokernel (simplified)
for (int ic = 0; ic < m; ic += Mc)
  for (int pc = 0; pc < k; pc += Kc) {
    pack_A(A + ic*k + pc, ...);        // Ap: Mc x Kc
    for (int jc = 0; jc < n; jc += Nc) {
      pack_B(B + pc*n + jc, ...);      // Bj: Kc x Nc
      // Walk tiles of size Mr x Nr
      for (int ir = 0; ir < Mc; ir += Mr)
        for (int jr = 0; jr < Nc; jr += Nr)
          microkernel_sve(...);
    }
  }
```

At the sizes we tested, the tuned kernel came out slightly ahead of OpenBLAS:

![DGEMM performance against OpenBLAS](/assets/images/projects/parallel-computing/dgemm-results.png)

## Matrix multiply on a T4 GPU

The second project did the same on an NVIDIA T4 (AWS g4dn.xlarge) in single precision, starting from a textbook CUDA kernel that spends nearly all its time waiting on global memory. The target was the same ballpark as [cuBLAS](https://developer.nvidia.com/cublas).

The tiling happens at three levels. Each thread block owns a large tile of C and stages the matching tiles of A and B through shared memory. Inside that, each thread keeps a small tile of C in registers and updates it with outer products:

```cpp
// One block computes a BM x BN tile of C
__global__ void mmpy_kernel(float* A, float* B, float* C, int N) {
  int blockRow = blockIdx.y;
  int blockCol = blockIdx.x;

  // Each thread keeps a TM x TN micro-tile in registers
  float acc[TM][TN] = {0};

  for (int bk = 0; bk < N; bk += BK) {
    // The block loads tiles of A and B into shared memory together
    load_Asub_to_smem(A, blockRow, bk, ...);   // BM x BK
    load_Bsub_to_smem(B, bk, blockCol, ...);   // BK x BN
    __syncthreads();

    #pragma unroll
    for (int k = 0; k < BK; ++k) {
      float a_vals[TM] = load_A_row_fragment_from_smem(...);
      float b_vals[TN] = load_B_col_fragment_from_smem(...);
      fma_outer_product(acc, a_vals, b_vals);  // TM x TN outer product
    }
    __syncthreads();
  }

  store_C_microtile(C, blockRow, blockCol, acc, ...);
}
```

On top of that we lined the data up with warps, gave each thread several outputs to keep the pipelines busy, double-buffered shared memory, and autotuned the tile sizes. The best setup used 512 threads per block and reached about 4.8 TFLOP/s on large matrices (N = 2048), in the same class as cuBLAS on that card.

## A wave simulation across a cluster

The third project took a 2D wave simulator (a 5-point stencil with absorbing boundaries) and made it run on many cores of [SDSC Expanse](https://www.sdsc.edu/systems/expanse/index.html) with MPI.

The grid is split into a 2D grid of MPI ranks, and each rank owns a rectangle plus a one-cell halo around it. Every time step, each rank:

1. swaps halo cells with its four neighbors, using nonblocking `MPI_Isend` and `MPI_Irecv`
2. applies the stencil to its interior, working on flat arrays so the loop vectorizes
3. applies the absorbing boundary if it sits on the edge of the global grid
4. now and then joins an `MPI_Reduce` so rank 0 can print the global maximum and energy

Once the MPI version matched the single-process reference, we ran scaling studies on Expanse. With a near-square grid of ranks it scaled cleanly from one core to the hundreds the assignment asked for, and halo exchange stayed a small share of the run time.
