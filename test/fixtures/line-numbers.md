# Line Numbers

Code blocks with `lineNumbers: true` display numbered lines via CSS counters.

```typescript
function greet(name: string): string {
  return `Hello, ${name}!`;
}

const message = greet("world");
console.log(message);
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

Plain fenced blocks also get line numbers:

```
line one
line two
line three
```
