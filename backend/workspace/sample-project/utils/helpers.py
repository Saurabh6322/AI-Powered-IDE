"""Utility helper functions for the sample project."""


def greet(name: str) -> str:
    """Return a friendly greeting."""
    return f"Hello, {name}! Welcome to the AI-Powered IDE."


def fibonacci(n: int) -> list[int]:
    """Return the first *n* Fibonacci numbers."""
    if n <= 0:
        return []
    sequence = [0, 1]
    while len(sequence) < n:
        sequence.append(sequence[-1] + sequence[-2])
    return sequence[:n]
