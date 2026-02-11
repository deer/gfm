# Code Block Structure

Fenced blocks with a language get a `.code-header` with the language label.

```typescript
interface Config {
  highlighter: "starry-night" | "lowlight" | "none";
  allowMath?: boolean;
}
```

```python
def fibonacci(n: int) -> list[int]:
    a, b = 0, 1
    result = []
    for _ in range(n):
        result.append(a)
        a, b = b, a + b
    return result
```

```bash
deno task gen:style
deno task ok
```

Fenced blocks without a language get a `.highlight` wrapper but no header:

```
Just plain text in a code fence.
No language specified.
```

Inline `code` is not wrapped.
