---
title: "NLP from Scratch"
summary: "A tokenizer and a transformer written by hand, then beam search and retrieval on pretrained models, for CSE 256."
date: 2026-03-13
cv: project/nlp
category: class
role: "My programming assignments for CSE 256 (Statistical Natural Language Processing)"
---

These were the three programming assignments in CSE 256 (Statistical Natural Language Processing) in Winter 2026. Each one had me build a piece of a modern language model by hand before reaching for the library version.

## Sentiment from averaged embeddings

The first assignment classified movie reviews as positive or negative. I started with a bag-of-words baseline (`CountVectorizer` into a two- or three-layer feedforward network in PyTorch), then built a deep averaging network (DAN): average the word embeddings of a review and pass the average through an MLP. I compared embeddings initialized from GloVe with random ones.

```python
class DAN(nn.Module):
    def forward(self, x, lengths):
        embedded = self.embedding(x)
        # Average over non-padded tokens
        mask = (x != 0).unsqueeze(-1).float()
        averaged = (embedded * mask).sum(dim=1) / lengths.unsqueeze(-1)
        return self.log_softmax(self.network(averaged))
```

I also wrote byte pair encoding from scratch, following [Sennrich et al. (2016)](https://arxiv.org/abs/1508.07909): start from characters, merge the most frequent adjacent pair, and repeat. I tried it at several vocabulary sizes.

## A transformer by hand

The second assignment was a transformer with no `nn.Transformer`. I wrote multi-head self-attention with scaled dot products, causal masking and attention dropout, then used it two ways:

- an encoder, with pre-norm blocks, that classifies which of three presidents (Obama and the two Bushes) gave a speech
- a decoder that models text one character at a time and writes continuations

Then I tried two variants. [ALiBi](https://arxiv.org/abs/2108.12409) drops positional embeddings and instead subtracts a penalty from each attention score that grows with the distance between tokens. Local window attention lets each token attend only to the tokens near it.

```python
class MultiHeadAttention(nn.Module):
    def forward(self, x):
        q = self.query(x).view(B, T, n_head, head_dim).transpose(1, 2)
        k = self.key(x).view(B, T, n_head, head_dim).transpose(1, 2)
        v = self.value(x).view(B, T, n_head, head_dim).transpose(1, 2)

        attn = (q @ k.transpose(-2, -1)) / math.sqrt(head_dim)
        if self.use_alibi:
            attn = attn + build_alibi_bias(n_head, T, device)
        if self.causal:
            attn = attn.masked_fill(self.mask[:, :, :T, :T] == 0, float("-inf"))
        return self.out_proj(F.softmax(attn, -1) @ v)
```

## Decoding and retrieval

The third assignment moved to pretrained models. I wrote beam search for GPT-2 on [Hugging Face Transformers](https://huggingface.co/docs/transformers) and tried score processors such as a repetition penalty and length normalization.

Then I built the retriever for a retrieval-augmented generation pipeline in LangChain. Meeting transcripts from [QMSum](https://github.com/Yale-LILY/QMSum) go into a FAISS index as sentence-transformer embeddings, and a question about a meeting pulls back the passages that answer it.
