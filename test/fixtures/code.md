# Code Blocks Test

Inline `code` works.

```typescript
interface User {
  name: string;
  age: number;
}

function greet(user: User): string {
  return `Hello, ${user.name}!`;
}
```

```python
def factorial(n: int) -> int:
    if n <= 1:
        return 1
    return n * factorial(n - 1)
```

```bash
#!/bin/bash
echo "Hello, world!"
```
